import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'tw_session';
const PUBLIC_PATHS = ['/login', '/register', '/api/auth/login', '/api/auth/register'];

function allowedHosts(req: NextRequest) {
  const hosts = new Set<string>();
  const host = req.headers.get('host');
  if (host) hosts.add(host);
  const fwd = req.headers.get('x-forwarded-host');
  if (fwd) hosts.add(fwd.split(',')[0]!.trim());
  if (process.env.PUBLIC_URL) {
    try {
      hosts.add(new URL(process.env.PUBLIC_URL).host);
    } catch {}
  }
  return hosts;
}

/**
 * Two cheap gates before any route runs:
 * 1. Requests that change data must come from our own origin (CSRF defence on
 *    top of SameSite cookies).
 * 2. Pages other than login/register need a session cookie; the pages and API
 *    routes still validate the session properly themselves.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    let ok = false;
    if (origin) {
      try {
        ok = allowedHosts(req).has(new URL(origin).host);
      } catch {}
    }
    if (!ok) return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isPublic && !req.cookies.get(SESSION_COOKIE)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|audio/|icon.svg|robots.txt).*)'],
};
