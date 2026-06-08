'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getSession } from '@/lib/api';
import type { SessionDetail, InterviewMessage, ExtractedEntity } from '@/lib/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function MessageBubble({ msg }: { msg: InterviewMessage }) {
  const isAI = msg.role === 'AI';
  return (
    <div style={{
      display: 'flex',
      flexDirection: isAI ? 'row' : 'row-reverse',
      gap: '0.5rem',
      alignItems: 'flex-end',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isAI ? 'var(--accent)' : 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.7rem', color: '#fff', fontWeight: 700,
      }}>
        {isAI ? 'AI' : 'U'}
      </div>
      <div style={{
        maxWidth: '72%',
        background: isAI ? 'var(--surface)' : 'rgba(99,102,241,0.18)',
        border: `1px solid ${isAI ? 'var(--border)' : 'rgba(99,102,241,0.35)'}`,
        borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '0.65rem 0.9rem',
        fontSize: '0.875rem',
        color: 'var(--text)',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '0.35rem', textAlign: isAI ? 'left' : 'right' }}>
          {formatDate(msg.createdAt)}
        </div>
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: ExtractedEntity }) {
  const confidence = entity.confidence ?? 1;
  const pct = Math.round(confidence * 100);

  const renderValue = (v: ExtractedEntity['value']): string => {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return (v as unknown[]).map(String).join(', ');
    return String(v);
  };

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '0.75rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {entity.fieldName}
        </span>
        <span style={{
          fontSize: '0.7rem',
          color: confidence >= 0.8 ? '#22c55e' : confidence >= 0.5 ? '#f59e0b' : '#ef4444',
          padding: '1px 6px',
          borderRadius: 4,
          background: confidence >= 0.8 ? 'rgba(34,197,94,0.12)' : confidence >= 0.5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
        }}>
          {pct}%
        </span>
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.45 }}>
        {renderValue(entity.value)}
      </div>
    </div>
  );
}

const STATE_STYLES: Record<string, { color: string; bg: string }> = {
  COMPLETED:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  ACTIVE:      { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  INTERRUPTED: { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

function SessionViewerContent({ interviewId, sessionId }: { interviewId: string; sessionId: string }) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession(sessionId)
      .then(setSession)
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--muted)' }}>Loading…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--error)' }}>Session not found.</span>
      </div>
    );
  }

  const stateStyle = STATE_STYLES[session.state] ?? STATE_STYLES['INTERRUPTED'];
  const entities = session.extractedProfile ?? [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <Link href={`/interviews/${interviewId}`} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Responses
        </Link>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
          {session.userTelegramId}
        </span>
        <span style={{
          fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4,
          color: stateStyle.color, background: stateStyle.bg,
        }}>
          {session.state}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          {session.turnCount} turns
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>
          {formatDate(session.startedAt)}
          {session.completedAt && ` → ${formatDate(session.completedAt)}`}
        </span>
      </header>

      {/* Split pane */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: conversation */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          borderRight: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            Conversation
          </div>
          {session.messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {session.messages.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '0.875rem', padding: '1rem 0' }}>No messages recorded.</div>
          )}
        </div>

        {/* Right: extracted profile */}
        <div style={{
          width: 320,
          flexShrink: 0,
          overflowY: 'auto',
          background: 'var(--surface)',
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Extracted Profile
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {entities.length} field{entities.length !== 1 ? 's' : ''}
            </span>
          </div>

          {entities.length === 0 && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>
              {session.state === 'ACTIVE'
                ? 'Extraction in progress…'
                : 'No entities extracted.'}
            </div>
          )}

          {entities.map((e, i) => (
            <EntityCard key={i} entity={e} />
          ))}

          {/* Raw JSON toggle */}
          {entities.length > 0 && (
            <details style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
              <summary style={{ fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                Raw JSON
              </summary>
              <pre style={{
                marginTop: '0.5rem', fontSize: '0.7rem', color: '#94a3b8',
                overflowX: 'auto', lineHeight: 1.5,
                background: 'var(--bg)', borderRadius: 6,
                padding: '0.75rem', border: '1px solid var(--border)',
              }}>
                {JSON.stringify(entities, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  return (
    <AuthGuard>
      <SessionViewerContent interviewId={id} sessionId={sessionId} />
    </AuthGuard>
  );
}
