import type { Metadata } from 'next';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata: Metadata = { title: 'Chat' };

export default function ChatPage() {
  return <ChatWorkspace />;
}
