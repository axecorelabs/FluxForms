import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResponseService {
  constructor(private readonly prisma: PrismaService) {}

  async getResponsesForForm(formId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [responses, total] = await this.prisma.$transaction([
      this.prisma.response.findMany({
        where: { formId },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.response.count({ where: { formId } }),
    ]);
    return { responses, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getResponse(responseId: string) {
    const response = await this.prisma.response.findUnique({ where: { id: responseId } });
    if (!response) throw new NotFoundException('Response not found');
    return response;
  }
}
