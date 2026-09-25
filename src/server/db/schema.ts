import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

const now = () => Date.now();

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'player'] }).notNull().default('player'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  prefs: text('prefs', { mode: 'json' }).$type<UserPrefs>().notNull().default({}),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export type UserPrefs = {
  narration?: boolean;
  voice?: string;
  musicVolume?: number;
  sfxVolume?: number;
  lastModel?: string;
};

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 of the cookie token
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  note: text('note'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  expiresAt: integer('expires_at').notNull(),
  usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: integer('used_at'),
  revokedAt: integer('revoked_at'),
});

export const providerKeys = sqliteTable('provider_keys', {
  provider: text('provider').primaryKey(),
  encryptedKey: text('encrypted_key').notNull(),
  updatedAt: integer('updated_at').notNull().$defaultFn(now),
});

export const models = sqliteTable('models', {
  id: text('id').primaryKey(), // `${provider}:${modelId}`
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  label: text('label').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  toolSupport: integer('tool_support', { mode: 'boolean' }).notNull().default(true),
  costHint: text('cost_hint'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export const adventures = sqliteTable('adventures', {
  id: text('id').primaryKey(),
  source: text('source', { enum: ['bundled', 'generated', 'imported'] }).notNull(),
  status: text('status', { enum: ['pitch', 'ready'] }).notNull().default('ready'),
  title: text('title').notNull(),
  blurb: text('blurb').notNull(),
  level: text('level').notNull().default('1'),
  length: text('length').notNull().default('2–3 hours'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  warnings: text('warnings', { mode: 'json' }).$type<string[]>().notNull().default([]),
  body: text('body').notNull().default(''),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  // 'all' = every user; 'owner' = only the owner (and admins); otherwise a JSON list of user ids
  visibility: text('visibility', { mode: 'json' }).$type<'all' | 'owner' | string[]>().notNull().default('all'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adventureId: text('adventure_id')
      .notNull()
      .references(() => adventures.id, { onDelete: 'cascade' }),
    modelKey: text('model_key').notNull(),
    character: text('character', { mode: 'json' }).$type<import('../dm/types').Character>().notNull(),
    state: text('state', { mode: 'json' }).$type<import('../dm/types').GameState>().notNull(),
    summary: text('summary').notNull().default(''),
    summarizedThrough: integer('summarized_through').notNull().default(0), // message id
    status: text('status', { enum: ['active', 'ended'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull().$defaultFn(now),
    updatedAt: integer('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('games_user_idx').on(t.userId)],
);

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['player', 'dm'] }).notNull(),
    content: text('content').notNull(),
    events: text('events', { mode: 'json' }).$type<import('../dm/types').GameEvent[]>().notNull().default([]),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('messages_game_idx').on(t.gameId)],
);

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  status: text('status', { enum: ['pending', 'ready', 'failed'] }).notNull().default('pending'),
  file: text('file'),
  error: text('error'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const usage = sqliteTable(
  'usage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    gameId: text('game_id').references(() => games.id, { onDelete: 'set null' }),
    modelKey: text('model_key').notNull(),
    purpose: text('purpose').notNull(), // turn | summary | pitch | expand | import
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('usage_user_time_idx').on(t.userId, t.createdAt)],
);
