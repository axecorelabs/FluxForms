import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { FormService } from '../form/form.service';
import { InterviewService } from '../interview/interview.service';
import { SubscriptionService, PLAN_LABELS, PLAN_PRICES_KOBO } from '../subscription/subscription.service';
import { BotStateService } from '../bot-state/bot-state.service';
import { AuthService } from '../auth/auth.service';
import { DashboardAuthService } from '../dashboard-auth/dashboard-auth.service';
import { EmailService } from '../email/email.service';
import { truncate } from '@fluxforms/utils';
import { CreatorFormFlow } from './creator-form.flow';
import { CreatorInterviewFlow } from './creator-interview.flow';
import { STEP, esc, tid, userData, send, doEdit } from './bot-shared';

@Injectable()
export class CreatorBotService implements OnModuleInit {
  private readonly logger = new Logger(CreatorBotService.name);
  private bot!: Bot;

  constructor(
    private readonly formService: FormService,
    private readonly interviewService: InterviewService,
    private readonly botStateService: BotStateService,
    private readonly authService: AuthService,
    private readonly dashboardAuthService: DashboardAuthService,
    private readonly subscriptionService: SubscriptionService,
    private readonly emailService: EmailService,
    private readonly formFlow: CreatorFormFlow,
    private readonly interviewFlow: CreatorInterviewFlow,
  ) {}

  async onModuleInit() {
    const token = process.env.TELEGRAM_CREATOR_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_CREATOR_BOT_TOKEN not set — creator bot disabled');
      return;
    }

    this.bot = new Bot(token);

    this.bot.command('start',           ctx => this.onStart(ctx));
    this.bot.command('commands',        ctx => this.onCommands(ctx));
    this.bot.command('createform',      ctx => this.formFlow.onCreateFormCommand(ctx));
    this.bot.command('myforms',         ctx => this.formFlow.onMyForms(ctx, 1));
    this.bot.command('drafts',          ctx => this.onDrafts(ctx));
    this.bot.command('cancel',          ctx => this.onCancel(ctx));
    this.bot.command('form',            ctx => this.formFlow.onFormCommand(ctx));
    this.bot.command('createinterview', ctx => this.interviewFlow.onCreateInterviewCommand(ctx));
    this.bot.command('myinterviews',    ctx => this.interviewFlow.onMyInterviews(ctx));
    this.bot.command('dashboard',       ctx => this.onDashboardCommand(ctx));
    this.bot.command('plan',            ctx => this.onPlanCommand(ctx));
    this.bot.command('addemail',        ctx => this.onAddEmailCommand(ctx));
    this.bot.on('callback_query:data', ctx => this.onCallback(ctx));
    this.bot.on('message:text', ctx => this.onText(ctx));

    this.bot.catch(err => this.logger.error('Bot error', err));

