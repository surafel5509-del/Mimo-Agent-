import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/database/pool';
import { createSession, getSessionUser, revokeSession, revokeAllSessions } from '@/lib/auth/sessions';
import { verifyPassword, hashPassword } from '@/lib/security/passwords';
import { issueAuthToken, consumeAuthToken } from '@/lib/services/auth-tokens';
import { findUserByEmail, markEmailVerified } from '@/lib/services/users';
import { ensureDb, makeUser, resetDb } from './helpers';

describe('authentication', () => {
  beforeAll(ensureDb);
  beforeEach(resetDb);

  it('stores only a hash of the session token', async () => {
    const user = await makeUser('session@example.com');
    const { token } = await createSession(user.id, { userAgent: 'vitest', ip: '127.0.0.1' });
    const rows = await query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id=$1', [user.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).not.toContain(token);
  });

  it('resolves a valid session and rejects malformed tokens', async () => {
    const user = await makeUser('valid@example.com');
    const { token } = await createSession(user.id, {});
    const resolved = await getSessionUser(token);
    expect(resolved?.id).toBe(user.id);
    expect(await getSessionUser('short')).toBeNull();
    expect(await getSessionUser(undefined)).toBeNull();
    expect(await getSessionUser('x'.repeat(40))).toBeNull();
  });

  it('revoking a session makes it unusable', async () => {
    const user = await makeUser('logout@example.com');
    const { token } = await createSession(user.id, {});
    await revokeSession(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it('revoking all sessions signs out every device', async () => {
    const user = await makeUser('everywhere@example.com');
    const a = await createSession(user.id, {});
    const b = await createSession(user.id, {});
    await revokeAllSessions(user.id);
    expect(await getSessionUser(a.token)).toBeNull();
    expect(await getSessionUser(b.token)).toBeNull();
  });

  it('password reset tokens are single-use and purpose-bound', async () => {
    const user = await makeUser('reset@example.com');
    const token = await issueAuthToken(user.id, 'reset_password', 30);
    expect(await consumeAuthToken(token, 'verify_email')).toBeNull();
    expect(await consumeAuthToken(token, 'reset_password')).toBe(user.id);
    expect(await consumeAuthToken(token, 'reset_password')).toBeNull();
  });

  it('expired tokens are rejected', async () => {
    const user = await makeUser('expired@example.com');
    const token = await issueAuthToken(user.id, 'verify_email', -1);
    expect(await consumeAuthToken(token, 'verify_email')).toBeNull();
  });

  it('email lookup is case-insensitive', async () => {
    await makeUser('Mixed.Case@Example.com');
    expect((await findUserByEmail('mixed.case@example.com'))?.email).toBe('mixed.case@example.com');
  });

  it('marks an email as verified', async () => {
    const user = await makeUser('unverified@example.com', 'Password12345', false);
    await markEmailVerified(user.id);
    const row = await findUserByEmail('unverified@example.com');
    expect(row?.email_verified_at).toBeTruthy();
  });

  it('hashed passwords verify and never equal the plain text', async () => {
    const h = await hashPassword('Password12345');
    expect(h).not.toContain('Password12345');
    expect(await verifyPassword('Password12345', h)).toBe(true);
  });
});
