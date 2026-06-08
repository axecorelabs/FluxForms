import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { MiniAppService } from './miniapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';

@Controller('miniapp')
export class MiniAppController {
  constructor(private readonly miniAppService: MiniAppService) {}

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
}
