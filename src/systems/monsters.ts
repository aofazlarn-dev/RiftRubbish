/**
 * Monster spawning, steering and attacks (balance §3.3, §4, §5.1, §5.2). Pure, no Phaser.
 * Monsters are plain objects in GameState.monsters; the scene pools the sprites.
 * Steering is a straight line to the target (GDD §12) — no pathfinding in the slice.
 */

import type { EventBus } from '../core/events';
import type { RngStream } from '../core/rng';
import type { GameState, MonsterInstance, PendingBurst } from '../core/state';
import { clampToWorld, CORE_X, CORE_Y, dist, TILE } from '../core/world';
import {
  AFFIXES,
  BURST_CORE_DAMAGE,
  BURST_DELAY_SEC,
  BURST_PLAYER_DAMAGE,
  BURST_RADIUS_PX,
  dominantTag,
  inLeaderAura,
  JUNK_SHIELD_REGEN_AFTER_SEC,
  junkShieldHp,
  LEADER_AURA_DAMAGE_MULT,
  LEADER_AURA_SPEED_MULT,
  RUSH_SPEED_MULT,
  type AffixId,
} from './affix';
import { damageCore, damagePlayer, isPlayerDown } from './base';
import type { SkillDef } from './skills';
import type { DayPatrol, MonsterDef } from './waves';

export const AFFIX_XP_MULTIPLIER = 2;
const CONTACT_RANGE = 22;
const CORE_REACH = 44;
const SLOW_FACTOR = 0.7;
const NEAR_TILES = 8;
const GOBLIN_AGGRO_TILES = 2;
/** Patrols notice the player within 8 tiles (was 5: too few fights in daytime) and stop chasing 10 tiles from their home point. */
const PATROL_AGGRO_TILES = 8;
const PATROL_LEASH_TILES = 10;
const RANGED_KEEP_TILES = 6;
const RANGED_SHOOT_TILES = 7;
const RANGED_INTERVAL = 2;

