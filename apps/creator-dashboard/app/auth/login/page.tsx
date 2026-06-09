'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
import { exchangeMagicToken } from '@/lib/api';
import { setToken, isAuthenticated } from '@/lib/auth';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/');
      return;
    }

    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No login token found. Ask the Creator Bot for a new link with /dashboard.');
      return;
    }

    exchangeMagicToken(token)
      .then(({ accessToken }) => {
        setToken(accessToken);
        router.replace('/');
      })
      .catch(() => {
        setStatus('error');
        setMessage('This link has expired or already been used. Ask the Creator Bot for a new one with /dashboard.');
      });
  }, [params, router]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 32px',
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={20} color="#fff" strokeWidth={2.5} />
          </div>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          {status === 'loading' ? 'Signing in…' : 'Login failed'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
          {message}
        </p>
        {status === 'loading' && (
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 20, height: 20, border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
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
