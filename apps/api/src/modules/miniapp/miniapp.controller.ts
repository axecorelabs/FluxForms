import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { MiniAppService } from './miniapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { JwtService } from '@nestjs/jwt';

@Controller('miniapp')
export class MiniAppController {
  constructor(
    private readonly miniAppService: MiniAppService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('auth')
  async auth(@Body('initData') initData: string) {
    if (!initData) throw new BadRequestException('initData is required');
    return this.miniAppService.authenticate(initData);
  }

  @Get('forms/:id/responses')
  @UseGuards(JwtAuthGuard)
  getResponses(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query('page') page = '1',
  ) {
    return this.miniAppService.getFormWithResponses(id, userId, parseInt(page, 10));
  }

  @Get('forms/:id/responses.csv')
  async downloadCsv(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) throw new BadRequestException('token is required');

    let creatorId: string;
    try {
      const payload = this.jwtService.verify(token) as { sub: string };
      creatorId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const data = await this.miniAppService.getFormWithResponses(id, creatorId, 1, 10_000);
    const questions = data.form.questions as Array<{ id: string; text: string }>;
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const header = ['Submitted At', ...questions.map(q => escape(q.text))].join(',');
    const rows = (data.responses as Array<{ submittedAt: Date | null; answers: Record<string, unknown> }>).map(r => {
      const date = r.submittedAt ? new Date(r.submittedAt).toISOString() : '';
      const values = questions.map(q => escape(String(r.answers[q.id] ?? '')));
      return [escape(date), ...values].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const filename = `${data.form.title.replace(/[^a-z0-9]/gi, '_')}_responses.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(csv);
  }
}
