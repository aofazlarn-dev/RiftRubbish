import { describe, expect, it } from 'vitest';
import { createRun } from '../src/core/state';
import { buyMeta, DAILY_LOADOUT, metaBonus, startingSkillsFor } from '../src/systems/meta';
import { dailyMissions, MISSIONS } from '../src/systems/missions';

describe('meta shop (approved draft)', () => {
  it('buys with enough Shard, once per item', () => {
    const r = buyMeta(40, [], 'META_GLOVE');
    expect(r.bought).toBe(true);
    expect(r.bank).toBe(5);
    expect(buyMeta(r.bank, r.owned, 'META_GLOVE').bought).toBe(false);
  });

  it('refuses when short of Shard', () => {
    expect(buyMeta(34, [], 'META_GLOVE').bought).toBe(false);
  });

  it('each item gives +5% to its stat, total capped at +15%', () => {
    expect(metaBonus(['META_GLOVE'], 'damage')).toBeCloseTo(0.05, 5);
    expect(metaBonus(['META_GLOVE', 'META_SLIPPER', 'META_LID'], 'damage')).toBeCloseTo(0.05, 5);
    expect(metaBonus([], 'speed')).toBe(0);
  });
});

describe('Daily loadout (approved draft)', () => {
  it('Daily starts with W01 and J03; Casual starts empty', () => {
    expect(DAILY_LOADOUT).toEqual(['W01', 'J03']);
    expect(startingSkillsFor(createRun({ seed: 'd', mode: 'daily' }))).toEqual(['W01', 'J03']);
    expect(startingSkillsFor(createRun({ seed: 'c', mode: 'casual' }))).toEqual([]);
  });
});

describe('daily missions (approved draft)', () => {
  it('three distinct missions per day for Casual, the same for the same seed and date', () => {
    const a = dailyMissions('seed-x', '2026-11-15', 'casual');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
    expect(dailyMissions('seed-x', '2026-11-15', 'casual')).toEqual(a);
  });

  it('Daily gets no missions', () => {
    expect(dailyMissions('seed-x', '2026-11-15', 'daily')).toEqual([]);
  });

  it('each mission pays at most 5 Shard, and the list has six', () => {
    expect(MISSIONS).toHaveLength(6);
    for (const m of MISSIONS) expect(m.shards).toBeLessThanOrEqual(5);
  });
});
