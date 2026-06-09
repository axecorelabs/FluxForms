'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getForm, getFormResponses } from '@/lib/api';
import type { Form, FormQuestion, FormResponse, FormResponsesPage } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  PAYMENT_PENDING: 'Pending payment',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)',
  DRAFT: 'var(--text-tertiary)',
  PAYMENT_PENDING: 'var(--warning)',
  CLOSED: 'var(--error)',
  ARCHIVED: 'var(--text-tertiary)',
};

function exportCsv(form: Form, responses: FormResponse[]) {
  const questions = form.questions;
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ['Submitted At', ...questions.map(q => escape(q.text))].join(',');
  const rows = responses.map(r => {
    const date = r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '';
    const values = questions.map(q => escape(r.answers[q.id] ?? ''));
    return [escape(date), ...values].join(',');
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

  if (loading) return <div style={{ padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading responses…</div>;
  if (error) return <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>;
  if (!data || data.responses.length === 0) {
    return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No responses yet.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {data.total} response{data.total !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => exportCsv(form, data.responses)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none',
            borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <Download size={13} strokeWidth={2.5} />
          Export CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                Submitted
              </th>
              {questions.map(q => (
                <th key={q.id} style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-tertiary)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', maxWidth: 200, borderBottom: '1px solid var(--border)' }}>
                  {q.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.responses.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                </td>
                {questions.map(q => (
                  <td key={q.id} style={{ padding: '10px 16px', color: 'var(--text)', maxWidth: 240, wordBreak: 'break-word' }}>
                    {r.answers[q.id] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 16px', borderRadius: 6, cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, opacity: page === 1 ? 0.5 : 1 }}
          >
            Previous
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: '32px' }}>{page} / {data.totalPages}</span>
          <button
            disabled={page === data.totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 16px', borderRadius: 6, cursor: page === data.totalPages ? 'default' : 'pointer', fontSize: 13, opacity: page === data.totalPages ? 0.5 : 1 }}
          >
            Next
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
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/forms" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 16 }}>
          <ChevronLeft size={14} />
          Forms
        </Link>

        {loading && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>}
        {error && <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>}

        {form && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[form.status] ?? 'var(--text-tertiary)' }} />
                <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)' }}>
                  {form.title}
                </h1>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {STATUS_LABELS[form.status] ?? form.status}
                &nbsp;·&nbsp;{form.questions.length} question{form.questions.length !== 1 ? 's' : ''}
                &nbsp;·&nbsp;Created {new Date(form.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {form && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Responses</h2>
          <ResponsesTable form={form} questions={form.questions} />
        </div>
      )}
    </div>
  );
}

export default function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <DashboardLayout>
      <FormDetailContent id={id} />
    </DashboardLayout>
  );
}
