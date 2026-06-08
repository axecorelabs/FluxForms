import { Controller, Post, Get, Query, Headers, Req, HttpCode, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { verifyMiniAppParams } from '@fluxforms/utils';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('verify-params')
  verifyParams(
    @Query('reference') reference: string,
    @Query('formId') formId: string,
    @Query('amount') amount: string,
    @Query('sig') sig: string,
  ) {
    const valid = verifyMiniAppParams(
      { reference, formId, amount },
      sig,
      process.env.MINI_APP_SIGNING_SECRET!,
    );
    if (!valid) throw new BadRequestException('Invalid signature');
    return { ok: true };
  }

  @Post('webhook/paystack')
  @HttpCode(200)
  async paystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
  ) {
    // rawBody is populated by the raw body middleware configured in main.ts
    const rawBody = (req as Request & { rawBody: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
    await this.paymentService.handlePaystackWebhook(rawBody, signature);
    return { ok: true };
  }
}
