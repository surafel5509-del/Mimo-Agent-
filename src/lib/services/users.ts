import { query, queryOne, withTransaction } from '@/lib/database/pool';
import { getAdminEmails } from '@/lib/config';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type PublicUser = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: string;
  emailVerified: boolean;
  createdAt: string;
};

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    emailVerified: Boolean(u.email_verified_at),
    createdAt: new Date(u.created_at).toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE lower(email) = $1`, [normalizeEmail(email)]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
}

export async function countUsers(): Promise<number> {
  const row = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM users`);
  return Number(row?.n ?? 0);
}

/**
 * Creates a user and its profile. The first user ever, or any address listed in ADMIN_EMAILS,
 * receives the admin role.
 */
export async function createUser(input: {
  email: string;
  passwordHash: string;
  displayName?: string;
  emailVerified?: boolean;
}): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  const isBootstrapAdmin = getAdminEmails().includes(email);
  return withTransaction(async (client) => {
    await client.query(`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const existing = await client.query(`SELECT 1 FROM users LIMIT 1`);
    const anyUsers = (existing.rowCount ?? 0) > 0;
    const role = isBootstrapAdmin || !anyUsers ? 'admin' : 'user';
    const res = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, role, email_verified_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [email, input.passwordHash, role, input.emailVerified ? new Date() : null],
    );
    const user = res.rows[0];
    await client.query(`INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, [
      user.id,
      input.displayName ?? '',
    ]);
    return user;
  });
}

export async function touchLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`, [
    userId,
  ]);
}

export async function setPasswordHash(userId: string, hash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, hash]);
}
