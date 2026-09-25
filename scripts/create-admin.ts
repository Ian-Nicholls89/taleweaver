/**
 * Creates an admin account (or resets an existing user to admin with a new password).
 *   npm run create-admin -- <username>              (development)
 *   docker compose exec taleweaver node create-admin.cjs <username>   (Docker)
 * The password is read from ADMIN_PASSWORD, or prompted for.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { eq } from 'drizzle-orm';
import { createUser, findUserByUsername, setPassword } from '../src/server/auth/users';
import { getDb, schema } from '../src/server/db';

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const username = process.argv[2] || (await rl.question('Admin username: '));
  const password = process.env.ADMIN_PASSWORD || (await rl.question('Password (min 10 characters): '));
  rl.close();
  const existing = findUserByUsername(username);
  if (existing) {
    await setPassword(existing.id, password);
    getDb().update(schema.users).set({ role: 'admin', disabled: false }).where(eq(schema.users.id, existing.id)).run();
    console.log(`Updated "${username}": now an admin with the new password.`);
  } else {
    await createUser(username, password, 'admin');
    console.log(`Created admin "${username}".`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
