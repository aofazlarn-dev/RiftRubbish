/**
 * Skill fusion rules (GDD §7, balance §1.3 and §2.3, D1, D4). Pure, no Phaser.
 *
 *  - Both source skills must be owned and at least FUSION_MIN_LEVEL (Lv3).
 *  - The result follows the source with the HIGHER level. On a tie, the source that was
 *    taken first (the card the player kept first) decides, so the rule is deterministic.
 *  - The result starts with the higher source's Skill XP, so it keeps that level and goes on
 *    up to Lv7 on the fused curve (D2).
 *  - Both sources are removed; a source can come back in a later Draft (D4).
 */

import type { GameState, OwnedSkill } from '../core/state';
import { applyPassives } from './base';
import { FUSION_MIN_LEVEL, levelForXp, ownedLevel, type FusionRecipe, type SkillDef } from './skills';

export interface FusionOutcome {
  resultId: string;
  /** Which source's Skill XP the result inherited. */
  fromId: string;
}

/** Recipe for a pair of skill ids, in either order, or null if there is none. */
export function findRecipe(recipes: readonly FusionRecipe[], idOne: string, idTwo: string): FusionRecipe | null {
  return (
    recipes.find((r) => (r.a === idOne && r.b === idTwo) || (r.a === idTwo && r.b === idOne)) ?? null
  );
}

/** True when both sources are owned and at or above the fusion level. */
export function canFuse(state: GameState, skillDefs: readonly SkillDef[], recipe: FusionRecipe): boolean {
  return [recipe.a, recipe.b].every((id) => {
    const owned = state.skills.find((s) => s.id === id);
    const def = skillDefs.find((d) => d.id === id);
    if (!owned || !def) return false;
    return ownedLevel(def, owned.xp) >= FUSION_MIN_LEVEL;
  });
}

/**
 * Which result a fusion produces. `firstTaken` is the id the player took first; it only
 * matters on a tie. Returns the result id and the source whose XP is inherited.
 */
export function fusionOutcome(
  state: GameState,
  recipe: FusionRecipe,
  firstTaken: string,
): FusionOutcome {
  const xpA = state.skills.find((s) => s.id === recipe.a)?.xp ?? 0;
  const xpB = state.skills.find((s) => s.id === recipe.b)?.xp ?? 0;
  const levelA = levelForXp(xpA);
  const levelB = levelForXp(xpB);
  const aWins = levelA > levelB || (levelA === levelB && firstTaken === recipe.a);
  return aWins
    ? { resultId: recipe.resultA, fromId: recipe.a }
    : { resultId: recipe.resultB, fromId: recipe.b };
}

/**
 * Fuses two owned skills into one. Returns the outcome, or null when the fusion is not
 * allowed (no recipe, a source missing, or a source below Lv3). State is unchanged on null.
 */
export function fuse(
  state: GameState,
  skillDefs: readonly SkillDef[],
  recipes: readonly FusionRecipe[],
  idOne: string,
  idTwo: string,
): FusionOutcome | null {
  const recipe = findRecipe(recipes, idOne, idTwo);
  if (!recipe || !canFuse(state, skillDefs, recipe)) return null;

  const outcome = fusionOutcome(state, recipe, idOne);
  const inherited: OwnedSkill = {
    id: outcome.resultId,
    xp: state.skills.find((s) => s.id === outcome.fromId)?.xp ?? 0,
    cooldownLeft: 0,
  };
  state.skills = state.skills.filter((s) => s.id !== recipe.a && s.id !== recipe.b);
  state.skills.push(inherited);
  applyPassives(state, skillDefs);
  return outcome;
}
