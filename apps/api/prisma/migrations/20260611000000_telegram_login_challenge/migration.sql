CREATE TABLE "telegram_login_challenges" (
  "id"         TEXT         NOT NULL,
  "token"      TEXT         NOT NULL,
  "user_id"    TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "telegram_login_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telegram_login_challenges_token_key" UNIQUE ("token"),
  CONSTRAINT "telegram_login_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "telegram_login_challenges_token_idx" ON "telegram_login_challenges"("token");
