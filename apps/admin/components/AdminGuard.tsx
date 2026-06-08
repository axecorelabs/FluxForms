'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasKey } from '@/lib/auth';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasKey()) router.replace('/auth');
  }, [router]);

  if (typeof window !== 'undefined' && !hasKey()) return null;
  return <>{children}</>;
}
