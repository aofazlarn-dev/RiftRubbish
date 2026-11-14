/**
 * Game state as plain data, kept separate from Phaser sprites (GDD §10, §12; D19).
 * Scenes read this state and draw it; systems update it. Only this object is saved.
 */

import type { Phase } from './events';
import { RunRng, type RngState } from './rng';
import type { AffixId } from '../systems/affix';
import type { BossState } from '../systems/boss';
import type { Inventory, MealBuff } from '../systems/evening';
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
  /** Share of incoming damage removed by passives (0–1), recomputed by applyPassives. */
  damageReduction?: number;
  /** Seconds left of a trap stun (1.5 s, balance §6.3). Movement is blocked while > 0. */
  stunLeft?: number;
}

export interface OwnedSkill {
  id: string;
  /** Skill XP; the level is derived with levelForXp(). */
  xp: number;
  /** Seconds until an Active can cast again. Unused for Passives. */
  cooldownLeft: number;
  /** Rarity steps added by a Fusion Core when this skill was fused (R3, D17). */
  rarityBoost?: number;
  /** Welcome gift (tutorial): outside the slots, never levels up, leaves at dawn of day 2. */
  gift?: boolean;
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
  /** Seconds left of a trap stun (2 s, balance §6.3). Does not move or attack while > 0. */
  stunLeft?: number;
  affix: boolean;
  /** Which affix (balance §4), if any. `affix` is true for every affixed monster. */
  affixId?: AffixId;
  /** Junk Shield pool, hit before HP. Only set for the junk_shield affix. */
  shield?: number;
  shieldMax?: number;
  /** Seconds since the monster was last hit, for the shield regen (5 s, balance §4). */
  shieldIdle?: number;
  /** Resist-by-choice: the tag the player had most of when this monster spawned. */
  resistTag?: string | null;
  /** Daytime patrol: idles until the player comes close, never attacks the core. */
  patrol: boolean;
  /** Patrol home point (where it spawned) and whether it is currently chasing the player. */
  homeX?: number;
  homeY?: number;
  aggro?: boolean;
}

/** A burst from a dead "exploding" affix monster, resolved when its timer runs out. */
export interface PendingBurst {
  x: number;
  y: number;
  timer: number;
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
  /** Welcome gift state (Casual only): 'gift' → 'fused' → 'done'. Undefined = no gift. */
  tutorial?: 'gift' | 'fused' | 'done';
  /** Fusion Cores held (D14, D17). Used by the fusion UI later. */
  cores?: number;
  /** Today's daytime chests (2 per day, D17). Cleared at dusk. */
  chests?: { x: number; y: number; opened: boolean }[];
  /** The one chest Core per run has been rolled (D17). */
  chestCoreGiven?: boolean;
  /** Damage multiplier from owned meta items (Casual only; 1 when none). */
  metaDamage?: number;
  /** Seconds since the run started (for line cooldowns). */
  runTime?: number;
  /** Soul Shard earned by this run, set when the run ends (balance §7). Undefined until then. */
  shardsEarned?: number;
  /** Today's missions (Casual only) and their running stats; Shards from completed missions (approved draft). */
  missionIds?: string[];
  dayStats?: import('../systems/missions').DayStats;
  missionShards?: number;
  /** Core HP and kill count at the start of tonight, read at dawn. */
  nightCoreStart?: number;
  nightKillBase?: number;
  /** Last time each limited System line was said (run seconds). */
  lineLastAt?: Record<string, number>;
  monsters: MonsterInstance[];
  /** Optional so saves made before affixes existed still load. Use `?? []`. */
  bursts?: PendingBurst[];
  /** Today's grain/mushroom nodes (R2). Cleared at dusk. Optional for older saves. */
  resourceNodes?: import('../systems/gather').ResourceNode[];
  /** The well near the spawn: refills at dawn with water and fish (R2). */
  well?: import('../systems/gather').WellState;
  /** Gathered ingredients (balance §6.2). Optional so older saves still load. Use `?? {}`. */
  inventory?: Inventory;
  /** Evening choice (balance §6.3). `requestedChoice` is set by the UI; the game falls back to trap. */
  requestedChoice?: 'fence' | 'trap' | 'overtime';
  /** Meal the player picked this evening (null = skip). Undefined = not picked, the game picks. */
  requestedMeal?: string | null;
  /** False from the start of an evening until it is resolved (player confirms, or night starts). */
  eveningResolved?: boolean;
  /** Core shield left from the fence choice; lasts until dawn. */
  coreShield?: number;
  /** Traps around the base (6 at 4 tiles, 3 uses each). Cleared at dawn. */
  traps?: { x: number; y: number; uses: number }[];
  /** Overtime: once per run, from day 4. `overtimeChosen` is for the run-end Soul Shard bonus (not built yet). */
  overtimeUsed?: boolean;
  overtimeChosen?: boolean;
  /** Synergy tiers from owned skills, refreshed by applyPassives (R4). Undefined = none yet. */
  synergy?: import('../systems/synergy').SynergyTiersMap;
  /** Shadow tier 6 already saved the player tonight (R4). Reset at night start. */
  shadowSaved?: boolean;
  /** Seconds until the next lightning-6 strike and earth-6 quake (R4). */
  synergyTimers?: { bolt: number; quake: number };
  /** Buff from tonight's evening meal, or the hungry debuff. Cleared at dawn. Undefined = no effect. */
  nightBuff?: MealBuff;
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
