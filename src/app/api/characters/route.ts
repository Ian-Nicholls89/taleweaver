import { api } from '@/server/auth/current';
import { builderOptions, buildCharacter, pregens } from '@/server/characters';

export const GET = api(async () => ({
  options: builderOptions(),
  pregens: pregens().map((p) => ({ id: p.id, blurb: p.blurb, character: buildCharacter(p.input) })),
}));
