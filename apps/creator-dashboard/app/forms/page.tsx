'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getForms } from '@/lib/api';
import type { Form } from '@/lib/types';

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)',
  DRAFT: 'var(--text-tertiary)',
  PAYMENT_PENDING: 'var(--warning)',
  CLOSED: 'var(--error)',
  ARCHIVED: 'var(--text-tertiary)',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  PAYMENT_PENDING: 'Pending payment',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    getForms(page)
      .then(data => {
        setForms(data.forms);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Forms
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Use <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>/createform</code> in the Creator Bot to build a new form.
          </p>
        </div>

        {error && (
          <div style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {loading ? 'Loading…' : `${total} form${total !== 1 ? 's' : ''}`}
            </span>
          </div>

          {loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading…
            </div>
          )}

          {!loading && forms.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <FileText size={32} color="var(--text-tertiary)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No forms yet</p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
                Send /createform to the Creator Bot to get started
              </p>
            </div>
          )}

          {forms.map(f => (
            <Link key={f.id} href={`/forms/${f.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[f.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {STATUS_LABELS[f.status] ?? f.status}
                    &nbsp;·&nbsp;{f.questions.length} question{f.questions.length !== 1 ? 's' : ''}
                    &nbsp;·&nbsp;Created {new Date(f.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 'auto' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {f._count?.responses ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>responses</div>
                </div>
                <ChevronRight size={16} color="var(--text-tertiary)" />
              </div>
            </Link>
          ))}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                color: page === 1 ? 'var(--text-tertiary)' : 'var(--text)',
                padding: '6px 16px', borderRadius: 6, cursor: page === 1 ? 'default' : 'pointer',
                fontSize: 13, opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: '32px' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                color: page === totalPages ? 'var(--text-tertiary)' : 'var(--text)',
                padding: '6px 16px', borderRadius: 6, cursor: page === totalPages ? 'default' : 'pointer',
                fontSize: 13, opacity: page === totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
