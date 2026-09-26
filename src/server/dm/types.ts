export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const SKILLS: Record<string, Ability> = {
  acrobatics: 'dex',
  'animal handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight of hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
};

export type Attack = {
  name: string;
  ability: Ability;
  damage: string; // e.g. "1d8" — the ability modifier is added automatically
  damageType: string;
  proficient?: boolean;
  hitBonus?: number; // e.g. Archery fighting style
  range?: string;
  notes?: string;
};

export type Character = {
  name: string;
  species: string;
  className: string;
  background: string;
  level: number;
  abilities: Record<Ability, number>;
  skills: string[];
  saves: Ability[];
  maxHp: number;
  hp: number;
  tempHp: number;
  ac: number;
  speed: number;
  attacks: Attack[];
  features: string[];
  spells: string[];
  spellSlots?: Record<string, { max: number; used: number }>;
  inventory: string[];
  gold: number;
  conditions: string[];
  deathSaves?: { successes: number; failures: number };
  description?: string;
};

export type Combatant = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  conditions: string[];
};

export type GameState = {
  scene: { title: string; ambience: string; imageId?: string | null } | null;
  combatants: Combatant[];
  progress: string[];
  outcome?: string | null;
  turn: number;
};

export type RollEvent = {
  type: 'roll';
  label: string;
  expr: string;
  rolls: number[];
  kept?: number[];
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
  critical?: 'hit' | 'miss' | null;
};

export type GameEvent =
  | RollEvent
  | { type: 'scene'; title: string; ambience: string; imageId?: string | null }
  | { type: 'sfx'; name: string }
  | { type: 'hp'; target: string; delta: number; hp: number; maxHp: number }
  | { type: 'item'; action: 'add' | 'remove'; item: string }
  | { type: 'gold'; delta: number; gold: number }
  | { type: 'condition'; target: string; condition: string; active: boolean }
  | { type: 'combatant'; action: 'add' | 'remove'; name: string }
  | { type: 'progress'; note: string }
  | { type: 'end'; outcome: string };

export const AMBIENCE_TAGS = [
  'tavern',
  'village',
  'road',
  'forest-day',
  'forest-night',
  'cave',
  'dungeon',
  'ruins',
  'storm',
  'city',
  'sea',
  'camp',
  'temple',
  'mountain',
  'combat',
  'tension',
  'victory',
  'silence',
] as const;

export type AmbienceTag = (typeof AMBIENCE_TAGS)[number];

/** Common words for places/moods not in AMBIENCE_TAGS, mapped to the nearest tag we do support. */
const AMBIENCE_SYNONYMS: Record<string, AmbienceTag> = {
  town: 'village',
  hamlet: 'village',
  settlement: 'village',
  homestead: 'village',
  farm: 'village',
  street: 'city',
  market: 'city',
  marketplace: 'city',
  alley: 'city',
  harbour: 'city',
  harbor: 'city',
  docks: 'city',
  inn: 'tavern',
  pub: 'tavern',
  bar: 'tavern',
  castle: 'ruins',
  fortress: 'ruins',
  keep: 'ruins',
  crypt: 'ruins',
  graveyard: 'ruins',
  cemetery: 'ruins',
  tomb: 'dungeon',
  swamp: 'forest-night',
  marsh: 'forest-night',
  bog: 'forest-night',
  jungle: 'forest-day',
  woods: 'forest-day',
  woodland: 'forest-day',
  garden: 'forest-day',
  ocean: 'sea',
  beach: 'sea',
  shore: 'sea',
  coast: 'sea',
  ship: 'sea',
  boat: 'sea',
  cliff: 'mountain',
  peak: 'mountain',
  summit: 'mountain',
  mountains: 'mountain',
  path: 'road',
  trail: 'road',
  highway: 'road',
  crossroads: 'road',
  field: 'road',
  plain: 'road',
  meadow: 'road',
  shrine: 'temple',
  chapel: 'temple',
  sanctuary: 'temple',
  altar: 'temple',
  battle: 'combat',
  fight: 'combat',
  skirmish: 'combat',
};

/**
 * Resolves whatever ambience word the DM used to one we actually have audio for.
 * Exact match first, then a word-in-word heuristic, then the safe fallback:
 * "silence" — a real, defined tag (a deliberately quiet moment), not an error state.
 */
export function nearestAmbience(raw: string): AmbienceTag {
  const key = raw.trim().toLowerCase();
  if ((AMBIENCE_TAGS as readonly string[]).includes(key)) return key as AmbienceTag;
  for (const [word, tag] of Object.entries(AMBIENCE_SYNONYMS)) {
    // Whole-word match only — a plain substring check would let "ship" fire on
    // "spaceship", or "inn" fire on "beginning".
    if (new RegExp(`\\b${word}\\b`).test(key)) return tag;
  }
  return 'silence';
}

export const SFX_TAGS = [
  'door',
  'sword',
  'spell',
  'coins',
  'roar',
  'footsteps',
  'thunder',
  'splash',
  'arrow',
  'scream',
  'chest',
  'bell',
] as const;

export function modifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number) {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function emptyState(): GameState {
  return { scene: null, combatants: [], progress: [], outcome: null, turn: 0 };
}
