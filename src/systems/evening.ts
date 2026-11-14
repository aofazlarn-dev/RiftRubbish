/**
 * Evening rules: meals, the "hungry" debuff, and the one-of-three evening choice
 * (balance §6.2–6.3, D9, D18). Pure functions, no Phaser, no GameState.
 *
 * Not wired into the run yet: inventory, gathering and the evening UI come later.
 * Numbers are taken from balance.md; the "choice" rules that the doc leaves open
 * are noted where they are decided.
 */

export type Ingredient = 'grain' | 'mushroom' | 'water' | 'fish' | 'meat';
export type Inventory = Partial<Record<Ingredient, number>>;

/** Multipliers and flat bonuses a meal gives for one night. Missing fields mean "no change". */
export interface MealBuff {
  maxHpMult?: number;
  damageMult?: number;
  speedMult?: number;
  pickupRangeMult?: number;
  skillXpMult?: number;
  cooldownMult?: number;
  /** HP per second restored to the player during the night. */
  hpRegenPerSec?: number;
}

export interface MealDef {
  id: string;
  name: string;
  recipe: Inventory;
  buff: MealBuff;
}

/** balance §6.2: the five casual meals. Eat one per evening. */
export const MEALS: readonly MealDef[] = [
  { id: 'hard_bread', name: 'ขนมปังแข็งโป๊ก', recipe: { grain: 2 }, buff: { maxHpMult: 1.2 } },
  { id: 'monster_stew', name: 'สตูเนื้อมอน', recipe: { meat: 1, water: 1 }, buff: { damageMult: 1.15 } },
  {
    id: 'grilled_fish',
    name: 'ปลาย่างบ่อน้ำ',
    recipe: { fish: 1, water: 1 },
    buff: { speedMult: 1.12, pickupRangeMult: 1.4 },
  },
  { id: 'glow_mushroom_soup', name: 'ซุปเห็ดเรืองแสง', recipe: { mushroom: 2, water: 1 }, buff: { skillXpMult: 1.3 } },
  {
    id: 'otherworld_bento',
    name: 'ข้าวกล่องต่างโลก',
    recipe: { grain: 1, mushroom: 1, meat: 1 },
    buff: { damageMult: 1.08, cooldownMult: 0.92, hpRegenPerSec: 0.5 },
  },
];

/** balance §6.2: "หิวจนตาลาย" — a night without a meal. */
export const HUNGRY_DEBUFF: MealBuff = { damageMult: 0.85, speedMult: 0.9, hpRegenPerSec: 0 };

export function getMeal(id: string): MealDef {
  const meal = MEALS.find((m) => m.id === id);
  if (!meal) throw new Error(`Unknown meal: ${id}`);
  return meal;
}

/** True when the inventory holds every ingredient in the recipe. */
export function canCook(meal: MealDef, inv: Inventory): boolean {
  return (Object.keys(meal.recipe) as Ingredient[]).every((k) => (inv[k] ?? 0) >= (meal.recipe[k] ?? 0));
}

/**
 * Cooks one dish: returns the inventory with the recipe removed, or null if the
 * ingredients are missing. Never mutates the input.
 */
export function cook(meal: MealDef, inv: Inventory): Inventory | null {
  if (!canCook(meal, inv)) return null;
  const next: Inventory = { ...inv };
  for (const k of Object.keys(meal.recipe) as Ingredient[]) {
    next[k] = (inv[k] ?? 0) - (meal.recipe[k] ?? 0);
  }
  return next;
}

export type EveningChoiceId = 'fence' | 'trap' | 'overtime';

/** balance §6.3: rules for the three evening choices. */
export const TRAP_COUNT = 6;
export const TRAP_RADIUS_TILES = 4;
export const TRAP_USES = 3;
export const TRAP_ENEMY_STUN_SEC = 2;
export const TRAP_PLAYER_STUN_SEC = 1.5;
export const FENCE_SHIELD_RATIO = 0.3;
export const OVERTIME_SHARD_MULT = 1.2;
/** Overtime opens from the evening of this day (balance §6.3). */
export const OVERTIME_FIRST_DAY = 4;

export interface EveningContext {
  day: number;
  /** Cooked dishes in stock, not counting tonight's meal. Fence costs one. */
  spareMeals: number;
  /** Overtime can be picked once per run. */
  overtimeUsed: boolean;
}

/**
 * Which evening choices can be picked now. The doc says "1 จาก 3" but not what happens when
 * a choice is impossible, so this decides: fence needs a spare dish; trap is always free;
 * overtime needs day 4+ and not used yet.
 */
export function availableChoices(ctx: EveningContext): EveningChoiceId[] {
  const out: EveningChoiceId[] = [];
  if (ctx.spareMeals >= 1) out.push('fence');
  out.push('trap');
  if (ctx.day >= OVERTIME_FIRST_DAY && !ctx.overtimeUsed) out.push('overtime');
  return out;
}

/** Core shield for the night after picking the fence: 30% of Max HP, lost before the core itself (D9). */
export function fenceShieldHp(coreMaxHp: number): number {
  return Math.round(coreMaxHp * FENCE_SHIELD_RATIO);
}

/** Overtime is a skipped meal, so it always brings the hungry debuff for that night. */
export function choiceSkipsMeal(choice: EveningChoiceId): boolean {
  return choice === 'overtime';
}

/** Soul Shard payout at the end of the run. Overtime adds +20% to the whole run; applied after win/lose multipliers. */
export function finalShards(baseShards: number, overtimeChosen: boolean): number {
  return Math.floor(baseShards * (overtimeChosen ? OVERTIME_SHARD_MULT : 1));
}

/** Items gathered each dawn: 5–7 per day (balance §6.2). Meat only drops from kills, so it is not gathered. */
export const GATHER_BASE = 5;
export const GATHER_EXTRA_MAX = 2;
export const GATHER_KINDS: readonly Ingredient[] = ['grain', 'mushroom', 'water', 'fish'];

/** Adds one day of gathering. Uses a seeded stream (`loot`), so runs stay repeatable. */
export function gatherDay(inv: Inventory, rng: { pick<T>(items: readonly T[]): T; next(): number }): Inventory {
  const count = GATHER_BASE + Math.floor(rng.next() * (GATHER_EXTRA_MAX + 1));
  const next: Inventory = { ...inv };
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(GATHER_KINDS);
    next[kind] = (next[kind] ?? 0) + 1;
  }
  return next;
}

/**
 * Meal the game cooks when the player has not chosen one: the best affordable meal first.
 * This stands in for the evening choice UI, which is not built yet.
 */
const AUTO_MEAL_ORDER = ['otherworld_bento', 'monster_stew', 'grilled_fish', 'glow_mushroom_soup', 'hard_bread'];

export interface EveningResult {
  inventory: Inventory;
  /** Buff for the coming night: the meal's buff, or the hungry debuff if nothing could be cooked. */
  buff: MealBuff;
  mealId: string | null;
}

/** Cooks the evening meal from stock. Returns the buff for the night (hungry if no meal). */
export function eveningMeal(inv: Inventory): EveningResult {
  for (const id of AUTO_MEAL_ORDER) {
    const meal = getMeal(id);
    const after = cook(meal, inv);
    if (after) return { inventory: after, buff: meal.buff, mealId: id };
  }
  return { inventory: inv, buff: HUNGRY_DEBUFF, mealId: null };
}
