import { api, HttpError } from '@/server/auth/current';
import { refreshModels } from '@/server/llm/registry';

export const POST = api<{ provider: string }>(
  async ({ params }) => {
    try {
      const count = await refreshModels(params.provider);
      return { count };
    } catch (e) {
      throw new HttpError(400, `Could not fetch models: ${(e as Error).message}`);
    }
  },
  { admin: true },
);
