'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Loader2, PanelRight } from 'lucide-react';
import { apiFetch, ClientApiError, getCsrfToken, readEvents } from '@/lib/client/api';
import { AGENT_MODES, type AgentModeId } from '@/lib/agents/modes';
import { CONVERSATIONS_CHANGED } from '@/components/shell/Sidebar';
import { Alert, Button } from '@/components/ui';
import { Composer, type AttachedFile } from './Composer';
import { MessageBubble } from './MessageBubble';
import { RightPanel } from './RightPanel';
import { Welcome } from './Welcome';
import { EMPTY_RUN, type MessageView, type RunView } from './types';
import type { ConversationDto, MessageDto } from '@/lib/services/conversations';
import type { ToolSource } from '@/lib/tools/types';
import type { ApprovalRequest } from '@/lib/agents/events';

type Options = {
  models: string[];
  modes: AgentModeId[];
  capabilities: { vision: boolean; webSearch: boolean; semanticMemory: boolean };
};

type SettingsResponse = {
  profile: { preferences: { defaultModel: string; defaultMode: AgentModeId } };
  options: Omit<Options, 'capabilities'>;
  capabilities: Options['capabilities'];
};

const toView = (m: MessageDto): MessageView => ({
  id: m.id,
  role: m.role as MessageView['role'],
  content: m.content,
  attachments: (m.attachments as MessageView['attachments']) ?? [],
  metadata: (m.metadata ?? {}) as MessageView['metadata'],
  runId: m.runId,
  createdAt: m.createdAt,
  feedback: m.feedback ?? null,
});

