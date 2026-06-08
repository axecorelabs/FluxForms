import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { SessionService } from '../session/session.service';
import { FormService } from '../form/form.service';
import { BotStateService } from '../bot-state/bot-state.service';
import { AuthService } from '../auth/auth.service';
import { InterviewService } from '../interview/interview.service';
import { InterviewSessionService } from '../interview-session/interview-session.service';
import { SessionSnapshot } from '@fluxforms/shared-types';
import { truncate } from '@fluxforms/utils';

type BotCtx = Record<string, unknown>;

@Injectable()
export class FillerBotService implements OnModuleInit {
  private readonly logger = new Logger(FillerBotService.name);
  private bot!: Bot;

  constructor(
    private readonly sessionService: SessionService,
    private readonly formService: FormService,
    private readonly botStateService: BotStateService,
    private readonly authService: AuthService,
    private readonly interviewService: InterviewService,
    private readonly interviewSessionService: InterviewSessionService,
  ) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_FILLER_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_FILLER_BOT_TOKEN not set — filler bot disabled');
      return;
    }

    this.bot = new Bot(token);

    this.bot.command('start', ctx => this.onStart(ctx));
    this.bot.command('back', ctx => this.onBack(ctx));
    this.bot.command('cancel', ctx => this.onCancel(ctx));
    this.bot.on('callback_query:data', ctx => this.onCallback(ctx));
    this.bot.on('message:text', ctx => this.onText(ctx));

    this.bot.catch(err => this.logger.error('Filler bot error', err));

    await this.bot.init();
    this.logger.log('Filler bot initialized (webhook mode)');
  }

  async handleUpdate(update: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.bot.handleUpdate(update as any);
  }

  // ─── Commands ────────────────────────────────────────────────────────────────

  private async onStart(ctx: Context) {
    await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const param = (ctx.match as string)?.trim() ?? '';

    if (!param) {
      return ctx.reply(
        `👋 *Welcome to FluxForms\\!*\n\nYou fill in forms shared with you via a link\\. Ask the creator to send you a link\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    }

    // Route: interview_<token> → AI interview, everything else → standard form
    if (param.startsWith('interview_')) {
      return this.startInterview(ctx, param.slice(10));
    }

    return this.startForm(ctx, param);
  }

  private async onBack(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;

    // Interview mode has no "back"
    if (ctxData.mode === 'INTERVIEW') {
      return ctx.reply('_Cannot go back in an AI interview\\._', { parse_mode: 'MarkdownV2' });
    }

    if (!ctxData.sessionId) {
      return ctx.reply('No active session\\. Open a form link to start\\.', { parse_mode: 'MarkdownV2' });
    }

    try {
      const snapshot = await this.sessionService.goBack(ctxData.sessionId as string, tid(ctx));
      const form = await this.formService.findById(snapshot.formId);

      if (snapshot.state === 'ACTIVE') {
        const question = form.questions[snapshot.currentIndex];
        const existingAnswer = (snapshot.answers as Record<string, string>)[question.id];
        const prev = existingAnswer ? `\n_Previous answer: ${esc(existingAnswer)}_` : '';
        await ctx.reply(`↩️ Going back\\.\\.\\.\n\n${prev}`, { parse_mode: 'MarkdownV2' });
        return this.askQuestion(ctx, form.title, question, snapshot.currentIndex, form.questions.length);
      }
    } catch (err: any) {
      return ctx.reply(esc(err?.message ?? 'Could not go back\\.'), { parse_mode: 'MarkdownV2' });
    }
  }

  private async onCancel(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;

    if (ctxData.mode === 'INTERVIEW' && ctxData.sessionId) {
      await this.interviewSessionService.interruptSession(
        ctxData.sessionId as string,
        tid(ctx),
      );
    }

    await this.botStateService.clearState(tid(ctx), 'FILLER');
    await ctx.reply('✗ Cancelled\\.', { parse_mode: 'MarkdownV2' });
  }

  // ─── Callback router ─────────────────────────────────────────────────────────

  private async onCallback(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const data = ctx.callbackQuery?.data ?? '';

    if (data === 'review:submit')         return this.doSubmit(ctx);
    if (data === 'review:back')           return this.onBack(ctx);
    if (data === 'restart')               return this.onStart(ctx);
    if (data.startsWith('answer:yn:'))    return this.onYesNoSelected(ctx, data.slice(10));
    if (data.startsWith('answer:mc:'))    return this.onMultipleChoiceSelected(ctx, data.slice(10));
    if (data === 'noop')                  return;
  }

  // ─── Message handler ─────────────────────────────────────────────────────────

  private async onText(ctx: Context) {
    if (ctx.message?.text?.startsWith('/')) return;

    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;

    if (!ctxData.sessionId) {
      return ctx.reply('Open a form link to get started\\.', { parse_mode: 'MarkdownV2' });
    }

    // Interview conversation mode
    if (ctxData.mode === 'INTERVIEW') {
      return this.handleInterviewMessage(ctx, ctxData);
    }

    // Standard form answering mode
    if (state?.conversationStep !== 'ANSWERING') {
      return ctx.reply('Please use the buttons to continue\\.', { parse_mode: 'MarkdownV2' });
    }

    const text = ctx.message?.text?.trim() ?? '';
    return this.submitAnswer(ctx, ctxData, text);
  }

  // ─── Standard form flow ───────────────────────────────────────────────────────

  private async startForm(ctx: Context, shareToken: string) {
    try {
      const snapshot = await this.sessionService.startOrResume(shareToken, tid(ctx));
      await this.botStateService.setState(tid(ctx), 'FILLER', 'ANSWERING', {
        sessionId: snapshot.id,
        formId: snapshot.formId,
        shareToken,
      });

      if (snapshot.state === 'REVIEW') {
        return this.showReviewScreen(ctx, snapshot);
      }

      const form = await this.formService.findById(snapshot.formId);
      const question = form.questions[snapshot.currentIndex];
      await ctx.reply(
        `📄 *${esc(form.title)}*\n${form.questions.length} question${form.questions.length !== 1 ? 's' : ''} — type /back to undo, /cancel to quit\\.`,
        { parse_mode: 'MarkdownV2' },
      );
      return this.askQuestion(ctx, form.title, question, snapshot.currentIndex, form.questions.length);
    } catch (err: any) {
      return this.handleSessionError(ctx, err);
    }
  }

  private async onYesNoSelected(ctx: Context, value: string) {
    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.sessionId) return ctx.reply('Session not found\\. Please open the form link again\\.', { parse_mode: 'MarkdownV2' });
    await this.submitAnswer(ctx, ctxData, value, true);
  }

  private async onMultipleChoiceSelected(ctx: Context, value: string) {
    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.sessionId) return ctx.reply('Session not found\\. Please open the form link again\\.', { parse_mode: 'MarkdownV2' });
    await this.submitAnswer(ctx, ctxData, value, true);
  }

  private async submitAnswer(ctx: Context, ctxData: BotCtx, value: string, fromButton = false) {
    try {
      const { next, snapshot } = await this.sessionService.submitAnswer(
        ctxData.sessionId as string,
        tid(ctx),
        value,
      );

      if (fromButton) {
        await ctx.editMessageText(`✅ ${esc(value)}`, { parse_mode: 'MarkdownV2' }).catch(() => undefined);
      }

      if (next === 'REVIEW') {
        await this.botStateService.setState(tid(ctx), 'FILLER', 'REVIEWING', ctxData);
        return this.showReviewScreen(ctx, snapshot);
      }

      const form = await this.formService.findById(snapshot.formId);
      const question = form.questions[snapshot.currentIndex];
      return this.askQuestion(ctx, form.title, question, snapshot.currentIndex, form.questions.length);
    } catch (err: any) {
      return this.handleSessionError(ctx, err);
    }
  }

  private async askQuestion(
    ctx: Context,
    _formTitle: string,
    question: { id: string; text: string; type: string; options: unknown },
    index: number,
    total: number,
  ) {
    const progressBar = buildProgress(index + 1, total);
    const header = `${progressBar}\nQ${index + 1}/${total}\n\n*${esc(question.text)}*`;

    if (question.type === 'YES_NO') {
      const keyboard = new InlineKeyboard()
        .text('Yes', 'answer:yn:Yes')
        .text('No', 'answer:yn:No');
      return ctx.reply(header, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }

    if (question.type === 'MULTIPLE_CHOICE') {
      const options = (question.options as string[]) ?? [];
      const keyboard = new InlineKeyboard();
      options.forEach((opt, i) => {
        keyboard.text(opt, `answer:mc:${opt}`);
        if (i % 2 === 1) keyboard.row();
      });
      return ctx.reply(header, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }

    const hint: Record<string, string> = {
      TEXT: '_Type your answer below_',
      NUMBER: '_Type a number_',
      EMAIL: '_Type your email address_',
    };

    return ctx.reply(`${header}\n\n${hint[question.type] ?? ''}`, { parse_mode: 'MarkdownV2' });
  }

  private async showReviewScreen(ctx: Context, snapshot: SessionSnapshot) {
    try {
      const form = await this.formService.findById(snapshot.formId);
      const answers = snapshot.answers as Record<string, string>;

      const lines = form.questions
        .map((q, i) => `${i + 1}\\. *${esc(truncate(q.text, 50))}*\n    ${esc(answers[q.id] ?? '—')}`)
        .join('\n\n');

      const keyboard = new InlineKeyboard()
        .text('✅ Submit', 'review:submit').row()
        .text('↩️ Edit Last Answer', 'review:back');

      return ctx.reply(
        `📋 *Review Your Answers*\n${esc(form.title)}\n${'─'.repeat(20)}\n\n${lines}\n\n_Check your answers before submitting\\._`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch (err) {
      this.logger.error('showReviewScreen error', err);
    }
  }

  private async doSubmit(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const state = await this.botStateService.getState(tid(ctx), 'FILLER');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.sessionId) return ctx.reply('Session not found\\.', { parse_mode: 'MarkdownV2' });

    try {
      await this.sessionService.submitFinal(ctxData.sessionId as string, tid(ctx));
      await this.botStateService.clearState(tid(ctx), 'FILLER');
      await ctx.editMessageText(
        '✅ *Response submitted\\!*\n\nThank you for filling this form\\. Your answers have been recorded\\.',
        { parse_mode: 'MarkdownV2' },
      ).catch(() =>
        ctx.reply('✅ *Response submitted\\! Thank you\\.', { parse_mode: 'MarkdownV2' })
      );
    } catch (err: any) {
      return this.handleSessionError(ctx, err);
    }
  }

  // ─── AI interview flow ────────────────────────────────────────────────────────

  private async startInterview(ctx: Context, shareToken: string) {
    try {
      const interview = await this.interviewService.findByShareToken(shareToken);

      if (interview.status !== 'ACTIVE') {
        return ctx.reply(
          interview.status === 'CLOSED'
            ? '🔒 This interview is no longer accepting responses\\.'
            : '⚠️ This interview is not currently available\\.',
          { parse_mode: 'MarkdownV2' },
        );
      }

      const { sessionId, openingMessage } = await this.interviewSessionService.startSession(
        interview.id,
        tid(ctx),
      );

      await this.botStateService.setState(tid(ctx), 'FILLER', 'INTERVIEW_ACTIVE', {
        mode: 'INTERVIEW',
        sessionId,
        interviewId: interview.id,
        interviewTitle: interview.title,
      });

      await ctx.reply(
        `🤖 *${esc(interview.title)}*\n\n_Type /cancel at any time to stop\\._`,
        { parse_mode: 'MarkdownV2' },
      );

      // Send opening message from AI (pre-generated on activation, no LLM call here)
      if (openingMessage) {
        await ctx.reply(openingMessage);
      }
    } catch (err: any) {
      if (err?.message?.includes('already completed')) {
        return ctx.reply('✅ You have already completed this interview\\. Thank you\\!', { parse_mode: 'MarkdownV2' });
      }
      this.logger.error('startInterview error', err);
      return ctx.reply('⚠️ Could not start the interview\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleInterviewMessage(ctx: Context, ctxData: BotCtx) {
    const userMessage = ctx.message?.text?.trim() ?? '';
    if (!userMessage) return;

    const sessionId = ctxData.sessionId as string;

    // Show typing indicator while AI processes
    await ctx.replyWithChatAction('typing').catch(() => undefined);

    try {
      const { aiReply, isComplete } = await this.interviewSessionService.sendMessage(
        sessionId,
        userMessage,
      );

      await ctx.reply(aiReply);

      if (isComplete) {
        await this.botStateService.clearState(tid(ctx), 'FILLER');
        await ctx.reply(
          `✅ *Interview complete\\!*\n\nThank you for your time, ${esc(ctx.from?.first_name ?? 'there')}\\. Your responses have been recorded\\.`,
          { parse_mode: 'MarkdownV2' },
        );
      }
    } catch (err: any) {
      if (err?.message?.includes('no longer active')) {
        await this.botStateService.clearState(tid(ctx), 'FILLER');
        return ctx.reply('This interview session has ended\\.', { parse_mode: 'MarkdownV2' });
      }

      if (err?.status === 503 || err?.message?.includes('temporarily unavailable')) {
        return ctx.reply('⚠️ AI is temporarily unavailable\\. Please try again in a moment\\.', { parse_mode: 'MarkdownV2' });
      }

      this.logger.error('handleInterviewMessage error', err);
      return ctx.reply('⚠️ Something went wrong\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Error handler ────────────────────────────────────────────────────────────

  private async handleSessionError(ctx: Context, err: any) {
    const status = err?.status ?? err?.response?.statusCode;
    const message = err?.message ?? '';

    if (status === 409 || message.includes('already submitted')) {
      return ctx.reply('✅ You have already submitted a response to this form\\.', { parse_mode: 'MarkdownV2' });
    }

    if (status === 400 && message.includes('not accepting')) {
      await this.botStateService.clearState(tid(ctx), 'FILLER');
      return ctx.reply('⚠️ This form is no longer accepting responses\\.', { parse_mode: 'MarkdownV2' });
    }

    if (status === 410 || message.includes('been closed')) {
      await this.botStateService.clearState(tid(ctx), 'FILLER');
      return ctx.reply('🔒 This form has been closed\\. Your progress has been saved\\.', { parse_mode: 'MarkdownV2' });
    }

    if (status === 422) {
      return ctx.reply(`⚠️ Invalid answer: ${esc(message)}`, { parse_mode: 'MarkdownV2' });
    }

    if (status === 404) {
      await this.botStateService.clearState(tid(ctx), 'FILLER');
      return ctx.reply('⚠️ Form not found\\. The link may be invalid\\.', { parse_mode: 'MarkdownV2' });
    }

    this.logger.error('Unhandled session error', err);
    return ctx.reply('⚠️ Something went wrong\\. Please try again or contact the creator\\.', { parse_mode: 'MarkdownV2' });
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function tid(ctx: Context): string {
  return String(ctx.from?.id ?? '0');
}

function userData(ctx: Context) {
  return {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
  };
}

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function buildProgress(current: number, total: number): string {
  const filled = Math.round((current / total) * 8);
  const bar = '█'.repeat(filled) + '░'.repeat(8 - filled);
  return `\\[${bar}\\] ${current}/${total}`;
}
