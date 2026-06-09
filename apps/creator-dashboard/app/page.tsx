'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from 'next-themes';
import {
  FileText, MessageSquare, Inbox, Activity, ArrowRight,

} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getOverviewStats, getInterviews, getForms } from '@/lib/api';
import type { OverviewStats, Interview, Form } from '@/lib/types';

function StatCard({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
          {label}
        </span>
        <Icon size={15} color="var(--text-tertiary)" strokeWidth={2} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>
      )}
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'var(--success)',
  DRAFT: 'var(--text-tertiary)',
  PAYMENT_PENDING: 'var(--warning)',
  CLOSED: 'var(--error)',
  ARCHIVED: 'var(--text-tertiary)',
};

export default function OverviewPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOverviewStats(), getInterviews(), getForms()])
      .then(([s, iv, f]) => {
        setStats(s);
        setInterviews(iv.slice(0, 5));
        setForms(f.forms.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#71717a' : '#94a3b8';
  const tooltipStyle = { background: isDark ? '#27272a' : '#ffffff', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)' };

  const trendData = (stats?.responseTrend ?? []).map((d, i) => ({
    ...d,
    label: i % 5 === 0 ? d.date.slice(5) : '',
  }));

  const activeInterviews = interviews.filter(iv => iv.status === 'ACTIVE').length;
  const totalCompletions = interviews.reduce((s, iv) => s + iv.completedCount, 0);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>
            Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Your FluxForms command center</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Responses" value={loading ? '—' : (stats?.totalResponses ?? 0)} icon={Inbox} sub="all time" />
          <StatCard label="Active Forms" value={loading ? '—' : (stats?.activeForms ?? 0)} icon={FileText} sub={`of ${stats?.totalForms ?? 0} total`} />
          <StatCard label="Active Interviews" value={loading ? '—' : activeInterviews} icon={MessageSquare} sub={`of ${interviews.length} total`} />
          <StatCard label="Interview Completions" value={loading ? '—' : totalCompletions} icon={Activity} sub="all time" />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Form Responses</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Last 30 days</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#bfdbfe" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={8} />
                <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={8} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="count" stroke="#bfdbfe" strokeWidth={2} fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: '#bfdbfe', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Responses by Form</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Top forms</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={forms.map(f => ({ name: f.title.slice(0, 10), responses: f._count?.responses ?? 0 }))}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                barSize={18}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="responses" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent lists */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent forms */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Recent Forms</h3>
              <Link href="/forms" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
            ) : forms.length === 0 ? (
              <div style={{ padding: '32px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>No forms yet</div>
            ) : forms.map(f => (
              <Link key={f.id} href={`/forms/${f.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[f.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                    {f._count?.responses ?? 0} resp
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Recent interviews */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Recent Interviews</h3>
              <Link href="/interviews" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
            ) : interviews.length === 0 ? (
              <div style={{ padding: '32px 20px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>No interviews yet</div>
            ) : interviews.map(iv => (
              <Link key={iv.id} href={`/interviews/${iv.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[iv.status] ?? 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.title}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                    {iv.completedCount} done
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
