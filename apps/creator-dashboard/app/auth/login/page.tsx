'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeMagicToken } from '@/lib/api';
import { setToken, isAuthenticated } from '@/lib/auth';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/interviews');
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
        router.replace('/interviews');
      })
      .catch(() => {
        setStatus('error');
        setMessage('This link has expired or already been used. Ask the Creator Bot for a new one with /dashboard.');
      });
  }, [params, router]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '2.5rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          {status === 'loading' ? '⏳' : '❌'}
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
          {status === 'loading' ? 'Signing in…' : 'Login failed'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading…</div>
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
