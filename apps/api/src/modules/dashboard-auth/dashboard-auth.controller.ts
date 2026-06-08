import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { DashboardAuthService } from './dashboard-auth.service';

@Controller('auth/dashboard')
export class DashboardAuthController {
  constructor(private readonly dashboardAuthService: DashboardAuthService) {}

  @Post('exchange')
  async exchange(@Body('token') token: string) {
    if (!token) throw new BadRequestException('token is required');
    return this.dashboardAuthService.exchangeToken(token);
  }
}
