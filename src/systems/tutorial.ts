/**
 * Welcome gift for Casual runs (Gap vs Spec G2; GDD §3, D15). Pure, no Phaser.
 *
 * Night 1 gift: J02 (Trip Over) and J03 (Throw Rock) are given outside the skill slots. The
 * player fuses them into R01a (Self-Inflicted Meteor, Lv1, locked level). The gift skills
 * leave at dawn of day 2 whether or not they were fused. Daily runs get no gift.
 *
 * The fusion happens when the player presses the forced fusion card (GDD §3, R5). With no
 * screen (the sim), stepRun fuses the gift on its first night tick.
 */

import type { GameState, OwnedSkill } from '../core/state';

export const TUTORIAL_GIFT_IDS = ['J02', 'J03'] as const;
export const TUTORIAL_RESULT_ID = 'R01a';

/** Gives the gift at the start of a Casual run. Does nothing if the run already had one. */
export function grantTutorialGift(state: GameState): boolean {
  if (state.mode !== 'casual' || state.tutorial !== undefined) return false;
  for (const id of TUTORIAL_GIFT_IDS) {
    state.skills.push({ id, xp: 0, cooldownLeft: 0, gift: true });
  }
  state.tutorial = 'gift';
  return true;
}

/**
 * Forced fusion of the gift into R01a. Only runs while the gift is still held. The result is
 * a gift too, so it sits outside the slots and never levels up. Returns true if it fused.
 */
export function forceTutorialFusion(state: GameState): boolean {
  if (state.tutorial !== 'gift') return false;
  const held = state.skills.filter((s) => s.gift && (TUTORIAL_GIFT_IDS as readonly string[]).includes(s.id));
  if (held.length !== TUTORIAL_GIFT_IDS.length) return false;
  state.skills = state.skills.filter((s) => !held.includes(s));
  const result: OwnedSkill = { id: TUTORIAL_RESULT_ID, xp: 0, cooldownLeft: 0, gift: true };
  state.skills.push(result);
  state.tutorial = 'fused';
  return true;
}

/** Dawn of day 2 (or later): the gift leaves, fused or not. */
export function expireTutorialGifts(state: GameState): boolean {
  if (state.tutorial !== 'gift' && state.tutorial !== 'fused') return false;
  state.skills = state.skills.filter((s) => !s.gift);
  state.tutorial = 'done';
  return true;
}
