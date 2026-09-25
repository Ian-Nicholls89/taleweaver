import { count, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId } from '../crypto';
import { hashPassword, validatePassword, validateUsername } from './password';
import { deleteUserSessions } from './sessions';

export async function createUser(username: string, password: string, role: 'admin' | 'player') {
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  const db = getDb();
  if (db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username)).get()) {
    throw new Error(`User "${username}" already exists`);
  }
  const id = newId();
  db.insert(schema.users).values({ id, username, passwordHash: await hashPassword(password), role }).run();
  return id;
}

export function userCount() {
  return getDb().select({ n: count() }).from(schema.users).get()!.n;
}

export function findUserByUsername(username: string) {
  return getDb().select().from(schema.users).where(eq(schema.users.username, username)).get() ?? null;
}

export async function setPassword(userId: string, password: string) {
  const err = validatePassword(password);
  if (err) throw new Error(err);
  getDb()
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, userId))
    .run();
  deleteUserSessions(userId);
}

export function setDisabled(userId: string, disabled: boolean) {
  getDb().update(schema.users).set({ disabled }).where(eq(schema.users.id, userId)).run();
  if (disabled) deleteUserSessions(userId);
}

export function deleteUser(userId: string) {
  getDb().delete(schema.users).where(eq(schema.users.id, userId)).run();
}

export function countAdmins() {
  return getDb().select({ n: count() }).from(schema.users).where(eq(schema.users.role, 'admin')).get()!.n;
}

/**
 * First-run admin: if there are no users yet and ADMIN_USERNAME/ADMIN_PASSWORD
 * are set, create that admin.
 */
export async function bootstrapAdmin() {
  if (userCount() > 0) return;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn(
      '[taleweaver] No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD and restart, or run `npm run create-admin`.',
    );
    return;
  }
  try {
    await createUser(username, password, 'admin');
    console.log(`[taleweaver] Created admin account "${username}".`);
  } catch (e) {
    console.error(`[taleweaver] Could not create the admin from ADMIN_USERNAME/ADMIN_PASSWORD: ${(e as Error).message}`);
  }
}
