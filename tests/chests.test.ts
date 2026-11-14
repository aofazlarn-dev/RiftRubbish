import { describe, expect, it } from 'vitest';
import { RunRng, type RngStream } from '../src/core/rng';
import { createRun } from '../src/core/state';
import { CORE_X, CORE_Y, dist, TILE } from '../src/core/world';
import { clearChests, eliteCoreOnDeath, spawnChests, tickChests } from '../src/systems/chests';

/** A stub stream: next() returns a fixed value, pick() takes the first item. */
function fixedRng(value: number): RngStream {
  return {
    next: () => value,
    pick: <T>(items: readonly T[]) => items[0],
    chance: () => value < 0.5,
    get: () => fixedRng(value),
  } as unknown as RngStream;
}

describe('daytime chests (D17)', () => {
  it('two chests, 10 to 16 tiles from the core', () => {
    const s = createRun({ seed: 'chests-place' });
    spawnChests(s, RunRng.fromSeed('chests-place').get('loot'));
    expect(s.chests).toHaveLength(2);
    for (const c of s.chests!) {
      const d = dist(c.x, c.y, CORE_X, CORE_Y);
      expect(d).toBeGreaterThanOrEqual(10 * TILE - 1);
      expect(d).toBeLessThanOrEqual(16 * TILE + 1);
      expect(c.opened).toBe(false);
    }
  });

  it('standing next to a chest opens it once and adds 1 to 2 ingredients', () => {
    const s = createRun({ seed: 'chests-open' });
    s.chests = [{ x: 500, y: 500, opened: false }];
    s.player.x = 500;
    s.player.y = 500;
    s.inventory = {};
    tickChests(s, fixedRng(0.1));
    tickChests(s, fixedRng(0.1));
    expect(s.chests![0].opened).toBe(true);
    const total = Object.values(s.inventory ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(2);
  });

  it('a far player opens nothing', () => {
    const s = createRun({ seed: 'chests-far' });
    s.chests = [{ x: 500, y: 500, opened: false }];
    s.player.x = 0;
    s.player.y = 0;
    tickChests(s, fixedRng(0.1));
    expect(s.chests![0].opened).toBe(false);
  });

  it('Fusion Core chance only on days 5 to 7 and at most once per run', () => {
    const early = createRun({ seed: 'core-early' });
    early.day = 4;
    early.chests = [{ x: 500, y: 500, opened: false }];
    early.player.x = 500;
    early.player.y = 500;
    tickChests(early, fixedRng(0.01));
    expect(early.cores ?? 0).toBe(0);

    const late = createRun({ seed: 'core-late' });
    late.day = 6;
    late.chests = [
      { x: 500, y: 500, opened: false },
      { x: 500, y: 500, opened: false },
    ];
    late.player.x = 500;
    late.player.y = 500;
    tickChests(late, fixedRng(0.01)); // the roll passes (0.01 < 0.05)
    expect(late.cores).toBe(1);
    expect(late.chestCoreGiven).toBe(true);
    // A second chest on the same run cannot roll a second Core.
    late.chests = [{ x: 500, y: 500, opened: false }];
    tickChests(late, fixedRng(0.01));
    expect(late.cores).toBe(1);
  });

  it('dusk clears the chests', () => {
    const s = createRun({ seed: 'chests-clear' });
    spawnChests(s, RunRng.fromSeed('chests-clear').get('loot'));
    clearChests(s);
    expect(s.chests).toEqual([]);
  });
});

describe('Elite drops a Fusion Core (D6)', () => {
  it('rift wolf death gives one Core, other deaths give none', () => {
    const s = createRun({ seed: 'elite-core' });
    eliteCoreOnDeath(s, 'rift_wolf');
    expect(s.cores).toBe(1);
    eliteCoreOnDeath(s, 'goblin');
    expect(s.cores).toBe(1);
  });
});
