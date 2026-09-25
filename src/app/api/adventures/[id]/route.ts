import { api, HttpError } from '@/server/auth/current';
import { deleteAdventure } from '@/server/adventures';

export const DELETE = api<{ id: string }>(async ({ user, params }) => {
  if (!deleteAdventure(params.id, user)) throw new HttpError(403, "You can't delete that adventure.");
  return { ok: true };
});
