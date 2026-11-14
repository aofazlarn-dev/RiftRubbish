import { describe, expect, it } from 'vitest';
import { dailyEarnsShard, dailySeed, overtimeAllowed } from '../src/systems/daily';

describe('Daily Seed rules (GDD §2, D19)', () => {
  it('one seed per date, the same for everyone', () => {
    expect(dailySeed('2026-11-14')).toBe('daily-2026-11-14');
    expect(dailySeed('2026-11-14')).toBe(dailySeed('2026-11-14'));
    expect(dailySeed('2026-11-15')).not.toBe(dailySeed('2026-11-14'));
  });

  it('rejects a malformed date', () => {
    expect(() => dailySeed('14/11/2026')).toThrow('Bad date');
  });

  it('overtime only in Casual', () => {
    expect(overtimeAllowed('casual')).toBe(true);
    expect(overtimeAllowed('daily')).toBe(false);
  });

  it('only the first Daily run of the day earns Shard', () => {
    expect(dailyEarnsShard('daily', '2026-11-14', undefined)).toBe(true);
    expect(dailyEarnsShard('daily', '2026-11-14', '2026-11-13')).toBe(true);
    expect(dailyEarnsShard('daily', '2026-11-14', '2026-11-14')).toBe(false);
  });

  it('Casual always earns Shard', () => {
    expect(dailyEarnsShard('casual', '2026-11-14', '2026-11-14')).toBe(true);
  });
});
