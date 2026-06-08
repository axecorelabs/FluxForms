# FluxForms — Flux Interview Implementation Plan

> Version: 1.0 | Date: 2026-06-08
> This document is the single source of truth for the Flux Interview feature.
> Standard Forms (Flux Forms) remain part of the product and are already built.
> This plan covers everything new required to ship Flux Interview as the primary launch product.

---

## Table of Contents

1. [Vision & Strategic Context](#1-vision--strategic-context)
2. [Updated Architecture Overview](#2-updated-architecture-overview)
3. [Database Schema — New Models (Complete)](#3-database-schema--new-models-complete)
4. [LLM Integration Design](#4-llm-integration-design)
5. [Prompt Engineering System](#5-prompt-engineering-system)
6. [NestJS API — New & Modified Modules](#6-nestjs-api--new--modified-modules)
7. [Creator Bot — Interview Creation Flow](#7-creator-bot--interview-creation-flow)
8. [Filler Bot — AI Conversation Flow](#8-filler-bot--ai-conversation-flow)
9. [Creator Dashboard — Complete UI System](#9-creator-dashboard--complete-ui-system)
10. [Monetization Architecture (Revised)](#10-monetization-architecture-revised)
11. [Security Design (AI-Specific)](#11-security-design-ai-specific)
12. [Scalability Considerations](#12-scalability-considerations)
13. [Implementation Phases](#13-implementation-phases)
14. [Testing Strategy](#14-testing-strategy)

---

## 1. Vision & Strategic Context

### 1.1 What Flux Interview Is

A **Flux Interview** is not a form with AI sprinkled on top. It is a fundamentally different product:

| Flux Form (Standard) | Flux Interview |
|---|---|
| Creator defines fixed questions | Creator defines an objective + context |
| Same questions for every respondent | AI adapts questions per respondent |
| Structured input fields | Free-text conversation |
| Answers stored as `Record<questionId, answer>` | Full conversation log + AI-extracted profile |
| Creator reads raw answers | Creator reads a structured profile built from conversation |
| Deterministic | Probabilistic + adaptive |

### 1.2 Why This Is the Launch Product

- Every company has some version of "I need to collect and understand information from people at scale"
- Standard forms commoditize this. Flux Interview makes it intelligent
- The key differentiation: the quality of data you get from conversation vs. a form is dramatically higher
- Specific market: Nigerian SMEs doing hiring, lead qualification, customer onboarding — none of them have good tooling for this in Telegram

### 1.3 Product Decision: Keep Standard Forms

Standard Forms stay in the product. They serve a different use case ("I know exactly what I want to ask"). The two modes are not in conflict. Standard Forms also serve as the onramp — creators who start with a simple form may upgrade to an interview when they see the difference in response quality.

### 1.4 Monetization Philosophy Shift

**Old model**: ₦1,000 flat per form activation.

**New model**: **Response-based subscription.** Creators pay based on how many completed interview sessions they receive per month. This aligns FluxForms revenue with the value delivered.

```
Free Tier:    0 — 50 completed interviews/month    ₦0
Starter:      50 — 500 completed interviews/month  ₦10,000/month
Growth:       500 — 5,000 interviews/month         ₦35,000/month
Enterprise:   5,000+ interviews/month              Custom
```

Standard Forms remain free to create; responses also count toward the monthly limit.

---

## 2. Updated Architecture Overview

### 2.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TELEGRAM                                        │
│  Creator Bot ───────────────────────────────── Filler Bot                   │
│  (create interviews, manage, get notified)      (AI conversations)           │
└──────────┬──────────────────────────────────────────┬────────────────────────┘
           │ HTTPS Webhook                             │ HTTPS Webhook
           ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NestJS API                                           │
│                                                                              │
│  ┌──────────┐ ┌────────────┐ ┌──────────────────┐ ┌────────────────────┐   │
│  │ AuthMod  │ │ InterviewM │ │ InterviewSessionM│ │  LLMProviderMod    │   │
│  └──────────┘ └────────────┘ └──────────────────┘ └────────────────────┘   │
│  ┌──────────┐ ┌────────────┐ ┌──────────────────┐ ┌────────────────────┐   │
│  │ FormMod  │ │ SessionMod │ │  PaymentModule   │ │  DashboardModule   │   │
│  └──────────┘ └────────────┘ └──────────────────┘ └────────────────────┘   │
│  ┌──────────┐ ┌────────────┐                                                │
│  │ BotModule│ │ BotStateMod│                                                │
│  └──────────┘ └────────────┘                                                │
└───────────────────────────┬─────────────────────────────────────────────────┘
                            │
           ┌────────────────┼──────────────────┐
           │                │                  │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌────────▼────────┐
    │  Supabase   │  │  OpenRouter │  │  Paystack /     │
    │  Postgres + │  │  Gemini 2.5 │  │  Flutterwave    │
    │  pgvector   │  │  Flash      │  └─────────────────┘
    └─────────────┘  └─────────────┘
           │
  ┌────────▼──────────────────────────────┐
  │         Creator Dashboard             │
  │   Next.js (apps/creator-dashboard)    │
  │   Auth → Interview Builder → Viewer   │
  └───────────────────────────────────────┘
```

### 2.2 New vs. Existing Components

| Component | Status | Change Required |
|---|---|---|
| NestJS API core | ✅ Built | Add new modules |
| Standard Form flow | ✅ Built | No change |
| Creator Bot | ✅ Built | Add interview creation commands |
| Filler Bot | ✅ Built | Add AI conversation handler |
| Payment (Mini App) | ✅ Built | Update for subscription model |
| InterviewModule | 🆕 New | Build from scratch |
| InterviewSessionModule | 🆕 New | Build from scratch |
| LLMProviderModule | 🆕 New | OpenRouter + Gemini 2.5 Flash integration |
| ExtractionService | 🆕 New | Entity extraction pipeline (function calling) |
| PromptBuilderService | 🆕 New | Dynamic system prompt generation |
| VectorSearchModule | 🆕 New | pgvector (Supabase) — semantic search + re-querying |
| Creator Dashboard | 🆕 New | Full Next.js app |
| DashboardAuthModule | 🆕 New | Magic link + Telegram Login Widget |
| SubscriptionModule | 🆕 New | Replace per-form payment |

### 2.3 Critical Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| LLM Provider | OpenRouter + Gemini 2.5 Flash | Unified API key, OpenAI-compatible SDK, very cheap, supports function calling |
| LLM model | `google/gemini-2.5-flash` via OpenRouter | Fast, cost-effective, supports tool use for extraction |
| Embedding model | `google/gemini-embedding-exp-03-07` via OpenRouter | Same provider for simplicity; 3072-dim vectors |
| Conversation history strategy | Full history per turn (sliding window at 20 turns) | Simple and reliable; most interviews complete in < 15 turns |
| Extraction timing | Incremental (after each user message) + full re-extraction at completion | Best data accuracy without blocking response time |
| Vector storage | pgvector (Supabase) | Already in infrastructure; zero new service; handles millions of vectors |
| Vector use cases | Semantic search in dashboard, re-querying, cross-interview insights | See Section 4.7 |
| Dashboard auth | Magic link from Creator Bot | Creators already in Telegram; no password to manage |
| Creator Dashboard framework | Next.js 15 App Router, Tailwind, shadcn/ui | Fast to build, consistent with Mini App |
| Subscription management | Custom (Paystack recurring) | No Stripe in Nigeria; Paystack supports subscriptions |

---

## 3. Database Schema — New Models (Complete)

### 3.1 New Prisma Models

```prisma
// ─── Interview Templates ──────────────────────────────────────────────────────
// An interview template is what the creator builds. Like a "form" but AI-driven.

model Interview {
  id              String          @id @default(cuid())
  creatorId       String          @map("creator_id")
  title           String
  type            InterviewType   @default(CUSTOM)
  objective       String          // "What should this interview accomplish?"
  context         String?         // Company info, role description, product details
  aiPersona       String?         @map("ai_persona")    // How the AI introduces itself
  maxTurns        Int             @default(20) @map("max_turns")    // Hard limit on conversation length
  status          InterviewStatus @default(DRAFT)
  shareToken      String?         @unique @map("share_token")
  shareLink       String?         @unique @map("share_link")
  completedCount  Int             @default(0) @map("completed_count")
  closedAt        DateTime?       @map("closed_at")
  archivedAt      DateTime?       @map("archived_at")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  creator         User                @relation(fields: [creatorId], references: [id])
  schemaFields    InterviewField[]
  sessions        InterviewSession[]

  @@index([creatorId])
  @@index([status])
  @@map("interviews")
}

enum InterviewType {
  HIRING
  LEAD_QUALIFICATION
  CUSTOMER_FEEDBACK
  CLIENT_ONBOARDING
  MARKET_RESEARCH
  CUSTOM
}

enum InterviewStatus {
  DRAFT
  ACTIVE         // No payment gate for MVP — free tier covers first 50 sessions
  CLOSED
  ARCHIVED
}

// ─── Interview Schema Fields ──────────────────────────────────────────────────
// What structured data the AI should try to extract from the conversation.
// Creator defines these. AI uses them as extraction targets.

model InterviewField {
  id           String    @id @default(cuid())
  interviewId  String    @map("interview_id")
  fieldName    String    @map("field_name")    // e.g. "years_experience", "budget_range"
  displayName  String    @map("display_name")  // e.g. "Years of Experience", "Budget Range"
  fieldType    FieldType @map("field_type")
  description  String    // Explains to the AI what this field means and when to populate it
  isRequired   Boolean   @default(false) @map("is_required")
  orderIndex   Int       @map("order_index")
  createdAt    DateTime  @default(now()) @map("created_at")

  interview    Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  @@unique([interviewId, fieldName])
  @@index([interviewId])
  @@map("interview_fields")
}

enum FieldType {
  TEXT          // Free text
  NUMBER        // Numeric value
  BOOLEAN       // Yes/No determination
  DATE          // Date or date range
  ARRAY         // List of items (e.g. skills)
  RATING        // 1-5 score (AI infers from sentiment)
  ENUM          // One of a predefined set
}

// ─── Interview Sessions ────────────────────────────────────────────────────────
// One session = one person's conversation with the AI.

model InterviewSession {
  id               String                @id @default(cuid())
  interviewId      String                @map("interview_id")
  userTelegramId   String                @map("user_telegram_id")
  state            InterviewSessionState @default(ACTIVE)
  turnCount        Int                   @default(0) @map("turn_count")
  startedAt        DateTime              @default(now()) @map("started_at")
  completedAt      DateTime?             @map("completed_at")
  interruptedAt    DateTime?             @map("interrupted_at")
  createdAt        DateTime              @default(now()) @map("created_at")
  updatedAt        DateTime              @updatedAt @map("updated_at")

  interview        Interview             @relation(fields: [interviewId], references: [id])
  messages         InterviewMessage[]
  extractedProfile ExtractedEntity[]

  @@unique([interviewId, userTelegramId])    // One session per person per interview
  @@index([interviewId])
  @@index([userTelegramId])
  @@map("interview_sessions")
}

enum InterviewSessionState {
  ACTIVE
  COMPLETED
  INTERRUPTED
}

// ─── Interview Messages ────────────────────────────────────────────────────────
// Immutable conversation log. One row per message (AI or User).
// This is the "truth source" — never modified after creation.

model InterviewMessage {
  id         String      @id @default(cuid())
  sessionId  String      @map("session_id")
  role       MessageRole
  content    String      @db.Text   // Full message content
  turnIndex  Int         @map("turn_index")    // 0 = first user message
  createdAt  DateTime    @default(now()) @map("created_at")

  session    InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, turnIndex])
  @@map("interview_messages")
}

enum MessageRole {
  USER
  AI
  SYSTEM    // Internal notes (not shown to user), e.g. "extraction triggered"
}

// ─── Extracted Entities ────────────────────────────────────────────────────────
// Structured data the AI has extracted from the conversation.
// Updated incrementally as conversation progresses.
// One row per field per session — upserted after each user message.

model ExtractedEntity {
  id               String    @id @default(cuid())
  sessionId        String    @map("session_id")
  fieldName        String    @map("field_name")    // matches InterviewField.fieldName
  value            Json                             // the extracted value (typed per FieldType)
  rawEvidence      String?   @map("raw_evidence")  // the user text that produced this extraction
  confidence       Float     @default(0)            // 0.0 — 1.0 AI confidence score
  lastUpdatedTurn  Int       @map("last_updated_turn")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  session          InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, fieldName])
  @@index([sessionId])
  @@map("extracted_entities")
}

// ─── Subscriptions ─────────────────────────────────────────────────────────────
// Creator's active subscription plan (replaces per-form payment).

model Subscription {
  id               String             @id @default(cuid())
  creatorId        String             @unique @map("creator_id")
  plan             SubscriptionPlan   @default(FREE)
  status           SubscriptionStatus @default(ACTIVE)
  currentPeriodStart DateTime         @map("current_period_start")
  currentPeriodEnd   DateTime         @map("current_period_end")
  responseCount    Int                @default(0) @map("response_count")   // this billing period
  responseLimit    Int                @map("response_limit")                // plan limit
  paystackSubCode  String?            @map("paystack_sub_code")
  createdAt        DateTime           @default(now()) @map("created_at")
  updatedAt        DateTime           @updatedAt @map("updated_at")

  creator          User               @relation(fields: [creatorId], references: [id])

  @@map("subscriptions")
}

enum SubscriptionPlan {
  FREE        // 50 responses/month
  STARTER     // 500 responses/month — ₦10,000/month
  GROWTH      // 5000 responses/month — ₦35,000/month
  ENTERPRISE  // Unlimited — custom
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELLED
  EXPIRED
}

// ─── Dashboard Auth Tokens ────────────────────────────────────────────────────
// Short-lived magic link tokens issued by the Creator Bot for dashboard login.

model DashboardToken {
  id        String   @id @default(cuid())
  creatorId String   @map("creator_id")
  token     String   @unique @default(cuid())
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")

  creator   User     @relation(fields: [creatorId], references: [id])

  @@index([token])
  @@map("dashboard_tokens")
}
```

### 3.2 Updated User Model (add new relations)

```prisma
model User {
  // ... existing fields ...
  interviews      Interview[]
  interviewSessions InterviewSession[] @relation(fields: [id], references: [userId])
  subscription    Subscription?
  dashboardTokens DashboardToken[]
}
```

### 3.3 Index Strategy (Additional)

```sql
CREATE INDEX idx_interview_sessions_interview    ON interview_sessions(interview_id, state);
CREATE INDEX idx_interview_messages_session      ON interview_messages(session_id, turn_index);
CREATE INDEX idx_extracted_entities_session      ON extracted_entities(session_id);
CREATE INDEX idx_subscription_creator           ON subscriptions(creator_id);
CREATE INDEX idx_dashboard_token               ON dashboard_tokens(token, expires_at);
```

### 3.4 Default Template Fields Per Interview Type

When a creator selects a template type, these fields are pre-populated as starting suggestions (creator can edit/remove/add):

| Type | Pre-populated Fields |
|---|---|
| HIRING | full_name, current_role, years_experience, skills (ARRAY), salary_expectation, availability, why_interested |
| LEAD_QUALIFICATION | full_name, company_name, company_size, problem_description, budget_range, timeline, decision_maker (BOOLEAN), contact_email |
| CUSTOMER_FEEDBACK | product_used, satisfaction_rating (RATING), biggest_pain_point, suggested_improvement, likelihood_to_recommend (RATING) |
| CLIENT_ONBOARDING | business_name, industry, team_size, current_tools (ARRAY), primary_goal, biggest_challenge, timeline |
| MARKET_RESEARCH | demographics, current_behavior, pain_points (ARRAY), product_awareness, price_sensitivity, preferred_channels (ARRAY) |
| CUSTOM | (empty — creator defines everything) |

---

## 4. LLM Integration Design

### 4.1 Provider Abstraction

All LLM calls route through OpenRouter using the **OpenAI-compatible SDK** (`openai` npm package with a custom `baseURL`). This means the same client handles chat completions, function calling (extraction), and embeddings — one API key, one dependency.

```
apps/api/src/modules/llm/
├── llm.module.ts
├── llm.service.ts                  ← abstraction layer (hides provider details)
├── embedding.service.ts            ← vector embedding generation
├── providers/
│   └── openrouter.provider.ts      ← OpenAI-SDK client pointed at OpenRouter
└── dto/
    ├── chat-turn.dto.ts
    └── extraction-result.dto.ts
```

```typescript
// openrouter.provider.ts

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://fluxforms.io',
    'X-Title': 'FluxForms',
  },
});

const CHAT_MODEL = 'google/gemini-2.5-flash';
const EMBED_MODEL = 'google/gemini-embedding-exp-03-07';
```

### 4.2 Two-Call Pattern Per User Message

Every time a user sends a message, the system makes **two sequential LLM calls**:

```
User sends message
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Call 1: Conversation Turn                           │
│  Model: google/gemini-2.5-flash (via OpenRouter)     │
│  Input: [system prompt] + [full message history]     │
│  + [latest user message]                             │
│  Output: AI's next response text                     │
│  Typical latency: 0.4–1.0s                          │
└───────────────────────┬──────────────────────────────┘
                        │ (both calls fire in parallel
                        │  after saving user message)
┌──────────────────────────────────────────────────────┐
│  Call 2: Entity Extraction                           │
│  Model: google/gemini-2.5-flash (via OpenRouter)     │
│  Input: [extraction system prompt] + [target fields] │
│  + [latest user message] + [current extracted state] │
│  Output: JSON via function calling                   │
│  Typical latency: 0.4–0.8s                          │
└──────────────────────────────────────────────────────┘
       │                          │
       ▼                          ▼
Send AI response          Upsert ExtractedEntities
to Telegram               in DB (background)
                          Then: generate + store
                          session embedding (on complete)
```

**Key architectural decision**: Both calls are fired in parallel using `Promise.all()`. The user receives the AI response as soon as Call 1 completes. Extraction (Call 2) writes to DB in the background. This keeps the conversation feeling fast.

### 4.3 Conversation Turn Spec

```typescript
interface ConversationTurnInput {
  systemPrompt: string;          // Built by PromptBuilderService
  messageHistory: {
    role: 'user' | 'assistant';
    content: string;
  }[];
  latestUserMessage: string;
  maxTokens: number;             // Default: 400 tokens (keep responses concise)
}

interface ConversationTurnOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  isConversationComplete: boolean;  // True when AI signals "wrap up"
}
```

### 4.4 Extraction Call Spec

```typescript
interface ExtractionInput {
  targetFields: InterviewField[];
  userMessage: string;
  currentExtracted: Record<string, ExtractedEntityValue>;  // what we know so far
}

interface ExtractionOutput {
  updates: {
    fieldName: string;
    value: Json;
    confidence: number;      // 0.0–1.0
    rawEvidence: string;     // the fragment of user text supporting this extraction
  }[];
}
```

The extraction call uses **OpenAI-compatible function calling** (Gemini 2.5 Flash supports this via OpenRouter). We define a `update_entities` function with the exact schema of all target fields, and instruct the model to call it with any updates it can extract from the user's message. This gives us structured JSON output that never needs parsing.

### 4.5 Conversation Completion Detection

The AI signals completion in two ways:

1. **Explicit signal**: If all required fields in `InterviewField.isRequired = true` are extracted with `confidence >= 0.7`, the system prompts the AI to wrap up in its next turn.

2. **Turn limit**: When `session.turnCount >= interview.maxTurns`, the system injects a system instruction: "This conversation must conclude now. Thank the user and close the conversation."

3. **AI wrap-up phrase detection**: Simple heuristic — if AI response contains closing phrases ("thank you", "that's all I need", "your responses have been recorded"), the session state moves to `COMPLETED`.

### 4.6 Token Cost Estimation

```
Typical interview: 10 user turns
Per turn:
  Conversation call: ~800 input tokens + ~150 output tokens
  Extraction call:   ~600 input tokens + ~100 output tokens

Per interview: 10 × (800+600) = 14,000 input tokens
               10 × (150+100) =  2,500 output tokens

Gemini 2.5 Flash pricing via OpenRouter (approximate):
  Input:  $0.15/M tokens  (non-thinking mode)
  Output: $0.60/M tokens

Input cost  per interview: 14,000 × $0.15/M  = $0.0021
Output cost per interview:  2,500 × $0.60/M  = $0.0015
Embedding   per completion:  ~2,000 tokens    = $0.0003 (negligible)

Cost per completed interview: ~$0.004 (≈ ₦6 at ₦1,600/USD)

This is ~5× cheaper than Claude Haiku for equivalent quality on conversational tasks.

At 1,000 interviews/month (Growth tier): ~$4/month in LLM costs
At 5,000 interviews/month (Enterprise):  ~$20/month in LLM costs

PRICING (accounting for LLM costs — very healthy margins):
  Free:       50 interviews/month    ₦0           LLM cost: ~$0.20
  Starter:    300 interviews/month   ₦10,000      LLM cost: ~$1.20
  Growth:     1,000 interviews/month ₦40,000      LLM cost: ~$4.00
  Enterprise: Custom                 Custom
```

### 4.7 Vector Search (pgvector)

**Why vectors are needed:**

Once interviews complete, the extracted profile JSON is useful for keyword lookup but insufficient for:
- Semantic search: "Find candidates with AI experience" (should match "machine learning", "LLMs", etc.)
- Re-querying: "Summarize the top 10 candidates for this role"
- Cross-interview insights: "What are the most common complaints across all feedback sessions?"

**Implementation:**

pgvector is a Postgres extension supported natively by Supabase. Enable it with one SQL command. No new service.

**What gets embedded:**

When a session reaches `COMPLETED`, a background job generates one embedding per session:

```typescript
// The text we embed is a human-readable summary of the extracted profile:
// "Name: Aisha Kone. Role: Senior Frontend Developer at Paystack.
//  Experience: 5 years. Skills: React, Next.js, TypeScript, GraphQL.
//  Salary: ₦800,000/month. Availability: 2 weeks notice."

const embeddingText = buildProfileText(extractedEntities, interviewFields);
const vector = await embeddingService.embed(embeddingText);
await prisma.interviewSession.update({
  where: { id: sessionId },
  data: { profileEmbedding: vector },
});
```

**Schema addition** (add to `InterviewSession` model):

```prisma
// In InterviewSession model — added field:
profileEmbedding  Unsupported("vector(3072)")?  @map("profile_embedding")
```

```sql
-- Supabase migration:
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE interview_sessions ADD COLUMN profile_embedding vector(3072);
CREATE INDEX ON interview_sessions USING hnsw (profile_embedding vector_cosine_ops);
```

**Queries it enables (used in dashboard):**

```sql
-- 1. Semantic search: "Find sessions similar to this query"
SELECT id, user_telegram_id
FROM interview_sessions
WHERE interview_id = $interviewId
  AND state = 'COMPLETED'
ORDER BY profile_embedding <=> $queryVector
LIMIT 10;

-- 2. Find sessions similar to a specific session (e.g. "find more like this candidate")
SELECT id FROM interview_sessions
WHERE interview_id = $interviewId
  AND id != $referenceSessionId
ORDER BY profile_embedding <=> (SELECT profile_embedding FROM interview_sessions WHERE id = $referenceSessionId)
LIMIT 5;
```

**Dashboard feature this unlocks**: a search bar at the top of the Sessions list that accepts natural language queries ("candidates with fintech experience", "leads with budget over 1M"). The dashboard sends the query to `POST /dashboard/interviews/:id/sessions/search`, the API embeds it and runs the vector query.

---

## 5. Prompt Engineering System

### 5.1 PromptBuilderService

```
apps/api/src/modules/llm/prompt-builder.service.ts
```

Builds the complete system prompt from the interview configuration. This is the most important piece of the entire product — the quality of the AI conversation depends entirely on the system prompt.

### 5.2 System Prompt Template (Conversation Turn)

```typescript
function buildConversationSystemPrompt(interview: Interview, fields: InterviewField[]): string {
  const personaMap: Record<InterviewType, string> = {
    HIRING:              'You are a friendly and professional recruiter conducting a candidate screening interview.',
    LEAD_QUALIFICATION:  'You are a helpful sales consultant qualifying a potential client.',
    CUSTOMER_FEEDBACK:   'You are a customer success specialist gathering feedback.',
    CLIENT_ONBOARDING:   'You are an onboarding specialist learning about a new client.',
    MARKET_RESEARCH:     'You are a research analyst conducting a structured interview.',
    CUSTOM:              interview.aiPersona ?? 'You are a helpful assistant gathering information.',
  };

  const requiredFieldsList = fields
    .filter(f => f.isRequired)
    .map(f => `- ${f.displayName}: ${f.description}`)
    .join('\n');

  const optionalFieldsList = fields
    .filter(f => !f.isRequired)
    .map(f => `- ${f.displayName}: ${f.description}`)
    .join('\n');

  return `
${personaMap[interview.type]}

## YOUR OBJECTIVE
${interview.objective}

${interview.context ? `## CONTEXT\n${interview.context}\n` : ''}

## INFORMATION TO COLLECT
You must collect the following information through natural conversation.
Do not ask all questions at once. Ask one thing at a time.
Probe deeper when answers are vague. Follow up on interesting details.
Adapt your questions based on what the person has already told you.

Required information (you must gather all of this):
${requiredFieldsList || '(none specified — use your judgment)'}

Optional information (collect if it comes up naturally):
${optionalFieldsList || '(none)'}

## CONVERSATION RULES
1. Keep responses SHORT and conversational. Maximum 2-3 sentences per message.
2. Ask only ONE question per message.
3. Acknowledge what the person said before asking the next question.
4. Sound human and warm, not robotic or clinical.
5. Never mention that you're extracting data or building a profile.
6. When you have gathered all required information, wrap up naturally.
   Use a closing like: "Thank you, I have everything I need. Your responses have been recorded."
7. If the person asks to stop or says they're done, respect it and close gracefully.
8. This conversation is happening on Telegram. Keep messages short and readable on mobile.
9. Do not ask for information you have already received.
10. Maximum conversation length: ${interview.maxTurns} total messages.

## TONE
${interview.type === 'HIRING' ? 'Professional but warm. This is a screening conversation, not a job offer.' : ''}
${interview.type === 'LEAD_QUALIFICATION' ? 'Consultative and helpful. You are solving their problem, not selling to them.' : ''}
${interview.type === 'CUSTOMER_FEEDBACK' ? 'Empathetic and curious. Every piece of feedback is valuable.' : ''}
${interview.type === 'CLIENT_ONBOARDING' ? 'Collaborative and thorough. You want to understand their situation deeply.' : ''}
${interview.type === 'MARKET_RESEARCH' ? 'Neutral and curious. You have no agenda — you are genuinely interested in their perspective.' : ''}
`.trim();
}
```

### 5.3 Extraction System Prompt

```typescript
function buildExtractionSystemPrompt(fields: InterviewField[]): string {
  const fieldDescriptions = fields
    .map(f => `- "${f.fieldName}" (${f.fieldType}): ${f.description}`)
    .join('\n');

  return `
You are a precise data extraction engine. 
Given a user's message in a conversation, extract any relevant information that matches the target fields.

## TARGET FIELDS
${fieldDescriptions}

## RULES
1. Only extract information that is EXPLICITLY stated or CLEARLY implied by the user.
2. Do not infer or guess values that are not supported by the user's exact words.
3. For arrays, extract all individual items mentioned.
4. Confidence score: 1.0 = user stated it explicitly; 0.7 = clearly implied; 0.5 = uncertain.
5. If nothing can be extracted from this message, return an empty updates array.
6. For RATING fields, convert natural language sentiment to a 1-5 score:
   (terrible/awful = 1, bad = 2, okay/neutral = 3, good = 4, excellent/amazing = 5)
7. rawEvidence should be the exact fragment of user text supporting the extraction.

Use the update_entities tool to report your extractions.
`.trim();
}
```

### 5.4 Conversation Closing Instruction (injected at max turns - 2)

```typescript
const WRAP_UP_INJECTION = `
[SYSTEM: You are approaching the conversation limit. In your NEXT message, 
begin wrapping up the conversation. Thank the person and signal that 
their responses have been recorded. Do not ask any more questions.]
`;
```

### 5.5 Opening Message Generation

The very first message the AI sends (before any user input) is also AI-generated. We call the LLM once to generate a warm, contextual greeting:

```typescript
async generateOpeningMessage(interview: Interview): Promise<string> {
  // One-time generation when the interview goes ACTIVE
  // Cached on the Interview record as interview.openingMessage
  // So all sessions get the same opening (consistent, no extra LLM call per session)
}
```

---

## 6. NestJS API — New & Modified Modules

### 6.1 Directory Structure (New Files Only)

```
apps/api/src/modules/
├── interview/                         🆕
│   ├── interview.module.ts
│   ├── interview.service.ts
│   ├── interview.controller.ts        ← Dashboard API endpoints
│   └── dto/
│       ├── create-interview.dto.ts
│       ├── update-interview.dto.ts
│       └── interview-field.dto.ts
├── interview-session/                 🆕
│   ├── interview-session.module.ts
│   ├── interview-session.service.ts  ← Core AI conversation logic
│   └── dto/
│       └── send-message.dto.ts
├── llm/                               🆕
│   ├── llm.module.ts
│   ├── llm.service.ts                ← Chat + extraction abstraction
│   ├── embedding.service.ts          ← Vector embedding generation
│   ├── prompt-builder.service.ts     ← System prompt construction
│   └── providers/
│       └── openrouter.provider.ts    ← OpenAI-SDK → OpenRouter → Gemini 2.5 Flash
├── vector-search/                     🆕
│   ├── vector-search.module.ts
│   └── vector-search.service.ts      ← pgvector queries via raw SQL + Prisma
├── subscription/                      🆕
│   ├── subscription.module.ts
│   ├── subscription.service.ts
│   └── subscription.controller.ts    ← Paystack webhook for billing
└── dashboard-auth/                    🆕
    ├── dashboard-auth.module.ts
    ├── dashboard-auth.service.ts      ← Magic link generation
    └── dashboard-auth.controller.ts  ← Token exchange endpoint
```

### 6.2 InterviewService (Key Methods)

```typescript
// interview.service.ts

async create(creatorId: string, dto: CreateInterviewDto): Promise<Interview>
// Creates interview with type, objective, context. Pre-populates fields from template.

async activate(interviewId: string, creatorId: string): Promise<Interview>
// Sets status DRAFT → ACTIVE. Generates shareToken + shareLink.
// Also triggers openingMessage generation (LLM call, cached on record).

async findById(interviewId: string): Promise<InterviewWithFields>
// Returns interview + all schema fields ordered by orderIndex.

async findByCreator(creatorId: string, page: number, limit: number): Promise<PaginatedInterviews>

async findByShareToken(shareToken: string): Promise<InterviewWithFields>

async updateFields(interviewId: string, creatorId: string, fields: InterviewFieldDto[]): Promise<void>
// Replaces all fields for this interview (creator is editing the schema).

async transition(interviewId: string, creatorId: string, to: InterviewStatus): Promise<Interview>
// ACTIVE → CLOSED, CLOSED → ACTIVE, CLOSED → ARCHIVED

async getStats(interviewId: string): Promise<InterviewStats>
// Returns: total sessions, completed sessions, completion rate, avg turn count,
//          most recently active sessions, field coverage rates
```

### 6.3 InterviewSessionService (Core — AI Conversation)

```typescript
// interview-session.service.ts — the heart of Flux Interview

async startSession(shareToken: string, userTelegramId: string): Promise<SessionStartResult> {
  // 1. Fetch interview by shareToken
  // 2. Check interview.status === ACTIVE
  // 3. Check subscription limits (creator's responseCount < responseLimit)
  // 4. Check for existing COMPLETED session (reject duplicate)
  // 5. Check for existing ACTIVE/INTERRUPTED session (offer resume)
  // 6. Create new InterviewSession
  // 7. Return interview.openingMessage as the first AI message
}

async sendMessage(
  sessionId: string,
  userTelegramId: string,
  message: string,
): Promise<SendMessageResult> {
  // 1. Load session + interview + fields
  // 2. Validate session state === ACTIVE
  // 3. Validate interview still ACTIVE (creator hasn't closed it)
  // 4. Save user message to interview_messages
  // 5. Check if wrap-up should be triggered (all required fields extracted OR at max turns)
  // 6. Build message history array from DB (last 20 messages for context window)
  // 7. Fire parallel LLM calls:
  //    - Promise 1: conversation turn (returns AI response text)
  //    - Promise 2: extraction call (returns entity updates)
  // 8. Await Promise 1 (blocking — user is waiting for AI response)
  // 9. Save AI message to interview_messages
  // 10. Check if AI response signals completion (closing phrases)
  // 11. Increment session.turnCount
  // 12. If complete: update session state to COMPLETED, increment subscription counter
  // 13. Handle Promise 2 in background (setImmediate): upsert extracted entities
  //     If complete: also generate profile embedding + store in profileEmbedding column
  // 14. Return { aiMessage, isComplete, sessionState }
}

async getSessionWithProfile(sessionId: string): Promise<SessionWithProfile> {
  // Returns full message history + current extracted entities (for dashboard)
}

async interruptSession(sessionId: string): Promise<void>
// Called when interview is closed while sessions are active

async getSessionsForInterview(
  interviewId: string,
  page: number,
  limit: number,
): Promise<PaginatedSessions>
// Returns sessions with extracted entity summaries (for dashboard list view)
```

### 6.4 LLMService + EmbeddingService

```typescript
// llm.service.ts

async generateConversationTurn(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
  return this.openrouter.chat(input);
}

async extractEntities(input: ExtractionInput): Promise<ExtractionOutput> {
  return this.openrouter.extractWithFunctions(input);
}

async generateOpeningMessage(interview: Interview, fields: InterviewField[]): Promise<string> {
  const systemPrompt = this.promptBuilder.buildConversationSystemPrompt(interview, fields);
  const result = await this.openrouter.chat({
    systemPrompt,
    messageHistory: [],
    latestUserMessage: '[START_CONVERSATION]',  // Special trigger
    maxTokens: 200,
  });
  return result.text;
}
```

```typescript
// embedding.service.ts

async embed(text: string): Promise<number[]> {
  // Uses OpenRouter → google/gemini-embedding-exp-03-07
  // Returns 3072-dimensional vector
  const response = await this.openrouter.createEmbedding({
    model: 'google/gemini-embedding-exp-03-07',
    input: text,
  });
  return response.data[0].embedding;
}

async embedProfile(entities: ExtractedEntity[], fields: InterviewField[]): Promise<number[]> {
  const text = this.buildProfileText(entities, fields);
  return this.embed(text);
}

private buildProfileText(entities: ExtractedEntity[], fields: InterviewField[]): string {
  return fields
    .map(f => {
      const entity = entities.find(e => e.fieldName === f.fieldName);
      if (!entity) return null;
      return `${f.displayName}: ${JSON.stringify(entity.value)}`;
    })
    .filter(Boolean)
    .join('. ');
}
```

```typescript
// vector-search.service.ts

async searchSessions(
  interviewId: string,
  queryText: string,
  limit = 10,
): Promise<string[]> {
  const queryVector = await this.embeddingService.embed(queryText);
  // Prisma doesn't support vector operators natively — use $queryRaw
  const results = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM interview_sessions
    WHERE interview_id = ${interviewId}
      AND state = 'COMPLETED'
      AND profile_embedding IS NOT NULL
    ORDER BY profile_embedding <=> ${queryVector}::vector
    LIMIT ${limit}
  `;
  return results.map(r => r.id);
}

async findSimilarSessions(
  referenceSessionId: string,
  interviewId: string,
  limit = 5,
): Promise<string[]> {
  const results = await this.prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM interview_sessions
    WHERE interview_id = ${interviewId}
      AND id != ${referenceSessionId}
      AND state = 'COMPLETED'
      AND profile_embedding IS NOT NULL
    ORDER BY profile_embedding <=> (
      SELECT profile_embedding FROM interview_sessions WHERE id = ${referenceSessionId}
    )
    LIMIT ${limit}
  `;
  return results.map(r => r.id);
}
```

### 6.5 DashboardAuthService

```typescript
// dashboard-auth.service.ts

async generateMagicLink(creatorTelegramId: string): Promise<string> {
  const user = await this.prisma.user.findUnique({ where: { telegramId: creatorTelegramId } });
  if (!user) throw new NotFoundException();

  const token = await this.prisma.dashboardToken.create({
    data: {
      creatorId: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),  // 15 minutes
    },
  });

  return `${process.env.CREATOR_DASHBOARD_URL}/auth/callback?token=${token.token}`;
}

async exchangeToken(token: string): Promise<{ jwt: string }> {
  const record = await this.prisma.dashboardToken.findUnique({ where: { token } });
  if (!record) throw new UnauthorizedException();
  if (record.expiresAt < new Date()) throw new UnauthorizedException('Token expired');
  if (record.usedAt) throw new UnauthorizedException('Token already used');

  await this.prisma.dashboardToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  return { jwt: this.authService.signToken(record.creatorId, 'CREATOR') };
}
```

### 6.6 SubscriptionService

```typescript
// subscription.service.ts

async getOrCreateFree(creatorId: string): Promise<Subscription>
// Ensures creator always has a subscription record (default FREE)

async checkLimit(creatorId: string): Promise<{ allowed: boolean; remaining: number }>
// Called before starting a new interview session

async incrementCount(creatorId: string): Promise<void>
// Called when a session reaches COMPLETED state

async handlePaystackSubscriptionWebhook(payload: object, sig: string): Promise<void>
// Handles: subscription.create, subscription.disable, charge.success, invoice.payment_failed

async upgradePlan(creatorId: string, plan: SubscriptionPlan): Promise<Subscription>
// Called from dashboard after Paystack subscription creation
```

### 6.7 Dashboard API Endpoints

```
# Interview management (all require JWT from dashboard login)
GET    /dashboard/interviews                       → paginated list
POST   /dashboard/interviews                       → create interview
GET    /dashboard/interviews/:id                   → interview detail + fields
PUT    /dashboard/interviews/:id                   → update title/objective/context
PUT    /dashboard/interviews/:id/fields            → replace all schema fields
POST   /dashboard/interviews/:id/activate          → activate (sets ACTIVE, generates share link)
POST   /dashboard/interviews/:id/close             → close
POST   /dashboard/interviews/:id/reopen            → reopen
GET    /dashboard/interviews/:id/stats             → response stats, completion rate
GET    /dashboard/interviews/:id/sessions          → paginated sessions list
GET    /dashboard/interviews/:id/sessions/:sid     → full session (messages + extracted entities)
POST   /dashboard/interviews/:id/sessions/search   → semantic search (embeds query, pgvector lookup)
GET    /dashboard/interviews/:id/sessions/:sid/similar → find similar sessions (pgvector)
GET    /dashboard/interviews/:id/export            → CSV download of all extracted entities

# Subscription
GET    /dashboard/subscription                     → current plan + usage
POST   /dashboard/subscription/upgrade             → initiate Paystack subscription

# Auth
POST   /auth/dashboard/exchange                    → exchange magic link token for JWT
GET    /auth/me                                    → current user info
```

---

## 7. Creator Bot — Interview Creation Flow

### 7.1 New Commands

```
/createinterview    → Build a new Flux Interview (AI-driven)
/myinterviews       → View all interviews (separate from /myforms)
/interview <id>     → View interview detail
```

### 7.2 Interview Creation Step Machine

```
ConversationStep (Creator — Interview):
  INTERVIEW_AWAITING_TITLE
  INTERVIEW_AWAITING_OBJECTIVE
  INTERVIEW_AWAITING_CONTEXT
  INTERVIEW_CONFIRMING_TEMPLATE_FIELDS    ← show pre-populated fields, ask to confirm
  INTERVIEW_TYPE_SELECTED                 ← intermediate callback state
```

### 7.3 Message-by-Message Flow

#### `/createinterview`

```
Bot → inline keyboard:
"🎙 Create a Flux Interview

Flux Interviews use AI to conduct natural conversations and extract 
structured data from respondents. Perfect for hiring, lead qualification, 
onboarding, and research.

Choose a template:
[🧑‍💼 Hiring]         [🎯 Lead Qualification]
[💬 Customer Feedback]  [🤝 Client Onboarding]
[📊 Market Research]    [✏️ Custom / Blank]"
```

#### Template Selected (e.g., "Hiring")

```
→ Store templateType = 'HIRING' in BotState
→ Set step = INTERVIEW_AWAITING_TITLE

Bot → "🧑‍💼 Hiring Interview

What's the job title or role you're hiring for?
Example: Senior Frontend Developer"
```

#### INTERVIEW_AWAITING_TITLE (user sends text)

```
Validate: 3–100 characters

→ Store title in BotState
→ Set step = INTERVIEW_AWAITING_OBJECTIVE

Bot → "Now describe what this interview should accomplish.
Be specific — this is what the AI uses to guide the conversation.

Example: 'Screen candidates for a frontend developer role at a Lagos fintech. 
Focus on React experience, problem-solving skills, and culture fit.'"
```

#### INTERVIEW_AWAITING_OBJECTIVE (user sends text)

```
Validate: 10–500 characters

→ Store objective in BotState
→ Set step = INTERVIEW_AWAITING_CONTEXT

Bot → "(Optional) Add any context the AI should know:
company name, industry, team size, what you're NOT looking for, etc.

Send a message or tap Skip."

[Skip →]
```

#### INTERVIEW_AWAITING_CONTEXT (user sends text or taps Skip)

```
→ Create Interview record in DB with type + title + objective + context
→ Pre-populate InterviewFields from template defaults
→ Set step = INTERVIEW_CONFIRMING_TEMPLATE_FIELDS

Bot → 
"✅ Interview created: 'Senior Frontend Developer'

Here's what the AI will extract from each conversation:
─────────────────────────────
1. Full Name
2. Current Role
3. Years of Experience
4. Technical Skills (list)
5. Salary Expectation
6. Availability
7. Why Interested
─────────────────────────────

These fields are the structured data you'll see in your dashboard for every applicant.

[✅ Looks Good — Activate]  [✏️ Edit in Dashboard]  [🗑 Delete]"
```

#### "Activate" Selected

```
→ interview.service.activate() called
→ LLM generates opening message (cached on interview record)
→ shareToken + shareLink generated
→ BotState cleared

Bot →
"✅ 'Senior Frontend Developer' interview is now LIVE!

📤 Share this link with candidates:
t.me/FluxFormAssistant_bot?start=<shareToken>

Every candidate who opens this link will have a natural AI conversation.
You'll see their profiles on your dashboard:
👉 [Open Dashboard] (web button → creator-dashboard URL)

[📊 View Sessions]  [🔒 Close Interview]  [📤 Share Link]"
```

Note: The dashboard link is a web URL button (not Mini App), because the dashboard is a full web app.

#### "Edit in Dashboard" Selected

```
Bot →
"✏️ To customize the extracted fields, open the dashboard:
👉 [Edit in Dashboard]

After editing, you can activate the interview from there or come back here and use /interview <id>."
```

### 7.4 `/myinterviews`

```
Bot → (paginated, 5 per page)
"🎙 Your Interviews

🟢 Senior Frontend Dev — 12 sessions (8 complete)
📝 Product Manager (Draft)
🔴 Sales Lead Qualifier — 45 sessions (closed)

[View] buttons for each
[◀ Prev] [1/3] [Next ▶]"
```

### 7.5 Interview Card (`/interview <id>`)

```
Bot →
"🎙 Senior Frontend Developer
Type: Hiring
Status: 🟢 Active
Sessions: 12 (8 completed, 4 in progress)
Completion rate: 67%
Fields: 7

[📊 View Sessions]   [📤 Share Link]
[🔒 Close]           [🖥 Open Dashboard]"
```

---

## 8. Filler Bot — AI Conversation Flow

### 8.1 How the Filler Bot Changes

The Filler Bot must now handle two fundamentally different flows:

1. **Standard Form** (existing): static questions, button/text answers, structured
2. **Flux Interview** (new): AI-driven conversation, free-text only, dynamic

The bot detects which flow based on the share token — Standard Form tokens link to `Form` records, Interview tokens link to `Interview` records.

```
/start <token>
     │
     ▼
Look up token in:
  ├── forms.share_token  →  Standard Form flow (existing)
  └── interviews.share_token  →  Flux Interview flow (new)
```

### 8.2 Flux Interview Session Step Machine

```
ConversationStep (Filler — Interview):
  INTERVIEW_ACTIVE       ← sending/receiving messages with AI
  INTERVIEW_COMPLETED    ← terminal
  INTERVIEW_INTERRUPTED  ← terminal (interview closed mid-session)
```

BotState context for active interview session:
```json
{
  "sessionId": "clxxx",
  "interviewId": "clyyy",
  "shareToken": "abc123"
}
```

### 8.3 Message-by-Message Flow (Detailed)

#### Entry: `t.me/FluxFormAssistant_bot?start=<interviewShareToken>`

```
Bot parses /start payload = shareToken

→ Lookup token: is this an Interview or Form?
→ If Interview:
  → interviewSessionService.startSession(shareToken, telegramId)
  → Handles duplicate / resume logic
  → Returns interview.openingMessage (pre-generated, no LLM call)

Bot sends interview.openingMessage:
"Hi! I'm Alex, a recruiter at [Company]. I'll be having a quick conversation
with you about the Senior Frontend Developer role.

To get started, tell me a bit about your current work and experience."
```

#### Resume Interrupted Session

```
→ If existing ACTIVE/INTERRUPTED session found:

Bot →
"Welcome back! You were in the middle of an interview for 'Senior Frontend Developer'.

[▶ Continue where I left off]  [✗ Start fresh]"

On "Continue":
  → Load last N messages from DB
  → Reconstruct context for LLM
  → AI generates a re-engagement message:
    "Welcome back! Last we spoke, you mentioned [last topic]. 
     Shall we continue from there?"
```

#### Normal Conversation Turn

```
User sends any text message
     │
     ▼
interviewSessionService.sendMessage(sessionId, telegramId, message)
     │
     ▼
[LLM Call 1: Conversation]    [LLM Call 2: Extraction] (parallel)
     │                               │
     ▼                               ▼
AI response text (0.5-1.5s)    Entity updates (background)
     │
     ▼
Bot sends AI response

(Telegram shows "typing..." while waiting for LLM response)
```

**Handling typing indicator:**

```typescript
// Before LLM call:
await bot.api.sendChatAction(chatId, 'typing');

// Fire LLM:
const result = await interviewSessionService.sendMessage(...);

// Send response:
await ctx.reply(result.aiMessage);
```

#### Conversation Completion

```
AI response signals completion (e.g., "Thank you, I have everything I need.")
     │
     ▼
session.state = COMPLETED
subscription.responseCount++

Bot sends AI closing message, then immediately after:

Bot →
"✅ Your interview responses have been recorded.

The hiring team will be in touch if your profile is a match.
Good luck! 🍀"
```

#### Interview Closed Mid-Conversation

```
Creator closes interview while a user is in a session

On user's NEXT message:
→ interviewSessionService detects interview.status !== ACTIVE
→ session.state = INTERRUPTED

Bot →
"⚠️ This interview has been closed by the hiring team.
Your conversation has been saved up to this point."
```

#### Duplicate Attempt

```
User opens the link again after completing:

Bot →
"✅ You've already completed this interview. Your responses have been recorded."
```

#### User Tries to Send Commands During Interview

```
Commands like /back, /cancel are handled differently in interview mode:

/cancel:
Bot → "Are you sure you want to stop?
Your partial responses will still be visible to the creator.
[Yes, Stop]  [Continue Interview]"

→ On confirm: session.state = INTERRUPTED

/back:
Bot → "Going back isn't available in interview mode — the AI conversation
builds on your previous answers. You can clarify anything you said by 
simply sending a new message."
```

---

## 9. Creator Dashboard — Complete UI System

### 9.1 Overview

The Creator Dashboard is a full web application (`apps/creator-dashboard/`). This is where creators:
- Build and manage interviews (more powerful than the bot)
- See all conversation transcripts
- View extracted profiles per respondent
- Export data
- Manage their subscription

The bot is the **notification + quick management** surface. The dashboard is the **full control + data insight** surface.

### 9.2 Tech Stack

```
apps/creator-dashboard/
├── app/                    Next.js 15 App Router
├── components/
│   ├── ui/                 shadcn/ui components
│   ├── interview/          Interview-specific components
│   ├── session/            Session/conversation components
│   └── layout/             Shell, sidebar, nav
├── lib/
│   ├── api.ts              Typed API client (fetch wrapper)
│   ├── auth.ts             Auth helpers + JWT management
│   └── utils.ts
└── hooks/
    ├── use-interviews.ts
    └── use-session.ts
```

**Dependencies:**
- `next` — 15.x App Router
- `tailwindcss` — styling
- `shadcn/ui` — component library (Button, Card, Table, Dialog, Badge, etc.)
- `@tanstack/react-query` — server state management + caching
- `recharts` — analytics charts
- `date-fns` — date formatting
- `react-hook-form` + `zod` — form validation

### 9.3 Authentication System

**Flow:**
```
1. Creator visits dashboard.fluxforms.io
2. They see a landing page with: [Login with Telegram Bot]
3. They tap this, which sends them to t.me/FluxFormStudio_bot?start=dashboard
4. Creator Bot handles /start dashboard:
   → Generates a magic link token (15-minute TTL)
   → Sends: "Click here to open your dashboard: [Open Dashboard] (web button)"
5. Creator taps the link → opens dashboard.fluxforms.io/auth/callback?token=xxx
6. Dashboard page sends token to POST /auth/dashboard/exchange
7. Receives JWT (7-day expiry)
8. JWT stored in httpOnly cookie
9. Creator is now logged in
```

**Middleware protection:**

```typescript
// middleware.ts
export function middleware(req: NextRequest) {
  const token = req.cookies.get('flux_session')?.value;
  if (!token && !req.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }
}
```

### 9.4 Page-by-Page Design

#### Page 1: Auth/Login (`/auth/login`)

```
┌─────────────────────────────────────────────────┐
│                 FluxForms                        │
│                                                  │
│         AI-powered conversational forms          │
│              inside Telegram                     │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │  ✈ Login with Telegram Bot                │   │  ← Opens t.me/FluxFormStudio_bot?start=dashboard
│  └───────────────────────────────────────────┘   │
│                                                  │
│  After tapping, open the link the bot sends you. │
└─────────────────────────────────────────────────┘
```

#### Page 2: Auth Callback (`/auth/callback`)

```
Loading... → Exchanges token → Redirects to /dashboard
Error handling: expired token, already used → Show error + retry link
```

#### Page 3: Dashboard Home (`/dashboard`)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ FluxForms          [Interviews ▾]  [Subscription]           [User ▾]       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Good morning, Daniel                          📅 June 2026                │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │  Total Sessions  │  │  Completed       │  │  Remaining This  │         │
│  │      247         │  │    183 (74%)     │  │  Month: 317/500  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────┐        │
│  │  Responses This Month                                          │        │
│  │  [Line chart: daily completed interviews over last 30 days]    │        │
│  └────────────────────────────────────────────────────────────────┘        │
│                                                                            │
│  Recent Activity                                                           │
│  ─────────────────────────────────────────────────────────────────        │
│  🎙 Senior Frontend Dev    Aisha K. completed   2 minutes ago             │
│  🎙 Lead Qualifier         Emeka O. started     8 minutes ago             │
│  🎙 Senior Frontend Dev    Tunde A. completed   1 hour ago                │
│  [View all →]                                                              │
│                                                                            │
│  Your Interviews                                                           │
│  ─────────────────────────────────────────────────────────────────        │
│  🟢 Senior Frontend Developer    32 sessions    [View]                     │
│  🟢 Lead Qualifier 2026          18 sessions    [View]                     │
│  📝 Customer Survey (Draft)       0 sessions    [View]                     │
│  [+ Create New Interview]                                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Page 4: Interviews List (`/dashboard/interviews`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Interviews                              [+ Create New Interview]            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Filter: [All ▾]  [Hiring ▾]  [Active ▾]           Search: [           ]   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 🟢 Senior Frontend Developer                          ACTIVE  Hiring  │  │
│  │    32 sessions · 24 completed · 75% completion rate                   │  │
│  │    Created June 5 · Last response 2 mins ago                          │  │
│  │    [View]  [Share Link]  [Close]                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 🟢 Q2 Lead Qualifier                         ACTIVE  Lead Qual        │  │
│  │    18 sessions · 12 completed · 67% completion rate                   │  │
│  │    [View]  [Share Link]  [Close]                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 📝 Customer Onboarding Survey                 DRAFT  Onboarding       │  │
│  │    Not yet active · 0 sessions                                        │  │
│  │    [View]  [Activate]  [Delete]                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Page 5: Create Interview Wizard (`/dashboard/interviews/new`)

Multi-step wizard. Each step is a page segment (no page reload between steps).

```
Step 1: Choose Template
─────────────────────────────────────────────────────
  Which type of interview are you creating?
  
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │   🧑‍💼 Hiring      │  │  🎯 Lead Qual    │  │  💬 Feedback     │
  │                  │  │                  │  │                  │
  │  Screen job      │  │  Qualify sales   │  │  Gather customer │
  │  applicants      │  │  prospects       │  │  feedback        │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  🤝 Onboarding   │  │  📊 Research     │  │  ✏️ Custom        │
  │                  │  │                  │  │                  │
  │  Onboard new     │  │  Market research │  │  Start blank,    │
  │  clients         │  │  & surveys       │  │  define your own │
  └──────────────────┘  └──────────────────┘  └──────────────────┘

Step 2: Basic Info
─────────────────────────────────────────────────────
  Interview Title *
  [Senior Frontend Developer                        ]
  
  Objective * (what should the AI try to accomplish?)
  [Screen candidates for a frontend developer role at a
   Lagos fintech. Focus on React experience, problem-
   solving ability, and culture fit.                 ]
  
  Context (optional — company info, what to avoid, etc.)
  [We are a team of 15 engineers. We use React, Node.js,
   and TypeScript. We do NOT want to see candidates who
   only have experience with jQuery.                 ]

Step 3: Extraction Schema
─────────────────────────────────────────────────────
  These are the structured fields the AI will extract from 
  each conversation. You'll see these in your dashboard.
  
  ┌──────────────────────────────────────────────────────────┐
  │  Field Name          Type      Description         Del   │
  │  ─────────────────────────────────────────────────────── │
  │  Full Name           Text      The person's full name [x]│
  │  Current Role        Text      Their current job title [x]│
  │  Years Experience    Number    Total years in tech    [x]│
  │  Technical Skills    Array     Programming languages, [x]│
  │                                frameworks, tools         │
  │  Salary Expectation  Text      Expected monthly salary[x]│
  │  Availability        Text      When can they start    [x]│
  │  Why Interested      Text      Motivation for role    [x]│
  │  ─────────────────────────────────────────────────────── │
  │  [+ Add Custom Field]                                     │
  └──────────────────────────────────────────────────────────┘
  
  Each field can be marked Required (AI will probe until extracted)
  or Optional (collected if it comes up naturally).

Step 4: Preview
─────────────────────────────────────────────────────
  Here's how the AI will open the conversation:
  
  ┌─────────────────────────────────────────────────┐
  │  AI:  Hi! I'm here on behalf of [Company] to     │
  │       chat with you about the Senior Frontend    │
  │       Developer role. Let's have a quick         │
  │       conversation about your background.        │
  │                                                  │
  │       To start — tell me a bit about what you're │
  │       currently working on.                      │
  └─────────────────────────────────────────────────┘
  
  [Regenerate Opening]   [← Back]   [Activate Interview →]
```

#### Page 6: Interview Detail (`/dashboard/interviews/:id`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Interviews    Senior Frontend Developer    [Close Interview]  [Share ↗]  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  🟢 Active · Hiring · Created June 5, 2026                                 │
│                                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Total     │  │ Completed  │  │ In Progress│  │ Avg Turns  │           │
│  │    32      │  │  24 (75%)  │  │     8      │  │    11.3    │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                                                                             │
│  Extraction Coverage                   Share Link                           │
│  ─────────────────────                 ─────────────────────────           │
│  Full Name          96%  [████████░]   t.me/FluxFormAssistant...           │
│  Current Role       94%  [███████░░]   [Copy Link]                         │
│  Years Experience   88%  [███████░░]                                        │
│  Skills             91%  [████████░]   [Export All Data (CSV)]             │
│  Salary Expectation 71%  [█████░░░░]                                        │
│  Availability       83%  [██████░░░]                                        │
│                                                                             │
│  Sessions                                        [Filter ▾] [Search     ]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  NAME              SKILLS EXTRACTED     DATE          STATUS   ACTION       │
│  Aisha Kone        React, TypeScript    Jun 8, 3:22pm Complete  [View]      │
│  Emeka Okonkwo     Angular, Vue         Jun 8, 2:10pm Complete  [View]      │
│  Tunde Adeyemi     —                   Jun 8, 1:05pm In Progress [View]     │
│  Chioma Eze        React, Next.js       Jun 7, 4:33pm Complete  [View]      │
│  [Load more...]                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Page 7: Session / Conversation Viewer (`/dashboard/interviews/:id/sessions/:sid`)

This is the most important UI in the dashboard. It is a **split-pane view**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Senior Frontend Dev    Aisha Kone · Jun 8, 2026 · 13 turns · Completed  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CONVERSATION                        │  EXTRACTED PROFILE                  │
│  ────────────────────────────────    │  ─────────────────────────────────  │
│                                      │                                     │
│  🤖 Hi! I'm here on behalf of...    │  Full Name                          │
│     Tell me about your background.  │  Aisha Kone                         │
│                                      │                                     │
│  👤 I'm a frontend developer with   │  Current Role                       │
│     5 years experience, mainly      │  Senior Frontend Developer           │
│     working with React and Next.js  │  at Paystack                        │
│                                      │                                     │
│  🤖 That's great! You mentioned     │  Years of Experience                 │
│     React — what kind of projects   │  5 years                            │
│     have you worked on?             │                                     │
│                                      │  Technical Skills                   │
│  👤 Mostly fintech dashboards and   │  React, Next.js, TypeScript,        │
│     data visualization. I've also   │  GraphQL, Recharts                  │
│     done a lot of performance       │                                     │
│     optimization work.              │  Salary Expectation                 │
│                                      │  ₦800,000/month                    │
│  🤖 Performance optimization is     │                                     │
│     very relevant for us. What's    │  Availability                       │
│     the largest scale you've        │  2 weeks notice                     │
│     worked at in terms of users?    │                                     │
│                                      │  Why Interested                     │
│  👤 Our biggest app had about        │  Growth opportunity,                │
│     200,000 MAU. The main challenge │  loves fintech space                │
│     was managing re-renders...      │                                     │
│                                      │  ─────────────────────────────────  │
│  [... 8 more messages ...]          │  Confidence Scores                  │
│                                      │  Full Name        ████████ 100%    │
│  🤖 Thank you, Aisha! I have        │  Skills           ███████░  91%     │
│     everything I need. Your         │  Salary           ██████░░  78%     │
│     responses have been recorded.   │  Availability     ███████░  88%     │
│                                      │                                     │
│  ────────────────────────────        │  [Export This Profile (JSON)]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key UX decisions for this view:**
- Conversation is left-pane, scrollable. AI messages left-aligned, user messages right-aligned.
- Profile is right-pane, sticky (stays in view as user scrolls conversation).
- Confidence scores shown as progress bars in a collapsed "Confidence" section.
- Raw evidence tooltip: hovering over an extracted value shows the user quote that generated it.
- Export button downloads `{session_id}.json` with full messages + extracted entities.

#### Page 8: Analytics (`/dashboard/interviews/:id/analytics`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Senior Frontend Dev    Analytics                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  [Last 7 days ▾]                                                            │
│                                                                             │
│  ┌─────────────────────────────────────┐  ┌───────────────────────────┐    │
│  │  Completions Per Day                │  │  Completion Funnel        │    │
│  │  [Bar chart: Mon-Sun]               │  │                           │    │
│  │  Mon: 4, Tue: 7, Wed: 3, ...        │  │  Started:   32  ██████████│    │
│  └─────────────────────────────────────┘  │  2+ turns:  28  █████████ │    │
│                                           │  5+ turns:  26  ████████  │    │
│  ┌─────────────────────────────────────┐  │  Completed: 24  ███████   │    │
│  │  Avg Turns to Completion            │  └───────────────────────────┘    │
│  │  11.3 turns                         │                                   │
│  │  [Distribution histogram]           │  ┌───────────────────────────┐    │
│  └─────────────────────────────────────┘  │  Top Skills Mentioned     │    │
│                                           │  React        ████████ 18  │    │
│  ┌─────────────────────────────────────┐  │  TypeScript   ███████  14  │    │
│  │  Field Extraction Rate              │  │  Next.js      ██████   11  │    │
│  │  Full Name       96%  ████████      │  │  Node.js      █████    9   │    │
│  │  Skills          91%  ███████       │  │  Vue          ███      5   │    │
│  │  Salary          71%  █████         │  └───────────────────────────┘    │
│  └─────────────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Note: "Top Skills Mentioned" is generated by aggregating the ARRAY-type extracted values across all sessions. This requires an aggregation query, not another LLM call.

#### Page 9: Export (`/dashboard/interviews/:id/export`)

```
Two export formats:

1. CSV Export (structured data only)
   One row per completed session.
   Columns: session_id, date, [one column per field in the schema]
   Example: 
   session_id, date, full_name, years_experience, skills, salary, availability
   clxxx,      Jun8, Aisha Kone, 5, "React;Next.js;TypeScript", ₦800k, 2 weeks

2. Full JSON Export (messages + entities)
   Array of session objects, each with: messages[], extractedEntities{}
   Use case: feeding into another AI system or CRM

Download trigger: GET /dashboard/interviews/:id/export?format=csv|json
Streamed response (no timeout for large datasets)
```

#### Page 10: Subscription Management (`/dashboard/subscription`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Subscription                                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Current Plan: STARTER                              ₦15,000/month          │
│                                                                             │
│  This Month: 183 / 500 completed interviews used                           │
│  [████████████████████░░░░░░░░░] 37%                                        │
│                                                                             │
│  Period: June 1 – June 30, 2026                                             │
│  Renews automatically on July 1                                             │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Plans                                                                      │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │ FREE           │  │ STARTER ✓      │  │ GROWTH         │                │
│  │ ₦0/month       │  │ ₦15,000/month  │  │ ₦45,000/month  │                │
│  │ 50 interviews  │  │ 500 interviews │  │ 2,000/month    │                │
│  │                │  │                │  │                │                │
│  │ [Current Plan] │  │ [Current]      │  │ [Upgrade →]    │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                             │
│  * Unused interviews do not roll over.                                     │
│  * Both Flux Forms and Flux Interviews count toward the monthly limit.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Interview Builder — Field Editor Component

This is a standalone component on the Create Interview Step 3 and Interview Edit page.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Schema Fields                                          [+ Add Field] │
│  ────────────────────────────────────────────────────────────────── │
│  Drag to reorder                                                     │
│                                                                      │
│  ≡ Full Name          [Text ▾]  [Required ✓]             [Edit][✕]  │
│    The person's full name as they introduce themselves               │
│                                                                      │
│  ≡ Current Role       [Text ▾]  [Required ✓]             [Edit][✕]  │
│    Their current job title and company                               │
│                                                                      │
│  ≡ Technical Skills   [Array ▾] [Optional  ]             [Edit][✕]  │
│    Programming languages, frameworks, and tools they use             │
│                                                                      │
│  ≡ Salary Expectation [Text ▾]  [Optional  ]             [Edit][✕]  │
│    Expected monthly compensation (in Naira or stated currency)       │
│                                                                      │
│  [+ Add Field]                                                       │
└──────────────────────────────────────────────────────────────────────┘

Add/Edit Field Dialog:
┌─────────────────────────────────────────────────────────────┐
│  Edit Field                                                  │
│  ──────────────────────────────────────────────────────────  │
│  Display Name   [Technical Skills                          ] │
│  Field ID       [technical_skills                          ] │
│                 (auto-generated, used in export column name) │
│  Type           [Array ▾]                                    │
│  Required?      [ ] Yes  [✓] No                              │
│  Description    [Programming languages, frameworks, and      │
│                  tools the person uses professionally        ]│
│  ──────────────────────────────────────────────────────────  │
│                                  [Cancel]  [Save Field]      │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Monetization Architecture (Revised)

### 10.1 Model

Response-based subscription. Both Standard Forms and Flux Interviews count against the same monthly limit.

### 10.2 Plan Definitions

| Plan | Monthly Limit | Price | LLM Cost | Margin |
|---|---|---|---|---|
| Free | 50 responses | ₦0 | ~₦1,650 | -₦1,650 (acquisition cost) |
| Starter | 500 responses | ₦15,000 | ~₦16,500 | -₦1,500 (thin — upgrade pressure) |
| Growth | 2,000 responses | ₦45,000 | ~₦66,000 | -₦21,000 (loss leader at this price) |
| Enterprise | Custom | Negotiate | — | Profitable |

**Pricing correction needed:**
The LLM costs at Growth tier mean the ₦45,000 price needs to be at least ₦85,000 to break even. Either:
- Charge more (₦85,000/month for Growth)
- Reduce limits (1,000 interviews at Growth = ₦45k revenue vs ₦33k cost = thin but positive)
- Mix of both

**Recommended revised pricing:**

| Plan | Monthly Limit | Price |
|---|---|---|
| Free | 50 | ₦0 |
| Starter | 300 | ₦10,000 |
| Growth | 1,000 | ₦40,000 |
| Enterprise | 5,000+ | ₦150,000+ |

### 10.3 Enforcement

```typescript
// Before every new InterviewSession.create():
const check = await subscriptionService.checkLimit(creatorId);
if (!check.allowed) {
  throw new PaymentRequiredException(
    `You've reached your monthly limit of ${plan.limit} responses. 
     Upgrade your plan to continue.`
  );
}

// Creator Bot shows:
"⚠️ You've reached your monthly interview limit (50/50).
Upgrade your plan to accept more responses.
👉 [Upgrade Plan] (opens dashboard subscription page)"
```

### 10.4 Paystack Subscription Integration

Paystack supports recurring billing via their Subscription API:
- Creator pays via Mini App (same pattern as existing)
- Paystack creates a subscription plan + customer
- Monthly charge fires automatically
- Webhook events: `subscription.create`, `invoice.payment_success`, `invoice.payment_failed`, `subscription.disable`
- On `invoice.payment_failed`: send Creator Bot warning, grace period of 3 days, then suspend

---

## 11. Security Design (AI-Specific)

### 11.1 Prompt Injection Prevention

The primary new attack surface is prompt injection — where a user's message attempts to override the AI's instructions.

**Mitigations:**

1. **System prompt placement**: The system prompt is always sent as a `system` message (Anthropic API), never mixed into the conversation history. This makes it structurally impossible to override via a user message.

2. **Input length limit**: User messages are capped at 2,000 characters. Truncated silently before being sent to LLM.

3. **Conversation history sanitization**: Only `role: 'user'` and `role: 'assistant'` messages are included in history sent to LLM. System-role messages are never included. 

4. **AI response validation**: If the AI response contains sensitive patterns (e.g., "SYSTEM:", "OVERRIDE:", "IGNORE PREVIOUS"), it is discarded and a fallback response is sent.

5. **No PII leakage in prompts**: The system prompt never contains the creator's API keys, payment info, or other creator data beyond what they explicitly wrote in objective/context fields.

### 11.2 Content Moderation

```typescript
// Before sending user message to LLM:
// Simple block list for MVP. Replace with Anthropic's content filtering in production.
const BLOCKED_PATTERNS = [
  /ignore previous instructions/i,
  /you are now/i,
  /pretend you are/i,
  /system:\s/i,
  /\[INST\]/i,
];

function sanitizeUserInput(message: string): string {
  let sanitized = message.slice(0, 2000);
  // Log but don't block — just sanitize
  return sanitized;
}
```

### 11.3 LLM Cost Abuse Prevention

Bad actors could potentially keep a session running indefinitely to drain LLM credits.

**Hard limits enforced by InterviewSessionService:**
- Max turns per session: `interview.maxTurns` (default 20, max 50)
- Max input tokens per message: 2,000 characters from user
- Sessions inactive for > 24 hours: auto-INTERRUPTED
- Per-creator daily LLM spend cap (configurable): $5/day. If exceeded, new sessions return a friendly error.

### 11.4 Dashboard API Security

- All `/dashboard/*` endpoints require valid JWT
- JWT contains `{ sub: userId, role: 'CREATOR' }`
- Creator can only access their own interviews, sessions, entities
- No admin endpoints accessible from dashboard JWT (separate admin auth)
- Rate limiting: 100 requests/minute per JWT on dashboard endpoints

### 11.5 Magic Link Security

- 15-minute TTL
- Single use (marked `usedAt` after exchange)
- Tokens are cuid() — 25 characters of random base-36
- HTTPS only (Vercel enforces this on creator dashboard domain)
- Token exchange endpoint is rate-limited: 5 attempts/minute per IP

---

## 12. Scalability Considerations

### 12.1 LLM Latency Management

The LLM call introduces 0.5–2.0s of latency per message. Mitigations:

1. **Typing action**: Send `sendChatAction('typing')` before the LLM call. Telegram shows "typing..." in the chat.
2. **Parallel calls**: Conversation call and extraction call fire simultaneously. User only waits for the conversation call.
3. **Context window management**: Only send last 20 messages as history (not entire conversation). Most interviews complete in < 20 turns anyway.
4. **Haiku model**: `claude-haiku-4-5-20251001` is significantly faster than Sonnet for conversation turns (0.5-0.8s typical).

### 12.2 Concurrent LLM Calls

At 100 concurrent users in interviews:
- 100 LLM calls in-flight simultaneously
- Anthropic rate limits: 1,000 requests/minute on Haiku (production tier)
- 100 concurrent users = ~10 requests/second → well within limits
- Anthropic's concurrency limit is managed by connection pool in the provider

### 12.3 Message History Query

Every conversation turn requires fetching the last N messages for context. Optimize:

```typescript
// Fetch last 20 messages ordered by turn_index DESC, then reverse
const messages = await prisma.interviewMessage.findMany({
  where: { sessionId, role: { in: ['USER', 'AI'] } },
  orderBy: { turnIndex: 'desc' },
  take: 20,
});
messages.reverse();
```

Index on `(session_id, turn_index)` makes this fast.

### 12.4 Dashboard Query Performance

Sessions list with extracted summaries is a join-heavy query. For MVP:
- Paginate (10 per page)
- Pre-computed summaries not needed until > 10k sessions/interview

For scale: materialize a `session_summary` table updated by a DB trigger on `extracted_entities` changes.

---

## 13. Implementation Phases

### Phase 1 — LLM Infrastructure (Days 1–5)

- [ ] Add `openai` npm package to `apps/api/package.json` (used with OpenRouter baseURL)
- [ ] Create `LLMModule` with `OpenRouterProvider` (baseURL: `https://openrouter.ai/api/v1`)
- [ ] Implement `generateConversationTurn()` using `google/gemini-2.5-flash`
- [ ] Implement `extractEntities()` using OpenAI-compatible function calling
- [ ] Create `EmbeddingService` using `google/gemini-embedding-exp-03-07`
- [ ] Create `PromptBuilderService` with all 6 template types
- [ ] Unit test: all 6 system prompt templates generate non-empty output
- [ ] Unit test: extraction call returns valid JSON for sample messages
- [ ] Unit test: embedding returns a 3072-dim float array
- [ ] Add `OPENROUTER_API_KEY` to `.env`

### Phase 2 — Database Schema (Days 3–5, parallel with Phase 1)

- [ ] Write Prisma schema additions: `Interview`, `InterviewField`, `InterviewSession`, `InterviewMessage`, `ExtractedEntity`, `Subscription`, `DashboardToken`
- [ ] Add `profileEmbedding Unsupported("vector(3072)")` to `InterviewSession`
- [ ] Run migration to Supabase
- [ ] Enable pgvector extension in Supabase: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] Add HNSW index: `CREATE INDEX ON interview_sessions USING hnsw (profile_embedding vector_cosine_ops)`
- [ ] Add remaining indexes
- [ ] Verify schema with `prisma studio`
- [ ] Update `User` model with new relations
- [ ] Create `VectorSearchModule` with `VectorSearchService` (raw SQL via `prisma.$queryRaw`)

### Phase 3 — InterviewModule + InterviewSessionModule (Days 6–10)

- [ ] `InterviewService.create()` with template pre-population
- [ ] `InterviewService.activate()` with opening message generation
- [ ] `InterviewService.findByCreator()` + `findById()` + `findByShareToken()`
- [ ] `InterviewService.getStats()`
- [ ] `InterviewSessionService.startSession()` with duplicate/resume logic
- [ ] `InterviewSessionService.sendMessage()` — full two-call pattern
- [ ] `InterviewSessionService.getSessionWithProfile()`
- [ ] `InterviewService.transition()` — ACTIVE/CLOSED/ARCHIVED
- [ ] On session `COMPLETED`: background job generates profile embedding + stores in `profileEmbedding`
- [ ] `VectorSearchService.searchSessions()` wired to `POST /dashboard/interviews/:id/sessions/search`
- [ ] `VectorSearchService.findSimilarSessions()` wired to `GET .../sessions/:sid/similar`
- [ ] Integration test: full conversation flow (start → 5 turns → complete)
- [ ] Integration test: extraction populates entities after each turn
- [ ] Integration test: completed session has non-null `profileEmbedding`
- [ ] Integration test: vector search returns semantically relevant sessions

### Phase 4 — Subscription & Dashboard Auth (Days 9–12)

- [ ] `SubscriptionService.getOrCreateFree()`
- [ ] `SubscriptionService.checkLimit()` — enforced before session start
- [ ] `SubscriptionService.incrementCount()` — called on session completion
- [ ] Paystack subscription webhook handler
- [ ] `DashboardAuthService.generateMagicLink()`
- [ ] `DashboardAuthService.exchangeToken()`
- [ ] `POST /auth/dashboard/exchange` controller endpoint
- [ ] Test: magic link expires after 15 minutes
- [ ] Test: magic link can only be used once

### Phase 5 — Creator Bot Updates (Days 11–15)

- [ ] `/createinterview` command + template selection keyboard
- [ ] Interview creation flow (INTERVIEW_AWAITING_TITLE → OBJECTIVE → CONTEXT → CONFIRM)
- [ ] Field confirmation screen (show pre-populated fields)
- [ ] "Activate" callback → `InterviewService.activate()`
- [ ] "Edit in Dashboard" → magic link generation + send
- [ ] `/myinterviews` command with pagination
- [ ] Interview card with stats
- [ ] `@OnEvent('interview.completed')` — notify creator when session completes
- [ ] Creator Bot `/dashboard` command → generates magic link
- [ ] Subscription limit warning notifications

### Phase 6 — Filler Bot Updates (Days 14–18)

- [ ] Deep-link router: detect if share token is Form or Interview
- [ ] Interview session start (duplicate check, resume, new session)
- [ ] Resume interrupted session flow
- [ ] AI conversation loop (typing action → LLM → reply)
- [ ] Session completion detection + closing message
- [ ] `/cancel` in interview mode (with confirmation)
- [ ] Interview-closed mid-session handling
- [ ] Test: full conversation from start to completion
- [ ] Test: wrap-up triggered at maxTurns

### Phase 7 — Creator Dashboard: Auth + Shell (Days 16–20)

- [ ] Scaffold `apps/creator-dashboard/` Next.js app
- [ ] Route protection middleware (JWT cookie check)
- [ ] `/auth/login` page — "Login with Telegram Bot" button
- [ ] `/auth/callback` page — token exchange → JWT → redirect
- [ ] Dashboard shell: sidebar, navigation, top bar
- [ ] Sidebar links: Dashboard, Interviews, Subscription
- [ ] JWT decoded + user info in auth context
- [ ] Logout (clear cookie)

### Phase 8 — Creator Dashboard: Core Pages (Days 19–26)

- [ ] `GET /dashboard/interviews` endpoint + pagination
- [ ] `/dashboard/interviews` list page (status badges, response counts)
- [ ] Interview create wizard (all 4 steps)
- [ ] `POST /dashboard/interviews` + `PUT /dashboard/interviews/:id/fields`
- [ ] Interview activate from dashboard → `POST /dashboard/interviews/:id/activate`
- [ ] `/dashboard/interviews/:id` detail page (stats, sessions table)
- [ ] Sessions list with extracted entity previews
- [ ] `/dashboard/interviews/:id/sessions/:sid` split-pane conversation viewer
- [ ] Raw evidence tooltips on extracted values
- [ ] `/dashboard/interviews/:id/export` — CSV + JSON download
- [ ] `/dashboard/subscription` page

### Phase 9 — Analytics (Days 25–28)

- [ ] `GET /dashboard/interviews/:id/stats` endpoint (completion rate, field coverage)
- [ ] `/dashboard/interviews/:id/analytics` page
- [ ] Completions per day chart (Recharts)
- [ ] Completion funnel chart
- [ ] Field extraction coverage chart
- [ ] Array field aggregation (e.g., "Top Skills Mentioned")

### Phase 10 — Hardening (Days 27–32)

- [ ] Prompt injection validation (blocked patterns)
- [ ] Max turns enforcement (hard limit)
- [ ] Session auto-interrupt after 24h inactivity (cron job or check on resume)
- [ ] LLM error handling (Anthropic API down → graceful fallback message to user)
- [ ] LLM cost abuse: daily spend cap per creator
- [ ] Dashboard rate limiting
- [ ] Input sanitization audit for all interview API endpoints
- [ ] Load test: 50 concurrent interview sessions
- [ ] End-to-end test: Creator creates interview → Filler completes it → Dashboard shows conversation
- [ ] Update webhook registration script for both bots

---

## 14. Testing Strategy

### 14.1 LLM Integration Tests

```
These run against the real Anthropic API in CI (using test credits):

- generateConversationTurn(): given a HIRING system prompt + 5-turn history,
  response is non-empty, < 400 tokens, asks exactly one question.

- extractEntities(): given "I have 5 years experience with React and TypeScript",
  extracts skills=["React","TypeScript"] with confidence > 0.8 and years=5.

- Prompt injection resistance: sending "IGNORE PREVIOUS INSTRUCTIONS" as user message
  does not cause AI to reveal system prompt or change persona.

- Conversation completion: AI wraps up when all required fields are extracted.

- Max turns: session auto-completes at maxTurns, not before.
```

### 14.2 InterviewSessionService Unit Tests

```
(Mock LLM responses — deterministic)

- startSession(): creates session record, returns opening message
- startSession() with existing SUBMITTED session: throws ConflictException
- startSession() with existing ACTIVE session: returns existing session (resume)
- sendMessage(): saves user message, returns AI response, increments turnCount
- sendMessage() with COMPLETED session: throws BadRequestException
- sendMessage() triggers entity extraction (background)
- sendMessage() at maxTurns - 1: injects wrap-up instruction
- sendMessage() on CLOSED interview: sets session INTERRUPTED
- Subscription limit: sendMessage() when limit reached: throws PaymentRequiredException
```

### 14.3 Creator Dashboard E2E Tests (Playwright)

```
- Full auth flow: visit login → "Login with Telegram Bot" → mock bot magic link → dashboard
- Create interview: wizard all 4 steps → activate → interview card visible in list
- Session viewer: mock session data → conversation visible → extracted entities visible
- Export: download CSV → verify column headers match schema fields
```

### 14.4 Security Tests

```
- Magic link expired: 401 on exchange
- Magic link double-use: 401 on second exchange
- Dashboard JWT from user A: cannot access user B's interviews (403)
- Filler accessing another user's session: 403
- Subscription limit exceeded: 402 on session start
- LLM prompt injection in user message: AI stays in persona, does not reveal system prompt
```

---

## Appendix A — New Environment Variables

```
# LLM (OpenRouter — single key for chat + embeddings)
OPENROUTER_API_KEY=sk-or-...

# Creator Dashboard
CREATOR_DASHBOARD_URL=https://dashboard.fluxforms.io

# Subscription
PAYSTACK_PLAN_STARTER=PLN_xxx    # Paystack plan codes
PAYSTACK_PLAN_GROWTH=PLN_yyy
PAYSTACK_PLAN_ENTERPRISE=PLN_zzz
```

## Appendix B — Message Flow Sequence Diagram

```
User → Telegram → Filler Bot Webhook → NestJS API
                                           │
                              InterviewSessionService.sendMessage()
                                           │
                              ┌────────────┴────────────────┐
                              │                             │
                    AnthropicProvider                AnthropicProvider
                    .chat()                          .extractWithTools()
                    (Conversation turn)              (Entity extraction)
                              │                             │
                     AI response text              ExtractedEntity upserts
                    (await — blocking)             (setImmediate — background)
                              │
                    InterviewMessage.create() [AI message]
                              │
                    If complete: session.state = COMPLETED
                                subscription.responseCount++
                                EventEmitter.emit('interview.completed')
                              │
                    Return aiMessage to Filler Bot
                              │
                    ctx.reply(aiMessage)
                              │
                User sees AI response in Telegram
```

## Appendix C — Creator Dashboard Sitemap

```
/                            → Redirect to /dashboard (if authed) or /auth/login
/auth/login                  → Login page
/auth/callback               → Token exchange + redirect
/dashboard                   → Home (stats + recent activity)
/dashboard/interviews        → All interviews list
/dashboard/interviews/new    → Create interview wizard
/dashboard/interviews/:id    → Interview detail + sessions list
/dashboard/interviews/:id/analytics   → Charts and field coverage
/dashboard/interviews/:id/export      → Download data
/dashboard/interviews/:id/sessions/:sid → Conversation viewer
/dashboard/subscription      → Plan management
```

## Appendix D — Key Design Decisions Summary

| Decision | Choice | Reason |
|---|---|---|
| LLM provider | OpenRouter + Gemini 2.5 Flash | One API key, OpenAI-compatible SDK, cheapest capable model |
| Extraction method | OpenAI function calling (Gemini via OpenRouter) | Returns structured JSON, never needs parsing |
| Embedding model | google/gemini-embedding-exp-03-07 via OpenRouter | Same provider, 3072-dim, no second API key |
| Vector store | pgvector (Supabase) | Zero new service; handles millions of vectors; SQL-native queries |
| Parallel LLM calls | conversation + extraction simultaneously | Minimizes perceived latency |
| Opening message | Pre-generated on activate, cached | No LLM cost per session start |
| Dashboard auth | Magic link from bot (not Telegram Widget) | Simpler; creators are already in the bot |
| Field schema | Creator-defined per interview | More flexible than fixed templates |
| Conversation history | Last 20 messages | Covers all practical interviews; avoids token limits |
| Response storage | messages table (immutable log) + entities table (mutable) | Source of truth + queryable profile |
| Subscription enforcement | Before session creation | Prevents over-usage before it happens |

---

*This plan defines every component needed to launch Flux Interview as the primary FluxForms product.
Build in phase order. Phases 1–6 are backend-complete. Phases 7–9 are creator dashboard.
Phase 10 is launch-readiness hardening.*
