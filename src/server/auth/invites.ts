import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId, randomToken, sha256 } from '../crypto';
import { hashPassword, validatePassword, validateUsername } from './password';

export const DEFAULT_INVITE_DAYS = 7;

export function createInvite(createdBy: string, opts: { note?: string; days?: number } = {}) {
  const token = randomToken(24);
  const days = Math.min(Math.max(opts.days ?? DEFAULT_INVITE_DAYS, 1), 90);
  const invite = {
    id: newId(),
    tokenHash: sha256(token),
    note: opts.note?.slice(0, 200) || null,
    createdBy,
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
  };
  getDb().insert(schema.invites).values(invite).run();
  return { id: invite.id, token, expiresAt: invite.expiresAt };
}

export function findUsableInvite(token: string) {
  if (!token || token.length > 128) return null;
  return (
    getDb()
      .select()
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.tokenHash, sha256(token)),
          isNull(schema.invites.usedAt),
          isNull(schema.invites.revokedAt),
          gt(schema.invites.expiresAt, Date.now()),
        ),
      )
      .get() ?? null
  );
}

export function revokeInvite(id: string) {
  getDb()
    .update(schema.invites)
    .set({ revokedAt: Date.now() })
    .where(and(eq(schema.invites.id, id), isNull(schema.invites.usedAt)))
    .run();
}

export function listInvites() {
  return getDb()
    .select({
      id: schema.invites.id,
      note: schema.invites.note,
      createdAt: schema.invites.createdAt,
      expiresAt: schema.invites.expiresAt,
      usedAt: schema.invites.usedAt,
      revokedAt: schema.invites.revokedAt,
      usedByName: schema.users.username,
    })
    .from(schema.invites)
    .leftJoin(schema.users, eq(schema.users.id, schema.invites.usedBy))
    .orderBy(desc(schema.invites.createdAt))
    .all();
}

export class RegistrationError extends Error {}

/** Consumes an invite and creates a player account, atomically. */
export async function registerWithInvite(token: string, username: string, password: string) {
  const usernameError = validateUsername(username);
  if (usernameError) throw new RegistrationError(usernameError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new RegistrationError(passwordError);
  if (!findUsableInvite(token)) throw new RegistrationError('This invite link is invalid, expired or already used.');

  const passwordHash = await hashPassword(password);
  const db = getDb();
  const userId = newId();
  db.transaction((tx) => {
    // Re-check inside the transaction so two simultaneous registrations can't share one invite.
    const invite = tx
      .select()
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.tokenHash, sha256(token)),
          isNull(schema.invites.usedAt),
          isNull(schema.invites.revokedAt),
          gt(schema.invites.expiresAt, Date.now()),
        ),
      )
      .get();
    if (!invite) throw new RegistrationError('This invite link is invalid, expired or already used.');
    const taken = tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).get();
    if (taken) throw new RegistrationError('That username is taken.');
    tx.insert(schema.users).values({ id: userId, username, passwordHash, role: 'player' }).run();
    tx.update(schema.invites).set({ usedAt: Date.now(), usedBy: userId }).where(eq(schema.invites.id, invite.id)).run();
  });
  return userId;
}
