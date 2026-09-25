import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';

/**
 * A scripted "DM" for development and end-to-end tests, enabled with
 * TALEWEAVER_ENABLE_MOCK=1. It exercises the same tool-calling paths a real
 * model would: scene changes on the first turn, attacks, checks, and plain
 * narration.
 */

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

/** The player's words from the newest user message (after the character sheet and state blocks). */
function lastUserText(options: LanguageModelV4CallOptions) {
  for (let i = options.prompt.length - 1; i >= 0; i--) {
    const m = options.prompt[i]!;
    if (m.role === 'user') {
      const text = m.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
      const idx = text.lastIndexOf('Player:');
      return (idx >= 0 ? text.slice(idx + 7) : text).toLowerCase();
    }
  }
  return '';
}

function textChunks(text: string): LanguageModelV4StreamPart[] {
  const words = text.split(/(?<= )/);
  return [
    { type: 'text-start', id: 't1' },
    ...words.map((w) => ({ type: 'text-delta' as const, id: 't1', delta: w })),
    { type: 'text-end', id: 't1' },
  ];
}

function toolCall(name: string, input: object): LanguageModelV4StreamPart[] {
  return [{ type: 'tool-call', toolCallId: `call-${name}-${Math.random().toString(36).slice(2, 8)}`, toolName: name, input: JSON.stringify(input) }];
}

function finish(reason: 'stop' | 'tool-calls'): LanguageModelV4StreamPart {
  return { type: 'finish', finishReason: { unified: reason, raw: undefined }, usage };
}

function jsonReply(options: LanguageModelV4CallOptions): string {
  const schema = JSON.stringify(options.responseFormat && 'schema' in options.responseFormat ? options.responseFormat.schema : {});
  if (schema.includes('pitches')) {
    return JSON.stringify({
      pitches: [
        { title: 'The Lantern Thief', blurb: 'Every lantern in Millbrook has gone dark overnight, and the shadows are getting bolder.', level: '1', length: '2 hours', tags: ['mystery', 'town'] },
        { title: 'Salt and Bone', blurb: 'A shipwreck washes ashore with no crew — only a sealed reliquary and scratch marks on the inside of the hull.', level: '2', length: '3 hours', tags: ['coastal', 'horror'] },
        { title: 'The Goblin Who Wanted a Hat', blurb: 'A goblin chieftain offers you safe passage in exchange for the finest hat in the kingdom.', level: '1', length: '2 hours', tags: ['comedy', 'social'] },
      ],
    });
  }
  if (schema.includes('secrets') || schema.includes('body')) {
    return JSON.stringify({
      title: 'The Lantern Thief',
      blurb: 'Every lantern in Millbrook has gone dark overnight, and the shadows are getting bolder.',
      level: '1',
      length: '2 hours',
      tags: ['mystery', 'town'],
      warnings: [],
      body: '## Hook\nThe reeve begs for help.\n\n## Scenes\n1. The dark square.\n2. The chandler\'s shop.\n3. The old well.\n\n## NPCs\n- Reeve Hollis\n\n## Encounters\n- Shadow (SRD)\n\n## Secrets\n- The chandler made a bargain.\n\n## Endings\n- Lights restored.',
    });
  }
  return JSON.stringify({ ok: true });
}

function respond(options: LanguageModelV4CallOptions): LanguageModelV4StreamPart[] {
  const last = options.prompt[options.prompt.length - 1];
  const hasTools = (options.tools?.length ?? 0) > 0;

  if (options.responseFormat?.type === 'json') return [...textChunks(jsonReply(options)), finish('stop')];

  if (!hasTools) {
    return [...textChunks('The hero has begun their adventure and made steady progress.'), finish('stop')];
  }

  if (last?.role === 'tool') {
    const results = last.content.filter((p) => p.type === 'tool-result');
    const names = results.map((r) => (r.type === 'tool-result' ? r.toolName : ''));
    if (names.includes('set_scene')) {
      return [
        ...textChunks(
          'Rain drums on the slate roof of the Gilded Gull as you shake the road from your cloak. A hooded stranger in the corner raises a cup towards you. What do you do?',
        ),
        finish('stop'),
      ];
    }
    if (names.includes('attack')) {
      return [...textChunks('Steel rings against steel as your blow lands — or glances away. The bandit snarls and circles. What next?'), finish('stop')];
    }
    return [...textChunks('The dice settle. You notice fresh mud on the floorboards leading to the cellar door. What do you do?'), finish('stop')];
  }

  const text = lastUserText(options);
  const isOpening = !options.prompt.some((m) => m.role === 'assistant');
  if (isOpening || text.includes('begin the adventure')) {
    return [
      ...toolCall('set_scene', {
        title: 'The Gilded Gull',
        image_prompt: 'a cosy rain-lashed fantasy tavern at night, firelight, hooded stranger in a corner booth',
        ambience: 'tavern',
      }),
      finish('tool-calls'),
    ];
  }
  if (/attack|strike|hit|swing|shoot/.test(text)) {
    return [...toolCall('attack', { weapon: 'first', target: 'Bandit', target_ac: 12 }), finish('tool-calls')];
  }
  if (/look|search|check|investigate|listen/.test(text)) {
    return [...toolCall('ability_check', { ability: 'wis', skill: 'perception', dc: 12, reason: 'Searching the room' }), finish('tool-calls')];
  }
  return [...textChunks('The stranger leans closer. "You have the look of someone who can keep a secret," they murmur. What do you say?'), finish('stop')];
}

export function createMockModel(modelId: string) {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doStream: async (options) => ({
      stream: simulateReadableStream({ chunks: respond(options), chunkDelayInMs: 15 }),
    }),
    doGenerate: async (options) => {
      const parts = respond(options);
      const text = parts.map((p) => (p.type === 'text-delta' ? p.delta : '')).join('');
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}
