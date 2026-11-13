/**
 * Night wave schedule as pure functions (balance.md §5.1). No Phaser: the scene or the
 * monster system reads the schedule and spawns when `t` is reached.
 *
 * Nights 1–6 (40 s): 30% of the wave in the first 10 s, 40% in 10–25 s, 30% in 25–35 s,
 * nothing in the last 5 s. Night 7: one background monster every 1.8 s for the first 90 s.
 */

import type { RngStream } from '../core/rng';

export interface MonsterDef {
  id: string;
  name: { th: string; en: string };
  hp: number;
  damage: number;
  coreDamage: number;
  coreInterval: number;
  speed: number;
  xp: number;
  weak: string[];
  resist: Record<string, number>;
}

export interface NightWave {
  night: number;
  affixChance: number;
  spawns: Record<string, number>;
  elite?: string;
  boss?: string;
}

export interface WavesData {
  maxOnScreen: number;
  nights: NightWave[];
}

export interface SpawnEvent {
  /** Seconds since the night started. */
  t: number;
  monsterId: string;
  affix: boolean;
}

/** [start, end, share of the wave] for nights 1–6. */
const BURSTS: readonly (readonly [number, number, number])[] = [
  [0, 10, 0.3],
  [10, 25, 0.4],
  [25, 35, 0.3],
];
const FINAL_NIGHT_INTERVAL = 1.8;

export function waveForNight(data: WavesData, night: number): NightWave {
  const wave = data.nights.find((n) => n.night === night);
  if (!wave) throw new Error(`No wave data for night ${night}`);
  return wave;
}

/** Sum of base HP of every normal monster in the wave (no affix bonus, no elite/boss). */
export function waveTotalHp(wave: NightWave, monsters: readonly MonsterDef[]): number {
  let total = 0;
  for (const [id, count] of Object.entries(wave.spawns)) {
    const def = monsters.find((m) => m.id === id);
    if (!def) throw new Error(`Wave for night ${wave.night} uses unknown monster "${id}"`);
    total += def.hp * count;
  }
  return total;
}

/**
 * Builds the ordered spawn list for a night. Monster order and affix rolls use the given
 * stream (pass the 'combat' stream), so a seed always produces the same night.
 */
export function buildNightSpawns(wave: NightWave, rng: RngStream, finalNight = 7): SpawnEvent[] {
  const ids: string[] = [];
  for (const [id, count] of Object.entries(wave.spawns)) {
    for (let i = 0; i < count; i++) ids.push(id);
  }
  // Fisher–Yates with the run's RNG (never Math.random in game logic).
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  const times = wave.night >= finalNight ? trickleTimes(ids.length) : burstTimes(ids.length);
  return ids.map((monsterId, i) => ({
    t: times[i],
    monsterId,
    affix: wave.affixChance > 0 && rng.chance(wave.affixChance),
  }));
}

function trickleTimes(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(i * FINAL_NIGHT_INTERVAL * 100) / 100);
}

function burstTimes(count: number): number[] {
  // Split the count across bursts; rounding leftovers go to the last burst.
  const sizes = BURSTS.map(([, , share]) => Math.floor(count * share));
  sizes[sizes.length - 1] += count - sizes.reduce((a, b) => a + b, 0);
  const times: number[] = [];
  BURSTS.forEach(([start, end], b) => {
    const n = sizes[b];
    for (let i = 0; i < n; i++) times.push(Math.round((start + ((end - start) * i) / n) * 100) / 100);
  });
  return times;
}
