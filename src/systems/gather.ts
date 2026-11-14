/**
 * Daytime gathering (Gap round 2 R2; GDD §4, balance §1.1 and §6.2). Pure, no Phaser.
 *
 * - Grain and mushrooms grow on the map: 6 nodes each dawn, 5–16 tiles from the core.
 *   Nodes left at dusk wither (like chests). Walking within 64 px picks one up (auto-pickup).
 * - The well sits near the spawn point for the whole run (GDD §4: "seed must have a well near
 *   the spawn"). It refills each dawn with 2 water and 1 fish; standing next to it takes them.
 * - Fresh meat drops from kills (3%, balance §6.2); see combat.ts.
 * Nothing is given for free any more: a player who never leaves the base eats from the well only.
 * Target (balance §6.2): ~5–7 items a day for ~20 s of gathering.
 */

import type { EventBus } from '../core/events';
import type { RngStream } from '../core/rng';
import type { GameState } from '../core/state';
import { CORE_X, CORE_Y, dist } from '../core/world';
import type { Ingredient, Inventory } from './evening';
import { ringPoint } from './monsters';

export type NodeKind = 'grain' | 'mushroom';

export interface ResourceNode {
  x: number;
  y: number;
  kind: NodeKind;
  taken: boolean;
}

export interface WellState {
  x: number;
  y: number;
  water: number;
  fish: number;
}

export const NODES_PER_DAY: Readonly<Record<NodeKind, number>> = { grain: 3, mushroom: 3 };
export const NODE_MIN_TILES = 5;
export const NODE_MAX_TILES = 16;
/** balance §1.1: ingredients are picked up at 64 px. */
export const INGREDIENT_PICKUP_PX = 64;
export const WELL_MIN_TILES = 3;
export const WELL_MAX_TILES = 4;
export const WELL_REFILL: Readonly<{ water: number; fish: number }> = { water: 2, fish: 1 };

/** Places the well once per run, near the spawn point (map stream, so the same seed = same well). */
export function placeWell(state: GameState, rng: RngStream): void {
  if (state.well) return;
  const p = ringPoint(rng, WELL_MIN_TILES, WELL_MAX_TILES, CORE_X, CORE_Y);
  state.well = { x: p.x, y: p.y, water: 0, fish: 0 };
}

/** Dawn: new grain/mushroom nodes and a refilled well. */
export function spawnGatherDay(state: GameState, rng: RngStream): void {
  const nodes: ResourceNode[] = [];
  for (const kind of Object.keys(NODES_PER_DAY) as NodeKind[]) {
    for (let i = 0; i < NODES_PER_DAY[kind]; i++) {
      const p = ringPoint(rng, NODE_MIN_TILES, NODE_MAX_TILES, CORE_X, CORE_Y);
      nodes.push({ x: p.x, y: p.y, kind, taken: false });
    }
  }
  state.resourceNodes = nodes;
  if (state.well) {
    state.well.water = WELL_REFILL.water;
    state.well.fish = WELL_REFILL.fish;
  }
}

/** Dusk: what was not picked up withers. The well keeps what is left until it refills. */
export function clearGatherDay(state: GameState): void {
  state.resourceNodes = [];
}

function add(inv: Inventory, kind: Ingredient, n: number): Inventory {
  return { ...inv, [kind]: (inv[kind] ?? 0) + n };
}

/** Auto-pickup during the day. Emits `item:pickup` for each item so the scene can show it. */
export function tickGather(state: GameState, bus?: EventBus): void {
  if (state.phase !== 'day') return;
  const px = state.player.x;
  const py = state.player.y;
  for (const node of state.resourceNodes ?? []) {
    if (node.taken || dist(node.x, node.y, px, py) > INGREDIENT_PICKUP_PX) continue;
    node.taken = true;
    state.inventory = add(state.inventory ?? {}, node.kind, 1);
    bus?.emit('item:pickup', { kind: node.kind, count: 1, x: node.x, y: node.y });
  }
  const well = state.well;
  if (well && (well.water > 0 || well.fish > 0) && dist(well.x, well.y, px, py) <= INGREDIENT_PICKUP_PX) {
    if (well.water > 0) {
      state.inventory = add(state.inventory ?? {}, 'water', well.water);
      bus?.emit('item:pickup', { kind: 'water', count: well.water, x: well.x, y: well.y });
    }
    if (well.fish > 0) {
      state.inventory = add(state.inventory ?? {}, 'fish', well.fish);
      bus?.emit('item:pickup', { kind: 'fish', count: well.fish, x: well.x, y: well.y });
    }
    well.water = 0;
    well.fish = 0;
  }
}
