import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, readJson, setSessionCookie } from '@/server/auth/current';
import { findUserByUsername } from '@/server/auth/users';
import { timingSafeDummyVerify, verifyPassword } from '@/server/auth/password';
import { createSession } from '@/server/auth/sessions';
import { clearRateLimit, clientIp, rateLimit } from '@/server/auth/rate-limit';

const body = z.object({ username: z.string().max(64), password: z.string().max(256) });

export async function POST(req: Request) {
  try {
    const { username, password } = body.parse(await readJson(req));
    const ip = clientIp(req.headers);
    const userKey = `login-user:${username.toLowerCase()}`;
    if (!rateLimit(`login-ip:${ip}`, 20, 15 * 60_000) || !rateLimit(userKey, 8, 15 * 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Wait 15 minutes and try again.' }, { status: 429 });
    }
    const user = findUserByUsername(username);
    const ok = user ? await verifyPassword(user.passwordHash, password) : await timingSafeDummyVerify(password);
    if (!user || !ok || user.disabled) {
      return NextResponse.json({ error: 'Wrong username or password.' }, { status: 401 });
    }
    clearRateLimit(userKey);
    const { token } = createSession(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
