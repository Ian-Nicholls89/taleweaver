import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

type Holder = { db?: DB; sqlite?: Database.Database; initHooks: Array<(db: DB) => void> };
const g = globalThis as unknown as { __taleweaverDb?: Holder };
const holder: Holder = (g.__taleweaverDb ??= { initHooks: [] });

export function dataDir() {
  const dir = process.env.TALEWEAVER_DATA_DIR || path.join(process.cwd(), 'data');
  return dir;
}

export function mediaDir() {
  const base = dataDir() === ':memory:' ? path.join(process.cwd(), '.test-media') : dataDir();
  const dir = path.join(base, 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Runs once per process after migrations, e.g. to seed bundled adventures and the admin. */
export function onDbInit(hook: (db: DB) => void) {
  holder.initHooks.push(hook);
  if (holder.db) hook(holder.db);
}

export function getDb(): DB {
  if (holder.db) return holder.db;
  const dir = dataDir();
  let file: string;
  if (dir === ':memory:') {
    file = ':memory:';
  } else {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'taleweaver.db');
  }
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  holder.sqlite = sqlite;
  holder.db = db;
  for (const hook of holder.initHooks) hook(db);
  return db;
}

/** For tests: throw away the in-memory database. */
export function resetDbForTests() {
  holder.sqlite?.close();
  holder.db = undefined;
  holder.sqlite = undefined;
}

export { schema };
