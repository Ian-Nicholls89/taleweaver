import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { generatePitches } from '@/server/adventures';
import { rateLimit } from '@/server/auth/rate-limit';

const body = z.object({ modelKey: z.string().max(300), theme: z.string().max(300).optional() });

export const POST = api(async ({ req, user }) => {
  const { modelKey, theme } = body.parse(await readJson(req));
  if (!rateLimit(`pitch:${user.id}`, 10, 60 * 60_000)) throw new HttpError(429, 'That is a lot of pitches — try again in a while.');
  try {
    return { pitches: await generatePitches(user, modelKey, theme) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
