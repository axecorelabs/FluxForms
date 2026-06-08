import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaystackProvider } from './providers/paystack.provider';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS })],
  controllers: [PaymentController],
  providers: [PaymentService, PaystackProvider, FlutterwaveProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
