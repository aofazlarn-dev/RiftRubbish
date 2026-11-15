/**
 * Pure UI models for R4 Synergy HUD badges/tooltips, Smart Draft hints,
 * and G6 Fusion & Synergy Codex overlays (D24 player-facing Thai copy, no Phaser).
 */

import type { GameState } from '../core/state';
import { FUSION_MIN_LEVEL, levelForXp, ownedLevel, type FusionRecipe, type SkillDef } from '../systems/skills';
import {
  SYNERGY_TAGS,
  SYNERGY_TEXT_TH,
  synergyCounts,
  synergyTiers,
  tierFor,
  type SynergyTag,
  type SynergyTier,
} from '../systems/synergy';

export const SYNERGY_META_TH: Record<
  SynergyTag,
  { labelTh: string; icon: string; colorHex: string; colorNum: number }
> = {
  fire: { labelTh: 'ไฟ', icon: '🔥', colorHex: '#fb923c', colorNum: 0xf97316 },
  ice: { labelTh: 'น้ำแข็ง', icon: '❄️', colorHex: '#67e8f9', colorNum: 0x22d3ee },
  lightning: { labelTh: 'สายฟ้า', icon: '⚡', colorHex: '#fde047', colorNum: 0xfacc15 },
  beast: { labelTh: 'สัตว์', icon: '🐾', colorHex: '#86efac', colorNum: 0x22c55e },
  earth: { labelTh: 'ดิน', icon: '⛰️', colorHex: '#fdba74', colorNum: 0xb45309 },
  shadow: { labelTh: 'เงา', icon: '🌑', colorHex: '#d8b4fe', colorNum: 0xa855f7 },
};

export interface SynergyHudBadge {
  tag: SynergyTag;
  labelTh: string;
  icon: string;
  count: number;
  tier: SynergyTier;
  nextTier: 2 | 4 | 6 | null;
  chipTextTh: string;
  activeBonusesTh: string[];
  tooltipTh: string;
}

export interface DraftCardHint {
  tagsLineTh: string;
  fusionLineTh: string;
}

export interface CodexRecipeEntry {
  id: string;
  aId: string;
  aNameTh: string;
  aOwnedLv: number | null;
  bId: string;
  bNameTh: string;
  bOwnedLv: number | null;
  resultAId: string;
  resultANameTh: string;
  resultBId: string;
  resultBNameTh: string;
  requiresCore: boolean;
  readyToFuse: boolean;
  statusLabelTh: string;
}

export interface CodexSynergyEntry {
  tag: SynergyTag;
  labelTh: string;
  icon: string;
  colorHex: string;
  count: number;
  tier: SynergyTier;
  tiers: Array<{ tier: 2 | 4 | 6; textTh: string; unlocked: boolean }>;
}

const TIERS_DESC: readonly (2 | 4 | 6)[] = [2, 4, 6];

function latestBonusForTier(tag: SynergyTag, tier: SynergyTier): string | undefined {
  if (tier === 0) return undefined;
  const table = SYNERGY_TEXT_TH[tag];
  if (tier >= 6 && table[6]) return table[6];
  if (tier >= 4 && table[4]) return table[4];
  return table[2];
}

function nextUnlockTier(tag: SynergyTag, currentTier: SynergyTier): 2 | 4 | 6 | null {
  const table = SYNERGY_TEXT_TH[tag];
  for (const t of TIERS_DESC) {
    if (t > currentTier && table[t]) return t;
  }
  return null;
}

