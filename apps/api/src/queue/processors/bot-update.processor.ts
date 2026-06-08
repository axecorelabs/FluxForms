import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CreatorBotService } from '../../modules/bot/creator-bot.service';
import { FillerBotService } from '../../modules/bot/filler-bot.service';
import { QUEUES, BotUpdateJobData } from '../queue.constants';

@Processor(QUEUES.BOT_UPDATES, { concurrency: 5 })
export class BotUpdateProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BotUpdateProcessor.name);

  constructor(
    private readonly creatorBot: CreatorBotService,
    private readonly fillerBot: FillerBotService,
  ) {
    super();
  }

  onModuleInit() {
    this.logger.log('Worker started — listening on queue: ' + QUEUES.BOT_UPDATES);
  }

  async process(job: Job<BotUpdateJobData>): Promise<void> {
    const { bot, update } = job.data;
    this.logger.debug(`Processing job ${job.id} for bot: ${bot}`);
    try {
      if (bot === 'creator') {
        await this.creatorBot.handleUpdate(update);
      } else {
        await this.fillerBot.handleUpdate(update);
      }
    } catch (err) {
      this.logger.error(`Job ${job.id} failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }
}
