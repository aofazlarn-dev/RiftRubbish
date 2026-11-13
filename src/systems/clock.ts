/**
 * Day / evening / night cycle (GDD §4). Pure function over GameState so it can run in
 * the headless sim and in tests. Emits phase changes through the event bus.
 */

import type { EventBus, Phase } from '../core/events';
import { FINAL_NIGHT, PHASE_SECONDS, type GameState } from '../core/state';

const NEXT: Record<Phase, Phase> = { day: 'evening', evening: 'night', night: 'day' };

/** True on the final night, which has no timer (ends on boss kill or core loss). */
export function isUntimed(state: GameState): boolean {
  return state.phase === 'night' && state.day === FINAL_NIGHT;
}

export function advanceClock(state: GameState, dt: number, bus?: EventBus): void {
  if (isUntimed(state)) {
    state.phaseElapsed += dt;
    return;
  }
  state.phaseElapsed += dt;
  while (!isUntimed(state) && state.phaseElapsed >= PHASE_SECONDS[state.phase]) {
    state.phaseElapsed -= PHASE_SECONDS[state.phase];
    goToPhase(state, NEXT[state.phase], bus);
  }
}

/** "เรียกคืนเร็ว" (D22): skip the rest of the day straight to evening. No bonus, no cost. */
export function recallEarly(state: GameState, bus?: EventBus): boolean {
  if (state.phase !== 'day') return false;
  state.phaseElapsed = 0;
  goToPhase(state, 'evening', bus);
  return true;
}

function goToPhase(state: GameState, phase: Phase, bus?: EventBus): void {
  if (phase === 'day') state.day += 1;
  state.phase = phase;
  bus?.emit('phase:change', { day: state.day, phase });
}

/** Seconds left in the current phase, or Infinity on the untimed final night. */
export function phaseRemaining(state: GameState): number {
  return isUntimed(state) ? Infinity : PHASE_SECONDS[state.phase] - state.phaseElapsed;
}
