'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Badge, Button, PageHeader, Panel, Spinner } from '@/components/ui';

type Tab = 'overview' | 'users' | 'config' | 'health' | 'audit';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'config', label: 'Agents & tools' },
  { id: 'health', label: 'Health' },
  { id: 'audit', label: 'Audit log' },
];

export function AdminView({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="Administration" description="Monitor usage, manage users and control which agents and tools are enabled. Actions are recorded in the audit log." />
      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm', tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <Overview /> : null}
      {tab === 'users' ? <Users currentUserId={currentUserId} /> : null}
      {tab === 'config' ? <Config /> : null}
      {tab === 'health' ? <Health /> : null}
      {tab === 'audit' ? <Audit /> : null}
    </div>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<T>(path).then(setData).catch((e) => setError(e instanceof ClientApiError ? e.message : 'Could not load.'));
  }, [path]);
  return { data, error, setData };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad<any>('/api/admin/stats');
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Users" value={t.users} />
        <Stat label="New users (7 days)" value={t.new_users_7d} />
        <Stat label="Conversations" value={t.conversations} />
        <Stat label="Messages" value={t.messages} />
        <Stat label="Documents" value={t.documents} />
        <Stat label="Agent runs" value={t.runs} />
        <Stat label="Failed runs" value={t.failed_runs} />
        <Stat label="Pending approvals" value={t.pending_approvals} />
        <Stat label="Tokens today" value={t.tokens_today} />
        <Stat label="Prompt tokens (all time)" value={t.prompt_tokens} />
      </div>
      <Panel className="overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Usage by model</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr><th className="py-2">Model</th><th>Calls</th><th>Tokens</th><th>Failures</th></tr>
          </thead>
          <tbody>
            {data.byModel.map((m: any) => (
              <tr key={m.model} className="border-t border-line"><td className="py-2 font-mono text-xs">{m.model}</td><td>{m.calls}</td><td>{m.tokens}</td><td>{m.failures}</td></tr>
            ))}
            {data.byModel.length === 0 ? <tr><td colSpan={4} className="py-3 text-muted">No model usage recorded yet.</td></tr> : null}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Users({ currentUserId }: { currentUserId: string }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<{ users: any[] }>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => setUsers(r.users))
        .catch(() => setError('Could not load users.'));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  async function patch(id: string, body: { role?: string; status?: string }) {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body });
      setUsers((list) => (list ?? []).map((u) => (u.id === id ? { ...u, ...body } : u)));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not update the user.');
    }
  }

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" aria-label="Search users" className="h-10 w-full max-w-sm rounded-xl border border-line bg-panel-2 px-3 text-sm" />
      {error ? <Alert>{error}</Alert> : null}
      {!users && !error ? <Spinner /> : null}
      {users ? (
        <Panel className="overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr><th className="p-2">Email</th><th>Role</th><th>Status</th><th>Verified</th><th>Last login</th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === currentUserId;
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="p-2">{u.email}</td>
                    <td>
                      <select aria-label={`Role of ${u.email}`} disabled={self} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} className="h-8 rounded-lg border border-line bg-panel-2 px-2 text-xs">
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <Button size="sm" variant={u.status === 'active' ? 'secondary' : 'danger'} disabled={self} onClick={() => patch(u.id, { status: u.status === 'active' ? 'disabled' : 'active' })}>
                        {u.status}
                      </Button>
                    </td>
                    <td>{u.emailVerified ? <Badge tone="ok">yes</Badge> : <Badge>no</Badge>}</td>
                    <td className="text-xs text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </div>
  );
}

