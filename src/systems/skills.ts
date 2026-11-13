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
export const LEVEL_MULTIPLIER: readonly number[] = [0, 1.0, 1.25, 1.55, 1.9, 2.4];

/** Normal skills cap at Lv5 (balance §2.1, D2). */
export const MAX_NORMAL_LEVEL = 5;

/** Cumulative Skill XP needed to reach each level (balance §2.1). Index = level. */
export const SKILL_XP_THRESHOLDS: readonly number[] = [0, 0, 50, 180, 420, 800];

export function levelForXp(xp: number): number {
  let level = 1;
  for (let lv = 2; lv <= MAX_NORMAL_LEVEL; lv++) {
    if (xp >= SKILL_XP_THRESHOLDS[lv]) level = lv;
  }
  return level;
}

/** Damage for a skill at a given level. Level multipliers apply to every damage kind (D23). */
export function damageAtLevel(skill: SkillDef, level: number): number {
  const mult = LEVEL_MULTIPLIER[Math.min(Math.max(level, 1), MAX_NORMAL_LEVEL)];
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
