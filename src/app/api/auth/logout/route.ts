import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearSessionCookie } from '@/server/auth/current';
import { SESSION_COOKIE, deleteSessionToken } from '@/server/auth/sessions';

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) deleteSessionToken(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
