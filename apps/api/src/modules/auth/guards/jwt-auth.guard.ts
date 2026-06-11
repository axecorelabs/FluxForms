import { Injectable, UnauthorizedException, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS } from '../../../redis/redis.module';

const USER_EXISTS_TTL_S = 60;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing auth token');

    let payload: { sub: string; role: string };
    try {
      payload = this.jwtService.verify(token) as { sub: string; role: string };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const cacheKey = `user_exists:${payload.sub}`;
    const cached = await this.redis.get(cacheKey);

    if (!cached) {
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
      if (!user) throw new UnauthorizedException('Account not found — please sign in again');
      await this.redis.set(cacheKey, '1', 'EX', USER_EXISTS_TTL_S);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).user = { id: payload.sub, role: payload.role };
    return true;
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}
