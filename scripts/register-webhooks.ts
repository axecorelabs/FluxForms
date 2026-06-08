/**
 * One-time script: registers both bot webhooks with Telegram.
 * Usage: MINI_APP_URL=https://... pnpm tsx scripts/register-webhooks.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const CREATOR_TOKEN = process.env.TELEGRAM_CREATOR_BOT_TOKEN!;
const FILLER_TOKEN  = process.env.TELEGRAM_FILLER_BOT_TOKEN!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
const BASE_URL = process.argv[2] ?? process.env.API_BASE_URL;

if (!BASE_URL) {
  console.error('Usage: pnpm tsx scripts/register-webhooks.ts https://your-api-domain.com');
  process.exit(1);
}

async function setWebhook(token: string, url: string, label: string) {
  const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query', 'inline_query'],
      drop_pending_updates: true,
    }),
  });
  const json = await res.json() as { ok: boolean; description?: string };
  if (json.ok) {
    console.log(`✅ ${label}: ${url}`);
  } else {
    console.error(`❌ ${label}: ${json.description}`);
  }
}

async function main() {
  const base = BASE_URL!.replace(/\/$/, '');
  await setWebhook(CREATOR_TOKEN, `${base}/webhook/creator-bot`, 'Creator Bot');
  await setWebhook(FILLER_TOKEN,  `${base}/webhook/filler-bot`,  'Filler Bot');
}

main().catch(console.error);
