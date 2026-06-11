import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import type { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module';

const TOKEN_TTL_S     = 15 * 60;  // 15 minutes — magic link
const CHALLENGE_TTL_S =  5 * 60;  // 5 minutes  — QR login

// Lua script: atomically read + delete a challenge key only if it has a userId set.
// Returns the stored value (the userId) or nil if the key is missing/PENDING.
const CONSUME_CHALLENGE_SCRIPT = `
  local val = redis.call('GET', KEYS[1])
  if not val or val == 'PENDING' then return nil end
  redis.call('DEL', KEYS[1])
  return val
`;

@Injectable()
export class DashboardAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ── Magic link (bot → dashboard) ──────────────────────────────────────────

  async generateMagicLink(creatorId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const userKey = `dash_token_user:${creatorId}`;

    // Invalidate previous unused token for this creator
    const oldToken = await this.redis.get(userKey);
    if (oldToken) await this.redis.del(`dash_token:${oldToken}`);

    // Snapshot hasEmail at link-generation time so exchange needs no extra DB query
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      select: { email: true, emailVerified: true },
    });
    const hasEmail = !!(creator?.emailVerified && creator?.email);

    await this.redis.set(`dash_token:${token}`, JSON.stringify({ creatorId, hasEmail }), 'EX', TOKEN_TTL_S);
    await this.redis.set(userKey, token, 'EX', TOKEN_TTL_S);

    const baseUrl = process.env.DASHBOARD_URL ?? 'https://dashboard.fluxforms.io';
    return `${baseUrl}/auth/login?token=${token}`;
  }

  async exchangeToken(token: string): Promise<{ accessToken: string; hasEmail: boolean }> {
    // GETDEL atomically reads and removes — single-use guarantee
    const raw = await this.redis.getdel(`dash_token:${token}`);
    if (!raw) throw new UnauthorizedException('Invalid or expired token');

    const { creatorId, hasEmail } = JSON.parse(raw) as { creatorId: string; hasEmail: boolean };

    // Clean up user-pointer key (best-effort, token already consumed)
    await this.redis.del(`dash_token_user:${creatorId}`);

    const accessToken = this.jwt.sign(
      { sub: creatorId, role: 'CREATOR' },
      { expiresIn: '7d' },
    );

    return { accessToken, hasEmail };
  }

  // ── Telegram QR login challenge ────────────────────────────────────────────

  async createLoginChallenge(): Promise<{ token: string; deepLink: string }> {
    const token = randomBytes(32).toString('hex');
    await this.redis.set(`tg_challenge:${token}`, 'PENDING', 'EX', CHALLENGE_TTL_S);
    const botUsername = process.env.TELEGRAM_CREATOR_BOT_USERNAME ?? 'FluxFormsCreatorBot';
    return { token, deepLink: `https://t.me/${botUsername}?start=login_${token}` };
  }

  async consumeLoginChallenge(
    token: string,
    telegramId: string,
    profile?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<boolean> {
    const key = `tg_challenge:${token}`;

    // Lua: SET key userId KEEPTTL only if current value is 'PENDING'
    const SET_IF_PENDING = `
      local val = redis.call('GET', KEYS[1])
      if val ~= 'PENDING' then return 0 end
      local ttl = redis.call('TTL', KEYS[1])
      redis.call('SET', KEYS[1], ARGV[1])
      if ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
      return 1
    `;

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: profile?.username,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        role: 'CREATOR',
      },
      update: {
        ...(profile?.username  ? { username:  profile.username  } : {}),
        ...(profile?.firstName ? { firstName: profile.firstName } : {}),
        ...(profile?.lastName  ? { lastName:  profile.lastName  } : {}),
      },
    });

    const sub = await this.prisma.subscription.findUnique({ where: { creatorId: user.id } });
    if (!sub) {
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

    // Only claim the challenge if it's still PENDING (not expired, not already claimed)
    const claimed = await this.redis.eval(SET_IF_PENDING, 1, key, user.id) as number;
    return claimed === 1;
  }

  async pollLoginChallenge(token: string): Promise<{
    status: 'pending' | 'authenticated' | 'expired';
    accessToken?: string;
    hasEmail?: boolean;
  }> {
    const key = `tg_challenge:${token}`;
    const current = await this.redis.get(key);

    if (!current) return { status: 'expired' };
    if (current === 'PENDING') return { status: 'pending' };

    // Atomically consume: returns userId or nil if already consumed/expired
    const userId = await this.redis.eval(CONSUME_CHALLENGE_SCRIPT, 1, key) as string | null;
    if (!userId) return { status: 'expired' };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true, emailVerified: true },
    });
    if (!user) return { status: 'expired' };

    const accessToken = this.jwt.sign(
      { sub: userId, role: user.role },
      { expiresIn: '7d' },
    );

    return {
      status: 'authenticated',
      accessToken,
      hasEmail: !!(user.emailVerified && user.email),
    };
  }
}
