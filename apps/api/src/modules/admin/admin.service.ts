import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SubscriptionPlan } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { QUEUES } from '../../queue/queue.constants';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    @InjectQueue(QUEUES.BOT_UPDATES)   private readonly botQueue: Queue,
    @InjectQueue(QUEUES.EXTRACTION)    private readonly extractionQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {}

  // ─── Stats ────────────────────────────────────────────────────────────────────

  async getStats() {
    const [totalUsers, totalForms, totalInterviews, totalResponses, totalSessions] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.form.count(),
        this.prisma.interview.count(),
        this.prisma.response.count(),
        this.prisma.interviewSession.count(),
      ]);

    const revenue = await this.prisma.payment.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
    });

    const completedSessions = await this.prisma.interviewSession.count({ where: { state: 'COMPLETED' } });
    const activeForms = await this.prisma.form.count({ where: { status: 'ACTIVE' } });

    return {
      totalUsers,
      totalForms,
      activeForms,
      totalInterviews,
      totalResponses,
      totalSessions,
      completedSessions,
      totalRevenueKobo: revenue._sum.amount ?? 0,
    };
  }

  // ─── Users ────────────────────────────────────────────────────────────────────

  async getUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          subscription: true,
          _count: { select: { forms: true, interviews: true } },
        },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total, page, limit };
  }

  async setUserPlan(userId: string, plan: SubscriptionPlan) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.subscriptionService.adminSetPlan(userId, plan);
    return { success: true };
  }

  // ─── Forms ────────────────────────────────────────────────────────────────────

  async getForms(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [forms, total] = await this.prisma.$transaction([
      this.prisma.form.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { creator: { select: { telegramId: true, username: true } }, _count: { select: { responses: true } } },
      }),
      this.prisma.form.count(),
    ]);
    return { forms, total, page, limit };
  }

  // ─── Interviews ───────────────────────────────────────────────────────────────

  async getInterviews(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [interviews, total] = await this.prisma.$transaction([
      this.prisma.interview.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          creator: { select: { telegramId: true, username: true } },
          _count: { select: { sessions: true } },
        },
      }),
      this.prisma.interview.count(),
    ]);
    return { interviews, total, page, limit };
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  async getPayments(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          form: { select: { title: true } },
          creator: { select: { telegramId: true, username: true } },
        },
      }),
      this.prisma.payment.count(),
    ]);
    return { payments, total, page, limit };
  }

  // ─── Queue health ─────────────────────────────────────────────────────────────

  async getQueueStats() {
    const [botCounts, extractionCounts, notificationCounts] = await Promise.all([
      this.botQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      this.extractionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      this.notificationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return {
      botUpdates:    { name: QUEUES.BOT_UPDATES,   ...botCounts },
      extraction:    { name: QUEUES.EXTRACTION,     ...extractionCounts },
      notifications: { name: QUEUES.NOTIFICATIONS,  ...notificationCounts },
    };
  }

  async retryFailedJobs(queueName: string) {
    const queue = this.queueByName(queueName);
    const failed = await queue.getFailed();
    await Promise.all(failed.map(j => j.retry()));
    return { retried: failed.length };
  }

  async getFailedJobs(queueName: string, limit = 20) {
    const queue = this.queueByName(queueName);
    const jobs = await queue.getFailed(0, limit - 1);
    return jobs.map(j => ({
      id: j.id,
      name: j.name,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
      data: j.data,
    }));
  }

  // ─── Telegram webhook registration ───────────────────────────────────────────

  async registerWebhook(bot: 'creator' | 'filler', apiBaseUrl: string) {
    const token = bot === 'creator'
      ? process.env.TELEGRAM_CREATOR_BOT_TOKEN
      : process.env.TELEGRAM_FILLER_BOT_TOKEN;

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const path = bot === 'creator' ? 'webhook/creator-bot' : 'webhook/filler-bot';
    const url = `${apiBaseUrl.replace(/\/$/, '')}/${path}`;

    const { data } = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      { url, secret_token: webhookSecret, allowed_updates: ['message', 'callback_query'] },
    );

    return { ok: data.ok, description: data.description, url };
  }

  async getWebhookInfo(bot: 'creator' | 'filler') {
    const token = bot === 'creator'
      ? process.env.TELEGRAM_CREATOR_BOT_TOKEN
      : process.env.TELEGRAM_FILLER_BOT_TOKEN;

    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return data.result;
  }

  private queueByName(name: string): Queue {
    if (name === QUEUES.BOT_UPDATES)   return this.botQueue;
    if (name === QUEUES.EXTRACTION)    return this.extractionQueue;
    if (name === QUEUES.NOTIFICATIONS) return this.notificationQueue;
    throw new NotFoundException(`Unknown queue: ${name}`);
  }
}
