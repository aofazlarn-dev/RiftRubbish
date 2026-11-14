/** Gap round 2 R2: ingredients come from walking the map (GDD §4, balance §6.2). */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { RunRng } from '../src/core/rng';
import { createRun, PHASE_SECONDS } from '../src/core/state';
import { CORE_X, CORE_Y, dist, TILE } from '../src/core/world';
import { loadRunData } from '../src/data';
import { INGREDIENT_PICKUP_PX, NODE_MAX_TILES, NODE_MIN_TILES, tickGather, WELL_MAX_TILES } from '../src/systems/gather';
import { startRun, stepRun } from '../src/systems/run';

const data = loadRunData();

function newRun(seed: string) {
  const s = createRun({ seed });
  const rng = RunRng.fromSeed(seed);
  startRun(s, rng, data);
  s.pendingDraft = null;
  s.draftsOwed = 0;
  s.monsters = [];
  return { s, rng };
}

describe('R2: walk to gather', () => {
  it('nodes sit 5–16 tiles out and the well 3–4 tiles from the spawn', () => {
    const { s } = newRun('layout');
    for (const n of s.resourceNodes ?? []) {
      const d = dist(n.x, n.y, CORE_X, CORE_Y) / TILE;
      expect(d).toBeGreaterThanOrEqual(NODE_MIN_TILES - 0.01);
      expect(d).toBeLessThanOrEqual(NODE_MAX_TILES + 0.01);
    }
    const w = dist(s.well!.x, s.well!.y, CORE_X, CORE_Y) / TILE;
    expect(w).toBeLessThanOrEqual(WELL_MAX_TILES + 0.01);
  });

  it('standing still at the base picks up nothing from the map', () => {
    const { s, rng } = newRun('idle');
    s.well!.water = 0;
    s.well!.fish = 0;
    for (let i = 0; i < 100; i++) stepRun(s, rng, { x: 0, y: 0 }, 0.1, data);
    expect(Object.values(s.inventory ?? {}).reduce((a, n) => a + (n ?? 0), 0)).toBe(0);
  });

  it('walking onto a node picks it up once, within 64 px, and tells the scene', () => {
    const { s } = newRun('pick');
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('item:pickup', (e) => seen.push(`${e.kind}x${e.count}`));
    const node = s.resourceNodes![0];
    s.player.x = node.x + INGREDIENT_PICKUP_PX + 1;
    s.player.y = node.y;
    tickGather(s, bus);
    expect(node.taken).toBe(false);
    s.player.x = node.x + INGREDIENT_PICKUP_PX - 1;
    tickGather(s, bus);
    tickGather(s, bus);
    expect(node.taken).toBe(true);
    expect(s.inventory?.[node.kind]).toBe(1);
    expect(seen).toEqual([`${node.kind}x1`]);
  });

  it('the well gives 2 water + 1 fish once a day and refills at dawn', () => {
    const { s, rng } = newRun('well');
    s.player.x = s.well!.x;
    s.player.y = s.well!.y;
    tickGather(s);
    expect(s.inventory).toMatchObject({ water: 2, fish: 1 });
    tickGather(s);
    expect(s.inventory).toMatchObject({ water: 2, fish: 1 });
    // Run to dawn of day 2 (evening resolves itself; nothing cookable but water+fish = grilled fish).
    s.player.x = CORE_X;
    s.player.y = CORE_Y;
    s.phaseElapsed = PHASE_SECONDS.day - 0.01;
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data); // → evening
    s.phaseElapsed = PHASE_SECONDS.evening - 0.01;
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data); // → night (auto meal)
    expect(s.inventory).toMatchObject({ water: 1, fish: 0 });
    s.monsters = [];
    s.spawnQueue = [];
    s.phaseElapsed = PHASE_SECONDS.night - 0.01;
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data); // → day 2
    expect(s.day).toBe(2);
    expect(s.well).toMatchObject({ water: 2, fish: 1 });
    expect(s.resourceNodes?.every((n) => !n.taken)).toBe(true);
  });

  it('nodes left at dusk wither', () => {
    const { s, rng } = newRun('wither');
    s.phaseElapsed = PHASE_SECONDS.day - 0.01;
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    expect(s.phase).toBe('evening');
    expect(s.resourceNodes).toEqual([]);
  });

  it('a full day of walking the nodes gets the balance target of ~5–7 items or more', () => {
    const { s } = newRun('route');
    for (const n of s.resourceNodes ?? []) {
      s.player.x = n.x;
      s.player.y = n.y;
      tickGather(s);
    }
    s.player.x = s.well!.x;
    s.player.y = s.well!.y;
    tickGather(s);
    const total = Object.values(s.inventory ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    expect(total).toBe(9); // all of it; ~20 s of walking gets 5–7 of these
  });
});
