'use client';

import { CheckCircle2, Circle, CircleDot, Brain, FileText, Globe, Loader2, ShieldAlert, XCircle, Wrench, X, Activity } from 'lucide-react';
import clsx from 'clsx';
import type { RunView } from './types';
import { en } from '@/lib/i18n/en';
import { Badge, Button } from '@/components/ui';

export function RightPanel({
  run,
  open,
  onClose,
  onDecide,
}: {
  run: RunView;
  open: boolean;
  onClose: () => void;
  onDecide: (approvalId: string, decision: 'approve' | 'deny') => void;
}) {
  const statusTone = run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'danger' : run.status === 'awaiting_approval' || run.status === 'step_limit' ? 'warn' : run.status === 'running' ? 'accent' : 'neutral';
  return (
    <aside
      aria-label={en.panel.activity}
      className={clsx(
        'fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col border-l border-line bg-panel transition-transform xl:static xl:z-auto xl:translate-x-0',
        open ? 'translate-x-0' : 'translate-x-full xl:hidden',
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-accent" /> {en.panel.activity}
        </h2>
        <div className="flex items-center gap-2">
          <Badge tone={statusTone}>{run.status === 'idle' ? 'idle' : run.status.replace(/_/g, ' ')}</Badge>
          <button type="button" onClick={onClose} aria-label="Close activity panel" className="rounded-lg p-1.5 text-muted hover:bg-panel-3 xl:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4 text-sm">
        {run.error ? <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger">{run.error}</p> : null}
        {run.notice ? <p className="text-xs text-muted" role="status">{run.notice}</p> : null}

        {run.approvals.length ? (
          <Section title={en.panel.approvals} icon={<ShieldAlert className="h-4 w-4 text-warn" />}>
            {run.approvals.map((a) => (
              <div key={a.id} className="rounded-xl border border-warn/40 bg-warn/5 p-3">
                <p className="font-medium">{a.summary}</p>
                <p className="mt-1 text-xs text-muted">{a.consequences}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => onDecide(a.id, 'approve')}>{en.panel.approve}</Button>
                  <Button size="sm" variant="secondary" onClick={() => onDecide(a.id, 'deny')}>{en.panel.deny}</Button>
                </div>
              </div>
            ))}
          </Section>
        ) : null}

        <Section title={en.panel.plan} icon={<CircleDot className="h-4 w-4 text-accent-2" />}>
          {run.plan ? (
            <>
              <ol className="space-y-2">
                {run.plan.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {s.status === 'done' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : s.status === 'running' ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                    <span className={s.status === 'done' ? 'text-muted line-through decoration-muted/50' : ''}>{s.title}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted">
                {run.plan.filter((s) => s.status === 'done').length} of {run.plan.length} complete
              </p>
            </>
          ) : (
            <Empty>Complex requests get a step-by-step plan here.</Empty>
          )}
        </Section>

        <Section title={en.panel.tools} icon={<Wrench className="h-4 w-4 text-muted" />}>
          {run.tools.length ? (
            <ul className="space-y-2">
              {run.tools.map((t) => (
                <li key={t.callId} className="flex items-start gap-2 rounded-lg bg-panel-2 px-2.5 py-2">
                  {t.status === 'running' ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" /> : t.status === 'ok' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />}
                  <div className="min-w-0">
                    <p className="font-medium">{t.name.replace(/_/g, ' ')}</p>
                    <p className="truncate text-xs text-muted" title={t.summary}>{t.summary}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Tools the agent uses will appear here.</Empty>
          )}
        </Section>

        <Section title={en.panel.sources} icon={<Globe className="h-4 w-4 text-muted" />}>
          {run.sources.length ? (
            <ul className="space-y-1.5">
              {run.sources.map((s) => (
                <li key={s.url} className="truncate">
                  {s.kind === 'web' ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-2 hover:underline">{s.title}</a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted"><FileText className="h-3.5 w-3.5" />{s.title}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Web and document sources are listed here, separate from the model's own analysis.</Empty>
          )}
        </Section>

        <Section title={en.panel.memory} icon={<Brain className="h-4 w-4 text-muted" />}>
          {run.memory.length ? (
            <ul className="space-y-2">
              {run.memory.map((r) => (
                <li key={`${r.kind}-${r.id}-${r.title}`} className="rounded-lg bg-panel-2 px-2.5 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted">{r.kind}</p>
                  <p className="font-medium">{r.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{r.snippet}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Relevant memories, notes and document excerpts used for this answer appear here.</Empty>
          )}
        </Section>
        {run.protocol ? <p className="text-[11px] text-muted">Tool protocol: {run.protocol === 'native' ? 'native function calling' : 'compatible JSON protocol'}{run.model ? ` · ${run.model}` : ''}</p> : null}
      </div>
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>;
}
