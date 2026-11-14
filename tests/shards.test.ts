import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { createRun } from '../src/core/state';
import { attachShardLedger, baseShards, runPayout } from '../src/systems/shards';

describe('Soul Shard base (GDD §5, balance §7)', () => {
  it('per night 5/7/9/11/13/15/20, total 80 for seven nights', () => {
    expect(baseShards(1)).toBe(5);
    expect(baseShards(4)).toBe(32);
    expect(baseShards(7)).toBe(80);
    expect(baseShards(9)).toBe(80); // capped
    expect(baseShards(0)).toBe(0);
  });

  it('balance example: dying on night 5 (4 nights survived) gives ~16 before missions', () => {
    expect(runPayout({ nightsSurvived: 4, outcome: 'lose', overtime: false, seedLink: false })).toBe(16);
  });
});

describe('payout multipliers (D18)', () => {
  it('win is ×1.3 of the full 80', () => {
    expect(runPayout({ nightsSurvived: 7, outcome: 'win', overtime: false, seedLink: false })).toBe(104);
  });

  it('surrender is the same as losing (×0.5)', () => {
    const lose = runPayout({ nightsSurvived: 4, outcome: 'lose', overtime: false, seedLink: false });
    const surrender = runPayout({ nightsSurvived: 4, outcome: 'surrender', overtime: false, seedLink: false });
    expect(surrender).toBe(lose);
  });

  it('overtime adds 20% of the whole run, after the outcome multiplier', () => {
    // 4 nights = 32 base, lose ×0.5 = 16, overtime +20% = 19.2 -> floor 19
    expect(runPayout({ nightsSurvived: 4, outcome: 'lose', overtime: true, seedLink: false })).toBe(19);
  });

  it('seed-link runs earn no Shard (D19)', () => {
    expect(runPayout({ nightsSurvived: 7, outcome: 'win', overtime: true, seedLink: true })).toBe(0);
  });
});

describe('ledger on run:end', () => {
  it('a loss on night 5 records 16 shards', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'ledger-lose' });
    attachShardLedger(bus, s);
    bus.emit('run:end', { night: 5, result: 'lose' });
    expect(s.shardsEarned).toBe(16);
  });

  it('a win records the full win payout', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'ledger-win' });
    attachShardLedger(bus, s);
    bus.emit('run:end', { night: 7, result: 'win' });
    expect(s.shardsEarned).toBe(104);
  });

  it('overtime chosen during the run is counted', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'ledger-ot' });
    s.overtimeChosen = true;
    attachShardLedger(bus, s);
    bus.emit('run:end', { night: 5, result: 'lose' });
    expect(s.shardsEarned).toBe(19);
  });
});
