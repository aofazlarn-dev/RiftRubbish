/**
 * Auto-cast skills against monsters and the boss (GDD §6, §11; balance §2.2, §3.1). Pure, no Phaser.
 * Hits resolve instantly; the returned CombatFx list tells the scene what to draw.
 *
 * Slice simplifications (recorded in HANDOFF): no travelling projectiles, no damage-over-time,
 * no crits, and per-level extras from skills_fusion.md are not applied — only the damage multiplier.
 */

import type { EventBus } from '../core/events';
import type { RngStream } from '../core/rng';
import type { GameState } from '../core/state';
import { dist, TILE } from '../core/world';
import { applyPassives, isPlayerDown } from './base';
import { damageBoss } from './boss';
import { applyDamageWithShield, combinedResist, resistChoiceFor, RESIST_CHOICE_RATIO } from './affix';
import { eliteCoreOnDeath } from './chests';
import { AFFIX_XP_MULTIPLIER, findDef, queueDeathEffects } from './monsters';
import { coreBoostMult, damageAtLevel, levelForXp, type SkillDef } from './skills';
import type { MonsterDef } from './waves';
import {
  EARTH_T4_RADIUS_MULT,
  EARTH_T6_QUAKE,
  FIRE_T4_BURST,
  ICE_T2_SLOW_MULT,
  LIGHTNING_T2_EXTRA_JUMPS,
  LIGHTNING_T4,
  LIGHTNING_T6,
  SHADOW_T2,
  synergyDamageMult,
  synergyTiers,
  type SynergyTiersMap,
} from './synergy';

/** The skill as cast under synergy (R4): lightning 2 chain +1, ice 2 slow ×1.15, earth 4 splash ×1.15. */
function synergyShapedDef(def: SkillDef, tiers: SynergyTiersMap): SkillDef {
  const out: SkillDef = { ...def };
  if (tiers.lightning >= 2 && def.jumps !== undefined) out.jumps = def.jumps + LIGHTNING_T2_EXTRA_JUMPS;
  if (tiers.ice >= 2 && def.slowSeconds) out.slowSeconds = def.slowSeconds * ICE_T2_SLOW_MULT;
  if (tiers.earth >= 4 && def.splash) out.splash = def.splash * EARTH_T4_RADIUS_MULT;
  return out;
}

/** Lightning 6 (every 8 s, 5 random targets take 40) and earth 6 (every 10 s, stun within 4 tiles). */
function tickSynergyTimers(
  state: GameState,
  dt: number,
  tiers: SynergyTiersMap,
  targets: readonly Target[],
  rng: RngStream,
  fx: CombatFx[],
): void {
  if (tiers.lightning < 6 && tiers.earth < 6) return;
  const timers = (state.synergyTimers ??= { bolt: LIGHTNING_T6.every, quake: EARTH_T6_QUAKE.every });
  if (tiers.lightning >= 6) {
    timers.bolt -= dt;
    if (timers.bolt <= 0) {
      timers.bolt += LIGHTNING_T6.every;
      const alive = targets.filter((t) => !t.dead);
      for (let i = 0; i < LIGHTNING_T6.targets && alive.length > 0; i++) {
        const t = alive.splice(Math.floor(rng.next() * alive.length), 1)[0];
        t.hit(LIGHTNING_T6.damage, ['lightning']);
        fx.push({ skillId: 'syn_lightning', shape: 'chain', x1: t.x, y1: t.y - 90, x2: t.x, y2: t.y });
      }
    }
  }
  if (tiers.earth >= 6) {
    timers.quake -= dt;
    if (timers.quake <= 0) {
      timers.quake += EARTH_T6_QUAKE.every;
      const r = EARTH_T6_QUAKE.radiusTiles * TILE;
      const { x, y } = state.player;
      for (const m of state.monsters) {
        if (m.hp > 0 && dist(x, y, m.x, m.y) <= r) m.stunLeft = Math.max(m.stunLeft ?? 0, EARTH_T6_QUAKE.stunSeconds);
      }
      fx.push({ skillId: 'syn_earth', shape: 'ring', x1: x, y1: y, x2: x, y2: y, radius: r });
    }
  }
}

