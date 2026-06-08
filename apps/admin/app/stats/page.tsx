'use client';

import { useEffect, useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { getStats } from '@/lib/api';

const CARDS = [
  { key: 'totalUsers',     label: 'Total Users' },
  { key: 'totalForms',     label: 'Forms' },
  { key: 'totalInterviews',label: 'Interviews' },
  { key: 'totalResponses', label: 'Responses' },
  { key: 'totalSessions',  label: 'Sessions' },
  { key: 'totalRevenue',   label: 'Revenue (₦)', fmt: (v: number) => `₦${(v / 100).toLocaleString()}` },
];

export default function StatsPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(e => setError(e.message));
  }, []);

  return (
    <AdminGuard>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: 22, fontWeight: 700 }}>Platform Overview</h1>

      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      {stats ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem',
        }}>
          {CARDS.map(c => (
            <div key={c.key} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '1.25rem 1.5rem',
            }}>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {c.fmt ? c.fmt(stats[c.key] ?? 0) : (stats[c.key] ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : !error && (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      )}
    </AdminGuard>
  );
}
