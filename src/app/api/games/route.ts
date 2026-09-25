import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { getAdventure } from '@/server/adventures';
import { BuildError, buildCharacter, builderSchema, pregenCharacter } from '@/server/characters';
import { createGame, listGames } from '@/server/dm/engine';
import { getModelRow } from '@/server/llm/registry';

const body = z.object({
  adventureId: z.string().max(100),
  modelKey: z.string().max(300),
  character: z.union([z.object({ pregenId: z.string().max(50), level: z.number().int().min(1).max(3) }), z.object({ build: builderSchema })]),
});

export const GET = api(async ({ user }) => ({ games: listGames(user.id) }));

export const POST = api(async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  const adventure = getAdventure(input.adventureId, user);
  if (!adventure || adventure.status !== 'ready') throw new HttpError(404, 'Adventure not found');
  const model = getModelRow(input.modelKey);
  if (!model?.enabled) throw new HttpError(400, 'Pick an enabled model.');
  let character;
  try {
    character = 'pregenId' in input.character ? pregenCharacter(input.character.pregenId, input.character.level) : buildCharacter(input.character.build);
  } catch (e) {
    if (e instanceof BuildError) throw new HttpError(400, e.message);
    throw e;
  }
  if (!character) throw new HttpError(400, 'Unknown character');
  return { id: createGame(user.id, adventure.id, input.modelKey, character) };
});
