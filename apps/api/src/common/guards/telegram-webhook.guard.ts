import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!expectedToken) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    if (!secretToken || secretToken !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return true;
  }
}
