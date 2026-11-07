import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/chat', '/documents', '/memory', '/agents', '/tools', '/projects', '/settings', '/help', '/admin'];
const AUTH_PAGES = ['/login', '/register'];

/**
 * Fast route gate based on cookie presence. This is NOT the authorisation boundary: every API
 * route and server page re-validates the session and role on the server.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get('mimo_session')?.value);
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (AUTH_PAGES.includes(pathname) && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/chat';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
