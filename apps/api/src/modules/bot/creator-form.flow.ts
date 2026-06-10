import { Injectable, Logger } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { truncate } from '@fluxforms/utils';
import { FormService } from '../form/form.service';
import { QuestionService } from '../question/question.service';
import { BotStateService } from '../bot-state/bot-state.service';
import { AuthService } from '../auth/auth.service';
import { ResponseService } from '../response/response.service';
import {
  STEP, BotCtx, esc, typeLabel, tid, userData, send, doEdit, responsesUrl,
} from './bot-shared';

/**
 * Creator-bot conversation handlers for the standard form lifecycle:
 * creation wizard, activation, management and response browsing.
 */
@Injectable()
export class CreatorFormFlow {
  private readonly logger = new Logger(CreatorFormFlow.name);

  constructor(
    private readonly formService: FormService,
    private readonly questionService: QuestionService,
    private readonly botStateService: BotStateService,
    private readonly authService: AuthService,
    private readonly responseService: ResponseService,
  ) {}

  private async upsertUser(ctx: Context) {
    return this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
  }

  // ─── Commands ────────────────────────────────────────────────────────────────

  async onCreateFormCommand(ctx: Context) {
    await this.upsertUser(ctx);
    const keyboard = new InlineKeyboard()
      .text('▶ Continue', 'createform:start')
      .text('✗ Cancel', 'createform:cancel');

    await ctx.reply(
      `📄 *Create Form*\n\nBuild your form and activate it instantly\\.\nResponses count toward your plan limit\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async onMyForms(ctx: Context, page: number) {
    await this.upsertUser(ctx);
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    const { forms, total, totalPages } = await this.formService.findByCreator(user.id, page, 5);

    if (total === 0) {
      const msg = 'You have no forms yet\\. Use /createform to build your first one\\.';
      return send(ctx, msg, { parse_mode: 'MarkdownV2' });
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

    return send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }

  async doCancelDeleteForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      await this.formService.delete(formId, user.id);
      await doEdit(ctx, '🗑 Draft deleted\\.', { parse_mode: 'MarkdownV2' });
    } catch {
      await ctx.reply('Could not delete the draft\\. Find it in /myforms\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async onFormCommand(ctx: Context) {
    const formId = (ctx.match as string)?.trim();
    if (!formId) return ctx.reply('Usage: /form <form\\_id>', { parse_mode: 'MarkdownV2' });
    return this.showFormCard(ctx, formId);
  }

  // ─── Form creation flow ───────────────────────────────────────────────────────

  async startFormCreation(ctx: Context) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_TITLE, {});
    return doEdit(ctx, '📝 What\'s the *title* of your form?\n\n_Example: Job Application 2026_', { parse_mode: 'Markdown' });
  }

  async onTitleReceived(ctx: Context) {
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

  async onQuestionTextReceived(ctx: Context) {
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

  async onTypeSelected(ctx: Context, type: string) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    if (!ctxData.formId || !ctxData.questionText) {
      return ctx.reply('Something went wrong\\. Use /createform to start over\\.', { parse_mode: 'MarkdownV2' });
    }

    if (type === 'MULTIPLE_CHOICE') {
      await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_CHOICE_OPTIONS, ctxData);
      return doEdit(ctx,
        `📋 *Multiple Choice*\n\nSend the options, one per line \\(2–10\\):\n\n_Example:_\n_Option A_\n_Option B_\n_Option C_`,
        { parse_mode: 'MarkdownV2' },
      );
    }

    await this.saveQuestion(ctx, ctxData, type);
  }

  async onChoiceOptionsReceived(ctx: Context) {
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
      await doEdit(ctx, msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }
  }

  async promptNextQuestion(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as BotCtx;
    const count = (ctxData.questionCount as number) ?? 0;

    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.AWAITING_QUESTION_TEXT, ctxData);
    await doEdit(ctx, `Type question ${count + 1}:`, {}).catch(() =>
      ctx.reply(`Type question ${count + 1}:`)
    );
  }

  // ─── Form preview ─────────────────────────────────────────────────────────────

  async showFormPreview(ctx: Context) {
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

    await doEdit(ctx,
      `📋 *Form Preview: ${esc(form.title)}*\n${'─'.repeat(22)}\n${lines}\n${'─'.repeat(22)}\nTotal: ${form.questions.length} question${form.questions.length !== 1 ? 's' : ''}`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  // ─── Form activation ─────────────────────────────────────────────────────────

  async activateForm(ctx: Context, formId: string) {
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
        .webApp('📊 View Responses', responsesUrl(formId));

      await doEdit(ctx,
        `✅ *Form Activated\\!*\n\n*${esc(form.title)}* is now live\\.\n\n🔗 Share: ${esc(shareLink)}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
      if (!user.emailVerified) {
        await ctx.reply(
          `📧 _Add your email with /addemail to get notified when responses come in\\._`,
          { parse_mode: 'MarkdownV2' },
        ).catch(() => undefined);
      }
    } catch (err: any) {
      this.logger.error('Form activation error', err);
      await ctx.reply('⚠️ Could not activate form\\. Please try again\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Form management ──────────────────────────────────────────────────────────

  async showFormCard(ctx: Context, formId: string) {
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
          .webApp('📊 View Responses', responsesUrl(formId)).row()
          .text('🔒 Close Form', `form:close:${formId}`).row()
          .text('📤 Share Link', `form:share:${formId}`);
      } else if (form.status === 'CLOSED') {
        keyboard
          .webApp('📊 View Responses', responsesUrl(formId)).row()
          .text('🔓 Re\\-open Form', `form:reopen:${formId}`).row()
          .text('🗑 Archive', `form:delete:${formId}`);
      } else if (form.status === 'DRAFT' || form.status === 'PAYMENT_PENDING') {
        keyboard.text('🚀 Activate Form', `form:activate:${formId}`);
      }

      const text = `📄 *${esc(form.title)}*\nStatus: ${esc(statusLabel[form.status] ?? form.status)}\nQuestions: ${form.questions.length}\nResponses: ${responseCount}\nCreated: ${esc(new Date(form.createdAt).toLocaleDateString('en-NG'))}`;
      return send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch {
      return ctx.reply('Form not found\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async confirmClose(ctx: Context, formId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Close', `form:close:confirm:${formId}`)
      .text('Cancel', `form:view:${formId}`);
    return doEdit(ctx,
      '⚠️ Close this form? Respondents will no longer be able to fill it\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async closeForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.transition(formId, user.id, 'CLOSED');
      await doEdit(ctx,
        `🔒 *${esc(form.title)}* is now closed\\. No new responses accepted\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: new InlineKeyboard()
            .webApp('📊 View Responses', responsesUrl(formId)).row()
            .text('🔓 Re\\-open', `form:reopen:${formId}`),
        },
      );
    } catch { await ctx.reply('Could not close the form\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }

  async reopenForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.transition(formId, user.id, 'ACTIVE');
      await doEdit(ctx,
        `✅ *${esc(form.title)}* is now accepting responses again\\.`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: new InlineKeyboard()
            .webApp('📊 View Responses', responsesUrl(formId)).row()
            .text('🔒 Close Form', `form:close:${formId}`).row()
            .text('📤 Share Link', `form:share:${formId}`),
        },
      );
    } catch { await ctx.reply('Could not re\\-open the form\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }

  async shareLink(ctx: Context, formId: string) {
    try {
      const form = await this.formService.findById(formId);
      const link = form.shareLink ?? `https://t.me/${process.env.TELEGRAM_FILLER_BOT_USERNAME}?start=${form.shareToken}`;
      await ctx.reply(`📤 Share link:\n${link}`);
    } catch { await ctx.reply('Could not retrieve share link. Please try again.'); }
  }

  async confirmDelete(ctx: Context, formId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Archive', `form:delete:confirm:${formId}`)
      .text('Cancel', `form:view:${formId}`);
    return doEdit(ctx,
      '⚠️ Archive this form? Existing responses are preserved\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async archiveForm(ctx: Context, formId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      await this.formService.delete(formId, user.id);
      await doEdit(ctx, '🗄 Form archived\\. Use /myforms to view your forms\\.', { parse_mode: 'MarkdownV2' });
    } catch (err: any) {
      await ctx.reply(esc(err?.message ?? 'Could not archive the form\\.'), { parse_mode: 'MarkdownV2' });
    }
  }

  // ─── Responses ────────────────────────────────────────────────────────────────

  async showResponses(ctx: Context, formId: string, page: number) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const form = await this.formService.findById(formId);
      if (form.creatorId !== user.id) return ctx.reply('Form not found\\.', { parse_mode: 'MarkdownV2' });

      const { responses, total } = await this.responseService.getResponsesForForm(formId, page, 1);

      if (total === 0) {
        return send(ctx,
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

      return send(ctx,
        `📊 *Response ${page} of ${total}*\n${esc(new Date(resp.submittedAt).toLocaleString('en-NG'))}\n${'─'.repeat(22)}\n${answerLines}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch { await ctx.reply('Could not load responses\\. Please try again\\.', { parse_mode: 'MarkdownV2' }); }
  }
}
