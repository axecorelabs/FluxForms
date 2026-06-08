import { Controller, Post, Body, Headers, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('webhook')
  @HttpCode(200)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = (req.rawBody ?? Buffer.from(JSON.stringify(req.body))).toString('utf8');
    this.subscriptionService.verifyWebhookSignature(rawBody, signature);

    const payload = JSON.parse(rawBody) as { event: string; data: Record<string, unknown> };
    await this.subscriptionService.handlePaystackWebhook(payload.event, payload.data);

    return { received: true };
  }
}
