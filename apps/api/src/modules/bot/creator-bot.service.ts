import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { FormService } from '../form/form.service';
import { QuestionService } from '../question/question.service';
import { SubscriptionService, PLAN_LABELS, PLAN_PRICES_KOBO } from '../subscription/subscription.service';
import { BotStateService } from '../bot-state/bot-state.service';
import { AuthService } from '../auth/auth.service';
import { ResponseService } from '../response/response.service';
import { InterviewService } from '../interview/interview.service';
import { DashboardAuthService } from '../dashboard-auth/dashboard-auth.service';
import { truncate } from '@fluxforms/utils';

const STEP = {
  // Standard form steps
  AWAITING_TITLE: 'AWAITING_TITLE',
  AWAITING_QUESTION_TEXT: 'AWAITING_QUESTION_TEXT',
  AWAITING_QUESTION_TYPE: 'AWAITING_QUESTION_TYPE',
  AWAITING_CHOICE_OPTIONS: 'AWAITING_CHOICE_OPTIONS',
  CONFIRMING_ADD_MORE: 'CONFIRMING_ADD_MORE',
  // Interview steps
  INTERVIEW_AWAITING_TITLE: 'INTERVIEW_AWAITING_TITLE',
  INTERVIEW_AWAITING_OBJECTIVE: 'INTERVIEW_AWAITING_OBJECTIVE',
  INTERVIEW_AWAITING_CONTEXT: 'INTERVIEW_AWAITING_CONTEXT',
  INTERVIEW_FIELD_DISPLAY_NAME: 'INTERVIEW_FIELD_DISPLAY_NAME',
  INTERVIEW_FIELD_DESCRIPTION: 'INTERVIEW_FIELD_DESCRIPTION',
} as const;

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  HIRING: '💼 Hiring',
  LEAD_QUALIFICATION: '🎯 Lead Qualification',
  CUSTOMER_FEEDBACK: '⭐ Customer Feedback',
  CLIENT_ONBOARDING: '🤝 Client Onboarding',
  MARKET_RESEARCH: '📊 Market Research',
  CUSTOM: '✏️ Custom',
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: '📝 Text',
  NUMBER: '🔢 Number',
  BOOLEAN: '✅ Yes/No',
  DATE: '📅 Date',
  ARRAY: '📋 List',
  RATING: '⭐ Rating',
};

type BotCtx = Record<string, unknown>;

@Injectable()
export class CreatorBotService implements OnModuleInit {
  private readonly logger = new Logger(CreatorBotService.name);
  private bot!: Bot;

