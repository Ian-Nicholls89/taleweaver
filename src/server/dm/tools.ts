import { tool } from 'ai';
import { z } from 'zod';
import { critExpression, cryptoRng, rollD20, rollDice, type Rng } from './dice';
import {
  ABILITIES,
  AMBIENCE_TAGS,
  SFX_TAGS,
  SKILLS,
  modifier,
  proficiencyBonus,
  type Character,
  type Combatant,
  type GameEvent,
  type GameState,
} from './types';

export type TurnContext = {
  character: Character;
  state: GameState;
  events: GameEvent[];
  rng: Rng;
  /** Called when the DM sets a new scene; returns the image id if one is being generated. */
  onScene?: (scene: { title: string; imagePrompt: string; ambience: string }) => string | null;
};

export function newTurnContext(character: Character, state: GameState, onScene?: TurnContext['onScene']): TurnContext {
  return { character, state, events: [], rng: cryptoRng, onScene };
}

const modeSchema = z.enum(['normal', 'advantage', 'disadvantage']).default('normal');

function findCombatant(state: GameState, name: string): Combatant | undefined {
  const n = name.trim().toLowerCase();
  return state.combatants.find((c) => c.name.toLowerCase() === n) ?? state.combatants.find((c) => c.name.toLowerCase().includes(n));
}

function isPlayer(ctx: TurnContext, target: string) {
  const t = target.trim().toLowerCase();
  return t === 'player' || t === 'you' || t === ctx.character.name.toLowerCase() || ctx.character.name.toLowerCase().startsWith(t);
}

function damagePlayer(ctx: TurnContext, amount: number) {
  const c = ctx.character;
  let remaining = amount;
  if (c.tempHp > 0) {
    const absorbed = Math.min(c.tempHp, remaining);
    c.tempHp -= absorbed;
    remaining -= absorbed;
  }
  c.hp = Math.max(0, c.hp - remaining);
  ctx.events.push({ type: 'hp', target: c.name, delta: -amount, hp: c.hp, maxHp: c.maxHp });
  if (c.hp === 0) {
    c.deathSaves ??= { successes: 0, failures: 0 };
    if (!c.conditions.includes('unconscious')) c.conditions.push('unconscious');
  }
  return { target: c.name, hp: c.hp, maxHp: c.maxHp, tempHp: c.tempHp, down: c.hp === 0 };
}

function damageCombatant(ctx: TurnContext, target: Combatant, amount: number) {
  target.hp = Math.max(0, target.hp - amount);
  ctx.events.push({ type: 'hp', target: target.name, delta: -amount, hp: target.hp, maxHp: target.maxHp });
  return { target: target.name, hp: target.hp, maxHp: target.maxHp, defeated: target.hp === 0 };
}

