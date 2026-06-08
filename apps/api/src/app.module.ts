import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminModule } from './modules/admin/admin.module';
import { FormModule } from './modules/form/form.module';
import { SessionModule } from './modules/session/session.module';
import { ResponseModule } from './modules/response/response.module';
import { LlmModule } from './modules/llm/llm.module';
import { InterviewModule } from './modules/interview/interview.module';
import { InterviewSessionModule } from './modules/interview-session/interview-session.module';
import { VectorSearchModule } from './modules/vector-search/vector-search.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { DashboardAuthModule } from './modules/dashboard-auth/dashboard-auth.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60_000, limit: 100 },
    ]),
    PrismaModule,
    AuthModule,
    WebhookModule,
    PaymentModule,
    AdminModule,
    FormModule,
    SessionModule,
    ResponseModule,
    LlmModule,
    InterviewModule,
    InterviewSessionModule,
    VectorSearchModule,
    SubscriptionModule,
    DashboardAuthModule,
  ],
})
export class AppModule {}
