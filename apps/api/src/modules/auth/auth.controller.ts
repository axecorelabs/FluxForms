import {
  Controller, Post, Get, Body, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface JwtRequest extends Request {
  user: { id: string; role: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('email/request')
  async requestOtp(@Body() body: { email?: string }) {
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw new BadRequestException('A valid email address is required.');
    }
    await this.authService.requestOtp(body.email);
    return { message: 'Code sent. Check your inbox.' };
  }

  @Post('email/verify')
  async verifyOtp(@Body() body: { email?: string; code?: string }) {
    if (!body.email || !body.code) {
      throw new BadRequestException('email and code are required.');
    }
    return this.authService.verifyOtp(body.email, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: JwtRequest) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/add')
  async requestEmailAdd(@Req() req: JwtRequest, @Body() body: { email?: string }) {
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw new BadRequestException('A valid email address is required.');
    }
    await this.authService.requestEmailAdd(req.user.id, body.email);
    return { message: 'Code sent. Check your inbox.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('email/add/verify')
  async verifyEmailAdd(@Req() req: JwtRequest, @Body() body: { email?: string; code?: string }) {
    if (!body.email || !body.code) {
      throw new BadRequestException('email and code are required.');
    }
    await this.authService.verifyEmailAdd(req.user.id, body.email, body.code);
    return { message: 'Email verified successfully.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('telegram/link-request')
  async requestTelegramLink(@Req() req: JwtRequest) {
    return this.authService.createTelegramLinkToken(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('telegram/link-status')
  async telegramLinkStatus(@Req() req: JwtRequest) {
    return this.authService.getTelegramLinkStatus(req.user.id);
  }
}
