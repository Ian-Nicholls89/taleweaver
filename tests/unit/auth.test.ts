import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, resetDbForTests, schema } from '@/server/db';
import { createUser, setDisabled } from '@/server/auth/users';
import { createInvite, findUsableInvite, registerWithInvite, revokeInvite, RegistrationError } from '@/server/auth/invites';
import { createSession, validateSessionToken } from '@/server/auth/sessions';
import { verifyPassword } from '@/server/auth/password';
import { rateLimit } from '@/server/auth/rate-limit';

let adminId: string;

beforeEach(async () => {
  resetDbForTests();
  adminId = await createUser('admin', 'correct horse battery', 'admin');
});

describe('invites', () => {
  it('registers a player once per invite', async () => {
    const { token } = createInvite(adminId, { note: 'for Sam' });
    const userId = await registerWithInvite(token, 'sam', 'a long password');
    const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get()!;
    expect(user.role).toBe('player');
    expect(await verifyPassword(user.passwordHash, 'a long password')).toBe(true);
    await expect(registerWithInvite(token, 'sam2', 'a long password')).rejects.toBeInstanceOf(RegistrationError);
  });

  it('rejects revoked, expired and made-up tokens', async () => {
    const revoked = createInvite(adminId);
    revokeInvite(revoked.id);
    await expect(registerWithInvite(revoked.token, 'x_user', 'a long password')).rejects.toThrow(/invalid/);

    const expired = createInvite(adminId);
    getDb().update(schema.invites).set({ expiresAt: Date.now() - 1 }).where(eq(schema.invites.id, expired.id)).run();
    expect(findUsableInvite(expired.token)).toBeNull();

    expect(findUsableInvite('not-a-token')).toBeNull();
  });

  it('validates usernames and passwords before using the invite', async () => {
    const { token } = createInvite(adminId);
    await expect(registerWithInvite(token, 'no spaces allowed', 'a long password')).rejects.toThrow(/Username/);
    await expect(registerWithInvite(token, 'shorty', 'short')).rejects.toThrow(/Password/);
    await expect(registerWithInvite(token, 'admin', 'a long password')).rejects.toThrow(/taken/);
    expect(findUsableInvite(token)).not.toBeNull();
  });
});

describe('sessions', () => {
  it('validates tokens and drops them when a user is disabled', () => {
    const { token } = createSession(adminId);
    expect(validateSessionToken(token)?.user.username).toBe('admin');
    expect(validateSessionToken(token + 'x')).toBeNull();
    setDisabled(adminId, true);
    expect(validateSessionToken(token)).toBeNull();
  });

  it('expires', () => {
    const { token } = createSession(adminId);
    getDb().update(schema.sessions).set({ expiresAt: Date.now() - 1000 }).run();
    expect(validateSessionToken(token)).toBeNull();
  });
});

describe('rate limit', () => {
  it('blocks after the limit', () => {
    const key = 'test:' + Math.random();
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });
});
