import fs from 'node:fs';
import path from 'node:path';
import { api, HttpError } from '@/server/auth/current';
import { getGame } from '@/server/dm/engine';
import { getImage, IMAGE_MIME } from '@/server/media/images';
import { mediaDir } from '@/server/db';

export const GET = api<{ id: string }>(async ({ user, params }) => {
  const img = getImage(params.id);
  if (!img || !getGame(img.gameId, user.id) || img.status !== 'ready' || !img.file) throw new HttpError(404, 'Image not found');
  const file = path.join(/*turbopackIgnore: true*/ mediaDir(), path.basename(img.file));
  const ext = path.extname(file).slice(1);
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      'Content-Type': IMAGE_MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
});
