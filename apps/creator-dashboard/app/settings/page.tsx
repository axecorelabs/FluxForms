'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Link2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { getTelegramLinkStatus } from '@/lib/api';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: description ? 2 : 0 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    getTelegramLinkStatus()
      .then(({ linked }) => setTelegramLinked(linked))
      .catch(() => setTelegramLinked(false));
  }, []);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 700 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage your FluxForms preferences</p>
        </div>

        {/* Appearance */}
        <Section title="Appearance">
          <Row label="Theme" description="Choose between light and dark mode">
            {mounted ? (
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 6, padding: 3, gap: 2 }}>
                {(['light', 'dark'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 500,
                      background: resolvedTheme === t ? 'var(--bg-surface)' : 'transparent',
                      color: resolvedTheme === t ? 'var(--text)' : 'var(--text-tertiary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t === 'light' ? <Sun size={13} strokeWidth={2} /> : <Moon size={13} strokeWidth={2} />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            ) : <div style={{ width: 120, height: 30 }} />}
          </Row>
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row label="Telegram account" description={telegramLinked ? 'Your Telegram account is connected' : 'Connect to use the Creator Bot and receive notifications'}>
            {telegramLinked === null ? (
              <div style={{ width: 80, height: 28 }} />
            ) : telegramLinked ? (
              <span style={{ fontSize: 12, color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 6 }}>
                Connected
              </span>
            ) : (
              <button
                onClick={() => router.push('/auth/connect-telegram')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Link2 size={12} /> Connect
              </button>
            )}
          </Row>
          <Row label="Creator Bot" description="Use /dashboard in the bot to get a sign-in link">
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>/dashboard</code>
            </span>
          </Row>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Row label="Form response notifications" description="Get Telegram alerts when someone fills your form">
            <span style={{ fontSize: 12, color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 6 }}>
              Enabled
            </span>
          </Row>
          <Row label="Interview completion alerts" description="Get notified when an AI interview finishes">
            <span style={{ fontSize: 12, color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 6 }}>
              Enabled
            </span>
          </Row>
          <div style={{ paddingTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Notification preferences are managed in the Creator Bot. Use /settings in the bot to update them.
          </div>
        </Section>

        {/* Plan */}
        <Section title="Plan & Usage">
          <Row label="Manage subscription" description="View your current plan, usage, and upgrade options">
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Use <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>/plans</code> in the Creator Bot
            </span>
          </Row>
        </Section>
      </div>
    </DashboardLayout>
  );
}
