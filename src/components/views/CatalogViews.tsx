'use client';

import { useEffect, useState } from 'react';
import { Bot, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/client/api';
import { Alert, Badge, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';

type AgentItem = { id: string; name: string; description: string; enabled: boolean; allowedTools: string[]; alwaysPlan: boolean };
type ToolItem = { name: string; title: string; description: string; permission: string; requiresApproval: boolean; enabled: boolean; configured: boolean; modes: string[] };

export function AgentsView() {
  const [agents, setAgents] = useState<AgentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ agents: AgentItem[] }>('/api/agents').then((r) => setAgents(r.agents)).catch(() => setError('Could not load agents.'));
  }, []);
  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="AI Agents" description="Each agent mode has its own instructions and tool permissions. Choose a mode in the chat composer. Disabled modes are hidden from the composer by an administrator." />
      {error ? <Alert>{error}</Alert> : null}
      {!agents && !error ? <Spinner /> : null}
      {agents && agents.length === 0 ? <EmptyState icon={<Bot className="h-8 w-8" />} title="No agents available" /> : null}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents?.map((a) => (
          <li key={a.id}>
            <Panel className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{a.name}</h2>
                <Badge tone={a.enabled ? 'ok' : 'neutral'}>{a.enabled ? 'enabled' : 'disabled'}</Badge>
              </div>
              <p className="text-sm text-muted">{a.description}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {a.alwaysPlan ? <Badge tone="accent">plans first</Badge> : null}
                {a.allowedTools.map((t) => (
                  <Badge key={t}>{t.replace(/_/g, ' ')}</Badge>
                ))}
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToolsView() {
  const [tools, setTools] = useState<ToolItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ tools: ToolItem[] }>('/api/tools').then((r) => setTools(r.tools)).catch(() => setError('Could not load tools.'));
  }, []);
  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="Explore Tools" description="Tools the agents can use. Each call is checked against the agent mode, your permissions and server policy. Sensitive actions need your approval first." />
      {error ? <Alert>{error}</Alert> : null}
      {!tools && !error ? <Spinner /> : null}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools?.map((t) => (
          <li key={t.name}>
            <Panel className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{t.title}</h2>
                  <p className="font-mono text-[11px] text-muted">{t.name}</p>
                </div>
              </div>
              <p className="text-sm text-muted">{t.description}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                <Badge tone={t.permission === 'sensitive' ? 'warn' : 'neutral'}>{t.permission}</Badge>
                {t.requiresApproval ? <Badge tone="warn">needs approval</Badge> : null}
                {!t.enabled ? <Badge tone="danger">disabled</Badge> : null}
                {!t.configured ? <Badge tone="warn">not configured</Badge> : null}
              </div>
              {t.modes.length ? <p className="text-xs text-muted">Modes: {t.modes.join(', ')}</p> : null}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
