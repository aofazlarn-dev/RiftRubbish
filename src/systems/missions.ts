/**
 * Daily missions (approved drafts, PR #44; GDD §2, D11). Pure, no Phaser.
 * Casual only: three missions per day, drawn from the list by a stable hash of the seed and date.
 * Each completed mission pays its Shards (at most 5 each). Progress tracking is not built yet.
 */

export interface Mission {
  id: 'M_KILL30' | 'M_NOCORE' | 'M_FUSE' | 'M_CHEST' | 'M_SURVIVE' | 'M_EAT';
  shards: number;
}

export const MISSIONS: readonly Mission[] = [
  { id: 'M_KILL30', shards: 3 },
  { id: 'M_NOCORE', shards: 5 },
  { id: 'M_FUSE', shards: 4 },
  { id: 'M_CHEST', shards: 3 },
  { id: 'M_SURVIVE', shards: 4 },
  { id: 'M_EAT', shards: 2 },
];

/** Small stable hash (FNV-1a) so the same seed and date always give the same missions. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Three distinct missions for one day. Casual only; Daily gets none (GDD §2). */
export function dailyMissions(seed: string, isoDate: string, mode: 'casual' | 'daily'): Mission[] {
  if (mode !== 'casual') return [];
  const pool = [...MISSIONS];
  const out: Mission[] = [];
  let h = hash(`${seed}|${isoDate}`);
  while (out.length < 3 && pool.length > 0) {
    const i = h % pool.length;
    out.push(pool.splice(i, 1)[0]);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  return out;
}
