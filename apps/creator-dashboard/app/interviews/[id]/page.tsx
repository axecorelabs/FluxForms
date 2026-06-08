'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getInterview, getInterviewStats, getInterviewSessions, searchSessions } from '@/lib/api';
import type { Interview, InterviewStats, InterviewSession, SearchResult } from '@/lib/types';

const STATE_COLORS: Record<string, string> = {
  COMPLETED:   '#22c55e',
  ACTIVE:      '#f59e0b',
  INTERRUPTED: '#64748b',
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr auto auto',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: STATE_COLORS[session.state] ?? '#64748b',
        }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
            {session.userTelegramId}
          </div>
          {preview && (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--muted)', flexShrink: 0 }}>
          {session.turnCount} turns
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--muted)', flexShrink: 0, minWidth: 120 }}>
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

  useEffect(() => {
    Promise.all([
      getInterview(id),
      getInterviewStats(id),
      getInterviewSessions(id),
    ]).then(([iv, st, se]) => {
      setInterview(iv);
      setStats(st);
      setSessions(se);
    }).finally(() => setLoading(false));
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

  if (loading) {
    return <div style={{ padding: '3rem 2rem', color: 'var(--muted)' }}>Loading…</div>;
  }
  if (!interview) {
    return <div style={{ padding: '3rem 2rem', color: 'var(--error)' }}>Interview not found.</div>;
  }

  const displaySessions = searchResults
    ? sessions.filter(s => searchResults.some(r => r.id === s.id))
      .sort((a, b) => {
        const ra = searchResults.findIndex(r => r.id === a.id);
        const rb = searchResults.findIndex(r => r.id === b.id);
        return ra - rb;
      })
    : sessions;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top bar */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--surface)',
      }}>
        <Link href="/interviews" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Interviews
        </Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{interview.title}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          padding: '2px 8px',
          borderRadius: 4,
          background: interview.status === 'ACTIVE' ? 'rgba(34,197,94,0.15)' : 'var(--border)',
          color: interview.status === 'ACTIVE' ? '#22c55e' : 'var(--muted)',
        }}>
          {interview.status}
        </span>
      </header>

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '2rem' }}>
        {/* Stats row */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Total', value: stats.total },
              { label: 'Completed', value: stats.completed, color: '#22c55e' },
              { label: 'In Progress', value: stats.active, color: '#f59e0b' },
              { label: 'Dropped', value: stats.interrupted, color: '#64748b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '1rem 1.25rem',
              }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Share link */}
        {interview.shareLink && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '1rem 1.25rem',
            marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Share link</span>
            <code style={{
              flex: 1, fontSize: '0.8rem', color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {interview.shareLink}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(interview.shareLink!)}
              style={{
                background: 'var(--accent)', border: 'none', color: '#fff',
                padding: '0.35rem 0.8rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              Copy
            </button>
          </div>
        )}

        {/* Sessions */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
              Responses
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{sessions.length} total</span>

            {/* Semantic search */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <input
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder="Search by profile content…"
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '0.4rem 0.75rem',
                  color: 'var(--text)', fontSize: '0.8rem', width: 220,
                }}
              />
              <button
                onClick={runSearch}
                disabled={searching}
                style={{
                  background: 'var(--accent)', border: 'none', color: '#fff',
                  padding: '0.4rem 0.9rem', borderRadius: 6,
                  cursor: searching ? 'wait' : 'pointer', fontSize: '0.8rem',
                }}
              >
                {searching ? '…' : 'Search'}
              </button>
              {searchResults !== null && (
                <button
                  onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                  style={{
                    background: 'none', border: '1px solid var(--border)', color: 'var(--muted)',
                    padding: '0.4rem 0.6rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {searchResults !== null && (
            <div style={{ padding: '0.5rem 1.25rem', background: 'rgba(99,102,241,0.08)', fontSize: '0.8rem', color: 'var(--accent)' }}>
              Showing {displaySessions.length} result{displaySessions.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
            </div>
          )}

          {displaySessions.length === 0 && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.875rem' }}>
              {searchResults !== null ? 'No matching profiles found.' : 'No responses yet.'}
            </div>
          )}

          {displaySessions.map(s => (
            <SessionRow key={s.id} session={s} interviewId={id} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AuthGuard>
      <InterviewDetailContent id={id} />
    </AuthGuard>
  );
}
