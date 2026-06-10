import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { FormService } from './form.service';
import { QuestionService } from '../question/question.service';
import { ResponseService } from '../response/response.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';

@Controller('forms')
@UseGuards(JwtAuthGuard)
export class FormController {
  constructor(
    private readonly formService: FormService,
    private readonly questionService: QuestionService,
    private readonly responseService: ResponseService,
  ) {}

  @Get('stats')
  getStats(@UserId() userId: string) {
    return this.formService.getOverviewStats(userId);
  }

  @Get('overview')
  getOverview(@UserId() userId: string) {
    return this.formService.getOverview(userId);
  }

  @Get()
  findAll(@UserId() userId: string, @Query('page') page = '1') {
    return this.formService.findByCreator(userId, parseInt(page, 10));
  }

  @Post()
  create(@UserId() userId: string, @Body() body: { title: string; description?: string }) {
    return this.formService.create(userId, body.title, body.description);
  }

  @Get(':id')
  async findOne(@UserId() userId: string, @Param('id') id: string) {
    const form = await this.formService.findById(id);
    if (form.creatorId !== userId) throw new ForbiddenException();
    return form;
  }

  @Post(':id/questions')
  async addQuestion(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: { text: string; type: QuestionType; options?: string[] },
  ) {
    return this.questionService.addQuestion(id, userId, body.text, body.type, body.options);
  }

  @Delete(':id/questions/:questionId')
  async deleteQuestion(
    @UserId() userId: string,
    @Param('questionId') questionId: string,
  ) {
    return this.questionService.deleteQuestion(questionId, userId);
  }

  @Post(':id/activate')
  async activate(@UserId() userId: string, @Param('id') id: string) {
    return this.formService.transition(id, userId, 'ACTIVE');
  }

  @Post(':id/close')
  async close(@UserId() userId: string, @Param('id') id: string) {
    return this.formService.transition(id, userId, 'CLOSED');
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
