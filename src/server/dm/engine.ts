import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { generateText, isStepCount, streamText } from 'ai';
import { getDb, schema } from '../db';
import { newId } from '../crypto';
import { assertWithinQuota, housekeepingModelKey, recordUsage, resolveModel } from '../llm/registry';
import { startImageGeneration } from '../media/images';
import { buildInstructions, buildMessages, OPENING_PLAYER_TEXT, type StoredMessage } from './prompt';
import { buildTools, newTurnContext } from './tools';
import { emptyState, type Character, type GameEvent } from './types';

export type Game = typeof schema.games.$inferSelect;

/** Messages kept word for word; older ones are folded into the running summary. */
const KEEP_VERBATIM = 16;
const SUMMARISE_AFTER = 36;

export function createGame(userId: string, adventureId: string, modelKey: string, character: Character) {
  const id = newId();
  getDb()
    .insert(schema.games)
    .values({ id, userId, adventureId, modelKey, character: { ...character, conditions: character.conditions ?? [] }, state: emptyState() })
    .run();
  return id;
}

export function getGame(gameId: string, userId: string) {
  return getDb()
    .select()
    .from(schema.games)
    .where(and(eq(schema.games.id, gameId), eq(schema.games.userId, userId)))
    .get() ?? null;
}

export function listGames(userId: string) {
  return getDb()
    .select({
      id: schema.games.id,
      status: schema.games.status,
      updatedAt: schema.games.updatedAt,
      adventureId: schema.games.adventureId,
      title: schema.adventures.title,
      characterName: schema.games.character,
    })
    .from(schema.games)
    .innerJoin(schema.adventures, eq(schema.adventures.id, schema.games.adventureId))
    .where(eq(schema.games.userId, userId))
    .orderBy(desc(schema.games.updatedAt))
    .all()
    .map((g) => ({ ...g, characterName: (g.characterName as Character).name }));
}

export function deleteGame(gameId: string, userId: string) {
  getDb()
    .delete(schema.games)
    .where(and(eq(schema.games.id, gameId), eq(schema.games.userId, userId)))
    .run();
}

export function gameMessages(gameId: string) {
  return getDb()
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.gameId, gameId))
    .orderBy(asc(schema.messages.id))
    .all();
}

export function setGameModel(gameId: string, modelKey: string) {
  getDb().update(schema.games).set({ modelKey }).where(eq(schema.games.id, gameId)).run();
}

// One turn at a time per game. Kept on globalThis so every route bundle shares it.
const g = globalThis as unknown as { __taleweaverBusyGames?: Set<string> };
const busy = (g.__taleweaverBusyGames ??= new Set<string>());

export function isTurnInProgress(gameId: string) {
  return busy.has(gameId);
}

export class TurnError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type StreamLine =
  | { t: 'player'; id: number; content: string }
  | { t: 'text'; v: string }
  | { t: 'event'; v: GameEvent }
  | { t: 'done'; messageId: number; character: Character; state: Game['state']; status: Game['status'] }
  | { t: 'error'; message: string };

/**
 * Runs one DM turn and returns an NDJSON stream of narration text and game
 * events. The turn runs to completion and is saved even if the client
 * disconnects part-way.
 */
