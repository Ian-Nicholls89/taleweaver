import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ABILITIES, SKILLS, modifier, type Ability, type Attack, type Character } from './dm/types';

/**
 * A small SRD 5.2 character builder for levels 1–3. It produces a playable
 * sheet from a handful of choices; the pre-generated heroes use the same inputs.
 */

type ClassTemplate = {
  hitDie: number;
  saves: [Ability, Ability];
  skillChoices: number;
  skillList: string[];
  priority: Ability[]; // for auto-assigning the standard array
  ac: (mods: Record<Ability, number>) => number;
  attacks: Attack[];
  features: Record<1 | 2 | 3, string[]>;
  spells?: Record<1 | 2 | 3, string[]>;
  slots?: 'full' | 'half' | 'pact';
  inventory: string[];
  gold: number;
};

const ALL_SKILLS = Object.keys(SKILLS);

export const CLASSES: Record<string, ClassTemplate> = {
  Barbarian: {
    hitDie: 12,
    saves: ['str', 'con'],
    skillChoices: 2,
    skillList: ['animal handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    priority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    ac: (m) => 10 + m.dex + m.con,
    attacks: [
      { name: 'Greataxe', ability: 'str', damage: '1d12', damageType: 'slashing', notes: 'heavy, two-handed; +2 damage while raging' },
      { name: 'Handaxe', ability: 'str', damage: '1d6', damageType: 'slashing', range: 'thrown 20/60 ft' },
    ],
    features: {
      1: ['Rage (2/long rest: +2 melee damage, resistance to bludgeoning/piercing/slashing, advantage on Strength checks and saves)', 'Unarmored Defense', 'Weapon Mastery'],
      2: ['Danger Sense (advantage on Dexterity saves you can see coming)', 'Reckless Attack'],
      3: ['Rage uses: 3', 'Primal Knowledge', 'Path of the Berserker: Frenzy (extra damage on your first reckless hit each turn while raging)'],
    },
    inventory: ['Greataxe', 'Handaxe ×4', "Explorer's Pack"],
    gold: 15,
  },
  Bard: {
    hitDie: 8,
    saves: ['dex', 'cha'],
    skillChoices: 3,
    skillList: ALL_SKILLS,
    priority: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
    ac: (m) => 11 + m.dex,
    attacks: [
      { name: 'Rapier', ability: 'dex', damage: '1d8', damageType: 'piercing' },
      { name: 'Vicious Mockery', ability: 'cha', damage: '1d6', damageType: 'psychic', proficient: true, notes: 'cantrip; really a Wisdom save — target has disadvantage on its next attack' },
    ],
    features: {
      1: ['Bardic Inspiration (d6, uses = Charisma modifier per long rest)', 'Spellcasting (Charisma)'],
      2: ['Expertise (double proficiency in two skills)', 'Jack of All Trades'],
      3: ['College of Lore: Cutting Words, bonus proficiencies'],
    },
    spells: {
      1: ['Vicious Mockery', 'Minor Illusion', 'Healing Word', 'Charm Person', 'Dissonant Whispers', 'Thunderwave'],
      2: ['Sleep'],
      3: ['Hold Person', 'Invisibility'],
    },
    slots: 'full',
    inventory: ['Leather Armor', 'Rapier', 'Lute', "Entertainer's Pack"],
    gold: 19,
  },
  Cleric: {
    hitDie: 8,
    saves: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    priority: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
    ac: (m) => 13 + Math.min(m.dex, 2) + 2, // Chain Shirt (13 + Dex, max 2) + Shield
    attacks: [
      { name: 'Mace', ability: 'str', damage: '1d6', damageType: 'bludgeoning' },
      { name: 'Sacred Flame', ability: 'wis', damage: '1d8', damageType: 'radiant', notes: 'cantrip, 60 ft; really a Dexterity save' },
    ],
    features: {
      1: ['Spellcasting (Wisdom)', 'Divine Order: Protector (heavy armor and martial weapons)'],
      2: ['Channel Divinity (2/rest): Divine Spark (heal or harm 1d8 + Wis), Turn Undead'],
      3: ['Life Domain: Disciple of Life (healing spells heal extra 2 + spell level), Preserve Life'],
    },
    spells: {
      1: ['Sacred Flame', 'Guidance', 'Spare the Dying', 'Cure Wounds', 'Bless', 'Guiding Bolt', 'Shield of Faith'],
      2: ['Healing Word'],
      3: ['Spiritual Weapon', 'Lesser Restoration', 'Aid'],
    },
    slots: 'full',
    inventory: ['Chain Shirt', 'Shield', 'Mace', 'Holy Symbol', "Priest's Pack"],
    gold: 7,
  },
  Druid: {
    hitDie: 8,
    saves: ['int', 'wis'],
    skillChoices: 2,
    skillList: ['arcana', 'animal handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
    priority: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
    ac: (m) => 11 + m.dex + 2,
    attacks: [
      { name: 'Quarterstaff (Shillelagh)', ability: 'wis', damage: '1d8', damageType: 'bludgeoning', notes: 'Shillelagh cantrip active' },
      { name: 'Produce Flame', ability: 'wis', damage: '1d8', damageType: 'fire', notes: 'cantrip, 60 ft' },
    ],
    features: {
      1: ['Spellcasting (Wisdom)', 'Druidic', 'Primal Order: Magician (extra cantrip, bonus to Arcana/Nature)'],
      2: ['Wild Shape (2/rest; beasts up to CR 1/4, no flying speed)', 'Wild Companion'],
      3: ["Circle of the Land: Land's Aid, bonus circle spells"],
    },
    spells: {
      1: ['Shillelagh', 'Produce Flame', 'Guidance', 'Healing Word', 'Entangle', 'Faerie Fire', 'Thunderwave'],
      2: ['Cure Wounds'],
      3: ['Moonbeam', 'Barkskin'],
    },
    slots: 'full',
    inventory: ['Leather Armor', 'Shield', 'Quarterstaff', 'Druidic Focus (sprig of mistletoe)', "Explorer's Pack", 'Herbalism Kit'],
    gold: 9,
  },
  Fighter: {
    hitDie: 10,
    saves: ['str', 'con'],
    skillChoices: 2,
    skillList: ['acrobatics', 'animal handling', 'athletics', 'history', 'insight', 'intimidation', 'persuasion', 'perception', 'survival'],
    priority: ['str', 'con', 'dex', 'wis', 'int', 'cha'],
    ac: () => 18, // Chain Mail + Shield
    attacks: [
      { name: 'Longsword', ability: 'str', damage: '1d8+2', damageType: 'slashing', notes: 'Dueling fighting style included' },
      { name: 'Javelin', ability: 'str', damage: '1d6', damageType: 'piercing', range: 'thrown 30/120 ft' },
    ],
    features: {
      1: ['Fighting Style: Dueling', 'Second Wind (bonus action: regain 1d10 + level HP; 2/rest)', 'Weapon Mastery'],
      2: ['Action Surge (one extra action per rest)', 'Tactical Mind'],
      3: ['Champion: Improved Critical (crit on 19–20)', 'Remarkable Athlete'],
    },
    inventory: ['Chain Mail', 'Shield', 'Longsword', 'Javelin ×8', "Dungeoneer's Pack"],
    gold: 4,
  },
  Monk: {
    hitDie: 8,
    saves: ['str', 'dex'],
    skillChoices: 2,
    skillList: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    ac: (m) => 10 + m.dex + m.wis,
    attacks: [
      { name: 'Unarmed Strike', ability: 'dex', damage: '1d6', damageType: 'bludgeoning', notes: 'Martial Arts: bonus-action unarmed strike after attacking' },
      { name: 'Spear', ability: 'dex', damage: '1d6', damageType: 'piercing' },
    ],
    features: {
      1: ['Martial Arts (d6)', 'Unarmored Defense'],
      2: ["Monk's Focus (Focus Points = level: Flurry of Blows, Patient Defense, Step of the Wind)", 'Unarmored Movement (+10 ft)', 'Uncanny Metabolism'],
      3: ['Deflect Attacks', 'Warrior of the Open Hand: Open Hand Technique'],
    },
    inventory: ['Spear', 'Dagger ×5', "Explorer's Pack"],
    gold: 11,
  },
  Paladin: {
    hitDie: 10,
    saves: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    priority: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
    ac: () => 18,
    attacks: [
      { name: 'Longsword', ability: 'str', damage: '1d8', damageType: 'slashing' },
      { name: 'Javelin', ability: 'str', damage: '1d6', damageType: 'piercing', range: 'thrown 30/120 ft' },
    ],
    features: {
      1: ['Lay On Hands (healing pool = 5 × level)', 'Spellcasting (Charisma)', 'Weapon Mastery'],
      2: ['Fighting Style: Blessed Warrior (Guidance and Sacred Flame cantrips)', "Paladin's Smite (Divine Smite: +2d8 radiant on a hit, uses a spell slot)"],
      3: ['Channel Divinity: Divine Sense', 'Oath of Devotion: Sacred Weapon'],
    },
    spells: {
      1: ['Bless', 'Cure Wounds', 'Divine Smite', 'Shield of Faith'],
      2: ['Heroism'],
      3: ['Protection from Evil and Good', 'Sanctuary'],
    },
    slots: 'half',
    inventory: ['Chain Mail', 'Shield', 'Longsword', 'Javelin ×6', 'Holy Symbol', "Priest's Pack"],
    gold: 9,
  },
  Ranger: {
    hitDie: 10,
    saves: ['str', 'dex'],
    skillChoices: 3,
    skillList: ['animal handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
    priority: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    ac: (m) => 12 + m.dex,
    attacks: [
      { name: 'Longbow', ability: 'dex', damage: '1d8', damageType: 'piercing', range: '150/600 ft' },
      { name: 'Shortsword', ability: 'dex', damage: '1d6', damageType: 'piercing' },
    ],
    features: {
      1: ["Favored Enemy (Hunter's Mark free casts)", 'Spellcasting (Wisdom)', 'Weapon Mastery'],
      2: ['Deft Explorer (Expertise, extra languages)', 'Fighting Style: Archery (+2 to hit with ranged weapons)'],
      3: ["Hunter: Hunter's Lore, Colossus Slayer"],
    },
    spells: {
      1: ["Hunter's Mark", 'Cure Wounds', 'Ensnaring Strike'],
      2: ['Goodberry'],
      3: ['Fog Cloud'],
    },
    slots: 'half',
    inventory: ['Studded Leather Armor', 'Longbow', 'Arrows ×20', 'Shortsword ×2', "Explorer's Pack"],
    gold: 7,
  },
  Rogue: {
    hitDie: 8,
    saves: ['dex', 'int'],
    skillChoices: 4,
    skillList: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleight of hand', 'stealth'],
    priority: ['dex', 'con', 'wis', 'int', 'cha', 'str'],
    ac: (m) => 11 + m.dex,
    attacks: [
      { name: 'Rapier', ability: 'dex', damage: '1d8', damageType: 'piercing', notes: 'Sneak Attack once per turn with advantage or an ally adjacent' },
      { name: 'Shortbow', ability: 'dex', damage: '1d6', damageType: 'piercing', range: '80/320 ft' },
    ],
    features: {
      1: ['Expertise (Stealth and one other skill)', 'Sneak Attack (1d6)', "Thieves' Cant", 'Weapon Mastery'],
      2: ['Cunning Action (bonus action Dash, Disengage or Hide)'],
      3: ['Sneak Attack (2d6)', 'Thief: Fast Hands, Second-Story Work', 'Steady Aim'],
    },
    inventory: ['Leather Armor', 'Rapier', 'Shortbow', 'Arrows ×20', "Thieves' Tools", "Burglar's Pack"],
    gold: 8,
  },
  Sorcerer: {
    hitDie: 6,
    saves: ['con', 'cha'],
    skillChoices: 2,
    skillList: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    ac: (m) => 10 + m.dex,
    attacks: [
      { name: 'Fire Bolt', ability: 'cha', damage: '1d10', damageType: 'fire', range: '120 ft', notes: 'cantrip' },
      { name: 'Dagger', ability: 'dex', damage: '1d4', damageType: 'piercing', range: 'thrown 20/60 ft' },
    ],
    features: {
      1: ['Spellcasting (Charisma)', 'Innate Sorcery (bonus action: advantage on spell attacks, +1 spell DC for 1 minute; 2/long rest)'],
      2: ['Font of Magic (Sorcery Points = level)', 'Metamagic: Quickened Spell, Twinned Spell'],
      3: ['Draconic Sorcery: Draconic Resilience (AC = 10 + Dex + Cha, +1 HP per level)'],
    },
    spells: {
      1: ['Fire Bolt', 'Light', 'Mage Hand', 'Prestidigitation', 'Magic Missile', 'Shield'],
      2: ['Burning Hands'],
      3: ['Scorching Ray', 'Misty Step'],
    },
    slots: 'full',
    inventory: ['Dagger ×2', 'Arcane Focus (crystal)', "Dungeoneer's Pack"],
    gold: 28,
  },
  Warlock: {
    hitDie: 8,
    saves: ['wis', 'cha'],
    skillChoices: 2,
    skillList: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
    priority: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
    ac: (m) => 11 + m.dex,
    attacks: [
      { name: 'Eldritch Blast', ability: 'cha', damage: '1d10', damageType: 'force', range: '120 ft', notes: 'cantrip; Agonizing Blast adds Charisma to damage' },
      { name: 'Dagger', ability: 'dex', damage: '1d4', damageType: 'piercing' },
    ],
    features: {
      1: ['Eldritch Invocations: Agonizing Blast', 'Pact Magic (Charisma; slots recover on a short rest)'],
      2: ['Magical Cunning', 'Eldritch Invocation: Repelling Blast'],
      3: ["Fiend Patron: Dark One's Blessing (temp HP when you drop a foe)", 'Pact of the Tome'],
    },
    spells: {
      1: ['Eldritch Blast', 'Prestidigitation', 'Hex', 'Armor of Agathys'],
      2: ['Charm Person'],
      3: ['Burning Hands', 'Command', 'Scorching Ray', 'Suggestion'],
    },
    slots: 'pact',
    inventory: ['Leather Armor', 'Dagger ×2', 'Arcane Focus (orb)', 'Book of Occult Lore', "Scholar's Pack"],
    gold: 15,
  },
  Wizard: {
    hitDie: 6,
    saves: ['int', 'wis'],
    skillChoices: 2,
    skillList: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'],
    priority: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    ac: (m) => 13 + m.dex, // Mage Armor cast for the day
    attacks: [
      { name: 'Fire Bolt', ability: 'int', damage: '1d10', damageType: 'fire', range: '120 ft', notes: 'cantrip' },
      { name: 'Dagger', ability: 'dex', damage: '1d4', damageType: 'piercing' },
    ],
    features: {
      1: ['Spellcasting (Intelligence; spellbook)', 'Ritual Adept', 'Arcane Recovery', 'Mage Armor already cast (AC 13 + Dex)'],
      2: ['Scholar (Expertise in Arcana)'],
      3: ['Evoker: Evocation Savant, Potent Cantrip'],
    },
    spells: {
      1: ['Fire Bolt', 'Light', 'Mage Hand', 'Magic Missile', 'Shield', 'Sleep', 'Mage Armor', 'Detect Magic', 'Thunderwave'],
      2: ['Feather Fall', 'Find Familiar'],
      3: ['Misty Step', 'Scorching Ray'],
    },
    slots: 'full',
    inventory: ['Quarterstaff', 'Dagger', 'Spellbook', 'Arcane Focus (wand)', "Scholar's Pack"],
    gold: 5,
  },
};

type SpeciesTemplate = { speed: number; traits: string[]; extraSkill?: string; hpPerLevel?: number };

export const SPECIES: Record<string, SpeciesTemplate> = {
  Dragonborn: { speed: 30, traits: ['Breath Weapon (1d10, Dex save)', 'Damage Resistance (draconic ancestry)', 'Darkvision 60 ft'] },
  Dwarf: { speed: 30, traits: ['Darkvision 120 ft', 'Dwarven Resilience (poison)', 'Dwarven Toughness (+1 HP per level)', 'Stonecunning'], hpPerLevel: 1 },
  Elf: { speed: 30, traits: ['Darkvision 60 ft', 'Fey Ancestry', 'Keen Senses', 'Trance'], extraSkill: 'perception' },
  Gnome: { speed: 30, traits: ['Darkvision 60 ft', 'Gnomish Cunning (advantage on Int/Wis/Cha saves)'] },
  Goliath: { speed: 35, traits: ["Giant Ancestry (Stone's Endurance)", 'Powerful Build'] },
  Halfling: { speed: 30, traits: ['Brave', 'Halfling Nimbleness', 'Luck (reroll natural 1s)', 'Naturally Stealthy'] },
  Human: { speed: 30, traits: ['Resourceful (Heroic Inspiration each long rest)', 'Skillful', 'Versatile'], extraSkill: 'insight' },
  Orc: { speed: 30, traits: ['Adrenaline Rush', 'Darkvision 120 ft', 'Relentless Endurance (drop to 1 HP instead of 0, once per long rest)'] },
  Tiefling: { speed: 30, traits: ['Darkvision 60 ft', 'Fiendish Legacy (fire resistance, Thaumaturgy)', 'Otherworldly Presence'] },
};

type BackgroundTemplate = { abilities: [Ability, Ability, Ability]; skills: [string, string]; feat: string; items: string[]; gold: number };

export const BACKGROUNDS: Record<string, BackgroundTemplate> = {
  Acolyte: { abilities: ['int', 'wis', 'cha'], skills: ['insight', 'religion'], feat: 'Magic Initiate (Cleric)', items: ['Holy Symbol', 'Prayer Book', 'Robe'], gold: 8 },
  Criminal: { abilities: ['dex', 'con', 'int'], skills: ['sleight of hand', 'stealth'], feat: 'Alert (add proficiency to initiative)', items: ["Thieves' Tools", 'Crowbar', 'Dark Hooded Cloak'], gold: 16 },
  Sage: { abilities: ['con', 'int', 'wis'], skills: ['arcana', 'history'], feat: 'Magic Initiate (Wizard)', items: ['Quarterstaff', 'Book (history)', 'Parchment ×8', 'Ink and Pen'], gold: 8 },
  Soldier: { abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], feat: 'Savage Attacker (roll weapon damage twice once per turn)', items: ['Gaming Set (dice)', "Healer's Kit", 'Travelling Clothes'], gold: 14 },
};

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const SLOT_TABLE: Record<'full' | 'half' | 'pact', Record<number, Record<string, number>>> = {
  full: { 1: { 1: 2 }, 2: { 1: 3 }, 3: { 1: 4, 2: 2 } },
  half: { 1: { 1: 2 }, 2: { 1: 2 }, 3: { 1: 3 } },
  pact: { 1: { 1: 1 }, 2: { 1: 2 }, 3: { 2: 2 } },
};

export const builderSchema = z.object({
  name: z.string().trim().min(1).max(40),
  species: z.string().refine((s) => s in SPECIES, 'Unknown species'),
  className: z.string().refine((s) => s in CLASSES, 'Unknown class'),
  background: z.string().refine((s) => s in BACKGROUNDS, 'Unknown background'),
  level: z.number().int().min(1).max(3),
  // Standard-array value for each ability; omit to auto-assign by class priority.
  scores: z.record(z.enum(ABILITIES), z.number().int()).optional(),
  plusTwo: z.enum(ABILITIES).optional(),
  plusOne: z.enum(ABILITIES).optional(),
  skills: z.array(z.string()).optional(),
  description: z.string().max(500).optional(),
});

export type BuilderInput = z.infer<typeof builderSchema>;

export class BuildError extends Error {}

export function buildCharacter(raw: BuilderInput): Character {
  const input = builderSchema.parse(raw);
  const cls = CLASSES[input.className]!;
  const sp = SPECIES[input.species]!;
  const bg = BACKGROUNDS[input.background]!;

  // Ability scores: standard array, then the background's +2/+1.
  let scores: Record<Ability, number>;
  if (input.scores) {
    const values = ABILITIES.map((a) => input.scores![a]);
    const sorted = [...values].sort((a, b) => b! - a!);
    if (sorted.some((v, i) => v !== STANDARD_ARRAY[i])) throw new BuildError('Ability scores must use the standard array 15, 14, 13, 12, 10, 8 once each.');
    scores = Object.fromEntries(ABILITIES.map((a) => [a, input.scores![a]!])) as Record<Ability, number>;
  } else {
    const byPriority = Object.fromEntries(cls.priority.map((a, i) => [a, STANDARD_ARRAY[i]!])) as Record<Ability, number>;
    scores = Object.fromEntries(ABILITIES.map((a) => [a, byPriority[a]])) as Record<Ability, number>;
  }
  const plusTwo = input.plusTwo ?? cls.priority.find((a) => bg.abilities.includes(a)) ?? bg.abilities[0];
  const plusOne = input.plusOne ?? cls.priority.find((a) => bg.abilities.includes(a) && a !== plusTwo) ?? bg.abilities.find((a) => a !== plusTwo)!;
  if (plusTwo === plusOne) throw new BuildError('The +2 and +1 must go to different abilities.');
  if (!bg.abilities.includes(plusTwo) || !bg.abilities.includes(plusOne)) {
    throw new BuildError(`${input.background} can only raise ${bg.abilities.map((a) => a.toUpperCase()).join(', ')}.`);
  }
  scores[plusTwo] += 2;
  scores[plusOne] += 1;
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, modifier(scores[a])])) as Record<Ability, number>;

  // Skills: background + species + class picks.
  const fixed = new Set<string>([...bg.skills, ...(sp.extraSkill ? [sp.extraSkill] : [])]);
  const picks = (input.skills ?? []).map((s) => s.toLowerCase()).filter((s) => cls.skillList.includes(s) && !fixed.has(s));
  const uniquePicks = [...new Set(picks)];
  if (uniquePicks.length > cls.skillChoices) throw new BuildError(`${input.className}s choose ${cls.skillChoices} skills.`);
  for (const s of cls.skillList) {
    if (uniquePicks.length >= cls.skillChoices) break;
    if (!fixed.has(s) && !uniquePicks.includes(s)) uniquePicks.push(s);
  }
  const skills = [...fixed, ...uniquePicks];

  // Hit points: max die at level 1, average after, plus Con each level.
  const perLevelExtra = sp.hpPerLevel ?? 0;
  const draconic = input.className === 'Sorcerer' && input.level >= 3 ? 1 : 0;
  let maxHp = cls.hitDie + mods.con;
  for (let l = 2; l <= input.level; l++) maxHp += cls.hitDie / 2 + 1 + mods.con;
  maxHp += (perLevelExtra + draconic) * input.level;
  maxHp = Math.max(1, maxHp);

  let ac = cls.ac(mods);
  if (draconic) ac = Math.max(ac, 10 + mods.dex + mods.cha);

  const attacks = cls.attacks.map((a) => ({ ...a }));
  if (input.className === 'Ranger' && input.level >= 2) {
    for (const a of attacks) if (a.range && !a.range.startsWith('thrown')) a.hitBonus = 2;
  }

  const features = [
    ...sp.traits,
    `Origin feat: ${bg.feat}`,
    ...([1, 2, 3] as const).filter((l) => l <= input.level).flatMap((l) => cls.features[l]),
  ];
  const spells = cls.spells ? ([1, 2, 3] as const).filter((l) => l <= input.level).flatMap((l) => cls.spells![l]) : [];
  const spellSlots = cls.slots
    ? Object.fromEntries(Object.entries(SLOT_TABLE[cls.slots][input.level]!).map(([lvl, n]) => [lvl, { max: n, used: 0 }]))
    : undefined;

  return {
    name: input.name,
    species: input.species,
    className: input.className,
    background: input.background,
    level: input.level,
    abilities: scores,
    skills,
    saves: [...cls.saves],
    maxHp,
    hp: maxHp,
    tempHp: 0,
    ac,
    speed: sp.speed,
    attacks,
    features,
    spells,
    spellSlots,
    inventory: [...cls.inventory, ...bg.items, 'Potion of Healing'],
    gold: cls.gold + bg.gold,
    conditions: [],
    description: input.description,
  };
}

export type Pregen = { id: string; blurb: string; input: BuilderInput };

let pregenCache: Pregen[] | undefined;
export function pregens(): Pregen[] {
  pregenCache ??= (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'pregens.json'), 'utf8')) as Pregen[]).map((p) => ({
    ...p,
    input: builderSchema.parse(p.input),
  }));
  return pregenCache;
}

export function pregenCharacter(id: string, level: number): Character | null {
  const p = pregens().find((x) => x.id === id);
  if (!p) return null;
  return buildCharacter({ ...p.input, level });
}

export function builderOptions() {
  return {
    classes: Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, { hitDie: c.hitDie, skillChoices: c.skillChoices, skillList: c.skillList, priority: c.priority }])),
    species: Object.fromEntries(Object.entries(SPECIES).map(([k, s]) => [k, { traits: s.traits, extraSkill: s.extraSkill ?? null }])),
    backgrounds: Object.fromEntries(Object.entries(BACKGROUNDS).map(([k, b]) => [k, { abilities: b.abilities, skills: b.skills, feat: b.feat }])),
    standardArray: STANDARD_ARRAY,
  };
}
