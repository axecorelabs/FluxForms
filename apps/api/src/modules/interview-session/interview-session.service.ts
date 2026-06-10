import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../llm/llm.service';
import { PromptBuilderService } from '../llm/prompt-builder.service';
import { InterviewService } from '../interview/interview.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ChatMessage } from '../llm/providers/openrouter.provider';
import {
  QUEUES,
  JOBS,
  ExtractionJobData,
  NotificationJobData,
  SerializedField,
} from '../../queue/queue.constants';

export interface SendMessageResult {
  aiReply: string;
  sessionId: string;
  turnCount: number;
  isComplete: boolean;
}

@Injectable()
export class InterviewSessionService {
  private readonly logger = new Logger(InterviewSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly interviewService: InterviewService,
    private readonly subscriptionService: SubscriptionService,
    @InjectQueue(QUEUES.EXTRACTION) private readonly extractionQueue: Queue<ExtractionJobData>,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationQueue: Queue<NotificationJobData>,
  ) {}

  async startSession(interviewId: string, userTelegramId: string): Promise<{ sessionId: string; openingMessage: string }> {
    const interview = await this.interviewService.findById(interviewId);

    if (interview.status !== 'ACTIVE') {
      throw new BadRequestException('This interview is not currently accepting responses');
    }

    // Enforce subscription limit before creating a new session
    const { allowed, remaining } = await this.subscriptionService.checkLimit(interview.creatorId);
    if (!allowed) {
      throw new BadRequestException(
        'This creator has reached their monthly response limit. Ask them to upgrade their plan.',
      );
    }
    this.logger.debug(`Subscription check passed — ${remaining} responses remaining for creator ${interview.creatorId}`);

    const existing = await this.prisma.interviewSession.findUnique({
      where: { interviewId_userTelegramId: { interviewId, userTelegramId } },
    });

    if (existing) {
      if (existing.state === 'ACTIVE') {
        return { sessionId: existing.id, openingMessage: interview.openingMessage ?? '' };
      }
      if (existing.state === 'COMPLETED') {
        throw new BadRequestException('You have already completed this interview');
      }
    }

    const session = await this.prisma.interviewSession.create({
      data: { interviewId, userTelegramId, state: 'ACTIVE', turnCount: 0 },
    });

    return { sessionId: session.id, openingMessage: interview.openingMessage ?? '' };
  }

  async sendMessage(sessionId: string, userMessage: string): Promise<SendMessageResult> {
    const session = await this.prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.state !== 'ACTIVE') throw new BadRequestException('This session is no longer active');

    const interview = await this.prisma.interview.findUnique({
      where: { id: session.interviewId },
      include: { schemaFields: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!interview) throw new NotFoundException('Interview not found');

    const messages = await this.prisma.interviewMessage.findMany({
      where: { sessionId },
      orderBy: { turnIndex: 'asc' },
    });

    const history: ChatMessage[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'USER' ? 'user' : ('assistant' as const),
      content: m.content,
    }));

    const newTurnIndex = messages.length;
    const systemPrompt = this.promptBuilder.buildConversationSystemPrompt(interview, session.turnCount);

    // CALL 1 (blocking): AI reply + model-declared completion signal — user waits for this
    const { text: aiReply, isComplete: modelSignalledComplete } =
      await this.llm.conductTurnStructured(systemPrompt, history, userMessage);

    const newTurnCount = session.turnCount + 1;
    // maxTurns is a hard safety cap; the model's own signal is the primary driver.
    const isComplete = newTurnCount >= interview.maxTurns || modelSignalledComplete;

