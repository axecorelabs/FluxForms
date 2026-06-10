import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InterviewField } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../../modules/llm/llm.service';
import { EmbeddingService } from '../../modules/llm/embedding.service';
import { PromptBuilderService } from '../../modules/llm/prompt-builder.service';
import { SubscriptionService } from '../../modules/subscription/subscription.service';
import { QUEUES, ExtractionJobData, SerializedField } from '../queue.constants';

@Processor(QUEUES.EXTRACTION, { concurrency: 3 })
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly embedding: EmbeddingService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<void> {
    const { sessionId, interviewId, schemaFields, fullHistory, extractionSystemPrompt, isFinal } = job.data;

    const conversationText = fullHistory
      .map((m: { role: 'user' | 'assistant'; content: string }) =>
        `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`,
      )
      .join('\n\n');

    const { toolResult } = await this.llm.extractEntities(
      conversationText,
      schemaFields as unknown as InterviewField[],
      extractionSystemPrompt,
    );

    if (!toolResult) {
      this.logger.warn(`No tool result for session ${sessionId}`);
      return;
    }

    const upserts = schemaFields
      .filter((f: SerializedField) => toolResult[f.fieldName] !== null && toolResult[f.fieldName] !== undefined)
      .map((f: SerializedField) =>
        this.prisma.extractedEntity.upsert({
          where: { sessionId_fieldName: { sessionId, fieldName: f.fieldName } },
          create: {
            sessionId,
            fieldName: f.fieldName,
            value: toolResult[f.fieldName],
            confidence: 0.8,
            lastUpdatedTurn: Math.floor(fullHistory.length / 2),
          },
          update: {
            value: toolResult[f.fieldName],
            confidence: 0.8,
            lastUpdatedTurn: Math.floor(fullHistory.length / 2),
          },
        }),
      );

    await Promise.all(upserts);
    this.logger.debug(`Extracted ${upserts.length} entities for session ${sessionId}`);

    if (isFinal) {
      const profileText = schemaFields
        .filter((f: SerializedField) => toolResult[f.fieldName] !== null && toolResult[f.fieldName] !== undefined)
        .map((f: SerializedField) => {
          const val = toolResult[f.fieldName];
          const strVal = Array.isArray(val) ? (val as unknown[]).join(', ') : String(val);
          return `${f.displayName}: ${strVal}`;
        })
        .join('\n');

      const vector = await this.embedding.embed(profileText);
      const vectorLiteral = `[${vector.join(',')}]`;

      await this.prisma.$executeRaw`
        UPDATE interview_sessions
        SET profile_embedding = ${vectorLiteral}::vector
        WHERE id = ${sessionId}
      `;

      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
        include: { schemaFields: { orderBy: { orderIndex: 'asc' } } },
      });

      if (interview) {
        await this.prisma.interview.update({
          where: { id: interviewId },
          data: { completedCount: { increment: 1 } },
        });

        await this.subscriptionService.incrementResponseCount(interview.creatorId);

        // Generate qualitative summary async — does not block the filler bot
        try {
          const extractedFields = schemaFields
            .filter((f: SerializedField) => toolResult[f.fieldName] !== null && toolResult[f.fieldName] !== undefined)
            .map((f: SerializedField) => ({
              fieldName: f.fieldName,
              displayName: f.displayName,
              value: toolResult[f.fieldName] as unknown,
            }));

          const summaryPrompt = this.promptBuilder.buildSummaryPrompt(
            interview,
            extractedFields,
            conversationText,
          );

          const summary = await this.llm.generateSummary(summaryPrompt);

          await this.prisma.interviewSession.update({
            where: { id: sessionId },
            data: { summary },
          });

          this.logger.log(`Summary generated for session ${sessionId}`);
        } catch (err) {
          this.logger.error(`Summary generation failed for session ${sessionId}`, err);
          // Non-fatal — session is still complete, summary just won't be available
        }
      }

      this.logger.log(`Profile embedding stored for completed session ${sessionId}`);
    }
  }
}
