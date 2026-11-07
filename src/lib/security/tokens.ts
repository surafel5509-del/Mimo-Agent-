import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Generates an URL-safe random token (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only SHA-256 digests of tokens are stored, never the token itself. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
