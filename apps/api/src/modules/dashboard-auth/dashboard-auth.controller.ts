import { Controller, Post, Get, Body, Param, BadRequestException } from '@nestjs/common';
import { DashboardAuthService } from './dashboard-auth.service';

@Controller('auth/dashboard')
export class DashboardAuthController {
  constructor(private readonly dashboardAuthService: DashboardAuthService) {}

  @Post('exchange')
  async exchange(@Body('token') token: string) {
    if (!token) throw new BadRequestException('token is required');
    return this.dashboardAuthService.exchangeToken(token);
  }

  @Post('telegram-challenge')
  createChallenge() {
    return this.dashboardAuthService.createLoginChallenge();
  }

  @Get('telegram-challenge/:token')
  pollChallenge(@Param('token') token: string) {
    return this.dashboardAuthService.pollLoginChallenge(token);
  }
}
