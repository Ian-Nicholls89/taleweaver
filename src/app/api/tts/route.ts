import fs from 'node:fs';
import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { synthesise, TtsUnavailableError } from '@/server/media/tts';
import { rateLimit } from '@/server/auth/rate-limit';

const body = z.object({ text: z.string().max(8000) });

export const POST = api(async ({ req, user }) => {
  const { text } = body.parse(await readJson(req));
  if (!rateLimit(`tts:${user.id}`, 120, 60 * 60_000)) throw new HttpError(429, 'Narration limit reached for this hour.');
  try {
    const { file, mime } = await synthesise(text);
    return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) {
    if (e instanceof TtsUnavailableError) throw new HttpError(409, e.message);
    throw new HttpError(502, `Narration failed: ${(e as Error).message}`);
  }
});