/** Builds interactive Synergy HUD chips and full Thai tooltips for owned non-gift skills (R4). */
export function buildSynergyHudBadges(
  state: Pick<GameState, 'skills' | 'synergy'>,
  skillDefs: readonly SkillDef[],
): SynergyHudBadge[] {
  const counts = synergyCounts(state as GameState, skillDefs);
  const tiers = state.synergy ?? synergyTiers(state as GameState, skillDefs);

  const badges: SynergyHudBadge[] = [];
  for (const tag of SYNERGY_TAGS) {
    const count = counts[tag];
    if (count <= 0) continue;
    const tier = tiers[tag];
    const meta = SYNERGY_META_TH[tag];
    const table = SYNERGY_TEXT_TH[tag];
    const nextTier = nextUnlockTier(tag, tier);

    const activeBonusesTh = TIERS_DESC.filter((t) => t <= tier && table[t]).map((t) => table[t]!);
    const chipTextTh =
      tier >= 2
        ? `${meta.icon}${meta.labelTh} ${count} (ขั้น ${tier})`
        : `${meta.icon}${meta.labelTh} ${count}/2`;

    const lines = [`${meta.icon} สาย${meta.labelTh} · ถืออยู่ ${count} สกิล${tier >= 2 ? ` (ขั้น ${tier})` : ''}`];
    for (const t of TIERS_DESC) {
      const desc = table[t];
      if (!desc) continue;
      const mark = tier >= t ? '✔' : '🔒';
      lines.push(`${mark} ครบ ${t}: ${desc}`);
    }
    if (activeBonusesTh.length === 0 && table[2]) {
      lines.push(`อีก ${Math.max(1, 2 - count)} ชิ้นเพื่อปลดขั้น 2`);
    }

    badges.push({
      tag,
      labelTh: meta.labelTh,
      icon: meta.icon,
      count,
      tier,
      nextTier,
      chipTextTh,
      activeBonusesTh,
      tooltipTh: lines.join('\n'),
    });
  }

  return badges.sort((a, b) => b.tier - a.tier || b.count - a.count);
}

/** Single-line HUD summary for active Synergy tiers >= 2 using SYNERGY_TEXT_TH (R4). */
export function formatSynergyHudLine(
  state: Pick<GameState, 'skills' | 'synergy'>,
  skillDefs: readonly SkillDef[],
): string {
  const counts = synergyCounts(state as GameState, skillDefs);
  const tiers = state.synergy ?? synergyTiers(state as GameState, skillDefs);
  const active: string[] = [];

  for (const tag of SYNERGY_TAGS) {
    const tier = tiers[tag];
    if (tier < 2) continue;
    const meta = SYNERGY_META_TH[tag];
    const bonus = latestBonusForTier(tag, tier);
    active.push(bonus ? `${meta.icon}${meta.labelTh}(${counts[tag]})·${bonus}` : `${meta.icon}${meta.labelTh}(${counts[tag]})`);
  }
  return active.length > 0 ? `Synergy: ${active.join(' | ')}` : '';
}

/** Builds easy-to-scan element + synergy unlock + fusion partner hints for a Draft card. */
export function buildDraftCardHint(
  skillId: string,
  state: Pick<GameState, 'skills' | 'synergy'>,
  skillDefs: readonly SkillDef[],
  recipes: readonly FusionRecipe[],
): DraftCardHint {
  const def = skillDefs.find((d) => d.id === skillId);
  if (!def) return { tagsLineTh: '', fusionLineTh: '' };

  const counts = synergyCounts(state as GameState, skillDefs);
  const alreadyOwned = state.skills.some((o) => o.id === skillId && !o.gift);
  const tagParts: string[] = [];
  let unlockNote = '';

  for (const rawTag of def.tags) {
    if (!(rawTag in SYNERGY_META_TH)) continue;
    const tag = rawTag as SynergyTag;
    const meta = SYNERGY_META_TH[tag];
    tagParts.push(`${meta.icon} ${meta.labelTh}`);
    if (!alreadyOwned && !unlockNote) {
      const prevTier = tierFor(counts[tag]);
      const nextTier = tierFor(counts[tag] + 1);
      const bonus = SYNERGY_TEXT_TH[tag][nextTier as 2 | 4 | 6];
      if (nextTier > prevTier && bonus) {
        unlockNote = ` → ปลด${meta.labelTh}ขั้น ${nextTier}: ${bonus}!`;
      }
    }
  }
  if (tagParts.length === 0 && def.junk) tagParts.push('🗑️ สกิลขยะ (ไว้ผสมสกิลเทพ)');
  const tagsLineTh = `${tagParts.join(' · ')}${unlockNote}`;

  const matchingRecipes = recipes.filter((r) => r.a === skillId || r.b === skillId);
  let fusionLineTh = '';
  for (const r of matchingRecipes) {
    const partnerId = r.a === skillId ? r.b : r.a;
    const partnerDef = skillDefs.find((d) => d.id === partnerId);
    const resADef = skillDefs.find((d) => d.id === r.resultA);
    const resBDef = skillDefs.find((d) => d.id === r.resultB);
    if (!partnerDef || !resADef) continue;
    const partnerOwned = state.skills.find((o) => o.id === partnerId && !o.gift);
    if (partnerOwned) {
      const pLv = ownedLevel(partnerDef, partnerOwned.xp);
      const outNames = resBDef ? `${resADef.name.th} / ${resBDef.name.th}` : resADef.name.th;
      fusionLineTh = `⚗️ คู่ผสมที่มีแล้ว: + ${partnerDef.name.th} (Lv${pLv}) → ${outNames}`;
      break;
    }
    if (!fusionLineTh) {
      fusionLineTh = `📖 ผสมคู่กับ "${partnerDef.name.th}" → ${resADef.name.th}`;
    }
  }

  return { tagsLineTh, fusionLineTh };
}

