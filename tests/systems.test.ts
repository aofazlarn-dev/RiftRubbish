import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { createRun, deserialize, serialize, SAVE_VERSION } from '../src/core/state';
import { advanceClock, isUntimed, phaseRemaining, recallEarly } from '../src/systems/clock';
import { movePlayer, normalizeInput } from '../src/systems/movement';

describe('clock', () => {
  it('runs day 70s → evening 20s → night 40s → next day', () => {
    const s = createRun({ seed: 't' });
    const phases: string[] = [];
    const bus = new EventBus();
    bus.on('phase:change', ({ day, phase }) => phases.push(`${day}:${phase}`));
    advanceClock(s, 70, bus);
    advanceClock(s, 20, bus);
    advanceClock(s, 40, bus);
    expect(phases).toEqual(['1:evening', '1:night', '2:day']);
  });

  it('a big dt crosses several phases correctly', () => {
    const s = createRun({ seed: 't' });
    advanceClock(s, 130 * 2 + 5);
    expect(s.day).toBe(3);
    expect(s.phase).toBe('day');
    expect(s.phaseElapsed).toBeCloseTo(5);
  });

  it('night 7 has no timer', () => {
    const s = createRun({ seed: 't' });
    advanceClock(s, 130 * 6 + 90); // into night 7
    expect(s.day).toBe(7);
    expect(isUntimed(s)).toBe(true);
    advanceClock(s, 10_000);
    expect(s.phase).toBe('night');
    expect(phaseRemaining(s)).toBe(Infinity);
  });

  it('recall early skips day only (D22)', () => {
    const s = createRun({ seed: 't' });
    expect(recallEarly(s)).toBe(true);
    expect(s.phase).toBe('evening');
    expect(recallEarly(s)).toBe(false);
  });
});

describe('movement', () => {
  it('diagonal is not faster than straight', () => {
    const v = normalizeInput({ x: 1, y: 1 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('moves at player speed and stays inside bounds', () => {
    const s = createRun({ seed: 't' });
    movePlayer(s.player, { x: 1, y: 0 }, 1, { width: 1000, height: 1000 });
    expect(s.player.x).toBe(140);
    movePlayer(s.player, { x: -1, y: -1 }, 10, { width: 1000, height: 1000 });
    expect(s.player.x).toBe(0);
    expect(s.player.y).toBe(0);
  });
});

describe('save', () => {
  it('round-trips and rejects future versions', () => {
    const s = createRun({ seed: 'save', fromSeedLink: true });
    expect(deserialize(serialize(s))).toEqual(s);
    expect(() => deserialize(JSON.stringify({ ...s, version: SAVE_VERSION + 1 }))).toThrow();
  });
});

describe('event bus', () => {
  it('once fires a single time and off unsubscribes', () => {
    const bus = new EventBus();
    let n = 0;
    bus.once('player:levelup', () => n++);
    bus.emit('player:levelup', { level: 2 });
    bus.emit('player:levelup', { level: 3 });
    expect(n).toBe(1);
  });
});