  constructor(
    private readonly formService: FormService,
    private readonly questionService: QuestionService,
    private readonly botStateService: BotStateService,
    private readonly authService: AuthService,
    private readonly responseService: ResponseService,
    private readonly interviewService: InterviewService,
    private readonly dashboardAuthService: DashboardAuthService,
    private readonly subscriptionService: SubscriptionService,
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
    this.bot.command('createform',      ctx => this.onCreateFormCommand(ctx));
    this.bot.command('myforms',         ctx => this.onMyForms(ctx, 1));
    this.bot.command('cancel',          ctx => this.onCancel(ctx));
    this.bot.command('form',            ctx => this.onFormCommand(ctx));
    this.bot.command('createinterview', ctx => this.onCreateInterviewCommand(ctx));
    this.bot.command('myinterviews',    ctx => this.onMyInterviews(ctx));
    this.bot.command('dashboard',       ctx => this.onDashboardCommand(ctx));
    this.bot.command('plan',            ctx => this.onPlanCommand(ctx));
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

  // ─── Commands ────────────────────────────────────────────────────────────────

  private async onStart(ctx: Context) {
    await this.upsertUser(ctx);
    await ctx.reply(
      `👋 *Welcome to FluxForms\\!*\n\nCreate conversational forms and AI interviews your audience fills directly inside Telegram\\.\n\n*Forms*\n/createform – Build a new form\n/myforms – View your forms\n\n*AI Interviews*\n/createinterview – Build an AI interview\n/myinterviews – View your interviews\n\n*Account*\n/plan – View your plan and usage\n/dashboard – Open your creator dashboard\n/cancel – Cancel current action`,
      { parse_mode: 'MarkdownV2' },
    );
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
      `*💳 Account*\n` +
      `/plan – View your current plan and response usage\n` +
      `/dashboard – Get a login link to your creator dashboard\n\n` +
      `*🛠 Utility*\n` +
      `/cancel – Cancel whatever you're currently doing\n` +
      `/commands – Show this message`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onCreateFormCommand(ctx: Context) {
    await this.upsertUser(ctx);
    const keyboard = new InlineKeyboard()
      .text('▶ Continue', 'createform:start')
      .text('✗ Cancel', 'createform:cancel');

    await ctx.reply(
      `📄 *Create Form*\n\nBuild your form and activate it instantly\\.\nResponses count toward your plan limit\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onMyForms(ctx: Context, page: number) {
    await this.upsertUser(ctx);
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const { forms, total, totalPages } = await this.formService.findByCreator(user.id, page, 5);

    if (total === 0) {
      const msg = 'You have no forms yet\\. Use /createform to build your first one\\.';
      return this.send(ctx, msg, { parse_mode: 'MarkdownV2' });
    }

    const statusEmoji: Record<string, string> = {
      DRAFT: '📝', PAYMENT_PENDING: '⏳', ACTIVE: '🟢', CLOSED: '🔴', ARCHIVED: '🗄',
    };

    let text = `📋 *Your Forms* \\(${total} total\\)\n\n`;
    const keyboard = new InlineKeyboard();

    forms.forEach((form, i) => {
      const count = (form as any)._count?.responses ?? 0;
      const emoji = statusEmoji[form.status] ?? '•';
      text += `${emoji} *${esc(truncate(form.title, 35))}* — ${count} response${count !== 1 ? 's' : ''}\n`;
      keyboard.text('View', `form:view:${form.id}`);
      if (i % 2 === 1) keyboard.row();
    });

    if (totalPages > 1) {
      keyboard.row();
      if (page > 1) keyboard.text('◀ Prev', `myforms:page:${page - 1}`);
      keyboard.text(`${page}/${totalPages}`, 'noop');
      if (page < totalPages) keyboard.text('Next ▶', `myforms:page:${page + 1}`);
    }

    return this.send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }

  private async onCancel(ctx: Context) {
    await this.botStateService.clearState(tid(ctx), 'CREATOR');
    await ctx.reply('✗ Cancelled\\. Use /createform to start a new form\\.', { parse_mode: 'MarkdownV2' });
  }

  private async onFormCommand(ctx: Context) {
    const formId = (ctx.match as string)?.trim();
    if (!formId) return ctx.reply('Usage: /form <form\\_id>', { parse_mode: 'MarkdownV2' });
    return this.showFormCard(ctx, formId);
  }

  // ─── Callback router ─────────────────────────────────────────────────────────

  private async onCallback(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const data = ctx.callbackQuery?.data ?? '';

    if (data === 'createform:start')    return this.startFormCreation(ctx);
    if (data === 'createform:cancel')   return this.doEdit(ctx, '✗ Cancelled\\.', { parse_mode: 'MarkdownV2' });
    if (data === 'addmore:yes')         return this.promptNextQuestion(ctx);
    if (data === 'addmore:done')        return this.showFormPreview(ctx);
    if (data === 'preview:addmore')     return this.promptNextQuestion(ctx);
    if (data === 'noop')                return;

    if (data.startsWith('qtype:'))               return this.onTypeSelected(ctx, data.slice(6));
    if (data.startsWith('form:activate:'))       return this.activateForm(ctx, data.slice(14));
    if (data.startsWith('form:view:'))           return this.showFormCard(ctx, data.slice(10));
    if (data.startsWith('form:share:'))          return this.shareLink(ctx, data.slice(11));
    if (data.startsWith('form:close:confirm:'))  return this.closeForm(ctx, data.slice(19));
    if (data.startsWith('form:close:'))          return this.confirmClose(ctx, data.slice(11));
    if (data.startsWith('form:reopen:'))         return this.reopenForm(ctx, data.slice(12));
    if (data.startsWith('form:delete:confirm:')) return this.archiveForm(ctx, data.slice(20));
    if (data.startsWith('form:delete:'))         return this.confirmDelete(ctx, data.slice(12));
    if (data.startsWith('form:responses:'))      return this.showResponses(ctx, data.slice(15), 1);
    if (data.startsWith('myforms:page:'))        return this.onMyForms(ctx, parseInt(data.slice(13)));

    if (data.startsWith('resp:')) {
      const [,, formId, pageStr] = data.split(':');
      return this.showResponses(ctx, formId, parseInt(pageStr));
    }

    if (data.startsWith('interview:type:'))        return this.onInterviewTypeSelected(ctx, data.slice(15));
    if (data === 'interview:context:skip')         return this.onInterviewContextSkipped(ctx);
    if (data.startsWith('interview:activate:'))    return this.activateInterview(ctx, data.slice(19));
    if (data.startsWith('interview:view:'))        return this.showInterviewCard(ctx, data.slice(15));
    if (data.startsWith('interview:share:'))       return this.shareInterviewLink(ctx, data.slice(16));
    if (data.startsWith('interview:addfield:'))    return this.startAddField(ctx, data.slice(19));
    if (data === 'interview:field:done')           return this.onFieldsDone(ctx);
    if (data.startsWith('ifield:type:'))           return this.onFieldTypeSelected(ctx, data.slice(12));
    if (data.startsWith('ifield:required:'))       return this.onFieldRequiredSelected(ctx, data.slice(16));
    if (data.startsWith('interview:close:confirm:')) return this.closeInterview(ctx, data.slice(24));
    if (data.startsWith('interview:close:'))       return this.confirmCloseInterview(ctx, data.slice(16));

    if (data === 'plan:upgrade:STARTER') return this.onPlanUpgrade(ctx, 'STARTER');
    if (data === 'plan:upgrade:GROWTH')  return this.onPlanUpgrade(ctx, 'GROWTH');
  }

  // ─── Text message router ─────────────────────────────────────────────────────

  private async onText(ctx: Context) {
    if (ctx.message?.text?.startsWith('/')) return;

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    switch (state?.conversationStep) {
      // Standard form steps
      case STEP.AWAITING_TITLE:           return this.onTitleReceived(ctx);
      case STEP.AWAITING_QUESTION_TEXT:   return this.onQuestionTextReceived(ctx);
      case STEP.AWAITING_CHOICE_OPTIONS:  return this.onChoiceOptionsReceived(ctx);
      case STEP.AWAITING_QUESTION_TYPE:
        return ctx.reply('Please use the buttons above to select a question type\\. 👆', { parse_mode: 'MarkdownV2' });
      // Interview steps
      case STEP.INTERVIEW_AWAITING_TITLE:     return this.onInterviewTitleReceived(ctx);
      case STEP.INTERVIEW_AWAITING_OBJECTIVE: return this.onInterviewObjectiveReceived(ctx);
      case STEP.INTERVIEW_AWAITING_CONTEXT:   return this.onInterviewContextReceived(ctx);
      case STEP.INTERVIEW_FIELD_DISPLAY_NAME: return this.onFieldDisplayNameReceived(ctx);
      case STEP.INTERVIEW_FIELD_DESCRIPTION:  return this.onFieldDescriptionReceived(ctx);
      default:
        return ctx.reply('Use /createform to build a form, /createinterview for an AI interview, or /myforms to view your forms\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Form creation flow ───────────────────────────────────────────────────────

  private async startFormCreation(ctx: Context) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_TITLE, {});
    return this.doEdit(ctx, '📝 What\'s the *title* of your form?\n\n_Example: Job Application 2026_', { parse_mode: 'Markdown' });
  }

  private async onTitleReceived(ctx: Context) {
    const title = ctx.message?.text?.trim() ?? '';
    if (title.length < 3)   return ctx.reply('⚠️ Title must be at least 3 characters\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (title.length > 100) return ctx.reply('⚠️ Title must be at most 100 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const form = await this.formService.create(user.id, title);

    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_QUESTION_TEXT, {
      formId: form.id,
      questionCount: 0,
    });

    await ctx.reply(
      `✅ Form created: *${esc(title)}*\n\nNow add your first question\\. Type it below:`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onQuestionTextReceived(ctx: Context) {
    const text = ctx.message?.text?.trim() ?? '';
    if (text.length < 3)   return ctx.reply('⚠️ Question must be at least 3 characters\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (text.length > 300) return ctx.reply('⚠️ Question must be at most 300 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_QUESTION_TYPE, {
      ...(state?.context as object),
      questionText: text,
    });

    const keyboard = new InlineKeyboard()
      .text('📝 Text', 'qtype:TEXT').text('🔢 Number', 'qtype:NUMBER').text('📧 Email', 'qtype:EMAIL').row()
      .text('✅ Yes / No', 'qtype:YES_NO').text('📋 Multiple Choice', 'qtype:MULTIPLE_CHOICE');

    await ctx.reply(
      `*"${esc(truncate(text, 60))}"*\n\nWhat type of answer should this accept?`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onTypeSelected(ctx: Context, type: string) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.formId || !ctxData.questionText) {
      return ctx.reply('Something went wrong\\. Use /createform to start over\\.', { parse_mode: 'MarkdownV2' });
    }

    if (type === 'MULTIPLE_CHOICE') {
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_CHOICE_OPTIONS, ctxData);
      return this.doEdit(ctx,
        `📋 *Multiple Choice*\n\nSend the options, one per line \\(2–10\\):\n\n_Example:_\n_Option A_\n_Option B_\n_Option C_`,
        { parse_mode: 'MarkdownV2' },
      );
    }

    await this.saveQuestion(ctx, ctxData, type);
  }

  private async onChoiceOptionsReceived(ctx: Context) {
    const raw = ctx.message?.text ?? '';
    const options = raw.split('\n').map(o => o.trim()).filter(Boolean);

    if (options.length < 2)  return ctx.reply('⚠️ Provide at least 2 options, one per line:', { parse_mode: 'MarkdownV2' });
    if (options.length > 10) return ctx.reply('⚠️ Maximum 10 options\\. Trim your list:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.formId || !ctxData.questionText) {
      return ctx.reply('Something went wrong\\. Use /createform to start over\\.', { parse_mode: 'MarkdownV2' });
    }

    await this.saveQuestion(ctx, ctxData, 'MULTIPLE_CHOICE', options);
  }

  private async saveQuestion(ctx: Context, ctxData: BotCtx, type: string, options?: string[]) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });

    await this.questionService.addQuestion(
      ctxData.formId as string,
      user.id,
      ctxData.questionText as string,
      type as any,
      options,
    );

    const newCount = ((ctxData.questionCount as number) ?? 0) + 1;
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.CONFIRMING_ADD_MORE, {
      ...ctxData,
      questionCount: newCount,
    });

    const optionsSuffix = options ? `: ${options.slice(0, 3).join(', ')}${options.length > 3 ? '…' : ''}` : '';
    const keyboard = new InlineKeyboard()
      .text('➕ Add Another Question', 'addmore:yes').row()
      .text('✓ Done — Preview Form', 'addmore:done');

    const msg = `✅ Question ${newCount} added\\!\n*"${esc(truncate(ctxData.questionText as string, 60))}"* \\[${esc(typeLabel(type))}${esc(optionsSuffix)}\\]`;

    // ctx might be a callback (type selection) or a message (options received)
    if (ctx.callbackQuery) {
      await this.doEdit(ctx, msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }
  }

  private async promptNextQuestion(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    const count = (ctxData.questionCount as number) ?? 0;

    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_QUESTION_TEXT, ctxData);
    await this.doEdit(ctx, `Type question ${count + 1}:`, {}).catch(() =>
      ctx.reply(`Type question ${count + 1}:`)
    );
  }

  // ─── Form preview ─────────────────────────────────────────────────────────────

  private async showFormPreview(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.formId) return ctx.reply('Something went wrong\\. Use /createform to start over\\.', { parse_mode: 'MarkdownV2' });

    const form = await this.formService.findById(ctxData.formId as string);
    if (form.questions.length === 0) return ctx.reply('⚠️ Add at least one question before previewing\\.', { parse_mode: 'MarkdownV2' });

    await this.botStateService.setState(tid(ctx), 'CREATOR', null, ctxData);

    const lines = form.questions
      .map((q, i) => `${i + 1}\\. ${esc(truncate(q.text, 50))} \\[${esc(typeLabel(q.type))}\\]`)
      .join('\n');

    const keyboard = new InlineKeyboard()
      .text('🚀 Activate Form', `form:activate:${form.id}`).row()
      .text('➕ Add More Questions', 'preview:addmore').row()
      .text('🗑 Delete Form', `form:delete:${form.id}`);

    await this.doEdit(ctx,
      `📋 *Form Preview: ${esc(form.title)}*\n${'─'.repeat(22)}\n${lines}\n${'─'.repeat(22)}\nTotal: ${form.questions.length} question${form.questions.length !== 1 ? 's' : ''}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  // ─── Form activation ─────────────────────────────────────────────────────────

  private async activateForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.findById(formId);
      if (form.creatorId !== user.id) return ctx.reply('Form not found\\.', { parse_mode: 'MarkdownV2' });

      await this.formService.transition(formId, user.id, 'ACTIVE');

      const shareToken = form.shareToken ?? (await this.formService.findById(formId)).shareToken;
      const shareLink = shareToken
        ? `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=${shareToken}`
        : '_(share link unavailable)_';

      const keyboard = new InlineKeyboard()
        .text('📤 Share Link', `form:share:${formId}`).row()
        .text('📊 View Responses', `form:responses:${formId}`);

      await this.doEdit(ctx,
        `✅ *Form Activated\\!*\n\n*${esc(form.title)}* is now live\\.\n\n🔗 Share: ${esc(shareLink)}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch (err: any) {
      this.logger.error('Form activation error', err);
      await ctx.reply('⚠️ Could not activate form\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Form management ──────────────────────────────────────────────────────────

  private async showFormCard(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.findById(formId);
      if (form.creatorId !== user.id) return ctx.reply('Form not found\\.');

      const responseCount = await this.responseService.getResponsesForForm(formId, 1, 1)
        .then(r => r.total).catch(() => 0);

      const statusLabel: Record<string, string> = {
        DRAFT: '📝 Draft', PAYMENT_PENDING: '⏳ Payment Pending',
        ACTIVE: '🟢 Active', CLOSED: '🔴 Closed', ARCHIVED: '🗄 Archived',
      };

      const keyboard = new InlineKeyboard();
      if (form.status === 'ACTIVE') {
        keyboard
          .text('📊 View Responses', `form:responses:${formId}`).row()
          .text('🔒 Close Form', `form:close:${formId}`).row()
          .text('📤 Share Link', `form:share:${formId}`);
      } else if (form.status === 'CLOSED') {
        keyboard
          .text('📊 View Responses', `form:responses:${formId}`).row()
          .text('🔓 Re\\-open Form', `form:reopen:${formId}`).row()
          .text('🗑 Archive', `form:delete:${formId}`);
      } else if (form.status === 'DRAFT' || form.status === 'PAYMENT_PENDING') {
        keyboard.text('🚀 Activate Form', `form:activate:${formId}`);
      }

      const text = `📄 *${esc(form.title)}*\nStatus: ${esc(statusLabel[form.status] ?? form.status)}\nQuestions: ${form.questions.length}\nResponses: ${responseCount}\nCreated: ${esc(new Date(form.createdAt).toLocaleDateString('en-NG'))}`;
      return this.send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch {
      return ctx.reply('Form not found\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  private async confirmClose(ctx: Context, formId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Close', `form:close:confirm:${formId}`)
      .text('Cancel', `form:view:${formId}`);
    return this.doEdit(ctx,
      '⚠️ Close this form? Respondents will no longer be able to fill it\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async closeForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.transition(formId, user.id, 'CLOSED');
      await this.doEdit(ctx,
        `🔒 *${esc(form.title)}* is now closed\\. No new responses accepted\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: new InlineKeyboard()
            .text('📊 View Responses', `form:responses:${formId}`).row()
            .text('🔓 Re\\-open', `form:reopen:${formId}`),
        },
      );
    } catch { await ctx.reply('Could not close the form\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }

  private async reopenForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.transition(formId, user.id, 'ACTIVE');
      await this.doEdit(ctx,
        `✅ *${esc(form.title)}* is now accepting responses again\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: new InlineKeyboard()
            .text('📊 View Responses', `form:responses:${formId}`).row()
            .text('🔒 Close Form', `form:close:${formId}`).row()
            .text('📤 Share Link', `form:share:${formId}`),
        },
      );
    } catch { await ctx.reply('Could not re\\-open the form\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }

  private async shareLink(ctx: Context, formId: string) {
    try {
      const form = await this.formService.findById(formId);
      const link = form.shareLink ?? `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=${form.shareToken}`;
      await ctx.reply(`📤 *Share link:*\n${link}`, { parse_mode: 'MarkdownV2' });
    } catch { await ctx.reply('Could not retrieve share link\\.', { parse_mode: 'MarkdownV2' }); }
  }

  private async confirmDelete(ctx: Context, formId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Archive', `form:delete:confirm:${formId}`)
      .text('Cancel', `form:view:${formId}`);
    return this.doEdit(ctx,
      '⚠️ Archive this form? Existing responses are preserved\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async archiveForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      await this.formService.delete(formId, user.id);
      await this.doEdit(ctx, '🗄 Form archived\\. Use /myforms to view your forms\\.', { parse_mode: 'MarkdownV2' });
    } catch (err: any) {
      await ctx.reply(esc(err?.message ?? 'Could not archive the form\\.'), { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Responses ────────────────────────────────────────────────────────────────

  private async showResponses(ctx: Context, formId: string, page: number) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.findById(formId);
      if (form.creatorId !== user.id) return ctx.reply('Form not found\\.', { parse_mode: 'MarkdownV2' });

      const { responses, total } = await this.responseService.getResponsesForForm(formId, page, 1);

      if (total === 0) {
        return this.send(ctx,
          `📊 *${esc(form.title)}*\n\nNo responses yet\\.`,
          { parse_mode: 'MarkdownV2' },
        );
      }

      const resp = responses[0];
      const answers = resp.answers as Record<string, string>;
      const answerLines = form.questions
        .map((q, i) => `${i + 1}\\. *${esc(truncate(q.text, 40))}*\n    ${esc(answers[q.id] ?? '—')}`)
        .join('\n');

      const keyboard = new InlineKeyboard();
      if (page > 1)    keyboard.text('◀ Prev', `resp:prev:${formId}:${page - 1}`);
      keyboard.text(`${page}/${total}`, 'noop');
      if (page < total) keyboard.text('Next ▶', `resp:next:${formId}:${page + 1}`);
      keyboard.row().text('⬅ Back to Form', `form:view:${formId}`);

      return this.send(ctx,
        `📊 *Response ${page} of ${total}*\n${esc(new Date(resp.submittedAt).toLocaleString('en-NG'))}\n${'─'.repeat(22)}\n${answerLines}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch { await ctx.reply('Could not load responses\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }

  // ─── Interview commands ───────────────────────────────────────────────────────

  private async onCreateInterviewCommand(ctx: Context) {
    await this.upsertUser(ctx);
    const keyboard = new InlineKeyboard()
      .text(INTERVIEW_TYPE_LABELS['HIRING'],            'interview:type:HIRING').row()
      .text(INTERVIEW_TYPE_LABELS['LEAD_QUALIFICATION'], 'interview:type:LEAD_QUALIFICATION').row()
      .text(INTERVIEW_TYPE_LABELS['CUSTOMER_FEEDBACK'],  'interview:type:CUSTOMER_FEEDBACK').row()
      .text(INTERVIEW_TYPE_LABELS['CLIENT_ONBOARDING'],  'interview:type:CLIENT_ONBOARDING').row()
      .text(INTERVIEW_TYPE_LABELS['MARKET_RESEARCH'],    'interview:type:MARKET_RESEARCH').row()
      .text(INTERVIEW_TYPE_LABELS['CUSTOM'],             'interview:type:CUSTOM');

    await ctx.reply(
      `🤖 *Create a Flux Interview*\n\nAn AI will conduct natural conversations and extract structured data for you\\.\n\nChoose the interview type:`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onInterviewTypeSelected(ctx: Context, type: string) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_TITLE, { interviewType: type });
    const label = esc(INTERVIEW_TYPE_LABELS[type] ?? type);
    await this.doEdit(ctx,
      `${label} interview selected\\.\n\nWhat's the *title* of this interview?\n\n_Example: Q4 Sales Lead Screening_`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onMyInterviews(ctx: Context) {
    await this.upsertUser(ctx);
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const interviews = await this.interviewService.findByCreator(user.id);

    if (interviews.length === 0) {
      return ctx.reply('You have no interviews yet\\. Use /createinterview to build your first one\\.', { parse_mode: 'MarkdownV2' });
    }

    const statusEmoji: Record<string, string> = { DRAFT: '📝', ACTIVE: '🟢', CLOSED: '🔴', ARCHIVED: '🗄' };
    let text = `🤖 *Your Flux Interviews* \\(${interviews.length} total\\)\n\n`;
    const keyboard = new InlineKeyboard();

    const ivList = interviews.slice(0, 8) as Array<{ id: string; title: string; status: string; completedCount: number }>;
    ivList.forEach((iv, i) => {
      const emoji = statusEmoji[iv.status] ?? '•';
      text += `${emoji} *${esc(truncate(iv.title, 35))}* — ${iv.completedCount} completed\n`;
      keyboard.text('View', `interview:view:${iv.id}`);
      if (i % 2 === 1) keyboard.row();
    });

    return this.send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
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

  // ─── Interview creation flow ──────────────────────────────────────────────────

  private async onInterviewTitleReceived(ctx: Context) {
    const title = ctx.message?.text?.trim() ?? '';
    if (title.length < 3)   return ctx.reply('⚠️ Title must be at least 3 characters\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (title.length > 100) return ctx.reply('⚠️ Title must be at most 100 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_OBJECTIVE, {
      ...(state?.context as object),
      interviewTitle: title,
    });

    await ctx.reply(
      `✅ Title saved: *${esc(title)}*\n\nNow describe the *objective* of this interview\\.\nWhat information are you trying to collect?\n\n_Example: Screen frontend developer candidates for a senior React role\\. Assess technical skills, experience, and culture fit\\._`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onInterviewObjectiveReceived(ctx: Context) {
    const objective = ctx.message?.text?.trim() ?? '';
    if (objective.length < 10)  return ctx.reply('⚠️ Objective too short — be more descriptive\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (objective.length > 500) return ctx.reply('⚠️ Objective must be at most 500 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_CONTEXT, {
      ...(state?.context as object),
      interviewObjective: objective,
    });

    const keyboard = new InlineKeyboard().text('Skip →', 'interview:context:skip');
    await ctx.reply(
      `✅ Objective saved\\.\n\n` +
      `*Is there anything the AI interviewer should know before it starts?*\n\n` +
      `This is your chance to brief it — think of it like onboarding a new hire\\. You can include:\n` +
      `• What your company or product does\n` +
      `• The tone you want \\(formal, casual, friendly\\)\n` +
      `• Anything it should avoid saying\n` +
      `• Who it will be talking to\n\n` +
      `_Max 800 characters\\. Tap Skip if you don't need this\\._`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onInterviewContextReceived(ctx: Context) {
    const context = ctx.message?.text?.trim() ?? '';
    if (context.length > 800) {
      return ctx.reply(
        `⚠️ Context must be 800 characters or less \\(yours is ${context.length}\\)\\. Please shorten it and try again:`,
        { parse_mode: 'MarkdownV2' },
      );
    }
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', null, {
      ...(state?.context as object),
      interviewContext: context,
    });
    await this.createInterviewFromState(ctx);
  }

  private async onInterviewContextSkipped(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', null, (state?.context as unknown as Record<string, unknown>) ?? {});
    await this.createInterviewFromState(ctx);
  }

  private async createInterviewFromState(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, string>;
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });

    const interview = await this.interviewService.create(user.id, {
      title: ctxData.interviewTitle,
      type: ctxData.interviewType as any,
      objective: ctxData.interviewObjective,
      context: ctxData.interviewContext,
    });

    await this.botStateService.setState(tid(ctx), 'CREATOR', null, {});

    const keyboard = new InlineKeyboard()
      .text('➕ Add Data Fields', `interview:addfield:${interview.id}`).row()
      .text('🚀 Activate Interview', `interview:activate:${interview.id}`);

    const typeLabel = esc(INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type);
    const msg = `✅ *Interview created\\!*\n\n*${esc(interview.title)}*\nType: ${typeLabel}\n\nNext: Add the data fields you want the AI to extract, then activate\\.`;

    if (ctx.callbackQuery) {
      await this.doEdit(ctx, msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }
  }

  // ─── Interview field flow ─────────────────────────────────────────────────────

  private async startAddField(ctx: Context, interviewId: string) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_FIELD_DISPLAY_NAME, { interviewId });
    await this.doEdit(ctx,
      `➕ *Add a Data Field*\n\nEnter the name of *one field* you want the AI to collect\\.\nYou'll add the rest one by one after this\\.\n\n*Some ideas:*\n• Full Name\n• Years of Experience\n• Salary Expectation\n• Current Company\n\n_Max 60 characters\\._`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onFieldDisplayNameReceived(ctx: Context) {
    const displayName = ctx.message?.text?.trim() ?? '';
    if (displayName.length < 2)  return ctx.reply('⚠️ Name too short\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (displayName.length > 60) return ctx.reply('⚠️ Name must be at most 60 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const fieldName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_FIELD_DESCRIPTION, {
      ...(state?.context as object),
      fieldDisplayName: displayName,
      fieldName,
    });

    const keyboard = new InlineKeyboard()
      .text(FIELD_TYPE_LABELS['TEXT'],    'ifield:type:TEXT')
      .text(FIELD_TYPE_LABELS['NUMBER'],  'ifield:type:NUMBER').row()
      .text(FIELD_TYPE_LABELS['BOOLEAN'], 'ifield:type:BOOLEAN')
      .text(FIELD_TYPE_LABELS['DATE'],    'ifield:type:DATE').row()
      .text(FIELD_TYPE_LABELS['ARRAY'],   'ifield:type:ARRAY')
      .text(FIELD_TYPE_LABELS['RATING'],  'ifield:type:RATING');

    await ctx.reply(
      `*"${esc(displayName)}"* — what type of value should this be?`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onFieldTypeSelected(ctx: Context, fieldType: string) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_FIELD_DESCRIPTION, {
      ...(state?.context as object),
      fieldType,
    });
    await this.doEdit(ctx,
      `Type: *${esc(FIELD_TYPE_LABELS[fieldType] ?? fieldType)}*\n\nBriefly describe what you want the AI to extract for this field:\n\n_Example: Total years of professional software development experience_`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  private async onFieldDescriptionReceived(ctx: Context) {
    const description = ctx.message?.text?.trim() ?? '';
    if (description.length < 5) return ctx.reply('⚠️ Description too short\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', null, {
      ...(state?.context as object),
      fieldDescription: description,
    });

    const keyboard = new InlineKeyboard()
      .text('Required ✓', 'ifield:required:true')
      .text('Optional', 'ifield:required:false');

    await ctx.reply(
      `Is this field required?`,
      { reply_markup: keyboard },
    );
  }

  private async onFieldRequiredSelected(ctx: Context, isRequiredStr: string) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const isRequired = isRequiredStr === 'true';
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, string>;
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });

    const interview = await this.interviewService.findById(ctxData.interviewId);
    const orderIndex = interview.schemaFields.length;

    await this.interviewService.addField(ctxData.interviewId, user.id, {
      fieldName: ctxData.fieldName,
      displayName: ctxData.fieldDisplayName,
      fieldType: ctxData.fieldType as any,
      description: ctxData.fieldDescription,
      isRequired,
      orderIndex,
    });

    await this.botStateService.setState(tid(ctx), 'CREATOR', null, {});

    const keyboard = new InlineKeyboard()
      .text('➕ Add Another Field', `interview:addfield:${ctxData.interviewId}`).row()
      .text('✓ Done — Activate', `interview:activate:${ctxData.interviewId}`).row()
      .text('📋 View Interview', `interview:view:${ctxData.interviewId}`);

    await this.doEdit(ctx,
      `✅ *${esc(ctxData.fieldDisplayName)}* added \\[${esc(FIELD_TYPE_LABELS[ctxData.fieldType] ?? ctxData.fieldType)}\\]\n\nAdd more fields or activate the interview\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async onFieldsDone(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, string>;
    if (ctxData.interviewId) {
      return this.showInterviewCard(ctx, ctxData.interviewId);
    }
  }

  // ─── Interview management ─────────────────────────────────────────────────────

  private async showInterviewCard(ctx: Context, interviewId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const interview = await this.interviewService.findById(interviewId);
      if (interview.creatorId !== user.id) return ctx.reply('Interview not found\\.', { parse_mode: 'MarkdownV2' });

      const statusLabel: Record<string, string> = {
        DRAFT: '📝 Draft', ACTIVE: '🟢 Active', CLOSED: '🔴 Closed', ARCHIVED: '🗄 Archived',
      };

      const keyboard = new InlineKeyboard();
      if (interview.status === 'DRAFT') {
        keyboard
          .text('➕ Add Field', `interview:addfield:${interviewId}`).row()
          .text('🚀 Activate', `interview:activate:${interviewId}`);
      } else if (interview.status === 'ACTIVE') {
        keyboard
          .text('📤 Share Link', `interview:share:${interviewId}`).row()
          .text('🔒 Close', `interview:close:${interviewId}`);
      }

      const fieldList = interview.schemaFields.length > 0
        ? (interview.schemaFields as Array<{ displayName: string; fieldType: string }>).map(f => `  • ${esc(f.displayName)} \\[${esc(f.fieldType)}\\]`).join('\n')
        : '  _No fields yet_';

      const text = `🤖 *${esc(interview.title)}*\nStatus: ${esc(statusLabel[interview.status] ?? interview.status)}\nType: ${esc(INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type)}\nCompleted: ${interview.completedCount}\n\n*Fields:*\n${fieldList}`;

      return this.send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch {
      return ctx.reply('Interview not found\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  private async activateInterview(ctx: Context, interviewId: string) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      const interview = await this.interviewService.activate(interviewId, user.id);
      const keyboard = new InlineKeyboard()
        .text('📤 Share Link', `interview:share:${interviewId}`).row()
        .text('📋 View Details', `interview:view:${interviewId}`);

      await this.doEdit(ctx,
        `🚀 *Interview is now LIVE\\!*\n\n*${esc(interview.title)}*\n\nShare this link with your audience:\n${esc(interview.shareLink ?? '')}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch (err: any) {
      const msg = err?.message ?? 'Could not activate the interview\\.';
      await ctx.reply(esc(msg), { parse_mode: 'MarkdownV2' });
    }
  }

  private async shareInterviewLink(ctx: Context, interviewId: string) {
    try {
      const interview = await this.interviewService.findById(interviewId);
      await ctx.reply(`📤 *Share link:*\n${esc(interview.shareLink ?? '')}`, { parse_mode: 'MarkdownV2' });
    } catch {
      await ctx.reply('Could not retrieve share link\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  private async confirmCloseInterview(ctx: Context, interviewId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Close', `interview:close:confirm:${interviewId}`)
      .text('Cancel', `interview:view:${interviewId}`);
    return this.doEdit(ctx,
      '⚠️ Close this interview? It will stop accepting new respondents\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  private async closeInterview(ctx: Context, interviewId: string) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      const interview = await this.interviewService.close(interviewId, user.id);
      await this.doEdit(ctx,
        `🔒 *${esc(interview.title)}* is now closed\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    } catch {
      await ctx.reply('Could not close the interview\\.', { parse_mode: 'MarkdownV2' });
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

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** Send or edit depending on whether this is a callback context */
  private async send(ctx: Context, text: string, extra: object) {
    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, extra as any).catch(() => ctx.reply(text, extra as any));
    }
    return ctx.reply(text, extra as any);
  }

  async sendRawMessage(chatId: number, text: string, extra: object = {}): Promise<void> {
    await this.bot.api.sendMessage(chatId, text, extra as Parameters<typeof this.bot.api.sendMessage>[2]);
  }

  /** Edit current message, fall back to new message on failure */
  private async doEdit(ctx: Context, text: string, extra: object) {
    return ctx.editMessageText(text, extra as any).catch(() => ctx.reply(text, extra as any));
  }

  private async upsertUser(ctx: Context) {
    return this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
  }
}

// ─── Pure helpers (module-level, no `this`) ───────────────────────────────────

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

/** Escape special MarkdownV2 characters */
function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    TEXT: 'Text', NUMBER: 'Number', EMAIL: 'Email',
    YES_NO: 'Yes/No', MULTIPLE_CHOICE: 'Multiple Choice',
  };
  return labels[type] ?? type;
}
