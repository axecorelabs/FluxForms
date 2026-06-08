import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhookController } from './webhook.controller';
import { BotModule } from '../bot/bot.module';
import { BotUpdateProcessor } from '../../queue/processors/bot-update.processor';
import { QUEUES } from '../../queue/queue.constants';

@Module({
  imports: [
    BotModule,
    BullModule.registerQueue({ name: QUEUES.BOT_UPDATES }),
  ],
  controllers: [WebhookController],
  providers: [BotUpdateProcessor],
})
export class WebhookModule {}
