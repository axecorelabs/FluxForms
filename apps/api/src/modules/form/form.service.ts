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
        include: { _count: { select: { responses: true } } },
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

    const [formCounts, responseCounts, trend] = await this.prisma.$transaction([
      this.prisma.form.groupBy({
        by: ['status'],
        where: { creatorId },
        _count: true,
      }),
      this.prisma.response.count({
        where: { form: { creatorId } },
      }),
      this.prisma.response.findMany({
        where: { form: { creatorId }, submittedAt: { gte: thirtyDaysAgo } },
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    const totalForms = formCounts.reduce((s, r) => s + r._count, 0);
    const activeForms = formCounts.find(r => r.status === 'ACTIVE')?._count ?? 0;

    // Build daily buckets for the last 30 days
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
