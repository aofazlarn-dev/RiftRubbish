/**
 * Base core and player survival rules (GDD §5, balance §1.1, §6.1). Pure, no Phaser.
 *  - Player at 0 HP: respawns at the base after 10 s, the core loses 15% of its max HP.
 *  - Core at 0 HP: the run is lost.
 *  - Dawn: the core repairs 10% of its max HP.
 */

import type { EventBus } from '../core/events';
import type { GameState } from '../core/state';
import { CORE_X, CORE_Y, TILE } from '../core/world';
import { ownedLevel, type SkillDef } from './skills';
import { EARTH_T2_HP_MULT, EARTH_T4_TAKEN_MULT, SHADOW_T6, synergyTiers } from './synergy';

export const RESPAWN_SECONDS = 10;
export const DEATH_CORE_PENALTY = 0.15;
export const DAWN_REPAIR = 0.1;
export const HIT_INVULN_SECONDS = 0.5;
export const BASE_MAX_HP = 100;

/**
 * Recomputes Max HP and damage reduction from every owned passive that has a `defense`
 * table (Stoneskin, Glacier Bulwark). Bonus HP adds up; reductions stack multiplicatively.
 * Extra Max HP is also added to current HP.
 */
export function applyPassives(state: GameState, skillDefs: readonly SkillDef[]): void {
  let bonusHp = 0;
  let keep = 1;
  for (const owned of state.skills) {
    const def = skillDefs.find((d) => d.id === owned.id);
    if (!def?.defense) continue;
    const level = ownedLevel(def, owned.xp);
    bonusHp += def.defense.maxHp[level] ?? 0;
    keep *= 1 - (def.defense.reduction[level] ?? 0);
  }
  // Synergy (R4): earth 2 = Max HP +10%, earth 4 = damage taken −10%.
  const tiers = synergyTiers(state, skillDefs);
  state.synergy = tiers;
  if (tiers.earth >= 4) keep *= EARTH_T4_TAKEN_MULT;
  // Tonight's meal (balance §6.2, R6): hard bread = Max HP +20%.
  const mealHp = state.nightBuff?.maxHpMult ?? 1;
  const maxHp = Math.round((BASE_MAX_HP + bonusHp) * (tiers.earth >= 2 ? EARTH_T2_HP_MULT : 1) * mealHp);
  const gained = maxHp - state.player.maxHp;
  state.player.maxHp = maxHp;
  state.player.damageReduction = 1 - keep;
  if (gained > 0) state.player.hp = Math.min(maxHp, state.player.hp + gained);
  else state.player.hp = Math.min(maxHp, state.player.hp);
}

export function isPlayerDown(state: GameState): boolean {
  return state.respawnIn > 0;
}

/** Applies a hit to the player. Returns the damage actually taken (0 if blocked by i-frames). */
export function damagePlayer(state: GameState, amount: number, bus?: EventBus): number {
  if (state.status !== 'playing' || isPlayerDown(state) || state.invulnLeft > 0 || amount <= 0) return 0;
  const taken = amount * (1 - (state.player.damageReduction ?? 0));
  state.player.hp = Math.max(0, state.player.hp - taken);
  state.invulnLeft = HIT_INVULN_SECONDS;
  // Shadow 6 (R4): once per night a killing hit leaves 30% HP and 3 s untouchable.
  if (state.player.hp === 0 && (state.synergy?.shadow ?? 0) >= 6 && state.phase === 'night' && !state.shadowSaved) {
    state.shadowSaved = true;
    state.player.hp = Math.max(1, Math.round(state.player.maxHp * SHADOW_T6.hpRatio));
    state.invulnLeft = SHADOW_T6.untouchableSeconds;
    return taken;
  }
  if (state.player.hp === 0) {
    state.respawnIn = RESPAWN_SECONDS;
    state.player.x = CORE_X + TILE * 2;
    state.player.y = CORE_Y;
    bus?.emit('player:down', { hp: 0 });
    damageCore(state, state.coreMaxHp * DEATH_CORE_PENALTY, bus);
  }
  return taken;
}

/** Applies damage to the core. Losing the core ends the run. */
export function damageCore(state: GameState, amount: number, bus?: EventBus): void {
  if (state.status !== 'playing' || amount <= 0) return;
  // The fence shield (balance §6.3) takes damage before the core itself.
  const shield = state.coreShield ?? 0;
  const onShield = Math.min(shield, amount);
  if (onShield > 0) state.coreShield = shield - onShield;
  const rest = amount - onShield;
  if (rest <= 0) return;
  state.coreHp = Math.max(0, state.coreHp - rest);
  if (state.coreHp === 0) {
    state.status = 'lost';
    bus?.emit('run:end', { night: state.day, result: 'lose' });
  }
}

/** Counts down i-frames and the respawn timer; revives at full HP when it ends. Meal regen ticks here (R6). */
export function tickSurvival(state: GameState, dt: number): void {
  const regen = state.nightBuff?.hpRegenPerSec ?? 0;
  if (regen > 0 && state.respawnIn <= 0) state.player.hp = Math.min(state.player.maxHp, state.player.hp + regen * dt);
  if (state.invulnLeft > 0) state.invulnLeft = Math.max(0, state.invulnLeft - dt);
  if (state.respawnIn > 0) {
    state.respawnIn = Math.max(0, state.respawnIn - dt);
    if (state.respawnIn === 0) state.player.hp = state.player.maxHp;
  }
}

export function dawnRepair(state: GameState): void {
  state.coreHp = Math.min(state.coreMaxHp, state.coreHp + state.coreMaxHp * DAWN_REPAIR);
}
