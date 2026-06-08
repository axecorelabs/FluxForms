import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MiniAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async authenticate(initData: string): Promise<{ accessToken: string }> {
    const botToken = process.env.TELEGRAM_CREATOR_BOT_TOKEN;
    if (!botToken) throw new UnauthorizedException('Bot token not configured');

    const parsed = new URLSearchParams(initData);
    const hash = parsed.get('hash');
    if (!hash) throw new UnauthorizedException('Missing hash');

    parsed.delete('hash');
    const dataCheckString = [...parsed.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (expectedHash !== hash) throw new UnauthorizedException('Invalid initData signature');

    const userJson = parsed.get('user');
    if (!userJson) throw new UnauthorizedException('Missing user in initData');

    let telegramId: string;
    try {
      const tgUser = JSON.parse(userJson) as { id: number };
      telegramId = String(tgUser.id);
    } catch {
      throw new UnauthorizedException('Malformed user data');
    }

    const creator = await this.prisma.user.findUnique({ where: { telegramId } });
    if (!creator) throw new UnauthorizedException('Creator not found');

    const accessToken = this.jwt.sign(
      { sub: creator.id, telegramId: creator.telegramId, role: 'CREATOR' },
      { expiresIn: '1h' },
    );

    return { accessToken };
  }

  async getFormWithResponses(formId: string, creatorId: string, page = 1) {
    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!form || form.creatorId !== creatorId) {
      throw new UnauthorizedException('Form not found or access denied');
    }

    const limit = 50;
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

    return {
      form: {
        id: form.id,
        title: form.title,
        questions: form.questions.map((q) => ({ id: q.id, text: q.text, type: q.type })),
      },
      responses,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
