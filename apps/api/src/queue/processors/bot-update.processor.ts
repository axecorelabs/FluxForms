import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CreatorBotService } from '../../modules/bot/creator-bot.service';
import { FillerBotService } from '../../modules/bot/filler-bot.service';
import { QUEUES, BotUpdateJobData } from '../queue.constants';

@Processor(QUEUES.BOT_UPDATES, { concurrency: 5 })
export class BotUpdateProcessor extends WorkerHost {
  private readonly logger = new Logger(BotUpdateProcessor.name);

  constructor(
    private readonly creatorBot: CreatorBotService,
    private readonly fillerBot: FillerBotService,
  ) {
    super();
  }

  async process(job: Job<BotUpdateJobData>): Promise<void> {
    const { bot, update } = job.data;
    if (bot === 'creator') {
      await this.creatorBot.handleUpdate(update);
    } else {
      await this.fillerBot.handleUpdate(update);
    }
  }
}
