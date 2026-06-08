'use client';

import { useEffect, useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { getUsers, setUserPlan, type AdminUser } from '@/lib/api';

const PLANS = ['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE'];

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    FREE: 'var(--muted)', STARTER: 'var(--accent)', GROWTH: 'var(--green)', ENTERPRISE: 'var(--amber)',
  };
  return (
    <span style={{
      background: colors[plan] ?? 'var(--muted)', color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>{plan}</span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load(p = page) {
    setLoading(true);
    getUsers(p)
      .then(d => { setUsers(d.users); setTotal(d.total); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [page]);

  async function changePlan(user: AdminUser, plan: string) {
    try {
      await setUserPlan(user.id, plan);
      setUsers(prev => prev.map(u => u.id === user.id
        ? { ...u, subscription: u.subscription ? { ...u.subscription, plan } : { plan, status: 'active', responseCount: 0, responseLimit: 0 } }
        : u
      ));
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <AdminGuard>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: 22, fontWeight: 700 }}>Users ({total})</h1>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>User</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Plan</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Usage</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Forms</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Interviews</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Joined</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Set Plan</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.625rem 0.75rem' }}>
                  <div style={{ fontWeight: 600 }}>{u.firstName ?? '—'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>@{u.username ?? u.telegramId}</div>
                </td>
                <td style={{ padding: '0.625rem 0.75rem' }}>
                  <PlanBadge plan={u.subscription?.plan ?? 'FREE'} />
                </td>
                <td style={{ padding: '0.625rem 0.75rem', color: 'var(--muted)' }}>
                  {u.subscription ? `${u.subscription.responseCount} / ${u.subscription.responseLimit}` : '—'}
                </td>
                <td style={{ padding: '0.625rem 0.75rem' }}>{u._count.forms}</td>
                <td style={{ padding: '0.625rem 0.75rem' }}>{u._count.interviews}</td>
                <td style={{ padding: '0.625rem 0.75rem', color: 'var(--muted)' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.625rem 0.75rem' }}>
                  <select
                    value={u.subscription?.plan ?? 'FREE'}
                    onChange={e => changePlan(u, e.target.value)}
                    style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 4, color: 'var(--text)', padding: '2px 6px', fontSize: 12,
                    }}
                  >
                    {PLANS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>Loading…</p>}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={btnStyle}>Prev</button>
          <span style={{ color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={btnStyle}>Next</button>
        </div>
      )}
    </AdminGuard>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', padding: '0.375rem 0.75rem', cursor: 'pointer',
};
