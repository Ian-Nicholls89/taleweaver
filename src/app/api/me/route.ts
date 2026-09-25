import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { api, readJson } from '@/server/auth/current';
import { getDb, schema } from '@/server/db';

const prefsSchema = z.object({
  narration: z.boolean().optional(),
  voice: z.string().max(200).optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  sfxVolume: z.number().min(0).max(1).optional(),
  lastModel: z.string().max(300).optional(),
});

export const GET = api(async ({ user }) => ({ user }));

export const PATCH = api(async ({ req, user }) => {
  const patch = prefsSchema.parse(await readJson(req));
  const prefs = { ...user.prefs, ...patch };
  getDb().update(schema.users).set({ prefs }).where(eq(schema.users.id, user.id)).run();
  return { prefs };
});
