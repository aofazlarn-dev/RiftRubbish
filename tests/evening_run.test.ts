import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun } from '../src/core/state';
import { loadRunData } from '../src/data';
import { eveningMeal, gatherDay, GATHER_KINDS, HUNGRY_DEBUFF } from '../src/systems/evening';
import { startRun } from '../src/systems/run';

const data = loadRunData();

describe('gathering (balance §6.2: 5–7 items per day, no meat)', () => {
  it('adds 5 to 7 items from the gatherable kinds only', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const rng = RunRng.fromSeed(seed).get('loot');
      const inv = gatherDay({}, rng);
      const total = Object.values(inv).reduce((a, n) => a + (n ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(7);
      expect(inv.meat ?? 0).toBe(0);
      for (const k of Object.keys(inv)) expect(GATHER_KINDS).toContain(k);
    }
  });

  it('adds to existing stock and does not mutate the input', () => {
    const before = { grain: 2 };
    const after = gatherDay(before, RunRng.fromSeed('x').get('loot'));
    expect(before).toEqual({ grain: 2 });
    expect(after.grain).toBeGreaterThanOrEqual(2);
  });
});

describe('evening meal (balance §6.2)', () => {
  it('cooks the best affordable meal and uses up its ingredients', () => {
    const r = eveningMeal({ grain: 2 });
    expect(r.mealId).toBe('hard_bread');
    expect(r.buff.maxHpMult).toBe(1.2);
    expect(r.inventory.grain).toBe(0);
  });

  it('prefers the bento when all three of its ingredients are present', () => {
    const r = eveningMeal({ grain: 1, mushroom: 1, meat: 1, water: 1 });
    expect(r.mealId).toBe('otherworld_bento');
  });

  it('with nothing to cook, gets the hungry debuff and keeps the stock', () => {
    const inv = { water: 1 };
    const r = eveningMeal(inv);
    expect(r.mealId).toBeNull();
    expect(r.buff).toEqual(HUNGRY_DEBUFF);
    expect(r.inventory).toEqual({ water: 1 });
  });
});

describe('run wiring', () => {
  it('a new run starts with an empty bag, day 1 nodes on the map and a filled well (R2)', () => {
    const s = createRun({ seed: 'wired' });
    startRun(s, RunRng.fromSeed('wired'), data);
    const total = Object.values(s.inventory ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    expect(total).toBe(0);
    expect(s.resourceNodes).toHaveLength(6);
    expect(s.well).toMatchObject({ water: 2, fish: 1 });
  });
});
