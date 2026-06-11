'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Copy, Check, Download, Search, X, MessageSquare, Zap, Square, Trash2, RefreshCw, Settings, AlertTriangle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { getInterview, getInterviewStats, getInterviewSessions, getSession, searchSessions, activateInterview, closeInterview, deleteInterview, regenerateSummary, rerunExtraction } from '@/lib/api';
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
  return new Date(iso).toLocaleDateString('en-NG', { dateStyle: 'medium' });
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(', ');
  return String(v);
}

// ── Profiles table ────────────────────────────────────────────────────────────

function ProfilesTable({ sessions, interviewTitle, onSummaryRegenerated, onExtractionRerun }: { sessions: InterviewSession[]; interviewTitle: string; onSummaryRegenerated: (sessionId: string, summary: string) => void; onExtractionRerun: (sessionId: string) => void }) {
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState<string | null>(null);
  const completed = sessions.filter(s => s.state === 'COMPLETED');

  const fields = [...new Set(
    completed.flatMap(s => (s.extractedProfile ?? []).map(e => e.fieldName))
  )];

  const exportCSV = () => {
    const headers = ['Respondent', 'Date', ...fields, 'Summary'];
    const rows = completed.map(s => {
      const map = Object.fromEntries((s.extractedProfile ?? []).map(e => [e.fieldName, e.value]));
      return [
        s.userTelegramId,
        formatDate(s.startedAt),
        ...fields.map(f => formatValue(map[f])),
        s.summary ?? '',
      ];
    });
    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${interviewTitle.replace(/[^a-z0-9]/gi, '_')}_profiles.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (completed.length === 0) {
    return (
      <div style={{ padding: '52px 20px', textAlign: 'center' }}>
        <MessageSquare size={28} color="var(--text-tertiary)" strokeWidth={1.5} style={{ marginBottom: 14 }} />
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>No completed conversations yet</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Profiles appear here once respondents finish a conversation.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Table toolbar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{completed.length} profile{completed.length !== 1 ? 's' : ''}</span>
        {fields.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
        )}
        <button
          onClick={exportCSV}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'inherit' }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                Respondent
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                Date
              </th>
              {fields.map(f => (
                <th key={f} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                  {f.replace(/_/g, ' ')}
                </th>
              ))}
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', minWidth: 240 }}>
                Summary
              </th>
              <th style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {completed.map(s => {
              const map = Object.fromEntries((s.extractedProfile ?? []).map(e => [e.fieldName, e.value]));
              return (
                <tr
                  key={s.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  onClick={() => window.location.href = `/interviews/${s.id.split('/')[0]}/sessions/${s.id}`}
                >
                  <td style={{ padding: '12px 20px', fontSize: 12, whiteSpace: 'nowrap' }}>
                    <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.userTelegramId}</div>
                    {s.extractionStatus === 'FAILED' && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setRerunning(s.id);
                          try {
                            await rerunExtraction(s.id);
                            onExtractionRerun(s.id);
                          } finally { setRerunning(null); }
                        }}
                        disabled={rerunning === s.id}
                        title={s.extractionError ?? 'Extraction failed'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '2px 7px', cursor: rerunning === s.id ? 'wait' : 'pointer', fontSize: 11, color: 'var(--error)', fontFamily: 'inherit' }}
                      >
                        {rerunning === s.id
                          ? <><RotateCcw size={9} style={{ animation: 'spin 1s linear infinite' }} /> Queued…</>
                          : <><AlertTriangle size={9} /> Extraction failed · Re-run</>}
                      </button>
                    )}
                    {(s.extractionStatus === 'PENDING' || s.extractionStatus === 'PROCESSING') && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <RotateCcw size={9} style={{ animation: 'spin 1s linear infinite' }} /> Extracting…
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatDate(s.startedAt)}
                  </td>
                  {fields.map(f => (
                    <td key={f} style={{ padding: '12px 16px', color: 'var(--text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatValue(map[f])}
                    </td>
                  ))}
                  <td style={{ padding: '12px 16px', fontSize: 12, maxWidth: 280 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                            title={s.summary ?? undefined}>
                        {s.summary ? s.summary.slice(0, 120) + (s.summary.length > 120 ? '…' : '') : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setRegenerating(s.id);
                          try {
                            const summary = await regenerateSummary(s.id);
                            onSummaryRegenerated(s.id, summary);
                          } finally { setRegenerating(null); }
                        }}
                        disabled={regenerating === s.id}
                        title="Regenerate summary"
                        style={{ background: 'none', border: 'none', cursor: regenerating === s.id ? 'wait' : 'pointer', padding: 3, color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}
                      >
                        <RefreshCw size={11} style={{ animation: regenerating === s.id ? 'spin 1s linear infinite' : 'none' }} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/interviews/${s.id.split('/')[0]}/sessions/${s.id}`} onClick={(e: { stopPropagation(): void }) => e.stopPropagation()} style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sessions list ─────────────────────────────────────────────────────────────

function SessionsList({ sessions, interviewId }: { sessions: InterviewSession[]; interviewId: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const { results } = await searchSessions(interviewId, searchQuery);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [interviewId, searchQuery]);

  const display = searchResults
    ? sessions.filter(s => searchResults.some(r => r.id === s.id))
        .sort((a, b) => searchResults.findIndex(r => r.id === a.id) - searchResults.findIndex(r => r.id === b.id))
    : sessions;

  return (
    <div>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{sessions.length} conversation{sessions.length !== 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="var(--text-tertiary)" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setSearchResults(null); }}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Search profiles…"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px 6px 30px', color: 'var(--text)', fontSize: 12, width: 200, outline: 'none' }}
            />
          </div>
          <button onClick={runSearch} disabled={searching} style={{ background: 'var(--accent)', border: 'none', color: 'var(--accent-fg)', padding: '6px 14px', borderRadius: 10, cursor: searching ? 'wait' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            {searching ? '…' : 'Search'}
          </button>
          {searchResults !== null && (
            <button onClick={() => { setSearchResults(null); setSearchQuery(''); }} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 8px', borderRadius: 10, cursor: 'pointer' }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {searchResults !== null && (
        <div style={{ padding: '8px 20px', background: 'var(--accent-muted)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--accent)' }}>
          {display.length} result{display.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
        </div>
      )}

      {display.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
          {searchResults !== null ? 'No matching conversations found.' : 'No conversations yet.'}
        </div>
      )}

      {display.map(s => {
        const profile = s.extractedProfile ?? [];
        const preview = profile.slice(0, 3).map(e => `${e.fieldName}: ${formatValue(e.value)}`).join(' · ');
        return (
          <Link key={s.id} href={`/interviews/${interviewId}/sessions/${s.id}`} style={{ textDecoration: 'none' }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto auto', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATE_DOT[s.state] ?? 'var(--text-tertiary)' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.userTelegramId}</div>
                {preview && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>{s.turnCount} turns</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 100, textAlign: 'right' }}>{formatDate(s.startedAt)}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function InterviewDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'profiles' | 'sessions'>('profiles');
  const [copied, setCopied] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollTimers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [iv, st, se] = await Promise.all([
          getInterview(id),
          getInterviewStats(id),
          getInterviewSessions(id),
        ]);
        if (!mounted) return;
        setInterview(iv);
        setStats(st);
        setSessions(se);
      } catch (err) {
        // If any request fails (e.g. 404), show the not-found state.
        if (!mounted) return;
        setInterview(null);
        setStats(null);
        setSessions([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Clear any in-flight extraction polls when leaving the page
  useEffect(() => () => { pollTimers.current.forEach(clearInterval); }, []);

  // Poll a session after a re-run until extraction settles (DONE/FAILED),
  // then merge the fresh fields/summary/status into the row.
  const pollExtraction = useCallback((sessionId: string) => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const fresh = await getSession(sessionId);
        const settled = fresh.extractionStatus === 'DONE' || fresh.extractionStatus === 'FAILED';
        if (settled || attempts >= 20) {
          clearInterval(timer);
          pollTimers.current = pollTimers.current.filter(t => t !== timer);
          setSessions(prev => prev.map(s => s.id === sessionId ? {
            ...s,
            extractionStatus: fresh.extractionStatus,
            extractionError: fresh.extractionError,
            summary: fresh.summary,
            extractedProfile: fresh.extractedProfile,
          } : s));
        }
      } catch {
        if (attempts >= 20) {
          clearInterval(timer);
          pollTimers.current = pollTimers.current.filter(t => t !== timer);
        }
      }
    }, 2500);
    pollTimers.current.push(timer);
  }, []);

  const copyLink = () => {
    if (!interview?.shareLink) return;
    navigator.clipboard.writeText(interview.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async () => {
    setActioning(true); setActionError(null);
    try {
      const updated = await activateInterview(id);
      setInterview(updated);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to activate');
    } finally { setActioning(false); }
  };

  const handleClose = async () => {
    if (!confirm('Close this interview? Respondents will no longer be able to start new conversations.')) return;
    setActioning(true); setActionError(null);
    try {
      const updated = await closeInterview(id);
      setInterview(updated);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to close');
    } finally { setActioning(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this interview? This cannot be undone.')) return;
    setActioning(true); setActionError(null);
    try {
      await deleteInterview(id);
      router.push('/interviews');
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete');
      setActioning(false);
    }
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8,
    background: active ? 'var(--bg-surface)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-tertiary)',
    border: active ? '1px solid var(--border)' : '1px solid transparent',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  });

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <Link href="/interviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 16 }}>
          <ChevronLeft size={14} /> Interviews
        </Link>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: actionError ? 12 : 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[interview.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
            <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)' }}>{interview.title}</h1>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6, background: interview.status === 'ACTIVE' ? 'rgba(52,211,153,0.12)' : 'var(--bg-elevated)', color: interview.status === 'ACTIVE' ? 'var(--success)' : 'var(--text-tertiary)', flexShrink: 0 }}>
              {interview.status}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Share link — only when active */}
            {interview.shareLink && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Share</span>
                <code style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {interview.shareLink}
                </code>
                <button onClick={copyLink} style={{ display: 'flex', alignItems: 'center', gap: 4, background: copied ? 'rgba(52,211,153,0.12)' : 'var(--bg-elevated)', border: '1px solid var(--border)', color: copied ? 'var(--success)' : 'var(--text-secondary)', padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Activate — DRAFT only */}
            {interview.status === 'DRAFT' && (
              <button
                disabled={actioning}
                onClick={handleActivate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: actioning ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: actioning ? 0.6 : 1 }}
              >
                <Zap size={13} strokeWidth={2.5} />
                {actioning ? 'Activating…' : 'Activate'}
              </button>
            )}

            {/* Close — ACTIVE only */}
            {interview.status === 'ACTIVE' && (
              <button
                disabled={actioning}
                onClick={handleClose}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', cursor: actioning ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', opacity: actioning ? 0.6 : 1 }}
              >
                <Square size={13} strokeWidth={2.5} />
                {actioning ? 'Closing…' : 'Close'}
              </button>
            )}

            {/* Delete — DRAFT only */}
            {interview.status === 'DRAFT' && (
              <button
                disabled={actioning}
                onClick={handleDelete}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '8px 16px', cursor: actioning ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', opacity: actioning ? 0.6 : 1 }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}

            {/* Settings */}
            <Link href={`/interviews/${id}/settings`} style={{ textDecoration: 'none' }}>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                <Settings size={13} />
                Settings
              </button>
            </Link>
          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {actionError && (
          <div style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
            {actionError}
          </div>
        )}

        {/* Stat cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total conversations', value: stats.total,       color: 'var(--text)' },
              { label: 'Completed',            value: stats.completed,  color: 'var(--success)' },
              { label: 'In progress',          value: stats.active,     color: 'var(--warning)' },
              { label: 'Dropped off',          value: stats.interrupted, color: 'var(--text-tertiary)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 28, fontWeight: 600, color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--bg-elevated)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          <button style={tabStyle(tab === 'profiles')} onClick={() => setTab('profiles')}>Profiles</button>
          <button style={tabStyle(tab === 'sessions')} onClick={() => setTab('sessions')}>Conversations</button>
        </div>

        {/* Tab content */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {tab === 'profiles'
            ? <ProfilesTable
                sessions={sessions}
                interviewTitle={interview.title}
                onSummaryRegenerated={(sid, summary) =>
                  setSessions(prev => prev.map(s => s.id === sid ? { ...s, summary } : s))
                }
                onExtractionRerun={(sid) => {
                  setSessions(prev => prev.map(s => s.id === sid ? { ...s, extractionStatus: 'PENDING' } : s));
                  pollExtraction(sid);
                }}
              />
            : <SessionsList sessions={sessions} interviewId={id} />
          }
        </div>

      </div>
    </DashboardLayout>
  );
}

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <InterviewDetailContent id={id} />;
}
