import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { LanguageModel } from 'ai';
import { getDb, schema } from '../db';
import { decrypt, encrypt } from '../crypto';
import { getSetting } from '../settings';
import { LLM_PROVIDERS, OTHER_KEY_PROVIDERS, mockEnabled, providerDef } from './providers';

// ---- key vault ----

export function isKnownKeyProvider(provider: string) {
  return provider in LLM_PROVIDERS || provider in OTHER_KEY_PROVIDERS;
}

export function setProviderKey(provider: string, apiKey: string) {
  const encryptedKey = encrypt(apiKey.trim());
  getDb()
    .insert(schema.providerKeys)
    .values({ provider, encryptedKey, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: schema.providerKeys.provider, set: { encryptedKey, updatedAt: Date.now() } })
    .run();
}

export function removeProviderKey(provider: string) {
  const db = getDb();
  db.delete(schema.providerKeys).where(eq(schema.providerKeys.provider, provider)).run();
  db.update(schema.models).set({ enabled: false }).where(eq(schema.models.provider, provider)).run();
}

export function getProviderKey(provider: string): string | null {
  const row = getDb().select().from(schema.providerKeys).where(eq(schema.providerKeys.provider, provider)).get();
  if (!row) return null;
  try {
    return decrypt(row.encryptedKey);
  } catch {
    console.error(`[taleweaver] Could not decrypt the ${provider} key — was APP_SECRET changed?`);
    return null;
  }
}

/** Which providers have a key, plus a masked hint — never the key itself. */
export function keyStatus() {
  const rows = getDb().select().from(schema.providerKeys).all();
  const out: Record<string, { set: boolean; hint: string; updatedAt: number }> = {};
  for (const r of rows) {
    let hint = '••••';
    try {
      const k = decrypt(r.encryptedKey);
      // A URL (e.g. a local Ollama address) isn't a secret, so show it in full rather than masking it.
      hint = providerDef(r.provider)?.credentialType === 'url' ? k : k.length > 8 ? `…${k.slice(-4)}` : '••••';
    } catch {
      hint = 'unreadable';
    }
    out[r.provider] = { set: true, hint, updatedAt: r.updatedAt };
  }
  return out;
}

// ---- model catalogue ----

export async function refreshModels(provider: string) {
  const def = providerDef(provider);
  if (!def) throw new Error(`Unknown provider ${provider}`);
  const key = provider === 'mock' ? 'mock' : getProviderKey(provider);
  if (!key) throw new Error(`No API key saved for ${def.label}`);
  const listed = await def.listModels(key);
  const db = getDb();
  db.transaction((tx) => {
    for (const m of listed) {
      const id = `${provider}:${m.modelId}`;
      tx.insert(schema.models)
        .values({ id, provider, modelId: m.modelId, label: m.label, toolSupport: m.toolSupport, enabled: false })
        // Keep the admin's enabled flag, label and tool override; refresh nothing else.
        .onConflictDoNothing()
        .run();
    }
  });
  return listed.length;
}

export function listModels(opts: { enabledOnly?: boolean } = {}) {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.models)
    .where(opts.enabledOnly ? eq(schema.models.enabled, true) : undefined)
    .orderBy(asc(schema.models.provider), asc(schema.models.label))
    .all();
  const keyed = new Set(Object.keys(keyStatus()));
  return rows
    .filter((m) => (m.provider === 'mock' ? mockEnabled() : !opts.enabledOnly || keyed.has(m.provider)))
    .map((m) => ({ ...m, providerLabel: providerDef(m.provider)?.label ?? m.provider }));
}

export function updateModel(id: string, patch: { enabled?: boolean; label?: string; toolSupport?: boolean; costHint?: string | null }) {
  getDb().update(schema.models).set(patch).where(eq(schema.models.id, id)).run();
}

export function getModelRow(modelKey: string) {
  return getDb().select().from(schema.models).where(eq(schema.models.id, modelKey)).get() ?? null;
}

export class ModelUnavailableError extends Error {}

export function resolveModel(modelKey: string): { model: LanguageModel; row: typeof schema.models.$inferSelect } {
  const row = getModelRow(modelKey);
  if (!row || !row.enabled) throw new ModelUnavailableError('That model is not enabled. Ask the admin to enable it.');
  const def = providerDef(row.provider);
  if (!def) throw new ModelUnavailableError(`Provider ${row.provider} is not available.`);
  const key = row.provider === 'mock' ? 'mock' : getProviderKey(row.provider);
  if (!key) throw new ModelUnavailableError(`No API key is set for ${def.label}.`);
  return { model: def.create(key, row.modelId), row };
}

/** The model used for summaries and other housekeeping: admin's choice, else the game's model. */
export function housekeepingModelKey(fallback: string) {
  const chosen = getSetting('limits').summarizerModel;
  if (chosen) {
    const row = getModelRow(chosen);
    if (row?.enabled) return chosen;
  }
  return fallback;
}

/** Makes sure the mock model exists when the mock provider is switched on. */
export function ensureMockModel() {
  if (!mockEnabled()) return;
  getDb()
    .insert(schema.models)
    .values({ id: 'mock:scripted-dm', provider: 'mock', modelId: 'scripted-dm', label: 'Scripted mock DM', enabled: true, toolSupport: true })
    .onConflictDoNothing()
    .run();
}

// ---- usage ----

export function recordUsage(entry: {
  userId: string | null;
  gameId?: string | null;
  modelKey: string;
  purpose: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  getDb()
    .insert(schema.usage)
    .values({
      userId: entry.userId,
      gameId: entry.gameId ?? null,
      modelKey: entry.modelKey,
      purpose: entry.purpose,
      inputTokens: entry.inputTokens ?? 0,
      outputTokens: entry.outputTokens ?? 0,
    })
    .run();
}

export function tokensUsedToday(userId: string) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const row = getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.usage.inputTokens} + ${schema.usage.outputTokens}), 0)` })
    .from(schema.usage)
    .where(and(eq(schema.usage.userId, userId), gt(schema.usage.createdAt, since)))
    .get();
  return row?.total ?? 0;
}

export class QuotaExceededError extends Error {}

export function assertWithinQuota(userId: string, role: string) {
  if (role === 'admin') return;
  const cap = getSetting('limits').dailyTokenCap;
  if (cap && tokensUsedToday(userId) >= cap) {
    throw new QuotaExceededError('You have reached your daily usage limit. Try again tomorrow.');
  }
}

export function usageSummary() {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return getDb()
    .select({
      username: schema.users.username,
      modelKey: schema.usage.modelKey,
      inputTokens: sql<number>`sum(${schema.usage.inputTokens})`,
      outputTokens: sql<number>`sum(${schema.usage.outputTokens})`,
      calls: sql<number>`count(*)`,
    })
    .from(schema.usage)
    .leftJoin(schema.users, eq(schema.users.id, schema.usage.userId))
    .where(gt(schema.usage.createdAt, since))
    .groupBy(schema.users.username, schema.usage.modelKey)
    .all();
}
