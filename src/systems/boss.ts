/**
 * Blood Moon King (night 7) as pure rules (balance.md §3.5). No Phaser.
 * The scene moves and draws the boss; this module owns HP, enrage timing, stat
 * changes and the post-enrage summon schedule.
 */

export const BOSS_MAX_HP = 5000;
/** Seconds after spawn until enrage (GDD §4, balance §3.5). */
export const BOSS_ENRAGE_SECONDS = 90;
const SUMMON_INTERVAL = 15;
/** Crowd control lasts 25% of its normal duration on the boss; knockback never applies. */
export const BOSS_CC_FACTOR = 0.25;

export interface BossState {
  hp: number;
  maxHp: number;
  /** Seconds since the boss spawned. */
  elapsed: number;
  enraged: boolean;
  /** Seconds until the next minion group; only counts down while enraged. */
  summonIn: number;
}

export interface BossStats {
  speed: number; // px/s
  slamDamage: number; // AoE r=96 px, every 3 s
  orbDamage: number; // per orb, 8 directions every 6 s
  coreDamage: number; // per 3 s
}

export interface BossTick {
  /** True on the tick where enrage starts. */
  enragedNow: boolean;
  /** Minion groups to spawn this tick. Each group is 3 goblins + 2 fog spirits. */
  summons: string[][];
}

const BASE_STATS: BossStats = { speed: 70, slamDamage: 20, orbDamage: 10, coreDamage: 50 };
const SUMMON_GROUP: readonly string[] = ['goblin', 'goblin', 'goblin', 'spirit', 'spirit'];

export function createBoss(): BossState {
  return { hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, elapsed: 0, enraged: false, summonIn: 0 };
}

/** Enrage: speed ×1.3, every damage number ×1.5 (balance §3.5). */
export function bossStats(boss: BossState): BossStats {
  if (!boss.enraged) return { ...BASE_STATS };
  return {
    speed: Math.round(BASE_STATS.speed * 1.3),
    slamDamage: BASE_STATS.slamDamage * 1.5,
    orbDamage: BASE_STATS.orbDamage * 1.5,
    coreDamage: BASE_STATS.coreDamage * 1.5,
  };
}

/** Advances boss timers. A dead boss does nothing. */
export function tickBoss(boss: BossState, dt: number): BossTick {
  const result: BossTick = { enragedNow: false, summons: [] };
  if (boss.hp <= 0 || dt <= 0) return result;

  let remaining = dt;
  if (!boss.enraged) {
    const untilEnrage = BOSS_ENRAGE_SECONDS - boss.elapsed;
    if (remaining < untilEnrage) {
      boss.elapsed += remaining;
      return result;
    }
    boss.elapsed += untilEnrage;
    remaining -= untilEnrage;
    boss.enraged = true;
    boss.summonIn = SUMMON_INTERVAL;
    result.enragedNow = true;
  }

  boss.elapsed += remaining;
  boss.summonIn -= remaining;
  while (boss.summonIn <= 0) {
    result.summons.push([...SUMMON_GROUP]);
    boss.summonIn += SUMMON_INTERVAL;
  }
  return result;
}

/** Applies damage. Returns true if this hit killed the boss (the run is won). */
export function damageBoss(boss: BossState, amount: number): boolean {
  if (boss.hp <= 0 || amount <= 0) return false;
  boss.hp = Math.max(0, boss.hp - amount);
  return boss.hp === 0;
}

/** Crowd-control duration on the boss. */
export function bossCcDuration(seconds: number): number {
  return seconds * BOSS_CC_FACTOR;
}
