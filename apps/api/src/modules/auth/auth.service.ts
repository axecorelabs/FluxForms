import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

interface TelegramUserData {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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
}
