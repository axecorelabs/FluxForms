import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InlineKeyboard } from 'grammy';
import { AuthService } from '../../modules/auth/auth.service';
import { FormService } from '../../modules/form/form.service';
import { CreatorBotService } from '../../modules/bot/creator-bot.service';
import {
  QUEUES,
  NotificationJobData,
  NotifyInterviewDoneData,
  NotifyPaymentSuccessData,
} from '../queue.constants';

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

@Processor(QUEUES.NOTIFICATIONS, { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly auth: AuthService,
    private readonly formService: FormService,
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
    this.logger.log(`Interview completed notification → creator ${p.creatorId}`);
  }

  private async handlePaymentSuccess(p: NotifyPaymentSuccessData): Promise<void> {
    const form = await this.formService.findById(p.formId);
    const shareLink =
      (form.shareLink as string | null) ??
      `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=${form.shareToken as string}`;

    const keyboard = new InlineKeyboard()
      .text('📊 View Responses', `form:responses:${p.formId}`).row()
      .text('🔒 Close Form', `form:close:${p.formId}`).row()
      .text('📤 Share Link', `form:share:${p.formId}`);

    await this.creatorBot.sendRawMessage(
      parseInt(p.creatorTelegramId),
      `✅ *Payment received\\! Your form is now LIVE\\.*\n\n📄 *${esc(form.title)}*\n\n📤 Share this link with respondents:\n${shareLink}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
    this.logger.log(`Payment success notification → form ${p.formId}`);
  }
}
