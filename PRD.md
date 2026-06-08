Below is a full MVP PRD (AI-buildable spec) for your Telegram Forms system. It includes:

* Two-bot architecture (Creator + Filler)
* State machines (critical)
* Edge cases (all discussed + more real-world ones)
* Supabase/Postgres schema
* NestJS monorepo architecture
* Telegram bot flows (message-by-message logic level)
* Admin dashboard (Next.js)
* Payment gating (pay-per-form)
* Form lifecycle rules
* Session handling rules

⸻

📄 PRODUCT REQUIREMENTS DOCUMENT (PRD)

Telegram Conversational Forms (MVP)

⸻

1. PRODUCT OVERVIEW

1.1 Product Name

FluxForms

⸻

1.2 Core Idea

A Telegram-native conversational form builder that allows users to:

* Create structured forms inside Telegram
* Share a link to respondents
* Collect responses conversationally
* Manage responses and form lifecycle
* Pay per form creation (no subscriptions required for MVP)

⸻

1.3 Key Principle

“Forms are conversations, not web pages.”

⸻

2. SYSTEM ARCHITECTURE

2.1 High-Level Architecture

apps/
 ├── api (NestJS backend - SINGLE SOURCE OF TRUTH)
 ├── bot-creator (Telegram bot)
 ├── bot-filler (Telegram bot)
 ├── admin (Next.js dashboard)
 ├── shared (types, utils, state machine logic)

⸻

2.2 Tech Stack

Backend

* NestJS
* Supabase Postgres (primary DB)
* Prisma ORM (recommended)

Bots

* Telegram Bot API
* Two separate bot tokens:
    * Creator Bot (form builders)
    * Filler Bot (respondents)

Admin Dashboard

* Next.js
* Supabase Auth (optional MVP auth)

Infra

* Webhooks (Telegram → NestJS API)
* Redis (optional later for sessions, NOT required MVP)

⸻

3. CORE ACTORS

3.1 Creator

* Creates forms
* Configures questions
* Opens/closes forms
* Views responses
* Pays per form

⸻

3.2 Filler (Respondent)

* Answers forms
* Navigates questions
* Edits answers (pre-submit)
* Submits responses

⸻

4. CORE PRODUCT RULES

4.1 No Marketplace Logic

* No revenue sharing
* No payouts to creators

⸻

4.2 Payment Model

* Pay per form creation
* Payment via:
    * Paystack
    * Flutterwave

⸻

4.3 Form Lifecycle

DRAFT → PAYMENT_PENDING → ACTIVE → CLOSED → ARCHIVED

⸻

4.4 Response Lifecycle

IN_PROGRESS → REVIEW → SUBMITTED → INVALID (if form closed mid-session)

⸻

5. BOT ARCHITECTURE

5.1 CREATOR BOT

Handles:

* form creation
* question building
* payment
* form management
* analytics

⸻

Creator Bot Commands

/start
/createform
/myforms
/form <id>
/responses <id>

⸻

Creator Flow (MESSAGE-BY-MESSAGE)

Step 1

/createform

Bot:

📄 Create Form
Each form costs ₦1,000
[Continue] [Cancel]

⸻

Step 2

Enter form title:

⸻

Step 3 (Builder Loop)

Add a question:

User input:

What is your name?

Bot:

Select type:
[Text] [Number] [Email] [Yes/No] [Multiple Choice]

⸻

Step 4 (Payment Gate)

💳 Pay ₦1,000 to activate form

After payment:

✅ Form Activated
Link:
t.me/fillerbot?start=form_123

⸻

Step 5 (Manage Form)

Form: Job Application
Status: OPEN
Actions:
[Close Form]
[View Responses]
[Share Link]

⸻

5.2 FILLER BOT

Handles:

* form answering
* session state
* validation
* submission
* navigation

⸻

Filler Entry

User clicks:

t.me/fillerbot?start=form_123

⸻

Bot:

📄 Job Application Form
Question 1:
What is your full name?

⸻

6. STATE MACHINE DESIGN (CRITICAL)

⸻

6.1 FORM STATE MACHINE

type FormStatus =
  | "DRAFT"
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "CLOSED"
  | "ARCHIVED"

⸻

Rules

* DRAFT → cannot be filled
* PAYMENT_PENDING → blocked for fillers
* ACTIVE → accepting responses
* CLOSED → reject all new sessions
* ARCHIVED → read-only

⸻

6.2 RESPONSE SESSION STATE MACHINE

type SessionState =
  | "ACTIVE"
  | "REVIEW"
  | "SUBMITTED"
  | "INTERRUPTED"

