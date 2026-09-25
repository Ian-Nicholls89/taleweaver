import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDb, schema, type DB } from '../db';
import { newId } from '../crypto';
import { assertWithinQuota, recordUsage, resolveModel } from '../llm/registry';
import type { SessionUser } from '../auth/sessions';

export type Adventure = typeof schema.adventures.$inferSelect;

const frontmatterSchema = z.object({
  title: z.string(),
  blurb: z.string(),
  level: z.union([z.string(), z.number()]).transform(String),
  length: z.string(),
  tags: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export function parseAdventureFile(source: string, id: string) {
  const { data, content } = matter(source);
  const meta = frontmatterSchema.parse(data);
  return { id, ...meta, body: content.trim() };
}

function contentDir() {
  return path.join(process.cwd(), 'content', 'adventures');
}

/** Loads content/adventures/*.md into the database (insert or update by file name). */
export function seedBundledAdventures(db: DB) {
  const dir = contentDir();
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const ids: string[] = [];
  for (const f of files) {
    const id = `bundled-${f.replace(/\.md$/, '')}`;
    ids.push(id);
    const adv = parseAdventureFile(fs.readFileSync(path.join(dir, f), 'utf8'), id);
    const values = { ...adv, source: 'bundled' as const, status: 'ready' as const, visibility: 'all' as const, ownerId: null };
    db.insert(schema.adventures).values(values).onConflictDoUpdate({ target: schema.adventures.id, set: values }).run();
  }
}

export function canSee(adv: Pick<Adventure, 'visibility' | 'ownerId'>, user: SessionUser) {
  if (user.role === 'admin') return true;
  if (adv.visibility === 'all') return true;
  if (adv.ownerId === user.id) return true;
  return Array.isArray(adv.visibility) && adv.visibility.includes(user.id);
}

export function listAdventures(user: SessionUser) {
  return getDb()
    .select({
      id: schema.adventures.id,
      source: schema.adventures.source,
      title: schema.adventures.title,
      blurb: schema.adventures.blurb,
      level: schema.adventures.level,
      length: schema.adventures.length,
      tags: schema.adventures.tags,
      warnings: schema.adventures.warnings,
      ownerId: schema.adventures.ownerId,
      visibility: schema.adventures.visibility,
      createdAt: schema.adventures.createdAt,
    })
    .from(schema.adventures)
    .where(eq(schema.adventures.status, 'ready'))
    .orderBy(schema.adventures.source, desc(schema.adventures.createdAt))
    .all()
    .filter((a) => canSee(a, user));
}

export function getAdventure(id: string, user: SessionUser) {
  const adv = getDb().select().from(schema.adventures).where(eq(schema.adventures.id, id)).get();
  if (!adv || !canSee(adv, user)) return null;
  return adv;
}

export function setVisibility(id: string, visibility: Adventure['visibility']) {
  getDb().update(schema.adventures).set({ visibility }).where(and(eq(schema.adventures.id, id), ne(schema.adventures.source, 'bundled'))).run();
}

export function deleteAdventure(id: string, user: SessionUser) {
  const adv = getDb().select().from(schema.adventures).where(eq(schema.adventures.id, id)).get();
  if (!adv || adv.source === 'bundled') return false;
  if (user.role !== 'admin' && adv.ownerId !== user.id) return false;
  getDb().delete(schema.adventures).where(eq(schema.adventures.id, id)).run();
  return true;
}

// ---- AI-generated adventures ----

const pitchSchema = z.object({
  pitches: z
    .array(
      z.object({
        title: z.string(),
        blurb: z.string().describe('Two or three enticing sentences, no spoilers'),
        level: z.string().describe('Recommended character level, e.g. "1" or "1–3"'),
        length: z.string().describe('Expected play time, e.g. "2 hours"'),
        tags: z.array(z.string()).describe('2–4 short genre/mood tags'),
      }),
    )
    .min(1)
    .max(5),
});

const adventureSchema = z.object({
  title: z.string(),
  blurb: z.string(),
  level: z.string(),
  length: z.string(),
  tags: z.array(z.string()),
  warnings: z.array(z.string()).describe('Content warnings, empty if none'),
  body: z
    .string()
    .describe(
      'Markdown DM notes with sections: ## Overview, ## Hook, ## Scenes (numbered, each with location description, what happens, and how to move on), ## NPCs, ## Encounters (with SRD creature names and scaled-down stats for one character), ## Secrets & Clues, ## Possible Endings',
    ),
});

const GENERATOR_RULES = `You design original solo one-shot adventures for Dungeons & Dragons 5th edition, using only content from the SRD 5.2 (creative commons) — no copyrighted settings, characters, or named places from published adventures. Adventures are for exactly one player character with an AI Dungeon Master, played mostly in the theatre of the mind. Keep encounters survivable for a single hero, and make sure there are social and exploration routes as well as combat.`;

export async function generatePitches(user: SessionUser, modelKey: string, theme?: string) {
  assertWithinQuota(user.id, user.role);
  const { model } = resolveModel(modelKey);
  const existing = listAdventures(user).map((a) => a.title);
  const result = await generateText({
    model,
    instructions: GENERATOR_RULES,
    prompt: `Pitch three varied one-shot adventures${theme ? ` loosely inspired by: "${theme.slice(0, 300)}"` : ''}. Mix tones (e.g. mystery, horror, comedy, heroic). Avoid these existing titles: ${existing.join('; ') || 'none'}.`,
    output: Output.object({ schema: pitchSchema }),
    maxOutputTokens: 1500,
  });
  recordUsage({
    userId: user.id,
    modelKey,
    purpose: 'pitch',
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  });
  const db = getDb();
  // Old unexpanded pitches are replaced by the new batch.
  db.delete(schema.adventures)
    .where(and(eq(schema.adventures.ownerId, user.id), eq(schema.adventures.status, 'pitch')))
    .run();
  const rows = result.output.pitches.slice(0, 3).map((p) => ({
    id: newId(),
    source: 'generated' as const,
    status: 'pitch' as const,
    title: p.title,
    blurb: p.blurb,
    level: p.level,
    length: p.length,
    tags: p.tags.slice(0, 4),
    warnings: [],
    body: '',
    ownerId: user.id,
    visibility: 'owner' as const,
  }));
  if (rows.length) db.insert(schema.adventures).values(rows).run();
  return rows.map(({ id, title, blurb, level, length, tags }) => ({ id, title, blurb, level, length, tags }));
}

export function listPitches(user: SessionUser) {
  return getDb()
    .select({
      id: schema.adventures.id,
      title: schema.adventures.title,
      blurb: schema.adventures.blurb,
      level: schema.adventures.level,
      length: schema.adventures.length,
      tags: schema.adventures.tags,
    })
    .from(schema.adventures)
    .where(and(eq(schema.adventures.ownerId, user.id), eq(schema.adventures.status, 'pitch')))
    .all();
}

export async function expandPitch(user: SessionUser, pitchId: string, modelKey: string) {
  assertWithinQuota(user.id, user.role);
  const db = getDb();
  const pitch = db
    .select()
    .from(schema.adventures)
    .where(and(eq(schema.adventures.id, pitchId), eq(schema.adventures.ownerId, user.id), eq(schema.adventures.status, 'pitch')))
    .get();
  if (!pitch) throw new Error('Pitch not found');
  const { model } = resolveModel(modelKey);
  const result = await generateText({
    model,
    instructions: GENERATOR_RULES,
    prompt: `Write the full DM notes for this pitch. Keep the title and spirit.\n\nTitle: ${pitch.title}\nBlurb: ${pitch.blurb}\nLevel: ${pitch.level}\nLength: ${pitch.length}\nTags: ${pitch.tags.join(', ')}`,
    output: Output.object({ schema: adventureSchema }),
    maxOutputTokens: 8000,
  });
  recordUsage({
    userId: user.id,
    modelKey,
    purpose: 'expand',
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  });
  const a = result.output;
  db.update(schema.adventures)
    .set({ status: 'ready', title: a.title, blurb: a.blurb, level: a.level, length: a.length, tags: a.tags.slice(0, 5), warnings: a.warnings, body: a.body })
    .where(eq(schema.adventures.id, pitchId))
    .run();
  return pitchId;
}

// ---- admin import of owned adventures ----

const CHUNK = 100_000;

export async function extractText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buf });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  return buf.toString('utf8');
}

