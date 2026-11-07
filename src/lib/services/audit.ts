import { query } from '@/lib/database/pool';
import { log } from '@/lib/logging/logger';
import { redactSecrets } from '@/lib/security/redact';

export type AuditCategory = 'auth' | 'data' | 'admin' | 'security' | 'agent' | 'error' | 'system';

/** Writes an audit record. Never throws: auditing must not break the request path. */
export async function writeAudit(entry: {
  userId?: string | null;
  category: AuditCategory;
  action: string;
  target?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const metadata = JSON.parse(redactSecrets(JSON.stringify(entry.metadata ?? {})));
    await query(
      `INSERT INTO audit_logs (user_id, category, action, target, ip, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.userId ?? null, entry.category, entry.action, entry.target ?? null, entry.ip ?? null, metadata],
    );
  } catch (err) {
    log('warn', 'audit.write_failed', { action: entry.action, message: (err as Error).message });
  }
}
