import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';
import axios from 'axios';
import { createHmac } from 'crypto';

export const PLAN_LIMITS: Record<SubscriptionPlan, number> = {
  FREE:       50,
  STARTER:   500,
  GROWTH:   5000,
  ENTERPRISE: 999_999,
};

export const PLAN_PRICES_KOBO: Partial<Record<SubscriptionPlan, number>> = {
  STARTER:  1_000_000,  // ₦10,000
  GROWTH:   3_500_000,  // ₦35,000
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE:       'Free',
  STARTER:    'Starter',
  GROWTH:     'Growth',
  ENTERPRISE: 'Enterprise',
};

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateSubscription(creatorId: string) {
    const existing = await this.prisma.subscription.findUnique({ where: { creatorId } });
    if (existing) return existing;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.subscription.create({
      data: {
        creatorId,
        plan: 'FREE',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        responseCount: 0,
        responseLimit: PLAN_LIMITS.FREE,
      },
    });
  }

  async checkLimit(creatorId: string): Promise<{ allowed: boolean; remaining: number; plan: SubscriptionPlan }> {
    const sub = await this.getOrCreateSubscription(creatorId);

    if (sub.status !== 'ACTIVE') {
      return { allowed: false, remaining: 0, plan: sub.plan };
    }

    // Auto-reset if period has rolled over
    if (new Date() > sub.currentPeriodEnd) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await this.prisma.subscription.update({
        where: { creatorId },
        data: { responseCount: 0, currentPeriodStart: now, currentPeriodEnd: periodEnd },
      });
      return { allowed: true, remaining: sub.responseLimit, plan: sub.plan };
    }

    const remaining = sub.responseLimit - sub.responseCount;
    return { allowed: remaining > 0, remaining: Math.max(0, remaining), plan: sub.plan };
  }

  async incrementResponseCount(creatorId: string) {
    await this.prisma.subscription.updateMany({
      where: { creatorId },
      data: { responseCount: { increment: 1 } },
    });
  }

  async getSubscriptionSummary(creatorId: string) {
    const sub = await this.getOrCreateSubscription(creatorId);
    const remaining = Math.max(0, sub.responseLimit - sub.responseCount);
    return {
      plan: sub.plan,
      status: sub.status,
      used: sub.responseCount,
      limit: sub.responseLimit,
      remaining,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  // Generate a Paystack checkout URL for a plan upgrade.
  // Metadata carries creatorId so the webhook can match back.
  async initSubscriptionCheckout(creatorId: string, plan: SubscriptionPlan): Promise<string> {
    if (plan === 'FREE' || plan === 'ENTERPRISE') {
      throw new BadRequestException('Cannot self-serve upgrade to FREE or ENTERPRISE');
    }

    const planCode = plan === 'STARTER'
      ? process.env.PAYSTACK_STARTER_PLAN_CODE
      : process.env.PAYSTACK_GROWTH_PLAN_CODE;

    if (!planCode) {
      throw new BadRequestException(`Paystack plan code not configured for ${plan}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: creatorId } });
    if (!user) throw new BadRequestException('User not found');

    // Use telegramId as email surrogate (Paystack requires email)
    const email = `${user.telegramId}@fluxforms.app`;
    const amount = PLAN_PRICES_KOBO[plan]!;
    const reference = `sub_${creatorId.slice(-8)}_${Date.now()}`;

    const { data } = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        reference,
        plan: planCode,
        metadata: {
          creator_id: creatorId,
          plan,
          custom_fields: [
            { display_name: 'Creator ID', variable_name: 'creator_id', value: creatorId },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
    );

    return data.data.authorization_url as string;
  }

  verifyWebhookSignature(rawBody: string, signature: string): void {
    const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');
    if (hash !== signature) throw new BadRequestException('Invalid webhook signature');
  }

  async handlePaystackWebhook(event: string, data: Record<string, unknown>): Promise<void> {
    if (event === 'subscription.create') {
      const subscriptionCode = data.subscription_code as string;
      const planCode = (data.plan as Record<string, string>)?.plan_code;
      const metadata = (data.metadata as Record<string, unknown>) ??
        ((data.customer as Record<string, unknown>)?.metadata as Record<string, unknown>) ?? {};
      const creatorId = metadata['creator_id'] as string | undefined;

      if (!creatorId) {
        this.logger.warn('subscription.create webhook missing creator_id in metadata');
        return;
      }

      const plan = this.mapPaystackPlanToEnum(planCode);

      await this.prisma.subscription.upsert({
        where: { creatorId },
        create: {
          creatorId,
          plan,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          responseLimit: PLAN_LIMITS[plan],
          paystackSubCode: subscriptionCode,
        },
        update: {
          plan,
          status: 'ACTIVE',
          responseLimit: PLAN_LIMITS[plan],
          paystackSubCode: subscriptionCode,
        },
      });

      this.logger.log(`Subscription created: creator=${creatorId} plan=${plan}`);
    }

    if (event === 'subscription.disable') {
      const subscriptionCode = data.subscription_code as string;
      await this.prisma.subscription.updateMany({
        where: { paystackSubCode: subscriptionCode },
        data: { status: 'CANCELLED' },
      });
      this.logger.log(`Subscription disabled: code=${subscriptionCode}`);
    }
  }

  async adminSetPlan(creatorId: string, plan: SubscriptionPlan): Promise<void> {
    await this.prisma.subscription.upsert({
      where: { creatorId },
      create: {
        creatorId,
        plan,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        responseCount: 0,
        responseLimit: PLAN_LIMITS[plan],
      },
      update: {
        plan,
        status: 'ACTIVE',
        responseLimit: PLAN_LIMITS[plan],
      },
    });
  }

  private mapPaystackPlanToEnum(planCode: string | undefined): SubscriptionPlan {
    if (!planCode) return 'FREE';
    const code = planCode.toLowerCase();
    if (code.includes('starter')) return 'STARTER';
    if (code.includes('growth'))  return 'GROWTH';
    if (code.includes('enterprise')) return 'ENTERPRISE';
    return 'FREE';
  }
}
