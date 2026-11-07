import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { getEnv, requireDatabaseUrl } from '@/lib/config';

declare global {
  // eslint-disable-next-line no-var
  var __mimoPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__mimoPool) {
    const env = getEnv();
    globalThis.__mimoPool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: env.NODE_ENV === 'production' ? 10 : 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    });
    globalThis.__mimoPool.on('error', () => {
      // Idle client errors must not crash the process; queries surface their own errors.
    });
  }
  return globalThis.__mimoPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction. Rolls back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (globalThis.__mimoPool) {
    await globalThis.__mimoPool.end();
    globalThis.__mimoPool = undefined;
  }
}
