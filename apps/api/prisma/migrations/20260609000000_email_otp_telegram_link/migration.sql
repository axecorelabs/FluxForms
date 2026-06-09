-- Make telegram_id optional (email-first users have no Telegram account yet)
ALTER TABLE "users" ALTER COLUMN "telegram_id" DROP NOT NULL;

-- Email OTPs
CREATE TABLE "email_otps" (
  "id"         TEXT         NOT NULL,
  "email"      TEXT         NOT NULL,
  "code_hash"  TEXT         NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "attempts"   INTEGER      NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_otps_email_idx" ON "email_otps"("email");

-- Telegram link tokens
CREATE TABLE "telegram_link_tokens" (
  "id"         TEXT         NOT NULL,
  "user_id"    TEXT         NOT NULL,
  "token"      TEXT         NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_link_tokens_token_key" ON "telegram_link_tokens"("token");
CREATE INDEX "telegram_link_tokens_token_idx" ON "telegram_link_tokens"("token");
ALTER TABLE "telegram_link_tokens"
  ADD CONSTRAINT "telegram_link_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
