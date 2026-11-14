import { describe, expect, it } from 'vitest';
import { createRun } from '../src/core/state';
import { expireTutorialGifts, forceTutorialFusion, grantTutorialGift, TUTORIAL_RESULT_ID } from '../src/systems/tutorial';

describe('welcome gift (Gap G2, GDD §3)', () => {
  it('Casual gets J02 + J03 as gifts', () => {
    const s = createRun({ seed: 'gift-casual', mode: 'casual' });
    expect(grantTutorialGift(s)).toBe(true);
    expect(s.tutorial).toBe('gift');
    expect(s.skills.filter((x) => x.gift).map((x) => x.id)).toEqual(['J02', 'J03']);
  });

  it('Daily gets no gift', () => {
    const s = createRun({ seed: 'gift-daily', mode: 'daily' });
    expect(grantTutorialGift(s)).toBe(false);
    expect(s.skills).toHaveLength(0);
    expect(s.tutorial).toBeUndefined();
  });

  it('gives the gift only once per run', () => {
    const s = createRun({ seed: 'gift-once', mode: 'casual' });
    grantTutorialGift(s);
    expect(grantTutorialGift(s)).toBe(false);
    expect(s.skills).toHaveLength(2);
  });

  it('forced fusion turns J02 + J03 into R01a Lv1 that is also a gift', () => {
    const s = createRun({ seed: 'gift-fuse', mode: 'casual' });
    grantTutorialGift(s);
    expect(forceTutorialFusion(s)).toBe(true);
    expect(s.tutorial).toBe('fused');
    expect(s.skills).toEqual([{ id: TUTORIAL_RESULT_ID, xp: 0, cooldownLeft: 0, gift: true }]);
  });

  it('fusion does nothing without the gift', () => {
    const s = createRun({ seed: 'gift-none', mode: 'casual' });
    expect(forceTutorialFusion(s)).toBe(false);
    expect(s.skills).toHaveLength(0);
  });

  it('dawn of day 2 removes the gift, fused or not, and does not come back', () => {
    const s = createRun({ seed: 'gift-expire', mode: 'casual' });
    grantTutorialGift(s);
    forceTutorialFusion(s);
    expect(expireTutorialGifts(s)).toBe(true);
    expect(s.skills).toHaveLength(0);
    expect(s.tutorial).toBe('done');
    expect(grantTutorialGift(s)).toBe(false);
  });

  it('expiring an unfused gift also removes both sources', () => {
    const s = createRun({ seed: 'gift-expire2', mode: 'casual' });
    grantTutorialGift(s);
    expireTutorialGifts(s);
    expect(s.skills).toHaveLength(0);
  });
});
