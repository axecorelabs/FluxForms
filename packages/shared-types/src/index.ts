export enum FormStatus {
  DRAFT = 'DRAFT',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

export enum SessionState {
  ACTIVE = 'ACTIVE',
  REVIEW = 'REVIEW',
  SUBMITTED = 'SUBMITTED',
  INTERRUPTED = 'INTERRUPTED',
}

export enum QuestionType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  EMAIL = 'EMAIL',
  YES_NO = 'YES_NO',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentProvider {
  PAYSTACK = 'PAYSTACK',
  FLUTTERWAVE = 'FLUTTERWAVE',
}

export enum UserRole {
  CREATOR = 'CREATOR',
  FILLER = 'FILLER',
  BOTH = 'BOTH',
  ADMIN = 'ADMIN',
}

export enum BotType {
  CREATOR = 'CREATOR',
  FILLER = 'FILLER',
}

export enum ResponseStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  INVALID = 'INVALID',
}

export type AnswerMap = Record<string, string | number | boolean>;

export interface QuestionItem {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  orderIndex: number;
  isRequired: boolean;
}

export interface FormWithQuestions {
  id: string;
  title: string;
  description?: string | null;
  status: FormStatus;
  shareToken?: string | null;
  questions: QuestionItem[];
}

export interface SessionSnapshot {
  id: string;
  formId: string;
  userTelegramId: string;
  state: SessionState;
  currentIndex: number;
  answers: AnswerMap;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
