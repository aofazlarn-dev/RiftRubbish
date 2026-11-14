import { describe, expect, it } from 'vitest';
import {
  HUNGRY_DEBUFF,
  MEALS,
  availableChoices,
  canCook,
  choiceSkipsMeal,
  cook,
  fenceShieldHp,
  finalShards,
  getMeal,
} from '../src/systems/evening';

describe('meals (balance §6.2)', () => {
  it('has the five casual meals with their recipes', () => {
    expect(MEALS.map((m) => m.id)).toEqual([
      'hard_bread',
      'monster_stew',
      'grilled_fish',
      'glow_mushroom_soup',
      'otherworld_bento',
    ]);
    expect(getMeal('hard_bread').recipe).toEqual({ grain: 2 });
    expect(getMeal('otherworld_bento').recipe).toEqual({ grain: 1, mushroom: 1, meat: 1 });
  });

  it('gives the buffs from the table', () => {
    expect(getMeal('hard_bread').buff.maxHpMult).toBe(1.2);
    expect(getMeal('monster_stew').buff.damageMult).toBe(1.15);
    expect(getMeal('grilled_fish').buff).toEqual({ speedMult: 1.12, pickupRangeMult: 1.4 });
    expect(getMeal('glow_mushroom_soup').buff.skillXpMult).toBe(1.3);
    expect(getMeal('otherworld_bento').buff).toEqual({ damageMult: 1.08, cooldownMult: 0.92, hpRegenPerSec: 0.5 });
  });

  it('throws on an unknown meal id', () => {
    expect(() => getMeal('nope')).toThrow('Unknown meal');
  });

  it('canCook needs every ingredient in the recipe', () => {
    const bento = getMeal('otherworld_bento');
    expect(canCook(bento, { grain: 1, mushroom: 1, meat: 1 })).toBe(true);
    expect(canCook(bento, { grain: 1, mushroom: 1 })).toBe(false);
    expect(canCook(getMeal('hard_bread'), { grain: 1 })).toBe(false);
  });

  it('cook consumes the recipe and does not mutate the input', () => {
    const inv = { grain: 3, water: 1 };
    const next = cook(getMeal('hard_bread'), inv);
    expect(next).toEqual({ grain: 1, water: 1 });
    expect(inv).toEqual({ grain: 3, water: 1 });
  });

  it('cook returns null when the ingredients are missing', () => {
    expect(cook(getMeal('monster_stew'), { meat: 1 })).toBeNull();
  });

  it('the hungry debuff matches balance §6.2', () => {
    expect(HUNGRY_DEBUFF.damageMult).toBe(0.85);
    expect(HUNGRY_DEBUFF.speedMult).toBe(0.9);
  });
});

describe('evening choices (balance §6.3)', () => {
  it('trap is always available', () => {
    expect(availableChoices({ day: 1, spareMeals: 0, overtimeUsed: false })).toEqual(['trap']);
  });

  it('fence needs one spare cooked dish', () => {
    expect(availableChoices({ day: 2, spareMeals: 1, overtimeUsed: false })).toEqual(['fence', 'trap']);
  });

  it('overtime opens from day 4 and only once per run', () => {
    expect(availableChoices({ day: 3, spareMeals: 0, overtimeUsed: false })).toEqual(['trap']);
    expect(availableChoices({ day: 4, spareMeals: 0, overtimeUsed: false })).toEqual(['trap', 'overtime']);
    expect(availableChoices({ day: 5, spareMeals: 0, overtimeUsed: true })).toEqual(['trap']);
  });

  it('all three can be offered together', () => {
    expect(availableChoices({ day: 6, spareMeals: 2, overtimeUsed: false })).toEqual(['fence', 'trap', 'overtime']);
  });

  it('fence shield is 30% of max core HP', () => {
    expect(fenceShieldHp(1000)).toBe(300);
  });

  it('only overtime skips the meal', () => {
    expect(choiceSkipsMeal('overtime')).toBe(true);
    expect(choiceSkipsMeal('fence')).toBe(false);
    expect(choiceSkipsMeal('trap')).toBe(false);
  });

  it('overtime adds 20% to the final Soul Shard payout, applied after win/lose', () => {
    expect(finalShards(20, false)).toBe(20);
    expect(finalShards(20, true)).toBe(24);
    expect(finalShards(120, true)).toBe(144);
    expect(finalShards(7, true)).toBe(8); // floored
  });
});
