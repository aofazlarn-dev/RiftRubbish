/**
 * Skill data and rules as pure functions (AGENTS.md: rules live in src/systems, no Phaser).
 * Numbers come from docs/content/balance.md §2.1 (Skill XP, level multipliers) and
 * docs/content/skills_fusion.md (per-skill data, Lv1 values).
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type SkillKind = 'active' | 'passive';

export interface SkillDef {
  id: string;
  name: { th: string; en: string };
  kind: SkillKind;
  rarity: Rarity;
  tags: string[];
  damage: number;
  cooldown: number;
  range: number;
  shape: string;
  junk?: boolean;
  /** cone: full angle in degrees. */
  arc?: number;
  /** projectile: explosion radius in tiles around the target. */
  splash?: number;
  /** projectile: chance to hit (Throw Rock misses a lot). */
  accuracy?: number;
  /** line: seconds of slow applied to every monster hit. */
  slowSeconds?: number;
  /** chain: extra jumps, jump radius in tiles, damage lost per jump. */
  jumps?: number;
  jumpRange?: number;
  falloff?: number;
  /** line: also fires in the opposite direction. */
  bothWays?: boolean;
  /** Fusion results: never offered by the Draft, level up to 7, and `damage` is the value at `baseLevel`. */
  fusedOnly?: boolean;
  maxLevel?: number;
  baseLevel?: number;
  /** Passive defence by skill level (index = level): share of damage removed and bonus Max HP. */
  defense?: { reduction: number[]; maxHp: number[] };
}

/** One recipe: two source skills, and which result you get depending on which source is the higher level (GDD §7). */
export interface FusionRecipe {
  id: string;
  a: string;
  b: string;
  resultA: string;
  resultB: string;
  /** Mythic recipes (F09) take one Fusion Core (GDD §7 rule 4, D14). */
  requiresCore?: boolean;
}

/** balance §5.3: damage budget per rarity. A Fusion Core's "+1 rarity" uses the ratio (D17). */
export const RARITY_DAMAGE_MULT: Record<Rarity, number> = {
  common: 1.0,
  rare: 1.2,
  epic: 1.45,
  legendary: 1.75,
  mythic: 2.1,
};

/** "+1 rarity" stops at Legendary (D3, D14). */
export const CORE_BOOST_CAP: Rarity = 'legendary';

/** Rarity after `boost` steps, capped at Legendary (never lowers a Mythic). */
export function boostedRarity(base: Rarity, boost = 0): Rarity {
  if (boost <= 0) return base;
  const capIdx = RARITY_ORDER.indexOf(CORE_BOOST_CAP);
  const baseIdx = RARITY_ORDER.indexOf(base);
  if (baseIdx >= capIdx) return base;
  return RARITY_ORDER[Math.min(capIdx, baseIdx + boost)];
}

/** Damage multiplier a Core boost gives (Epic → Legendary ≈ ×1.21, D17). 1 when no boost. */
export function coreBoostMult(base: Rarity, boost = 0): number {
  return RARITY_DAMAGE_MULT[boostedRarity(base, boost)] / RARITY_DAMAGE_MULT[base];
}

/** Rarity order, lowest to highest. Used for the downgrade rule (balance §9.1). */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Draft rarity weights in percent for the MVP (D3). Mythic is 0: fusion only. */
export const DRAFT_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 55,
  rare: 28,
  epic: 12,
  legendary: 5,
  mythic: 0,
};

/** Damage multiplier by skill level, relative to Lv1 (balance §2.1). Index = level. */
export const LEVEL_MULTIPLIER: readonly number[] = [0, 1.0, 1.25, 1.55, 1.9, 2.4, 2.9, 3.4];

/** Normal skills cap at Lv5, fused skills at Lv7 (balance §2.1, D2). */
export const MAX_NORMAL_LEVEL = 5;
export const MAX_FUSED_LEVEL = 7;
/** Both sources must be at least this level to fuse (GDD §7). */
export const FUSION_MIN_LEVEL = 3;

/** Cumulative Skill XP needed to reach each level (balance §2.1; Lv6–7 per D21). Index = level. */
export const SKILL_XP_THRESHOLDS: readonly number[] = [0, 0, 50, 180, 420, 800, 1050, 1400];

export function levelForXp(xp: number, maxLevel = MAX_NORMAL_LEVEL): number {
  let level = 1;
  for (let lv = 2; lv <= maxLevel; lv++) {
    if (xp >= SKILL_XP_THRESHOLDS[lv]) level = lv;
  }
  return level;
}

export function maxLevelOf(skill: SkillDef): number {
  return skill.maxLevel ?? MAX_NORMAL_LEVEL;
}

/** Level of an owned skill, honouring the Lv7 cap of fused skills. */
export function ownedLevel(skill: SkillDef, xp: number): number {
  return levelForXp(xp, maxLevelOf(skill));
}

/**
 * Damage for a skill at a given level. Level multipliers apply to every damage kind (D23).
 * Fused skills list their damage at Lv3, so they scale relative to `baseLevel`.
 */
export function damageAtLevel(skill: SkillDef, level: number): number {
  const lv = Math.min(Math.max(level, 1), maxLevelOf(skill));
  const mult = LEVEL_MULTIPLIER[lv] / LEVEL_MULTIPLIER[skill.baseLevel ?? 1];
  return Math.round(skill.damage * mult * 10) / 10;
}

const RARITIES = new Set<string>(RARITY_ORDER);
const KINDS = new Set<string>(['active', 'passive']);

/** Checks the shape of skills.json. Throws with the first problem found. */
export function validateSkills(data: unknown): SkillDef[] {
  const list = (data as { skills?: unknown })?.skills;
  if (!Array.isArray(list)) throw new Error('skills.json: "skills" must be an array');
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const s = raw as Partial<SkillDef>;
    const where = `skills[${i}]${s.id ? ` (${s.id})` : ''}`;
    if (typeof s.id !== 'string' || s.id.length === 0) throw new Error(`${where}: missing id`);
    if (seen.has(s.id)) throw new Error(`${where}: duplicate id`);
    seen.add(s.id);
    if (!s.name || typeof s.name.th !== 'string' || typeof s.name.en !== 'string') {
      throw new Error(`${where}: name.th and name.en are required`);
    }
    if (!KINDS.has(s.kind as string)) throw new Error(`${where}: kind must be active or passive`);
    if (!RARITIES.has(s.rarity as string)) throw new Error(`${where}: unknown rarity ${String(s.rarity)}`);
    if (!Array.isArray(s.tags)) throw new Error(`${where}: tags must be an array`);
    for (const key of ['damage', 'cooldown', 'range'] as const) {
      if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || (s[key] as number) < 0) {
        throw new Error(`${where}: ${key} must be a non-negative number`);
      }
    }
    if (typeof s.shape !== 'string') throw new Error(`${where}: shape is required`);
    return s as SkillDef;
  });
}

/** Lower rarity to fall back to when a rarity has no skill left to offer (balance §9.1). */
export function downgrade(rarity: Rarity): Rarity | null {
  const i = RARITY_ORDER.indexOf(rarity);
  return i > 0 ? RARITY_ORDER[i - 1] : null;
}
