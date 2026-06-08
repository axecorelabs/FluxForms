import { Injectable } from '@nestjs/common';
import { BotType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BotStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(telegramId: string, botType: BotType) {
    return this.prisma.botState.findUnique({
      where: { telegramId_botType: { telegramId, botType } },
    });
  }

  async setState(
    telegramId: string,
    botType: BotType,
    step: string | null,
    context: Record<string, unknown> = {},
  ) {
    return this.prisma.botState.upsert({
      where: { telegramId_botType: { telegramId, botType } },
      create: { telegramId, botType, conversationStep: step, context: context as Prisma.InputJsonValue },
      update: { conversationStep: step, context: context as Prisma.InputJsonValue },
    });
  }

  async clearState(telegramId: string, botType: BotType) {
    return this.setState(telegramId, botType, null, {});
  }

  async updateContext(
    telegramId: string,
    botType: BotType,
    patch: Record<string, unknown>,
  ) {
    const current = await this.getState(telegramId, botType);
    const merged = { ...((current?.context as object) ?? {}), ...patch };
    return this.setState(telegramId, botType, current?.conversationStep ?? null, merged);
  }
}
