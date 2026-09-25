import 'server-only';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SESSION_COOKIE, cookieIsSecure, validateSessionToken, type SessionUser } from './sessions';

// The server is the authority on expiry (sliding 30 days); the cookie itself
// just lives as long as browsers allow.
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return validateSessionToken(jar.get(SESSION_COOKIE)?.value)?.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') notFound();
  return user;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieIsSecure(),
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler<C> = (ctx: { req: Request; user: SessionUser; params: C }) => Promise<Response | unknown>;

/**
 * Wraps an API route: requires a signed-in user (or admin), turns thrown
 * HttpErrors and validation errors into JSON responses, and JSON-encodes plain
 * return values.
 */
export function api<C = Record<string, string>>(
  handler: Handler<C>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: { params: Promise<C> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, 'Not signed in');
      if (opts.admin && user.role !== 'admin') throw new HttpError(403, 'Admins only');
      const result = await handler({ req, user, params: ctx?.params ? await ctx.params : ({} as C) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  }
  console.error('[taleweaver]', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Expected a JSON body');
  }
}
