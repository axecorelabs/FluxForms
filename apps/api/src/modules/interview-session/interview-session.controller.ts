import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { InterviewSessionService } from './interview-session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class InterviewSessionController {
  constructor(private readonly sessionService: InterviewSessionService) {}

  @Get('interviews/:id/sessions')
  getSessions(@Param('id') interviewId: string, @UserId() userId: string) {
    return this.sessionService.getSessionsForInterview(interviewId, userId);
  }

  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string, @UserId() userId: string) {
    return this.sessionService.getSessionWithProfile(sessionId, userId);
  }

  @Post('sessions/:sessionId/regenerate-summary')
  regenerateSummary(@Param('sessionId') sessionId: string, @UserId() userId: string) {
    return this.sessionService.regenerateSummary(sessionId, userId);
  }

  @Post('sessions/:sessionId/rerun-extraction')
  rerunExtraction(@Param('sessionId') sessionId: string, @UserId() userId: string) {
    return this.sessionService.rerunExtraction(sessionId, userId);
  }
}
