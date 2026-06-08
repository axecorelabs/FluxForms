-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('HIRING', 'LEAD_QUALIFICATION', 'CUSTOMER_FEEDBACK', 'CLIENT_ONBOARDING', 'MARKET_RESEARCH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'ARRAY', 'RATING', 'ENUM');

-- CreateEnum
CREATE TYPE "InterviewSessionState" AS ENUM ('ACTIVE', 'COMPLETED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'CUSTOM',
    "objective" TEXT NOT NULL,
    "context" TEXT,
    "ai_persona" TEXT,
    "opening_message" TEXT,
    "max_turns" INTEGER NOT NULL DEFAULT 20,
    "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "share_token" TEXT,
    "share_link" TEXT,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_fields" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "description" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "user_telegram_id" TEXT NOT NULL,
    "state" "InterviewSessionState" NOT NULL DEFAULT 'ACTIVE',
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "interrupted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_entities" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "raw_evidence" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_updated_turn" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "response_limit" INTEGER NOT NULL DEFAULT 50,
    "paystack_sub_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_tokens" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interviews_share_token_key" ON "interviews"("share_token");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_share_link_key" ON "interviews"("share_link");

-- CreateIndex
CREATE INDEX "interviews_creator_id_idx" ON "interviews"("creator_id");

-- CreateIndex
CREATE INDEX "interviews_status_idx" ON "interviews"("status");

-- CreateIndex
CREATE INDEX "interview_fields_interview_id_idx" ON "interview_fields"("interview_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_fields_interview_id_field_name_key" ON "interview_fields"("interview_id", "field_name");

-- CreateIndex
CREATE INDEX "interview_sessions_interview_id_state_idx" ON "interview_sessions"("interview_id", "state");

-- CreateIndex
CREATE INDEX "interview_sessions_user_telegram_id_idx" ON "interview_sessions"("user_telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_interview_id_user_telegram_id_key" ON "interview_sessions"("interview_id", "user_telegram_id");

-- CreateIndex
CREATE INDEX "interview_messages_session_id_turn_index_idx" ON "interview_messages"("session_id", "turn_index");

-- CreateIndex
CREATE INDEX "extracted_entities_session_id_idx" ON "extracted_entities"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_entities_session_id_field_name_key" ON "extracted_entities"("session_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_creator_id_key" ON "subscriptions"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_tokens_token_key" ON "dashboard_tokens"("token");

-- CreateIndex
CREATE INDEX "dashboard_tokens_token_idx" ON "dashboard_tokens"("token");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_fields" ADD CONSTRAINT "interview_fields_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_tokens" ADD CONSTRAINT "dashboard_tokens_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
