import type { Metadata } from 'next';
import { ProjectsView } from '@/components/views/ProjectsView';
export const metadata: Metadata = { title: 'Projects' };

export default function Page() {
  return <ProjectsView />;
}
