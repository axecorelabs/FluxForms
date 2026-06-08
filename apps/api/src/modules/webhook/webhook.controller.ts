import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelegramWebhookGuard } from '../../common/guards/telegram-webhook.guard';
import { QUEUES, JOBS, BotUpdateJobData } from '../../queue/queue.constants';

@Controller('webhook')
export class WebhookController {
  constructor(
    @InjectQueue(QUEUES.BOT_UPDATES) private readonly botQueue: Queue<BotUpdateJobData>,
  ) {}

  @Post('creator-bot')
  @UseGuards(TelegramWebhookGuard)
  @HttpCode(200)
  async creatorWebhook(@Body() update: Record<string, unknown>) {
    await this.botQueue.add(JOBS.CREATOR_UPDATE, { bot: 'creator', update }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { ok: true };
  }

  @Post('filler-bot')
  @UseGuards(TelegramWebhookGuard)
  @HttpCode(200)
  async fillerWebhook(@Body() update: Record<string, unknown>) {
    await this.botQueue.add(JOBS.FILLER_UPDATE, { bot: 'filler', update }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return { ok: true };
  }
}
