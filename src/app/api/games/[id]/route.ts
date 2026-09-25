import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { deleteGame, gameMessages, getGame, isTurnInProgress, setGameModel } from '@/server/dm/engine';
import { getModelRow } from '@/server/llm/registry';

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const game = getGame(params.id, user.id);
  if (!game) throw new HttpError(404, 'Game not found');
  return { game, messages: gameMessages(game.id), turnInProgress: isTurnInProgress(game.id) };
});

const patchBody = z.object({ modelKey: z.string().max(300) });

export const PATCH = api<{ id: string }>(async ({ req, user, params }) => {
  const game = getGame(params.id, user.id);
  if (!game) throw new HttpError(404, 'Game not found');
  const { modelKey } = patchBody.parse(await readJson(req));
  if (!getModelRow(modelKey)?.enabled) throw new HttpError(400, 'Pick an enabled model.');
  setGameModel(game.id, modelKey);
  return { ok: true };
});

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  deleteGame(params.id, user.id);
  return { ok: true };
});
