import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
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

    // A completed session must only be counted once toward completedCount and
    // the creator's monthly usage. The live final turn counts it; a manual
    // re-run of a session that already succeeded must NOT count it again.
    // (A re-run after a FAILED extraction still counts, since the original
    // run threw before reaching the increment.)
    let alreadyCounted = false;

    // Mark the final extraction as in-flight so the dashboard can distinguish
    // "still working" from "failed".
    if (isFinal) {
      const existing = await this.prisma.interviewSession.findUnique({
        where: { id: sessionId },
        select: { extractionStatus: true },
      });
      alreadyCounted = existing?.extractionStatus === 'DONE';

      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { extractionStatus: 'PROCESSING', extractionError: null },
      });
    }

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

    // No tool result means the extraction genuinely failed (LLM error, bad
    // response, etc). Throw so BullMQ retries — never silently succeed, or we
    // lose the respondent's data with no trace.
    if (!toolResult) {
      throw new Error(`Extraction returned no tool result for session ${sessionId}`);
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
        if (!alreadyCounted) {
          await this.prisma.interview.update({
            where: { id: interviewId },
            data: { completedCount: { increment: 1 } },
          });

          await this.subscriptionService.incrementResponseCount(interview.creatorId);
        }

        // Generate qualitative summary. Non-fatal — extraction itself has
        // already succeeded by this point, and the summary has its own
        // regenerate path. We don't want a summary hiccup to mark the whole
        // extraction FAILED.
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
        }
      }

      // Extraction proper (entities + embedding) succeeded.
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { extractionStatus: 'DONE', extractionError: null },
      });

      this.logger.log(`Profile embedding stored for completed session ${sessionId}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExtractionJobData>, err: Error): Promise<void> {
    const { sessionId, isFinal } = job.data;
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;

    this.logger.error(
      `Extraction job ${job.id} failed (attempt ${job.attemptsMade}/${attempts}) for session ${sessionId}: ${err.message}`,
    );

    // Only flip the session to FAILED once retries are exhausted, and only for
    // the final extraction — interim turn extractions will be superseded by
    // later turns anyway.
    if (isFinal && exhausted) {
      await this.prisma.interviewSession
        .update({
          where: { id: sessionId },
          data: { extractionStatus: 'FAILED', extractionError: err.message.slice(0, 1000) },
        })
        .catch(e => this.logger.error(`Could not mark session ${sessionId} extraction FAILED`, e));
    }
  }
}