export function runTurn(game: Game, user: { id: string; role: string }, playerText: string | null): ReadableStream<Uint8Array> {
  if (game.status !== 'active') throw new TurnError('This adventure has ended.');
  if (busy.has(game.id)) throw new TurnError('The DM is still responding to your last action.', 409);
  assertWithinQuota(user.id, user.role);

  const db = getDb();
  const adventure = db.select().from(schema.adventures).where(eq(schema.adventures.id, game.adventureId)).get();
  if (!adventure) throw new TurnError('Adventure not found', 404);
  const { model, row: modelRow } = resolveModel(game.modelKey);

  const text = (playerText ?? OPENING_PLAYER_TEXT).trim().slice(0, 4000);
  if (!text) throw new TurnError('Say what you do.');

  const history: StoredMessage[] = db
    .select({ id: schema.messages.id, role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(and(eq(schema.messages.gameId, game.id), gt(schema.messages.id, game.summarizedThrough)))
    .orderBy(asc(schema.messages.id))
    .all();

  const playerMsg = db
    .insert(schema.messages)
    .values({ gameId: game.id, role: 'player', content: text })
    .returning({ id: schema.messages.id })
    .get();

  const character: Character = structuredClone(game.character);
  const state = structuredClone(game.state);
  state.turn += 1;
  const ctx = newTurnContext(character, state, ({ imagePrompt }) => startImageGeneration(game.id, imagePrompt));

  busy.add(game.id);
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (line: StreamLine) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'));
        } catch {
          closed = true;
        }
      };
      send({ t: 'player', id: playerMsg.id, content: text });

      (async () => {
        let narration = '';
        let flushed = 0;
        const flushEvents = () => {
          while (flushed < ctx.events.length) send({ t: 'event', v: ctx.events[flushed++]! });
        };
        try {
          const result = streamText({
            model,
            instructions: buildInstructions({ adventure, summary: game.summary, toolSupport: modelRow.toolSupport }),
            messages: buildMessages(history, text, character, state),
            tools: modelRow.toolSupport ? buildTools(ctx) : undefined,
            stopWhen: isStepCount(8),
            maxOutputTokens: 2000,
            maxRetries: 2,
          });
          for await (const part of result.stream) {
            if (part.type === 'text-delta') {
              narration += part.text;
              send({ t: 'text', v: part.text });
            } else if (part.type === 'tool-result' || part.type === 'tool-error') {
              flushEvents();
            } else if (part.type === 'finish-step') {
              if (narration && !narration.endsWith('\n\n')) {
                narration += '\n\n';
                send({ t: 'text', v: '\n\n' });
              }
            } else if (part.type === 'error') {
              throw part.error;
            }
          }
          flushEvents();
          const usage = await result.totalUsage;
          recordUsage({
            userId: user.id,
            gameId: game.id,
            modelKey: game.modelKey,
            purpose: 'turn',
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          });

          narration = narration.trim();
          if (!narration) narration = '*The DM pauses, lost in thought. Try describing your action again.*';
          const status = state.outcome ? 'ended' : 'active';
          const dmMsg = db.transaction((tx) => {
            const m = tx
              .insert(schema.messages)
              .values({ gameId: game.id, role: 'dm', content: narration, events: ctx.events })
              .returning({ id: schema.messages.id })
              .get();
            tx.update(schema.games).set({ character, state, status, updatedAt: Date.now() }).where(eq(schema.games.id, game.id)).run();
            return m;
          });
          send({ t: 'done', messageId: dmMsg.id, character, state, status });
          void maybeSummarise(game.id, user.id).catch((e) => console.error('[taleweaver] summary failed', e));
        } catch (err) {
          console.error('[taleweaver] turn failed', err);
          // Keep any state changes from tools that already ran (dice were rolled, damage dealt).
          if (ctx.events.length) {
            db.insert(schema.messages)
              .values({ gameId: game.id, role: 'dm', content: narration.trim() || '*(The DM was interrupted.)*', events: ctx.events })
              .run();
            db.update(schema.games).set({ character, state, updatedAt: Date.now() }).where(eq(schema.games.id, game.id)).run();
          }
          send({ t: 'error', message: friendlyError(err) });
        } finally {
          busy.delete(game.id);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {}
          }
        }
      })();
    },
    cancel() {
      // Client went away; the turn keeps running and is saved.
      closed = true;
    },
  });
}

function friendlyError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauthori[sz]ed|invalid.*api key|authentication/i.test(msg)) return 'The AI provider rejected the API key. Ask the admin to check it.';
  if (/429|rate limit|quota/i.test(msg)) return 'The AI provider is rate-limiting requests. Wait a moment and try again.';
  if (/tool/i.test(msg) && /support/i.test(msg)) return 'This model does not support tool calling. Ask the admin to mark it as tool-less, or pick another model.';
  return `The DM could not respond: ${msg.slice(0, 200)}`;
}

/** Folds older turns into a running summary so long games stay within context. */
export async function maybeSummarise(gameId: string, userId: string) {
  const db = getDb();
  const game = db.select().from(schema.games).where(eq(schema.games.id, gameId)).get();
  if (!game) return;
  const pending = db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.gameId, gameId), gt(schema.messages.id, game.summarizedThrough)))
    .orderBy(asc(schema.messages.id))
    .all();
  if (pending.length <= SUMMARISE_AFTER) return;
  const toFold = pending.slice(0, pending.length - KEEP_VERBATIM);
  const through = toFold[toFold.length - 1]!.id;
  const transcript = toFold.map((m) => `${m.role === 'player' ? 'PLAYER' : 'DM'}: ${m.content}`).join('\n\n');
  const modelKey = housekeepingModelKey(game.modelKey);
  const { model } = resolveModel(modelKey);
  const result = await generateText({
    model,
    instructions:
      'You maintain the running summary of a solo D&D session for the Dungeon Master. Merge the previous summary with the new transcript into one concise summary (under 400 words): key events, NPCs met and their attitudes, clues found, promises made, unresolved threads, and where the character is now. Write in past tense, third person. Output only the summary.',
    prompt: `<previous_summary>\n${game.summary || '(none yet)'}\n</previous_summary>\n\n<new_transcript>\n${transcript}\n</new_transcript>`,
    maxOutputTokens: 800,
  });
  recordUsage({
    userId,
    gameId,
    modelKey,
    purpose: 'summary',
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  });
  const summary = result.text.trim();
  if (summary) {
    db.update(schema.games).set({ summary, summarizedThrough: through }).where(eq(schema.games.id, gameId)).run();
  }
}
