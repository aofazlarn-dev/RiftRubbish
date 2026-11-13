import { describe, expect, it } from 'vitest';
import { RunRng, dailySeed, hash32 } from '../src/core/rng';

describe('RunRng', () => {
  it('same seed gives the same sequence', () => {
    const a = RunRng.fromSeed('abc').get('draft');
    const b = RunRng.fromSeed('abc').get('draft');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('streams are independent: using combat does not change draft', () => {
    const a = RunRng.fromSeed('seed-1');
    const b = RunRng.fromSeed('seed-1');
    for (let i = 0; i < 50; i++) a.get('combat').next();
    expect(a.get('draft').next()).toBe(b.get('draft').next());
  });

  it('snapshot + restore continues exactly where it left off (no free reroll)', () => {
    const rng = RunRng.fromSeed('resume');
    rng.get('draft').next();
    const saved = rng.snapshot();
    const expected = rng.get('draft').next();
    const restored = RunRng.restore('resume', saved);
    expect(restored.get('draft').next()).toBe(expected);
  });

  it('int stays in range and weighted respects zero weight', () => {
    const s = RunRng.fromSeed('range').get('loot');
    for (let i = 0; i < 1000; i++) {
      const n = s.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(s.weighted(['a', 'b'], [1, 0])).toBe('a');
    }
  });

  it('hash and daily seed are stable', () => {
    expect(hash32('x')).toBe(hash32('x'));
    expect(dailySeed(new Date(2026, 10, 13))).toBe('daily-2026-11-13');
  });
});
