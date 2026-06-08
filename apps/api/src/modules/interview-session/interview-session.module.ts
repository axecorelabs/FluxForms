import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InterviewSessionService } from './interview-session.service';
import { InterviewSessionController } from './interview-session.controller';
import { LlmModule } from '../llm/llm.module';
import { InterviewModule } from '../interview/interview.module';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ExtractionProcessor } from '../../queue/processors/extraction.processor';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [
    LlmModule,
    InterviewModule,
    AuthModule,
    SubscriptionModule,
    BullModule.registerQueue(
      { name: QUEUES.EXTRACTION },
      { name: QUEUES.NOTIFICATIONS },
    ),
  ],
  providers: [InterviewSessionService, ExtractionProcessor],
  controllers: [InterviewSessionController],
  exports: [InterviewSessionService],
})
export class InterviewSessionModule {}
