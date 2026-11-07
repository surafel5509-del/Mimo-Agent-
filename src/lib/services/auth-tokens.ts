import { query, queryOne } from '@/lib/database/pool';
import { generateToken, hashToken } from '@/lib/security/tokens';

export type AuthTokenPurpose = 'verify_email' | 'reset_password';

/** Issues a single-use token (hashed at rest). Returns the raw token for delivery only. */
export async function issueAuthToken(userId: string, purpose: AuthTokenPurpose, ttlMinutes: number): Promise<string> {
  // Invalidate previous outstanding tokens for this purpose.
  await query(`UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [
    userId,
    purpose,
  ]);
  const token = generateToken();
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, purpose, hashToken(token), String(ttlMinutes)],
  );
  return token;
}

/** Atomically consumes a token. Returns the user id, or null when invalid, expired or used. */
export async function consumeAuthToken(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(token), purpose],
  );
  return row?.user_id ?? null;
}
