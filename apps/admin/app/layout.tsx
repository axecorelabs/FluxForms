'use client';

import './globals.css';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === '/auth';

  return (
    <html lang="en">
      <head><title>FluxForms Admin</title></head>
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        {!isAuth && <Sidebar />}
        <main style={{ flex: 1, padding: isAuth ? 0 : '2rem', overflow: 'auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
