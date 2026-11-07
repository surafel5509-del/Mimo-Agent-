import { afterAll } from 'vitest';

// Tests never call NVIDIA or the public internet. Real credentials in the developer's shell are ignored.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= 'postgres://postgres@localhost:5432/mimo_test';
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
process.env.NVIDIA_API_KEY = '';
process.env.WEB_SEARCH_PROVIDER = 'none';
process.env.ADMIN_EMAILS = '';
process.env.UPLOAD_DIR = '/tmp/mimo-test-uploads';
process.env.LOG_LEVEL = 'error';

afterAll(async () => {
  // Close the shared pool so vitest workers exit cleanly.
  const pool = (globalThis as { __mimoPool?: { end: () => Promise<void> } }).__mimoPool;
  if (pool) await pool.end().catch(() => undefined);
});
