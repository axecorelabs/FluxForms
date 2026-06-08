'use client';

import { useEffect, useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { getWebhookInfo, registerWebhook, type WebhookInfo } from '@/lib/api';

const BOTS = [
  { key: 'creator', label: 'Creator Bot' },
  { key: 'filler',  label: 'Filler Bot'  },
];

function WebhookCard({ bot, label }: { bot: string; label: string }) {
  const [info, setInfo]       = useState<WebhookInfo | null>(null);
  const [apiUrl, setApiUrl]   = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');
  const [error, setError]     = useState('');

  useEffect(() => {
    getWebhookInfo(bot).then(setInfo).catch(() => {});
  }, [bot]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setError('');
    setLoading(true);
    try {
      const r = await registerWebhook(bot, apiUrl.trim());
      setMsg(`Registered: ${r.url}`);
      const updated = await getWebhookInfo(bot);
      setInfo(updated);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '1.5rem',
    }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: 16, fontWeight: 700 }}>{label}</h2>

      {info && (
        <div style={{ marginBottom: '1.25rem', fontSize: 13 }}>
          <Row label="Current URL" value={info.url || '(none)'} mono />
          <Row label="Pending updates" value={String(info.pending_update_count)} />
          {info.last_error_message && (
            <Row label="Last error" value={info.last_error_message} color="var(--red)" />
          )}
        </div>
      )}

      <form onSubmit={register} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>
          API base URL (e.g. https://api.yourapp.com)
        </label>
        <input
          type="url"
          value={apiUrl}
          onChange={e => setApiUrl(e.target.value)}
          placeholder="https://api.yourapp.com"
          required
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '0.5rem 0.75rem', color: 'var(--text)', fontSize: 13,
          }}
        />
        <button type="submit" disabled={loading} style={{
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '0.5rem 1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1, alignSelf: 'flex-start',
        }}>
          {loading ? 'Registering…' : 'Register Webhook'}
        </button>
        {msg   && <p style={{ color: 'var(--green)', margin: 0, fontSize: 12 }}>{msg}</p>}
        {error && <p style={{ color: 'var(--red)',   margin: 0, fontSize: 12 }}>{error}</p>}
      </form>
    </div>
  );
}

function Row({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
      <span style={{ color: 'var(--muted)', minWidth: 140 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : undefined, color: color ?? 'var(--text)', wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AdminGuard>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: 22, fontWeight: 700 }}>Settings</h1>
      <h2 style={{ margin: '0 0 1rem', fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>
        Telegram Webhooks
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
        {BOTS.map(b => <WebhookCard key={b.key} bot={b.key} label={b.label} />)}
      </div>
    </AdminGuard>
  );
}
