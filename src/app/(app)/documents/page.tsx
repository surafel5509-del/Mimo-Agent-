import type { Metadata } from 'next';
import { DocumentsView } from '@/components/views/DocumentsView';
export const metadata: Metadata = { title: 'Documents' };

export default function Page() {
  return <DocumentsView />;
}
