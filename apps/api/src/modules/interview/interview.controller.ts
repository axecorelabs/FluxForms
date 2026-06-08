import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InterviewService, CreateInterviewDto, UpdateInterviewDto, AddFieldDto } from './interview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';

@Controller('interviews')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post()
  create(@UserId() userId: string, @Body() dto: CreateInterviewDto) {
    return this.interviewService.create(userId, dto);
  }

  @Get()
  findAll(@UserId() userId: string) {
    return this.interviewService.findByCreator(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.interviewService.findById(id);
  }

  @Patch(':id')
  update(@UserId() userId: string, @Param('id') id: string, @Body() dto: UpdateInterviewDto) {
    return this.interviewService.update(id, userId, dto);
  }

  @Post(':id/fields')
  addField(@UserId() userId: string, @Param('id') id: string, @Body() dto: AddFieldDto) {
    return this.interviewService.addField(id, userId, dto);
  }

  @Delete(':id/fields/:fieldId')
  removeField(@UserId() userId: string, @Param('id') id: string, @Param('fieldId') fieldId: string) {
    return this.interviewService.removeField(id, fieldId, userId);
  }

  @Post(':id/activate')
  activate(@UserId() userId: string, @Param('id') id: string) {
    return this.interviewService.activate(id, userId);
  }

  @Post(':id/close')
  close(@UserId() userId: string, @Param('id') id: string) {
    return this.interviewService.close(id, userId);
  }

  @Get(':id/stats')
  getStats(@UserId() userId: string, @Param('id') id: string) {
    return this.interviewService.getStats(id, userId);
  }
}
