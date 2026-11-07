'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Bot, Check, Copy, Pencil, RotateCcw, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { Markdown } from './Markdown';
import type { MessageView } from './types';
import { en } from '@/lib/i18n/en';
import { Button, Textarea } from '@/components/ui';

export function MessageBubble(props: {
  message: MessageView;
  isLastAssistant: boolean;
  disabled: boolean;
  onRegenerate: () => void;
  onEdit: (id: string, text: string) => void;
  onFeedback: (id: string, rating: 1 | -1) => void;
}) {
  const { message: m } = props;
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);

  async function copy() {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (m.role === 'tool') {
    return (
      <div className="mx-auto flex max-w-3xl items-start gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm text-muted animate-fade-up">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{m.content}</span>
      </div>
    );
  }

  if (m.role === 'user') {
    return (
      <div className="group flex justify-end animate-fade-up">
        <div className="max-w-[85%] sm:max-w-[75%]">
          {m.attachments.length ? (
            <div className="mb-1 flex flex-wrap justify-end gap-1">
              {m.attachments.map((a) => (
                <span key={a.id} className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-xs text-muted">
                  📎 {a.name}
                </span>
              ))}
            </div>
          ) : null}
          {editing ? (
            <div className="space-y-2">
              <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(m.content); }}>
                  {en.chat.cancel}
                </Button>
                <Button size="sm" variant="primary" disabled={!draft.trim() || props.disabled} onClick={() => { setEditing(false); props.onEdit(m.id, draft.trim()); }}>
                  {en.chat.save}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent/90 px-4 py-2.5 text-[0.95rem] text-white shadow-sm">{m.content}</div>
              <div className="mt-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" onClick={() => setEditing(true)} disabled={props.disabled || m.pending} className="rounded-md p-1 text-muted hover:text-fg disabled:opacity-40" aria-label={en.chat.edit} title={en.chat.edit}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const meta = m.metadata;
  const sources = Array.isArray(meta.sources) ? (meta.sources as { title: string; url: string; kind: string }[]) : [];
  const tools = Array.isArray(meta.toolsUsed) ? (meta.toolsUsed as string[]) : [];
  const artifacts = Array.isArray(meta.artifacts) ? (meta.artifacts as { title: string; svg: string }[]) : [];
  const stopped = Boolean(meta.stopped);

  return (
    <div className="group flex gap-3 animate-fade-up">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white" aria-hidden>
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-medium text-fg">MIMO AGENT</span>
          {tools.map((t) => (
            <span key={t} className="rounded-full bg-panel-3 px-2 py-0.5">
              {t.replace(/_/g, ' ')}
            </span>
          ))}
          {stopped ? <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">stopped</span> : null}
        </div>
        <div className="mt-1.5">
          <Markdown text={m.content || (m.pending ? '' : '_(empty response)_')} />
        </div>
        {artifacts.map((a, i) => (
          // SVG charts are rendered as images, which cannot execute scripts.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} alt={a.title} className="mt-3 w-full max-w-xl rounded-xl border border-line" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg)}`} />
        ))}
        {sources.length ? (
          <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3 text-xs">
            <p className="mb-1 font-medium text-muted">Sourced from</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              {sources.map((s) => (
                <li key={s.url}>
                  {s.kind === 'web' ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-2 hover:underline">
                      {s.title}
                    </a>
                  ) : (
                    <span>{s.title} (your document)</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className={clsx('mt-2 flex items-center gap-1 transition', 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100')}>
          <IconBtn label={copied ? en.chat.copied : en.chat.copy} onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </IconBtn>
          {props.isLastAssistant ? (
            <IconBtn label={en.chat.regenerate} onClick={props.onRegenerate} disabled={props.disabled}>
              <RotateCcw className="h-3.5 w-3.5" />
            </IconBtn>
          ) : null}
          <IconBtn label="Helpful" onClick={() => props.onFeedback(m.id, 1)} active={m.feedback === 1}>
            <ThumbsUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Not helpful" onClick={() => props.onFeedback(m.id, -1)} active={m.feedback === -1}>
            <ThumbsDown className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children, disabled, active }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx('rounded-md p-1.5 text-muted hover:bg-panel-3 hover:text-fg disabled:opacity-40', active && 'text-accent')}
    >
      {children}
    </button>
  );
}
