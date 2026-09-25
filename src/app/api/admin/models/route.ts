import { z } from 'zod';
import { api, readJson } from '@/server/auth/current';
import { listModels, updateModel } from '@/server/llm/registry';

const body = z.object({
  id: z.string().max(300),
  enabled: z.boolean().optional(),
  label: z.string().trim().min(1).max(120).optional(),
  toolSupport: z.boolean().optional(),
  costHint: z.string().max(60).nullable().optional(),
});

export const GET = api(async () => ({ models: listModels() }), { admin: true });

export const PATCH = api(
  async ({ req }) => {
    const { id, ...patch } = body.parse(await readJson(req));
    updateModel(id, patch);
    return { ok: true };
  },
  { admin: true },
);
