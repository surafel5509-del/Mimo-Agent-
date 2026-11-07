import 'server-only';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { getEnv } from '@/lib/config';

/**
 * Private object storage on the local filesystem. Objects are addressed by random keys only;
 * user filenames are never used as paths. Swap this module for S3/Supabase Storage in production.
 */
const KEY_RE = /^[a-f0-9]{48}\.(pdf|txt|csv|docx|png|jpg|jpeg)$/;

function baseDir(): string {
  return path.resolve(process.cwd(), getEnv().UPLOAD_DIR);
}

export function newStorageKey(extension: string): string {
  return `${randomBytes(24).toString('hex')}.${extension}`;
}

function resolveKey(key: string): string {
  if (!KEY_RE.test(key)) throw new Error('Invalid storage key.');
  const full = path.join(baseDir(), key.slice(0, 2), key);
  if (!full.startsWith(baseDir() + path.sep)) throw new Error('Path escape blocked.');
  return full;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, data, { mode: 0o600, flag: 'wx' });
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function deleteObject(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}
