/**
 * Mission progress wiring (approved drafts, PR #44). Pure rules, subscribes to the bus.
 * Each day's stats are read at dawn; completed missions add their Shards to state.missionShards,
 * which the run payout adds at the end (shards.ts).
 */

import type { EventBus } from '../core/events';
import type { GameState } from '../core/state';
import { dailyMissions, completedMissions, freshDayStats, missionShards } from './missions';

/** Chooses the day's missions when a Casual run starts. Daily gets none. */
export function chooseMissions(state: GameState, isoDate: string): void {
  // Same missions for everyone on a date, so the title screen and the run agree.
  state.missionIds = dailyMissions(isoDate, isoDate, state.mode).map((m) => m.id);
  state.dayStats = freshDayStats();
  state.missionShards = state.missionShards ?? 0;
}

/** Subscribes the per-day counters. Returns an unsubscribe function. */
export function attachMissionTracker(bus: EventBus, state: GameState): () => void {
  const stats = () => {
    if (!state.dayStats) state.dayStats = freshDayStats();
    return state.dayStats;
  };
  const offs = [
    bus.on('player:down', () => { stats().downs += 1; }),
    bus.on('skill:fused', () => { stats().fuses += 1; }),
  ];
  return () => offs.forEach((off) => off());
}

/** Dawn: score the day that just ended, add its Shards, and start a fresh day. */
export function settleDay(state: GameState): number {
  const done = completedMissions(state.missionIds ?? [], state.dayStats ?? freshDayStats());
  const earned = missionShards(done);
  state.missionShards = (state.missionShards ?? 0) + earned;
  state.dayStats = freshDayStats();
  return earned;
}

/**
 * Run end (win, lose, or surrender): score the day being played, including day 7 which has no dawn.
 * Decision: a missions the player completed before the run ended still pays.
 */
export function settleRunEnd(state: GameState): number {
  const base = state.dayStats ?? freshDayStats();
  state.dayStats = {
    ...base,
    kills: state.kills - (state.nightKillBase ?? 0), // day 1 has no night base yet
    coreLost: state.coreHp < (state.nightCoreStart ?? state.coreHp),
  };
  return settleDay(state);
}
