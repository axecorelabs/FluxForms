'use client';

import { useEffect, useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { getQueueStats, getFailedJobs, retryFailedJobs, type QueueStats, type FailedJob } from '@/lib/api';

const QUEUE_KEYS = ['botUpdates', 'extraction', 'notifications'] as const;
type QueueKey = typeof QUEUE_KEYS[number];
const QUEUE_API_NAMES: Record<QueueKey, string> = {
  botUpdates: 'bot-updates', extraction: 'extraction', notifications: 'notifications',
};

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

export default function QueuesPage() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [failed, setFailed] = useState<Record<QueueKey, FailedJob[]>>({} as Record<QueueKey, FailedJob[]>);
  const [expanded, setExpanded] = useState<QueueKey | null>(null);
  const [retrying, setRetrying] = useState<QueueKey | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const s = await getQueueStats();
      setStats(s);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleFailed(key: QueueKey) {
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!failed[key]) {
      const jobs = await getFailedJobs(QUEUE_API_NAMES[key]).catch(() => []);
      setFailed(prev => ({ ...prev, [key]: jobs }));
    }
  }

  async function retry(key: QueueKey) {
    setRetrying(key);
    try {
      const r = await retryFailedJobs(QUEUE_API_NAMES[key]);
      alert(`Retried ${r.retried} jobs`);
      setFailed(prev => ({ ...prev, [key]: [] }));
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <AdminGuard>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: 22, fontWeight: 700 }}>Queue Health</h1>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      {stats ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {QUEUE_KEYS.map(key => {
            const q = stats[key];
            return (
              <div key={key} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '1.5rem',
                  padding: '1rem 1.25rem', flexWrap: 'wrap',
                }}>
                  <div style={{ fontWeight: 700, minWidth: 140 }}>{q.name}</div>
                  <div style={{ display: 'flex', gap: '1.5rem', flex: 1, flexWrap: 'wrap' }}>
                    <StatPill label="waiting"   value={q.waiting} />
                    <StatPill label="active"    value={q.active}  color="var(--accent)" />
                    <StatPill label="completed" value={q.completed} color="var(--green)" />
                    <StatPill label="failed"    value={q.failed}  color={q.failed > 0 ? 'var(--red)' : undefined} />
                    <StatPill label="delayed"   value={q.delayed} color="var(--amber)" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {q.failed > 0 && (
                      <>
                        <button onClick={() => toggleFailed(key)} style={smallBtn}>
                          {expanded === key ? 'Hide' : 'View failed'}
                        </button>
                        <button onClick={() => retry(key)} disabled={retrying === key} style={{
                          ...smallBtn, background: 'var(--red)', color: '#fff', border: 'none',
                          opacity: retrying === key ? 0.6 : 1,
                        }}>
                          {retrying === key ? 'Retrying…' : 'Retry all'}
                        </button>
                      </>
                    )}
                    <button onClick={load} style={smallBtn}>Refresh</button>
                  </div>
                </div>

                {expanded === key && failed[key] && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1rem 1.25rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '4px 8px' }}>Job</th>
                          <th style={{ padding: '4px 8px' }}>Reason</th>
                          <th style={{ padding: '4px 8px' }}>Attempts</th>
                          <th style={{ padding: '4px 8px' }}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failed[key].map((j, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{j.name}</td>
                            <td style={{ padding: '4px 8px', color: 'var(--red)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.failedReason}</td>
                            <td style={{ padding: '4px 8px' }}>{j.attemptsMade}</td>
                            <td style={{ padding: '4px 8px', color: 'var(--muted)' }}>{new Date(j.timestamp).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {failed[key].length === 0 && <p style={{ color: 'var(--muted)', margin: 0 }}>No failed jobs.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !error && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
    </AdminGuard>
  );
}

const smallBtn: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', padding: '0.3rem 0.65rem', cursor: 'pointer', fontSize: 12,
};
