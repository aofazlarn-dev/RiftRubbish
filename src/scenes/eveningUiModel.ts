/**
 * Pure UI model for the G3 Evening Overlay (GDD §4, D9, D18, D24).
 * Kept free of Phaser so it can be unit-tested in Vitest alongside evening.ts.
 */

import {
  availableChoices,
  canCook,
  choiceSkipsMeal,
  cook,
  fenceShieldHp,
  HUNGRY_DEBUFF,
  MEALS,
  OVERTIME_FIRST_DAY,
  type EveningChoiceId,
  type Ingredient,
  type Inventory,
  type MealBuff,
  type MealDef,
} from '../systems/evening';

export const INGREDIENT_LABEL_TH: Record<Ingredient, string> = {
  grain: 'ธัญพืช',
  mushroom: 'เห็ด',
  water: 'น้ำ',
  fish: 'ปลา',
  meat: 'เนื้อ',
};

export interface MealOption {
  meal: MealDef;
  affordable: boolean;
  recipeText: string;
  buffText: string;
}

export interface EveningChoiceCard {
  id: EveningChoiceId;
  titleTh: string;
  costTh: string;
  effectTh: string;
  enabled: boolean;
  lockedReasonTh?: string;
}

export interface EveningOffer {
  inventorySummary: string;
  meals: MealOption[];
  choices: EveningChoiceCard[];
  hungryBuffText: string;
}

export function formatInventorySummary(inv: Inventory): string {
  const parts = (Object.keys(INGREDIENT_LABEL_TH) as Ingredient[])
    .filter((k) => (inv[k] ?? 0) > 0)
    .map((k) => `${INGREDIENT_LABEL_TH[k]} ${inv[k]}`);
  return parts.length > 0 ? parts.join(' · ') : 'ไม่มีวัตถุดิบ';
}

export function formatMealRecipe(meal: MealDef): string {
  return (Object.keys(meal.recipe) as Ingredient[])
    .map((k) => `${INGREDIENT_LABEL_TH[k]} ×${meal.recipe[k]}`)
    .join(' + ');
}

export function formatMealBuff(buff: MealBuff): string {
  const parts: string[] = [];
  if (buff.maxHpMult !== undefined && buff.maxHpMult !== 1) {
    const pct = Math.round((buff.maxHpMult - 1) * 100);
    parts.push(`เลือดสูงสุด ${pct > 0 ? '+' : ''}${pct}%`);
  }
  if (buff.damageMult !== undefined && buff.damageMult !== 1) {
    const pct = Math.round((buff.damageMult - 1) * 100);
    parts.push(`ดาเมจ ${pct > 0 ? '+' : ''}${pct}%`);
  }
  if (buff.speedMult !== undefined && buff.speedMult !== 1) {
    const pct = Math.round((buff.speedMult - 1) * 100);
    parts.push(`ความเร็ว ${pct > 0 ? '+' : ''}${pct}%`);
  }
  if (buff.pickupRangeMult !== undefined && buff.pickupRangeMult !== 1) {
    const pct = Math.round((buff.pickupRangeMult - 1) * 100);
    parts.push(`ระยะเก็บของ +${pct}%`);
  }
  if (buff.skillXpMult !== undefined && buff.skillXpMult !== 1) {
    const pct = Math.round((buff.skillXpMult - 1) * 100);
    parts.push(`XP สกิล +${pct}%`);
  }
  if (buff.cooldownMult !== undefined && buff.cooldownMult !== 1) {
    const pct = Math.round((buff.cooldownMult - 1) * 100);
    parts.push(`คูลดาวน์ ${pct}%`);
  }
  if (buff.hpRegenPerSec !== undefined && buff.hpRegenPerSec > 0) {
    parts.push(`ฟื้นเลือด +${buff.hpRegenPerSec}/วิ`);
  }
  return parts.join(' · ');
}

