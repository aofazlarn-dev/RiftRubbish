import { describe, expect, it } from 'vitest';
import {
  buildEveningOffer,
  countCookableDishes,
  formatInventorySummary,
  formatMealBuff,
  resolveEveningSelection,
} from '../src/scenes/eveningUiModel';
import { HUNGRY_DEBUFF, MEALS } from '../src/systems/evening';

describe('eveningUiModel (G3 Evening UI)', () => {
  it('formats inventory and meal buffs in player-facing Thai without dev terms', () => {
    expect(formatInventorySummary({})).toBe('ไม่มีวัตถุดิบ');
    expect(formatInventorySummary({ grain: 2, water: 1 })).toBe('ธัญพืช 2 · น้ำ 1');

    const bentoBuff = formatMealBuff(MEALS[4].buff);
    expect(bentoBuff).toContain('ดาเมจ +8%');
    expect(bentoBuff).toContain('คูลดาวน์ -8%');
    expect(bentoBuff).toContain('ฟื้นเลือด +0.5/วิ');
    expect(bentoBuff).not.toMatch(/Active|Passive|stack|aura/i);
  });

  it('locks fence when no spare dish remains after tonight meal, and unlocks overtime on day 4+', () => {
    const day1 = buildEveningOffer({ grain: 2 }, 1, 1000, false, 'hard_bread');
    expect(day1.meals.find((m) => m.meal.id === 'hard_bread')?.affordable).toBe(true);
    expect(day1.choices.find((c) => c.id === 'fence')?.enabled).toBe(false);
    expect(day1.choices.find((c) => c.id === 'trap')?.enabled).toBe(true);
    expect(day1.choices.find((c) => c.id === 'overtime')?.enabled).toBe(false);

    const day4Rich = buildEveningOffer({ grain: 4 }, 4, 1000, false, 'hard_bread');
    expect(countCookableDishes({ grain: 4 })).toBe(2);
    expect(day4Rich.choices.find((c) => c.id === 'fence')?.enabled).toBe(true);
    expect(day4Rich.choices.find((c) => c.id === 'overtime')?.enabled).toBe(true);
  });

  it('overtime skips the meal, keeps ingredients, and applies HUNGRY_DEBUFF', () => {
    const inv = { grain: 2, water: 1 };
    const res = resolveEveningSelection(inv, 'hard_bread', 'overtime');
    expect(res.usedOvertime).toBe(true);
    expect(res.buff).toEqual(HUNGRY_DEBUFF);
    expect(res.inventory).toEqual(inv);
  });

  it('fence deducts both tonight meal and 1 spare dish', () => {
    const inv = { grain: 4 };
    const res = resolveEveningSelection(inv, 'hard_bread', 'fence');
    expect(res.usedOvertime).toBe(false);
    expect(res.buff).toEqual(MEALS[0].buff);
    expect(res.inventory.grain).toBe(0);
  });
});
