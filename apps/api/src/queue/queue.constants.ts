export const QUEUES = {
  BOT_UPDATES:   'bot-updates',
  EXTRACTION:    'extraction',
  NOTIFICATIONS: 'notifications',
} as const;

export const JOBS = {
  CREATOR_UPDATE:       'creator-update',
  FILLER_UPDATE:        'filler-update',
  EXTRACT_ENTITIES:     'extract-entities',
  NOTIFY_INTERVIEW_DONE: 'notify-interview-completed',
  NOTIFY_PAYMENT_SUCCESS: 'notify-payment-success',
} as const;

// ─── Job data shapes ──────────────────────────────────────────────────────────

export interface BotUpdateJobData {
  bot: 'creator' | 'filler';
  update: Record<string, unknown>;
}

export interface SerializedField {
  fieldName: string;
  displayName: string;
  fieldType: string;
  description: string;
  isRequired: boolean;
  orderIndex: number;
}

export interface ExtractionJobData {
  sessionId: string;
  interviewId: string;
  schemaFields: SerializedField[];
  fullHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  extractionSystemPrompt: string;
  isFinal: boolean;
}

export interface NotifyInterviewDoneData {
  sessionId: string;
  interviewId: string;
  creatorId: string;
  userTelegramId: string;
  interviewTitle: string;
}

export interface NotifyPaymentSuccessData {
  formId: string;
  creatorTelegramId: string;
}

export interface NotifyFormSubmittedData {
  formId: string;
  responseId: string;
  creatorId: string;
}

export interface NotificationJobData {
  type: 'interview.completed' | 'payment.success' | 'form.submitted';
  payload: unknown;
}
