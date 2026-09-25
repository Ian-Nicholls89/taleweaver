import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { getGame } from '@/server/dm/engine';
import { rollDice } from '@/server/dm/dice';

const body = z.object({ expr: z.string().max(60), label: z.string().max(80).optional() });

/** The player's own dice roller — rolled on the server so results are honest. */
export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  if (!getGame(params.id, user.id)) throw new HttpError(404, 'Game not found');
  const { expr, label } = body.parse(await readJson(req));
  try {
    const r = rollDice(expr);
    return { ...r, label: label ?? null };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
