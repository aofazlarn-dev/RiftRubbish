/**
 * Daytime risk chests and Fusion Core sources (Gap vs Spec G4; balance §5.2, §3.4, D6, D14, D17).
 * Pure, no Phaser.
 *
 * - Two chests each day, 10–16 tiles from the core. Walking within 1 tile opens one (no timer yet).
 * - An opened chest gives 1–2 gatherable ingredients.
 * - Days 5–7: 5% chance of a Fusion Core, at most 1 per run (D17).
 * - Elite (rift wolf) always drops 1 Fusion Core when it dies (D6, balance §3.4).
 *
 * Not built yet: the guard group (×1.5) and the chest-open timer. The chest visuals are Gemini's.
 */

import type { RngStream } from '../core/rng';
import type { GameState } from '../core/state';
import { CORE_X, CORE_Y, dist, TILE } from '../core/world';
import { GATHER_KINDS, type Ingredient } from './evening';
import { ringPoint } from './monsters';

export const CHESTS_PER_DAY = 2;
export const CHEST_MIN_TILES = 10;
export const CHEST_MAX_TILES = 16;
export const CHEST_OPEN_PX = TILE;
export const CHEST_CORE_CHANCE = 0.05;
export const CHEST_CORE_DAYS: readonly number[] = [5, 6, 7];
export const ELITE_ID = 'rift_wolf';

/** Places the day's two chests at dawn. */
export function spawnChests(state: GameState, rng: RngStream): void {
  state.chests = Array.from({ length: CHESTS_PER_DAY }, () => {
    const p = ringPoint(rng, CHEST_MIN_TILES, CHEST_MAX_TILES, CORE_X, CORE_Y);
    return { x: p.x, y: p.y, opened: false };
  });
}

/** Opens every chest the player is standing next to. Core roll happens at most once per run. */
export function tickChests(state: GameState, rng: RngStream): void {
  for (const chest of state.chests ?? []) {
    if (chest.opened || dist(chest.x, chest.y, state.player.x, state.player.y) > CHEST_OPEN_PX) continue;
    chest.opened = true;
    const inv = { ...(state.inventory ?? {}) };
    const count = 1 + Math.floor(rng.next() * 2);
    for (let i = 0; i < count; i++) {
      const kind: Ingredient = rng.pick(GATHER_KINDS);
      inv[kind] = (inv[kind] ?? 0) + 1;
    }
    state.inventory = inv;
    if (CHEST_CORE_DAYS.includes(state.day) && !state.chestCoreGiven && rng.next() < CHEST_CORE_CHANCE) {
      state.cores = (state.cores ?? 0) + 1;
      state.chestCoreGiven = true;
    }
  }
}

/** Clears chests when the day ends (they are daytime-only). */
export function clearChests(state: GameState): void {
  state.chests = [];
}

/** Elite death: always one Fusion Core (D6). */
export function eliteCoreOnDeath(state: GameState, defId: string): void {
  if (defId === ELITE_ID) state.cores = (state.cores ?? 0) + 1;
}
