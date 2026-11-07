'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiFetch, ClientApiError } from '@/lib/client/api';
import { Alert, Button, Input } from '@/components/ui';
import { Logo } from '@/components/shell/Logo';

type Mode = 'login' | 'register';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        await apiFetch('/api/auth/login', { body: { email, password } });
        const next = params.get('next');
        router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat');
        router.refresh();
      } else {
        const res = await apiFetch<{ verificationRequired: boolean; devLink?: string }>('/api/auth/register', {
          body: { email, password, displayName: displayName || undefined },
        });
        if (res.verificationRequired) {
          setNotice(`Account created. Check your email for a verification link before signing in.${res.devLink ? ` Development link: ${res.devLink}` : ''}`);
        } else {
          router.replace('/chat');
          router.refresh();
        }
      }
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-panel/90 p-7 shadow-2xl shadow-black/30 backdrop-blur">
      <Logo className="mb-6" />
      <h1 className="text-xl font-semibold">{mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}</h1>
      <p className="mt-1 text-sm text-muted">{mode === 'login' ? 'Welcome back.' : 'Start working with your AI agents in minutes.'}</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        {mode === 'register' ? (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Name (optional)</span>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={80} />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-muted">
            Password
            {mode === 'register' ? <span className="text-xs">10+ characters, letters and numbers</span> : null}
          </span>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : undefined}
          />
        </label>
        {mode === 'login' ? (
          <div className="text-right text-sm">
            <Link href="/forgot-password" className="text-accent-2 hover:underline">
              Forgot password?
            </Link>
          </div>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === 'login' ? (
          <>
            New to MIMO AGENT?{' '}
            <Link href="/register" className="text-accent-2 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-accent-2 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
