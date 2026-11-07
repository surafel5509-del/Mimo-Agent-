import { redactSecrets } from '@/lib/security/redact';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured, secret-safe logger. Every string is passed through redaction so
 * API keys, passwords, tokens and session cookies never reach stdout.
 */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const min = process.env.LOG_LEVEL && process.env.LOG_LEVEL in order ? (process.env.LOG_LEVEL as Level) : 'info';
  if (order[level] < order[min]) return;
  const line = redactSecrets(
    JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }, (_k, v) =>
      v instanceof Error ? { name: v.name, message: v.message } : v,
    ),
  );
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
