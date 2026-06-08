import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { FormService } from './form.service';
import { ResponseService } from '../response/response.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';

@Controller('forms')
@UseGuards(JwtAuthGuard)
export class FormController {
  constructor(
    private readonly formService: FormService,
    private readonly responseService: ResponseService,
  ) {}

  @Get()
  findAll(@UserId() userId: string, @Query('page') page = '1') {
    return this.formService.findByCreator(userId, parseInt(page, 10));
  }

  @Get(':id')
  async findOne(@UserId() userId: string, @Param('id') id: string) {
    const form = await this.formService.findById(id);
    if (form.creatorId !== userId) throw new ForbiddenException();
    return form;
  }

  @Get(':id/responses')
  async getResponses(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query('page') page = '1',
  ) {
    const form = await this.formService.findById(id);
    if (form.creatorId !== userId) throw new ForbiddenException();
    return this.responseService.getResponsesForForm(id, parseInt(page, 10));
  }
}