function Config() {
  const { data, error, setData } = useLoad<any>('/api/admin/config');
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  async function patch(body: Record<string, unknown>) {
    setMsg(null);
    try {
      await apiFetch('/api/admin/config', { method: 'PATCH', body });
      const fresh = await apiFetch<any>('/api/admin/config');
      setData(fresh);
      setMsg('Saved.');
    } catch (err) {
      setMsg(err instanceof ClientApiError ? err.message : 'Could not save.');
    }
  }

  return (
    <div className="space-y-6">
      {msg ? <Alert tone={msg === 'Saved.' ? 'ok' : 'danger'}>{msg}</Alert> : null}
      <Panel className="p-5">
        <h2 className="mb-3 font-semibold">Agent modes</h2>
        <ul className="divide-y divide-line">
          {data.agents.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted">{a.allowedTools.join(', ')}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={a.enabled} onChange={(e) => patch({ target: 'agent', key: a.id, patch: { enabled: e.target.checked } })} className="h-4 w-4 accent-[var(--accent)]" />
                Enabled
              </label>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-5">
        <h2 className="mb-3 font-semibold">Tools</h2>
        <ul className="divide-y divide-line">
          {data.tools.map((t: any) => (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted">{t.permission}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={t.enabled} onChange={(e) => patch({ target: 'tool', key: t.name, patch: { enabled: e.target.checked } })} className="h-4 w-4 accent-[var(--accent)]" />
                  Enabled
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={t.requiresApproval} onChange={(e) => patch({ target: 'tool', key: t.name, patch: { requiresApproval: e.target.checked } })} className="h-4 w-4 accent-[var(--accent)]" />
                  Requires approval
                </label>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Health() {
  const { data, error } = useLoad<any>('/api/admin/health');
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const caps = Object.entries(data.capabilities as Record<string, unknown>);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="space-y-2 p-5">
        <h2 className="font-semibold">System</h2>
        <p className="text-sm">Status: <Badge tone={data.status === 'ok' ? 'ok' : 'warn'}>{data.status}</Badge></p>
        <p className="text-sm">Database: {data.database.ok ? 'connected' : 'unavailable'} ({data.database.latencyMs} ms)</p>
        <p className="text-sm">Migrations applied: {data.migrationsApplied}</p>
        <p className="text-sm">Errors in the last hour: {data.system.errorsLastHour}</p>
        <p className="text-sm text-muted">Uptime {data.system.uptimeSec}s · RSS {data.system.memoryMb} MB · {data.system.nodeEnv}</p>
      </Panel>
      <Panel className="space-y-2 p-5">
        <h2 className="font-semibold">NVIDIA NIM</h2>
        <p className="text-sm">Endpoint: {data.nvidia.baseUrl}</p>
        <p className="text-sm">Status: {data.nvidia.ok ? <Badge tone="ok">reachable</Badge> : <Badge tone="warn">{data.nvidia.error ?? 'unreachable'}</Badge>}</p>
        <p className="text-sm">Chat models enabled: {data.nvidia.chatModels}</p>
      </Panel>
      <Panel className="p-5 md:col-span-2">
        <h2 className="mb-3 font-semibold">Capabilities</h2>
        <div className="flex flex-wrap gap-2">
          {caps.map(([k, v]) => (
            <Badge key={k} tone={v === true ? 'ok' : v === false ? 'neutral' : 'accent'}>
              {k}: {String(v)}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Vision and tool-calling are reported only when configured for the selected model. Nothing is assumed.</p>
      </Panel>
    </div>
  );
}

function Audit() {
  const { data, error } = useLoad<any>('/api/admin/audit');
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  return (
    <Panel className="overflow-x-auto p-2">
      <table className="w-full text-left text-xs">
        <thead className="uppercase text-muted">
          <tr><th className="p-2">Time</th><th>User</th><th>Category</th><th>Action</th><th>Target</th><th>IP</th></tr>
        </thead>
        <tbody>
          {data.entries.map((e: any) => (
            <tr key={e.id} className="border-t border-line">
              <td className="p-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.userEmail ?? '—'}</td>
              <td>{e.category}</td>
              <td className="font-mono">{e.action}</td>
              <td className="max-w-[12rem] truncate">{e.target ?? '—'}</td>
              <td>{e.ip ?? '—'}</td>
            </tr>
          ))}
          {data.entries.length === 0 ? <tr><td colSpan={6} className="p-3 text-muted">No entries.</td></tr> : null}
        </tbody>
      </table>
    </Panel>
  );
}
