'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Brain, Search, Trash2 } from 'lucide-react';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, PageHeader, Panel, Spinner, Textarea } from '@/components/ui';
import { ConfirmButton } from '@/components/ui/Confirm';

type MemoryDto = { id: string; kind: 'preference' | 'fact' | 'project'; content: string; source: string; createdAt: string };

export function MemoryView() {
  const [items, setItems] = useState<MemoryDto[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<MemoryDto['kind']>('preference');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<{ memories: MemoryDto[] }>(`/api/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setItems(r.memories))
        .catch(() => setError('Could not load memories.'));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ memory: MemoryDto }>('/api/memories', { body: { kind, content } });
      setItems((list) => [res.memory, ...(list ?? [])]);
      setContent('');
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not save that memory.');
    }
  }

  async function remove(id: string) {
    await apiFetch(`/api/memories/${id}`, { method: 'DELETE' }).catch(() => setError('Could not delete that memory.'));
    setItems((list) => (list ?? []).filter((m) => m.id !== id));
  }

  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="Memory" description="Things the agent may remember across chats: preferences, facts and project context. You can review, add or delete any memory. Memory is private to your account." />
      <Panel className="p-5">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
          <label className="text-sm">
            <span className="sr-only">Memory type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as MemoryDto['kind'])} className="h-10 w-full rounded-xl border border-line bg-panel-2 px-3 text-sm">
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="project">Project</option>
            </select>
          </label>
          <Textarea rows={2} placeholder="e.g. I prefer concise answers with bullet points." value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} aria-label="Memory content" />
          <Button type="submit" variant="primary" disabled={!content.trim()}>Add memory</Button>
        </form>
        <p className="mt-2 text-xs text-muted">Do not store passwords, keys or other sensitive data. Such entries are refused.</p>
      </Panel>
      {error ? <Alert>{error}</Alert> : null}
      <label className="relative block max-w-md">
        <span className="sr-only">Search memories</span>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories" className="h-10 w-full rounded-xl border border-line bg-panel-2 pl-9 pr-3 text-sm" />
      </label>
      {items === null ? <Spinner /> : null}
      {items && items.length === 0 ? (
        <EmptyState icon={<Brain className="h-8 w-8" />} title="No memories yet">
          Memories are saved when you ask the agent to remember something, or you can add them above.
        </EmptyState>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((m) => (
            <li key={m.id}>
              <Panel className="flex h-full items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="accent">{m.kind}</Badge>
                    <span className="text-xs text-muted">{m.source} · {new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm">{m.content}</p>
                </div>
                <ConfirmButton onConfirm={() => remove(m.id)} label="Delete memory" message="Delete this memory?">
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </Panel>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
