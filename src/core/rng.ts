/**
 * Seeded RNG split into independent named streams (GDD §10, §12; decisions D19).
 *
 * Every stream derives from one run seed, so a Daily Seed reproduces the same map,
 * loot and Draft for everyone, while the player's choices in one stream (e.g. combat)
 * never shift the results of another (e.g. draft).
 *
 * Stream state is a single uint32 and is saved in the snapshot, so closing the tab and
 * resuming shows the exact same pending cards (no free rerolls).
 */

export const STREAMS = ['map', 'loot', 'draft', 'combat', 'event'] as const;
export type StreamName = (typeof STREAMS)[number];

/** FNV-1a 32-bit hash: turns "seed:stream" into a stream's starting state. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One mulberry32 stream. Small, fast, and its whole state is one number. */
export class RngStream {
  constructor(private state: number) {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() from empty list');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick; weights need not sum to 1 (used by Draft bias, D10). */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    if (items.length === 0 || total <= 0) throw new Error('weighted() needs positive weights');
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }

  getState(): number {
    return this.state;
  }
}

export type RngState = Record<StreamName, number>;

export class RunRng {
  readonly streams: Record<StreamName, RngStream>;

  private constructor(readonly seed: string, states: RngState) {
    this.streams = Object.fromEntries(
      STREAMS.map((name) => [name, new RngStream(states[name])]),
    ) as Record<StreamName, RngStream>;
  }

  static fromSeed(seed: string): RunRng {
    const states = Object.fromEntries(STREAMS.map((name) => [name, hash32(`${seed}:${name}`)])) as RngState;
    return new RunRng(seed, states);
  }

  static restore(seed: string, states: RngState): RunRng {
    return new RunRng(seed, states);
  }

  get(name: StreamName): RngStream {
    return this.streams[name];
  }

  snapshot(): RngState {
    return Object.fromEntries(STREAMS.map((name) => [name, this.streams[name].getState()])) as RngState;
  }
}

/** Daily Seed for a calendar date in the player's local time, e.g. "daily-2026-11-13". */
export function dailySeed(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `daily-${y}-${m}-${d}`;
}
