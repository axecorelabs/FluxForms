import { Injectable } from '@nestjs/common';
import { Context, InlineKeyboard } from 'grammy';
import { truncate } from '@fluxforms/utils';
import { InterviewService } from '../interview/interview.service';
import { BotStateService } from '../bot-state/bot-state.service';
import { AuthService } from '../auth/auth.service';
import {
  STEP, INTERVIEW_TYPE_LABELS, FIELD_TYPE_LABELS, esc, tid, userData, send, doEdit,
} from './bot-shared';

/**
 * Creator-bot conversation handlers for the AI interview lifecycle:
 * creation wizard, schema-field builder, activation and management.
 */
@Injectable()
export class CreatorInterviewFlow {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly botStateService: BotStateService,
    private readonly authService: AuthService,
  ) {}

  private async upsertUser(ctx: Context) {
    return this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
  }

  // ─── Interview commands ───────────────────────────────────────────────────────

  async onCreateInterviewCommand(ctx: Context) {
    await this.upsertUser(ctx);
    const keyboard = new InlineKeyboard()
      .text(INTERVIEW_TYPE_LABELS['HIRING'],            'interview:type:HIRING').row()
      .text(INTERVIEW_TYPE_LABELS['LEAD_QUALIFICATION'], 'interview:type:LEAD_QUALIFICATION').row()
      .text(INTERVIEW_TYPE_LABELS['CUSTOMER_FEEDBACK'],  'interview:type:CUSTOMER_FEEDBACK').row()
      .text(INTERVIEW_TYPE_LABELS['CLIENT_ONBOARDING'],  'interview:type:CLIENT_ONBOARDING').row()
      .text(INTERVIEW_TYPE_LABELS['MARKET_RESEARCH'],    'interview:type:MARKET_RESEARCH').row()
      .text(INTERVIEW_TYPE_LABELS['CUSTOM'],             'interview:type:CUSTOM').row()
      .text('✗ Cancel', 'interview:wizard:cancel');

    await ctx.reply(
      `🤖 *Create a Flux Interview*\n\nAn AI will conduct natural conversations and extract structured data for you\\.\n\nChoose the interview type:`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async onInterviewTypeSelected(ctx: Context, type: string) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_TITLE, { interviewType: type });
    const label = esc(INTERVIEW_TYPE_LABELS[type] ?? type);
    await doEdit(ctx,
      `${label} interview selected\\.\n\nWhat's the *title* of this interview?\n\n_Example: Q4 Sales Lead Screening_\n\n_Use /cancel at any time to stop\\._`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  async onMyInterviews(ctx: Context) {
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

    return send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
  }

  // ─── Interview creation flow ──────────────────────────────────────────────────

  async onInterviewTitleReceived(ctx: Context) {
    const title = ctx.message?.text?.trim() ?? '';
    if (title.length < 3)   return ctx.reply('⚠️ Title must be at least 3 characters\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (title.length > 100) return ctx.reply('⚠️ Title must be at most 100 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_OBJECTIVE, {
      ...(state?.context as object),
      interviewTitle: title,
    });

    await ctx.reply(
      `✅ Title saved: *${esc(title)}*\n\nNow describe the *objective* of this interview\\.\nWhat information are you trying to collect?\n\n_Example: Screen frontend developer candidates for a senior React role\\. Assess technical skills, experience, and culture fit\\._\n\n_Use /cancel at any time to stop\\._`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  async onInterviewObjectiveReceived(ctx: Context) {
    const objective = ctx.message?.text?.trim() ?? '';
    if (objective.length < 10)  return ctx.reply('⚠️ Objective too short — be more descriptive\\. Try again:', { parse_mode: 'MarkdownV2' });
    if (objective.length > 500) return ctx.reply('⚠️ Objective must be at most 500 characters\\. Try again:', { parse_mode: 'MarkdownV2' });

    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_AWAITING_CONTEXT, {
      ...(state?.context as object),
      interviewObjective: objective,
    });

    const keyboard = new InlineKeyboard()
      .text('Skip →', 'interview:context:skip')
      .text('✗ Cancel', 'interview:wizard:cancel');
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

  async onInterviewContextReceived(ctx: Context) {
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

  async onInterviewContextSkipped(ctx: Context) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', null, (state?.context as unknown as Record<string, unknown>) ?? {});
    await this.createInterviewFromState(ctx);
  }

  async onInterviewWizardCancel(ctx: Context) {
    await this.botStateService.clearState(tid(ctx), 'CREATOR');
    return doEdit(ctx, '✗ Cancelled\\. Nothing was saved\\.', { parse_mode: 'MarkdownV2' });
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

    if (!user.emailVerified) {
      await ctx.reply(
        `📧 _Add your email with /addemail to get notified when responses come in\\._`,
        { parse_mode: 'MarkdownV2' },
      ).catch(() => undefined);
    }

    const keyboard = new InlineKeyboard()
      .text('➕ Add Data Fields', `interview:addfield:${interview.id}`).row()
      .text('🚀 Activate Interview', `interview:activate:${interview.id}`);

    const typeLabel = esc(INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type);
    const msg = `✅ *Interview created\\!*\n\n*${esc(interview.title)}*\nType: ${typeLabel}\n\nNext: Add the data fields you want the AI to extract, then activate\\.`;

    if (ctx.callbackQuery) {
      await doEdit(ctx, msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    }
  }

  // ─── Interview field flow ─────────────────────────────────────────────────────

  async startAddField(ctx: Context, interviewId: string) {
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_FIELD_DISPLAY_NAME, { interviewId });
    await doEdit(ctx,
      `➕ *Add a Data Field*\n\nEnter the name of *one field* you want the AI to collect\\.\nYou'll add the rest one by one after this\\.\n\n*Some ideas:*\n• Full Name\n• Years of Experience\n• Salary Expectation\n• Current Company\n\n_Max 60 characters\\._`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  async onFieldDisplayNameReceived(ctx: Context) {
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

  async onFieldTypeSelected(ctx: Context, fieldType: string) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    await this.botStateService.setState(tid(ctx), 'CREATOR', STEP.INTERVIEW_FIELD_DESCRIPTION, {
      ...(state?.context as object),
      fieldType,
    });
    await doEdit(ctx,
      `Type: *${esc(FIELD_TYPE_LABELS[fieldType] ?? fieldType)}*\n\nBriefly describe what you want the AI to extract for this field:\n\n_Example: Total years of professional software development experience_`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  async onFieldDescriptionReceived(ctx: Context) {
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

  async onFieldRequiredSelected(ctx: Context, isRequiredStr: string) {
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

    await doEdit(ctx,
      `✅ *${esc(ctxData.fieldDisplayName)}* added \\[${esc(FIELD_TYPE_LABELS[ctxData.fieldType] ?? ctxData.fieldType)}\\]\n\nAdd more fields or activate the interview\\.`,
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async onFieldsDone(ctx: Context) {
    const state = await this.botStateService.getState(tid(ctx), 'CREATOR');
    const ctxData = (state?.context ?? {}) as Record<string, string>;
    if (ctxData.interviewId) {
      return this.showInterviewCard(ctx, ctxData.interviewId);
    }
  }

  // ─── Interview management ─────────────────────────────────────────────────────

  async showInterviewCard(ctx: Context, interviewId: string) {
    try {
      const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
      const interview = await this.interviewService.findById(interviewId);
      if (interview.creatorId !== user.id) return ctx.reply('Interview not found\\.', { parse_mode: 'MarkdownV2' });

      const statusLabel: Record<string, string> = {
        DRAFT: '📝 Draft', ACTIVE: '🟢 Active', CLOSED: '🔴 Closed', ARCHIVED: '🗄 Archived',
      };

      const dashboardUrl = `${process.env.DASHBOARD_URL ?? 'https://dashboard.fluxforms.io'}/interviews/${interviewId}`;
      const keyboard = new InlineKeyboard();
      if (interview.status === 'DRAFT') {
        keyboard
          .text('➕ Add Field', `interview:addfield:${interviewId}`).row()
          .text('🚀 Activate', `interview:activate:${interviewId}`);
      } else if (interview.status === 'ACTIVE') {
        keyboard
          .url('📊 View Responses', dashboardUrl).row()
          .text('📤 Share Link', `interview:share:${interviewId}`).row()
          .text('🔒 Close', `interview:close:${interviewId}`);
      } else if (interview.status === 'CLOSED' || interview.status === 'ARCHIVED') {
        keyboard.url('📊 View Responses', dashboardUrl);
      }

      const fieldList = interview.schemaFields.length > 0
        ? (interview.schemaFields as Array<{ displayName: string; fieldType: string }>).map(f => `  • ${esc(f.displayName)} \\[${esc(f.fieldType)}\\]`).join('\n')
        : '  _No fields yet_';

      const text = `🤖 *${esc(interview.title)}*\nStatus: ${esc(statusLabel[interview.status] ?? interview.status)}\nType: ${esc(INTERVIEW_TYPE_LABELS[interview.type] ?? interview.type)}\nCompleted: ${interview.completedCount}\n\n*Fields:*\n${fieldList}`;

      return send(ctx, text, { parse_mode: 'MarkdownV2', reply_markup: keyboard });
    } catch {
      return ctx.reply('Interview not found\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async activateInterview(ctx: Context, interviewId: string) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      const interview = await this.interviewService.activate(interviewId, user.id);
      const dashboardUrl = `${process.env.DASHBOARD_URL ?? 'https://dashboard.fluxforms.io'}/interviews/${interviewId}`;
      const keyboard = new InlineKeyboard()
        .text('📤 Share Link', `interview:share:${interviewId}`).row()
        .url('📊 View Responses', dashboardUrl);

      await doEdit(ctx,
        `🚀 *Interview is now LIVE\\!*\n\n*${esc(interview.title)}*\n\nShare this link with your audience:\n${esc(interview.shareLink ?? '')}`,
        { parse_mode: 'MarkdownV2', reply_markup: keyboard },
      );
    } catch (err: any) {
      const msg = err?.message ?? 'Could not activate the interview\\.';
      await ctx.reply(esc(msg), { parse_mode: 'MarkdownV2' });
    }
  }

  async shareInterviewLink(ctx: Context, interviewId: string) {
    try {
      const interview = await this.interviewService.findById(interviewId);
      await ctx.reply(`📤 *Share link:*\n${esc(interview.shareLink ?? '')}`, { parse_mode: 'MarkdownV2' });
    } catch {
      await ctx.reply('Could not retrieve share link\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async confirmCloseInterview(ctx: Context, interviewId: string) {
    const keyboard = new InlineKeyboard()
      .text('Yes, Close', `interview:close:confirm:${interviewId}`)
      .text('Cancel', `interview:view:${interviewId}`);
    return doEdit(ctx,
      '⚠️ Close this interview? It will stop accepting new respondents\\.',
      { parse_mode: 'MarkdownV2', reply_markup: keyboard },
    );
  }

  async closeInterview(ctx: Context, interviewId: string) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      const interview = await this.interviewService.close(interviewId, user.id);
      await doEdit(ctx,
        `🔒 *${esc(interview.title)}* is now closed\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    } catch {
      await ctx.reply('Could not close the interview\\.', { parse_mode: 'MarkdownV2' });
    }
  }

  async deleteInterview(ctx: Context, interviewId: string) {
    const user = await this.authService.upsertUser({ telegramId: tid(ctx), ...userData(ctx) });
    try {
      await this.interviewService.delete(interviewId, user.id);
      await doEdit(ctx, '🗑 Interview deleted\\.', { parse_mode: 'MarkdownV2' });
    } catch (err: any) {
      await ctx.reply(esc(err?.message ?? 'Could not delete the interview\\.'), { parse_mode: 'MarkdownV2' });
    }
  }
}
