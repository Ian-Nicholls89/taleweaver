import { api } from '@/server/auth/current';
import { revokeInvite } from '@/server/auth/invites';

export const DELETE = api<{ id: string }>(
  async ({ params }) => {
    revokeInvite(params.id);
    return { ok: true };
  },
  { admin: true },
);
