import type { Metadata } from 'next';
import { MemoryView } from '@/components/views/MemoryView';
export const metadata: Metadata = { title: 'Memory' };

export default function Page() {
  return <MemoryView />;
}
