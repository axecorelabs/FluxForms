'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { getForm, getFormResponses } from '@/lib/api';
import type { Form, FormQuestion, FormResponse, FormResponsesPage } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE:          '🟢 Active',
  DRAFT:           '📝 Draft',
  PAYMENT_PENDING: '⏳ Pending payment',
  CLOSED:          '🔴 Closed',
  ARCHIVED:        '🗄 Archived',
};

function exportCsv(form: Form, responses: FormResponse[]) {
  const questions = form.questions;
  const header = ['Submitted At', ...questions.map(q => q.text)].join(',');
  const rows = responses.map(r => {
    const date = r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '';
    const values = questions.map(q => {
      const v = r.answers[q.id] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    return [`"${date}"`, ...values].join(',');
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${form.title.replace(/[^a-z0-9]/gi, '_')}_responses.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ResponsesTable({ form, questions }: { form: Form; questions: FormQuestion[] }) {
  const [data, setData] = useState<FormResponsesPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getFormResponses(form.id, page)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [form.id, page]);

  if (loading) return <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>Loading responses…</div>;
  if (error) return <div style={{ color: 'var(--error)', padding: '1rem', fontSize: '0.875rem' }}>{error}</div>;
  if (!data || data.responses.length === 0) {
    return <div style={{ color: 'var(--muted)', padding: '3rem 0', textAlign: 'center' }}>No responses yet.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{data.total} response{data.total !== 1 ? 's' : ''}</span>
        <button
          onClick={() => exportCsv(form, data.responses)}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '0.4rem 1rem',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Submitted
              </th>
              {questions.map(q => (
                <th key={q.id} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--muted)', fontWeight: 600, maxWidth: '180px' }}>
                  {q.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.responses.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                  {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                </td>
                {questions.map(q => (
                  <td key={q.id} style={{ padding: '0.6rem 0.75rem', color: 'var(--text)', maxWidth: '220px', wordBreak: 'break-word' }}>
                    {r.answers[q.id] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.85rem', borderRadius: '6px', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: '2rem' }}>
            {page} / {data.totalPages}
          </span>
          <button
            disabled={page === data.totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.35rem 0.85rem', borderRadius: '6px', cursor: page === data.totalPages ? 'default' : 'pointer', opacity: page === data.totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function FormDetailContent({ id }: { id: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getForm(id)
      .then(setForm)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--surface)',
      }}>
        <Link href="/forms" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Forms
        </Link>
        {form && (
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
            {form.title}
          </span>
        )}
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
        {loading && <div style={{ color: 'var(--muted)', padding: '2rem 0' }}>Loading…</div>}
        {error && <div style={{ color: 'var(--error)', padding: '1rem', fontSize: '0.875rem' }}>{error}</div>}

        {form && (
          <>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.3rem', color: 'var(--text)' }}>
                  {form.title}
                </h1>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {STATUS_LABELS[form.status] ?? form.status}
                  &nbsp;·&nbsp;{form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
                  &nbsp;·&nbsp;Created {new Date(form.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1.25rem', color: 'var(--text)' }}>
                Responses
              </h2>
              <ResponsesTable form={form} questions={form.questions} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <FormDetailContent id={id} />
    </AuthGuard>
  );
}
