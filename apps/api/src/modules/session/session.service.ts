import {
  Injectable,
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { validateAnswer, assertSessionTransition } from '@fluxforms/state-machine';
import { SessionSnapshot, AnswerMap } from '@fluxforms/shared-types';
import { QUEUES, NotificationJobData } from '../../queue/queue.constants';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue<NotificationJobData>,
  ) {}

  async startOrResume(shareToken: string, telegramId: string): Promise<SessionSnapshot> {
    const form = await this.prisma.form.findUnique({
      where: { shareToken },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!form) throw new NotFoundException('Form not found');
    if (form.status !== 'ACTIVE') {
      throw new BadRequestException('This form is not accepting responses.');
    }
    if (form.questions.length === 0) {
      throw new BadRequestException('This form has no questions.');
    }

    const { allowed } = await this.subscriptionService.checkLimit(form.creatorId);
    if (!allowed) {
      throw new BadRequestException('This form is not accepting responses at this time.');
    }

    const existing = await this.prisma.session.findUnique({
      where: { formId_userTelegramId: { formId: form.id, userTelegramId: telegramId } },
    });

    if (existing?.state === 'SUBMITTED') {
      throw new ConflictException('You have already submitted a response to this form.');
    }

    if (existing?.state === 'ACTIVE' || existing?.state === 'REVIEW') {
      return this.toSnapshot(existing);
    }

    const session = await this.prisma.session.create({
      data: { formId: form.id, userTelegramId: telegramId, state: 'ACTIVE', currentIndex: 0, answers: {} },
    });
    return this.toSnapshot(session);
  }

  async submitAnswer(
    sessionId: string,
    telegramId: string,
    rawValue: string,
  ): Promise<{ next: 'QUESTION' | 'REVIEW'; snapshot: SessionSnapshot }> {
    const session = await this.getAndGuard(sessionId, telegramId);
    if (session.state !== 'ACTIVE') throw new BadRequestException('Session is not in answering state.');

    const form = await this.prisma.form.findUnique({
      where: { id: session.formId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!form) throw new NotFoundException('Form not found');

    if (form.status !== 'ACTIVE') {
      await this.interruptSession(session.id);
      throw new GoneException('This form has been closed.');
    }

    const question = form.questions[session.currentIndex];
    if (!question) throw new BadRequestException('Invalid question index.');

    const validation = validateAnswer(
      question.type,
      rawValue,
      question.options ? (question.options as string[]) : undefined,
    );
    if (!validation.valid) throw new UnprocessableEntityException(validation.error);

    const newAnswers = { ...(session.answers as AnswerMap), [question.id]: rawValue };
    const nextIndex = session.currentIndex + 1;
    const isLast = nextIndex >= form.questions.length;

    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: {
        answers: newAnswers,
        currentIndex: isLast ? session.currentIndex : nextIndex,
        state: isLast ? 'REVIEW' : 'ACTIVE',
      },
    });

    return { next: isLast ? 'REVIEW' : 'QUESTION', snapshot: this.toSnapshot(updated) };
  }

  async goBack(sessionId: string, telegramId: string): Promise<SessionSnapshot> {
    const session = await this.getAndGuard(sessionId, telegramId);

    if (session.state === 'SUBMITTED' || session.state === 'INTERRUPTED') {
      throw new BadRequestException('Cannot go back on a completed session.');
    }
    if (session.currentIndex === 0 && session.state === 'ACTIVE') {
      throw new BadRequestException('Already at the first question.');
    }

    const newIndex = session.state === 'REVIEW'
      ? session.currentIndex
      : session.currentIndex - 1;

    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: { currentIndex: newIndex, state: 'ACTIVE' },
    });
    return this.toSnapshot(updated);
  }

  async submitFinal(sessionId: string, telegramId: string): Promise<void> {
    const session = await this.getAndGuard(sessionId, telegramId);
    if (session.state !== 'REVIEW') throw new BadRequestException('Session is not in review state.');

    assertSessionTransition('REVIEW', 'SUBMITTED');

    const form = await this.prisma.form.findUnique({
      where: { id: session.formId },
      select: { creatorId: true },
    });

    const [, response] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { state: 'SUBMITTED', submittedAt: new Date() },
      }),
      this.prisma.response.create({
        data: {
          sessionId: session.id,
          formId: session.formId,
          answers: session.answers as object,
          status: 'SUBMITTED',
        },
      }),
    ]);

    if (form) {
      void this.subscriptionService.incrementResponseCount(form.creatorId);
      void this.notificationsQueue.add('notify', {
        type: 'form.submitted',
        payload: { formId: session.formId, responseId: response.id, creatorId: form.creatorId },
      });
    }
  }

  async interruptAllActiveSessions(formId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { formId, state: { in: ['ACTIVE', 'REVIEW'] } },
      data: { state: 'INTERRUPTED', interruptedAt: new Date() },
    });
  }

  async getSession(sessionId: string): Promise<SessionSnapshot> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.toSnapshot(session);
  }

  private async getAndGuard(sessionId: string, telegramId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userTelegramId !== telegramId) throw new ForbiddenException();
    return session;
  }

  private async interruptSession(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { state: 'INTERRUPTED', interruptedAt: new Date() },
    });
  }

  private toSnapshot(session: {
    id: string; formId: string; userTelegramId: string;
    state: string; currentIndex: number; answers: unknown;
  }): SessionSnapshot {
    return {
      id: session.id,
      formId: session.formId,
      userTelegramId: session.userTelegramId,
      state: session.state as SessionSnapshot['state'],
      currentIndex: session.currentIndex,
      answers: (session.answers as AnswerMap) ?? {},
    };
  }
}
