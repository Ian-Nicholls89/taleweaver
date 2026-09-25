import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { getGame, runTurn, TurnError } from '@/server/dm/engine';
import { ModelUnavailableError, QuotaExceededError } from '@/server/llm/registry';

const body = z.object({ text: z.string().max(4000).nullable() });

export const POST = api<{ id: string }>(async ({ req, user, params }) => {
  const game = getGame(params.id, user.id);
  if (!game) throw new HttpError(404, 'Game not found');
  const { text } = body.parse(await readJson(req));
  try {
    const stream = runTurn(game, user, text);
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no', // stop nginx buffering the stream
      },
    });
  } catch (e) {
    if (e instanceof TurnError) throw new HttpError(e.status, e.message);
    if (e instanceof ModelUnavailableError || e instanceof QuotaExceededError) throw new HttpError(400, e.message);
    throw e;
  }
});
