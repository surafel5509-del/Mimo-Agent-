import 'server-only';
import { getEnv } from '@/lib/config';
import { sendMail } from './mailer';
import { issueAuthToken } from './auth-tokens';
import { findUserByEmail, type UserRow } from './users';
import { writeAudit } from './audit';

/** Sends a verification link. Returns the link only when DEV_EXPOSE_AUTH_LINKS is enabled outside production. */
export async function startEmailVerification(user: UserRow, ip?: string | null): Promise<{ devLink?: string }> {
  const env = getEnv();
  const token = await issueAuthToken(user.id, 'verify_email', 24 * 60);
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  const { delivered } = await sendMail(
    user.email,
    'Verify your MIMO AGENT email',
    `Confirm your email address by opening this link within 24 hours:\n${link}`,
  );
  await writeAudit({ userId: user.id, category: 'auth', action: 'auth.verify_email_sent', ip, metadata: { delivered } });
  return env.DEV_EXPOSE_AUTH_LINKS && env.NODE_ENV !== 'production' && !delivered ? { devLink: link } : {};
}

/**
 * Starts a password reset. Always reports success to the caller regardless of whether the
 * account exists, to prevent account enumeration.
 */
export async function startPasswordReset(email: string, ip?: string | null): Promise<{ devLink?: string }> {
  const env = getEnv();
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'active') return {};
  const token = await issueAuthToken(user.id, 'reset_password', 30);
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  const { delivered } = await sendMail(
    user.email,
    'Reset your MIMO AGENT password',
    `Reset your password within 30 minutes using this link:\n${link}\nIf you did not request this, ignore this email.`,
  );
  await writeAudit({ userId: user.id, category: 'auth', action: 'auth.password_reset_requested', ip, metadata: { delivered } });
  return env.DEV_EXPOSE_AUTH_LINKS && env.NODE_ENV !== 'production' && !delivered ? { devLink: link } : {};
}
