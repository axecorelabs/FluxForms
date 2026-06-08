import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';

export interface PaystackInitParams {
  email: string;
  amount: number;
  reference: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PaystackProvider {
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly baseUrl = 'https://api.paystack.co';

  async initializeTransaction(params: PaystackInitParams): Promise<string> {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        params,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return data.data.authorization_url as string;
    } catch (err) {
      this.logger.error('Paystack init failed', err);
      throw new InternalServerErrorException('Payment initialization failed');
    }
  }

  verifySignature(rawBody: string, signature: string): void {
    const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }
  }
}
