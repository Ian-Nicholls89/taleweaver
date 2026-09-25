import { describe, expect, it } from 'vitest';
import { critExpression, parseDice, rollD20, rollDice, type Rng } from '@/server/dm/dice';

const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('dice', () => {
  it('parses mixed expressions', () => {
    expect(parseDice('1d20+5')).toEqual([
      { kind: 'dice', sign: 1, count: 1, sides: 20 },
      { kind: 'flat', sign: 1, value: 5 },
    ]);
    expect(parseDice('d8 + 1d6 - 2')).toHaveLength(3);
  });

  it('rejects nonsense and absurd sizes', () => {
    expect(() => parseDice('fireball')).toThrow();
    expect(() => parseDice('1000d6')).toThrow();
    expect(() => parseDice('1d1')).toThrow();
    expect(() => parseDice('')).toThrow();
    expect(() => parseDice('2d6kh3')).toThrow();
  });

  it('totals dice and modifiers', () => {
    const r = rollDice('2d6+3', seq(4, 5));
    expect(r.rolls).toEqual([4, 5]);
    expect(r.modifier).toBe(3);
    expect(r.total).toBe(12);
  });

  it('keeps highest', () => {
    const r = rollDice('4d6kh3', seq(1, 6, 3, 5));
    expect(r.kept).toEqual([6, 5, 3]);
    expect(r.total).toBe(14);
  });

  it('subtracts terms', () => {
    expect(rollDice('1d8-1d4', seq(6, 2)).total).toBe(4);
  });

  it('rolls d20 with advantage and disadvantage', () => {
    expect(rollD20(2, 'advantage', seq(3, 17)).total).toBe(19);
    expect(rollD20(2, 'disadvantage', seq(3, 17)).total).toBe(5);
    expect(rollD20(-1, 'normal', seq(10)).expr).toBe('1d20-1');
  });

  it('doubles dice for crits but not flat bonuses', () => {
    expect(critExpression('1d8+2')).toBe('2d8+2');
    expect(critExpression('d6+2d4')).toBe('2d6+4d4');
  });

  it('stays within range with the real RNG', () => {
    for (let i = 0; i < 200; i++) {
      const t = rollDice('1d20').total;
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(20);
    }
  });
});
