import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CreatorBotService } from './creator-bot.service';
import { FillerBotService } from './filler-bot.service';
import { FormModule } from '../form/form.module';
import { QuestionModule } from '../question/question.module';
import { SessionModule } from '../session/session.module';
import { ResponseModule } from '../response/response.module';
import { PaymentModule } from '../payment/payment.module';
import { BotStateModule } from '../bot-state/bot-state.module';
import { AuthModule } from '../auth/auth.module';
import { InterviewModule } from '../interview/interview.module';
import { InterviewSessionModule } from '../interview-session/interview-session.module';
import { DashboardAuthModule } from '../dashboard-auth/dashboard-auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { EmailModule } from '../email/email.module';
import { NotificationProcessor } from '../../queue/processors/notification.processor';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [
    AuthModule,
    FormModule,
    QuestionModule,
    SessionModule,
    ResponseModule,
    PaymentModule,
    BotStateModule,
    InterviewModule,
    InterviewSessionModule,
    DashboardAuthModule,
    SubscriptionModule,
    EmailModule,
    BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
  ],
  providers: [CreatorBotService, FillerBotService, NotificationProcessor],
  exports: [CreatorBotService, FillerBotService],
})
export class BotModule {}
