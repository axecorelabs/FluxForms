'use client';

import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TrendPoint { date: string; count: number; label: string; }
interface FormBar    { name: string; responses: number; }

interface Props {
  trendData: TrendPoint[];
  formData:  FormBar[];
  isDark:    boolean;
}

export default function OverviewCharts({ trendData, formData, isDark }: Props) {
  const gridColor   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tickColor   = isDark ? '#65656f' : '#94a3b8';
  const tooltipStyle = {
    background:   isDark ? '#1e1e24' : '#ffffff',
    border:       '1px solid var(--border-strong)',
    borderRadius: 10,
    fontSize:     12,
    color:        isDark ? '#eaeaed' : '#1a1a1f',
    boxShadow:    '0 4px 12px rgba(0,0,0,0.3)',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
      {/* Area chart */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, minWidth: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Form Responses</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Last 30 days</p>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180} debounce={60}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#bfdbfe" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} tickMargin={8} allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="count" stroke="#bfdbfe" strokeWidth={2} fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: '#bfdbfe', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No response data yet
          </div>
        )}
      </div>

      {/* Bar chart */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, minWidth: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Responses by Form</h3>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>Top forms</p>
        {formData.some(f => f.responses > 0) ? (
          <ResponsiveContainer width="100%" height={180} debounce={60}>
            <BarChart data={formData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="responses" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            No responses yet
          </div>
        )}
      </div>
    </div>
  );
}
