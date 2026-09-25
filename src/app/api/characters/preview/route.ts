import { api, HttpError, readJson } from '@/server/auth/current';
import { BuildError, buildCharacter, builderSchema } from '@/server/characters';

export const POST = api(async ({ req }) => {
  try {
    return { character: buildCharacter(builderSchema.parse(await readJson(req))) };
  } catch (e) {
    if (e instanceof BuildError) throw new HttpError(400, e.message);
    throw e;
  }
});
