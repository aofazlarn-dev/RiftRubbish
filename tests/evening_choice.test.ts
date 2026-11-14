import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun, type GameState } from '../src/core/state';
import { CORE_X, CORE_Y, TILE } from '../src/core/world';
import { loadRunData } from '../src/data';
import { damageCore } from '../src/systems/base';
import { resolveEveningChoice, trapPositions } from '../src/systems/evening';
import { findDef, spawnMonster, tickMonsters } from '../src/systems/monsters';
import { beginEvening, stepRun } from '../src/systems/run';

const data = loadRunData();

function eveningState(day: number, inventory: Record<string, number>): GameState {
  const s = createRun({ seed: `choice-${day}` });
  s.day = day;
  s.phase = 'evening';
  s.inventory = { ...inventory };
  return s;
}

describe('resolveEveningChoice (balance §6.3)', () => {
  it('defaults to the free trap', () => {
    expect(resolveEveningChoice(undefined, { day: 1, spareMeals: 0, overtimeUsed: false })).toBe('trap');
  });

  it('fence needs a spare dish', () => {
    expect(resolveEveningChoice('fence', { day: 2, spareMeals: 0, overtimeUsed: false })).toBe('trap');
    expect(resolveEveningChoice('fence', { day: 2, spareMeals: 1, overtimeUsed: false })).toBe('fence');
  });

  it('overtime needs day 4 and not used before', () => {
    expect(resolveEveningChoice('overtime', { day: 3, spareMeals: 0, overtimeUsed: false })).toBe('trap');
    expect(resolveEveningChoice('overtime', { day: 4, spareMeals: 0, overtimeUsed: false })).toBe('overtime');
    expect(resolveEveningChoice('overtime', { day: 5, spareMeals: 0, overtimeUsed: true })).toBe('trap');
  });
});

describe('trap layout', () => {
  it('six traps on a ring of 4 tiles around the core, 3 uses each', () => {
    const traps = trapPositions(CORE_X, CORE_Y, TILE);
    expect(traps).toHaveLength(6);
    for (const t of traps) {
      expect(Math.hypot(t.x - CORE_X, t.y - CORE_Y)).toBeCloseTo(4 * TILE, 5);
      expect(t.uses).toBe(3);
    }
  });
});

describe('fence shield on the core', () => {
  it('absorbs core damage before HP, then leaves HP', () => {
    const s = createRun({ seed: 'shield' });
    s.coreShield = 300;
    damageCore(s, 200);
    expect(s.coreShield).toBe(100);
    expect(s.coreHp).toBe(1000);
    damageCore(s, 150);
    expect(s.coreShield).toBe(0);
    expect(s.coreHp).toBe(950);
  });
});

describe('beginEvening', () => {
  it('no choice requested: free traps and the meal', () => {
    const s = eveningState(1, { grain: 2 });
    beginEvening(s);
    expect(s.traps).toHaveLength(6);
    expect(s.nightBuff?.maxHpMult).toBe(1.2);
    expect(s.inventory?.grain).toBe(0);
  });

  it('fence: shield 30% of max HP and one more dish from stock', () => {
    const s = eveningState(2, { grain: 4 });
    s.requestedChoice = 'fence';
    beginEvening(s);
    expect(s.coreShield).toBe(300);
    expect(s.inventory?.grain).toBe(0);
    expect(s.traps ?? []).toEqual([]);
  });

  it('overtime: no meal (hungry) and marked used', () => {
    const s = eveningState(4, { grain: 2 });
    s.requestedChoice = 'overtime';
    beginEvening(s);
    expect(s.overtimeUsed).toBe(true);
    expect(s.overtimeChosen).toBe(true);
    expect(s.nightBuff?.damageMult).toBe(0.85);
    expect(s.inventory?.grain).toBe(2); // the meal was not cooked
  });
});

describe('trap effects', () => {
  it('a monster on a trap is stunned for 2 s and uses one charge', () => {
    const s = createRun({ seed: 'trap-monster' });
    s.monsters = [];
    s.traps = trapPositions(CORE_X, CORE_Y, TILE);
    const goblin = findDef(data.monsters, 'goblin');
    const m = spawnMonster(s, goblin, s.traps[0].x, s.traps[0].y);
    const x0 = m.x;
    tickMonsters(s, 0.1, data.monsters);
    expect(m.stunLeft).toBeCloseTo(1.9, 5);
    expect(m.x).toBe(x0); // stunned: no movement
    expect(s.traps[0].uses).toBe(2);
  });

  it('the player on a trap is stunned 1.5 s and cannot move', () => {
    const s = createRun({ seed: 'trap-player' });
    s.phase = 'day';
    s.traps = trapPositions(CORE_X, CORE_Y, TILE);
    s.player.x = s.traps[0].x;
    s.player.y = s.traps[0].y;
    const x0 = s.player.x;
    stepRun(s, RunRng.fromSeed('trap-player'), { x: 1, y: 0 }, 0.1, data);
    expect(s.player.stunLeft).toBeCloseTo(1.5, 5);
    expect(s.player.x).toBe(x0);
  });
});
