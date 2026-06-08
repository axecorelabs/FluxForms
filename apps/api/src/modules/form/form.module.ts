import { Module } from '@nestjs/common';
import { FormService } from './form.service';

@Module({
  providers: [FormService],
  exports: [FormService],
})
export class FormModule {}
