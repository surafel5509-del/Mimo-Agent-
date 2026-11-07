import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerUser } from '@/lib/auth/server-user';
import { AdminView } from '@/components/views/AdminView';

export const metadata: Metadata = { title: 'Administration' };

/** Server-side role check. The admin APIs enforce the same rule independently. */
export default async function AdminPage() {
  const user = await getServerUser();
  if (!user || user.role !== 'admin') notFound();
  return <AdminView currentUserId={user.id} />;
}
