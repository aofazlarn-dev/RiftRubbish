/**
 * Meta shop and Daily loadout (approved drafts in docs/content/proposals_mission_meta_daily.md, PR #44).
 * Pure, no Phaser.
 *
 * - Three meta items, each +5%, total capped at +15% (balance §7). Each can be bought once.
 * - Daily runs use a fixed loadout and no meta (GDD §2).
 */

import type { GameState } from '../core/state';

export interface MetaItem {
  id: 'META_GLOVE' | 'META_SLIPPER' | 'META_LID';
  cost: number;
  /** Which stat the +5% goes to. */
  stat: 'damage' | 'speed' | 'coreHp';
}

export const META_ITEMS: readonly MetaItem[] = [
  { id: 'META_GLOVE', cost: 35, stat: 'damage' },
  { id: 'META_SLIPPER', cost: 40, stat: 'speed' },
  { id: 'META_LID', cost: 40, stat: 'coreHp' },
];

export const META_STEP = 0.05;
export const META_CAP = 0.15;
export const DAILY_LOADOUT: readonly string[] = ['W01', 'J03'];

/** Buys a meta item from the bank. Returns true if bought. */
export function buyMeta(bank: number, owned: readonly string[], id: MetaItem['id']): { bought: boolean; bank: number; owned: string[] } {
  const item = META_ITEMS.find((m) => m.id === id);
  if (!item || owned.includes(id) || bank < item.cost) return { bought: false, bank, owned: [...owned] };
  return { bought: true, bank: bank - item.cost, owned: [...owned, id] };
}

/** Bonus for one stat from owned meta, capped at META_CAP in total. */
export function metaBonus(owned: readonly string[], stat: MetaItem['stat']): number {
  const count = META_ITEMS.filter((m) => m.stat === stat && owned.includes(m.id)).length;
  return Math.min(count * META_STEP, META_CAP);
}

/** Daily runs get the fixed loadout and no meta; Casual gets its meta bonuses. */
export function startingSkillsFor(state: GameState): string[] {
  return state.mode === 'daily' ? [...DAILY_LOADOUT] : [];
}
