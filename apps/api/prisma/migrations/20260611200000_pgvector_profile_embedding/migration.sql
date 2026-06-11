-- Enable pgvector extension (pre-installed on Supabase, no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add profile embedding column to interview sessions.
-- Using vector(1536) to match text-embedding-3-small output dimension.
-- NULL until extraction completes for a session.
ALTER TABLE "interview_sessions"
  ADD COLUMN IF NOT EXISTS "profile_embedding" vector(1536);

-- Index for ANN similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS "interview_sessions_profile_embedding_idx"
  ON "interview_sessions"
  USING ivfflat ("profile_embedding" vector_cosine_ops)
  WITH (lists = 100);
