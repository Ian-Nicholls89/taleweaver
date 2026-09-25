import fs from 'node:fs';
import path from 'node:path';
import type { ModelMessage, SystemModelMessage } from 'ai';
import { modifier, proficiencyBonus, type Character, type GameState } from './types';

let rulesCache: string | undefined;
function rulesReference() {
  rulesCache ??= fs.readFileSync(path.join(process.cwd(), 'content', 'srd', 'dm-rules.md'), 'utf8');
  return rulesCache;
}

const PERSONA = `You are the Dungeon Master for a solo, theatre-of-the-mind Dungeons & Dragons (5th edition, SRD 5.2) one-shot. There is exactly one player, who controls one character.

How you run the game:
- Narrate in second person ("you"), present tense. Be vivid but brief: usually 1–3 short paragraphs. Engage more than one sense.
- Never decide what the player character does, says, thinks or feels. Describe the world and how it reacts, then stop.
- End every reply by giving the player something to respond to — a question, a choice, or an NPC waiting on them. Don't list options unless the player seems stuck.
- Voice NPCs with distinct personalities; put their dialogue in quotation marks.
- Follow the adventure notes below as your plan, but adapt when the player goes off-script. Keep the secrets secret until they are discovered in play.
- Pace for a single session of the stated length: move the story along, and steer towards an ending once the climax is resolved.
- Keep the challenge fair for a single character: fewer or weaker enemies than a party would face, and give chances to avoid fights through cleverness.
- Content: keep it in the spirit of a heroic fantasy adventure; honour any content warnings the adventure lists.
- Stay in character as the DM. If the player asks a rules question, answer briefly and return to the scene.
- Use plain prose. No headings, and no bullet lists in narration.`;

const TOOLS_GUIDE = `Game mechanics (you have tools — use them, never fake results):
- Whenever an action's outcome is uncertain, call ability_check with a sensible DC (easy 10, medium 15, hard 20). Describe the result only after you get the tool result.
- Player attacks: call attack. Enemy attacks: call enemy_attack. Anything else (spell damage, random tables): roll_dice, then apply_damage/heal.
- When a fight starts, add the enemies with manage_combatants (use SRD stat blocks, scaled down for one hero). Clear them when it ends.
- Items and gold: update_inventory. Conditions: set_condition. Spell slots: use_spell_slot.
- Call set_scene when the player arrives somewhere new or the mood changes significantly (not every turn). The opening turn must start with set_scene.
- Occasionally use play_sfx for a dramatic beat. Use note_progress for key milestones.
- If the player drops to 0 HP, they make death saving throws with death_save on their turns.
- When the story concludes, call end_adventure, then narrate a short epilogue.
- Do not mention tool names or dice mechanics in your narration beyond the natural "you roll a 17"-style mention.`;

const NO_TOOLS_GUIDE = `Game mechanics: you cannot roll dice yourself in this mode. When the outcome of an action is uncertain, tell the player what to roll (for example "Make a Dexterity (Stealth) check, DC 13 — roll a d20 and add your Stealth bonus") and wait for them to report the result. The player has a dice roller. For enemy attacks and damage, pick fair, average results and state them. Track hit points and items yourself using the character sheet provided.`;

