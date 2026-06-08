'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKey, hasKey } from '@/lib/auth';
import { getStats } from '@/lib/api';
import { useEffect } from 'react';

export default function AuthPage() {
  const [key, setKeyInput] = useState('');
  const [error, setError]  = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (hasKey()) router.replace('/stats');
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      setKey(key.trim());
      await getStats();
      router.push('/stats');
    } catch {
      setError('Invalid admin key');
      setKey('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)',
    }}>
      <form onSubmit={submit} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '2.5rem', width: 360,
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>FluxForms Admin</h1>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>Enter your admin API key to continue.</p>

        <input
          type="password"
          placeholder="Admin key"
          value={key}
          onChange={e => setKeyInput(e.target.value)}
          required
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '0.625rem 0.75rem', color: 'var(--text)',
            fontSize: 14, outline: 'none', width: '100%',
          }}
        />

        {error && <p style={{ color: 'var(--red)', margin: 0, fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 6, padding: '0.625rem', fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          {loading ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
