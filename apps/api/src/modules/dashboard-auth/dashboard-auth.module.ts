import { Module } from '@nestjs/common';
import { DashboardAuthService } from './dashboard-auth.service';
import { DashboardAuthController } from './dashboard-auth.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [DashboardAuthService],
  controllers: [DashboardAuthController],
  exports: [DashboardAuthService],
})
export class DashboardAuthModule {}
