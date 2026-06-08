import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';

export interface FlutterwaveInitParams {
  email: string;
  amount: number;
  reference: string;
  currency: string;
  redirectUrl: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class FlutterwaveProvider {
  private readonly logger = new Logger(FlutterwaveProvider.name);
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  async initializeTransaction(params: FlutterwaveInitParams): Promise<string> {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/payments`,
        {
          tx_ref: params.reference,
          amount: params.amount / 100, // Flutterwave uses whole units
          currency: params.currency,
          redirect_url: params.redirectUrl,
          customer: { email: params.email },
          meta: params.meta,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return data.data.link as string;
    } catch (err) {
      this.logger.error('Flutterwave init failed', err);
      throw new InternalServerErrorException('Payment initialization failed');
    }
  }

  verifySignature(rawBody: string, signature: string): void {
    const hash = createHmac('sha256', process.env.FLUTTERWAVE_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      throw new UnauthorizedException('Invalid Flutterwave signature');
    }
  }
}