export function buildTools(ctx: TurnContext) {
  const ch = () => ctx.character;

  return {
    roll_dice: tool({
      description:
        'Roll dice for anything not covered by the other tools (damage for a spell, a random table, an NPC check). Never invent roll results — always use a tool.',
      inputSchema: z.object({
        expr: z.string().describe('Dice expression, e.g. "1d20+3", "2d6", "8d6", "4d6kh3"'),
        reason: z.string().describe('What the roll is for, shown to the player'),
      }),
      execute: async ({ expr, reason }) => {
        try {
          const r = rollDice(expr, ctx.rng);
          ctx.events.push({ type: 'roll', label: reason, expr: r.expr, rolls: r.rolls, kept: r.kept, modifier: r.modifier, total: r.total });
          return { total: r.total, rolls: r.rolls };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    ability_check: tool({
      description:
        "Roll an ability check or saving throw for the player character, using their real modifiers and proficiencies. Use whenever the outcome of the player's action is uncertain.",
      inputSchema: z.object({
        ability: z.enum(ABILITIES),
        skill: z.string().optional().describe('Skill name for checks, e.g. "perception", "stealth"'),
        save: z.boolean().default(false).describe('true for a saving throw'),
        dc: z.number().int().min(1).max(40).optional(),
        mode: modeSchema,
        reason: z.string(),
      }),
      execute: async ({ ability, skill, save, dc, mode, reason }) => {
        const c = ch();
        const skillKey = skill?.toLowerCase();
        const useAbility = skillKey && SKILLS[skillKey] ? SKILLS[skillKey]! : ability;
        let mod = modifier(c.abilities[useAbility]);
        const pb = proficiencyBonus(c.level);
        const proficient = save ? c.saves.includes(useAbility) : !!skillKey && c.skills.map((s) => s.toLowerCase()).includes(skillKey);
        if (proficient) mod += pb;
        const r = rollD20(mod, mode, ctx.rng);
        const success = dc === undefined ? undefined : r.total >= dc;
        const label = `${reason} (${skillKey ?? useAbility.toUpperCase()}${save ? ' save' : ''})`;
        ctx.events.push({ type: 'roll', label, expr: r.expr, rolls: r.rolls, modifier: mod, total: r.total, dc, success });
        return { total: r.total, natural: r.natural, dc, success };
      },
    }),

    attack: tool({
      description:
        "Make the player character's attack roll with one of their listed attacks. If target_ac is given and the attack hits, damage is rolled and applied to that combatant automatically.",
      inputSchema: z.object({
        weapon: z.string().describe('Name of one of the character\'s attacks (or "first")'),
        target: z.string(),
        target_ac: z.number().int().min(1).max(30).optional(),
        mode: modeSchema,
      }),
      execute: async ({ weapon, target, target_ac, mode }) => {
        const c = ch();
        const w = weapon.toLowerCase();
        const atk = c.attacks.find((a) => a.name.toLowerCase() === w) ?? c.attacks.find((a) => a.name.toLowerCase().includes(w)) ?? c.attacks[0];
        if (!atk) return { error: 'The character has no attacks listed; use roll_dice instead.' };
        const abilityMod = modifier(c.abilities[atk.ability]);
        const toHit = abilityMod + (atk.proficient === false ? 0 : proficiencyBonus(c.level)) + (atk.hitBonus ?? 0);
        const combatant = findCombatant(ctx.state, target);
        const ac = target_ac ?? combatant?.ac;
        const r = rollD20(toHit, mode, ctx.rng);
        const critical = r.natural === 20 ? 'hit' : r.natural === 1 ? 'miss' : null;
        const hit = ac === undefined ? undefined : critical === 'hit' || (critical !== 'miss' && r.total >= ac);
        ctx.events.push({ type: 'roll', label: `${atk.name} vs ${target}`, expr: r.expr, rolls: r.rolls, modifier: toHit, total: r.total, dc: ac, success: hit, critical });
        const result: Record<string, unknown> = { attack: atk.name, total: r.total, natural: r.natural, hit, critical };
        if (hit) {
          const expr = `${critical === 'hit' ? critExpression(atk.damage) : atk.damage}${abilityMod >= 0 ? '+' : ''}${abilityMod}`;
          const dmg = rollDice(expr, ctx.rng);
          const amount = Math.max(1, dmg.total);
          ctx.events.push({ type: 'roll', label: `${atk.name} damage (${atk.damageType})`, expr: dmg.expr, rolls: dmg.rolls, modifier: dmg.modifier, total: amount });
          result.damage = amount;
          result.damageType = atk.damageType;
          if (combatant) result.target = damageCombatant(ctx, combatant, amount);
        }
        return result;
      },
    }),

    enemy_attack: tool({
      description:
        "Roll an enemy's attack against the player character's AC. Damage is rolled and applied to the player automatically on a hit.",
      inputSchema: z.object({
        attacker: z.string(),
        attack_name: z.string(),
        attack_bonus: z.number().int().min(-5).max(20),
        damage: z.string().describe('Damage dice including modifier, e.g. "1d6+2"'),
        damage_type: z.string(),
        mode: modeSchema,
      }),
      execute: async ({ attacker, attack_name, attack_bonus, damage, damage_type, mode }) => {
        const c = ch();
        const r = rollD20(attack_bonus, mode, ctx.rng);
        const critical = r.natural === 20 ? 'hit' : r.natural === 1 ? 'miss' : null;
        const hit = critical === 'hit' || (critical !== 'miss' && r.total >= c.ac);
        ctx.events.push({ type: 'roll', label: `${attacker}: ${attack_name}`, expr: r.expr, rolls: r.rolls, modifier: attack_bonus, total: r.total, dc: c.ac, success: hit, critical });
        if (!hit) return { hit: false, total: r.total, playerAc: c.ac };
        try {
          const dmg = rollDice(critical === 'hit' ? critExpression(damage) : damage, ctx.rng);
          const amount = Math.max(1, dmg.total);
          ctx.events.push({ type: 'roll', label: `${attack_name} damage (${damage_type})`, expr: dmg.expr, rolls: dmg.rolls, modifier: dmg.modifier, total: amount });
          return { hit: true, critical, damage: amount, player: damagePlayer(ctx, amount) };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    apply_damage: tool({
      description: 'Apply damage to the player or a combatant (for damage already rolled with roll_dice, falls, traps, etc.).',
      inputSchema: z.object({ target: z.string().describe('"player" or a combatant name'), amount: z.number().int().min(0).max(500) }),
      execute: async ({ target, amount }) => {
        if (isPlayer(ctx, target)) return damagePlayer(ctx, amount);
        const c = findCombatant(ctx.state, target);
        if (!c) return { error: `No combatant named ${target}. Add them with manage_combatants first.` };
        return damageCombatant(ctx, c, amount);
      },
    }),

    heal: tool({
      description: 'Restore hit points to the player or a combatant, or grant the player temporary hit points.',
      inputSchema: z.object({
        target: z.string(),
        amount: z.number().int().min(0).max(500),
        temporary: z.boolean().default(false),
      }),
      execute: async ({ target, amount, temporary }) => {
        if (isPlayer(ctx, target)) {
          const c = ch();
          if (temporary) c.tempHp = Math.max(c.tempHp, amount);
          else {
            c.hp = Math.min(c.maxHp, c.hp + amount);
            if (c.hp > 0) {
              c.conditions = c.conditions.filter((x) => x !== 'unconscious');
              c.deathSaves = undefined;
            }
          }
          ctx.events.push({ type: 'hp', target: c.name, delta: amount, hp: c.hp, maxHp: c.maxHp });
          return { hp: c.hp, maxHp: c.maxHp, tempHp: c.tempHp };
        }
        const cb = findCombatant(ctx.state, target);
        if (!cb) return { error: `No combatant named ${target}` };
        cb.hp = Math.min(cb.maxHp, cb.hp + amount);
        ctx.events.push({ type: 'hp', target: cb.name, delta: amount, hp: cb.hp, maxHp: cb.maxHp });
        return { hp: cb.hp, maxHp: cb.maxHp };
      },
    }),

    death_save: tool({
      description: 'Roll a death saving throw for the player character when they are at 0 HP.',
      inputSchema: z.object({}),
      execute: async () => {
        const c = ch();
        if (c.hp > 0) return { error: 'The player is not at 0 HP.' };
        c.deathSaves ??= { successes: 0, failures: 0 };
        const r = rollD20(0, 'normal', ctx.rng);
        if (r.natural === 20) {
          c.hp = 1;
          c.deathSaves = undefined;
          c.conditions = c.conditions.filter((x) => x !== 'unconscious');
        } else if (r.natural === 1) c.deathSaves.failures += 2;
        else if (r.natural >= 10) c.deathSaves.successes += 1;
        else c.deathSaves.failures += 1;
        const ds = c.deathSaves;
        const stable = !!ds && ds.successes >= 3;
        const dead = !!ds && ds.failures >= 3;
        ctx.events.push({ type: 'roll', label: 'Death saving throw', expr: '1d20', rolls: r.rolls, modifier: 0, total: r.total, dc: 10, success: r.natural >= 10 });
        return { natural: r.natural, revived: r.natural === 20, successes: ds?.successes ?? 0, failures: ds?.failures ?? 0, stable, dead };
      },
    }),

    manage_combatants: tool({
      description: 'Track enemies/allies in a fight: add them with HP and AC when combat starts, remove them when they flee or the fight ends.',
      inputSchema: z.object({
        add: z.array(z.object({ name: z.string(), hp: z.number().int().min(1).max(1000), ac: z.number().int().min(1).max(30) })).default([]),
        remove: z.array(z.string()).default([]),
        clear: z.boolean().default(false).describe('Remove everyone (end of combat)'),
      }),
      execute: async ({ add, remove, clear }) => {
        const s = ctx.state;
        if (clear) {
          for (const c of s.combatants) ctx.events.push({ type: 'combatant', action: 'remove', name: c.name });
          s.combatants = [];
        }
        for (const name of remove) {
          const c = findCombatant(s, name);
          if (c) {
            s.combatants = s.combatants.filter((x) => x !== c);
            ctx.events.push({ type: 'combatant', action: 'remove', name: c.name });
          }
        }
        for (const a of add) {
          let name = a.name;
          let i = 2;
          while (s.combatants.some((c) => c.name.toLowerCase() === name.toLowerCase())) name = `${a.name} ${i++}`;
          s.combatants.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, hp: a.hp, maxHp: a.hp, ac: a.ac, conditions: [] });
          ctx.events.push({ type: 'combatant', action: 'add', name });
        }
        return { combatants: s.combatants.map(({ name, hp, maxHp, ac }) => ({ name, hp, maxHp, ac })) };
      },
    }),

    update_inventory: tool({
      description: "Add or remove items from the player's inventory, or change their gold.",
      inputSchema: z.object({
        add: z.array(z.string()).default([]),
        remove: z.array(z.string()).default([]),
        gold_delta: z.number().int().default(0),
      }),
      execute: async ({ add, remove, gold_delta }) => {
        const c = ch();
        for (const item of remove) {
          const idx = c.inventory.findIndex((x) => x.toLowerCase() === item.toLowerCase());
          const fuzzy = idx >= 0 ? idx : c.inventory.findIndex((x) => x.toLowerCase().includes(item.toLowerCase()));
          if (fuzzy >= 0) {
            ctx.events.push({ type: 'item', action: 'remove', item: c.inventory[fuzzy]! });
            c.inventory.splice(fuzzy, 1);
          }
        }
        for (const item of add) {
          c.inventory.push(item);
          ctx.events.push({ type: 'item', action: 'add', item });
        }
        if (gold_delta) {
          c.gold = Math.max(0, c.gold + gold_delta);
          ctx.events.push({ type: 'gold', delta: gold_delta, gold: c.gold });
        }
        return { inventory: c.inventory, gold: c.gold };
      },
    }),

    set_condition: tool({
      description: 'Add or remove a condition (poisoned, frightened, prone, …) on the player or a combatant.',
      inputSchema: z.object({ target: z.string(), condition: z.string(), active: z.boolean() }),
      execute: async ({ target, condition, active }) => {
        const cond = condition.toLowerCase();
        const holder = isPlayer(ctx, target) ? ch() : findCombatant(ctx.state, target);
        if (!holder) return { error: `No target named ${target}` };
        holder.conditions = holder.conditions.filter((c) => c !== cond);
        if (active) holder.conditions.push(cond);
        ctx.events.push({ type: 'condition', target: holder.name, condition: cond, active });
        return { target: holder.name, conditions: holder.conditions };
      },
    }),

    use_spell_slot: tool({
      description: 'Spend one of the player character\'s spell slots when they cast a levelled spell.',
      inputSchema: z.object({ level: z.number().int().min(1).max(9) }),
      execute: async ({ level }) => {
        const slots = ch().spellSlots?.[String(level)];
        if (!slots) return { error: `No level ${level} slots.` };
        if (slots.used >= slots.max) return { error: `No level ${level} slots left.` };
        slots.used += 1;
        return { level, remaining: slots.max - slots.used };
      },
    }),

    set_scene: tool({
      description:
        'Call when the party arrives somewhere new or the mood shifts significantly. Updates the scene title, background ambience and generates an illustration. Do not call more than once per turn.',
      inputSchema: z.object({
        title: z.string().max(80),
        image_prompt: z
          .string()
          .max(600)
          .describe('Visual description of the location for an illustrator: setting, lighting, key figures. No text or UI.'),
        ambience: z.enum(AMBIENCE_TAGS),
      }),
      execute: async ({ title, image_prompt, ambience }) => {
        const imageId = ctx.onScene?.({ title, imagePrompt: image_prompt, ambience }) ?? null;
        ctx.state.scene = { title, ambience, imageId };
        ctx.events.push({ type: 'scene', title, ambience, imageId });
        return { ok: true };
      },
    }),

    play_sfx: tool({
      description: 'Play a short sound effect at a dramatic moment.',
      inputSchema: z.object({ name: z.enum(SFX_TAGS) }),
      execute: async ({ name }) => {
        ctx.events.push({ type: 'sfx', name });
        return { ok: true };
      },
    }),

    note_progress: tool({
      description: 'Record a key story milestone (clue found, NPC met, objective reached) so it is remembered later.',
      inputSchema: z.object({ note: z.string().max(300) }),
      execute: async ({ note }) => {
        ctx.state.progress.push(note);
        ctx.events.push({ type: 'progress', note });
        return { ok: true };
      },
    }),

    end_adventure: tool({
      description: 'Call once when the adventure reaches an ending (victory, defeat, or another conclusion), then narrate the epilogue.',
      inputSchema: z.object({ outcome: z.string().max(500) }),
      execute: async ({ outcome }) => {
        ctx.state.outcome = outcome;
        ctx.events.push({ type: 'end', outcome });
        return { ok: true };
      },
    }),
  };
}

export type DmTools = ReturnType<typeof buildTools>;
