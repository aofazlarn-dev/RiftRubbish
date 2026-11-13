/**
 * Skill Draft: pick N distinct skills from the pool (balance §9.2, D3, D4, D10).
 * Uses only the 'draft' RNG stream so other systems never shift the result (rng.ts).
 * The 4th fusion card (§7) is not part of this function.
 */

import type { RngStream } from '../core/rng';
import { DRAFT_RARITY_WEIGHTS, downgrade, RARITY_ORDER, type Rarity, type SkillDef } from './skills';

export interface DraftOptions {
  /** How many distinct cards to show. Default 3 (MVP: pick 1 of 3). */
  count?: number;
  /** Skill ids that would complete a fusion pair with an owned skill. Weighted ×2 (D10). */
  pairBias?: ReadonlySet<string>;
}

const PAIR_BIAS_WEIGHT = 2;

/**
 * Returns up to `count` distinct skills. Stops early (fewer cards) if the pool runs out.
 * Owned skills are never offered again in this function (rule for "upgrade" cards is separate).
 */
export function drawDraft(
  rng: RngStream,
  pool: readonly SkillDef[],
  owned: ReadonlySet<string>,
  options: DraftOptions = {},
): SkillDef[] {
  const count = options.count ?? 3;
  const bias = options.pairBias ?? new Set<string>();
  const picked: SkillDef[] = [];
  const pickedIds = new Set<string>();

  while (picked.length < count) {
    const available = (s: SkillDef) => !owned.has(s.id) && !pickedIds.has(s.id);
    // Step down a rarity until a card exists (balance §9.1).
    let rarity: Rarity | null = rollRarity(rng);
    let candidates: SkillDef[] = [];
    while (rarity) {
      candidates = pool.filter((s) => s.rarity === rarity && available(s));
      if (candidates.length > 0) break;
      rarity = downgrade(rarity);
    }
    // Nothing at or below the rolled rarity is left: offer what remains rather than show fewer cards.
    if (candidates.length === 0) candidates = pool.filter(available);
    if (candidates.length === 0) break; // pool exhausted

    const weights = candidates.map((s) => (bias.has(s.id) ? PAIR_BIAS_WEIGHT : 1));
    const card = rng.weighted(candidates, weights);
    picked.push(card);
    pickedIds.add(card.id);
  }
  return picked;
}

/** One rarity roll using the MVP table (D3). Mythic has weight 0 and is never rolled. */
function rollRarity(rng: RngStream): Rarity {
  const rarities = RARITY_ORDER.filter((r) => DRAFT_RARITY_WEIGHTS[r] > 0);
  return rng.weighted(
    rarities,
    rarities.map((r) => DRAFT_RARITY_WEIGHTS[r]),
  );
}
