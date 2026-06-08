import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackProvider } from './providers/paystack.provider';
import { assertFormTransition } from '@fluxforms/state-machine';
import { signMiniAppParams, generateShareToken, buildShareLink } from '@fluxforms/utils';
import { QUEUES, JOBS, NotificationJobData } from '../../queue/queue.constants';

const FORM_PRICE_KOBO = 100_000;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackProvider,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationQueue: Queue<NotificationJobData>,
  ) {}

  async initPayment(
    formId: string,
    creatorTelegramId: string,
  ): Promise<{ miniAppUrl: string; reference: string }> {
    const existing = await this.prisma.payment.findUnique({ where: { formId } });
    if (existing?.status === 'SUCCESS') {
      throw new ConflictException('This form has already been paid for.');
    }

    const user = await this.prisma.user.findUnique({ where: { telegramId: creatorTelegramId } });
    if (!user) throw new NotFoundException('User not found');

    const form = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException('Form not found');

    if (form.status === 'DRAFT') {
      assertFormTransition('DRAFT', 'PAYMENT_PENDING');
      await this.prisma.form.update({
        where: { id: formId },
        data: { status: 'PAYMENT_PENDING' },
      });
    }

    const reference = `ff_${formId.slice(-8)}_${Date.now()}`;

    await this.prisma.payment.upsert({
      where: { formId },
      create: {
        formId,
        creatorId: user.id,
        amount: FORM_PRICE_KOBO,
        currency: 'NGN',
        status: 'PENDING',
        reference,
        provider: 'PAYSTACK',
      },
      update: { reference, status: 'PENDING', provider: 'PAYSTACK' },
    });

    const params = { reference, formId, amount: String(FORM_PRICE_KOBO) };
    const sig = signMiniAppParams(params, process.env.MINI_APP_SIGNING_SECRET!);
    const miniAppUrl = `${process.env.MINI_APP_URL}/pay?reference=${reference}&formId=${formId}&amount=${FORM_PRICE_KOBO}&sig=${sig}`;

    return { miniAppUrl, reference };
  }

  async handlePaystackWebhook(rawBody: string, signature: string): Promise<void> {
    this.paystack.verifySignature(rawBody, signature);

    const payload = JSON.parse(rawBody) as { event: string; data?: { reference?: string; id?: unknown } };
    if (payload.event !== 'charge.success') return;

    const reference = payload.data?.reference;
    if (!reference || !reference.startsWith('ff_')) return;

    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { creator: true },
    });
    if (!payment) return;
    if (payment.status === 'SUCCESS') return;

    const shareToken = generateShareToken();
    const shareLink = buildShareLink(process.env.TELEGRAM_FILLER_BOT_USERNAME!, shareToken);

    assertFormTransition('PAYMENT_PENDING', 'ACTIVE');

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { reference },
        data: {
          status: 'SUCCESS',
          paidAt: new Date(),
          providerRef: String(payload.data?.id ?? ''),
        },
      }),
      this.prisma.form.update({
        where: { id: payment.formId },
        data: { status: 'ACTIVE', shareToken, shareLink },
      }),
    ]);

    await this.notificationQueue.add(
      JOBS.NOTIFY_PAYMENT_SUCCESS,
      {
        type: 'payment.success',
        payload: {
          formId: payment.formId,
          creatorTelegramId: payment.creator.telegramId,
        },
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
      },
    );

    this.logger.log(`Payment confirmed — form ${payment.formId} is now ACTIVE`);
  }
}
