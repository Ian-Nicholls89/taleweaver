import { hash, verify } from '@node-rs/argon2';

// Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 256) return 'Password is too long.';
  return null;
}

// A hash of a random password; verifying against it keeps login timing the same
// whether or not the username exists.
let dummyHash: Promise<string> | undefined;
export function timingSafeDummyVerify(password: string) {
  dummyHash ??= hashPassword('not-a-real-password-' + Math.random());
  return dummyHash.then((h) => verifyPassword(h, password)).then(() => false);
}