/** Counts how many times a player can still cook at least one dish from `inv`. */
export function countCookableDishes(inv: Inventory): number {
  let left: Inventory = { ...inv };
  let count = 0;
  // Greedy pass from simplest recipe (hard_bread / grilled_fish / etc.) to count spare meals.
  for (;;) {
    const cookable = MEALS.find((m) => canCook(m, left));
    if (!cookable) break;
    const next = cook(cookable, left);
    if (!next) break;
    left = next;
    count++;
  }
  return count;
}

export function buildEveningOffer(
  inv: Inventory,
  day: number,
  coreMaxHp: number,
  overtimeUsed: boolean,
  selectedMealId: string | null,
): EveningOffer {
  const afterMealInv =
    selectedMealId !== null
      ? (cook(
          MEALS.find((m) => m.id === selectedMealId) ?? MEALS[0],
          inv,
        ) ?? inv)
      : inv;
  const spareMeals = countCookableDishes(afterMealInv);
  const allowed = new Set(availableChoices({ day, spareMeals, overtimeUsed }));
  const shieldHp = fenceShieldHp(coreMaxHp);

  const choices: EveningChoiceCard[] = [
    {
      id: 'fence',
      titleTh: 'รั้วขยะ',
      costTh: 'ราคา: อาหารสำรอง 1 จาน',
      effectTh: `แกนฐานได้โล่ +30% (${shieldHp} HP) คืนนี้`,
      enabled: allowed.has('fence'),
      lockedReasonTh: allowed.has('fence') ? undefined : 'ต้องมีวัตถุดิบทำอาหารสำรองเหลืออีก 1 จาน',
    },
    {
      id: 'trap',
      titleTh: 'กับดักสะดุดล้ม',
      costTh: 'ราคา: ฟรี',
      effectTh: 'วางกับดัก 6 จุด: มอนล้ม 2 วิ (เราก็ล้มได้ 1.5 วิ)',
      enabled: allowed.has('trap'),
    },
    {
      id: 'overtime',
      titleTh: 'ทำโอทีกะดึก',
      costTh: 'ราคา: อดมื้อเย็นคืนนี้ (ติดหิวจนตาลาย)',
      effectTh: 'Soul Shard ทั้งรอบ +20% (ใช้ได้ครั้งเดียว/รอบ)',
      enabled: allowed.has('overtime'),
      lockedReasonTh: overtimeUsed
        ? 'ใช้ไปแล้วในรอบนี้'
        : day < OVERTIME_FIRST_DAY
          ? `เปิดตั้งแต่เย็นวันที่ ${OVERTIME_FIRST_DAY}`
          : undefined,
    },
  ];

  return {
    inventorySummary: formatInventorySummary(inv),
    meals: MEALS.map((meal) => ({
      meal,
      affordable: canCook(meal, inv),
      recipeText: formatMealRecipe(meal),
      buffText: formatMealBuff(meal.buff),
    })),
    choices,
    hungryBuffText: formatMealBuff(HUNGRY_DEBUFF),
  };
}

export function resolveEveningSelection(
  inv: Inventory,
  selectedMealId: string | null,
  choiceId: EveningChoiceId,
): { inventory: Inventory; buff: MealBuff; usedOvertime: boolean } {
  if (choiceSkipsMeal(choiceId)) {
    return { inventory: { ...inv }, buff: HUNGRY_DEBUFF, usedOvertime: true };
  }

  let nextInv: Inventory = { ...inv };
  let buff: MealBuff = HUNGRY_DEBUFF;

  if (selectedMealId) {
    const meal = MEALS.find((m) => m.id === selectedMealId);
    if (meal) {
      const cooked = cook(meal, nextInv);
      if (cooked) {
        nextInv = cooked;
        buff = meal.buff;
      }
    }
  }

  if (choiceId === 'fence') {
    const spare = MEALS.find((m) => canCook(m, nextInv));
    if (spare) {
      nextInv = cook(spare, nextInv) ?? nextInv;
    }
  }

  return { inventory: nextInv, buff, usedOvertime: false };
}
