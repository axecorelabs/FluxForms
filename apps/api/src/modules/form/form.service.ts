import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FormStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertFormTransition } from '@fluxforms/state-machine';
import { generateShareToken, buildShareLink } from '@fluxforms/utils';

@Injectable()
export class FormService {
  constructor(private readonly prisma: PrismaService) {}

  async create(creatorId: string, title: string, description?: string) {
    return this.prisma.form.create({
      data: { creatorId, title, description, status: 'DRAFT' },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async findById(formId: string) {
    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async findByShareToken(shareToken: string) {
    const form = await this.prisma.form.findUnique({
      where: { shareToken },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async findDraftsByCreator(creatorId: string) {
    return this.prisma.form.findMany({
      where: { creatorId, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true, _count: { select: { questions: true } } },
    });
  }

  async findByCreator(creatorId: string, page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const [forms, total] = await this.prisma.$transaction([
      this.prisma.form.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { responses: true, questions: true } } },
      }),
      this.prisma.form.count({ where: { creatorId } }),
    ]);
    return { forms, total, page, totalPages: Math.ceil(total / limit) };
  }

  async transition(formId: string, creatorId: string, to: FormStatus) {
    const form = await this.findById(formId);
    if (form.creatorId !== creatorId) throw new ForbiddenException();

    assertFormTransition(form.status, to);

    const data: Record<string, unknown> = { status: to };

    if (to === 'ACTIVE' && !form.shareToken) {
      const token = generateShareToken();
      const fillerBotUsername = process.env.TELEGRAM_FILLER_BOT_USERNAME!;
      data.shareToken = token;
      data.shareLink = buildShareLink(fillerBotUsername, token);
    }

    if (to === 'CLOSED') data.closedAt = new Date();
    if (to === 'ARCHIVED') data.archivedAt = new Date();

    return this.prisma.form.update({ where: { id: formId }, data });
  }

  async getOverviewStats(creatorId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalForms, activeForms, responseCounts, trend] = await this.prisma.$transaction([
      this.prisma.form.count({ where: { creatorId } }),
      this.prisma.form.count({ where: { creatorId, status: 'ACTIVE' } }),
      this.prisma.response.count({ where: { form: { creatorId } } }),
      this.prisma.response.findMany({
        where: { form: { creatorId }, submittedAt: { gte: thirtyDaysAgo } },
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of trend) {
      if (r.submittedAt) {
        const key = r.submittedAt.toISOString().slice(0, 10);
        if (key in buckets) buckets[key]++;
      }
    }
    const responseTrend = Object.entries(buckets).map(([date, count]) => ({ date, count }));

    return { totalForms, activeForms, totalResponses: responseCounts, responseTrend };
  }

  async getOverview(creatorId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalForms,
      activeForms,
      totalResponses,
      trend,
      totalInterviews,
      activeInterviews,
      completionSum,
      recentForms,
      recentInterviews,
    ] = await this.prisma.$transaction([
      this.prisma.form.count({ where: { creatorId } }),
      this.prisma.form.count({ where: { creatorId, status: 'ACTIVE' } }),
      this.prisma.response.count({ where: { form: { creatorId } } }),
      this.prisma.response.findMany({
        where: { form: { creatorId }, submittedAt: { gte: thirtyDaysAgo } },
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.interview.count({ where: { creatorId } }),
      this.prisma.interview.count({ where: { creatorId, status: 'ACTIVE' } }),
      this.prisma.interview.aggregate({ where: { creatorId }, _sum: { completedCount: true } }),
      this.prisma.form.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, title: true, status: true,
          _count: { select: { responses: true, questions: true } },
        },
      }),
      this.prisma.interview.findMany({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, title: true, status: true, type: true, completedCount: true,
          schemaFields: { select: { fieldName: true }, orderBy: { orderIndex: 'asc' } },
        },
      }),
    ]);

    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of trend) {
      if (r.submittedAt) {
        const key = r.submittedAt.toISOString().slice(0, 10);
        if (key in buckets) buckets[key]++;
      }
    }
    const responseTrend = Object.entries(buckets).map(([date, count]) => ({ date, count }));

    return {
      totalForms,
      activeForms,
      totalResponses,
      responseTrend,
      totalInterviews,
      activeInterviews,
      totalCompletions: completionSum._sum.completedCount ?? 0,
      recentForms,
      recentInterviews,
    };
  }

  async delete(formId: string, creatorId: string) {
    const form = await this.findById(formId);
    if (form.creatorId !== creatorId) throw new ForbiddenException();
    if (form.status === 'ACTIVE') {
      throw new BadRequestException('Close the form before deleting it');
    }
    return this.prisma.form.update({
      where: { id: formId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }
}
