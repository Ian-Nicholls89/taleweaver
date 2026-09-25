import { z } from 'zod';
import { api, readJson } from '@/server/auth/current';
import { createInvite, listInvites } from '@/server/auth/invites';

const body = z.object({ note: z.string().max(200).optional(), days: z.number().int().min(1).max(90).optional() });

export const GET = api(async () => ({ invites: listInvites() }), { admin: true });

export const POST = api(
  async ({ req, user }) => {
    const opts = body.parse(await readJson(req));
    const invite = createInvite(user.id, opts);
    const base = process.env.PUBLIC_URL?.replace(/\/$/, '') || new URL(req.url).origin;
    return { ...invite, url: `${base}/register/${invite.token}` };
  },
  { admin: true },
);
