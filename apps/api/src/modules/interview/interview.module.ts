import { Module } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { InterviewController } from './interview.controller';
import { LlmModule } from '../llm/llm.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [LlmModule, AuthModule],
  providers: [InterviewService, JwtAuthGuard],
  controllers: [InterviewController],
  exports: [InterviewService],
})
export class InterviewModule {}