/** Builds full G6 Codex list for all Fusion Recipes and Synergy Tiers. */
export function buildCodexEntries(
  state: Pick<GameState, 'skills' | 'cores' | 'synergy'> | null,
  skillDefs: readonly SkillDef[],
  recipes: readonly FusionRecipe[],
): { recipes: CodexRecipeEntry[]; synergies: CodexSynergyEntry[] } {
  const findDef = (id: string) => skillDefs.find((d) => d.id === id);
  const ownedLv = (id: string): number | null => {
    const own = state?.skills.find((o) => o.id === id && !o.gift);
    if (!own) return null;
    const def = findDef(id);
    return def ? ownedLevel(def, own.xp) : levelForXp(own.xp);
  };

  const recipeEntries: CodexRecipeEntry[] = recipes.map((r) => {
    const aDef = findDef(r.a);
    const bDef = findDef(r.b);
    const resADef = findDef(r.resultA);
    const resBDef = findDef(r.resultB);
    const aLv = ownedLv(r.a);
    const bLv = ownedLv(r.b);
    const needCore = !!r.requiresCore;
    const hasCore = (state?.cores ?? 0) >= 1;
    const bothLv3 = aLv !== null && bLv !== null && aLv >= FUSION_MIN_LEVEL && bLv >= FUSION_MIN_LEVEL;
    const readyToFuse = bothLv3 && (!needCore || hasCore);

    let statusLabelTh = '';
    if (readyToFuse) statusLabelTh = '✨ พร้อมผสม!';
    else if (bothLv3 && needCore && !hasCore) statusLabelTh = '💠 ขาด Core 1 ลูก';
    else if (aLv !== null && bLv !== null) statusLabelTh = 'มีครบ 2/2 (ดันถึง Lv3)';
    else if (aLv !== null || bLv !== null) statusLabelTh = 'มีแล้ว 1/2';

    return {
      id: r.id,
      aId: r.a,
      aNameTh: aDef?.name.th ?? r.a,
      aOwnedLv: aLv,
      bId: r.b,
      bNameTh: bDef?.name.th ?? r.b,
      bOwnedLv: bLv,
      resultAId: r.resultA,
      resultANameTh: resADef?.name.th ?? r.resultA,
      resultBId: r.resultB,
      resultBNameTh: resBDef?.name.th ?? r.resultB,
      requiresCore: needCore,
      readyToFuse,
      statusLabelTh,
    };
  });

  const dummyState: Pick<GameState, 'skills' | 'synergy'> = state ?? { skills: [] };
  const counts = synergyCounts(dummyState as GameState, skillDefs);
  const tiers = state?.synergy ?? synergyTiers(dummyState as GameState, skillDefs);

  const synergyEntries: CodexSynergyEntry[] = SYNERGY_TAGS.map((tag) => {
    const meta = SYNERGY_META_TH[tag];
    const table = SYNERGY_TEXT_TH[tag];
    const tier = tiers[tag];
    return {
      tag,
      labelTh: meta.labelTh,
      icon: meta.icon,
      colorHex: meta.colorHex,
      count: counts[tag],
      tier,
      tiers: TIERS_DESC.filter((t) => !!table[t]).map((t) => ({
        tier: t,
        textTh: table[t]!,
        unlocked: tier >= t,
      })),
    };
  });

  return { recipes: recipeEntries, synergies: synergyEntries };
}
