import { webSearchConfigured } from '@/lib/tools/web-search';
import { apiRoute, jsonOk } from '@/lib/http/respond';
import { requireAdmin } from '@/lib/auth/guards';
import { query, queryOne } from '@/lib/database/pool';
import { getChatProvider } from '@/lib/ai/nvidia';
import { getEnv, getModelOptions } from '@/lib/config';
import { hasVectorSupport } from '@/lib/memory/retrieval';

export const dynamic = 'force-dynamic';

/** API and system status. Reports configuration presence only, never secret values. */
export const GET = apiRoute(async (req) => {
  await requireAdmin(req);
  const env = getEnv();
  const started = Date.now();
  let database: { ok: boolean; latencyMs: number } = { ok: false, latencyMs: 0 };
  try {
    await query('SELECT 1');
    database = { ok: true, latencyMs: Date.now() - started };
  } catch {
    database = { ok: false, latencyMs: Date.now() - started };
  }
  const migrations = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM schema_migrations`).catch(() => null);
  const nvidia = env.NVIDIA_API_KEY ? await getChatProvider().health() : { ok: false, latencyMs: 0, error: 'not_configured' };
  const recentErrors = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_logs WHERE category = 'error' AND created_at > now() - interval '1 hour'`,
  );
  return jsonOk({
    status: database.ok && nvidia.ok ? 'ok' : 'degraded',
    database,
    migrationsApplied: Number(migrations?.n ?? 0),
    nvidia: { ...nvidia, baseUrl: new URL(env.NVIDIA_BASE_URL).host, chatModels: getModelOptions().length },
    capabilities: {
      toolCallingMode: env.NVIDIA_TOOL_CALLING,
      vision: Boolean(env.NVIDIA_VISION_MODEL),
      embeddings: Boolean(env.NVIDIA_EMBEDDING_MODEL),
      pgvector: await hasVectorSupport(),
      webSearch: webSearchConfigured(),
      email: Boolean(env.SMTP_URL),
    },
    system: {
      nodeEnv: env.NODE_ENV,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      errorsLastHour: Number(recentErrors?.n ?? 0),
    },
  });
});
