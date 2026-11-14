/**
 * Gap round 2 R1: the evening is resolved in one place (systems/run.ts), once per evening.
 * Before the fix the clock cooked a meal at dusk and the screen cooked again on confirm.
 */
import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun, PHASE_SECONDS, type GameState } from '../src/core/state';
import { loadRunData } from '../src/data';
import { beginEvening, recallToEvening, stepRun, submitEvening } from '../src/systems/run';

const data = loadRunData();
const still = { x: 0, y: 0 };

/** A run sitting at the last moment of day `day`, with a known stock. */
function lateDay(day: number, inventory: Record<string, number>, mode: 'casual' | 'daily' = 'casual') {
  const s = createRun({ seed: `r1-${day}`, mode });
  s.day = day;
  s.phase = 'day';
  s.phaseElapsed = PHASE_SECONDS.day - 0.01;
  s.pendingDraft = null;
  s.draftsOwed = 0;
  s.monsters = [];
  s.inventory = { ...inventory };
  return { s, rng: RunRng.fromSeed(`r1-${day}`) };
}

function toEvening(s: GameState, rng: RunRng) {
  stepRun(s, rng, still, 0.05, data);
  expect(s.phase).toBe('evening');
}

describe('R1: evening resolved once, from systems/', () => {
  it('dusk opens the evening without cooking anything', () => {
    const { s, rng } = lateDay(1, { grain: 4, water: 4, fish: 2 });
    toEvening(s, rng);
    expect(s.eveningResolved).toBe(false);
    expect(s.inventory).toEqual({ grain: 4, water: 4, fish: 2 });
    expect(s.nightBuff).toBeUndefined();
  });

  it('confirm cooks only the chosen meal, once', () => {
    const { s, rng } = lateDay(1, { grain: 4, water: 4, fish: 2 });
    toEvening(s, rng);
    submitEvening(s, 'hard_bread', 'trap');
    expect(s.inventory).toEqual({ grain: 2, water: 4, fish: 2 });
    expect(s.nightBuff?.maxHpMult).toBe(1.2);
    expect(s.traps).toHaveLength(6);
    // A second confirm, or night start, never cooks again.
    submitEvening(s, 'grilled_fish', 'trap');
    s.phaseElapsed = PHASE_SECONDS.evening - 0.01;
    stepRun(s, rng, still, 0.05, data);
    expect(s.phase).toBe('night');
    expect(s.inventory).toEqual({ grain: 2, water: 4, fish: 2 });
  });

  it('no confirm (sim): night start picks the best affordable meal and the trap', () => {
    const { s, rng } = lateDay(1, { grain: 2, water: 1, fish: 1 });
    toEvening(s, rng);
    s.phaseElapsed = PHASE_SECONDS.evening - 0.01;
    stepRun(s, rng, still, 0.05, data);
    expect(s.phase).toBe('night');
    expect(s.eveningResolved).toBe(true);
    expect(s.inventory).toEqual({ grain: 2, water: 0, fish: 0 }); // grilled fish ranks above bread
    expect(s.traps).toHaveLength(6);
  });

  it('skipping the meal is hungry and keeps the stock', () => {
    const { s, rng } = lateDay(2, { grain: 2 });
    toEvening(s, rng);
    submitEvening(s, null, 'trap');
    expect(s.inventory).toEqual({ grain: 2 });
    expect(s.nightBuff?.damageMult).toBe(0.85);
    expect(s.dayStats?.hungry).toBe(true);
  });

  it('fence costs the meal plus one spare dish; without a spare it falls back to the trap', () => {
    const rich = lateDay(2, { grain: 4 });
    toEvening(rich.s, rich.rng);
    submitEvening(rich.s, 'hard_bread', 'fence');
    expect(rich.s.inventory?.grain).toBe(0);
    expect(rich.s.coreShield).toBe(300);
    expect(rich.s.traps).toEqual([]);

    const poor = lateDay(2, { grain: 2 });
    toEvening(poor.s, poor.rng);
    submitEvening(poor.s, 'hard_bread', 'fence');
    expect(poor.s.coreShield).toBe(0);
    expect(poor.s.traps).toHaveLength(6);
  });

  it('overtime is never applied in Daily (GDD §2)', () => {
    const { s, rng } = lateDay(5, { grain: 2 }, 'daily');
    toEvening(s, rng);
    submitEvening(s, 'hard_bread', 'overtime');
    expect(s.overtimeUsed).toBeFalsy();
    expect(s.inventory?.grain).toBe(0); // the meal was cooked, trap used instead
  });

  it('recall (D22) runs the same dusk: chests end and the evening opens unresolved', () => {
    const { s, rng } = lateDay(3, { grain: 2 });
    s.phaseElapsed = 10;
    s.chests = [{ x: 0, y: 0, opened: true }, { x: 1, y: 1, opened: false }];
    expect(recallToEvening(s, rng, data)).toBe(true);
    expect(s.phase).toBe('evening');
    expect(s.eveningResolved).toBe(false);
    expect(s.dayStats?.chestsOpened).toBe(1);
    expect(s.chests ?? []).toHaveLength(0);
    expect(s.inventory).toEqual({ grain: 2 });
  });

  it('beginEvening called directly still works for older callers', () => {
    const s = createRun({ seed: 'direct' });
    s.day = 1;
    s.phase = 'evening';
    s.inventory = { grain: 2 };
    beginEvening(s);
    expect(s.inventory.grain).toBe(0);
  });
});
