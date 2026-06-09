'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, ChevronRight, Copy, Check } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getInterviews } from '@/lib/api';
import type { Interview } from '@/lib/types';

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)',
  DRAFT: 'var(--text-tertiary)',
  CLOSED: 'var(--error)',
  ARCHIVED: 'var(--text-tertiary)',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

const TYPE_LABELS: Record<string, string> = {
  HIRING: 'Hiring',
  LEAD_QUALIFICATION: 'Lead Qual',
  CUSTOMER_FEEDBACK: 'Feedback',
  CLIENT_ONBOARDING: 'Onboarding',
  MARKET_RESEARCH: 'Research',
  CUSTOM: 'Custom',
};

function CopyCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'inherit' }}
    >
      <code style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{cmd}</code>
      {copied ? <Check size={11} color="var(--success)" /> : <Copy size={11} />}
    </button>
  );
}

export default function InterviewsPage() {
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
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>
            Interviews
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Use <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 6, fontSize: 12 }}>/createinterview</code> in the Creator Bot to add a new interview.
          </p>
        </div>

        {error && (
          <div style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {loading ? 'Loading…' : `${interviews.length} interview${interviews.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {loading && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
          )}

          {!loading && interviews.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <MessageSquare size={28} color="var(--text-tertiary)" strokeWidth={1.5} style={{ marginBottom: 14 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>No interviews yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
                Flux Interview uses AI to hold a natural conversation with your respondents and extract structured profiles automatically.
              </p>
              <CopyCommand cmd="/createinterview" />
            </div>
          )}

          {interviews.map(iv => (
            <Link key={iv.id} href={`/interviews/${iv.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[iv.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {iv.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {STATUS_LABELS[iv.status] ?? iv.status}
                    &nbsp;·&nbsp;{TYPE_LABELS[iv.type] ?? iv.type}
                    &nbsp;·&nbsp;{iv.schemaFields.length} field{iv.schemaFields.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 'auto' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {iv.completedCount}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>completed</div>
                </div>
                <ChevronRight size={16} color="var(--text-tertiary)" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
