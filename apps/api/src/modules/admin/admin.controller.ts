import {
  Controller, Get, Post, Patch, Query, Param, Body,
  UseGuards, ParseIntPipe, DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SubscriptionPlan } from '@prisma/client';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Stats ────────────────────────────────────────────────────────────────────

  @Get('stats')
  getStats() { return this.adminService.getStats(); }

  // ─── Users ────────────────────────────────────────────────────────────────────

  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.adminService.getUsers(page, limit); }

  @Patch('users/:id/plan')
  setUserPlan(
    @Param('id') id: string,
    @Body('plan') plan: SubscriptionPlan,
  ) { return this.adminService.setUserPlan(id, plan); }

  // ─── Forms ────────────────────────────────────────────────────────────────────

  @Get('forms')
  getForms(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.adminService.getForms(page, limit); }

  // ─── Interviews ───────────────────────────────────────────────────────────────

  @Get('interviews')
  getInterviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.adminService.getInterviews(page, limit); }

  // ─── Payments ────────────────────────────────────────────────────────────────

  @Get('payments')
  getPayments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.adminService.getPayments(page, limit); }

  // ─── Queues ───────────────────────────────────────────────────────────────────

  @Get('queues')
  getQueueStats() { return this.adminService.getQueueStats(); }

  @Get('queues/:name/failed')
  getFailedJobs(
    @Param('name') name: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) { return this.adminService.getFailedJobs(name, limit); }

  @Post('queues/:name/retry')
  @HttpCode(200)
  retryFailedJobs(@Param('name') name: string) {
    return this.adminService.retryFailedJobs(name);
  }

  // ─── Telegram webhooks ────────────────────────────────────────────────────────

  @Get('webhooks/:bot')
  getWebhookInfo(@Param('bot') bot: 'creator' | 'filler') {
    return this.adminService.getWebhookInfo(bot);
  }

  @Post('webhooks/:bot/register')
  @HttpCode(200)
  registerWebhook(
    @Param('bot') bot: 'creator' | 'filler',
    @Body('apiBaseUrl') apiBaseUrl: string,
  ) { return this.adminService.registerWebhook(bot, apiBaseUrl); }
}
