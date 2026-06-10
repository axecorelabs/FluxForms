import { Module } from '@nestjs/common';
import { FormService } from './form.service';
import { FormController } from './form.controller';
import { ResponseModule } from '../response/response.module';
import { AuthModule } from '../auth/auth.module';
import { QuestionModule } from '../question/question.module';

@Module({
  imports: [ResponseModule, AuthModule, QuestionModule],
  providers: [FormService],
  controllers: [FormController],
  exports: [FormService],
})
export class FormModule {}
