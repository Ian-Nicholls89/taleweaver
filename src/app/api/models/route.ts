import { api } from '@/server/auth/current';
import { listModels } from '@/server/llm/registry';

export const GET = api(async () => ({
  models: listModels({ enabledOnly: true }).map(({ id, label, providerLabel, toolSupport, costHint }) => ({ id, label, providerLabel, toolSupport, costHint })),
}));
