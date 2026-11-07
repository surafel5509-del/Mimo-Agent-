import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/RecoveryForms';

export const metadata: Metadata = { title: 'Reset password' };
export default function Page() {
  return <ForgotPasswordForm />;
}
