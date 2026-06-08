'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearKey } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const links = [
  { href: '/stats',    label: 'Stats' },
  { href: '/users',    label: 'Users' },
  { href: '/queues',   label: 'Queues' },
  { href: '/payments', label: 'Payments' },
  { href: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    clearKey();
    router.push('/auth');
  }

  return (
    <aside style={{
      width: 200, minHeight: '100vh', background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '1.5rem 1rem',
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: '2rem', color: 'var(--accent)' }}>
        FluxForms
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {links.map(l => (
          <Link key={l.href} href={l.href} style={{
            padding: '0.5rem 0.75rem', borderRadius: 6, fontWeight: 500,
            background: pathname.startsWith(l.href) ? 'var(--accent-dim)' : 'transparent',
            color: pathname.startsWith(l.href) ? '#fff' : 'var(--muted)',
          }}>
            {l.label}
          </Link>
        ))}
      </nav>

      <button onClick={logout} style={{
        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
        color: 'var(--muted)', padding: '0.5rem 0.75rem', cursor: 'pointer',
        textAlign: 'left', width: '100%',
      }}>
        Sign out
      </button>
    </aside>
  );
}
