import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth/server-user';
import { AppShell } from '@/components/shell/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  return (
    <AppShell user={{ email: user.email, role: user.role }}>{children}</AppShell>
  );
}
