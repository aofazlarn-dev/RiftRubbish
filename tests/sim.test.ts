import { describe, expect, it } from 'vitest';
import { nightReport, requiredDps, NIGHT_HP, timeToSkillLevel } from '../sim/balanceSim';

describe('sim: Skill XP timing (balance §2.3)', () => {
  it('Active taken at t=15 reaches Lv3 at ~352 s (start of night 3)', () => {
    const t = timeToSkillLevel({ kind: 'active', acquiredAt: 15 }, 3);
    expect(t).toBeCloseTo(352.5, 1);
  });

  it('Passive taken at t=30 reaches Lv3 at 330 s (evening of day 3)', () => {
    expect(timeToSkillLevel({ kind: 'passive', acquiredAt: 30 }, 3)).toBeCloseTo(330, 5);
  });

  it('one +40 upgrade card each brings both to Lv3 at about 5 minutes', () => {
    const a = timeToSkillLevel({ kind: 'active', acquiredAt: 15, bonusXp: 40 }, 3)!;
    const b = timeToSkillLevel({ kind: 'passive', acquiredAt: 30, bonusXp: 40 }, 3)!;
    // 27.5 (day 1) + 40 (night 1) + 35 (day 2) = 102.5 by t=200, then 37.5 s into night 2 (starts at 220).
    // balance.md §2.3 says "t≈300 (day 3)" for this case; the rules give 257.5 — flagged in HANDOFF.
    expect(a).toBeCloseTo(257.5, 5);
    expect(b).toBeCloseTo(30 + 140 / 0.6, 5);
    expect(Math.max(a, b)).toBeLessThanOrEqual(330); // ≤ 5.5 min, before night 3
  });

  it('worst case without cards is still before the fusion window closes (night 3 ends at 390 s)', () => {
    const a = timeToSkillLevel({ kind: 'active', acquiredAt: 15 }, 3)!;
    expect(a).toBeLessThan(390);
  });

  it('Active earns nothing in the evening', () => {
    // Acquired at the start of evening 1 (t=70): no XP until night 1 starts at t=90.
    expect(timeToSkillLevel({ kind: 'active', acquiredAt: 70 }, 2)).toBeCloseTo(130 + 20, 5);
  });

  it('returns null when the level is out of reach in the run', () => {
    expect(timeToSkillLevel({ kind: 'active', acquiredAt: 15 }, 5, 3)).toBeNull();
  });
});

describe('sim: required DPS per night (balance §5.4)', () => {
  it('matches the table for nights 1–6', () => {
    const expected = [10, 20, 31, 49, 67, 85];
    NIGHT_HP.forEach((n, i) => expect(Math.round(requiredDps(n))).toBe(expected[i]));
  });

  it('nights 4–6 are tight but passable for the median build, night 1 is easy', () => {
    const report = nightReport();
    expect(report[0].ratio).toBeLessThan(0.5);
    for (const r of report.slice(3)) {
      expect(r.ratio).toBeGreaterThan(0.7);
      expect(r.ratio).toBeLessThan(0.95);
    }
  });
});
