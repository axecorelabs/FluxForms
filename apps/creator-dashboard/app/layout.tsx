import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FluxForms Dashboard',
  description: 'Creator dashboard for Flux Interviews',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
