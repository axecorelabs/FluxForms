import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [
    SubscriptionModule,
    BullModule.registerQueue(
      { name: QUEUES.BOT_UPDATES },
      { name: QUEUES.EXTRACTION },
      { name: QUEUES.NOTIFICATIONS },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
