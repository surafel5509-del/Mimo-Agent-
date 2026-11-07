'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Bot,
  Compass,
  FolderKanban,
  FileText,
  Brain,
  Settings,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { en } from '@/lib/i18n/en';
import { Logo } from './Logo';
import { ConfirmButton } from '@/components/ui/Confirm';

type ConversationItem = { id: string; title: string; updatedAt: string };

export const CONVERSATIONS_CHANGED = 'mimo:conversations-changed';

const NAV = [
  { href: '/agents', label: en.nav.agents, icon: Bot },
  { href: '/tools', label: en.nav.tools, icon: Compass },
  { href: '/projects', label: en.nav.projects, icon: FolderKanban },
  { href: '/documents', label: en.nav.documents, icon: FileText },
  { href: '/memory', label: en.nav.memory, icon: Brain },
  { href: '/settings', label: en.nav.settings, icon: Settings },
  { href: '/help', label: en.nav.help, icon: LifeBuoy },
];

export function Sidebar({ user, open, onClose }: { user: { email: string; role: 'user' | 'admin' }; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [q, setQ] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const activeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ conversations: ConversationItem[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setItems(res.conversations);
      setLoadError(null);
    } catch {
      setLoadError('Could not load chat history.');
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    const onChange = () => load();
    window.addEventListener(CONVERSATIONS_CHANGED, onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener(CONVERSATIONS_CHANGED, onChange);
    };
  }, [load, q, pathname]);

  useEffect(() => {
    onClose();
    // Close the mobile drawer on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function remove(id: string) {
    try {
      await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setItems((list) => list.filter((c) => c.id !== id));
      if (activeId === id) router.push('/chat');
    } catch {
      setLoadError('Could not delete that chat. Try again.');
    }
  }

  async function signOut() {
    await apiFetch('/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {open ? <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden /> : null}
      <aside
        aria-label="Sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-panel transition-transform lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close navigation" className="rounded-lg p-2 text-muted hover:bg-panel-3 lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pb-2 pt-3">
          <Link
            href="/chat"
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-white shadow-sm shadow-accent/30 hover:bg-accent-strong"
          >
            <Plus className="h-4 w-4" /> {en.nav.newChat}
          </Link>
        </div>
        <div className="px-3">
          <label className="relative block">
            <span className="sr-only">Search chats</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats"
              className="h-9 w-full rounded-lg border border-line bg-panel-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{en.nav.history}</p>
          <nav aria-label="Chat history" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loadError ? <p className="px-2 py-2 text-xs text-danger">{loadError}</p> : null}
            {items.length === 0 && !loadError ? <p className="px-2 py-2 text-xs text-muted">{q ? 'No matching chats.' : 'Your conversations appear here.'}</p> : null}
            <ul className="space-y-0.5">
              {items.map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <Link
                    href={`/chat/${c.id}`}
                    aria-current={activeId === c.id ? 'page' : undefined}
                    className={clsx(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm',
                      activeId === c.id ? 'bg-panel-3 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg',
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.title}</span>
                  </Link>
                  <ConfirmButton
                    onConfirm={() => remove(c.id)}
                    label={`Delete chat "${c.title}"`}
                    message="Delete this chat and its messages?"
                    className="rounded-md p-1.5 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <nav aria-label="Workspace" className="border-t border-line px-2 py-2">
          <ul className="space-y-0.5">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                      active ? 'bg-panel-3 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg',
                    )}
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                </li>
              );
            })}
            {user.role === 'admin' ? (
              <li>
                <Link
                  href="/admin"
                  aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                    pathname.startsWith('/admin') ? 'bg-panel-3 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg',
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {en.nav.admin}
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <div className="flex items-center gap-3 border-t border-line p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-semibold text-white" aria-hidden>
            {user.email.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{user.email}</p>
            <p className="text-xs capitalize text-muted">{user.role}</p>
          </div>
          <button type="button" onClick={signOut} aria-label={en.nav.signOut} title={en.nav.signOut} className="rounded-lg p-2 text-muted hover:bg-panel-3 hover:text-fg">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
