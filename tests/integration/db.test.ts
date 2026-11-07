import { beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/database/pool';
import { runMigrations } from '@/lib/database/migrate';
import { ensureDb } from './helpers';
import { getEnv } from '@/lib/config';

describe('database schema', () => {
  beforeAll(ensureDb);

  it('records both migrations', async () => {
    const rows = await query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual(['001_core.sql', '002_pgvector.sql']);
  });

  it('is idempotent when re-run', async () => {
    const applied = await runMigrations(getEnv().TEST_DATABASE_URL!, { embeddingDim: 1024 });
    expect(applied).toEqual([]);
  });

  it('has the core tables', async () => {
    const rows = await query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
    const names = new Set(rows.map((r) => r.tablename));
    for (const t of ['users', 'sessions', 'conversations', 'messages', 'documents', 'document_chunks', 'memories', 'agent_runs', 'agent_steps', 'tool_approvals', 'audit_logs', 'usage_records']) {
      expect(names.has(t), t).toBe(true);
    }
  });

  it('enables pgvector and stores embeddings', async () => {
    const ext = await query<{ extname: string }>(`SELECT extname FROM pg_extension WHERE extname='vector'`);
    expect(ext.length).toBe(1);
    const col = await query<{ n: string }>(`SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name='memories' AND column_name='embedding'`);
    expect(col[0].n).toBe('1');
  });

  it('enforces that sessions reference a real user', async () => {
    await expect(
      query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ('00000000-0000-0000-0000-000000000000', 'x', now() + interval '1 day')`),
    ).rejects.toThrow();
  });
});
