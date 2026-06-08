import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuestionService {
  constructor(private readonly prisma: PrismaService) {}

  async addQuestion(
    formId: string,
    creatorId: string,
    text: string,
    type: QuestionType,
    options?: string[],
  ) {
    const form = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException('Form not found');
    if (form.creatorId !== creatorId) throw new ForbiddenException();
    if (form.status !== 'DRAFT') {
      throw new BadRequestException('Cannot modify a form that is no longer a draft');
    }

    const count = await this.prisma.question.count({ where: { formId } });
    if (count >= 50) throw new BadRequestException('Maximum 50 questions per form');

    return this.prisma.question.create({
      data: {
        formId,
        text,
        type,
        options: options ?? Prisma.JsonNull,
        orderIndex: count,
      },
    });
  }

  async getQuestions(formId: string) {
    return this.prisma.question.findMany({
      where: { formId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async deleteQuestion(questionId: string, creatorId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { form: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.form.creatorId !== creatorId) throw new ForbiddenException();
    if (question.form.status !== 'DRAFT') {
      throw new BadRequestException('Cannot modify a published form');
    }

    await this.prisma.question.delete({ where: { id: questionId } });

    // Re-index remaining questions
    const remaining = await this.prisma.question.findMany({
      where: { formId: question.formId },
      orderBy: { orderIndex: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((q, i) =>
        this.prisma.question.update({ where: { id: q.id }, data: { orderIndex: i } }),
      ),
    );
  }
}
