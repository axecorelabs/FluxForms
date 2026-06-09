'use client';

import Sidebar from './Sidebar';
import AuthGuard from './AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', padding: '32px', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
