import { describe, expect, it } from 'vitest';
import { exportMeta, importMeta } from '../src/core/metaSave';

const IDS = ['META_GLOVE', 'META_SLIPPER', 'META_LID'];

describe('meta export and import', () => {
  it('round-trips the bank, items and last Daily date', () => {
    const m = { bank: 42, owned: ['META_GLOVE'], lastDailyDate: '2026-11-15' };
    expect(importMeta(exportMeta(m), IDS)).toEqual(m);
  });

  it('rejects junk, wrong format and unknown items', () => {
    expect(importMeta('not json', IDS)).toBeNull();
    expect(importMeta('{"bank":5,"owned":[]}', IDS)).toBeNull();
    expect(importMeta(JSON.stringify({ format: 'riftrubbish-meta', version: 1, bank: 5, owned: ['HACK'] }), IDS)).toBeNull();
    expect(importMeta(JSON.stringify({ format: 'riftrubbish-meta', version: 1, bank: -3, owned: [] }), IDS)).toBeNull();
  });

  it('drops a malformed date and removes duplicate items', () => {
    const r = importMeta(
      JSON.stringify({ format: 'riftrubbish-meta', version: 1, bank: 7.9, owned: ['META_LID', 'META_LID'], lastDailyDate: 'today' }),
      IDS,
    );
    expect(r).toEqual({ bank: 7, owned: ['META_LID'], lastDailyDate: undefined });
  });
});
