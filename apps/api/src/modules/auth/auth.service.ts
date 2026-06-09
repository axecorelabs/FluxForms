import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

interface TelegramUserData {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

const OTP_TTL_MS   = 10 * 60 * 1000;  // 10 minutes
const LINK_TTL_MS  = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // ── Telegram (existing) ────────────────────────────────────────────────────

  async upsertUser(data: TelegramUserData) {
    return this.prisma.user.upsert({
      where: { telegramId: data.telegramId },
      create: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'FILLER',
      },
      update: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async setEmail(userId: string, email: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { email: email.toLowerCase(), emailVerified: true },
    });
  }

  signToken(userId: string, role: string): string {
    return this.jwtService.sign({ sub: userId, role });
  }

  // ── Email OTP ──────────────────────────────────────────────────────────────

  async requestOtp(rawEmail: string): Promise<void> {
    const email = rawEmail.toLowerCase().trim();

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email, role: 'CREATOR', emailVerified: false },
      });
      await this.prisma.subscription.create({
        data: {
          creatorId: user.id,
          plan: 'FREE',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          responseLimit: 50,
        },
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');

    // Invalidate previous OTPs for this email
    await this.prisma.emailOtp.deleteMany({ where: { email } });
    await this.prisma.emailOtp.create({
      data: { email, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    await this.emailService.sendVerificationCode(email, code, user.firstName ?? undefined);
  }

  async verifyOtp(rawEmail: string, code: string): Promise<{ accessToken: string; telegramLinked: boolean }> {
    const email = rawEmail.toLowerCase().trim();

    const otp = await this.prisma.emailOtp.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Code expired or not found. Request a new one.');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    const inputHash = createHash('sha256').update(code.trim()).digest('hex');
    if (inputHash !== otp.codeHash) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - otp.attempts - 1;
      throw new BadRequestException(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    const user = await this.prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    return {
      accessToken: this.jwtService.sign({ sub: user.id, role: user.role }, { expiresIn: '7d' }),
      telegramLinked: !!user.telegramId,
    };
  }

  // ── Add email to existing (Telegram-first) account ────────────────────────

  async requestEmailAdd(userId: string, rawEmail: string): Promise<void> {
    const email = rawEmail.toLowerCase().trim();

    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== userId) {
      throw new BadRequestException('This email is already linked to another account.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');

    await this.prisma.emailOtp.deleteMany({ where: { email } });
    await this.prisma.emailOtp.create({
      data: { email, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    await this.emailService.sendVerificationCode(email, code, user?.firstName ?? undefined);
  }

  async verifyEmailAdd(userId: string, rawEmail: string, code: string): Promise<void> {
    const email = rawEmail.toLowerCase().trim();

    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== userId) {
      throw new BadRequestException('This email is already linked to another account.');
    }

    const otp = await this.prisma.emailOtp.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Code expired or not found. Request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    const inputHash = createHash('sha256').update(code.trim()).digest('hex');
    if (inputHash !== otp.codeHash) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = MAX_ATTEMPTS - otp.attempts - 1;
      throw new BadRequestException(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerified: true },
    });
  }

  // ── Telegram Link ──────────────────────────────────────────────────────────

  async createTelegramLinkToken(userId: string): Promise<{ token: string; deepLink: string }> {
    // Invalidate previous unused tokens for this user
    await this.prisma.telegramLinkToken.deleteMany({ where: { userId, usedAt: null } });

    const token = randomBytes(20).toString('hex');
    await this.prisma.telegramLinkToken.create({
      data: { userId, token, expiresAt: new Date(Date.now() + LINK_TTL_MS) },
    });

    const botUsername = process.env.TELEGRAM_CREATOR_BOT_USERNAME ?? 'FluxFormsCreatorBot';
    return { token, deepLink: `https://t.me/${botUsername}?start=link_${token}` };
  }

  async consumeTelegramLinkToken(
    token: string,
    telegramId: string,
    profile?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<boolean> {
    const record = await this.prisma.telegramLinkToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.usedAt || new Date() > record.expiresAt) return false;

    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing && existing.id !== record.userId) {
      if (existing.emailVerified && existing.email) return false;
      await this.prisma.user.update({ where: { id: existing.id }, data: { telegramId: null } });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          telegramId,
          ...(profile?.username   && { username:  profile.username }),
          ...(profile?.firstName  && { firstName: profile.firstName }),
          ...(profile?.lastName   && { lastName:  profile.lastName }),
        },
      }),
      this.prisma.telegramLinkToken.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);

    return true;
  }

  async getTelegramLinkStatus(userId: string): Promise<{ linked: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
    return { linked: !!user?.telegramId };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, telegramId: true, firstName: true, username: true },
    });
    return {
      hasEmail: !!(user?.emailVerified && user?.email),
      telegramLinked: !!user?.telegramId,
      email: user?.email ?? null,
      displayName: user?.firstName ?? user?.username ?? null,
    };
  }
}
