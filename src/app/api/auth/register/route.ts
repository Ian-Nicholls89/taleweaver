import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, readJson, setSessionCookie } from '@/server/auth/current';
import { RegistrationError, registerWithInvite } from '@/server/auth/invites';
import { createSession } from '@/server/auth/sessions';
import { clientIp, rateLimit } from '@/server/auth/rate-limit';

const body = z.object({ token: z.string().max(128), username: z.string().max(64), password: z.string().max(256) });

export async function POST(req: Request) {
  try {
    if (!rateLimit(`register-ip:${clientIp(req.headers)}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
    }
    const { token, username, password } = body.parse(await readJson(req));
    const userId = await registerWithInvite(token, username.trim(), password);
    const session = createSession(userId);
    await setSessionCookie(session.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RegistrationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return errorResponse(err);
  }
}
