import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { randomToken, sha256 } from '../crypto';

export const SESSION_COOKIE = 'tw_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WHEN_REMAINING_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = Pick<typeof schema.users.$inferSelect, 'id' | 'username' | 'role' | 'prefs'>;

export function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  getDb().insert(schema.sessions).values({ id: sha256(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

/** Resolves a cookie token to its user, extending the session when it's past halfway. */
export function validateSessionToken(token: string | undefined | null): { user: SessionUser; expiresAt: number; renewed: boolean } | null {
  if (!token) return null;
  const db = getDb();
  const id = sha256(token);
  const row = db
    .select({
      expiresAt: schema.sessions.expiresAt,
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      prefs: schema.users.prefs,
      disabled: schema.users.disabled,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, Date.now())))
    .get();
  if (!row || row.disabled) return null;
  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt - Date.now() < RENEW_WHEN_REMAINING_MS) {
    expiresAt = Date.now() + SESSION_TTL_MS;
    db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, id)).run();
    renewed = true;
  }
  const { disabled: _d, expiresAt: _e, ...user } = row;
  return { user, expiresAt, renewed };
}

export function deleteSessionToken(token: string) {
  getDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token))).run();
}

export function deleteUserSessions(userId: string) {
  getDb().delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
}

export function purgeExpiredSessions() {
  getDb().delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now())).run();
}

export function cookieIsSecure() {
  const url = process.env.PUBLIC_URL;
  if (url) return url.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}
