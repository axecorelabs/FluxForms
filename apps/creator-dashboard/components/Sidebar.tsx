'use client';

import { useState, useEffect } from 'react';
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
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { clearToken } from '@/lib/auth';
import { getProfile } from '@/lib/api';

const NAV = [
  { href: '/',           icon: LayoutDashboard, label: 'Overview' },
  { href: '/interviews', icon: MessageSquare,    label: 'Interviews' },
  { href: '/forms',      icon: FileText,         label: 'Forms' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    getProfile().then(p => {
      setEmail(p.email);
      setDisplayName(p.displayName);
    }).catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const isDark = resolvedTheme === 'dark';

  const avatarLetter = (displayName ?? email ?? '?')[0].toUpperCase();

  return (
    <aside
      style={{
        width: collapsed ? 56 : 220,
        minWidth: collapsed ? 56 : 220,
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
      {/* Logo row — collapse toggle lives here */}
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? 0 : '0 14px 0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', height: '100%', cursor: 'pointer',
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Zap size={13} color="#fff" strokeWidth={2.5} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                FluxForms
              </span>
            </div>

            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text-tertiary)', flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              }}
            >
              <ChevronLeft size={12} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: active ? 'var(--accent-muted)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 2} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '8px 8px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 1 }}>

        {/* Theme toggle */}
        <button
          onClick={() => mounted && setTheme(isDark ? 'light' : 'dark')}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
            background: 'transparent', border: 'none', width: '100%',
            color: 'var(--text-secondary)', transition: 'background 0.15s',
            textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
        >
          {mounted && isDark
            ? <Moon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
            : <Sun size={15} strokeWidth={2} style={{ flexShrink: 0 }} />}
          {!collapsed && (
            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {mounted && isDark ? 'Dark mode' : 'Light mode'}
            </span>
          )}
        </button>

        {/* Settings */}
        <Link href="/settings" style={{ textDecoration: 'none' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
              transition: 'background 0.15s',
              background: isActive('/settings') ? 'var(--accent-muted)' : 'transparent',
              color: isActive('/settings') ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            onMouseEnter={e => { if (!isActive('/settings')) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { if (!isActive('/settings')) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            <Settings size={15} strokeWidth={isActive('/settings') ? 2.5 : 2} style={{ flexShrink: 0 }} />
            {!collapsed && <span style={{ fontSize: 13, fontWeight: isActive('/settings') ? 600 : 500, whiteSpace: 'nowrap' }}>Settings</span>}
          </div>
        </Link>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />

        {/* User identity + sign out */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 9, padding: '6px 10px', borderRadius: 9,
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {/* Avatar */}
            <div style={{
              width: 24, height: 24, borderRadius: 8, flexShrink: 0,
              background: 'var(--accent-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            }}>
              {avatarLetter}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                {displayName && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                    {displayName}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                  {email ?? 'Telegram user'}
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={() => { clearToken(); window.location.href = '/auth/login'; }}
              title="Sign out"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                background: 'transparent', border: 'none', flexShrink: 0,
                color: 'var(--text-tertiary)', transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
              }}
            >
              <LogOut size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Sign out (collapsed state only) */}
        {collapsed && (
          <button
            onClick={() => { clearToken(); window.location.href = '/auth/login'; }}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
              background: 'transparent', border: 'none', width: '100%',
              color: 'var(--text-tertiary)', transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--error)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
            }}
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </aside>
  );
}
