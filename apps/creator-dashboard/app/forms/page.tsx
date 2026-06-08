'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getForms } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import type { Form } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:          '#22c55e',
  DRAFT:           '#64748b',
  PAYMENT_PENDING: '#f59e0b',
  CLOSED:          '#ef4444',
  ARCHIVED:        '#475569',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:          '🟢 Active',
  DRAFT:           '📝 Draft',
  PAYMENT_PENDING: '⏳ Pending payment',
  CLOSED:          '🔴 Closed',
  ARCHIVED:        '🗄 Archived',
};

function FormCard({ form }: { form: Form }) {
  const count = form._count?.responses ?? 0;
  return (
    <Link href={`/forms/${form.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '1.25rem 1.5rem',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: STATUS_COLORS[form.status] ?? '#64748b',
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {form.title}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {STATUS_LABELS[form.status] ?? form.status}
            &nbsp;·&nbsp;{form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
            {count}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>responses</div>
        </div>
      </div>
    </Link>
  );
}

function FormsContent() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getForms()
      .then(data => setForms(data.forms))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>🤖 FluxForms</span>
          <Link href="/interviews" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>Interviews</Link>
          <span style={{ color: 'var(--text)', fontSize: '0.85rem', fontWeight: 600 }}>Forms</span>
        </div>
        <button
          onClick={() => { clearToken(); window.location.href = '/auth/login'; }}
          style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--muted)', padding: '0.35rem 0.85rem',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Flux Forms
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>
            Use <code style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: 4 }}>/createform</code> in the Creator Bot to build a new form.
          </p>
        </div>

        {loading && <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '2rem 0' }}>Loading…</div>}

        {error && (
          <div style={{ color: 'var(--error)', background: '#1f1214', border: '1px solid #3d1c1c', borderRadius: 8, padding: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && forms.length === 0 && (
          <div style={{ color: 'var(--muted)', padding: '3rem 0', textAlign: 'center', fontSize: '0.9rem' }}>
            No forms yet. Send <strong>/createform</strong> to the Creator Bot to get started.
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {forms.map(f => <FormCard key={f.id} form={f} />)}
          </div>
        )}
      </main>
    </div>
  );
}

export default function FormsPage() {
  return (
    <AuthGuard>
      <FormsContent />
    </AuthGuard>
  );
}
