import { api } from '@/server/auth/current';
import { usageSummary } from '@/server/llm/registry';

export const GET = api(async () => ({ usage: usageSummary() }), { admin: true });
