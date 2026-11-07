import type { Metadata } from 'next';
import { HelpView } from '@/components/views/HelpView';
export const metadata: Metadata = { title: 'Help & support' };

export default function Page() {
  return <HelpView />;
}
