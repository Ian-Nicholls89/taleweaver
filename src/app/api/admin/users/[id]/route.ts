import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { api, HttpError, readJson } from '@/server/auth/current';
import { getDb, schema } from '@/server/db';
import { countAdmins, deleteUser, setDisabled, setPassword } from '@/server/auth/users';
import { deleteUserSessions } from '@/server/auth/sessions';

const body = z.object({
  disabled: z.boolean().optional(),
  role: z.enum(['admin', 'player']).optional(),
  password: z.string().max(256).optional(),
});

function loadTarget(id: string) {
  const target = getDb().select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!target) throw new HttpError(404, 'User not found');
  return target;
}

export const PATCH = api<{ id: string }>(
  async ({ req, user, params }) => {
    const patch = body.parse(await readJson(req));
    const target = loadTarget(params.id);
    const demotingAdmin = target.role === 'admin' && (patch.role === 'player' || patch.disabled === true);
    if (demotingAdmin && target.id === user.id) throw new HttpError(400, "You can't demote or disable yourself.");
    if (demotingAdmin && countAdmins() <= 1) throw new HttpError(400, 'There must be at least one admin.');
    if (patch.password !== undefined) {
      try {
        await setPassword(target.id, patch.password);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    }
    if (patch.disabled !== undefined) setDisabled(target.id, patch.disabled);
    if (patch.role) {
      getDb().update(schema.users).set({ role: patch.role }).where(eq(schema.users.id, target.id)).run();
      deleteUserSessions(target.id);
    }
    return { ok: true };
  },
  { admin: true },
);

export const DELETE = api<{ id: string }>(
  async ({ user, params }) => {
    const target = loadTarget(params.id);
    if (target.id === user.id) throw new HttpError(400, "You can't delete yourself.");
    if (target.role === 'admin' && countAdmins() <= 1) throw new HttpError(400, 'There must be at least one admin.');
    deleteUser(target.id);
    return { ok: true };
  },
  { admin: true },
);
