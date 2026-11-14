/**
 * Affix rules (balance §4). Pure functions, no Phaser, no GameState.
 *
 * Not wired into combat yet: the slice still folds every affix into +50% HP (monsters.ts).
 * Wiring these in changes the balance numbers, so that step needs the owner's go-ahead.
 */

export type AffixId = 'rush' | 'junk_shield' | 'burst' | 'resist_choice' | 'pack_leader';

export interface AffixDef {
  id: AffixId;
  name: string;
  /** One-line effect from balance §4. */
  effect: string;
}

/** balance §4 table, in its order. */
export const AFFIXES: readonly AffixDef[] = [
  { id: 'rush', name: 'เร่งรีบ', effect: 'ความเร็ว +40%' },
  { id: 'junk_shield', name: 'เกราะขยะ', effect: 'โล่ = 50% ของ HP, โล่ฟื้นเต็มถ้าไม่โดนตี 5 วิ' },
  { id: 'burst', name: 'ระเบิดตอนตาย', effect: 'ตายแล้วระเบิดหลัง 1.0 วิ r=64 px' },
  { id: 'resist_choice', name: 'ต้านทางเลือก', effect: 'ต้าน 50% ต่อธาตุที่ผู้เล่นมีมากที่สุดตอนเกิด' },
  { id: 'pack_leader', name: 'จ่าฝูง', effect: 'ออร่า r=96 px: มอนรอบตัว ความเร็ว +20%, ดาเมจ +20%' },
];

/** Monsters with an affix are 20% larger; XP ×2 is in monsters.ts (AFFIX_XP_MULTIPLIER). */
export const AFFIX_SIZE_MULT = 1.2;

export const RUSH_SPEED_MULT = 1.4;
export const JUNK_SHIELD_RATIO = 0.5;
export const JUNK_SHIELD_REGEN_AFTER_SEC = 5;
export const BURST_DELAY_SEC = 1.0;
export const BURST_RADIUS_PX = 64;
export const BURST_PLAYER_DAMAGE = 12;
export const BURST_CORE_DAMAGE = 20;
export const RESIST_CHOICE_RATIO = 0.5;
/** Affix resistance may not push the total above this (balance §4 "กันหงุดหงิด"). */
export const RESIST_TOTAL_CAP = 0.75;
export const LEADER_AURA_RADIUS_PX = 96;
export const LEADER_AURA_SPEED_MULT = 1.2;
export const LEADER_AURA_DAMAGE_MULT = 1.2;

export function getAffix(id: AffixId): AffixDef {
  const a = AFFIXES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown affix: ${id}`);
  return a;
}

/** Junk shield pool: 50% of the monster's max HP, which must be hit off before the body. */
export function junkShieldHp(maxHp: number): number {
  return Math.round(maxHp * JUNK_SHIELD_RATIO);
}

/** Damage hits the shield first, then HP. Returns the new values; never mutates the input. */
export function applyDamageWithShield(
  shield: number,
  hp: number,
  damage: number,
): { shield: number; hp: number } {
  const onShield = Math.min(shield, damage);
  const rest = damage - onShield;
  return { shield: shield - onShield, hp: Math.max(0, hp - rest) };
}

/**
 * Resistance from the Resist-by-choice affix. It matches the tag the player has the most of
 * when the monster spawns. A tie is broken by pickTie (the caller passes a seeded RNG pick).
 */
export function dominantTag(counts: Record<string, number>, pickTie: (tags: string[]) => string): string | null {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  const best = Math.max(...entries.map(([, n]) => n));
  const tied = entries.filter(([, n]) => n === best).map(([t]) => t).sort();
  return tied.length === 1 ? tied[0] : pickTie(tied);
}

/** Affix resistance against one damage tag (0 or RESIST_CHOICE_RATIO). */
export function resistChoiceFor(damageTag: string, dominant: string | null): number {
  return dominant !== null && damageTag === dominant ? RESIST_CHOICE_RATIO : 0;
}

/** Total resistance: innate + affix, capped so the affix never makes a monster immune-like. */
export function combinedResist(innate: number, affix: number): number {
  return Math.min(RESIST_TOTAL_CAP, innate + affix);
}

/** A burst only hits when it is not itself caused by another burst (balance §4: no chains). */
export function burstCanHit(sourceIsBurst: boolean): boolean {
  return !sourceIsBurst;
}

/** Aura is non-stacking: a monster in range of any leader gets the bonus once. */
export function inLeaderAura(distancePx: number, leaderCount: number): boolean {
  return leaderCount > 0 && distancePx <= LEADER_AURA_RADIUS_PX;
}
