/**
 * Player level, XP and the Draft flow (balance §1.2, §2.2, §9; GDD §6). Pure, no Phaser.
 * A level-up owes one Draft. While a Draft is on screen the run is paused (state.pendingDraft).
 */

import type { EventBus } from '../core/events';
import type { RngStream } from '../core/rng';
import type { GameState } from '../core/state';
import { applyPassives } from './base';
import { drawDraft } from './draft';
import { levelForXp, MAX_NORMAL_LEVEL, type SkillDef } from './skills';

/** XP needed to go from level N to N+1 (balance §1.2). Index 0 = level 1→2. */
const XP_TO_NEXT = [5, 7, 10, 14, 18, 22, 26, 30, 40, 45, 55, 80, 95, 110, 130, 150, 170, 190, 210];
const XP_TO_NEXT_CAP = 210;

/** 8 skill slots: 4 Active + 4 Passive (GDD §6). */
export const MAX_ACTIVE = 4;
export const MAX_PASSIVE = 4;
export const DRAFT_CARDS = 3;

export function xpToNext(level: number): number {
  return XP_TO_NEXT[level - 1] ?? XP_TO_NEXT_CAP;
}

/** Adds XP and levels up as many times as it covers. Each level-up owes one Draft. */
export function grantXp(state: GameState, amount: number, bus?: EventBus): void {
  if (amount <= 0) return;
  state.player.xp += amount;
  while (state.player.xp >= xpToNext(state.player.level)) {
    state.player.xp -= xpToNext(state.player.level);
    state.player.level += 1;
    state.draftsOwed += 1;
    bus?.emit('player:levelup', { level: state.player.level });
  }
}

/** Skill XP from an "upgrade" card: +40 at Lv1–2, +80 at Lv3–4 (balance §2.2). */
export function upgradeXp(level: number): number {
  return level <= 2 ? 40 : 80;
}

function buildCards(state: GameState, rng: RngStream, pool: readonly SkillDef[], first: boolean): string[] {
  const owned = new Set(state.skills.map((s) => s.id));
  // Gift skills sit outside the slots, so they do not count toward the caps.
  const count = (kind: SkillDef['kind']) =>
    state.skills.filter((s) => !s.gift && pool.find((d) => d.id === s.id)?.kind === kind).length;
  const activeFull = count('active') >= MAX_ACTIVE;
  const passiveFull = count('passive') >= MAX_PASSIVE;

  const eligible = pool.filter((s) => {
    if (s.fusedOnly) return false; // fusion results come only from recipes (GDD §7)
    if (owned.has(s.id)) return false;
    if (s.kind === 'active' ? activeFull : passiveFull) return false;
    // The very first card is always a real attack so the first level-up comes quickly (balance §1.2).
    return !first || (s.kind === 'active' && !s.junk);
  });

  const drawn = drawDraft(rng, eligible, owned, { count: DRAFT_CARDS });
  // Decision (balance §1.2): while the run owns fewer than two damage Actives, every Draft after the
  // first holds at least one damage Active, so a passive-only start cannot stall the run.
  const isAttack = (s: SkillDef) => s.kind === 'active' && !s.junk;
  const attacksOwned = state.skills.filter((o) => {
    const d = pool.find((p) => p.id === o.id);
    return !o.gift && d !== undefined && isAttack(d);
  }).length;
  if (!first && attacksOwned < 2 && drawn.length > 0 && !drawn.some(isAttack)) {
    const spare = eligible.filter((s) => isAttack(s) && !drawn.includes(s));
    if (spare.length > 0) drawn[drawn.length - 1] = rng.pick(spare);
  }
  const cards = drawn.map((s) => `skill:${s.id}`);

  // Fill the remaining cards with upgrades for skills that can still level.
  const upgradable = state.skills.filter((s) => !s.gift && levelForXp(s.xp) < MAX_NORMAL_LEVEL).map((s) => s.id);
  while (cards.length < DRAFT_CARDS && upgradable.length > 0) {
    const id = rng.pick(upgradable);
    upgradable.splice(upgradable.indexOf(id), 1);
    cards.push(`up:${id}`);
  }
  return cards;
}

/** Opens the next owed Draft, if any. A Draft with no possible card is skipped. */
export function openDraftIfOwed(
  state: GameState,
  rng: RngStream,
  pool: readonly SkillDef[],
  bus?: EventBus,
  first = false,
): void {
  while (state.status === 'playing' && !state.pendingDraft && state.draftsOwed > 0) {
    state.draftsOwed -= 1;
    const cards = buildCards(state, rng, pool, first);
    if (cards.length === 0) continue;
    state.pendingDraft = cards;
    bus?.emit('draft:open', { cards });
  }
}

/** Applies the chosen card and closes the Draft. Returns false for an invalid index. */
export function pickDraft(state: GameState, index: number, skillDefs: readonly SkillDef[], bus?: EventBus): boolean {
  const card = state.pendingDraft?.[index];
  if (!card) return false;
  const [type, id] = card.split(':');
  if (type === 'skill') {
    state.skills.push({ id, xp: 0, cooldownLeft: 0 });
  } else {
    const owned = state.skills.find((s) => s.id === id);
    if (owned) owned.xp += upgradeXp(levelForXp(owned.xp));
  }
  state.pendingDraft = null;
  applyPassives(state, skillDefs);
  bus?.emit('draft:pick', { card });
  return true;
}
