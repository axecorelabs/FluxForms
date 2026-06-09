'use client';

import Sidebar from './Sidebar';
import AuthGuard from './AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px' }}>
          <div style={{ width: '100%', maxWidth: 1200 }}>
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
