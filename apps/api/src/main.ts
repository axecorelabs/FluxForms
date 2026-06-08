import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Capture raw body for Paystack HMAC verification
    rawBody: true,
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001,http://localhost:3002')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'x-admin-key'],
    credentials: true,
  });

  // Trust proxy headers (needed when behind Railway/Render load balancer)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}

bootstrap();
