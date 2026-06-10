-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "interview_sessions"
  ADD COLUMN IF NOT EXISTS "extraction_status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "extraction_error" TEXT;

-- Backfill: existing completed sessions with extracted entities are DONE; completed without are FAILED
UPDATE "interview_sessions" s
  SET "extraction_status" = 'DONE'
  WHERE s."state" = 'COMPLETED'
    AND EXISTS (SELECT 1 FROM "extracted_entities" e WHERE e."session_id" = s."id");

UPDATE "interview_sessions" s
  SET "extraction_status" = 'FAILED'
  WHERE s."state" = 'COMPLETED'
    AND NOT EXISTS (SELECT 1 FROM "extracted_entities" e WHERE e."session_id" = s."id");
