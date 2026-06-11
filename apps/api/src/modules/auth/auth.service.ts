import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { REDIS } from '../../redis/redis.module';

interface TelegramUserData {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

const OTP_TTL_S     = 10 * 60;  // 10 minutes
const LINK_TTL_S    = 15 * 60;  // 15 minutes
const MAX_ATTEMPTS  = 5;

// Atomically verifies an OTP stored as a Redis Hash {hash, attempts}.
// Returns [status, extra]:
//   [-1, 0]  → key missing/expired
//   [-2, 0]  → locked (attempts >= max)
//   [ 1, 0]  → correct — key deleted
//   [ 0, N]  → wrong — N attempts remaining after this one
const CONSUME_OTP_SCRIPT = `
  local data = redis.call('HMGET', KEYS[1], 'hash', 'attempts')
  if data[1] == false then return {-1, 0} end
  local stored_hash = data[1]
  local attempts = tonumber(data[2]) or 0
  local max_attempts = tonumber(ARGV[2])
  if attempts >= max_attempts then return {-2, 0} end
  if ARGV[1] == stored_hash then
    redis.call('DEL', KEYS[1])
    return {1, 0}
  end
  local new_attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
  return {0, max_attempts - new_attempts}
`;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Inject(REDIS) private readonly redis: Redis,
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

    await this.issueOtp(email, user.firstName ?? undefined);
  }

  async verifyOtp(rawEmail: string, code: string): Promise<{ accessToken: string; telegramLinked: boolean }> {
    const email = rawEmail.toLowerCase().trim();
    await this.consumeOtp(email, code);

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
    await this.issueOtp(email, user?.firstName ?? undefined);
  }

  async verifyEmailAdd(userId: string, rawEmail: string, code: string): Promise<void> {
    const email = rawEmail.toLowerCase().trim();

    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== userId) {
      throw new BadRequestException('This email is already linked to another account.');
    }

    await this.consumeOtp(email, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerified: true },
    });
  }

  // ── Telegram Link ──────────────────────────────────────────────────────────

  async createTelegramLinkToken(userId: string): Promise<{ token: string; deepLink: string }> {
    const token = randomBytes(20).toString('hex');
    const userKey = `tg_link_user:${userId}`;

    // Invalidate any previous unused token for this user
    const oldToken = await this.redis.get(userKey);
    if (oldToken) await this.redis.del(`tg_link:${oldToken}`);

    await this.redis.set(`tg_link:${token}`, userId, 'EX', LINK_TTL_S);
    await this.redis.set(userKey, token, 'EX', LINK_TTL_S);

    const botUsername = process.env.TELEGRAM_CREATOR_BOT_USERNAME ?? 'FluxFormsCreatorBot';
    return { token, deepLink: `https://t.me/${botUsername}?start=link_${token}` };
  }

  async consumeTelegramLinkToken(
    token: string,
    telegramId: string,
    profile?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<boolean> {
    // GETDEL atomically reads and deletes — single-use guarantee (fix #4)
    const userId = await this.redis.getdel(`tg_link:${token}`);
    if (!userId) return false; // expired or already consumed

    // Clean up user-pointer key (token already consumed above)
    await this.redis.del(`tg_link_user:${userId}`);

    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing && existing.id !== userId) {
      if (existing.emailVerified && existing.email) return false;
      await this.prisma.user.update({ where: { id: existing.id }, data: { telegramId: null } });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramId,
        ...(profile?.username  ? { username:  profile.username  } : {}),
        ...(profile?.firstName ? { firstName: profile.firstName } : {}),
        ...(profile?.lastName  ? { lastName:  profile.lastName  } : {}),
      },
    });

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

  // ── Private helpers ────────────────────────────────────────────────────────

  private async issueOtp(email: string, firstName?: string): Promise<void> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = createHash('sha256').update(code).digest('hex');
    // MULTI/EXEC atomically sets both hash fields and the TTL
    await this.redis.multi()
      .hset(`otp:${email}`, 'hash', hash, 'attempts', '0')
      .expire(`otp:${email}`, OTP_TTL_S)
      .exec();
    await this.emailService.sendVerificationCode(email, code, firstName);
  }

  private async consumeOtp(email: string, code: string): Promise<void> {
    const inputHash = createHash('sha256').update(code.trim()).digest('hex');
    // Single atomic Lua call — no race between attempt-increment and verify-delete (fixes #2 & #3)
    const result = await this.redis.eval(
      CONSUME_OTP_SCRIPT, 1, `otp:${email}`, inputHash, String(MAX_ATTEMPTS),
    ) as [number, number];

    const [status, remaining] = result;

    if (status === -1) throw new BadRequestException('Code expired or not found. Request a new one.');
    if (status === -2) throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    if (status === 0) {
      const msg = remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
        : 'Incorrect code. No more attempts — request a new code.';
      throw new BadRequestException(msg);
    }
    // status === 1: correct, key deleted atomically
  }
}
