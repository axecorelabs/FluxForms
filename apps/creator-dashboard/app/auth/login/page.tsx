'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, ArrowRight, RotateCcw } from 'lucide-react';
import { exchangeMagicToken, requestOtp, verifyOtp } from '@/lib/api';
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

const input: React.CSSProperties = {
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

// ── Main ──────────────────────────────────────────────────────────────────────

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Handle legacy magic link tokens
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

  // Resend cooldown timer
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

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (step === 'otp' && otp.replace(/\D/g, '').length === 6) {
      verify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={card}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="var(--accent-fg)" strokeWidth={2.5} />
          </div>
        </div>

        {step === 'email' ? (
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
                style={input}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <button type="submit" disabled={loading || !email.trim()} style={btn(loading || !email.trim())}>
                {loading ? 'Sending…' : <><span>Send code</span><ArrowRight size={14} /></>}
              </button>
            </form>
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
          </>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--error)' }}>
            {error}
          </div>
        )}

        <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Already use the Telegram bot?{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Use /dashboard to get a sign-in link.</span>
        </p>
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
