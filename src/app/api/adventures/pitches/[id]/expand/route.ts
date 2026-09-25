import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { expandPitch } from '@/server/adventures';

const body = z.object({ modelKey: z.string().max(300) });

export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  const { modelKey } = body.parse(await readJson(req));
  try {
    return { id: await expandPitch(user, params.id, modelKey) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
