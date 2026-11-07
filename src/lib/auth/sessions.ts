import { query, queryOne } from '@/lib/database/pool';
import { getEnv } from '@/lib/config';
import { generateToken, hashToken } from '@/lib/security/tokens';
import type { UserRow } from '@/lib/services/users';

export type SessionUser = UserRow & { sessionId: string };

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const ttlMs = getEnv().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), meta.userAgent?.slice(0, 300) ?? null, meta.ip?.slice(0, 64) ?? null, expiresAt],
  );
  return { token, expiresAt };
}

/** Resolves a raw session token to an active user. Expired or disabled sessions resolve to null. */
export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await queryOne<UserRow & { session_id: string }>(
    `SELECT u.*, s.id AS session_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [hashToken(token)],
  );
  if (!row) return null;
  // Sliding refresh, throttled to avoid a write per request.
  await query(
    `UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '10 minutes'`,
    [row.session_id],
  );
  const { session_id, ...user } = row;
  return { ...(user as UserRow), sessionId: session_id };
}

export async function revokeSession(token: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2)`, [
    userId,
    exceptSessionId ?? null,
  ]);
}
