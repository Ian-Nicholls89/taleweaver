import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAdventureFile } from '@/server/adventures';
import { buildCharacter, CLASSES, pregens, SPECIES, BACKGROUNDS, BuildError } from '@/server/characters';

describe('bundled adventures', () => {
  const dir = path.join(process.cwd(), 'content', 'adventures');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

  it('has at least six', () => expect(files.length).toBeGreaterThanOrEqual(6));

  it.each(files)('%s has valid frontmatter and all sections', (f) => {
    const adv = parseAdventureFile(fs.readFileSync(path.join(dir, f), 'utf8'), f);
    expect(adv.title.length).toBeGreaterThan(3);
    expect(adv.blurb.length).toBeGreaterThan(40);
    for (const section of ['## Hook', '## Scenes', '## NPCs', '## Secrets', '## Possible Endings']) {
      expect(adv.body).toContain(section);
    }
  });
});

describe('character builder', () => {
  it('builds every class/species/background combination at every level', () => {
    for (const className of Object.keys(CLASSES))
      for (const species of Object.keys(SPECIES))
        for (const background of Object.keys(BACKGROUNDS))
          for (const level of [1, 2, 3]) {
            const c = buildCharacter({ name: 'T', className, species, background, level });
            expect(c.hp).toBeGreaterThan(0);
            expect(c.ac).toBeGreaterThanOrEqual(10);
            expect(c.attacks.length).toBeGreaterThan(0);
            expect(new Set(c.skills).size).toBe(c.skills.length);
          }
  });

  it('computes HP by the rules', () => {
    const c = buildCharacter({ name: 'T', className: 'Wizard', species: 'Dwarf', background: 'Sage', level: 3 });
    // Wizard d6: 6 + 2×4 = 14, Con 14 → +2 ×3 = 6, Dwarven Toughness +3
    expect(c.abilities.con).toBe(15);
    expect(c.maxHp).toBe(14 + 6 + 3);
    expect(c.spellSlots).toEqual({ 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } });
  });

  it('enforces the standard array and background bonuses', () => {
    const scores = { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 };
    expect(() => buildCharacter({ name: 'T', className: 'Fighter', species: 'Human', background: 'Soldier', level: 1, scores })).toThrow(BuildError);
    expect(() =>
      buildCharacter({ name: 'T', className: 'Fighter', species: 'Human', background: 'Soldier', level: 1, plusTwo: 'cha', plusOne: 'str' }),
    ).toThrow(/Soldier can only raise/);
  });

  it('loads the pregens', () => {
    const list = pregens();
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (const p of list) expect(() => buildCharacter(p.input)).not.toThrow();
  });
});
