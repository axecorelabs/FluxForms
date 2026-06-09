'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Copy, Search, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getInterview, getInterviewStats, getInterviewSessions, searchSessions } from '@/lib/api';
import type { Interview, InterviewStats, InterviewSession, SearchResult } from '@/lib/types';

const STATE_DOT: Record<string, string> = {
  COMPLETED: 'var(--success)',
  ACTIVE: 'var(--warning)',
  INTERRUPTED: 'var(--text-tertiary)',
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)',
  DRAFT: 'var(--text-tertiary)',
  CLOSED: 'var(--error)',
  ARCHIVED: 'var(--text-tertiary)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function SessionRow({ session, interviewId }: { session: InterviewSession; interviewId: string }) {
  const profile = session.extractedProfile ?? [];
  const preview = profile
    .slice(0, 3)
    .map(e => {
      const v = Array.isArray(e.value) ? (e.value as unknown[]).join(', ') : String(e.value ?? '');
      return `${e.fieldName}: ${v}`;
    })
    .join(' · ');

  return (
    <Link href={`/interviews/${interviewId}/sessions/${session.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATE_DOT[session.state] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {session.userTelegramId}
          </div>
          {preview && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {session.turnCount} turns
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 120 }}>
          {formatDate(session.startedAt)}
        </div>
      </div>
    </Link>
  );
}

function InterviewDetailContent({ id }: { id: string }) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([getInterview(id), getInterviewStats(id), getInterviewSessions(id)])
      .then(([iv, st, se]) => { setInterview(iv); setStats(st); setSessions(se); })
      .finally(() => setLoading(false));
  }, [id]);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const { results } = await searchSessions(id, searchQuery);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [id, searchQuery]);

  const copyLink = () => {
    if (!interview?.shareLink) return;
    navigator.clipboard.writeText(interview.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <DashboardLayout>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
    </DashboardLayout>
  );

  if (!interview) return (
    <DashboardLayout>
      <div style={{ color: 'var(--error)', fontSize: 13 }}>Interview not found.</div>
    </DashboardLayout>
  );

  const displaySessions = searchResults
    ? sessions.filter(s => searchResults.some(r => r.id === s.id))
        .sort((a, b) => searchResults.findIndex(r => r.id === a.id) - searchResults.findIndex(r => r.id === b.id))
    : sessions;

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1000 }}>
        {/* Breadcrumb + title */}
        <div style={{ marginBottom: 24 }}>
          <Link href="/interviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 16 }}>
            <ChevronLeft size={14} />
            Interviews
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[interview.status] ?? 'var(--text-tertiary)' }} />
            <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {interview.title}
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
              background: interview.status === 'ACTIVE' ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
              color: interview.status === 'ACTIVE' ? 'var(--success)' : 'var(--text-tertiary)',
            }}>
              {interview.status}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total', value: stats.total, color: 'var(--text)' },
              { label: 'Completed', value: stats.completed, color: 'var(--success)' },
              { label: 'In Progress', value: stats.active, color: 'var(--warning)' },
              { label: 'Dropped', value: stats.interrupted, color: 'var(--text-tertiary)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontSize: 26, fontWeight: 600, color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Share link */}
        {interview.shareLink && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>Share link</span>
            <code style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {interview.shareLink}
            </code>
            <button
              onClick={copyLink}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: copied ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: copied ? 'var(--success)' : 'var(--text-secondary)',
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              <Copy size={12} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {/* Sessions */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Responses</h2>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sessions.length} total</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={13} color="var(--text-tertiary)" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
                  onKeyDown={e => e.key === 'Enter' && runSearch()}
                  placeholder="Search profiles…"
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '6px 10px 6px 30px',
                    color: 'var(--text)', fontSize: 12, width: 200,
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={runSearch}
                disabled={searching}
                style={{
                  background: 'var(--accent)', border: 'none', color: '#fff',
                  padding: '6px 14px', borderRadius: 6, cursor: searching ? 'wait' : 'pointer', fontSize: 12,
                }}
              >
                {searching ? '…' : 'Search'}
              </button>
              {searchResults !== null && (
                <button
                  onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                  style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {searchResults !== null && (
            <div style={{ padding: '8px 20px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--accent)' }}>
              {displaySessions.length} result{displaySessions.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
            </div>
          )}

          {displaySessions.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {searchResults !== null ? 'No matching profiles found.' : 'No responses yet.'}
            </div>
          )}

          {displaySessions.map(s => (
            <SessionRow key={s.id} session={s} interviewId={id} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <InterviewDetailContent id={id} />;
}
