/**
 * Meta bank and owned meta items, kept across runs (decision: localStorage for now, export/import later).
 * Every storage call is wrapped: storage can be blocked or empty, and the game must still run.
 */

const KEY = 'riftrubbish:meta';

export interface MetaSave {
  /** Soul Shard not yet spent. */
  bank: number;
  /** Meta item ids bought so far. */
  owned: string[];
  /** Date (YYYY-MM-DD) of the last Daily run that earned Shard (D19). */
  lastDailyDate?: string;
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { bank: 0, owned: [] };
    const d = JSON.parse(raw) as Partial<MetaSave>;
    return {
      bank: typeof d.bank === 'number' && d.bank >= 0 ? d.bank : 0,
      owned: Array.isArray(d.owned) ? d.owned.filter((x): x is string => typeof x === 'string') : [],
      lastDailyDate: typeof d.lastDailyDate === 'string' ? d.lastDailyDate : undefined,
    };
  } catch {
    return { bank: 0, owned: [] };
  }
}

export function saveMeta(m: MetaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Storage full or blocked. The shop still works for this session.
  }
}

/** Adds Shard from a finished run and, for Daily, records the date that earned it. */
export function creditShards(amount: number, dailyDate?: string): MetaSave {
  const m = loadMeta();
  m.bank += Math.max(0, Math.floor(amount));
  if (dailyDate) m.lastDailyDate = dailyDate;
  saveMeta(m);
  return m;
}

/** Text for the player to save by hand: the bank, owned items, and the last Daily date. */
export function exportMeta(m: MetaSave = loadMeta()): string {
  return JSON.stringify({ format: 'riftrubbish-meta', version: 1, ...m });
}

/**
 * Reads text from exportMeta(). Returns null if the text is not a valid save, so a bad paste
 * never overwrites the player's bank or items.
 */
export function importMeta(text: string, knownItemIds: readonly string[]): MetaSave | null {
  try {
    const d = JSON.parse(text) as Partial<MetaSave> & { format?: string; version?: number };
    if (d.format !== 'riftrubbish-meta' || d.version !== 1) return null;
    if (typeof d.bank !== 'number' || !Number.isFinite(d.bank) || d.bank < 0) return null;
    if (!Array.isArray(d.owned) || !d.owned.every((x) => typeof x === 'string' && knownItemIds.includes(x))) return null;
    const lastDailyDate = typeof d.lastDailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.lastDailyDate) ? d.lastDailyDate : undefined;
    return { bank: Math.floor(d.bank), owned: [...new Set(d.owned)], lastDailyDate };
  } catch {
    return null;
  }
}
