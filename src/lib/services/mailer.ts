import 'server-only';
import nodemailer from 'nodemailer';
import { getEnv } from '@/lib/config';
import { log } from '@/lib/logging/logger';

/**
 * Transactional email boundary. With SMTP_URL set, mail is delivered via SMTP.
 * Without it, delivery is NOT faked: the message is logged (links are redacted in
 * production) and the caller is told delivery is unconfigured.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<{ delivered: boolean }> {
  const env = getEnv();
  if (!env.SMTP_URL) {
    log('warn', 'mail.not_configured', { subject, to_domain: to.split('@')[1] });
    if (env.NODE_ENV !== 'production') console.info(`[dev-mail] ${subject}: ${text}`);
    return { delivered: false };
  }
  const transport = nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? 'MIMO AGENT <no-reply@localhost>', to, subject, text });
  return { delivered: true };
}
