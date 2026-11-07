'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './index';

/** Two-step destructive action: the first click asks for confirmation inline. */
export function ConfirmButton({
  onConfirm,
  label,
  message,
  children,
  className,
}: {
  onConfirm: () => void | Promise<void>;
  label: string;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (asking) {
    return (
      <span role="group" aria-label={message} className="flex items-center gap-1">
        <Button size="sm" variant="danger" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={className ?? 'rounded-md p-1.5 text-muted hover:text-danger'} onClick={() => setAsking(true)}>
      {children}
    </button>
  );
}
