import { describe, expect, it } from 'vitest';
import {
  AFFIXES,
  applyDamageWithShield,
  burstCanHit,
  combinedResist,
  dominantTag,
  getAffix,
  inLeaderAura,
  junkShieldHp,
  resistChoiceFor,
} from '../src/systems/affix';

describe('affix table (balance §4)', () => {
  it('has the five affixes in order', () => {
    expect(AFFIXES.map((a) => a.id)).toEqual(['rush', 'junk_shield', 'burst', 'resist_choice', 'pack_leader']);
    expect(getAffix('burst').name).toBe('ระเบิดตอนตาย');
  });

  it('throws on an unknown affix', () => {
    expect(() => getAffix('nope' as never)).toThrow('Unknown affix');
  });
});

describe('junk shield', () => {
  it('is 50% of max HP', () => {
    expect(junkShieldHp(20)).toBe(10);
    expect(junkShieldHp(8)).toBe(4);
  });

  it('takes damage on the shield before HP', () => {
    expect(applyDamageWithShield(10, 20, 4)).toEqual({ shield: 6, hp: 20 });
  });

  it('spills the rest of the damage onto HP and never goes below 0', () => {
    expect(applyDamageWithShield(10, 20, 14)).toEqual({ shield: 0, hp: 16 });
    expect(applyDamageWithShield(0, 5, 99)).toEqual({ shield: 0, hp: 0 });
  });

  it('does not mutate the caller values', () => {
    const r = applyDamageWithShield(10, 20, 3);
    expect(r).toEqual({ shield: 7, hp: 20 });
  });
});

describe('resist by choice', () => {
  it('dominant tag wins outright', () => {
    expect(dominantTag({ fire: 3, ice: 1 }, (t) => t[0])).toBe('fire');
  });

  it('ties go to the caller pick, sorted first so the input order does not matter', () => {
    const seen: string[][] = [];
    const pick = (tags: string[]) => {
      seen.push(tags);
      return tags[0];
    };
    expect(dominantTag({ ice: 2, fire: 2 }, pick)).toBe('fire');
    expect(seen[0]).toEqual(['fire', 'ice']);
  });

  it('returns null when the player has no tags', () => {
    expect(dominantTag({}, (t) => t[0])).toBeNull();
    expect(dominantTag({ fire: 0 }, (t) => t[0])).toBeNull();
  });

  it('resists 50% only against the dominant tag', () => {
    expect(resistChoiceFor('fire', 'fire')).toBe(0.5);
    expect(resistChoiceFor('ice', 'fire')).toBe(0);
    expect(resistChoiceFor('fire', null)).toBe(0);
  });

  it('total resistance is capped at 75%', () => {
    expect(combinedResist(0.5, 0.5)).toBe(0.75);
    expect(combinedResist(0.2, 0.5)).toBe(0.7);
    expect(combinedResist(0, 0)).toBe(0);
  });
});

describe('burst and aura', () => {
  it('a burst caused by another burst does not hit (no chains)', () => {
    expect(burstCanHit(false)).toBe(true);
    expect(burstCanHit(true)).toBe(false);
  });

  it('aura needs a leader in range; no stacking beyond a boolean', () => {
    expect(inLeaderAura(96, 1)).toBe(true);
    expect(inLeaderAura(97, 1)).toBe(false);
    expect(inLeaderAura(10, 0)).toBe(false);
    expect(inLeaderAura(10, 3)).toBe(true);
  });
});
