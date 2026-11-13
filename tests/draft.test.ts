import { describe, expect, it } from 'vitest';
import skillsData from '../src/data/skills.json';
import { RunRng } from '../src/core/rng';
import { drawDraft } from '../src/systems/draft';
import { validateSkills, type SkillDef } from '../src/systems/skills';

const pool = validateSkills(skillsData);
const ids = (cards: SkillDef[]) => cards.map((c) => c.id);

describe('draft', () => {
  it('offers 3 distinct skills that the player does not already own', () => {
    const rng = RunRng.fromSeed('draft-1').get('draft');
    const owned = new Set(['W01', 'E01']);
    const cards = drawDraft(rng, pool, owned);
    expect(cards).toHaveLength(3);
    expect(new Set(ids(cards)).size).toBe(3);
    for (const c of cards) expect(owned.has(c.id)).toBe(false);
  });

  it('is deterministic for the same seed (no free rerolls, D19)', () => {
    const a = drawDraft(RunRng.fromSeed('same').get('draft'), pool, new Set());
    const b = drawDraft(RunRng.fromSeed('same').get('draft'), pool, new Set());
    expect(ids(a)).toEqual(ids(b));
  });

  it('steps down a rarity when no card of that rarity is left', () => {
    // Pool with only common skills: rare/epic/legendary rolls must step down to common.
    const onlyCommon = pool.filter((s) => s.rarity === 'common');
    const rng = RunRng.fromSeed('downgrade').get('draft');
    const cards = drawDraft(rng, onlyCommon, new Set(), { count: 3 });
    expect(cards).toHaveLength(3);
    for (const c of cards) expect(c.rarity).toBe('common');
  });

  it('returns fewer cards when the pool runs out', () => {
    const cards = drawDraft(RunRng.fromSeed('small').get('draft'), pool.slice(0, 2), new Set());
    expect(cards.length).toBeLessThanOrEqual(2);
  });

  it('pair bias raises how often a skill is offered (D10)', () => {
    // Bias only reorders cards of the same rarity, so the target must share a rarity with others (W01 is common).
    const target = 'W01';
    let plain = 0;
    let biased = 0;
    for (let i = 0; i < 400; i++) {
      const seed = `bias-${i}`;
      if (ids(drawDraft(RunRng.fromSeed(seed).get('draft'), pool, new Set())).includes(target)) plain++;
      const withBias = drawDraft(RunRng.fromSeed(seed).get('draft'), pool, new Set(), {
        pairBias: new Set([target]),
      });
      if (ids(withBias).includes(target)) biased++;
    }
    expect(biased).toBeGreaterThan(plain);
  });

  it('never rolls mythic (MVP weight is 0, D3)', () => {
    for (let i = 0; i < 200; i++) {
      const cards = drawDraft(RunRng.fromSeed(`m-${i}`).get('draft'), pool, new Set());
      for (const c of cards) expect(c.rarity).not.toBe('mythic');
    }
  });
});
