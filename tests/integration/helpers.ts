import { runMigrations } from '@/lib/database/migrate';
import { query } from '@/lib/database/pool';
import { getEnv } from '@/lib/config';
import { hashPassword } from '@/lib/security/passwords';
import { createUser } from '@/lib/services/users';

let migrated = false;

/** Applies migrations once per test worker against the isolated test database. */
export async function ensureDb(): Promise<void> {
  if (migrated) return;
  const url = getEnv().TEST_DATABASE_URL ?? getEnv().DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests.');
  await runMigrations(url, { embeddingDim: getEnv().MEMORY_EMBEDDING_DIM });
  migrated = true;
}

/** Empties every application table (keeps schema_migrations). */
export async function resetDb(): Promise<void> {
  const tables = await query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (tables.length) {
    await query(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

export async function makeUser(email: string, password = 'Password12345', verified = true) {
  return createUser({ email, passwordHash: await hashPassword(password), emailVerified: verified });
}