export const PASSIVE_SXP_PER_SECOND = 0.6;
const LINE_HALF_WIDTH = 20;
const WEAK_MULTIPLIER = 1.5;
export const MEAT_DROP_CHANCE = 0.03;
export const MEAT_HEAL = 20;

export interface CombatFx {
  skillId: string;
  shape: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Explosion or cone radius in px, when the shape has one. */
  radius?: number;
  missed?: boolean;
}

export interface CombatResult {
  fx: CombatFx[];
  /** Player XP earned from kills this tick. */
  xpGained: number;
}

interface Target {
  x: number;
  y: number;
  dead: boolean;
  hit(damage: number, tags: readonly string[]): void;
  slow(seconds: number): void;
}

/** Damage multiplier of a monster against a skill's tags; the best tag for the attacker wins. */
export function elementMultiplier(def: Pick<MonsterDef, 'weak' | 'resist'>, tags: readonly string[]): number {
  if (tags.length === 0) return 1;
  let best = 0;
  for (const tag of tags) {
    let mult = 1;
    if (def.weak.includes(tag)) mult = WEAK_MULTIPLIER;
    else if (def.resist[tag] !== undefined) mult = 1 - def.resist[tag];
    best = Math.max(best, mult);
  }
  return best;
}

/**
 * Element multiplier plus the resist-by-choice affix (balance §4). The affix resist (50%)
 * applies when the hit carries the monster's chosen tag. Total reduction is capped at 75%
 * (combinedResist). A weakness (mult > 1) is kept and only reduced by the affix.
 */
export function affixedMultiplier(m: { resistTag?: string | null }, def: Pick<MonsterDef, 'weak' | 'resist'>, tags: readonly string[]): number {
  const base = elementMultiplier(def, tags);
  const affixRes = tags.some((t) => resistChoiceFor(t, m.resistTag ?? null) > 0) ? RESIST_CHOICE_RATIO : 0;
  if (affixRes === 0) return base;
  if (base > 1) return base * (1 - affixRes);
  return 1 - combinedResist(1 - base, affixRes);
}

function buildTargets(
  state: GameState,
  monsterDefs: readonly MonsterDef[],
  onKillXp: (xp: number) => void,
  bus?: EventBus,
  onKill?: (x: number, y: number, tags: readonly string[]) => void,
): Target[] {
  const targets: Target[] = state.monsters.map((m) => {
    const def = findDef(monsterDefs, m.defId);
    const target: Target = {
      x: m.x,
      y: m.y,
      dead: m.hp <= 0,
      hit(damage, tags) {
        if (target.dead) return;
        const hit = damage * affixedMultiplier(m, def, tags);
        if (m.shieldMax !== undefined) m.shieldIdle = 0; // any hit resets the junk-shield regen timer
        const after = applyDamageWithShield(m.shield ?? 0, m.hp, hit);
        m.shield = after.shield;
        m.hp = after.hp;
        if (m.hp <= 0) {
          target.dead = true;
          state.kills += 1;
          onKillXp(def.xp * (m.affix ? AFFIX_XP_MULTIPLIER : 1));
          onKill?.(m.x, m.y, tags);
        }
      },
      slow(seconds) {
        m.slowLeft = Math.max(m.slowLeft, seconds);
      },
    };
    return target;
  });

  const boss = state.boss;
  if (boss && boss.rules.hp > 0) {
    const target: Target = {
      x: boss.x,
      y: boss.y,
      dead: false,
      hit(damage) {
        if (target.dead) return;
        if (damageBoss(boss.rules, damage)) {
          target.dead = true;
          state.status = 'won';
          bus?.emit('run:end', { night: state.day, result: 'win' });
        }
      },
      slow() {
        // The boss ignores slow in the slice (balance §3.5: crowd control is cut to 25%).
      },
    };
    targets.push(target);
  }
  return targets;
}

