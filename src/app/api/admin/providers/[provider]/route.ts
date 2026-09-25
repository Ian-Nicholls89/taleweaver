import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { isKnownKeyProvider, removeProviderKey, setProviderKey } from '@/server/llm/registry';

const body = z.object({ apiKey: z.string().trim().min(8).max(500) });

export const PUT = api<{ provider: string }>(
  async ({ req, params }) => {
    if (!isKnownKeyProvider(params.provider)) throw new HttpError(404, 'Unknown provider');
    const { apiKey } = body.parse(await readJson(req));
    setProviderKey(params.provider, apiKey);
    return { ok: true };
  },
  { admin: true },
);

export const DELETE = api<{ provider: string }>(
  async ({ params }) => {
    if (!isKnownKeyProvider(params.provider)) throw new HttpError(404, 'Unknown provider');
    removeProviderKey(params.provider);
    return { ok: true };
  },
  { admin: true },
);
