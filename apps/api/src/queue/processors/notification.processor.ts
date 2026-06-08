import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InlineKeyboard } from 'grammy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../modules/auth/auth.service';
import { FormService } from '../../modules/form/form.service';
import { EmailService } from '../../modules/email/email.service';
import { CreatorBotService } from '../../modules/bot/creator-bot.service';
import {
  QUEUES,
  NotificationJobData,
  NotifyInterviewDoneData,
  NotifyPaymentSuccessData,
  NotifyFormSubmittedData,
} from '../queue.constants';

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

@Processor(QUEUES.NOTIFICATIONS, { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly formService: FormService,
    private readonly emailService: EmailService,
    private readonly creatorBot: CreatorBotService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { type, payload } = job.data;

    if (type === 'interview.completed') {
      await this.handleInterviewCompleted(payload as NotifyInterviewDoneData);
    } else if (type === 'payment.success') {
      await this.handlePaymentSuccess(payload as NotifyPaymentSuccessData);
    } else if (type === 'form.submitted') {
      await this.handleFormSubmitted(payload as NotifyFormSubmittedData);
    }
  }

  private async handleInterviewCompleted(p: NotifyInterviewDoneData): Promise<void> {
    const creator = await this.auth.findById(p.creatorId);
    if (!creator) return;

    await this.creatorBot.sendRawMessage(
      parseInt(creator.telegramId),
      `✅ *New interview completed\\!*\n\n📋 *${esc(p.interviewTitle)}*\n\nView the extracted profile in your dashboard\\.\n/dashboard`,
      { parse_mode: 'MarkdownV2' },
    );

    if (creator.emailVerified && creator.email) {
      const dashboardUrl = `${process.env.DASHBOARD_URL ?? 'https://dashboard.fluxforms.io'}/interviews/${p.interviewId}`;
      await this.emailService.sendInterviewCompleted(
        creator.email,
        creator.firstName ?? undefined,
        p.interviewTitle,
        `User ${p.userTelegramId}`,
        0,
        [],
        dashboardUrl,
      ).catch((err) => this.logger.error(`Interview email failed: ${err}`));
    }

    this.logger.log(`Interview completed notification → creator ${p.creatorId}`);
  }

  private async handlePaymentSuccess(p: NotifyPaymentSuccessData): Promise<void> {
    const form = await this.formService.findById(p.formId);
    const shareLink =
      (form.shareLink as string | null) ??
      `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=${form.shareToken as string}`;

    const miniAppUrl = process.env.MINI_APP_URL ?? 'https://app.fluxforms.io';
    const keyboard = new InlineKeyboard()
      .webApp('📊 View Responses', `${miniAppUrl}/responses?formId=${p.formId}`).row()
      .text('🔒 Close Form', `form:close:${p.formId}`).row()
      .text('📤 Share Link', `form:share:${p.formId}`);

    await this.creatorBot.sendRawMessage(
      parseInt(p.creatorTelegramId),
      `✅ *Payment received\\! Your form is now LIVE\\.*\n\n📄 *${esc(form.title)}*\n\n📤 Share this link with respondents:\n${shareLink}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
    this.logger.log(`Payment success notification → form ${p.formId}`);
  }

  private async handleFormSubmitted(p: NotifyFormSubmittedData): Promise<void> {
    const creator = await this.auth.findById(p.creatorId);
    if (!creator) return;

    const form = await this.formService.findById(p.formId);
    const totalResponses = await this.prisma.response.count({ where: { formId: p.formId } });

    await this.creatorBot.sendRawMessage(
      parseInt(creator.telegramId),
      `📬 *New response received\\!*\n\n📄 *${esc(form.title)}*\n\nResponse \\#${totalResponses} is in\\. Open your dashboard to view it\\.`,
      { parse_mode: 'MarkdownV2' },
    );

    if (creator.emailVerified && creator.email) {
      const response = await this.prisma.response.findUnique({ where: { id: p.responseId } });
      if (response) {
        const answers = form.questions.map((q) => ({
          question: q.text,
          answer: String((response.answers as Record<string, unknown>)[q.id] ?? '—'),
        }));
        await this.emailService.sendResponseNotification(
          creator.email,
          creator.firstName ?? undefined,
          form.title,
          totalResponses,
          answers,
        ).catch((err) => this.logger.error(`Response notification email failed: ${err}`));
      }
    }

    this.logger.log(`Form submitted notification → creator ${p.creatorId}, form ${p.formId}`);
  }
}
