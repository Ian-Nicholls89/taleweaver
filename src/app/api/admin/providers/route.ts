import { api } from '@/server/auth/current';
import { keyStatus } from '@/server/llm/registry';
import { LLM_PROVIDERS, OTHER_KEY_PROVIDERS } from '@/server/llm/providers';

export const GET = api(
  async () => ({
    status: keyStatus(),
    llm: Object.entries(LLM_PROVIDERS).map(([id, p]) => ({
      id,
      label: p.label,
      keyUrl: p.keyUrl,
      note: p.note ?? null,
      credentialType: p.credentialType ?? 'apiKey',
      urlPlaceholder: p.urlPlaceholder ?? null,
    })),
    other: Object.entries(OTHER_KEY_PROVIDERS).map(([id, p]) => ({ id, ...p })),
  }),
  { admin: true },
);