    await this.prisma.$transaction([
      this.prisma.interviewMessage.create({
        data: { sessionId, role: 'USER', content: userMessage, turnIndex: newTurnIndex },
      }),
      this.prisma.interviewMessage.create({
        data: { sessionId, role: 'AI', content: aiReply, turnIndex: newTurnIndex + 1 },
      }),
      this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: {
          turnCount: newTurnCount,
          ...(isComplete ? { state: 'COMPLETED', completedAt: new Date() } : {}),
        },
      }),
    ]);

    // CALL 2 (queued, durable): entity extraction + pgvector write
    const serializedFields: SerializedField[] = interview.schemaFields.map(f => ({
      fieldName: f.fieldName,
      displayName: f.displayName,
      fieldType: f.fieldType,
      description: f.description,
      isRequired: f.isRequired,
      orderIndex: f.orderIndex,
    }));

    await this.extractionQueue.add(
      JOBS.EXTRACT_ENTITIES,
      {
        sessionId,
        interviewId: interview.id,
        schemaFields: serializedFields,
        fullHistory: [
          ...history,
          { role: 'user' as const, content: userMessage },
          { role: 'assistant' as const, content: aiReply },
        ],
        extractionSystemPrompt: this.promptBuilder.buildExtractionSystemPrompt(interview),
        isFinal: isComplete,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        // Keep failed jobs for inspection
        removeOnFail: { count: 100 },
        removeOnComplete: { count: 50 },
      },
    );

    if (isComplete) {
      await this.notificationQueue.add(
        JOBS.NOTIFY_INTERVIEW_DONE,
        {
          type: 'interview.completed',
          payload: {
            sessionId,
            interviewId: interview.id,
            creatorId: interview.creatorId,
            userTelegramId: session.userTelegramId,
            interviewTitle: interview.title,
          },
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
        },
      );
    }

    return { aiReply, sessionId, turnCount: newTurnCount, isComplete };
  }

  async getSessionWithProfile(sessionId: string, creatorId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { turnIndex: 'asc' } },
        extractedProfile: { orderBy: { fieldName: 'asc' } },
        interview: { include: { schemaFields: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.interview.creatorId !== creatorId) throw new ForbiddenException();
    return session;
  }

  async getSessionsForInterview(interviewId: string, creatorId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { creatorId: true },
    });
    if (!interview || interview.creatorId !== creatorId) {
      throw new NotFoundException('Interview not found');
    }

    return this.prisma.interviewSession.findMany({
      where: { interviewId },
      include: {
        extractedProfile: true,
        _count: { select: { messages: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async regenerateSummary(sessionId: string, creatorId: string): Promise<string> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { turnIndex: 'asc' } },
        extractedProfile: true,
        interview: { include: { schemaFields: { orderBy: { orderIndex: 'asc' } } } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (session.interview.creatorId !== creatorId) throw new ForbiddenException();

    const transcript = session.messages
      .map((m: { role: string; content: string }) =>
        `${m.role === 'USER' ? 'User' : 'AI'}: ${m.content}`,
      )
      .join('\n\n');

    const extractedFields = session.extractedProfile.map((e: { fieldName: string; value: unknown }) => ({
      fieldName: e.fieldName,
      displayName:
        session.interview.schemaFields.find((f: { fieldName: string }) => f.fieldName === e.fieldName)?.displayName ??
        e.fieldName,
      value: e.value,
    }));

    const summaryPrompt = this.promptBuilder.buildSummaryPrompt(
      session.interview,
      extractedFields,
      transcript,
    );

    const summary = await this.llm.generateSummary(summaryPrompt);

    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { summary },
    });

    return summary;
  }

  async rerunExtraction(sessionId: string, creatorId: string): Promise<{ status: string }> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { turnIndex: 'asc' } },
        interview: { include: { schemaFields: { orderBy: { orderIndex: 'asc' } } } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.interview.creatorId !== creatorId) throw new ForbiddenException();
    if (session.state !== 'COMPLETED') {
      throw new BadRequestException('Only completed sessions can be re-extracted');
    }

    const serializedFields: SerializedField[] = session.interview.schemaFields.map(f => ({
      fieldName: f.fieldName,
      displayName: f.displayName,
      fieldType: f.fieldType,
      description: f.description,
      isRequired: f.isRequired,
      orderIndex: f.orderIndex,
    }));

    const fullHistory = session.messages.map((m: { role: string; content: string }) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { extractionStatus: 'PENDING', extractionError: null },
    });

    await this.extractionQueue.add(
      JOBS.EXTRACT_ENTITIES,
      {
        sessionId,
        interviewId: session.interviewId,
        schemaFields: serializedFields,
        fullHistory,
        extractionSystemPrompt: this.promptBuilder.buildExtractionSystemPrompt(session.interview),
        isFinal: true,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnFail: { count: 100 },
        removeOnComplete: { count: 50 },
      },
    );

    return { status: 'PENDING' };
  }

  async interruptSession(sessionId: string, userTelegramId: string) {
    const session = await this.prisma.interviewSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userTelegramId !== userTelegramId) return;
    if (session.state !== 'ACTIVE') return;

    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { state: 'INTERRUPTED', interruptedAt: new Date() },
    });
  }
}
