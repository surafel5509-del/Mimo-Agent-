'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Button, Input } from '@/components/ui';
import { Logo } from '@/components/shell/Logo';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line bg-panel/90 p-7 shadow-2xl shadow-black/30">
      <Logo className="mb-6" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-5">{children}</div>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-accent-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<{ message: string; devLink?: string }>('/api/auth/forgot-password', { body: { email } });
      setMsg(res.message);
      setDevLink(res.devLink ?? null);
    } catch (error) {
      setErr(error instanceof ClientApiError ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="Reset your password">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        {err ? <Alert>{err}</Alert> : null}
        {msg ? <Alert tone="ok">{msg}</Alert> : null}
        {devLink ? (
          <p className="break-all text-xs text-muted">
            Development link: <a className="text-accent-2" href={devLink}>{devLink}</a>
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Send reset link
        </Button>
      </form>
    </Shell>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiFetch('/api/auth/reset-password', { body: { token, password } });
      setDone(true);
    } catch (error) {
      setErr(error instanceof ClientApiError ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="Choose a new password">
      {done ? (
        <Alert tone="ok">
          Your password was updated. <Link className="underline" href="/login">Sign in</Link>.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Input type="password" required minLength={10} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-label="New password" />
          {!token ? <Alert>The reset link is missing its token. Request a new link.</Alert> : null}
          {err ? <Alert>{err}</Alert> : null}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!token}>
            Update password
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function VerifyEmailPanel() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!token) {
      setState('error');
      setErr('The verification link is missing its token.');
      return;
    }
    apiFetch('/api/auth/verify-email', { body: { token } })
      .then(() => setState('ok'))
      .catch((error) => {
        setState('error');
        setErr(error instanceof ClientApiError ? error.message : 'Verification failed.');
      });
  }, [token]);
  return (
    <Shell title="Email verification">
      {state === 'pending' ? <p className="text-sm text-muted">Verifying…</p> : null}
      {state === 'ok' ? <Alert tone="ok">Your email is verified. You can now sign in.</Alert> : null}
      {state === 'error' ? <Alert>{err}</Alert> : null}
    </Shell>
  );
}
