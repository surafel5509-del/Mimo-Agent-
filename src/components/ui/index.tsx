'use client';

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'icon' }>(
  function Button({ variant = 'secondary', loading, size = 'md', className, children, disabled, ...rest }, ref) {
    const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:pointer-events-none select-none';
    const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', icon: 'h-9 w-9' } as const;
    const variants: Record<BtnVariant, string> = {
      primary: 'bg-accent text-white hover:bg-accent-strong shadow-sm shadow-accent/20',
      secondary: 'bg-panel-3 text-fg hover:bg-line border border-line',
      ghost: 'text-muted hover:text-fg hover:bg-panel-3',
      danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
    };
    return (
      <button ref={ref} className={clsx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={clsx('h-10 w-full rounded-xl border border-line bg-panel-2 px-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none', className)}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx('w-full rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none', className)}
      {...rest}
    />
  );
});

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('rounded-2xl border border-line bg-panel', className)}>{children}</section>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' }) {
  const tones = {
    neutral: 'bg-panel-3 text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent/15 text-accent',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line p-8 text-center">
      <div className="text-muted">{icon}</div>
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'ok' | 'warn'; children: ReactNode }) {
  const tones = { danger: 'border-danger/40 bg-danger/10 text-danger', ok: 'border-ok/40 bg-ok/10 text-ok', warn: 'border-warn/40 bg-warn/10 text-warn' };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('rounded-xl border px-3 py-2 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