function nearest(targets: readonly Target[], x: number, y: number, maxDist: number, skip?: Set<Target>): Target | null {
  let best: Target | null = null;
  let bestDist = maxDist;
  for (const t of targets) {
    if (t.dead || skip?.has(t)) continue;
    const d = dist(x, y, t.x, t.y);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** Casts one skill at `aim`. Returns how many targets were hit. */
function cast(
  def: SkillDef,
  damage: number,
  aim: Target,
  targets: readonly Target[],
  px: number,
  py: number,
  rng: RngStream,
  fx: CombatFx[],
): number {
  const range = def.range * TILE;
  const base = { skillId: def.id, shape: def.shape, x1: px, y1: py, x2: aim.x, y2: aim.y };
  let hits = 0;

  switch (def.shape) {
    case 'projectile': {
      if (def.accuracy !== undefined && !rng.chance(def.accuracy)) {
        fx.push({ ...base, missed: true });
        return 0;
      }
      const splash = (def.splash ?? 0) * TILE;
      const cx = aim.x;
      const cy = aim.y;
      aim.hit(damage, def.tags);
      hits = 1;
      if (splash > 0) {
        for (const t of targets) {
          if (t === aim || t.dead) continue;
          if (dist(cx, cy, t.x, t.y) <= splash) {
            t.hit(damage, def.tags);
            hits++;
          }
        }
      }
      fx.push({ ...base, radius: splash > 0 ? splash : undefined });
      return hits;
    }
    case 'cone': {
      const facing = Math.atan2(aim.y - py, aim.x - px);
      const half = (((def.arc ?? 100) / 2) * Math.PI) / 180;
      for (const t of targets) {
        if (t.dead || dist(px, py, t.x, t.y) > range) continue;
        let diff = Math.abs(Math.atan2(t.y - py, t.x - px) - facing);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= half) {
          t.hit(damage, def.tags);
          hits++;
        }
      }
      fx.push({ ...base, radius: range });
      return hits;
    }
    case 'line': {
      const d = dist(px, py, aim.x, aim.y) || 1;
      const ux = (aim.x - px) / d;
      const uy = (aim.y - py) / d;
      for (const t of targets) {
        if (t.dead) continue;
        const along = (t.x - px) * ux + (t.y - py) * uy;
        if (along < 0 || along > range) continue;
        const across = Math.abs((t.x - px) * uy - (t.y - py) * ux);
        if (across <= LINE_HALF_WIDTH) {
          t.hit(damage, def.tags);
          if (def.slowSeconds) t.slow(def.slowSeconds);
          hits++;
        }
      }
      fx.push({ ...base, x2: px + ux * range, y2: py + uy * range });
      return hits;
    }
    case 'chain': {
      const visited = new Set<Target>();
      let current = aim;
      let amount = damage;
      let fromX = px;
      let fromY = py;
      const jumps = def.jumps ?? 0;
      for (let i = 0; i <= jumps; i++) {
        const tx = current.x;
        const ty = current.y;
        current.hit(amount, def.tags);
        visited.add(current);
        hits++;
        fx.push({ ...base, x1: fromX, y1: fromY, x2: tx, y2: ty });
        const next = nearest(targets, tx, ty, (def.jumpRange ?? 0) * TILE, visited);
        if (!next) break;
        fromX = tx;
        fromY = ty;
        current = next;
        amount *= 1 - (def.falloff ?? 0);
      }
      return hits;
    }
    default:
      return 0;
  }
}

/**
 * Advances every owned skill: Passives earn Skill XP over time, Actives cast when off
 * cooldown with a target in range and earn Skill XP equal to their cooldown per hitting cast.
 */
export function tickSkills(
  state: GameState,
  dt: number,
  skillDefs: readonly SkillDef[],
  monsterDefs: readonly MonsterDef[],
  rng: RngStream,
  bus?: EventBus,
): CombatResult {
  const result: CombatResult = { fx: [], xpGained: 0 };
  if (state.status !== 'playing' || isPlayerDown(state)) return result;

  // Synergy (R4): tiers come from applyPassives; fire 4 bursts are queued on fire kills.
  const tiers = state.synergy ?? synergyTiers(state, skillDefs);
  const fireBursts: { x: number; y: number }[] = [];
  let recordFireKills = tiers.fire >= 4;
  const targets = buildTargets(state, monsterDefs, (xp) => (result.xpGained += xp), bus, (x, y, tags) => {
    if (recordFireKills && tags.includes('fire')) fireBursts.push({ x, y });
  });
  const { x: px, y: py } = state.player;

  for (const owned of state.skills) {
    if (state.status !== 'playing') break; // the boss died mid-tick
    const def = skillDefs.find((s) => s.id === owned.id);
    if (!def) continue;
    // Tonight's meal (balance §6.2, R6): mushroom soup = Skill XP +30%, bento = cooldown −8%.
    const xpMult = state.nightBuff?.skillXpMult ?? 1;
    if (def.kind === 'passive') {
      if (!owned.gift) owned.xp += PASSIVE_SXP_PER_SECOND * dt * xpMult;
      continue;
    }
    owned.cooldownLeft = Math.max(0, owned.cooldownLeft - dt);
    if (owned.cooldownLeft > 0) continue;
    const aim = nearest(targets, px, py, def.range * TILE);
    if (!aim) continue;
    owned.cooldownLeft = def.cooldown * (state.nightBuff?.cooldownMult ?? 1);
    const mealDamage = (state.nightBuff?.damageMult ?? 1) * (state.metaDamage ?? 1);
    const coreMult = coreBoostMult(def.rarity, owned.rarityBoost); // Fusion Core "+1 rarity" (R3, D17)
    let synMult = synergyDamageMult(tiers, def);
    if (tiers.shadow >= 2 && rng.chance(SHADOW_T2.chance)) synMult *= SHADOW_T2.mult; // shadow 2 (slice crit)
    const eff = synergyShapedDef(def, tiers);
    const hits = cast(eff, damageAtLevel(def, levelForXp(owned.xp)) * mealDamage * coreMult * synMult, aim, targets, px, py, rng, result.fx);
    if (hits > 0 && tiers.lightning >= 4 && !aim.dead && rng.chance(LIGHTNING_T4.chance)) {
      aim.hit(LIGHTNING_T4.damage, ['lightning']); // lightning 4: a follow-up bolt
      result.fx.push({ skillId: 'syn_lightning', shape: 'chain', x1: aim.x, y1: aim.y - 70, x2: aim.x, y2: aim.y });
    }
    if (hits > 0 && !owned.gift) owned.xp += def.cooldown * xpMult; // gift skills never level up (G2)
  }

  // Fire 4: a monster killed by fire bursts for 25 around it (bursts do not chain).
  recordFireKills = false;
  const burstR = FIRE_T4_BURST.radiusTiles * TILE;
  for (const b of fireBursts) {
    for (const t of targets) if (!t.dead && dist(b.x, b.y, t.x, t.y) <= burstR) t.hit(FIRE_T4_BURST.damage, ['fire']);
    result.fx.push({ skillId: 'syn_fire', shape: 'ring', x1: b.x, y1: b.y, x2: b.x, y2: b.y, radius: burstR });
  }
  tickSynergyTimers(state, dt, tiers, targets, rng, result.fx);

  // "Fresh meat": 3% per kill, heals 20 HP (balance §1.1) and goes into the bag as an
  // ingredient for the evening (balance §6.2, R2). Applied at once instead of as a pickup.
  // Hungry tonight = no healing from meat (balance §6.2 debuff).
  const killed = state.monsters.filter((m) => m.hp <= 0).length;
  for (let i = 0; i < killed; i++) {
    if (!rng.chance(MEAT_DROP_CHANCE)) continue;
    if (state.nightBuff?.hpRegenPerSec !== 0) {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + MEAT_HEAL);
    }
    state.inventory = { ...(state.inventory ?? {}), meat: (state.inventory?.meat ?? 0) + 1 };
  }
  for (const m of state.monsters) if (m.hp <= 0) eliteCoreOnDeath(state, m.defId); // Elite drops a Core (D6)
  queueDeathEffects(state);
  state.monsters = state.monsters.filter((m) => m.hp > 0);
  applyPassives(state, skillDefs); // passive defence may have levelled up
  return result;
}
