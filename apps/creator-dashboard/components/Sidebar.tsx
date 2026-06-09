'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  LogOut,
} from 'lucide-react';
import { clearToken } from '@/lib/auth';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { href: '/',            icon: LayoutDashboard, label: 'Overview' },
  { href: '/forms',       icon: FileText,         label: 'Forms' },
  { href: '/interviews',  icon: MessageSquare,    label: 'Interviews' },
];

const BOTTOM_NAV = [
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        minWidth: collapsed ? 56 : 240,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '0 16px' : '0 20px',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Zap size={14} color="#fff" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            FluxForms
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: collapsed ? '8px 12px' : '8px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'background 0.15s',
              background: isActive(href) ? 'var(--accent-muted)' : 'transparent',
              color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)',
            }}
              onMouseEnter={e => { if (!isActive(href)) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { if (!isActive(href)) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <Icon size={16} strokeWidth={isActive(href) ? 2.5 : 2} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <span style={{ fontSize: 13, fontWeight: isActive(href) ? 600 : 500, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              )}
            </div>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '8px 8px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ padding: collapsed ? '6px 12px' : '6px 12px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <ThemeToggle />
        </div>

        {BOTTOM_NAV.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
              transition: 'background 0.15s',
              background: isActive(href) ? 'var(--accent-muted)' : 'transparent',
              color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)',
            }}
              onMouseEnter={e => { if (!isActive(href)) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
              onMouseLeave={e => { if (!isActive(href)) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <Icon size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>}
            </div>
          </Link>
        ))}

        <button
          onClick={() => { clearToken(); window.location.href = '/auth/login'; }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: 'var(--text-tertiary)', width: '100%',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
          }}
        >
          <LogOut size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Sign out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '6px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-tertiary)', alignSelf: 'center',
            marginTop: 4, transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>
    </aside>
  );
}
