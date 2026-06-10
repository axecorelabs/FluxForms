import { Context } from 'grammy';

/** Shared conversation step keys for the creator bot state machine. */
export const STEP = {
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
  // Email verification
  AWAITING_EMAIL: 'AWAITING_EMAIL',
  AWAITING_EMAIL_CODE: 'AWAITING_EMAIL_CODE',
} as const;

export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  HIRING: '💼 Hiring',
  LEAD_QUALIFICATION: '🎯 Lead Qualification',
  CUSTOMER_FEEDBACK: '⭐ Customer Feedback',
  CLIENT_ONBOARDING: '🤝 Client Onboarding',
  MARKET_RESEARCH: '📊 Market Research',
  CUSTOM: '✏️ Custom',
};

export const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: '📝 Text',
  NUMBER: '🔢 Number',
  BOOLEAN: '✅ Yes/No',
  DATE: '📅 Date',
  ARRAY: '📋 List',
  RATING: '⭐ Rating',
};

export type BotCtx = Record<string, unknown>;

export function responsesUrl(formId: string): string {
  const base = process.env.MINI_APP_URL ?? 'https://app.fluxforms.io';
  return `${base}/responses?formId=${formId}`;
}

export function tid(ctx: Context): string {
  return String(ctx.from?.id ?? '0');
}

export function userData(ctx: Context) {
  return {
    username: ctx.from?.username,
    firstName: ctx.from?.first_name,
    lastName: ctx.from?.last_name,
  };
}

/** Escape special MarkdownV2 characters */
export function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    TEXT: 'Text', NUMBER: 'Number', EMAIL: 'Email',
    YES_NO: 'Yes/No', MULTIPLE_CHOICE: 'Multiple Choice',
  };
  return labels[type] ?? type;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Send or edit depending on whether this is a callback context */
export function send(ctx: Context, text: string, extra: object) {
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, extra as any).catch(() => ctx.reply(text, extra as any));
  }
  return ctx.reply(text, extra as any);
}

/** Edit current message, fall back to new message on failure */
export function doEdit(ctx: Context, text: string, extra: object) {
  return ctx.editMessageText(text, extra as any).catch(() => ctx.reply(text, extra as any));
}
