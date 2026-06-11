import { Injectable, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { BotType } from '@prisma/client';
import { REDIS } from '../../redis/redis.module';

const BOT_STATE_TTL_S = 6 * 60 * 60; // 6 hours — clears abandoned wizard state

interface BotStateData {
  conversationStep: string | null;
  context: Record<string, unknown>;
}

@Injectable()
export class BotStateService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(telegramId: string, botType: BotType) {
    return `bot_state:${telegramId}:${botType}`;
  }

  async getState(telegramId: string, botType: BotType): Promise<BotStateData | null> {
    const raw = await this.redis.get(this.key(telegramId, botType));
    if (!raw) return null;
    return JSON.parse(raw) as BotStateData;
  }

  async setState(
    telegramId: string,
    botType: BotType,
    step: string | null,
    context: Record<string, unknown> = {},
  ): Promise<void> {
    const data: BotStateData = { conversationStep: step, context };
    await this.redis.set(this.key(telegramId, botType), JSON.stringify(data), 'EX', BOT_STATE_TTL_S);
  }

  async clearState(telegramId: string, botType: BotType): Promise<void> {
    await this.redis.del(this.key(telegramId, botType));
  }

  async updateContext(
    telegramId: string,
    botType: BotType,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const current = await this.getState(telegramId, botType);
    const merged = { ...(current?.context ?? {}), ...patch };
    await this.setState(telegramId, botType, current?.conversationStep ?? null, merged);
  }
}
