import { describe, expect, it } from 'vitest';
import { buildTools, newTurnContext } from '@/server/dm/tools';
import { buildCharacter } from '@/server/characters';
import { emptyState } from '@/server/dm/types';
import type { Rng } from '@/server/dm/dice';

const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

function setup(rng: Rng) {
  const character = buildCharacter({ name: 'Brenna', species: 'Dwarf', className: 'Fighter', background: 'Soldier', level: 1 });
  const state = emptyState();
  const scenes: string[] = [];
  const ctx = newTurnContext(character, state, ({ title }) => {
    scenes.push(title);
    return 'img-1';
  });
  ctx.rng = rng;
  const tools = buildTools(ctx);
  const run = <K extends keyof typeof tools>(name: K, input: unknown) =>
    (tools[name].execute as (i: unknown, o: unknown) => Promise<any>)(tools[name].inputSchema && (tools[name] as any).inputSchema.parse(input), {
      toolCallId: 'x',
      messages: [],
    });
  return { character, state, ctx, run, scenes };
}

describe('DM tools', () => {
  it('uses real proficiency for checks', async () => {
    const { run, ctx, character } = setup(seq(10));
    // Soldier gives Athletics; Fighter Str 17 (+3), proficiency +2.
    expect(character.abilities.str).toBe(17);
    const r = await run('ability_check', { ability: 'str', skill: 'athletics', dc: 15, reason: 'Climb' });
    expect(r).toMatchObject({ total: 15, success: true });
    expect(ctx.events[0]).toMatchObject({ type: 'roll', dc: 15, success: true });
  });

  it('applies attack damage to a tracked combatant', async () => {
    const { run, state } = setup(seq(15, 6));
    await run('manage_combatants', { add: [{ name: 'Bandit', hp: 11, ac: 12 }] });
    const r = await run('attack', { weapon: 'longsword', target: 'bandit' });
    expect(r.hit).toBe(true);
    // 1d8+2 (dueling) + 3 Str = 6 + 2 + 3
    expect(r.damage).toBe(11);
    expect(state.combatants[0]!.hp).toBe(0);
  });

  it('natural 1 always misses and natural 20 crits', async () => {
    const miss = setup(seq(1));
    expect((await miss.run('attack', { weapon: 'first', target: 'x', target_ac: 2 })).hit).toBe(false);
    const crit = setup(seq(20, 4, 4));
    const r = await crit.run('attack', { weapon: 'longsword', target: 'x', target_ac: 30 });
    expect(r).toMatchObject({ hit: true, critical: 'hit', damage: 4 + 4 + 2 + 3 });
  });

  it('enemy attacks hurt the player and can knock them down', async () => {
    const { run, character } = setup(seq(19, 6));
    const r = await run('enemy_attack', { attacker: 'Ogre', attack_name: 'Club', attack_bonus: 6, damage: '1d6+20', damage_type: 'bludgeoning' });
    expect(r.hit).toBe(true);
    expect(character.hp).toBe(0);
    expect(character.conditions).toContain('unconscious');
    expect(character.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('heals and clears unconscious', async () => {
    const { run, character } = setup(seq(20, 6));
    await run('apply_damage', { target: 'player', amount: 100 });
    await run('heal', { target: 'Brenna', amount: 5 });
    expect(character.hp).toBe(5);
    expect(character.conditions).not.toContain('unconscious');
  });

  it('manages inventory and gold', async () => {
    const { run, character } = setup(seq(10));
    await run('update_inventory', { add: ['Silver Key'], remove: ['potion'], gold_delta: -100 });
    expect(character.inventory).toContain('Silver Key');
    expect(character.inventory).not.toContain('Potion of Healing');
    expect(character.gold).toBe(0);
  });

  it('sets the scene and records an image id', async () => {
    const { run, state, scenes } = setup(seq(10));
    await run('set_scene', { title: 'The Gull', image_prompt: 'a tavern', ambience: 'tavern' });
    expect(scenes).toEqual(['The Gull']);
    expect(state.scene).toEqual({ title: 'The Gull', ambience: 'tavern', imageId: 'img-1' });
  });

  it('reports bad dice instead of throwing', async () => {
    const { run } = setup(seq(10));
    expect(await run('roll_dice', { expr: 'lots', reason: 'x' })).toHaveProperty('error');
  });
});
