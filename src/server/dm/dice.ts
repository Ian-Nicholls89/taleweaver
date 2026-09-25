import { randomInt } from 'node:crypto';

export type DiceTerm =
  | { kind: 'dice'; sign: 1 | -1; count: number; sides: number; keep?: { highest: boolean; n: number } }
  | { kind: 'flat'; sign: 1 | -1; value: number };

export type DiceResult = {
  expr: string;
  rolls: number[]; // every die rolled, in order
  kept: number[]; // dice that count toward the total
  modifier: number; // sum of flat terms
  total: number;
};

export type Rng = (sides: number) => number;
export const cryptoRng: Rng = (sides) => randomInt(1, sides + 1);

const TERM = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/;

/** Parses expressions like "1d20+5", "2d6 - 1", "4d6kh3", "d8+1d6+2". */
export function parseDice(input: string): DiceTerm[] {
  const expr = input.toLowerCase().replace(/\s+/g, '');
  if (!expr || expr.length > 60) throw new Error(`Invalid dice expression "${input}"`);
  const parts = expr.match(/[+-]?[^+-]+/g);
  if (!parts) throw new Error(`Invalid dice expression "${input}"`);
  const terms: DiceTerm[] = [];
  let dice = 0;
  for (const raw of parts) {
    const sign: 1 | -1 = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    if (/^\d+$/.test(body)) {
      terms.push({ kind: 'flat', sign, value: Number(body) });
      continue;
    }
    const m = TERM.exec(body);
    if (!m) throw new Error(`Invalid dice term "${raw}" in "${input}"`);
    const count = m[1] ? Number(m[1]) : 1;
    const sides = Number(m[2]);
    if (count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error(`Dice out of range in "${input}"`);
    dice += count;
    const term: DiceTerm = { kind: 'dice', sign, count, sides };
    if (m[3]) {
      const n = Number(m[4]);
      if (n < 1 || n > count) throw new Error(`Cannot keep ${n} of ${count} dice`);
      term.keep = { highest: m[3] === 'kh', n };
    }
    terms.push(term);
  }
  if (dice > 200) throw new Error('Too many dice');
  return terms;
}

export function rollDice(input: string, rng: Rng = cryptoRng): DiceResult {
  const terms = parseDice(input);
  const rolls: number[] = [];
  const kept: number[] = [];
  let modifier = 0;
  let total = 0;
  for (const t of terms) {
    if (t.kind === 'flat') {
      modifier += t.sign * t.value;
      total += t.sign * t.value;
      continue;
    }
    const these = Array.from({ length: t.count }, () => rng(t.sides));
    rolls.push(...these);
    let keep = these;
    if (t.keep) {
      const sorted = [...these].sort((a, b) => (t.keep!.highest ? b - a : a - b));
      keep = sorted.slice(0, t.keep.n);
    }
    kept.push(...keep);
    total += t.sign * keep.reduce((a, b) => a + b, 0);
  }
  return { expr: input.replace(/\s+/g, ''), rolls, kept, modifier, total };
}

/** A d20 test with optional advantage/disadvantage. */
export function rollD20(mod: number, mode: 'normal' | 'advantage' | 'disadvantage' = 'normal', rng: Rng = cryptoRng) {
  const a = rng(20);
  const b = mode === 'normal' ? null : rng(20);
  const natural = b === null ? a : mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  return {
    rolls: b === null ? [a] : [a, b],
    natural,
    total: natural + mod,
    expr: `${mode === 'normal' ? '1d20' : mode === 'advantage' ? '2d20kh1' : '2d20kl1'}${mod >= 0 ? '+' : ''}${mod}`,
  };
}

/** Doubles the dice (not flat modifiers) for a critical hit. */
export function critExpression(damage: string) {
  return damage.replace(/(\d*)d(\d+)/gi, (_m, c: string, s: string) => `${(c ? Number(c) : 1) * 2}d${s}`);
}