⸻

Rules

* ACTIVE → answering questions
* REVIEW → final check
* SUBMITTED → locked
* INTERRUPTED → form closed mid-session

⸻

6.3 QUESTION NAVIGATION STATE

currentQuestionIndex: number
answers: Record<string, any>

⸻

7. QUESTION TYPE HANDLING

7.1 Types

type QuestionType =
  | "text"
  | "number"
  | "email"
  | "yes_no"
  | "multiple_choice"

⸻

7.2 Input Handling Rules

TEXT

* free input

NUMBER

* numeric validation

EMAIL

* regex validation

YES/NO

* buttons:

[Yes] [No]

MULTIPLE CHOICE

* buttons:

[A] [B] [C]

⸻

8. CRITICAL EDGE CASES

⸻

8.1 User Changes Previous Answer

Supported commands:

/back

Behavior:

* decrement index
* overwrite answer
* continue flow

⸻

8.2 Review Before Submit

At last question:

Review your answers:
1. Name: John
2. Email: john@email.com
[Submit] [Edit]

⸻

8.3 Form Closed Mid-Session

If form becomes CLOSED:

❌ This form has been closed.
Your session has been stopped.

Session → INTERRUPTED

⸻

8.4 Duplicate Submission Prevention

* user_id + form_id unique constraint
* block second submission

⚠️ You already submitted this form.

⸻

8.5 Invalid Input Handling

Example:

⚠️ Please enter a valid email.

⸻

8.6 Form Deleted

* mark ARCHIVED
* disable all sessions
* keep responses for history

⸻

8.7 Question Type Changed After Responses Exist

Rule:

* DO NOT mutate past responses
* ignore schema mismatch gracefully

⸻

8.8 Partial Submission Recovery

If session interrupted:

* store IN_PROGRESS answers
* allow resume later

⸻

9. DATABASE SCHEMA (SUPABASE)

⸻

users

id
telegram_id
role (creator/filler/both)
created_at

⸻

forms

id
creator_id
title
status
payment_status
share_link
created_at

⸻

questions

id
form_id
text
type
options jsonb
order_index

⸻

sessions

id
form_id
user_telegram_id
state
current_index
created_at
updated_at

⸻

responses

id
session_id
form_id
answers jsonb
status
created_at

⸻

payments

id
form_id
creator_id
amount
status
reference
provider

⸻

10. API DESIGN (NESTJS)

⸻

Core Modules

* AuthModule (Telegram users)
* FormModule
* QuestionModule
* SessionModule
* ResponseModule
* PaymentModule
* BotModule
* AdminModule

⸻

Key Endpoints

POST /webhook/creator-bot
POST /webhook/filler-bot
POST /forms
GET /forms/:id
PATCH /forms/:id/status
POST /sessions/start
POST /sessions/answer
POST /sessions/back
POST /sessions/submit
POST /payments/webhook

⸻

11. ADMIN DASHBOARD (NEXT.JS)

⸻

Features

* View all forms
* View users
* View responses
* View payments
* Toggle form status
* Debug sessions

⸻

Pages

/dashboard
/forms
/forms/:id
/responses/:formId
/sessions
/payments

⸻

12. MONOREPO STRUCTURE

/apps
  /api
  /bot-creator
  /bot-filler
  /admin
/packages
  /shared-types
  /state-machine
  /utils

⸻

13. PAYMENT FLOW

Flow

Creator → Create Form
→ Payment Pending
→ Paystack Checkout
→ Webhook confirms
→ Form becomes ACTIVE
→ Share link generated

⸻

14. CORE STATE ENGINE (IMPORTANT)

All bots must use a shared state machine:

shared/state-machine/

Responsible for:

* form state transitions
* session transitions
* validation rules
* navigation logic

⸻

15. MVP SCOPE (STRICT)

MUST HAVE

* Two bots
* Form creation
* Question builder
* Pay per form
* Form filling
* Yes/No + MCQ + text
* Back navigation
* Review screen
* Response storage
* Form open/close toggle

⸻

MUST NOT HAVE (YET)

* analytics dashboards
* AI summaries
* file uploads
* conditional logic
* team accounts
* subscriptions
* multi-language

⸻

16. SUCCESS METRIC (MVP)

You succeed if:

* users can create a form in < 2 minutes
* users can share and collect responses
* payment unlocks form instantly
* no dashboard dependency required

⸻

17. PRODUCT INSIGHT (IMPORTANT)

This system is not:

❌ a form builder

It is:

A conversational data collection OS inside Telegram

