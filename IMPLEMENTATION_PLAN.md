# FluxForms — Detailed Implementation Plan

> Version: 1.0 | Date: 2026-06-07 | Based on PRD v1

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Monorepo Setup](#2-monorepo-setup)
3. [Database Schema (Deep)](#3-database-schema-deep)
4. [Shared Packages](#4-shared-packages)
5. [NestJS API — Module-by-Module](#5-nestjs-api--module-by-module)
6. [Creator Bot — Full Flow](#6-creator-bot--full-flow)
7. [Filler Bot — Full Flow](#7-filler-bot--full-flow)
8. [State Machines (Critical)](#8-state-machines-critical)
9. [Payment Integration](#9-payment-integration)
10. [Admin Dashboard (Next.js)](#10-admin-dashboard-nextjs)
11. [Security Design](#11-security-design)
12. [Scalability Design](#12-scalability-design)
13. [Deployment & Infrastructure](#13-deployment--infrastructure)
14. [Implementation Phases](#14-implementation-phases)
15. [Testing Strategy](#15-testing-strategy)

---

## 1. Architecture Overview

### 1.1 System Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                         TELEGRAM                                  │
│   Creator Bot ──────────────────────────── Filler Bot            │
│   (form builders)                         (respondents)           │
└────────┬──────────────────────────────────────┬──────────────────┘
         │ HTTPS Webhook                         │ HTTPS Webhook
         ▼                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     NestJS API (SINGLE SOURCE OF TRUTH)          │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ AuthMod  │ │ FormMod  │ │ SessionM │ │  PaymentModule   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ QuestionM│ │ ResponseM│ │ BotModule│ │   AdminModule    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
         ┌────▼─────┐              ┌────────▼──────┐
         │ Supabase │              │  Paystack /   │
         │ Postgres │              │  Flutterwave  │
         └──────────┘              └───────────────┘
                             │
                    ┌────────▼────────┐
                    │  Next.js Admin  │
                    │   Dashboard     │
                    └─────────────────┘
```

### 1.2 Critical Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| ORM | Prisma | Type-safe, migration-first, excellent Supabase support |
| Telegram integration | grammY | Modern, webhook-native, TypeScript-first |
| Session storage | Postgres (sessions table) | No Redis needed for MVP; simpler ops |
| Bot state | DB-backed per user | Survives restarts, supports horizontal scaling |
| Webhook security | Secret token validation | Telegram signs webhooks with a secret |
| API auth | JWT (short-lived) + Telegram-signed init data | No passwords |
| Payment | Paystack primary, Flutterwave fallback | HMAC webhook verification on both |
| Payment UX | Telegram Mini App (Web App) | Opens as bottom sheet inside Telegram — no external browser navigation |
| Monorepo | Turborepo + pnpm workspaces | Fast builds, shared cache |

---

## 2. Monorepo Setup

### 2.1 Directory Tree

```
fluxforms/
├── apps/
│   ├── api/                    # NestJS — main backend
│   ├── bot-creator/            # NestJS app — Creator Telegram bot
│   ├── bot-filler/             # NestJS app — Filler Telegram bot
│   ├── admin/                  # Next.js 14 — Admin dashboard
│   └── mini-app/               # Next.js — Telegram Mini App (payment screen only)
├── packages/
│   ├── shared-types/           # TypeScript types, enums, DTOs
│   ├── state-machine/          # Pure functions — all state transitions
│   ├── validators/             # Shared input validation (zod schemas)
│   └── utils/                  # Shared utility functions
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 2.2 Turborepo Pipeline

```json
// turbo.json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev":   { "cache": false, "persistent": true },
    "test":  { "dependsOn": ["^build"] },
    "lint":  {}
  }
}
```

### 2.3 Shared Package Exports

```
packages/shared-types → FormStatus, SessionState, QuestionType, DTOs
packages/state-machine → canTransitionForm(), transitionSession(), validateAnswer()
packages/validators → zod schemas for every input surface
packages/utils → formatDate(), generateShareLink(), maskEmail()
```

---

## 3. Database Schema (Deep)

### 3.1 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Users ───────────────────────────────────────────────────────────────────

model User {
  id          String   @id @default(cuid())
  telegramId  String   @unique @map("telegram_id")
  username    String?
  firstName   String?  @map("first_name")
  lastName    String?  @map("last_name")
  role        Role     @default(FILLER)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  forms     Form[]
  sessions  Session[]
  payments  Payment[]

  @@map("users")
}

enum Role {
  CREATOR
  FILLER
  BOTH
  ADMIN
}

// ─── Forms ───────────────────────────────────────────────────────────────────

model Form {
  id            String      @id @default(cuid())
  creatorId     String      @map("creator_id")
  title         String
  description   String?
  status        FormStatus  @default(DRAFT)
  shareLink     String?     @unique @map("share_link")
  shareToken    String?     @unique @map("share_token")   // t.me/fillerbot?start=<shareToken>
  closedAt      DateTime?   @map("closed_at")
  archivedAt    DateTime?   @map("archived_at")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  creator    User       @relation(fields: [creatorId], references: [id])
  questions  Question[]
  sessions   Session[]
  responses  Response[]
  payment    Payment?

  @@map("forms")
}

enum FormStatus {
  DRAFT
  PAYMENT_PENDING
  ACTIVE
  CLOSED
  ARCHIVED
}

// ─── Questions ───────────────────────────────────────────────────────────────

model Question {
  id          String       @id @default(cuid())
  formId      String       @map("form_id")
  text        String
  type        QuestionType
  options     Json?        // only for MULTIPLE_CHOICE; string[]
  isRequired  Boolean      @default(true) @map("is_required")
  orderIndex  Int          @map("order_index")
  createdAt   DateTime     @default(now()) @map("created_at")

  form  Form  @relation(fields: [formId], references: [id], onDelete: Cascade)

  @@unique([formId, orderIndex])
  @@map("questions")
}

enum QuestionType {
  TEXT
  NUMBER
  EMAIL
  YES_NO
  MULTIPLE_CHOICE
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

model Session {
  id               String        @id @default(cuid())
  formId           String        @map("form_id")
  userTelegramId   String        @map("user_telegram_id")
  userId           String?       @map("user_id")           // linked if user registered
  state            SessionState  @default(ACTIVE)
  currentIndex     Int           @default(0) @map("current_index")
  answers          Json          @default("{}")             // Record<questionId, answer>
  interruptedAt    DateTime?     @map("interrupted_at")
  submittedAt      DateTime?     @map("submitted_at")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  form      Form      @relation(fields: [formId], references: [id])
  user      User?     @relation(fields: [userId], references: [id])
  response  Response?

  // One active session per user per form
  @@unique([formId, userTelegramId])
  @@map("sessions")
}

enum SessionState {
  ACTIVE
  REVIEW
  SUBMITTED
  INTERRUPTED
}

// ─── Responses ────────────────────────────────────────────────────────────────

model Response {
  id          String         @id @default(cuid())
  sessionId   String         @unique @map("session_id")
  formId      String         @map("form_id")
  answers     Json                                         // final snapshot of answers
  status      ResponseStatus @default(SUBMITTED)
  submittedAt DateTime       @default(now()) @map("submitted_at")
  createdAt   DateTime       @default(now()) @map("created_at")

  session  Session  @relation(fields: [sessionId], references: [id])
  form     Form     @relation(fields: [formId], references: [id])

  @@map("responses")
}

enum ResponseStatus {
  IN_PROGRESS   // stored while session is ACTIVE (redundant but useful for admin)
  SUBMITTED
  INVALID       // form closed mid-session, partial only
}

// ─── Payments ─────────────────────────────────────────────────────────────────

model Payment {
  id          String        @id @default(cuid())
  formId      String        @unique @map("form_id")
  creatorId   String        @map("creator_id")
  amount      Int           // in kobo (₦1000 = 100000 kobo)
  currency    String        @default("NGN")
  status      PaymentStatus @default(PENDING)
  reference   String        @unique                        // Paystack/Flutterwave txn ref
  provider    PaymentProvider
  providerRef String?       @map("provider_ref")          // provider's own ID
  paidAt      DateTime?     @map("paid_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  form     Form  @relation(fields: [formId], references: [id])
  creator  User  @relation(fields: [creatorId], references: [id])

  @@map("payments")
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
  REFUNDED
}

enum PaymentProvider {
  PAYSTACK
  FLUTTERWAVE
}

// ─── BotState (per-user conversation state for bots) ─────────────────────────

model BotState {
  id             String   @id @default(cuid())
  telegramId     String   @map("telegram_id")
  botType        BotType  @map("bot_type")
  conversationStep String? @map("conversation_step")       // e.g. "AWAITING_TITLE"
  context        Json     @default("{}")                    // arbitrary temp data
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([telegramId, botType])
  @@map("bot_states")
}

enum BotType {
  CREATOR
  FILLER
}
```

### 3.2 Key Index Strategy

```sql
-- Performance indexes (add via Prisma @@index)
CREATE INDEX idx_forms_creator_id       ON forms(creator_id);
CREATE INDEX idx_forms_status           ON forms(status);
CREATE INDEX idx_questions_form_id      ON questions(form_id, order_index);
CREATE INDEX idx_sessions_telegram_id   ON sessions(user_telegram_id);
CREATE INDEX idx_sessions_form_id       ON sessions(form_id);
CREATE INDEX idx_responses_form_id      ON responses(form_id);
CREATE INDEX idx_payments_creator_id    ON payments(creator_id);
CREATE INDEX idx_bot_state_lookup       ON bot_states(telegram_id, bot_type);
```

### 3.3 Row-Level Security (Supabase RLS)

For the admin dashboard connecting directly to Supabase:

```sql
-- Only admin role can see all rows
-- API service role bypasses RLS entirely (uses service_role key)
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON forms FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');
```

---

## 4. Shared Packages

### 4.1 `packages/shared-types`

```typescript
// index.ts

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

export interface AnswerMap {
  [questionId: string]: string | number | boolean;
}

export interface FormWithQuestions {
  id: string;
  title: string;
  status: FormStatus;
  questions: QuestionItem[];
}

export interface QuestionItem {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  orderIndex: number;
  isRequired: boolean;
}

export interface SessionSnapshot {
  id: string;
  formId: string;
  state: SessionState;
  currentIndex: number;
  answers: AnswerMap;
}
```

### 4.2 `packages/state-machine`

```typescript
// form-machine.ts

import { FormStatus } from '@fluxforms/shared-types';

const FORM_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  [FormStatus.DRAFT]:           [FormStatus.PAYMENT_PENDING, FormStatus.ARCHIVED],
  [FormStatus.PAYMENT_PENDING]: [FormStatus.ACTIVE, FormStatus.ARCHIVED],
  [FormStatus.ACTIVE]:          [FormStatus.CLOSED],
  [FormStatus.CLOSED]:          [FormStatus.ACTIVE, FormStatus.ARCHIVED],
  [FormStatus.ARCHIVED]:        [],
};

export function canTransitionForm(from: FormStatus, to: FormStatus): boolean {
  return FORM_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertFormTransition(from: FormStatus, to: FormStatus): void {
  if (!canTransitionForm(from, to)) {
    throw new Error(`Invalid form transition: ${from} → ${to}`);
  }
}
```

```typescript
// session-machine.ts

import { SessionState } from '@fluxforms/shared-types';

const SESSION_TRANSITIONS: Record<SessionState, SessionState[]> = {
  [SessionState.ACTIVE]:      [SessionState.REVIEW, SessionState.INTERRUPTED],
  [SessionState.REVIEW]:      [SessionState.ACTIVE, SessionState.SUBMITTED],
  [SessionState.SUBMITTED]:   [],
  [SessionState.INTERRUPTED]: [],
};

export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}
```

```typescript
// validator.ts

import { QuestionType } from '@fluxforms/shared-types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAnswer(
  type: QuestionType,
  value: string,
  options?: string[],
): { valid: boolean; error?: string } {
  switch (type) {
    case QuestionType.TEXT:
      return value.trim().length > 0
        ? { valid: true }
        : { valid: false, error: 'Answer cannot be empty.' };

    case QuestionType.NUMBER:
      return !isNaN(Number(value))
        ? { valid: true }
        : { valid: false, error: 'Please enter a valid number.' };

    case QuestionType.EMAIL:
      return EMAIL_REGEX.test(value.trim())
        ? { valid: true }
        : { valid: false, error: 'Please enter a valid email address.' };

    case QuestionType.YES_NO:
      return ['yes', 'no'].includes(value.toLowerCase())
        ? { valid: true }
        : { valid: false, error: 'Please select Yes or No.' };

    case QuestionType.MULTIPLE_CHOICE:
      return options?.includes(value)
        ? { valid: true }
        : { valid: false, error: 'Please select a valid option.' };

    default:
      return { valid: false, error: 'Unknown question type.' };
  }
}
```

---

## 5. NestJS API — Module-by-Module

### 5.1 Module Structure

```
apps/api/src/
├── main.ts
├── app.module.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   ├── guards/
│   │   │   ├── jwt.guard.ts
│   │   │   └── admin.guard.ts
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   ├── webhook/
│   │   ├── webhook.module.ts
│   │   ├── webhook.controller.ts     # POST /webhook/creator-bot, POST /webhook/filler-bot
│   │   └── webhook.guard.ts          # Telegram secret token validation
│   ├── form/
│   │   ├── form.module.ts
│   │   ├── form.service.ts
│   │   ├── form.controller.ts
│   │   └── dto/
│   │       ├── create-form.dto.ts
│   │       └── update-form-status.dto.ts
│   ├── question/
│   │   ├── question.module.ts
│   │   ├── question.service.ts
│   │   └── dto/
│   │       └── create-question.dto.ts
│   ├── session/
│   │   ├── session.module.ts
│   │   ├── session.service.ts
│   │   ├── session.controller.ts
│   │   └── dto/
│   │       ├── start-session.dto.ts
│   │       └── submit-answer.dto.ts
│   ├── response/
│   │   ├── response.module.ts
│   │   ├── response.service.ts
│   │   └── response.controller.ts
│   ├── payment/
│   │   ├── payment.module.ts
│   │   ├── payment.service.ts
│   │   ├── payment.controller.ts
│   │   ├── providers/
│   │   │   ├── paystack.provider.ts
│   │   │   └── flutterwave.provider.ts
│   │   └── dto/
│   │       └── init-payment.dto.ts
│   ├── bot/
│   │   ├── bot.module.ts
│   │   ├── creator-bot.service.ts
│   │   └── filler-bot.service.ts
│   └── admin/
│       ├── admin.module.ts
│       ├── admin.service.ts
│       └── admin.controller.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── common/
    ├── filters/
    │   └── http-exception.filter.ts
    ├── interceptors/
    │   └── logging.interceptor.ts
    ├── pipes/
    │   └── zod-validation.pipe.ts
    └── decorators/
        └── telegram-user.decorator.ts
```

### 5.2 Webhook Controller (Security-Critical)

```typescript
// webhook.controller.ts

@Controller('webhook')
export class WebhookController {
  @Post('creator-bot')
  @UseGuards(TelegramWebhookGuard)
  async creatorWebhook(@Body() update: TelegramUpdate) {
    await this.creatorBotService.handleUpdate(update);
    return { ok: true };
  }

  @Post('filler-bot')
  @UseGuards(TelegramWebhookGuard)
  async fillerWebhook(@Body() update: TelegramUpdate) {
    await this.fillerBotService.handleUpdate(update);
    return { ok: true };
  }
}
```

```typescript
// webhook.guard.ts — validates Telegram secret token header

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!secretToken || secretToken !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    return true;
  }
}
```

### 5.3 Session Service (Core Logic)

```typescript
// session.service.ts — key methods

async startSession(formId: string, telegramId: string): Promise<SessionSnapshot> {
  // 1. Load form with questions
  const form = await this.prisma.form.findUnique({
    where: { id: formId },
    include: { questions: { orderBy: { orderIndex: 'asc' } } },
  });

  // 2. Gate: form must be ACTIVE
  if (!form || form.status !== FormStatus.ACTIVE) {
    throw new BadRequestException('Form is not accepting responses.');
  }

  // 3. Gate: duplicate submission check (upsert-or-fail pattern)
  const existing = await this.prisma.session.findUnique({
    where: { formId_userTelegramId: { formId, userTelegramId: telegramId } },
  });

  if (existing?.state === SessionState.SUBMITTED) {
    throw new ConflictException('You have already submitted this form.');
  }

  if (existing?.state === SessionState.ACTIVE || existing?.state === SessionState.REVIEW) {
    // Resume existing session
    return this.toSnapshot(existing);
  }

  // 4. Create new session
  const session = await this.prisma.session.create({
    data: { formId, userTelegramId: telegramId, state: 'ACTIVE', currentIndex: 0, answers: {} },
  });
  return this.toSnapshot(session);
}

async submitAnswer(
  sessionId: string,
  telegramId: string,
  rawValue: string,
): Promise<{ next: 'QUESTION' | 'REVIEW'; snapshot: SessionSnapshot }> {
  const session = await this.getAndGuardSession(sessionId, telegramId);
  const form = await this.getFormWithQuestions(session.formId);

  // Gate: form must still be ACTIVE
  if (form.status !== FormStatus.ACTIVE) {
    await this.interruptSession(session.id);
    throw new GoneException('Form closed.');
  }

  const question = form.questions[session.currentIndex];
  const validation = validateAnswer(question.type, rawValue, question.options as string[]);

  if (!validation.valid) {
    throw new UnprocessableEntityException(validation.error);
  }

  const newAnswers = { ...(session.answers as object), [question.id]: rawValue };
  const nextIndex = session.currentIndex + 1;
  const isLast = nextIndex >= form.questions.length;

  const updated = await this.prisma.session.update({
    where: { id: session.id },
    data: {
      answers: newAnswers,
      currentIndex: isLast ? session.currentIndex : nextIndex,
      state: isLast ? 'REVIEW' : 'ACTIVE',
    },
  });

  return { next: isLast ? 'REVIEW' : 'QUESTION', snapshot: this.toSnapshot(updated) };
}

async goBack(sessionId: string, telegramId: string): Promise<SessionSnapshot> {
  const session = await this.getAndGuardSession(sessionId, telegramId);

  if (session.currentIndex === 0) {
    throw new BadRequestException('Already at first question.');
  }

  const updated = await this.prisma.session.update({
    where: { id: session.id },
    data: {
      currentIndex: session.currentIndex - 1,
      state: 'ACTIVE',
    },
  });
  return this.toSnapshot(updated);
}

async submitFinal(sessionId: string, telegramId: string): Promise<void> {
  const session = await this.getAndGuardSession(sessionId, telegramId);

  if (session.state !== SessionState.REVIEW) {
    throw new BadRequestException('Session is not in review state.');
  }

  await this.prisma.$transaction([
    this.prisma.session.update({
      where: { id: session.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    }),
    this.prisma.response.create({
      data: {
        sessionId: session.id,
        formId: session.formId,
        answers: session.answers as object,
        status: 'SUBMITTED',
      },
    }),
  ]);
}

private async interruptSession(sessionId: string): Promise<void> {
  await this.prisma.session.update({
    where: { id: sessionId },
    data: { state: 'INTERRUPTED', interruptedAt: new Date() },
  });
}
```

### 5.4 Payment Service

```typescript
// payment.service.ts

async initPayment(formId: string, creatorTelegramId: string): Promise<{ paymentUrl: string; reference: string }> {
  // Idempotency: if payment already pending, return same link
  const existing = await this.prisma.payment.findUnique({ where: { formId } });
  if (existing?.status === 'SUCCESS') throw new ConflictException('Already paid.');

  const reference = `fluxforms_${formId}_${Date.now()}`;
  const user = await this.prisma.user.findUnique({ where: { telegramId: creatorTelegramId } });

  await this.prisma.payment.upsert({
    where: { formId },
    create: {
      formId, creatorId: user!.id, amount: 100000, currency: 'NGN',
      status: 'PENDING', reference, provider: 'PAYSTACK',
    },
    update: { reference, status: 'PENDING', provider: 'PAYSTACK' },
  });

  const paymentUrl = await this.paystackProvider.initializeTransaction({
    email: `${creatorTelegramId}@fluxforms.bot`,  // placeholder email for Paystack
    amount: 100000,
    reference,
    callback_url: `${process.env.API_URL}/payments/verify`,
    metadata: { formId, telegramId: creatorTelegramId },
  });

  return { paymentUrl, reference };
}

async handlePaystackWebhook(payload: PaystackWebhookPayload, signature: string): Promise<void> {
  // 1. HMAC-SHA512 verify
  this.paystackProvider.verifySignature(payload, signature);

  if (payload.event !== 'charge.success') return;

  const reference = payload.data.reference;
  const payment = await this.prisma.payment.findUnique({ where: { reference } });
  if (!payment) return;

  // 2. Idempotency: skip if already processed
  if (payment.status === 'SUCCESS') return;

  await this.prisma.$transaction([
    this.prisma.payment.update({
      where: { reference },
      data: { status: 'SUCCESS', paidAt: new Date(), providerRef: payload.data.id?.toString() },
    }),
    this.prisma.form.update({
      where: { id: payment.formId },
      data: { status: 'ACTIVE', shareToken: this.generateShareToken(), shareLink: '' },
    }),
  ]);

  // 3. Notify creator via bot
  await this.creatorBotService.notifyPaymentSuccess(payment.formId);
}
```

---

## 6. Creator Bot — Full Flow

### 6.1 Conversation Step Machine

The Creator Bot stores `conversationStep` in the `BotState` table. This makes the bot stateless between requests (any API instance can handle any message).

```
ConversationStep (Creator):
  IDLE
  AWAITING_TITLE
  AWAITING_QUESTION_TEXT
  AWAITING_QUESTION_TYPE
  AWAITING_CHOICE_OPTIONS       ← only for MULTIPLE_CHOICE
  CONFIRMING_ADD_MORE
  PAYMENT_PENDING
```

### 6.2 Message-by-Message Flow (Detailed)

#### `/start`

```
Bot → "Welcome to FluxForms! 👋
I help you create conversational forms.

Commands:
/createform – Create a new form
/myforms – View your forms"
```

#### `/createform`

```
Bot → inline keyboard:
"📄 Create Form
Each form costs ₦1,000 to activate.
You can build your form for free — pay only when ready.

[▶ Continue]  [✗ Cancel]"

→ On "Continue" callback:
  - Set BotState.step = AWAITING_TITLE
  
Bot → "What's the title of your form?"
```

#### `AWAITING_TITLE` (user sends text)

```
Validate: title must be 3–100 characters

→ Create Form record (status: DRAFT)
→ Store formId in BotState.context
→ Set step = AWAITING_QUESTION_TEXT

Bot → "Great! Now let's add your first question.
Type the question text below:"
```

#### `AWAITING_QUESTION_TEXT`

```
Validate: question text 3–300 characters

→ Store questionText in BotState.context
→ Set step = AWAITING_QUESTION_TYPE

Bot → inline keyboard:
"What type of answer should this question accept?

[📝 Text]  [🔢 Number]  [📧 Email]
[✅ Yes/No]  [📋 Multiple Choice]"
```

#### `AWAITING_QUESTION_TYPE` (callback)

```
If type == MULTIPLE_CHOICE:
  → Set step = AWAITING_CHOICE_OPTIONS
  Bot → "Send the options, one per line.
  Example:
  Option A
  Option B
  Option C"

Else:
  → Save Question to DB (with current orderIndex)
  → Set step = CONFIRMING_ADD_MORE
  
  Bot → inline keyboard:
  "✅ Question added!
  
  [+ Add Another Question]  [✓ Done — Preview Form]"
```

#### `AWAITING_CHOICE_OPTIONS`

```
Parse: split by newlines, trim, filter empty, require ≥ 2 options

→ Save Question with options to DB
→ Set step = CONFIRMING_ADD_MORE

Bot → inline keyboard:
"✅ Question added!

[+ Add Another Question]  [✓ Done — Preview Form]"
```

#### `CONFIRMING_ADD_MORE` (callback: Add Another)

```
→ Set step = AWAITING_QUESTION_TEXT
Bot → "Type your next question:"
```

#### `CONFIRMING_ADD_MORE` (callback: Done — Preview)

```
→ Fetch form with all questions
Bot → 
"📋 Form Preview: <title>
─────────────────
1. What is your name? [Text]
2. Your email? [Email]
3. Choose a plan [Multiple Choice: A, B, C]
─────────────────
Total: 3 questions

[💳 Pay ₦1,000 to Activate]  [✏ Edit]  [🗑 Delete]"
```

#### Payment Button

```
→ Call payment.service.initPayment()
→ Get signed Mini App URL (includes reference + formId as query params)
Bot →
"💳 Click below to complete payment.
After payment, your form will be activated instantly.

[Pay ₦1,000] (web_app button → opens Mini App as bottom sheet)"

NOTE: Uses InlineKeyboardButton with web_app: { url: MINI_APP_URL }
      NOT a regular URL button — this keeps the user fully inside Telegram.
```

#### After Payment Webhook Fires

```
→ Form status → ACTIVE
→ shareToken generated (cuid)
→ shareLink = t.me/fillerbot?start=<shareToken>

Creator Bot notifies:
"✅ Payment received! Your form is now LIVE.

📤 Share this link with respondents:
t.me/fillerbot?start=<shareToken>

[📊 View Responses]  [🔒 Close Form]  [📤 Share Link]"
```

#### `/myforms`

```
Bot → (paginated, 5 per page)
"📋 Your Forms:

1. Job Application — ACTIVE (12 responses)
2. Customer Survey — CLOSED (45 responses)

[View] buttons for each
[◀ Prev] [Next ▶] navigation"
```

#### `/form <id>` or pressing View

```
Bot →
"📄 Job Application
Status: 🟢 ACTIVE
Questions: 5
Responses: 12
Created: June 5, 2026

[📊 View Responses]  [🔒 Close Form]  [📤 Share Link]"
```

#### View Responses

```
Bot → (paginated, 1 response per screen)
"📊 Response #3 — June 6, 2026

1. Name: John Doe
2. Email: john@example.com
3. Experience: 5 years

[◀ Prev]  [Next ▶]  [⬅ Back to Form]"
```

#### Close Form

```
Bot → confirmation:
"Are you sure you want to close this form?
Respondents will no longer be able to fill it.

[Yes, Close]  [Cancel]"

→ On confirm:
  → Form status → CLOSED
  → All ACTIVE sessions → INTERRUPTED
Bot → "🔒 Form closed. No new responses accepted."
```

#### Re-open Form

```
Bot → (when form is CLOSED)
[🔓 Re-open Form] button

→ Form status → ACTIVE
Bot → "✅ Form is now accepting responses again."
```

---

## 7. Filler Bot — Full Flow

### 7.1 Conversation Step Machine

```
ConversationStep (Filler):
  IDLE
  ANSWERING          ← active question index tracked in Session, not BotState
  REVIEWING
```

The Filler bot keeps minimal BotState — session navigation is fully driven by the `Session` record.

### 7.2 Message-by-Message Flow (Detailed)

#### Entry: `t.me/fillerbot?start=<shareToken>`

```
Bot parses /start payload = shareToken

→ Look up form by shareToken
→ If not found or status != ACTIVE:
  Bot → "❌ This form is not available or has been closed."
  STOP

→ Check for existing submitted session → reject
→ Check for interrupted session → offer resume
→ Else: create new session

Bot →
"📄 Job Application Form
─────────────────
You'll be asked 5 questions.
Type /back at any time to change a previous answer.

Let's start!
─────────────────

Question 1 of 5:
What is your full name?"
```

#### Resume Interrupted Session

```
Bot →
"Welcome back! You have an unfinished form.

You were on Question 3 of 5.
Your previous answers are saved.

[▶ Continue]  [✗ Start Fresh]"
```

#### Answering Questions (ACTIVE state)

```
For TEXT/NUMBER/EMAIL questions:
Bot → user sends message → validate → save answer → advance

For YES_NO questions:
Bot → "Do you have prior experience?
[✅ Yes]  [❌ No]"
→ Only button input accepted (ignore text)

For MULTIPLE_CHOICE questions:
Bot → "Select your preferred plan:
[A: Basic]  [B: Pro]  [C: Enterprise]"
→ Only button input accepted

On invalid input:
Bot → "⚠️ Please enter a valid email address."
(Re-show same question, do NOT advance)
```

#### `/back` command during answering

```
→ Check: if currentIndex == 0:
  Bot → "⚠️ You're already at the first question."
  RETURN

→ session.currentIndex -= 1
→ session.state = ACTIVE (if was REVIEW)

Bot → "↩ Going back to Question 2:
Your email address?"
(Show previous answer as hint if exists)
```

#### Last Question → Review Screen

```
After answering last question:
→ session.state = REVIEW

Bot →
"✅ Almost done! Please review your answers:
─────────────────
1. Full Name: John Doe
2. Email: john@example.com
3. Experience: 5 years
4. Available: Yes
5. Plan: Pro
─────────────────

[✅ Submit]  [✏ Edit an Answer]"
```

#### Edit Answer from Review

```
→ On "Edit an Answer":
Bot →
"Which question would you like to edit?
[1: Full Name]
[2: Email]
[3: Experience]
[4: Available]
[5: Plan]"

→ User taps question button:
→ session.currentIndex = selected - 1
→ session.state = ACTIVE

Bot → (shows that question again with current answer as hint)
"Question 2: Your email address?
Current: john@example.com

Send your new answer:"

→ After answering: returns to REVIEW screen
```

#### Submit

```
→ session.state = SUBMITTED
→ Response record created (answers snapshot)
→ UNIQUE constraint ensures no duplicates

Bot →
"🎉 Your response has been submitted!
Thank you for filling out: Job Application

Your answers have been recorded."
```

#### Form Closed Mid-Session

```
At any answer submission or /back:
→ Re-check form.status
→ If CLOSED or ARCHIVED:
  → session.state = INTERRUPTED
  
Bot →
"❌ This form has been closed by the creator.
Your session has been stopped.
Your partial answers were saved but cannot be submitted."
```

#### Duplicate Submission Attempt

```
User clicks form link again after submitting:

Bot →
"⚠️ You've already submitted a response to this form.
Your submission was recorded on June 6, 2026."
```

---

## 8. State Machines (Critical)

### 8.1 Form State Machine (Complete)

```
                    ┌─────────┐
                    │  DRAFT  │──────────────────────────────┐
                    └────┬────┘                              │
                         │ Creator pays / initiates payment  │
                         ▼                                   │
              ┌──────────────────┐                          │
              │ PAYMENT_PENDING  │──────────────────────┐   │
              └────────┬─────────┘  Payment fails       │   │
                       │ Payment webhook SUCCESS         │   │
                       ▼                                 │   │
                  ┌────────┐                             │   │
              ┌──│ ACTIVE │──────────────────────┐      │   │
              │  └────────┘  Creator closes       │      │   │
              │                                   ▼      │   │
              │                             ┌────────┐   │   │
              │  Creator re-opens ──────────│ CLOSED │   │   │
              │                             └────────┘   │   │
              │                                   │      │   │
              │             Archive ───────────────┘      │   │
              │             ▼                             │   │
              └──────► ┌──────────┐◄───────────────────┘   │
                       │ ARCHIVED │◄───────────────────────┘
                       └──────────┘
```

**Rules enforced in state-machine package:**
- DRAFT → ACTIVE is impossible without payment
- SUBMITTED responses cannot be reversed
- ARCHIVED forms are permanent (no re-activation)

### 8.2 Session State Machine (Complete)

```
                        ┌────────┐
         ┌──── /back ───│ ACTIVE │◄──── Edit from review ────┐
         │              └───┬────┘                           │
         │                  │ Last question answered          │
         ▼                  ▼                                │
    (prev Q)          ┌────────┐                             │
                      │ REVIEW │─────────────────────────────┘
                      └───┬────┘
                          │ Submit confirmed
                          ▼
                     ┌─────────┐
                     │SUBMITTED│  (terminal — immutable)
                     └─────────┘

    ACTIVE or REVIEW ──► INTERRUPTED (if form closes)  (terminal)
```

### 8.3 BotState Step Machine (Creator Bot)

```
IDLE ──► AWAITING_TITLE ──► AWAITING_QUESTION_TEXT ──► AWAITING_QUESTION_TYPE
              ▲                        ▲                        │
              │                        │                        ▼
              │                 CONFIRMING_ADD_MORE ◄── AWAITING_CHOICE_OPTIONS
              │                        │ (Done selected)
              │                        ▼
              │                  PAYMENT_PENDING
              │                        │ (webhook fires)
              └────────────────── (back to IDLE)
```

---

## 9. Payment Integration

### 9.1 Design Principle: Everything Stays Inside Telegram

Payment is completed via a **Telegram Mini App** (Web App). The Mini App opens as a native bottom sheet inside Telegram — no browser switch, no context loss. The creator never leaves the app.

```
Creator taps [Pay ₦1,000]
       ↓
Telegram opens Mini App as bottom sheet
       ↓
Mini App loads Paystack Inline JS, charges card in-place
       ↓
On success: Mini App calls window.Telegram.WebApp.close()
       ↓
Paystack webhook fires → API activates form
       ↓
Creator bot sends "✅ Form is LIVE" message in chat
```

### 9.2 Mini App (apps/mini-app)

A minimal Next.js app with a single route: `/pay`.

```
apps/mini-app/
├── src/
│   └── app/
│       └── pay/
│           └── page.tsx       # Payment screen
├── public/
└── next.config.js
```

**`/pay` page logic:**

```typescript
// apps/mini-app/src/app/pay/page.tsx

'use client';
import Script from 'next/script';
import { useEffect } from 'react';

export default function PayPage() {
  // Query params: reference, formId, amount, email (all signed by API)
  // Verify HMAC signature on params before rendering — prevents param tampering
  
  useEffect(() => {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();        // full-height bottom sheet
  }, []);

  const handlePay = () => {
    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email,           // from signed URL params
      amount,          // in kobo, from signed URL params
      ref: reference,  // from signed URL params
      currency: 'NGN',
      onSuccess: () => {
        // Payment done — close Mini App; webhook will fire separately
        window.Telegram.WebApp.close();
      },
      onCancel: () => {
        window.Telegram.WebApp.close();
      },
    });
    handler.openIframe();
  };

  return (
    <main style={styles}>
      <h2>FluxForms</h2>
      <p>Activate your form for ₦1,000</p>
      <button onClick={handlePay}>Pay Now</button>
    </main>
  );
}
```

**Mini App URL signed by API:**
```
https://mini.fluxforms.io/pay?reference=...&formId=...&amount=100000&sig=<HMAC>
```
- `sig` is HMAC-SHA256 of `reference|formId|amount` using `MINI_APP_SIGNING_SECRET`
- Mini App verifies `sig` before rendering to prevent parameter tampering
- Additionally validates `window.Telegram.WebApp.initData` to confirm the user is actually in Telegram

### 9.3 Paystack Flow (End-to-End)

```
1.  Creator taps [Pay ₦1,000] in bot
2.  API creates Payment record (PENDING), generates unique reference
3.  API builds signed Mini App URL
4.  Bot sends message with web_app button (InlineKeyboardButton type)
5.  Telegram opens Mini App as bottom sheet
6.  Mini App verifies sig + Telegram.WebApp.initData
7.  Mini App opens Paystack inline iframe
8.  User enters card details and pays
9.  On success: Mini App calls Telegram.WebApp.close()
10. Paystack fires webhook → POST /payments/webhook/paystack
11. API verifies HMAC-SHA512 signature
12. API checks idempotency (already SUCCESS? skip)
13. API marks payment SUCCESS in DB
14. API transitions form PAYMENT_PENDING → ACTIVE
15. API generates shareToken (cuid) + shareLink
16. API calls creator bot to send "✅ Form is LIVE" message
```

### 9.4 Bot Button — grammY web_app Type

```typescript
// creator-bot.service.ts

import { InlineKeyboard } from 'grammy';

async sendPaymentMessage(chatId: number, miniAppUrl: string) {
  const keyboard = new InlineKeyboard()
    .webApp('💳 Pay ₦1,000', miniAppUrl);  // web_app type — NOT url type

  await this.bot.api.sendMessage(chatId,
    '💳 Tap below to complete payment.\nYour form activates instantly after payment.',
    { reply_markup: keyboard }
  );
}
```

### 9.5 Webhook Security

```typescript
// paystack.provider.ts

verifySignature(payload: object, signature: string): void {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (hash !== signature) {
    throw new UnauthorizedException('Invalid Paystack signature');
  }
}
```

### 9.6 Idempotency

- Payment records have UNIQUE constraint on `reference`
- Webhook handler checks `payment.status === 'SUCCESS'` and skips if already processed
- Safely handles Paystack's retry behavior (they retry up to 5 times)

### 9.7 Flutterwave (Fallback)

- Same Mini App pattern — Flutterwave also has an inline JS SDK
- Same signed URL approach
- Different HMAC key (`FLW-Hash` header) for webhook verification
- `PaymentProvider` enum in DB tracks which provider was used

### 9.8 Telegram Mini App Security

```
1. Verify window.Telegram.WebApp.initData on the Mini App page
   → Confirms user is genuinely in Telegram, not opening the URL directly
   → initData is HMAC-signed by Telegram using the bot token
   → Verify server-side: POST /payments/verify-init-data

2. Verify sig query param (HMAC of payment params)
   → Prevents parameter tampering (e.g. changing amount to 0)

3. Mini App served over HTTPS only (required by Telegram)

4. CSP headers: allow Paystack/Flutterwave domains, block everything else
```

---

## 10. Admin Dashboard (Next.js)

### 10.1 Auth

- Supabase Auth with email/password for admin users
- Admin users have `role = ADMIN` in the users table
- Next.js middleware protects all `/dashboard/*` routes

### 10.2 Pages

| Route | Component | Data Source |
|---|---|---|
| `/dashboard` | Metrics overview | API: GET /admin/stats |
| `/dashboard/forms` | Forms list + filters | API: GET /admin/forms |
| `/dashboard/forms/:id` | Form detail + questions | API: GET /admin/forms/:id |
| `/dashboard/forms/:id/responses` | Response list | API: GET /admin/responses/:formId |
| `/dashboard/sessions` | Session debug view | API: GET /admin/sessions |
| `/dashboard/payments` | Payment audit log | API: GET /admin/payments |
| `/dashboard/users` | User list | API: GET /admin/users |

### 10.3 Admin API Endpoints (NestJS — AdminModule)

```
GET  /admin/stats              → total forms, responses, revenue
GET  /admin/forms              → paginated, filterable by status
GET  /admin/forms/:id          → form detail with questions
PATCH /admin/forms/:id/status  → manual status override (emergency)
GET  /admin/responses/:formId  → paginated responses
GET  /admin/sessions           → all sessions with state filters
GET  /admin/payments           → payment audit log
GET  /admin/users              → user list
```

All admin endpoints require `AdminGuard` (JWT + role check).

---

## 11. Security Design

### 11.1 Telegram Webhook Validation

```typescript
// Every webhook request is validated with X-Telegram-Bot-Api-Secret-Token header
// Set during webhook registration:
// setWebhook(url, { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET })
// This prevents anyone from spoofing Telegram updates.
```

### 11.2 Input Sanitization

- All bot text input goes through Zod validators before touching business logic
- Question answers validated by `validateAnswer()` from state-machine package
- Form titles and question text stripped of HTML (no XSS surface since it's Telegram text)
- No raw SQL anywhere — Prisma ORM prevents SQL injection

### 11.3 Payment Webhook Security

```
Paystack: HMAC-SHA512 with PAYSTACK_SECRET_KEY
Flutterwave: HMAC-SHA256 with FLW_HASH
Both: Verify before any DB mutation
Both: Idempotency check before processing
```

### 11.4 Rate Limiting

```typescript
// Apply to webhook endpoints and public-facing API
// Using @nestjs/throttler
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000,  limit: 10 },   // 10 req/sec
  { name: 'medium', ttl: 60000, limit: 100 },  // 100 req/min per IP
])

// Bot-level rate limiting: track per telegram_id in DB
// Flag if user sends > 30 messages/min → temporary block
```

### 11.5 Environment Variables

```
# Never committed to git
DATABASE_URL=
DIRECT_URL=                         # Supabase direct connection for migrations

TELEGRAM_CREATOR_BOT_TOKEN=
TELEGRAM_FILLER_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=            # Same secret for both bots (or separate)

PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_PUBLIC_KEY=

JWT_SECRET=
JWT_EXPIRY=15m

API_URL=https://api.fluxforms.io
ADMIN_URL=https://admin.fluxforms.io
MINI_APP_URL=https://mini.fluxforms.io
MINI_APP_SIGNING_SECRET=           # HMAC key for signing Mini App URL params
```

### 11.6 Data Protection

- Telegram user IDs are stored as strings (no PII beyond what Telegram provides)
- Placeholder email format used for payment providers (`<telegramId>@fluxforms.bot`)
- No plaintext passwords (Telegram auth only + admin uses Supabase Auth)
- Responses stored encrypted at rest via Supabase's built-in encryption

### 11.7 Audit Trail

- `createdAt` + `updatedAt` on all models
- Payment records never deleted — only status updated
- Session records never deleted — interrupted state preserved
- Form records never hard-deleted — archived state used

---

## 12. Scalability Design

### 12.1 Stateless API

- All conversation state in DB (`BotState`, `Session`)
- API instances are fully stateless — can run N replicas behind a load balancer
- No in-memory session state, no sticky sessions required

### 12.2 Webhook Throughput

```
Telegram sends one webhook per message
At 1,000 concurrent users filling forms:
- ~5 messages each = ~5,000 DB writes over a session lifetime
- Per second peak: manageable with Supabase connection pooling (PgBouncer)

Set up: DATABASE_URL uses pooled connection (port 6543)
        DIRECT_URL uses direct connection (port 5432) for migrations only
```

### 12.3 Database Connection Pooling

```
Supabase provides PgBouncer at :6543 (transaction mode)
Prisma configured with:
  - connection_limit = 10 per API instance
  - pool_timeout = 10s
  - Multiple API instances → PgBouncer handles the fan-in
```

### 12.4 Horizontal Scaling Path

```
Phase 1 (MVP): 
  Single API instance, Supabase free tier

Phase 2 (Growth):
  Multiple API instances behind load balancer (Railway/Render/Fly.io)
  Supabase Pro with connection pooling

Phase 3 (Scale):
  Redis for BotState caching (reduce DB reads per message)
  Background job queue (BullMQ) for payment webhook processing
  Read replicas for admin dashboard queries
```

### 12.5 Async Pattern for Webhook Responses

Telegram requires webhook response within 5 seconds. Long operations (payment init) should respond immediately and process async:

```typescript
// Respond to Telegram instantly
res.status(200).json({ ok: true });

// Then process (fire-and-forget with error handling)
setImmediate(async () => {
  try {
    await this.processUpdate(update);
  } catch (err) {
    this.logger.error('Update processing failed', err);
  }
});
```

### 12.6 Pagination

- All list endpoints paginated (cursor-based for responses/sessions at scale)
- Bot message lists use Telegram's inline keyboard pagination
- Admin dashboard uses offset pagination initially, cursor-based when needed

---

## 13. Deployment & Infrastructure

### 13.1 Recommended Stack

| Service | Provider | Notes |
|---|---|---|
| API + Bots | Railway | Easy NestJS deployment, auto-scaling |
| Admin | Vercel | Next.js native |
| Mini App | Vercel | Must be HTTPS (Telegram requirement); same Vercel org |
| Database | Supabase | Postgres + Auth + RLS |
| Domain | Cloudflare | DNS + proxy + free SSL |

**Mini App domain requirement:** Telegram requires the Mini App URL to be registered in BotFather under the bot's domain settings. Both bots must whitelist `mini.fluxforms.io`.

### 13.2 Webhook Registration (One-time setup script)

```typescript
// scripts/register-webhooks.ts
// Run once after deployment to register both bots

const creatorWebhookUrl = `${API_URL}/webhook/creator-bot`;
const fillerWebhookUrl  = `${API_URL}/webhook/filler-bot`;

await axios.post(`https://api.telegram.org/bot${CREATOR_TOKEN}/setWebhook`, {
  url: creatorWebhookUrl,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});

await axios.post(`https://api.telegram.org/bot${FILLER_TOKEN}/setWebhook`, {
  url: fillerWebhookUrl,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
```

### 13.3 CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  test:    → pnpm test
  migrate: → prisma migrate deploy
  deploy:  → Railway deploy API, Vercel deploy Admin + Mini App
```

---

## 14. Implementation Phases

### Phase 0 — Foundation (Days 1–3)

- [ ] Init Turborepo monorepo + pnpm workspaces
- [ ] Set up Prisma schema + Supabase project
- [ ] Run first migration
- [ ] Scaffold NestJS API with PrismaService
- [ ] Set up shared-types + state-machine packages
- [ ] Configure environment variables

### Phase 1 — Core API (Days 4–7)

- [ ] AuthModule (Telegram user upsert on first message)
- [ ] FormModule (CRUD + status transitions)
- [ ] QuestionModule (add/edit/reorder)
- [ ] WebhookModule + TelegramWebhookGuard
- [ ] BotState service (get/set conversation step)

### Phase 2 — Creator Bot (Days 8–12)

- [ ] /start, /createform flow
- [ ] Form title collection
- [ ] Question builder loop (all 5 types)
- [ ] Multiple choice options collection
- [ ] Form preview
- [ ] /myforms with pagination
- [ ] /form <id> management screen
- [ ] Close / re-open form
- [ ] View responses (paginated)

### Phase 3 — Payment + Mini App (Days 13–16)

- [ ] Scaffold `apps/mini-app` (Next.js, single `/pay` route)
- [ ] Mini App: Telegram.WebApp.ready() + expand() setup
- [ ] Mini App: signed URL param generation + HMAC verification on load
- [ ] Mini App: Paystack Inline JS integration
- [ ] Mini App: onSuccess → Telegram.WebApp.close()
- [ ] Mini App: CSP headers + HTTPS enforcement
- [ ] PaymentModule with Paystack provider
- [ ] Payment initialization → signed Mini App URL generation
- [ ] Bot sends web_app InlineKeyboardButton (not URL button)
- [ ] Paystack webhook handler + HMAC-SHA512 verification
- [ ] Form activation on payment success
- [ ] Share link generation
- [ ] Creator bot payment notification
- [ ] Flutterwave provider (fallback, same Mini App pattern)

### Phase 4 — Filler Bot (Days 16–21)

- [ ] Session start / resume logic
- [ ] Question-by-question answering
- [ ] Type-specific validation + button keyboards
- [ ] /back navigation
- [ ] Review screen + edit flow
- [ ] Final submission + Response record
- [ ] Duplicate submission prevention
- [ ] Form-closed mid-session handling
- [ ] Interrupted session resumption

### Phase 5 — Admin Dashboard (Days 22–27)

- [ ] Supabase Auth setup
- [ ] Next.js app with route protection
- [ ] Dashboard: metrics overview
- [ ] Forms list + form detail view
- [ ] Response viewer (per form)
- [ ] Session debug view
- [ ] Payment audit log

### Phase 6 — Hardening (Days 28–30)

- [ ] Rate limiting on all webhook endpoints
- [ ] Input sanitization audit
- [ ] Payment webhook idempotency test
- [ ] Form-closed edge case e2e test
- [ ] Duplicate submission e2e test
- [ ] Webhook registration script
- [ ] CI/CD pipeline
- [ ] Load test (k6) — simulate 100 concurrent fillers

---

## 15. Testing Strategy

### 15.1 Unit Tests

- `packages/state-machine` → 100% coverage (pure functions, critical logic)
- `packages/validators` → 100% coverage
- PaymentService.verifySignature → must never false-positive

### 15.2 Integration Tests

- Session flow: start → answer all → review → submit (per question type)
- /back at index 0 → no-op
- Submit to CLOSED form → INTERRUPTED
- Duplicate submission → blocked
- Payment webhook fired twice → processed once

### 15.3 E2E Tests

- Full Creator flow: createform → add 3 questions → pay (mock webhook) → get share link
- Full Filler flow: open link → answer all → review → edit one → resubmit
- Admin: view all responses for a form

### 15.4 Security Tests

- Webhook with wrong secret → 401
- Payment webhook with bad HMAC → 401
- Admin endpoint without JWT → 401
- Filler accessing another user's session → 403

---

## Appendix A — Key Environment Constraints

| Constraint | Value |
|---|---|
| Form price | ₦1,000 (100,000 kobo) |
| Max questions per form | 50 (arbitrary MVP limit) |
| Max choices per MCQ | 10 |
| Webhook response timeout | 5 seconds |
| Session expiry | None (sessions live until submitted or interrupted) |
| Max form title length | 100 characters |
| Max question text length | 300 characters |

## Appendix B — grammY Integration Pattern

```typescript
// creator-bot.service.ts (NestJS service wrapping grammY)

import { Bot, webhookCallback } from 'grammy';

@Injectable()
export class CreatorBotService implements OnModuleInit {
  private bot: Bot;

  onModuleInit() {
    this.bot = new Bot(process.env.TELEGRAM_CREATOR_BOT_TOKEN!);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.command('start', ctx => this.handleStart(ctx));
    this.bot.command('createform', ctx => this.handleCreateForm(ctx));
    this.bot.on('callback_query:data', ctx => this.handleCallback(ctx));
    this.bot.on('message:text', ctx => this.handleText(ctx));
  }

  getWebhookCallback() {
    return webhookCallback(this.bot, 'express');
  }

  async handleUpdate(update: Update) {
    await this.bot.handleUpdate(update);
  }
}
```

---

*This plan is the single source of truth for implementation. Every feature in the PRD maps to a specific section above. Build in phase order — do not skip phases.*
