import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './cookies';
import { getSessionUser, type SessionUser } from './sessions';

/** Resolves the current user inside a server component / layout. */
export async function getServerUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUser(store.get(SESSION_COOKIE)?.value);
}
