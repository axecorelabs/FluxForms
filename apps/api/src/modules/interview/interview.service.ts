import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../llm/llm.service';
import { PromptBuilderService } from '../llm/prompt-builder.service';
import { InterviewStatus, InterviewType, FieldType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

export interface CreateInterviewDto {
  title: string;
  type?: InterviewType;
  objective: string;
  context?: string;
  aiPersona?: string;
  maxTurns?: number;
}

export interface UpdateInterviewDto {
  title?: string;
  objective?: string;
  context?: string;
  aiPersona?: string;
  maxTurns?: number;
}

export interface AddFieldDto {
  fieldName: string;
  displayName: string;
  fieldType: FieldType;
  description: string;
  isRequired?: boolean;
  orderIndex: number;
}

@Injectable()
export class InterviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly promptBuilder: PromptBuilderService,
  ) {}

  async create(creatorId: string, dto: CreateInterviewDto) {
    return this.prisma.interview.create({
      data: {
        creatorId,
        title: dto.title,
        type: dto.type ?? 'CUSTOM',
        objective: dto.objective,
        context: dto.context,
        aiPersona: dto.aiPersona,
        maxTurns: dto.maxTurns ?? 20,
        status: 'DRAFT',
      },
      include: { schemaFields: true },
    });
  }

  async findById(id: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: { schemaFields: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async findByCreator(creatorId: string) {
    return this.prisma.interview.findMany({
      where: { creatorId },
      include: { schemaFields: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByShareToken(token: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { shareToken: token },
      include: { schemaFields: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async update(id: string, creatorId: string, dto: UpdateInterviewDto) {
    await this.assertOwner(id, creatorId);
    await this.assertDraft(id);
    return this.prisma.interview.update({
      where: { id },
      data: dto,
      include: { schemaFields: true },
    });
  }

  async addField(interviewId: string, creatorId: string, dto: AddFieldDto) {
    await this.assertOwner(interviewId, creatorId);
    await this.assertDraft(interviewId);

    return this.prisma.interviewField.create({
      data: {
        interviewId,
        fieldName: dto.fieldName,
        displayName: dto.displayName,
        fieldType: dto.fieldType,
        description: dto.description,
        isRequired: dto.isRequired ?? false,
        orderIndex: dto.orderIndex,
      },
    });
  }

  async removeField(interviewId: string, fieldId: string, creatorId: string) {
    await this.assertOwner(interviewId, creatorId);
    await this.assertDraft(interviewId);
    await this.prisma.interviewField.delete({ where: { id: fieldId } });
  }

  async activate(id: string, creatorId: string) {
    await this.assertOwner(id, creatorId);
    const interview = await this.findById(id);

    if (interview.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT interviews can be activated');
    }
    if (interview.schemaFields.length === 0) {
      throw new BadRequestException('Interview must have at least one field before activation');
    }

    const shareToken = randomBytes(16).toString('hex');
    const shareLink = `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=interview_${shareToken}`;

    // Pre-generate the opening message so there's no LLM call on first session start
    const systemPrompt = this.promptBuilder.buildOpeningMessagePrompt(interview);
    const openingMessage = await this.llm.generateOpeningMessage(systemPrompt, interview.objective);

    return this.prisma.interview.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        shareToken,
        shareLink,
        openingMessage,
      },
      include: { schemaFields: true },
    });
  }

  async close(id: string, creatorId: string) {
    await this.assertOwner(id, creatorId);
    return this.prisma.interview.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  async archive(id: string, creatorId: string) {
    await this.assertOwner(id, creatorId);
    return this.prisma.interview.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  async getStats(id: string, creatorId: string) {
    await this.assertOwner(id, creatorId);

    const [total, completed, active] = await Promise.all([
      this.prisma.interviewSession.count({ where: { interviewId: id } }),
      this.prisma.interviewSession.count({ where: { interviewId: id, state: 'COMPLETED' } }),
      this.prisma.interviewSession.count({ where: { interviewId: id, state: 'ACTIVE' } }),
    ]);

    return { total, completed, active, interrupted: total - completed - active };
  }

  private async assertOwner(interviewId: string, creatorId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { creatorId: true },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    if (interview.creatorId !== creatorId) throw new ForbiddenException('Not your interview');
  }

  private async assertDraft(interviewId: string) {
    const interview = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      select: { status: true },
    });
    if (interview?.status !== 'DRAFT') {
      throw new BadRequestException('Interview must be in DRAFT status to modify');
    }
  }
}
