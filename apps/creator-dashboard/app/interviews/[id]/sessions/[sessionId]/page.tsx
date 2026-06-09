'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import { getSession } from '@/lib/api';
import type { SessionDetail, InterviewMessage, ExtractedEntity } from '@/lib/types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function MessageBubble({ msg }: { msg: InterviewMessage }) {
  const isAI = msg.role === 'AI';
  return (
    <div style={{ display: 'flex', flexDirection: isAI ? 'row' : 'row-reverse', gap: 8, alignItems: 'flex-end' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isAI ? 'var(--accent)' : 'var(--bg-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: isAI ? '#fff' : 'var(--text-secondary)', fontWeight: 700,
      }}>
        {isAI ? 'AI' : 'U'}
      </div>
      <div style={{
        maxWidth: '72%',
        background: isAI ? 'var(--bg-surface)' : 'var(--accent-muted)',
        border: `1px solid ${isAI ? 'var(--border)' : 'rgba(191,219,254,0.25)'}`,
        borderRadius: isAI ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--text)',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textAlign: isAI ? 'left' : 'right' }}>
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
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {entity.fieldName}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: confidence >= 0.8 ? 'var(--success)' : confidence >= 0.5 ? 'var(--warning)' : 'var(--error)',
          padding: '1px 6px', borderRadius: 4,
          background: confidence >= 0.8 ? 'rgba(34,197,94,0.1)' : confidence >= 0.5 ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)',
        }}>
          {pct}%
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
        {renderValue(entity.value)}
      </div>
    </div>
  );
}

const STATE_BADGE: Record<string, { color: string; bg: string }> = {
  COMPLETED:   { color: 'var(--success)', bg: 'rgba(34,197,94,0.1)' },
  ACTIVE:      { color: 'var(--warning)', bg: 'rgba(234,179,8,0.1)' },
  INTERRUPTED: { color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' },
};

function SessionViewerContent({ interviewId, sessionId }: { interviewId: string; sessionId: string }) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession(sessionId)
      .then(setSession)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const badge = STATE_BADGE[session?.state ?? ''] ?? STATE_BADGE['INTERRUPTED'];
  const entities = session?.extractedProfile ?? [];

  return (
    <AuthGuard>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Sub-header */}
          <div style={{
            height: 48, flexShrink: 0, borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center',
            padding: '0 24px', gap: 12,
          }}>
            <Link href={`/interviews/${interviewId}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              <ChevronLeft size={14} />
              Responses
            </Link>
            {session && (
              <>
                <span style={{ color: 'var(--border)', fontSize: 16 }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {session.userTelegramId}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, color: badge.color, background: badge.bg }}>
                  {session.state}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  {session.turnCount} turns &nbsp;·&nbsp; {formatDate(session.startedAt)}
                  {session.completedAt && ` → ${formatDate(session.completedAt)}`}
                </span>
              </>
            )}
          </div>

          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</span>
            </div>
          )}

          {!loading && !session && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--error)', fontSize: 13 }}>Session not found.</span>
            </div>
          )}

          {session && (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Conversation */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Conversation
                </div>
                {session.messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {session.messages.length === 0 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No messages recorded.</div>
                )}
              </div>

              {/* Extracted profile */}
              <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', background: 'var(--bg-surface)' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Extracted Profile
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {entities.length} field{entities.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {entities.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                    {session.state === 'ACTIVE' ? 'Extraction in progress…' : 'No entities extracted.'}
                  </div>
                )}

                {entities.map((e, i) => <EntityCard key={i} entity={e} />)}

                {entities.length > 0 && (
                  <details style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                    <summary style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', userSelect: 'none' }}>
                      Raw JSON
                    </summary>
                    <pre style={{
                      marginTop: 8, fontSize: 11, color: 'var(--text-secondary)',
                      overflowX: 'auto', lineHeight: 1.5,
                      background: 'var(--bg-base)', borderRadius: 6,
                      padding: '10px 12px', border: '1px solid var(--border)',
                    }}>
                      {JSON.stringify(entities, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}

export default function SessionPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  return <SessionViewerContent interviewId={id} sessionId={sessionId} />;
}
