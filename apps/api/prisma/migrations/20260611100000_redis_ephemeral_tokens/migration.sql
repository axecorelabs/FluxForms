-- Ephemeral token tables replaced by Redis. Drop if they were ever created.
DROP TABLE IF EXISTS "telegram_login_challenges";

-- email_otps, telegram_link_tokens, and dashboard_tokens are also superseded
-- by Redis, but kept as dead tables to avoid destructive migration on existing
-- production data. They can be dropped in a future cleanup migration once
-- confirmed no data remains.
