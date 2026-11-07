import type { Metadata } from 'next';
import { ToolsView } from '@/components/views/CatalogViews';
export const metadata: Metadata = { title: 'Explore Tools' };

export default function Page() {
  return <ToolsView />;
}
