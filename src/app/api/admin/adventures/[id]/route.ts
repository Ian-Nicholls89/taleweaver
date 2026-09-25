import { z } from 'zod';
import { api, readJson } from '@/server/auth/current';
import { setVisibility } from '@/server/adventures';

const body = z.object({ visibility: z.union([z.enum(['all', 'owner']), z.array(z.string().max(64)).max(200)]) });

export const PATCH = api<{ id: string }>(
  async ({ req, params }) => {
    const { visibility } = body.parse(await readJson(req));
    setVisibility(params.id, visibility);
    return { ok: true };
  },
  { admin: true },
);
