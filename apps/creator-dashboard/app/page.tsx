'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { FileText, MessageSquare, Inbox, Activity, ArrowRight, Copy, Check } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getOverview } from '@/lib/api';
import type { OverviewData } from '@/lib/types';

const OverviewCharts = dynamic(() => import('@/components/OverviewCharts'), { ssr: false });

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
          {label}
        </span>
        <Icon size={15} color="var(--text-tertiary)" strokeWidth={2} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  );
}

function BotCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
      <code style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{cmd}</code>
      {copied ? <Check size={11} color="var(--success)" /> : <Copy size={11} />}
    </button>
  );
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)', DRAFT: 'var(--text-tertiary)',
  PAYMENT_PENDING: 'var(--warning)', CLOSED: 'var(--error)', ARCHIVED: 'var(--text-tertiary)',
};

export default function OverviewPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    getOverview()
      .then(setOverview)
      .finally(() => setLoading(false));
  }, []);

  const isDark = resolvedTheme !== 'light';

  const trendData = (overview?.responseTrend ?? []).map((d: { date: string; count: number }, i: number) => ({
    ...d, label: i % 5 === 0 ? d.date.slice(5) : '',
  }));

  const interviews = overview?.recentInterviews ?? [];
  const forms = overview?.recentForms ?? [];

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>Overview</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your FluxForms command center</p>
        </div>

        {/* Getting started banner */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, marginBottom: 28 }}>
            <h2 className="brand-heading" style={{ fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>
              Welcome to FluxForms
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20, maxWidth: 520 }}>
              Your forms and interviews run entirely inside Telegram — no external links, no drop-off.
              Create your first one in the Creator Bot, share the link, and responses appear here.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {[
                { title: 'Flux Interview', desc: 'AI conducts a natural conversation and extracts structured data from it.', cmd: '/createinterview' },
                { title: 'Standard Form', desc: 'Bot walks respondents through questions one by one inside Telegram.', cmd: '/createform' },
              ].map(({ title, desc, cmd }) => (
                <div key={title} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>{desc}</p>
                  <BotCommand cmd={cmd} />
                </div>
              ))}
            </div>
          </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Responses"       value={loading ? '—' : (overview?.totalResponses ?? 0)}    icon={Inbox}        sub="all time" />
          <StatCard label="Active Forms"           value={loading ? '—' : (overview?.activeForms ?? 0)}      icon={FileText}     sub={`of ${overview?.totalForms ?? 0} total`} />
          <StatCard label="Active Interviews"      value={loading ? '—' : (overview?.activeInterviews ?? 0)} icon={MessageSquare} sub={`of ${overview?.totalInterviews ?? 0} total`} />
          <StatCard label="Interview Completions"  value={loading ? '—' : (overview?.totalCompletions ?? 0)} icon={Activity}     sub="all time" />
        </div>

        {/* Charts */}
        {mounted && (
          <div style={{ marginBottom: 24 }}>
            <OverviewCharts
              trendData={trendData}
              formData={forms.map(f => ({ name: f.title.slice(0, 12), responses: f._count?.responses ?? 0 }))}
              isDark={isDark}
            />
          </div>
        )}

        {/* Recent lists */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent interviews */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Recent Interviews</h3>
              <Link href="/interviews" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
            ) : interviews.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>No interviews yet</p>
                <BotCommand cmd="/createinterview" />
              </div>
            ) : interviews.map(iv => (
              <Link key={iv.id} href={`/interviews/${iv.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[iv.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>{iv.completedCount} done</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent forms */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Recent Forms</h3>
              <Link href="/forms" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
            ) : forms.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>No forms yet</p>
                <BotCommand cmd="/createform" />
              </div>
            ) : forms.map(f => (
              <Link key={f.id} href={`/forms/${f.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[f.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>{f._count?.responses ?? 0} resp.</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