export async function importAdventure(user: SessionUser, text: string, modelKey: string, opts: { visibility: Adventure['visibility']; condense: boolean }) {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < 200) throw new Error('That file has too little text to be an adventure.');

  // Markdown with our own frontmatter can be imported as-is.
  if (!opts.condense && clean.startsWith('---')) {
    const adv = parseAdventureFile(clean, newId());
    getDb()
      .insert(schema.adventures)
      .values({ ...adv, source: 'imported', status: 'ready', ownerId: user.id, visibility: opts.visibility })
      .run();
    return adv.id;
  }

  const { model } = resolveModel(modelKey);
  const usageTotals = { inputTokens: 0, outputTokens: 0 };
  const track = (u: { inputTokens?: number; outputTokens?: number }) => {
    usageTotals.inputTokens += u.inputTokens ?? 0;
    usageTotals.outputTokens += u.outputTokens ?? 0;
  };

  // Very long books are condensed chunk by chunk first.
  let source = clean;
  if (clean.length > CHUNK * 1.2) {
    const notes: string[] = [];
    for (let i = 0; i < clean.length; i += CHUNK) {
      const r = await generateText({
        model,
        instructions: 'You condense part of a tabletop adventure into dense DM notes. Keep every location, NPC, encounter (with creature names and numbers), clue, secret, treasure and plot branch. Drop layout artefacts, legal text and art credits.',
        prompt: clean.slice(i, i + CHUNK),
        maxOutputTokens: 4000,
      });
      track(r.usage);
      notes.push(r.text);
    }
    source = notes.join('\n\n');
  }

  const result = await generateText({
    model,
    instructions:
      'You convert a tabletop adventure into structured notes for an AI Dungeon Master running it for ONE player character. Preserve the original plot, locations, NPCs, secrets and encounters faithfully, but scale encounter numbers down for a single hero and note where. The notes are private to the DM.',
    prompt: `<adventure_text>\n${source}\n</adventure_text>`,
    output: Output.object({ schema: adventureSchema }),
    maxOutputTokens: 12000,
  });
  track(result.usage);
  recordUsage({ userId: user.id, modelKey, purpose: 'import', ...usageTotals });
  const a = result.output;
  const id = newId();
  getDb()
    .insert(schema.adventures)
    .values({
      id,
      source: 'imported',
      status: 'ready',
      title: a.title,
      blurb: a.blurb,
      level: a.level,
      length: a.length,
      tags: a.tags.slice(0, 5),
      warnings: a.warnings,
      body: a.body,
      ownerId: user.id,
      visibility: opts.visibility,
    })
    .run();
  return id;
}

export function usersById(ids: string[]) {
  if (!ids.length) return [];
  return getDb().select({ id: schema.users.id, username: schema.users.username }).from(schema.users).where(inArray(schema.users.id, ids)).all();
}
