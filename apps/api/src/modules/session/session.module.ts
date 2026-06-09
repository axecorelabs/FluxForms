import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SessionService } from './session.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [
    SubscriptionModule,
    BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
  ],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
