import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { api, HttpError, readJson, setSessionCookie } from '@/server/auth/current';
import { getDb, schema } from '@/server/db';
import { verifyPassword } from '@/server/auth/password';
import { setPassword } from '@/server/auth/users';
import { createSession } from '@/server/auth/sessions';

const body = z.object({ current: z.string().max(256), next: z.string().max(256) });

export const POST = api(async ({ req, user }) => {
  const { current, next } = body.parse(await readJson(req));
  const row = getDb().select().from(schema.users).where(eq(schema.users.id, user.id)).get()!;
  if (!(await verifyPassword(row.passwordHash, current))) throw new HttpError(400, 'Your current password is wrong.');
  try {
    await setPassword(user.id, next); // signs out every session…
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const { token } = createSession(user.id); // …then keeps this one signed in
  await setSessionCookie(token);
  return { ok: true };
});
