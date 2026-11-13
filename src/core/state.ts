/**
 * Game state as plain data, kept separate from Phaser sprites (GDD §10, §12; D19).
 * Scenes read this state and draw it; systems update it. Only this object is saved.
 */

import type { Phase } from './events';
import { RunRng, type RngState } from './rng';
import type { BossState } from '../systems/boss';
import type { SpawnEvent } from '../systems/waves';

export const SAVE_VERSION = 2;

export type Mode = 'casual' | 'daily';
export type RunStatus = 'playing' | 'won' | 'lost';

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

export interface OwnedSkill {
  id: string;
  /** Skill XP; the level is derived with levelForXp(). */
  xp: number;
  /** Seconds until an Active can cast again. Unused for Passives. */
  cooldownLeft: number;
}

export interface MonsterInstance {
  uid: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Seconds until the next ranged shot (skeleton). */
  attackTimer: number;
  /** Seconds until the next hit on the base core. */
  coreTimer: number;
  /** Seconds of slow remaining. */
  slowLeft: number;
  affix: boolean;
  /** Daytime patrol: idles until the player comes close, never attacks the core. */
  patrol: boolean;
}

export interface BossInstance {
  x: number;
  y: number;
  slamTimer: number;
  coreTimer: number;
  rules: BossState;
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
  status: RunStatus;
  skills: OwnedSkill[];
  monsters: MonsterInstance[];
  nextUid: number;
  /** Tonight's remaining spawns, ordered by time. */
  spawnQueue: SpawnEvent[];
  boss: BossInstance | null;
  /** Cards on offer; the game is paused while this is set. "skill:<id>" or "up:<id>". */
  pendingDraft: string[] | null;
  /** Level-ups that have not shown their Draft yet. */
  draftsOwed: number;
  /** >0 while the player is down and waiting to respawn at the base. */
  respawnIn: number;
  /** i-frames after a hit (balance §1.1: 0.5 s). */
  invulnLeft: number;
  kills: number;
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
    ...runDefaults(),
  };
}

/** Fields added in save version 2. Also used to migrate version 1 saves. */
function runDefaults() {
  return {
    status: 'playing' as RunStatus,
    skills: [] as OwnedSkill[],
    monsters: [] as MonsterInstance[],
    nextUid: 1,
    spawnQueue: [] as SpawnEvent[],
    boss: null as BossInstance | null,
    pendingDraft: null as string[] | null,
    draftsOwed: 0,
    respawnIn: 0,
    invulnLeft: 0,
    kills: 0,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses a save and migrates older versions. Throws on unreadable or future saves. */
export function deserialize(json: string): GameState {
  let data = JSON.parse(json) as Partial<GameState>;
  if (typeof data.version !== 'number') throw new Error('Save has no version');
  if (data.version > SAVE_VERSION) throw new Error(`Save version ${data.version} is newer than this game`);
  if (data.version === 1) {
    // v1 had only clock + player + core. Add the combat/draft fields with fresh defaults.
    data = { ...runDefaults(), ...data, version: 2 };
  }
  return data as GameState;
}
