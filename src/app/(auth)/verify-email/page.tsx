import { Suspense } from 'react';
import type { Metadata } from 'next';
import { VerifyEmailPanel } from '@/components/auth/RecoveryForms';

export const metadata: Metadata = { title: 'Verify email' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPanel />
    </Suspense>
  );
}
