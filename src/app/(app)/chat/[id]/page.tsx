import type { Metadata } from 'next';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Chat' };

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatWorkspace conversationId={id} />;
}
