import { getDb, onDbInit } from './db';
import { seedBundledAdventures } from './adventures';
import { bootstrapAdmin } from './auth/users';
import { purgeExpiredSessions } from './auth/sessions';
import { ensureMockModel } from './llm/registry';

let started = false;

/** Runs once per server process: migrate, seed content, create the first admin. */
export async function bootstrap() {
  if (started) return;
  started = true;
  onDbInit((db) => {
    seedBundledAdventures(db);
    ensureMockModel();
    purgeExpiredSessions();
  });
  getDb();
  await bootstrapAdmin();
}
