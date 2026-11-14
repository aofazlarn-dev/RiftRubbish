/**
 * Daily Seed rules (Gap vs Spec G7, part 2; GDD §2, D19, balance §7). Pure, no Phaser.
 *
 * Built now (defined in the docs):
 * - One seed for everyone per calendar day: `daily-YYYY-MM-DD`.
 * - Daily has no overtime (no "ทำโอทีกะดึก") and no Shard bonus from it.
 * - Only the first finished Daily run of the day earns Shard; later runs are practice (D19).
 *
 * Not built (not defined in the docs yet): the fixed Daily loadout, and the mission conditions.
 */

import type { Mode } from '../core/state';

/** The seed everyone gets on a given date (ISO YYYY-MM-DD). */
export function dailySeed(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Bad date: ${isoDate}`);
  return `daily-${isoDate}`;
}

/** Overtime is never offered in Daily (GDD §2). */
export function overtimeAllowed(mode: Mode): boolean {
  return mode === 'casual';
}

/**
 * True if this finished Daily run is the first of the day, so it earns Shard.
 * `lastCountedDate` is the date of the last Daily run that earned Shard (undefined if none).
 */
export function dailyEarnsShard(mode: Mode, isoDate: string, lastCountedDate: string | undefined): boolean {
  if (mode !== 'daily') return true;
  return lastCountedDate !== isoDate;
}
