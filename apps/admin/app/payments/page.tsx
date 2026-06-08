'use client';

import { useEffect, useState } from 'react';
import AdminGuard from '@/components/AdminGuard';
import { getPayments, type AdminPayment } from '@/lib/api';

function StatusBadge({ status }: { status: string }) {
  const color = status === 'SUCCESS' ? 'var(--green)' : status === 'PENDING' ? 'var(--amber)' : 'var(--red)';
  return (
    <span style={{ color, fontSize: 11, fontWeight: 600 }}>{status}</span>
  );
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getPayments(page)
      .then(d => { setPayments(d.payments ?? d.items ?? []); setTotal(d.total); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <AdminGuard>
      <h1 style={{ margin: '0 0 1.5rem', fontSize: 22, fontWeight: 700 }}>Payments ({total})</h1>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>Form</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Creator</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Amount</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Paid at</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.625rem 0.75rem' }}>{p.form?.title ?? '—'}</td>
                <td style={{ padding: '0.625rem 0.75rem', color: 'var(--muted)' }}>
                  @{p.creator?.username ?? p.creator?.telegramId ?? '—'}
                </td>
                <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600 }}>
                  ₦{(p.amount / 100).toLocaleString()}
                </td>
                <td style={{ padding: '0.625rem 0.75rem' }}>
                  <StatusBadge status={p.status} />
                </td>
                <td style={{ padding: '0.625rem 0.75rem', color: 'var(--muted)' }}>
                  {p.paidAt ? new Date(p.paidAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>Loading…</p>}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle}>Prev</button>
          <span style={{ color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle}>Next</button>
        </div>
      )}
    </AdminGuard>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', padding: '0.375rem 0.75rem', cursor: 'pointer',
};
