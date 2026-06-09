'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle, ExternalLink, RotateCcw } from 'lucide-react';
import { requestTelegramLink, getTelegramLinkStatus } from '@/lib/api';

export default function ConnectTelegramPage() {
  const router = useRouter();
  const [deepLink, setDeepLink] = useState('');
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { deepLink: dl } = await requestTelegramLink();
      setDeepLink(dl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate link.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { generate(); }, [generate]);

  useEffect(() => {
    if (linked || !deepLink) return;
    const interval = setInterval(async () => {
      try {
        const { linked: done } = await getTelegramLinkStatus();
        if (done) {
          setLinked(true);
          clearInterval(interval);
          setTimeout(() => router.replace('/'), 2000);
        }
      } catch {
        // ignore polling errors silently
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [linked, deepLink, router]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 className="brand-heading" style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>
            Connect Telegram
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Scan the QR code or tap the button to link your Telegram account.
            You'll get bot commands and response notifications.
          </p>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          {linked ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <CheckCircle size={52} color="var(--success)" strokeWidth={1.5} />
              </div>
              <h2 className="brand-heading" style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>
                Telegram connected!
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Redirecting to your dashboard…
              </p>
            </>
          ) : loading ? (
            <div style={{ padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Generating QR code…
            </div>
          ) : error ? (
            <div style={{ padding: '24px 0' }}>
              <p style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</p>
              <button
                onClick={generate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
              >
                <RotateCcw size={13} /> Try again
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'inline-block', padding: 16, background: '#ffffff', borderRadius: 12, marginBottom: 20 }}>
                <QRCodeSVG value={deepLink} size={180} level="M" includeMargin={false} fgColor="#000000" />
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Open your phone camera and scan, or tap below.
              </p>

              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--accent)', color: 'var(--accent-fg)',
                  borderRadius: 8, padding: '10px 20px',
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  marginBottom: 16,
                }}
              >
                Open in Telegram <ExternalLink size={13} />
              </a>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Waiting for you to scan…</span>
              </div>

              <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={generate}
                  style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                >
                  <RotateCcw size={11} /> Regenerate QR code
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
          <button
            onClick={() => router.replace('/')}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Skip for now
          </button>
          {' — '}you can connect later from Settings.
        </p>
      </div>
    </div>
  );
}
