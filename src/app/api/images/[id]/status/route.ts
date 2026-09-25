import { api, HttpError } from '@/server/auth/current';
import { getGame } from '@/server/dm/engine';
import { getImage } from '@/server/media/images';

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const img = getImage(params.id);
  if (!img || !getGame(img.gameId, user.id)) throw new HttpError(404, 'Image not found');
  return { status: img.status, error: img.status === 'failed' ? img.error : null };
});
