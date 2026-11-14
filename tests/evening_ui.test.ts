import { describe, expect, it } from 'vitest';
import {
  buildEveningOffer,
  countCookableDishes,
  formatInventorySummary,
  formatMealBuff,
  formatSynergySummary,
} from '../src/scenes/eveningUiModel';
import { HUNGRY_DEBUFF, MEALS, resolveEvening } from '../src/systems/evening';

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
    const res = resolveEvening(inv, 'hard_bread', 'overtime', { day: 4, overtimeUsed: false, overtimeAllowed: true });
    expect(res.choice).toBe('overtime');
    expect(res.buff).toEqual(HUNGRY_DEBUFF);
    expect(res.inventory).toEqual(inv);
  });

  it('fence deducts both tonight meal and 1 spare dish', () => {
    const inv = { grain: 4 };
    const res = resolveEvening(inv, 'hard_bread', 'fence', { day: 2, overtimeUsed: false, overtimeAllowed: true });
    expect(res.choice).toBe('fence');
    expect(res.buff).toEqual(MEALS[0].buff);
    expect(res.inventory.grain).toBe(0);
  });

  it('locks overtime in Daily mode even on day 4+ and formats active Synergy >= 2', () => {
    const dailyOffer = buildEveningOffer({ grain: 4 }, 5, 1000, false, 'hard_bread', 'daily');
    const overtime = dailyOffer.choices.find((c) => c.id === 'overtime');
    expect(overtime?.enabled).toBe(false);
    expect(overtime?.lockedReasonTh).toBe('ไม่มีทำโอทีในโหมด Daily Seed');

    const syn = formatSynergySummary(
      ['E01', 'W01', 'J03'],
      [
        { id: 'E01', tags: ['fire'] },
        { id: 'W01', tags: ['fire'] },
        { id: 'J03', tags: ['earth'] },
      ],
    );
    expect(syn).toBe('Synergy: ไฟ (2)');
    expect(formatSynergySummary(['E01'], [{ id: 'E01', tags: ['fire'] }])).toBe('');
  });
});
