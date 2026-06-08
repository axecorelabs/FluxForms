import { Module } from '@nestjs/common';
import { BotStateService } from './bot-state.service';

@Module({
  providers: [BotStateService],
  exports: [BotStateService],
})
export class BotStateModule {}