export function findDef(defs: readonly MonsterDef[], id: string): MonsterDef {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown monster "${id}"`);
  return def;
}

export interface SpawnOptions {
  affixId?: AffixId;
  /** Resist-by-choice tag, decided when the monster spawns (balance §4). */
  resistTag?: string | null;
  patrol?: boolean;
}

export function spawnMonster(state: GameState, def: MonsterDef, x: number, y: number, opts: SpawnOptions = {}): MonsterInstance {
  const monster: MonsterInstance = {
    uid: state.nextUid++,
    defId: def.id,
    x: clampToWorld(x),
    y: clampToWorld(y),
    hp: def.hp,
    maxHp: def.hp,
    attackTimer: RANGED_INTERVAL,
    coreTimer: def.coreInterval,
    slowLeft: 0,
    affix: opts.affixId !== undefined,
    patrol: opts.patrol ?? false,
  };
  if (monster.patrol) {
    monster.homeX = monster.x;
    monster.homeY = monster.y;
    monster.aggro = false;
  }
  if (opts.affixId !== undefined) {
    monster.affixId = opts.affixId;
    monster.resistTag = opts.resistTag ?? null;
    if (opts.affixId === 'junk_shield') {
      // The junk shield is the +50% effective HP that balance §4 assumes (not a raw HP bonus).
      const shield = junkShieldHp(def.hp);
      monster.shield = shield;
      monster.shieldMax = shield;
      monster.shieldIdle = 0;
    }
  }
  state.monsters.push(monster);
  return monster;
}

/** Point on a ring around the core, `minTiles`–`maxTiles` away, at a random angle. */
export function ringPoint(rng: RngStream, minTiles: number, maxTiles: number, cx = CORE_X, cy = CORE_Y) {
  const angle = rng.next() * Math.PI * 2;
  const radius = (minTiles + rng.next() * (maxTiles - minTiles)) * TILE;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/** Owned skills' tags, counted once per skill (balance §4: "the tag the player has the most of"). */
function ownedTagCounts(state: GameState, skillDefs: readonly SkillDef[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const owned of state.skills) {
    const def = skillDefs.find((d) => d.id === owned.id);
    if (!def) continue;
    for (const tag of def.tags) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

/**
 * Spawns tonight's queued monsters whose time has come, 14–18 tiles from the core.
 * Stops at `maxOnScreen`; the rest wait in the queue (balance §5.1).
 * Affixed monsters get a random affix from the five (balance §4).
 */
export function tickSpawns(
  state: GameState,
  rng: RngStream,
  defs: readonly MonsterDef[],
  maxOnScreen: number,
  skillDefs: readonly SkillDef[] = [],
): void {
  while (
    state.spawnQueue.length > 0 &&
    state.spawnQueue[0].t <= state.phaseElapsed &&
    state.monsters.length < maxOnScreen
  ) {
    const event = state.spawnQueue.shift()!;
    const p = ringPoint(rng, 14, 18);
    const affixId = event.affix ? rng.pick(AFFIXES).id : undefined;
    const resistTag =
      affixId === 'resist_choice' ? dominantTag(ownedTagCounts(state, skillDefs), (tags) => rng.pick(tags)) : null;
    spawnMonster(state, findDef(defs, event.monsterId), p.x, p.y, { affixId, resistTag });
  }
}

/** Daytime patrol groups, at least 12 tiles from the base (balance §5.2). */
export function spawnDayPatrols(
  state: GameState,
  patrol: DayPatrol,
  rng: RngStream,
  defs: readonly MonsterDef[],
): void {
  const ids: string[] = [];
  for (const [id, count] of Object.entries(patrol.spawns)) for (let i = 0; i < count; i++) ids.push(id);

  // Day 1: a guaranteed group walks straight at the player (first level-up within ~30 s).
  const near = Math.min(patrol.guaranteedNearPlayer ?? 0, ids.length);
  for (let i = 0; i < near; i++) {
    const p = ringPoint(rng, 4, 6, state.player.x, state.player.y);
    spawnMonster(state, findDef(defs, ids[i]), p.x, p.y);
  }

  const rest = ids.slice(near);
  const centres = Array.from({ length: Math.max(1, patrol.groups) }, () => ringPoint(rng, 12, 20));
  rest.forEach((id, i) => {
    const c = centres[i % centres.length];
    const p = ringPoint(rng, 0, 1.5, c.x, c.y);
    spawnMonster(state, findDef(defs, id), p.x, p.y, { patrol: true });
  });
}

/** Dawn: the fog takes every monster that is left and tonight's unspawned queue (GDD §4). */
export function clearMonstersAtDawn(state: GameState): void {
  state.monsters = [];
  state.spawnQueue = [];
  state.bursts = [];
}

/**
 * Queues a burst for every dead monster with the burst affix. Call this before the dead
 * monsters are removed from state.monsters (balance §4: the burst goes off 1.0 s later).
 */
export function queueDeathEffects(state: GameState): void {
  for (const m of state.monsters) {
    if (m.hp > 0 || m.affixId !== 'burst') continue;
    const list: PendingBurst[] = state.bursts ?? [];
    list.push({ x: m.x, y: m.y, timer: BURST_DELAY_SEC });
    state.bursts = list;
  }
}

type Target = 'player' | 'core' | 'none';

/**
 * Patrols start a chase when the player is within PATROL_AGGRO_TILES, and keep chasing while the
 * player stays within PATROL_LEASH_TILES of their home point. Past the leash they give up.
 */
function patrolTarget(state: GameState, m: MonsterInstance, toPlayer: number): Target {
  if (isPlayerDown(state)) {
    m.aggro = false;
    return 'none';
  }
  const home = dist(m.homeX ?? m.x, m.homeY ?? m.y, state.player.x, state.player.y);
  if (m.aggro) {
    if (home <= PATROL_LEASH_TILES * TILE) return 'player';
    m.aggro = false;
    return 'none';
  }
  if (toPlayer <= PATROL_AGGRO_TILES * TILE) {
    m.aggro = true;
    return 'player';
  }
  return 'none';
}

function chooseTarget(state: GameState, m: MonsterInstance, def: MonsterDef): Target {
  const toPlayer = dist(m.x, m.y, state.player.x, state.player.y);
  if (m.patrol) return patrolTarget(state, m, toPlayer);
  if (isPlayerDown(state)) return 'core';
  switch (def.ai) {
    case 'player':
    case 'ranged':
      return 'player';
    case 'near':
      return toPlayer <= NEAR_TILES * TILE ? 'player' : 'core';
    case 'core':
      return toPlayer <= GOBLIN_AGGRO_TILES * TILE ? 'player' : 'core';
  }
}

function moveToward(m: MonsterInstance, tx: number, ty: number, speed: number, dt: number, stopAt: number): void {
  const d = dist(m.x, m.y, tx, ty);
  if (d <= stopAt) return;
  const step = Math.min(speed * dt, d - stopAt);
  m.x += ((tx - m.x) / d) * step;
  m.y += ((ty - m.y) / d) * step;
}

/** Junk shield: refills after JUNK_SHIELD_REGEN_AFTER_SEC without a hit (balance §4). */
function tickShield(m: MonsterInstance, dt: number): void {
  if (m.shieldMax === undefined) return;
  m.shieldIdle = (m.shieldIdle ?? 0) + dt;
  if (m.shieldIdle >= JUNK_SHIELD_REGEN_AFTER_SEC) m.shield = m.shieldMax;
}

/** Pack leader aura: any other live leader within range gives the bonus (no stacking). */
function inAura(state: GameState, m: MonsterInstance): boolean {
  return state.monsters.some(
    (leader) => leader !== m && leader.affixId === 'pack_leader' && inLeaderAura(dist(m.x, m.y, leader.x, leader.y), 1),
  );
}

/** Explosions from dead burst monsters: hit the player and the core if inside the radius. */
function tickBursts(state: GameState, dt: number, bus?: EventBus): void {
  const list = state.bursts ?? [];
  if (list.length === 0) return;
  const ready: PendingBurst[] = [];
  const rest: PendingBurst[] = [];
  for (const b of list) {
    b.timer -= dt;
    (b.timer <= 0 ? ready : rest).push(b);
  }
  state.bursts = rest;
  for (const b of ready) {
    if (dist(b.x, b.y, state.player.x, state.player.y) <= BURST_RADIUS_PX) {
      damagePlayer(state, BURST_PLAYER_DAMAGE, bus);
    }
    if (dist(b.x, b.y, CORE_X, CORE_Y) <= BURST_RADIUS_PX) damageCore(state, BURST_CORE_DAMAGE, bus);
  }
}

/** Moves every monster, resolves its attacks on the player and the core, then explosions. */
export function tickMonsters(state: GameState, dt: number, defs: readonly MonsterDef[], bus?: EventBus): void {
  for (const m of state.monsters) {
    if (state.status !== 'playing') break;
    const def = findDef(defs, m.defId);
    tickShield(m, dt);
    const aura = inAura(state, m);
    const speed =
      def.speed *
      (m.slowLeft > 0 ? SLOW_FACTOR : 1) *
      (m.affixId === 'rush' ? RUSH_SPEED_MULT : 1) *
      (aura ? LEADER_AURA_SPEED_MULT : 1);
    const dmgMult = aura ? LEADER_AURA_DAMAGE_MULT : 1;
    if (m.slowLeft > 0) m.slowLeft = Math.max(0, m.slowLeft - dt);

    const target = chooseTarget(state, m, def);
    if (target === 'none') continue;

    if (target === 'player') {
      const ranged = def.ai === 'ranged';
      moveToward(m, state.player.x, state.player.y, speed, dt, ranged ? RANGED_KEEP_TILES * TILE : CONTACT_RANGE * 0.5);
      const d = dist(m.x, m.y, state.player.x, state.player.y);
      if (ranged) {
        m.attackTimer -= dt;
        if (m.attackTimer <= 0 && d <= RANGED_SHOOT_TILES * TILE) {
          damagePlayer(state, def.damage * dmgMult, bus);
          m.attackTimer = RANGED_INTERVAL;
        }
      } else if (d <= CONTACT_RANGE) {
        damagePlayer(state, def.damage * dmgMult, bus);
      }
    } else {
      moveToward(m, CORE_X, CORE_Y, speed, dt, CORE_REACH * 0.8);
      if (def.coreDamage > 0 && dist(m.x, m.y, CORE_X, CORE_Y) <= CORE_REACH) {
        m.coreTimer -= dt;
        if (m.coreTimer <= 0) {
          damageCore(state, def.coreDamage * dmgMult, bus);
          m.coreTimer = def.coreInterval;
        }
      }
    }
  }
  tickBursts(state, dt, bus);
}
