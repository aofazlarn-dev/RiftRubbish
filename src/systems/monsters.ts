/**
 * Monster spawning, steering and attacks (balance §3.3, §5.1, §5.2). Pure, no Phaser.
 * Monsters are plain objects in GameState.monsters; the scene pools the sprites.
 * Steering is a straight line to the target (GDD §12) — no pathfinding in the slice.
 */

import type { EventBus } from '../core/events';
import type { RngStream } from '../core/rng';
import type { GameState, MonsterInstance } from '../core/state';
import { clampToWorld, CORE_X, CORE_Y, dist, TILE } from '../core/world';
import { damageCore, damagePlayer, isPlayerDown } from './base';
import type { DayPatrol, MonsterDef } from './waves';

/** Affix monsters are tougher; the slice folds all affixes into +50% HP (balance §4 estimate). */
export const AFFIX_HP_MULTIPLIER = 1.5;
export const AFFIX_XP_MULTIPLIER = 2;
const CONTACT_RANGE = 22;
const CORE_REACH = 44;
const SLOW_FACTOR = 0.7;
const NEAR_TILES = 8;
const GOBLIN_AGGRO_TILES = 2;
const PATROL_AGGRO_TILES = 5;
const RANGED_KEEP_TILES = 6;
const RANGED_SHOOT_TILES = 7;
const RANGED_INTERVAL = 2;

export function findDef(defs: readonly MonsterDef[], id: string): MonsterDef {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown monster "${id}"`);
  return def;
}

export function spawnMonster(
  state: GameState,
  def: MonsterDef,
  x: number,
  y: number,
  opts: { affix?: boolean; patrol?: boolean } = {},
): MonsterInstance {
  const hp = def.hp * (opts.affix ? AFFIX_HP_MULTIPLIER : 1);
  const monster: MonsterInstance = {
    uid: state.nextUid++,
    defId: def.id,
    x: clampToWorld(x),
    y: clampToWorld(y),
    hp,
    maxHp: hp,
    attackTimer: RANGED_INTERVAL,
    coreTimer: def.coreInterval,
    slowLeft: 0,
    affix: opts.affix ?? false,
    patrol: opts.patrol ?? false,
  };
  state.monsters.push(monster);
  return monster;
}

/** Point on a ring around the core, `minTiles`–`maxTiles` away, at a random angle. */
export function ringPoint(rng: RngStream, minTiles: number, maxTiles: number, cx = CORE_X, cy = CORE_Y) {
  const angle = rng.next() * Math.PI * 2;
  const radius = (minTiles + rng.next() * (maxTiles - minTiles)) * TILE;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/**
 * Spawns tonight's queued monsters whose time has come, 14–18 tiles from the core.
 * Stops at `maxOnScreen`; the rest wait in the queue (balance §5.1).
 */
export function tickSpawns(state: GameState, rng: RngStream, defs: readonly MonsterDef[], maxOnScreen: number): void {
  while (
    state.spawnQueue.length > 0 &&
    state.spawnQueue[0].t <= state.phaseElapsed &&
    state.monsters.length < maxOnScreen
  ) {
    const event = state.spawnQueue.shift()!;
    const p = ringPoint(rng, 14, 18);
    spawnMonster(state, findDef(defs, event.monsterId), p.x, p.y, { affix: event.affix });
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
}

type Target = 'player' | 'core' | 'none';

function chooseTarget(state: GameState, m: MonsterInstance, def: MonsterDef): Target {
  const toPlayer = dist(m.x, m.y, state.player.x, state.player.y);
  if (m.patrol) return !isPlayerDown(state) && toPlayer <= PATROL_AGGRO_TILES * TILE ? 'player' : 'none';
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

/** Moves every monster and resolves its attacks on the player and the core. */
export function tickMonsters(state: GameState, dt: number, defs: readonly MonsterDef[], bus?: EventBus): void {
  for (const m of state.monsters) {
    if (state.status !== 'playing') return;
    const def = findDef(defs, m.defId);
    const speed = def.speed * (m.slowLeft > 0 ? SLOW_FACTOR : 1);
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
          damagePlayer(state, def.damage, bus);
          m.attackTimer = RANGED_INTERVAL;
        }
      } else if (d <= CONTACT_RANGE) {
        damagePlayer(state, def.damage, bus);
      }
    } else {
      moveToward(m, CORE_X, CORE_Y, speed, dt, CORE_REACH * 0.8);
      if (def.coreDamage > 0 && dist(m.x, m.y, CORE_X, CORE_Y) <= CORE_REACH) {
        m.coreTimer -= dt;
        if (m.coreTimer <= 0) {
          damageCore(state, def.coreDamage, bus);
          m.coreTimer = def.coreInterval;
        }
      }
    }
  }
}
