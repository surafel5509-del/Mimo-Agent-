'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Button, Input, PageHeader, Panel, Spinner } from '@/components/ui';
import { AGENT_MODES, type AgentModeId } from '@/lib/agents/modes';

type Prefs = { theme: 'dark' | 'light' | 'system'; timezone: string; defaultModel: string; defaultMode: AgentModeId; memoryEnabled: boolean; useHistory: boolean };
type Data = {
  profile: { displayName: string; locale: 'en'; preferences: Prefs };
  email: string;
  role: string;
  options: { models: string[]; modes: AgentModeId[] };
  capabilities: { webSearch: boolean; vision: boolean; semanticMemory: boolean };
};

export function SettingsView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    apiFetch<Data>('/api/settings').then(setData).catch(() => setError('Could not load settings.'));
  }, []);

  if (!data) return <div className="flex-1 p-6">{error ? <Alert>{error}</Alert> : <Spinner />}</div>;
  const prefs = data.profile.preferences;

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setData((d) => (d ? { ...d, profile: { ...d.profile, preferences: { ...d.profile.preferences, [key]: value } } } : d));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch<{ profile: Data['profile'] }>('/api/settings', {
        method: 'PATCH',
        body: { displayName: data!.profile.displayName, locale: 'en', preferences: prefs },
      });
      setData((d) => (d ? { ...d, profile: res.profile } : d));
      setNotice('Settings saved.');
      document.documentElement.classList.toggle('light', prefs.theme === 'light');
      document.cookie = `mimo_theme=${prefs.theme === 'light' ? 'light' : 'dark'}; path=/; max-age=31536000; samesite=lax`;
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      await apiFetch('/api/settings/password', { body: pw });
      setPw({ currentPassword: '', newPassword: '' });
      setPwMsg({ tone: 'ok', text: 'Password updated. Other sessions were signed out.' });
    } catch (err) {
      setPwMsg({ tone: 'danger', text: err instanceof ClientApiError ? err.message : 'Could not change password.' });
    }
  }

  const field = 'h-10 w-full rounded-xl border border-line bg-panel-2 px-3 text-sm';
  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <PageHeader title="Settings" description={`Signed in as ${data.email} (${data.role}).`} />
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-4 p-5">
          <h2 className="font-semibold">Profile & experience</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Display name</span>
            <Input value={data.profile.displayName} maxLength={80} onChange={(e) => setData({ ...data, profile: { ...data.profile, displayName: e.target.value } })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Default model</span>
            <select className={field} value={prefs.defaultModel} onChange={(e) => setPref('defaultModel', e.target.value)}>
              {data.options.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Default agent mode</span>
            <select className={field} value={prefs.defaultMode} onChange={(e) => setPref('defaultMode', e.target.value as AgentModeId)}>
              {data.options.modes.map((m) => <option key={m} value={m}>{AGENT_MODES[m].name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Timezone (used for dates and times)</span>
            <Input value={prefs.timezone} onChange={(e) => setPref('timezone', e.target.value)} maxLength={64} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Theme</span>
            <select className={field} value={prefs.theme} onChange={(e) => setPref('theme', e.target.value as Prefs['theme'])}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Language</span>
            <select className={field} value="en" disabled aria-describedby="lang-help">
              <option value="en">English</option>
              <option value="am" disabled>Amharic (coming soon)</option>
            </select>
            <span id="lang-help" className="mt-1 block text-xs text-muted">The interface is localisation-ready. Amharic translations are planned.</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={prefs.memoryEnabled} onChange={(e) => setPref('memoryEnabled', e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Remember preferences and facts across chats
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={prefs.useHistory} onChange={(e) => setPref('useHistory', e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Use earlier messages in the same chat as context
          </label>
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted">
              Web search: {data.capabilities.webSearch ? 'on' : 'off'} · Vision: {data.capabilities.vision ? 'on' : 'off'} · Semantic memory: {data.capabilities.semanticMemory ? 'on' : 'off'}
            </p>
            <Button type="submit" variant="primary" loading={saving}>Save settings</Button>
          </div>
        </Panel>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold">Change password</h2>
          <form onSubmit={changePassword} className="space-y-3">
            <Input type="password" placeholder="Current password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} aria-label="Current password" />
            <Input type="password" placeholder="New password (10+ characters)" autoComplete="new-password" required minLength={10} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} aria-label="New password" />
            {pwMsg ? <Alert tone={pwMsg.tone === 'ok' ? 'ok' : 'danger'}>{pwMsg.text}</Alert> : null}
            <Button type="submit" variant="secondary">Update password</Button>
          </form>
        </Panel>
        <Panel className="space-y-3 p-5">
          <h2 className="font-semibold">Your data</h2>
          <p className="text-sm text-muted">Download a JSON export of your chats, documents metadata, memories, notes and tasks. Password hashes and session data are never included.</p>
          <a href="/api/account/export" className="inline-flex h-10 items-center rounded-xl border border-line bg-panel-3 px-4 text-sm hover:bg-line">Export my data</a>
        </Panel>
      </div>
    </div>
  );
}
