/**
 * Applies SQL migrations in lexical order. Each file runs in its own transaction and
 * is recorded in schema_migrations. Usage: `npm run migrate` (reads DATABASE_URL).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

export async function runMigrations(
  connectionString: string,
  opts: { embeddingDim?: number; dir?: string } = {},
): Promise<string[]> {
  const dir = opts.dir ?? path.join(process.cwd(), 'src/lib/database/migrations');
  const client = new Client({ connectionString });
  const applied: string[] = [];
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL mimo.embedding_dim = '${Number(opts.embeddingDim ?? 1024)}'`);
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (require.main === module || process.argv[1]?.endsWith('migrate.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  runMigrations(url, { embeddingDim: Number(process.env.MEMORY_EMBEDDING_DIM ?? 1024) })
    .then((applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
