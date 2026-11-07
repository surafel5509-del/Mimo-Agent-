import { query } from '@/lib/database/pool';
import { jsonOk, apiRoute } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';

/** Liveness and database readiness. Returns no secrets or configuration details. */
export const GET = apiRoute(async () => {
  let db: 'ok' | 'down' = 'ok';
  try {
    await query('SELECT 1');
  } catch {
    db = 'down';
  }
  const status = db === 'ok' ? 'ok' : 'degraded';
  return jsonOk({ status, database: db, time: new Date().toISOString() }, { status: db === 'ok' ? 200 : 503 });
});
