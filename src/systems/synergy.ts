/**
 * Synergy tags (GDD §6, skills_fusion.md §2; Gap round 2 R4). Pure, no Phaser.
 *
 * Count = owned skills (Active + Passive) that carry the tag, one per skill. Tutorial gift
 * skills do not count. Tiers at 2 / 4 / 6.
 *
 * The slice has no damage-over-time, crits, freeze or summons that attack (combat.ts header),
 * so some rows use the nearest rule the slice can run. Each is marked "slice:" below.
 *   fire      2 burn +20%            → slice: fire-tagged hits +20%
 *             4 burning kill explodes r1.5 for 25
 *             6 fire damage +40%      (on top of tier 2; the burn spread is not built)
 *   ice       2 slows +15%           → slow duration ×1.15
 *             4/6 freeze rules        → not built (no freeze in the slice)
 *   lightning 2 chain +1 jump
 *             4 10% per hit: extra bolt 15
 *             6 every 8 s: 5 random monsters on screen take 40
 *   beast     2/6 summon rules        → not built (summons do not attack in the slice)
 *             4 player move speed +10%
 *   earth     2 Max HP +10%
 *             4 damage taken −10%, AoE radius +15%
 *             6 junk skills (J01–J06) ×2 damage; every 10 s a quake stuns monsters within 4 tiles for 1 s
 *   shadow    2 crit chance +8%       → slice: 8% of hits deal ×2 (there are no other crits)
 *             4 shadow minion on kill → not built (no attacking summons)
 *             6 once per night, a hit that would drop you to 0 HP leaves you at 30% HP and 3 s untouchable
 */

import type { GameState } from '../core/state';
import type { SkillDef } from './skills';

export const SYNERGY_TAGS = ['fire', 'ice', 'lightning', 'beast', 'earth', 'shadow'] as const;
export type SynergyTag = (typeof SYNERGY_TAGS)[number];
export type SynergyTier = 0 | 2 | 4 | 6;
export type SynergyTiersMap = Record<SynergyTag, SynergyTier>;

export const FIRE_T2_MULT = 1.2;
export const FIRE_T6_MULT = 1.4;
export const FIRE_T4_BURST = { radiusTiles: 1.5, damage: 25 } as const;
export const ICE_T2_SLOW_MULT = 1.15;
export const LIGHTNING_T2_EXTRA_JUMPS = 1;
export const LIGHTNING_T4 = { chance: 0.1, damage: 15 } as const;
export const LIGHTNING_T6 = { every: 8, targets: 5, damage: 40 } as const;
export const BEAST_T4_SPEED_MULT = 1.1;
export const EARTH_T2_HP_MULT = 1.1;
export const EARTH_T4_TAKEN_MULT = 0.9;
export const EARTH_T4_RADIUS_MULT = 1.15;
export const EARTH_T6_JUNK_MULT = 2;
export const EARTH_T6_QUAKE = { every: 10, radiusTiles: 4, stunSeconds: 1 } as const;
export const SHADOW_T2 = { chance: 0.08, mult: 2 } as const;
export const SHADOW_T6 = { hpRatio: 0.3, untouchableSeconds: 3 } as const;

export function tierFor(count: number): SynergyTier {
  if (count >= 6) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  return 0;
}

/** Tag counts over owned skills, gift skills left out (skills_fusion §2). */
export function synergyCounts(state: GameState, skillDefs: readonly SkillDef[]): Record<SynergyTag, number> {
  const counts = Object.fromEntries(SYNERGY_TAGS.map((t) => [t, 0])) as Record<SynergyTag, number>;
  for (const owned of state.skills) {
    if (owned.gift) continue;
    const def = skillDefs.find((d) => d.id === owned.id);
    for (const tag of new Set(def?.tags ?? [])) {
      if ((SYNERGY_TAGS as readonly string[]).includes(tag)) counts[tag as SynergyTag] += 1;
    }
  }
  return counts;
}

export function synergyTiers(state: GameState, skillDefs: readonly SkillDef[]): Record<SynergyTag, SynergyTier> {
  const counts = synergyCounts(state, skillDefs);
  return Object.fromEntries(SYNERGY_TAGS.map((t) => [t, tierFor(counts[t])])) as Record<SynergyTag, SynergyTier>;
}

/** Damage multiplier a cast gets from synergy, before crits. */
export function synergyDamageMult(tiers: Record<SynergyTag, SynergyTier>, def: Pick<SkillDef, 'tags' | 'junk'>): number {
  let mult = 1;
  if (def.tags.includes('fire')) {
    if (tiers.fire >= 2) mult *= FIRE_T2_MULT;
    if (tiers.fire >= 6) mult *= FIRE_T6_MULT;
  }
  if (def.junk && tiers.earth >= 6) mult *= EARTH_T6_JUNK_MULT;
  return mult;
}

/** Player-facing one-liners for the HUD tooltip (no dev terms, D24). */
export const SYNERGY_TEXT_TH: Record<SynergyTag, Partial<Record<2 | 4 | 6, string>>> = {
  fire: { 2: 'สกิลไฟแรงขึ้น 20%', 4: 'มอนตายจากไฟระเบิดใส่รอบข้าง', 6: 'สกิลไฟแรงขึ้นอีก 40%' },
  ice: { 2: 'ทำให้มอนช้านานขึ้น 15%' },
  lightning: { 2: 'สายฟ้ากระโดดเพิ่ม 1 ตัว', 4: 'โจมตีมีลุ้นฟ้าผ่าซ้ำ', 6: 'ทุก 8 วิ ฟ้าผ่ามอน 5 ตัว' },
  beast: { 4: 'วิ่งเร็วขึ้น 10%' },
  earth: { 2: 'เลือดสูงสุด +10%', 4: 'โดนตีเบาลง 10% · วงโจมตีกว้างขึ้น', 6: 'สกิลขยะแรง ×2 · แผ่นดินไหวทุก 10 วิ' },
  shadow: { 2: 'บางครั้งตีแรง ×2', 6: 'คืนละครั้ง ไม่ตายเมื่อเลือดหมด' },
};