    await this.bot.init();
    this.logger.log('Creator bot initialized (webhook mode)');
  }

  async handleUpdate(update: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.bot.handleUpdate(update as any);
  }

  async sendRawMessage(chatId: number, text: string, extra: object = {}): Promise<void> {
    await this.bot.api.sendMessage(chatId, text, extra as Parameters<typeof this.bot.api.sendMessage>[2]);
  }

  // ─── Commands ────────────────────────────────────────────────────────────────

  private async onStart(ctx: Context) {
    // Handle Telegram account linking from dashboard QR code
    const payload = ctx.match as string | undefined;
    if (payload?.startsWith('link_')) {
      const token = payload.slice(5);
      const telegramId = ctx.from?.id?.toString();
      if (telegramId) {
        const ok = await this.authService.consumeTelegramLinkToken(token, telegramId, {
          username:  ctx.from?.username,
          firstName: ctx.from?.first_name,
          lastName:  ctx.from?.last_name,
        });
        if (ok) {
          await this.botStateService.clearState(tid(ctx), 'CREATOR');
          await ctx.reply('✅ Your Telegram account has been linked to your FluxForms dashboard. You\'re all set!');
        } else {
          await ctx.reply('This link has expired or already been used. Go to your dashboard Settings to generate a new one.');
        }
      }
      return;
    }

    if (payload?.startsWith('login_')) {
      const token = payload.slice(6);
      const telegramId = ctx.from?.id?.toString();
      if (telegramId) {
        const ok = await this.dashboardAuthService.consumeLoginChallenge(token, telegramId, {
          username:  ctx.from?.username,
          firstName: ctx.from?.first_name,
          lastName:  ctx.from?.last_name,
        });
        if (ok) {
          await ctx.reply("✅ You're signed in! Head back to the dashboard page to continue.");
        } else {
          await ctx.reply("This QR code has expired or already been used. Refresh the login page and try again.");
        }
      }
      return;
    }

    const user = await this.upsertUser(ctx);
    await ctx.reply(
      `👋 *Welcome to FluxForms\\!*\n\nCreate conversational forms and AI interviews your audience fills directly inside Telegram\\.\n\n*Forms*\n/createform – Build a new form\n/myforms – View your forms\n\n*AI Interviews*\n/createinterview – Build an AI interview\n/myinterviews – View your interviews\n\n*Drafts*\n/drafts – View all unsaved drafts\n\n*Account*\n/addemail – Add or update your email\n/plan – View your plan and usage\n/dashboard – Open your creator dashboard\n/cancel – Cancel current action`,
      { parse_mode: 'MarkdownV2' },
    );
    if (!user.emailVerified) {
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
      await ctx.reply(
        `📧 *One more thing — please verify your email*\n\nWe use it to send you response notifications and important account updates\\.\n\nReply with your email address to get started:`,
        { parse_mode: 'MarkdownV2' },
      );
    }
  }

  private async onCommands(ctx: Context) {
    await ctx.reply(
      `📋 *FluxForms Commands*\n\n` +
      `*📄 Forms*\n` +
      `/createform – Build a new form\n` +
      `/myforms – View and manage your forms\n\n` +
      `*🤖 AI Interviews*\n` +
      `/createinterview – Build a conversational AI interview\n` +
      `/myinterviews – View and manage your interviews\n\n` +
      `*📝 Drafts*\n` +
      `/drafts – View all your unfinished drafts\n\n` +
      `*💳 Account*\n` +
      `/addemail – Add or update your verified email\n` +
      `/plan – View your current plan and response usage\n` +
      `/dashboard – Get a login link to your creator dashboard\n\n` +
      `*🛠 Utility*\n` +
      `/cancel – Cancel whatever you're currently doing\n` +
      `/commands – Show this message`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onCancel(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const formId = (state?.context as any)?.formId as string | undefined;
    await this.botStateService.clearState(tid(ctx), 'CREATOR');

    if (formId) {
      const keyboard = new InlineKeyboard()
        .text('🗑 Delete this draft', `cancel:form:delete:${formId}`)
        .text('📂 Keep as draft', 'noop');
      return ctx.reply(
        '✗ Cancelled\\. Your draft form was saved — what would you like to do with it?',
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    }

    return ctx.reply('✗ Cancelled\\. Nothing was saved\\.', { parse_mode: 'MarkdownV2' });
  }

  private async onDrafts(ctx: Context) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const [forms, interviews] = await Promise.all([
      this.formService.findDraftsByCreator(user.id),
      this.interviewService.findDraftsByCreator(user.id),
    ]);

    if (forms.length === 0 && interviews.length === 0) {
      return ctx.reply('You have no drafts\\. Use /createform or /createinterview to start building\\.', { parse_mode: 'MarkdownV2' });
    }

    let text = `📝 *Your Drafts*\n\n`;
    const keyboard = new InlineKeyboard();

    if (forms.length > 0) {
      text += `*Forms*\n`;
      forms.forEach((f, i) => {
        text += `• ${esc(truncate(f.title, 40))} \\(${f._count.questions} question${f._count.questions === 1 ? '' : 's'}\\)\n`;
        keyboard.text(`View`, `form:view:${f.id}`).text(`Delete`, `form:delete:${f.id}`);
        if (i % 1 === 0) keyboard.row();
      });
      text += `\n`;
    }

    if (interviews.length > 0) {
      text += `*Interviews*\n`;
      interviews.forEach((iv, i) => {
        text += `• ${esc(truncate(iv.title, 40))} \\(${iv._count.schemaFields} field${iv._count.schemaFields === 1 ? '' : 's'}\\)\n`;
        keyboard.text(`View`, `interview:view:${iv.id}`).text(`Delete`, `interview:delete:${iv.id}`);
        if (i % 1 === 0) keyboard.row();
      });
    }

    return send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }

  private async onDashboardCommand(ctx: Context) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      const link = await this.dashboardAuthService.generateMagicLink(user.id);
      await ctx.reply(
        `🖥 *Creator Dashboard*\n\nYour magic link \\(expires in 15 minutes\\):\n${esc(link)}\n\n⚠️ _Don't share this link_ — it logs you in automatically\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    } catch {
      await ctx.reply('Could not generate dashboard link\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Callback router ─────────────────────────────────────────────────────────

  private async onCallback(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const data = ctx.callbackQuery?.data ?? '';

    if (data === 'createform:start')    return this.formFlow.startFormCreation(ctx);
    if (data === 'createform:cancel') {
      await this.botStateService.clearState(tid(ctx), 'CREATOR');
      return doEdit(ctx, '✗ Cancelled\\.', { parse_mode: 'MarkdownV2' });
    }
    if (data === 'addmore:yes')         return this.formFlow.promptNextQuestion(ctx);
    if (data === 'addmore:done')        return this.formFlow.showFormPreview(ctx);
    if (data === 'preview:addmore')     return this.formFlow.promptNextQuestion(ctx);
    if (data === 'noop')                return;

    if (data.startsWith('qtype:'))               return this.formFlow.onTypeSelected(ctx, data.slice(6));
    if (data.startsWith('form:activate:'))       return this.formFlow.activateForm(ctx, data.slice(14));
    if (data.startsWith('form:view:'))           return this.formFlow.showFormCard(ctx, data.slice(10));
    if (data.startsWith('form:share:'))          return this.formFlow.shareLink(ctx, data.slice(11));
    if (data.startsWith('form:close:confirm:'))  return this.formFlow.closeForm(ctx, data.slice(19));
    if (data.startsWith('form:close:'))          return this.formFlow.confirmClose(ctx, data.slice(11));
    if (data.startsWith('form:reopen:'))         return this.formFlow.reopenForm(ctx, data.slice(12));
    if (data.startsWith('form:delete:confirm:')) return this.formFlow.archiveForm(ctx, data.slice(20));
    if (data.startsWith('form:delete:'))         return this.formFlow.confirmDelete(ctx, data.slice(12));
    if (data.startsWith('form:responses:'))      return this.formFlow.showResponses(ctx, data.slice(15), 1);
    if (data.startsWith('myforms:page:'))        return this.formFlow.onMyForms(ctx, parseInt(data.slice(13)));

    if (data.startsWith('resp:')) {
      const [,, formId, pageStr] = data.split(':');
      return this.formFlow.showResponses(ctx, formId, parseInt(pageStr));
    }

    if (data.startsWith('cancel:form:delete:'))    return this.formFlow.doCancelDeleteForm(ctx, data.slice(19));

    if (data.startsWith('interview:type:'))        return this.interviewFlow.onInterviewTypeSelected(ctx, data.slice(15));
    if (data === 'interview:wizard:cancel')        return this.interviewFlow.onInterviewWizardCancel(ctx);
    if (data === 'interview:context:skip')         return this.interviewFlow.onInterviewContextSkipped(ctx);
    if (data.startsWith('interview:activate:'))    return this.interviewFlow.activateInterview(ctx, data.slice(19));
    if (data.startsWith('interview:view:'))        return this.interviewFlow.showInterviewCard(ctx, data.slice(15));
    if (data.startsWith('interview:share:'))       return this.interviewFlow.shareInterviewLink(ctx, data.slice(16));
    if (data.startsWith('interview:addfield:'))    return this.interviewFlow.startAddField(ctx, data.slice(19));
    if (data === 'interview:field:done')           return this.interviewFlow.onFieldsDone(ctx);
    if (data.startsWith('ifield:type:'))           return this.interviewFlow.onFieldTypeSelected(ctx, data.slice(12));
    if (data.startsWith('ifield:required:'))       return this.interviewFlow.onFieldRequiredSelected(ctx, data.slice(16));
    if (data.startsWith('interview:close:confirm:')) return this.interviewFlow.closeInterview(ctx, data.slice(24));
    if (data.startsWith('interview:close:'))        return this.interviewFlow.confirmCloseInterview(ctx, data.slice(16));
    if (data.startsWith('interview:delete:'))       return this.interviewFlow.deleteInterview(ctx, data.slice(18));

    if (data === 'email:code:resend')    return this.onEmailCodeResend(ctx);

    if (data === 'plan:upgrade:STARTER') return this.onPlanUpgrade(ctx, 'STARTER');
    if (data === 'plan:upgrade:GROWTH')  return this.onPlanUpgrade(ctx, 'GROWTH');
  }

  // ─── Text message router ─────────────────────────────────────────────────────

  private async onText(ctx: Context) {
    if (ctx.message?.text?.startsWith('/')) return;

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    switch (state?.conversationStep) {
      // Standard form steps
      case STEP.AWAITING_TITLE:           return this.formFlow.onTitleReceived(ctx);
      case STEP.AWAITING_QUESTION_TEXT:   return this.formFlow.onQuestionTextReceived(ctx);
      case STEP.AWAITING_CHOICE_OPTIONS:  return this.formFlow.onChoiceOptionsReceived(ctx);
      case STEP.AWAITING_QUESTION_TYPE:
        return ctx.reply('Please use the buttons above to select a question type\\. 👆', { parse_mode: 'MarkdownV2' });
      // Interview steps
      case STEP.INTERVIEW_AWAITING_TITLE:     return this.interviewFlow.onInterviewTitleReceived(ctx);
      case STEP.INTERVIEW_AWAITING_OBJECTIVE: return this.interviewFlow.onInterviewObjectiveReceived(ctx);
      case STEP.INTERVIEW_AWAITING_CONTEXT:   return this.interviewFlow.onInterviewContextReceived(ctx);
      case STEP.INTERVIEW_FIELD_DISPLAY_NAME: return this.interviewFlow.onFieldDisplayNameReceived(ctx);
      case STEP.INTERVIEW_FIELD_DESCRIPTION:  return this.interviewFlow.onFieldDescriptionReceived(ctx);
      // Email verification steps
      case STEP.AWAITING_EMAIL:      return this.onEmailReceived(ctx);
      case STEP.AWAITING_EMAIL_CODE: return this.onEmailCodeReceived(ctx);
      default: {
        const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
        if (!user.emailVerified) {
          await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
          return ctx.reply(
            `📧 *Please verify your email*\n\nReply with your email address to receive response notifications and keep your account secure:`,
            { parse_mode: 'MarkdownV2' },
          );
        }
        return ctx.reply('Use /commands to see what you can do\\.', { parse_mode: 'MarkdownV2' });
      }
    }
  }

  // ─── Plan / subscription ──────────────────────────────────────────────────────

  private async onPlanCommand(ctx: Context) {
    const user = await this.upsertUser(ctx);
    const summary = await this.subscriptionService.getSubscriptionSummary(user.id);
    const periodEnd = summary.periodEnd.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    const bar = this.usageBar(summary.used, summary.limit);

    const lines = [
      `📊 *Your Plan*\n`,
      `Plan: *${esc(PLAN_LABELS[summary.plan])}*`,
      `Status: ${summary.status === 'ACTIVE' ? '✅ Active' : '⛔ Inactive'}`,
      ``,
      `Usage this month:`,
      `${bar} ${summary.used}/${summary.limit}`,
      `Resets: ${esc(periodEnd)}`,
    ];

    const keyboard = new InlineKeyboard();
    if (summary.plan === 'FREE' || summary.plan === 'STARTER') {
      keyboard.text(`⚡ Starter — ₦${(PLAN_PRICES_KOBO.STARTER! / 100).toLocaleString()}/mo`, 'plan:upgrade:STARTER').row();
    }
    if (summary.plan !== 'GROWTH' && summary.plan !== 'ENTERPRISE') {
      keyboard.text(`🚀 Growth — ₦${(PLAN_PRICES_KOBO.GROWTH! / 100).toLocaleString()}/mo`, 'plan:upgrade:GROWTH');
    }

    await ctx.reply(lines.join('\n'), {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard.inline_keyboard.length ? keyboard : undefined,
    });
  }

  private async onPlanUpgrade(ctx: Context, plan: 'STARTER' | 'GROWTH') {
    const user = await this.upsertUser(ctx);
    await ctx.answerCallbackQuery();

    try {
      const checkoutUrl = await this.subscriptionService.initSubscriptionCheckout(user.id, plan);
      const keyboard = new InlineKeyboard().url(`💳 Pay for ${PLAN_LABELS[plan]}`, checkoutUrl);
      await ctx.reply(
        `Here's your secure checkout link for *${esc(PLAN_LABELS[plan])}*\\.\nIt expires in 30 minutes\\.`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch {
      await ctx.reply('⚠️ Could not generate checkout link\\. Please try again later\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  private usageBar(used: number, limit: number, width = 10): string {
    const filled = Math.round((used / limit) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  // ─── Email verification ───────────────────────────────────────────────────────

  private async onAddEmailCommand(ctx: Context) {
    const user = await this.upsertUser(ctx);
    if (user.emailVerified && user.email) {
      return ctx.reply(
        `✅ Your email *${esc(user.email)}* is already verified\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    }
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
    return ctx.reply(
      `📧 *Add your email*\n\nReply with your email address:`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onEmailReceived(ctx: Context) {
    const email = ctx.message?.text?.trim() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ctx.reply('⚠️ That doesn\'t look like a valid email address\\. Please try again:', { parse_mode: 'MarkdownV2' });
    }

    const existing = await this.authService.findByEmail(email);
    if (existing) {
      const user = await this.upsertUser(ctx);
      if (existing.id !== user.id) {
        return ctx.reply('⚠️ That email is already linked to another account\\. Please use a different address:', { parse_mode: 'MarkdownV2' });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL_CODE, {
      pendingEmail: email,
      emailCode: code,
      emailCodeExpiry: Date.now() + 10 * 60 * 1000,
      emailCodeAttempts: 0,
    });

    const user = await this.upsertUser(ctx);
    try {
      await this.emailService.sendVerificationCode(email, code, user.firstName ?? undefined);
    } catch {
      await this.botStateService.clearState(tid(ctx), 'CREATOR');
      return ctx.reply('⚠️ Could not send verification email\\. Please try again later\\.', { parse_mode: 'MarkdownV2' });
    }

    const keyboard = new InlineKeyboard().text('Resend code', 'email:code:resend');
    return ctx.reply(
      `📬 A 6\\-digit code was sent to *${esc(email)}*\\.\n\nPlease reply with the code:`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onEmailCodeReceived(ctx: Context) {
    const input = (ctx.message?.text?.trim() ?? '').replace(/\s/g, '');
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, unknown>;

    const code     = ctxData.emailCode as string;
    const email    = ctxData.pendingEmail as string;
    const expiry   = ctxData.emailCodeExpiry as number;
    const attempts = (ctxData.emailCodeAttempts as number) ?? 0;

    if (Date.now() > expiry) {
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
      return ctx.reply('⚠️ That code has expired\\. Please enter your email address again:', { parse_mode: 'MarkdownV2' });
    }

    if (input !== code) {
      const next = attempts + 1;
      if (next >= 3) {
        await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
        return ctx.reply('⚠️ Too many incorrect attempts\\. Please enter your email address again:', { parse_mode: 'MarkdownV2' });
      }
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL_CODE, { ...ctxData, emailCodeAttempts: next });
      const left = 3 - next;
      return ctx.reply(`⚠️ Incorrect code — ${left} attempt${left === 1 ? '' : 's'} remaining:`, { parse_mode: 'MarkdownV2' });
    }

    const user = await this.upsertUser(ctx);
    await this.authService.setEmail(user.id, email);
    await this.botStateService.clearState(tid(ctx), 'CREATOR');
    return ctx.reply(
      `✅ *Email verified\\!*\n\nYou'll now receive notifications when people respond to your forms and interviews\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onEmailCodeResend(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, unknown>;
    const email = ctxData.pendingEmail as string | undefined;

    if (!email) {
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL, {});
      return doEdit(ctx, '⚠️ Session expired\\. Please enter your email address again:', { parse_mode: 'MarkdownV2' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_EMAIL_CODE, {
      pendingEmail: email,
      emailCode: code,
      emailCodeExpiry: Date.now() + 10 * 60 * 1000,
      emailCodeAttempts: 0,
    });

    const user = await this.upsertUser(ctx);
    try {
      await this.emailService.sendVerificationCode(email, code, user.firstName ?? undefined);
    } catch {
      return doEdit(ctx, '⚠️ Could not resend\\. Please try again later\\.', { parse_mode: 'MarkdownV2' });
    }

    const keyboard = new InlineKeyboard().text('Resend code', 'email:code:resend');
    return doEdit(ctx,
      `📬 New code sent to *${esc(email)}*\\. Please reply with it:`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async upsertUser(ctx: Context) {
    return this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
  }
}
