import { describe, expect, it } from 'vitest';
import { redactSecrets } from '@/lib/security/redact';

describe('redactSecrets', () => {
  it('removes NVIDIA API keys', () => {
    const out = redactSecrets('key=nvapi-abcdefghijklmnopqrstuvwxyz123456 done');
    expect(out).not.toContain('nvapi-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('removes bearer tokens and database URLs with credentials', () => {
    const out = redactSecrets('Authorization: Bearer abc.def.ghi123456 and postgres://user:hunter2@db.internal:5432/app');
    expect(out).not.toContain('abc.def.ghi123456');
    expect(out).not.toContain('hunter2');
  });

  it('removes session cookie values', () => {
    const out = redactSecrets('cookie: mimo_session=SUPERSECRETVALUE123456789');
    expect(out).not.toContain('SUPERSECRETVALUE123456789');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactSecrets('Hello, the total is 42.')).toBe('Hello, the total is 42.');
  });
});