export function describeCharacter(c: Character) {
  const pb = proficiencyBonus(c.level);
  const abil = (Object.entries(c.abilities) as Array<[keyof Character['abilities'], number]>)
    .map(([k, v]) => `${k.toUpperCase()} ${v} (${modifier(v) >= 0 ? '+' : ''}${modifier(v)})`)
    .join(', ');
  const attacks = c.attacks
    .map((a) => {
      const hit = modifier(c.abilities[a.ability]) + (a.proficient === false ? 0 : pb) + (a.hitBonus ?? 0);
      const dmgMod = modifier(c.abilities[a.ability]);
      return `${a.name} (+${hit} to hit, ${a.damage}${dmgMod >= 0 ? '+' : ''}${dmgMod} ${a.damageType}${a.range ? `, ${a.range}` : ''}${a.notes ? `; ${a.notes}` : ''})`;
    })
    .join('; ');
  const slots = c.spellSlots
    ? Object.entries(c.spellSlots)
        .map(([lvl, s]) => `level ${lvl}: ${s.max - s.used}/${s.max}`)
        .join(', ')
    : '';
  return [
    `${c.name} — level ${c.level} ${c.species} ${c.className} (${c.background})`,
    c.description ? `Appearance/personality: ${c.description}` : '',
    `HP ${c.hp}/${c.maxHp}${c.tempHp ? ` (+${c.tempHp} temp)` : ''}, AC ${c.ac}, speed ${c.speed} ft, proficiency +${pb}`,
    `Abilities: ${abil}`,
    `Saving throw proficiencies: ${c.saves.map((s) => s.toUpperCase()).join(', ') || 'none'}`,
    `Skill proficiencies: ${c.skills.join(', ') || 'none'}`,
    `Attacks: ${attacks || 'none'}`,
    c.features.length ? `Features: ${c.features.join('; ')}` : '',
    c.spells.length ? `Spells: ${c.spells.join(', ')}` : '',
    slots ? `Spell slots: ${slots}` : '',
    `Inventory: ${c.inventory.join(', ') || 'nothing'}; ${c.gold} gp`,
    c.conditions.length ? `Conditions: ${c.conditions.join(', ')}` : '',
    c.deathSaves ? `Death saves: ${c.deathSaves.successes} successes, ${c.deathSaves.failures} failures` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function describeState(state: GameState) {
  const lines: string[] = [];
  if (state.scene) lines.push(`Current scene: ${state.scene.title} (ambience: ${state.scene.ambience})`);
  if (state.combatants.length) {
    lines.push(
      'Combatants: ' +
        state.combatants.map((c) => `${c.name} ${c.hp}/${c.maxHp} HP, AC ${c.ac}${c.conditions.length ? ` [${c.conditions.join(', ')}]` : ''}`).join('; '),
    );
  }
  if (state.progress.length) lines.push('Milestones so far: ' + state.progress.join(' | '));
  if (state.outcome) lines.push(`The adventure has ended: ${state.outcome}`);
  return lines.join('\n') || 'Nothing notable yet.';
}

export type AdventureForPrompt = { title: string; blurb: string; level: string; length: string; warnings: string[]; body: string };

const MAX_ADVENTURE_CHARS = 60_000;

export function buildInstructions(opts: {
  adventure: AdventureForPrompt;
  summary: string;
  toolSupport: boolean;
}): SystemModelMessage[] {
  const { adventure } = opts;
  const body = adventure.body.length > MAX_ADVENTURE_CHARS ? adventure.body.slice(0, MAX_ADVENTURE_CHARS) + '\n…' : adventure.body;
  // The first block never changes during a game, so providers that support
  // prompt caching can reuse it every turn.
  const stable = [
    PERSONA,
    opts.toolSupport ? TOOLS_GUIDE : NO_TOOLS_GUIDE,
    `<rules_reference>\n${rulesReference()}\n</rules_reference>`,
    `<adventure title="${adventure.title}" level="${adventure.level}" length="${adventure.length}">\nBlurb: ${adventure.blurb}\n${
      adventure.warnings.length ? `Content warnings: ${adventure.warnings.join(', ')}\n` : ''
    }\n${body}\n</adventure>`,
  ].join('\n\n');
  const messages: SystemModelMessage[] = [
    { role: 'system', content: stable, providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } },
  ];
  if (opts.summary) {
    messages.push({ role: 'system', content: `<story_so_far>\n${opts.summary}\n</story_so_far>` });
  }
  return messages;
}

export type StoredMessage = { id: number; role: 'player' | 'dm'; content: string };

/**
 * Past turns go in as plain text; the live character sheet and game state ride
 * along with the newest player message so the earlier history stays
 * byte-identical between turns (better prompt-cache hits).
 */
export function buildMessages(history: StoredMessage[], playerText: string, character: Character, state: GameState): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of history) {
    const role = m.role === 'player' ? 'user' : 'assistant';
    const prev = out[out.length - 1];
    // Merge consecutive same-role messages (e.g. after a failed turn left a player message without a reply).
    if (prev && prev.role === role && typeof prev.content === 'string') {
      prev.content += '\n\n' + m.content;
    } else {
      out.push({ role, content: m.content } as ModelMessage);
    }
  }
  const last = out[out.length - 1];
  if (last) last.providerOptions = { anthropic: { cacheControl: { type: 'ephemeral' } } };

  const current = `<character_sheet>\n${describeCharacter(character)}\n</character_sheet>\n<game_state>\n${describeState(state)}\n</game_state>\n\nPlayer: ${playerText}`;
  if (out.length && out[out.length - 1]!.role === 'user') {
    out[out.length - 1]!.content += '\n\n' + current;
    delete out[out.length - 1]!.providerOptions;
  } else {
    out.push({ role: 'user', content: current });
  }
  return out;
}

export const OPENING_PLAYER_TEXT = 'Begin the adventure. Set the opening scene and introduce the hook.';
