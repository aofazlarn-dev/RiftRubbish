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

/** What happened today, collected during the day and night, read at dawn. */
export interface DayStats {
  kills: number;
  coreLost: boolean;
  fuses: number;
  chestsOpened: number;
  downs: number;
  hungry: boolean;
}

export function freshDayStats(): DayStats {
  return { kills: 0, coreLost: false, fuses: 0, chestsOpened: 0, downs: 0, hungry: false };
}

/** Which of the chosen missions were completed today. */
export function completedMissions(ids: readonly string[], s: DayStats): Mission['id'][] {
  const done: Mission['id'][] = [];
  for (const id of ids) {
    const ok =
      id === 'M_KILL30' ? s.kills >= 30 :
      id === 'M_NOCORE' ? !s.coreLost :
      id === 'M_FUSE' ? s.fuses >= 1 :
      id === 'M_CHEST' ? s.chestsOpened >= 2 :
      id === 'M_SURVIVE' ? s.downs <= 1 :
      id === 'M_EAT' ? !s.hungry : false;
    if (ok) done.push(id as Mission['id']);
  }
  return done;
}

/** Shards for the completed missions (each already capped at 5). */
export function missionShards(done: readonly Mission['id'][]): number {
  return done.reduce((sum, id) => sum + (MISSIONS.find((m) => m.id === id)?.shards ?? 0), 0);
}
