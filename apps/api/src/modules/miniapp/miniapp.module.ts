import { Module } from '@nestjs/common';
import { MiniAppService } from './miniapp.service';
import { MiniAppController } from './miniapp.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [MiniAppService],
  controllers: [MiniAppController],
})
export class MiniAppModule {}
