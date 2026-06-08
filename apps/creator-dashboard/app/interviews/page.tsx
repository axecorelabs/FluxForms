'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getInterviews } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import type { Interview } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   '#22c55e',
  DRAFT:    '#64748b',
  CLOSED:   '#ef4444',
  ARCHIVED: '#475569',
};

const TYPE_LABELS: Record<string, string> = {
  HIRING:            '💼 Hiring',
  LEAD_QUALIFICATION: '🎯 Lead Qual',
  CUSTOMER_FEEDBACK:  '⭐ Feedback',
  CLIENT_ONBOARDING:  '🤝 Onboarding',
  MARKET_RESEARCH:    '📊 Research',
  CUSTOM:             '✏️ Custom',
};

function InterviewCard({ iv }: { iv: Interview }) {
  return (
    <Link href={`/interviews/${iv.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
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
              background: STATUS_COLORS[iv.status] ?? '#64748b',
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {iv.title}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {TYPE_LABELS[iv.type] ?? iv.type} &nbsp;·&nbsp; {iv.schemaFields.length} field{iv.schemaFields.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
            {iv.completedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>completed</div>
        </div>
      </div>
    </Link>
  );
}

function InterviewsContent() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInterviews()
      .then(setInterviews)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top bar */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>
          🤖 FluxForms
        </span>
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
            Flux Interviews
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>
            Use <code style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: 4 }}>/createinterview</code> in the Creator Bot to add a new interview.
          </p>
        </div>

        {loading && (
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '2rem 0' }}>Loading…</div>
        )}

        {error && (
          <div style={{ color: 'var(--error)', background: '#1f1214', border: '1px solid #3d1c1c', borderRadius: 8, padding: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {!loading && !error && interviews.length === 0 && (
          <div style={{ color: 'var(--muted)', padding: '3rem 0', textAlign: 'center', fontSize: '0.9rem' }}>
            No interviews yet. Send <strong>/createinterview</strong> to the Creator Bot to get started.
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {interviews.map(iv => <InterviewCard key={iv.id} iv={iv} />)}
          </div>
        )}
      </main>
    </div>
  );
}

export default function InterviewsPage() {
  return (
    <AuthGuard>
      <InterviewsContent />
    </AuthGuard>
  );
}
