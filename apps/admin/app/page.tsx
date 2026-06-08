'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasKey } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(hasKey() ? '/stats' : '/auth');
  }, [router]);
  return null;
}
