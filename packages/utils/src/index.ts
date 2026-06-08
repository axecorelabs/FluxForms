import { createHash, createHmac, randomBytes } from 'crypto';

export function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

export function buildShareLink(fillerBotUsername: string, shareToken: string): string {
  return `https://t.me/${fillerBotUsername}?start=${shareToken}`;
}

export function signMiniAppParams(params: Record<string, string>, secret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('|');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyMiniAppParams(
  params: Record<string, string>,
  sig: string,
  secret: string,
): boolean {
  const expected = signMiniAppParams(params, secret);
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(expected, sig);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return createHash('sha256').update(bufA).digest().equals(
    createHash('sha256').update(bufB).digest(),
  );
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 3) + '...';
}
