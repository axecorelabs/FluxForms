import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';

const TOKEN_TTL_MINUTES = 15;

@Injectable()
export class DashboardAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async generateMagicLink(creatorId: string): Promise<string> {
    // Invalidate any existing unused tokens for this creator
    await this.prisma.dashboardToken.deleteMany({
      where: { creatorId, usedAt: null },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.dashboardToken.create({
      data: { creatorId, token, expiresAt },
    });

    const baseUrl = process.env.DASHBOARD_URL ?? 'https://dashboard.fluxforms.io';
    return `${baseUrl}/auth/login?token=${token}`;
  }

  async exchangeToken(token: string): Promise<{ accessToken: string }> {
    const record = await this.prisma.dashboardToken.findUnique({
      where: { token },
      include: { creator: true },
    });

    if (!record) throw new UnauthorizedException('Invalid token');
    if (record.usedAt) throw new UnauthorizedException('Token already used');
    if (new Date() > record.expiresAt) throw new UnauthorizedException('Token expired');

    // Mark as used
    await this.prisma.dashboardToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    const accessToken = this.jwt.sign(
      { sub: record.creatorId, telegramId: record.creator.telegramId, role: 'CREATOR' },
      { expiresIn: '7d' },
    );

    return { accessToken };
  }
}
