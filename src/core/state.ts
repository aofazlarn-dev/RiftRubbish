/**
 * Game state as plain data, kept separate from Phaser sprites (GDD §10, §12; D19).
 * Scenes read this state and draw it; systems update it. Only this object is saved.
 */

import type { Phase } from './events';
import { RunRng, type RngState } from './rng';

export const SAVE_VERSION = 1;

export type Mode = 'casual' | 'daily';

/** Phase lengths in game seconds (GDD §4). Night 7 has no timer: it ends on boss kill or core loss. */
export const PHASE_SECONDS: Record<Phase, number> = { day: 70, evening: 20, night: 40 };
export const FINAL_NIGHT = 7;

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number; // px per second (balance.md: 140)
  level: number;
  xp: number;
}

export interface GameState {
  version: number;
  seed: string;
  mode: Mode;
  /** Shards from a run opened via a ?seed= link are not awarded (D19). */
  fromSeedLink: boolean;
  day: number; // 1..7
  phase: Phase;
  phaseElapsed: number; // seconds into the current phase
  player: PlayerState;
  coreHp: number;
  coreMaxHp: number;
  rng: RngState;
}

export interface NewRunOptions {
  seed: string;
  mode?: Mode;
  fromSeedLink?: boolean;
}

export function createRun({ seed, mode = 'casual', fromSeedLink = false }: NewRunOptions): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    mode,
    fromSeedLink,
    day: 1,
    phase: 'day',
    phaseElapsed: 0,
    player: { x: 0, y: 0, hp: 100, maxHp: 100, speed: 140, level: 1, xp: 0 },
    coreHp: 1000,
    coreMaxHp: 1000,
    rng: RunRng.fromSeed(seed).snapshot(),
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses a save and migrates older versions. Throws on unreadable or future saves. */
export function deserialize(json: string): GameState {
  const data = JSON.parse(json) as Partial<GameState>;
  if (typeof data.version !== 'number') throw new Error('Save has no version');
  if (data.version > SAVE_VERSION) throw new Error(`Save version ${data.version} is newer than this game`);
  // Future migrations go here: if (data.version === 1) { ...; data.version = 2; }
  return data as GameState;
}