export function ChatWorkspace({ conversationId }: { conversationId?: string }) {
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const convRef = useRef<string | undefined>(conversationId);
  const [title, setTitle] = useState<string>('New chat');
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(conversationId));
  const [options, setOptions] = useState<Options | null>(null);
  const [mode, setMode] = useState<AgentModeId>('general');
  const [model, setModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [run, setRun] = useState<RunView>(EMPTY_RUN);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const modelRef = useRef(model);
  modeRef.current = mode;
  modelRef.current = model;

  // Load user options (models, modes, capabilities, defaults).
  useEffect(() => {
    let cancelled = false;
    apiFetch<SettingsResponse>('/api/settings')
      .then((res) => {
        if (cancelled) return;
        setOptions({ ...res.options, capabilities: res.capabilities });
        if (!convRef.current) {
          setMode(res.profile.preferences.defaultMode);
          setModel(res.profile.preferences.defaultModel);
        }
      })
      .catch(() => !cancelled && setError('Could not load your settings. Refresh to try again.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ conversation: ConversationDto; messages: MessageDto[] }>(`/api/conversations/${id}`);
      if (convRef.current !== id) return;
      setTitle(res.conversation.title);
      setMessages(res.messages.map(toView));
      setMode((res.conversation.mode as AgentModeId) ?? 'general');
      if (res.conversation.model) setModel(res.conversation.model);
    } catch (err) {
      if (convRef.current === id) setError(err instanceof ClientApiError && err.status === 404 ? 'This conversation no longer exists.' : 'Could not load this conversation.');
    } finally {
      setLoading(false);
    }
  }, []);

  // React to navigation between conversations (sidebar links, "New chat").
  useEffect(() => {
    if (conversationId === convRef.current) return;
    abortRef.current?.abort();
    convRef.current = conversationId;
    setConvId(conversationId);
    setRun(EMPTY_RUN);
    setStreamText('');
    setStreaming(false);
    if (conversationId) {
      void loadConversation(conversationId);
    } else {
      setMessages([]);
      setTitle('New chat');
      setLoading(false);
      setError(null);
    }
  }, [conversationId, loadConversation]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest content in view while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages.length, streamText, streaming]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  }, [messages]);

  const handleEvent = useCallback((ev: Record<string, any>, ctx: { tmpId: string; attached: AttachedFile[] }) => {
    switch (ev.type) {
      case 'conversation': {
        convRef.current = ev.id;
        setConvId(ev.id);
        setTitle(ev.title ?? 'New chat');
        if (window.location.pathname === '/chat') window.history.replaceState(null, '', `/chat/${ev.id}`);
        window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
        break;
      }
      case 'message': {
        const msg = ev.message as MessageDto;
        if (msg.role === 'user') {
          setMessages((list) => list.map((m) => (m.id === ctx.tmpId ? { ...toView(msg), pending: false } : m)));
        } else {
          setMessages((list) => [...list, toView(msg)]);
          setStreamText('');
        }
        break;
      }
      case 'token':
        setStreamText((t) => t + (ev.text as string));
        break;
      case 'run':
        setRun((r) => ({ ...r, status: 'running', runId: ev.runId, mode: ev.mode, model: ev.model, protocol: ev.protocol }));
        break;
      case 'status':
        setRun((r) => ({ ...r, notice: ev.message }));
        break;
      case 'memory':
        setRun((r) => ({ ...r, memory: ev.refs }));
        break;
      case 'plan':
      case 'plan_update':
        setRun((r) => ({ ...r, plan: ev.steps }));
        break;
      case 'tool_start':
        setRun((r) => ({ ...r, tools: [...r.tools, { callId: ev.callId, name: ev.name, summary: ev.summary, status: 'running' }] }));
        break;
      case 'tool_end':
        setRun((r) => ({
          ...r,
          tools: r.tools.map((t) => (t.callId === ev.callId ? { ...t, status: ev.status, summary: ev.summary } : t)),
          sources: mergeSources(r.sources, (ev.sources as ToolSource[] | undefined) ?? []),
        }));
        break;
      case 'approval':
        setRun((r) => ({ ...r, status: 'awaiting_approval', approvals: [...r.approvals.filter((a) => a.id !== ev.approval.id), ev.approval as ApprovalRequest] }));
        break;
      case 'error':
        setError(ev.message as string);
        setRun((r) => ({ ...r, status: 'failed', error: ev.message as string }));
        break;
      case 'final': {
        const meta = ev.metadata;
        setRun((r) => ({
          ...r,
          status: (meta.status as RunView['status']) ?? 'completed',
          sources: mergeSources(r.sources, meta.sources ?? []),
          approvals: meta.approvals ?? r.approvals,
          plan: meta.plan ?? r.plan,
          protocol: meta.protocol ?? r.protocol,
        }));
        break;
      }
      default:
        break;
    }
  }, []);

  const send = useCallback(
    async (opts: { text?: string; regenerate?: boolean }) => {
      if (abortRef.current) return;
      const text = (opts.text ?? '').trim();
      if (!opts.regenerate && !text) return;
      const ready = attachments.filter((a) => a.status === 'ready');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const tmpId = `tmp-${crypto.randomUUID()}`;
      setStreaming(true);
      setStreamText('');
      setError(null);
      setRun({ ...EMPTY_RUN, status: 'running', mode: modeRef.current, model: modelRef.current });

      if (!opts.regenerate) {
        setMessages((list) => [
          ...list,
          {
            id: tmpId,
            role: 'user',
            content: text,
            attachments: ready.map((a) => ({ id: a.id, name: a.name, kind: a.kind, extension: '' })),
            metadata: {},
            runId: null,
            createdAt: new Date().toISOString(),
            pending: true,
          },
        ]);
        setInput('');
        setAttachments([]);
      } else {
        // Drop the previous assistant reply from the view; the server truncates it too.
        setMessages((list) => {
          const idx = [...list].map((m) => m.role).lastIndexOf('assistant');
          return idx > list.map((m) => m.role).lastIndexOf('user') ? list.slice(0, idx) : list;
        });
      }

      let preStream = true;
      let restoreOnError = !opts.regenerate;
      try {
        const token = await getCsrfToken();
        const res = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'same-origin',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-csrf-token': token },
          body: JSON.stringify({
            conversationId: convRef.current,
            mode: modeRef.current,
            model: modelRef.current || undefined,
            regenerate: Boolean(opts.regenerate),
            message: opts.regenerate ? undefined : text,
            attachmentIds: opts.regenerate ? [] : ready.map((a) => a.id),
          }),
        });
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => ({}));
          throw new ClientApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status}).`);
        }
        preStream = false;
        restoreOnError = false;
        for await (const ev of readEvents(res.body)) {
          handleEvent(ev, { tmpId, attached: ready });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setRun((r) => ({ ...r, status: 'cancelled', notice: 'Stopped.' }));
        } else {
          const message = err instanceof Error ? err.message : 'The request failed.';
          setError(message);
          setRun((r) => ({ ...r, status: 'failed', error: message }));
        }
        if (preStream && restoreOnError) {
          setMessages((list) => list.filter((m) => m.id !== tmpId));
          setInput(text);
          setAttachments(ready);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStreamText('');
        setMessages((list) => list.map((m) => (m.pending ? { ...m, pending: false } : m)));
        if (convRef.current) {
          // Re-sync with the server: real ids, persisted partial replies, and feedback state.
          try {
            const res = await apiFetch<{ messages: MessageDto[] }>(`/api/conversations/${convRef.current}`);
            if (convRef.current) setMessages(res.messages.map(toView));
          } catch {
            /* keep local view */
          }
        }
      }
    },
    [attachments, handleEvent],
  );

  function stop() {
    abortRef.current?.abort();
  }

  async function changeMode(next: AgentModeId) {
    setMode(next);
    if (convRef.current) await apiFetch(`/api/conversations/${convRef.current}`, { method: 'PATCH', body: { mode: next } }).catch(() => undefined);
  }

  async function changeModel(next: string) {
    setModel(next);
    if (convRef.current) await apiFetch(`/api/conversations/${convRef.current}`, { method: 'PATCH', body: { model: next } }).catch(() => undefined);
  }

  async function editMessage(id: string, text: string) {
    const cid = convRef.current;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    if (cid && !id.startsWith('tmp-')) {
      try {
        await apiFetch(`/api/conversations/${cid}/messages/${id}`, { method: 'DELETE' });
      } catch {
        setError('Could not edit that message. Try again.');
        return;
      }
    }
    setMessages((list) => list.slice(0, idx));
    await send({ text });
  }

  async function regenerate() {
    await send({ regenerate: true });
  }

  async function feedback(id: string, rating: 1 | -1) {
    const prev = messages.find((m) => m.id === id)?.feedback ?? null;
    const next = prev === rating ? null : rating;
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, feedback: next } : m)));
    try {
      if (next === null) await apiFetch(`/api/messages/${id}/feedback`, { method: 'DELETE' });
      else await apiFetch(`/api/messages/${id}/feedback`, { method: 'PUT', body: { rating: next } });
    } catch {
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, feedback: prev } : m)));
    }
  }

  async function decide(approvalId: string, decision: 'approve' | 'deny') {
    try {
      const res = await apiFetch<{ status: string; summary?: string }>(`/api/approvals/${approvalId}`, { body: { decision } });
      setRun((r) => {
        const remaining = r.approvals.filter((a) => a.id !== approvalId);
        return {
          ...r,
          approvals: remaining,
          status: remaining.length ? 'awaiting_approval' : r.status === 'awaiting_approval' ? 'completed' : r.status,
          notice: `${res.status === 'denied' ? 'Denied.' : res.status === 'completed' ? 'Approved and completed.' : 'The action failed.'} ${res.summary ?? ''} Send a follow-up to let the agent use the result.`.trim(),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your decision.');
    }
  }

  const modeInfo = AGENT_MODES[mode];
  const modelOptions = options?.models ?? (model ? [model] : []);

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Chat">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{convId ? title : 'New chat'}</h1>
            <p className="truncate text-xs text-muted" title={modeInfo.description}>
              {modeInfo.name}
              {model ? ` · ${model}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-label="Toggle agent activity panel">
            <PanelRight className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
            {run.status === 'running' ? <Activity className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden /> : null}
          </Button>
        </header>

        <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-busy={streaming}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading conversation" />
            </div>
          ) : messages.length === 0 && !streaming ? (
            <Welcome onPick={(t) => setInput(t)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isLastAssistant={i === lastAssistantIndex}
                  disabled={streaming}
                  onRegenerate={regenerate}
                  onEdit={editMessage}
                  onFeedback={feedback}
                />
              ))}
              {streaming && streamText ? (
                <MessageBubble
                  message={{ id: 'streaming', role: 'assistant', content: streamText, attachments: [], metadata: {}, runId: null, createdAt: '', pending: true }}
                  isLastAssistant={false}
                  disabled
                  onRegenerate={() => undefined}
                  onEdit={() => undefined}
                  onFeedback={() => undefined}
                />
              ) : null}
              {streaming && !streamText ? (
                <div className="flex items-center gap-3 text-sm text-muted" role="status">
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                  </span>
                  {run.notice ?? 'Thinking…'}
                </div>
              ) : null}
              {error ? (
                <Alert>
                  {error}{' '}
                  {!streaming ? (
                    <button type="button" className="underline" onClick={regenerate}>
                      Retry
                    </button>
                  ) : null}
                </Alert>
              ) : null}
            </div>
          )}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send({ text: input })}
          onStop={stop}
          streaming={streaming}
          disabled={loading || !options}
          mode={mode}
          onModeChange={changeMode}
          models={modelOptions}
          model={model}
          onModelChange={changeModel}
          attachments={attachments}
          onAttach={(a) => setAttachments((list) => [...list, a])}
          onRemoveAttachment={(id) => setAttachments((list) => list.filter((a) => a.id !== id))}
          capabilities={{ vision: options?.capabilities?.vision ?? false }}
        />
      </section>

      <RightPanel run={run} open={panelOpen} onClose={() => setPanelOpen(false)} onDecide={decide} />
    </div>
  );
}

function mergeSources(existing: ToolSource[], incoming: ToolSource[]): ToolSource[] {
  const map = new Map<string, ToolSource>();
  for (const s of [...existing, ...incoming]) map.set(s.url, s);
  return [...map.values()];
}
