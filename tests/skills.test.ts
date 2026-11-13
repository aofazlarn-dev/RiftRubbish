import { describe, expect, it } from 'vitest';
import skillsData from '../src/data/skills.json';
import {
  damageAtLevel,
  downgrade,
  levelForXp,
  validateSkills,
  type SkillDef,
} from '../src/systems/skills';

const base: SkillDef = {
  id: 'T01',
  name: { th: 'ทดสอบ', en: 'Test' },
  kind: 'active',
  rarity: 'common',
  tags: [],
  damage: 10,
  cooldown: 1,
  range: 5,
  shape: 'projectile',
};

describe('skills data', () => {
  it('shipped skills.json passes validation', () => {
    const skills = validateSkills(skillsData);
    expect(skills.filter((s) => !s.fusedOnly)).toHaveLength(6); // starting skills; fused results are separate
    expect(new Set(skills.map((s) => s.id)).size).toBe(skills.length);
  });

  it('rejects duplicate ids and bad rarity with a clear message', () => {
    expect(() => validateSkills({ skills: [base, base] })).toThrow(/duplicate id/);
    expect(() => validateSkills({ skills: [{ ...base, rarity: 'ultra' }] })).toThrow(/unknown rarity/);
  });

  it('rejects negative damage', () => {
    expect(() => validateSkills({ skills: [{ ...base, damage: -1 }] })).toThrow(/damage/);
  });
});

describe('skill XP and level', () => {
  it('maps Skill XP to normal levels with the balance thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(180)).toBe(3);
    expect(levelForXp(420)).toBe(4);
    expect(levelForXp(800)).toBe(5);
    expect(levelForXp(99_999)).toBe(5); // normal cap is Lv5 (D2)
  });

  it('scales damage by the level multiplier from balance §2.1', () => {
    expect(damageAtLevel(base, 1)).toBe(10);
    expect(damageAtLevel(base, 3)).toBe(15.5);
    expect(damageAtLevel(base, 5)).toBe(24);
  });

  it('downgrade steps one rarity down and stops at common', () => {
    expect(downgrade('mythic')).toBe('legendary');
    expect(downgrade('common')).toBeNull();
  });
});
