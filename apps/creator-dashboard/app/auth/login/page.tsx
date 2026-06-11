'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react';
import { exchangeMagicToken, requestOtp, verifyOtp, createTelegramChallenge, pollTelegramChallenge } from '@/lib/api';
import { setToken, isAuthenticated } from '@/lib/auth';

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '40px 32px',
  maxWidth: 400,
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 14px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.15s',
};

const btn = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: disabled ? 'var(--bg-elevated)' : 'var(--accent)',
  color: disabled ? 'var(--text-tertiary)' : 'var(--accent-fg)',
  border: 'none',
  borderRadius: 12,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'background 0.15s',
  fontFamily: 'inherit',
});

const outlineBtn: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.12s, border-color 0.12s',
  fontFamily: 'inherit',
  textDecoration: 'none',
};

// ── OTP input — 6 individual boxes ───────────────────────────────────────────

function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.map((d, j) => (j === i ? '' : d));
      onChange(next.join(''));
      if (i > 0) refs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, j) => (j === i ? char : d));
    onChange(next.join(''));
    if (char && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 600,
            background: 'var(--bg-elevated)', border: `1px solid ${d ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
            caretColor: 'transparent', transition: 'border-color 0.15s',
          }}
        />
      ))}
    </div>
  );
}

// ── Telegram QR panel ─────────────────────────────────────────────────────────

type TgState =
  | { phase: 'loading' }
  | { phase: 'ready'; token: string; deepLink: string }
  | { phase: 'expired' };

function TelegramPanel({ onBack, onSuccess }: { onBack: () => void; onSuccess: (accessToken: string, hasEmail: boolean) => void }) {
  const [tg, setTg] = useState<TgState>({ phase: 'loading' });
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const start = async () => {
    setTg({ phase: 'loading' });
    stopPolling();
    try {
      const { token, deepLink } = await createTelegramChallenge();
      setTg({ phase: 'ready', token, deepLink });

      pollRef.current = setInterval(async () => {
        try {
          const result = await pollTelegramChallenge(token);
          if (result.status === 'authenticated') {
            stopPolling();
            onSuccess(result.accessToken!, result.hasEmail ?? false);
          } else if (result.status === 'expired') {
            stopPolling();
            setTg({ phase: 'expired' });
          }
        } catch { /* ignore transient poll errors */ }
      }, 2000);
    } catch {
      setTg({ phase: 'expired' });
    }
  };

  useEffect(() => { start(); return () => stopPolling(); }, []);

  return (
    <>
      <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
        Sign in with Telegram
      </h1>

      {tg.phase === 'loading' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 28 }}>
            Generating your QR code…
          </p>
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        </>
      )}

      {tg.phase === 'expired' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 28 }}>
            This QR code has expired.
          </p>
          <button onClick={start} style={btn(false)}>
            <RotateCcw size={14} /> Generate new QR
          </button>
        </>
      )}

      {tg.phase === 'ready' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 24 }}>
            Open Telegram and scan this code, or tap the button below on mobile.
          </p>

          {/* QR code — white background for contrast */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
              <QRCodeSVG value={tg.deepLink} size={180} />
            </div>
          </div>

          {/* Open in Telegram (useful on mobile) */}
          <a
            href={tg.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            style={outlineBtn}
          >
            <ExternalLink size={14} /> Open in Telegram
          </a>

          {/* Waiting indicator */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', opacity: 0.7, animation: 'pulse 1.4s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Waiting for scan…</span>
          </div>

          {/* Manual fallback — Telegram sometimes doesn't re-send /start for already-started bots */}
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Telegram opened but nothing happened?
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Copy this code and send it to the bot manually:
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <code style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                /login {tg.token}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`/login ${tg.token}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{ flexShrink: 0, background: copied ? 'var(--success)' : 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
              Open <a href={tg.deepLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>@{new URL(tg.deepLink).pathname.slice(1)}</a> in Telegram, paste and send.
            </p>
          </div>
        </>
      )}

      <button
        onClick={onBack}
        style={{ marginTop: 24, background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
      >
        Use email instead
      </button>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<'email' | 'telegram'>('email');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Handle magic link tokens from bot
  useEffect(() => {
    if (isAuthenticated()) { router.replace('/'); return; }
    const token = params.get('token');
    if (token) {
      exchangeMagicToken(token)
        .then(({ accessToken, hasEmail }) => {
          setToken(accessToken);
          router.replace(hasEmail ? '/' : '/auth/add-email');
        })
        .catch(() => setError('This link has expired. Enter your email below to sign in.'));
    }
  }, [params, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendOtp = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await requestOtp(email.trim());
      setStep('otp');
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (otp.replace(/\D/g, '').length < 6) return;
    setLoading(true);
    setError('');
    try {
      const { accessToken, telegramLinked } = await verifyOtp(email.trim(), otp);
      setToken(accessToken);
      router.replace(telegramLinked ? '/' : '/auth/connect-telegram');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'otp' && otp.replace(/\D/g, '').length === 6) {
      verify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleTelegramSuccess = (accessToken: string, hasEmail: boolean) => {
    setToken(accessToken);
    router.replace(hasEmail ? '/' : '/auth/add-email');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={card}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="var(--accent-fg)" strokeWidth={2.5} />
          </div>
        </div>

        {mode === 'telegram' ? (
          <TelegramPanel
            onBack={() => { setMode('email'); setError(''); }}
            onSuccess={handleTelegramSuccess}
          />
        ) : step === 'email' ? (
          <>
            <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
              Sign in or create an account
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 28 }}>
              Enter your email — we'll send you a code. No password needed.
            </p>
            <form onSubmit={sendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <button type="submit" disabled={loading || !email.trim()} style={btn(loading || !email.trim())}>
                {loading ? 'Sending…' : <><span>Send code</span><ArrowRight size={14} /></>}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Telegram sign-in */}
            <button onClick={() => setMode('telegram')} style={outlineBtn}>
              Already use the Telegram bot? Sign in with Telegram
            </button>

            {error && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--error)' }}>
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="brand-heading" style={{ fontSize: 20, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
              Check your inbox
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 4 }}>
              We sent a 6-digit code to
            </p>
            <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, textAlign: 'center', marginBottom: 28 }}>
              {email}
            </p>

            <div style={{ marginBottom: 20 }}>
              <OtpBoxes value={otp} onChange={setOtp} />
            </div>

            <button
              onClick={verify}
              disabled={loading || otp.replace(/\D/g, '').length < 6}
              style={btn(loading || otp.replace(/\D/g, '').length < 6)}
            >
              {loading ? 'Verifying…' : 'Verify code'}
            </button>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
              >
                <RotateCcw size={11} /> Change email
              </button>
              <button
                onClick={() => sendOtp()}
                disabled={resendCooldown > 0 || loading}
                style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'var(--text-tertiary)' : 'var(--accent)', fontSize: 12, cursor: resendCooldown > 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--error)' }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
