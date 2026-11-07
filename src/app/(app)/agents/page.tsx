import type { Metadata } from 'next';
import { AgentsView } from '@/components/views/CatalogViews';
export const metadata: Metadata = { title: 'AI Agents' };

export default function Page() {
  return <AgentsView />;
}
