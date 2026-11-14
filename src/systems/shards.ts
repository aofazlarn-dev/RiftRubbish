/**
 * Soul Shard payout at the end of a run (Gap vs Spec G7, part 1; GDD §5, D18, D19, balance §7).
 * Pure, no Phaser.
 *
 * - Shards per survived night: 5, 7, 9, 11, 13, 15, 20 (sum 80).
 * - Win: ×1.3 of the total. Lose or surrender (day only): ×0.5 of the survived nights.
 * - Overtime (balance §6.3): +20% of the whole run, applied last (finalShards).
 * - Seed-link runs (`?seed=`) earn no Shard (D19).
 *
 * Not built yet: mission Shards, the meta unlock spending, Daily-only rules, and the save/import flow.
 */

import type { EventBus } from '../core/events';
import type { GameState } from '../core/state';
import { finalShards } from './evening';
import { creditShards, loadMeta } from '../core/metaSave';
import { dailyEarnsShard } from './daily';

export const SHARD_PER_NIGHT: readonly number[] = [5, 7, 9, 11, 13, 15, 20];
export const WIN_MULT = 1.3;
export const LOSE_MULT = 0.5;
export const SURRENDER_MULT = 0.5;

/** Shard total for the first `nights` nights (capped at 7). */
export function baseShards(nights: number): number {
  const n = Math.max(0, Math.min(nights, SHARD_PER_NIGHT.length));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += SHARD_PER_NIGHT[i];
  return sum;
}

export interface PayoutInput {
  nightsSurvived: number;
  outcome: 'win' | 'lose' | 'surrender';
  overtime: boolean;
  seedLink: boolean;
}

/** Shards earned by one run. */
export function runPayout(input: PayoutInput): number {
  if (input.seedLink) return 0;
  const base = baseShards(input.nightsSurvived);
  const mult = input.outcome === 'win' ? WIN_MULT : input.outcome === 'surrender' ? SURRENDER_MULT : LOSE_MULT;
  const afterOutcome = Math.floor(base * mult);
  return finalShards(afterOutcome, input.overtime);
}

/** Records the payout on the state when the run ends. Surrender counts as day-time only (caller's rule). */
export function attachShardLedger(bus: EventBus, state: GameState): () => void {
  const off = bus.on('run:end', ({ night, result }) => {
    const outcome = result === 'win' ? 'win' : result === 'surrender' ? 'surrender' : 'lose';
    const nightsSurvived = outcome === 'win' ? 7 : Math.max(0, night - 1);
    // Daily: only the first Daily run of the day earns Shard (D19). Seed-link runs earn none.
    const today = new Date().toISOString().slice(0, 10);
    const dailyFirst = dailyEarnsShard(state.mode, today, loadMeta().lastDailyDate);
    // Mission Shards from completed missions are added after the outcome multiplier (approved draft).
    state.shardsEarned =
      runPayout({
        nightsSurvived,
        outcome,
        overtime: state.overtimeChosen ?? false,
        seedLink: state.fromSeedLink || !dailyFirst,
      }) + (state.fromSeedLink || !dailyFirst ? 0 : state.missionShards ?? 0);
    // Bank the Shard (meta is kept across runs, approved draft).
    if (state.shardsEarned > 0) creditShards(state.shardsEarned, state.mode === 'daily' ? today : undefined);
  });
  return off;
}
