import type { GameState } from '../core/state';
import { damageAtLevel, FUSION_MIN_LEVEL, ownedLevel, type FusionRecipe, type SkillDef } from '../systems/skills';
import { upgradeXp } from '../systems/progression';

export interface DraftCardViewModel {
  index: number;
  cardCode: string;
  kind: 'skill' | 'up' | 'fuse';
  titleTh: string;
  subtitleTh: string;
  rarity: string;
  tags: string[];
  alternateHintTh?: string;
}

export interface ShareCardSummary {
  titleTh: string;
  seed: string;
  mode: string;
  survivedNights: number;
  outcome: 'won' | 'lost';
  nightTrackEmojis: string;
  topSkillsTh: string[];
  shareUrl: string;
}

/**
 * Finds all available fusion cards (D1: 4th Draft card when player owns both skills at Lv >= 3).
 * Result follows higher-level source skill; tie breaks by which skill was acquired earlier in state.skills.
 */
export function findAvailableFusions(
  state: GameState,
  skills: readonly SkillDef[],
  recipes: readonly FusionRecipe[],
): {
  recipe: FusionRecipe;
  resultSkill: SkillDef;
  alternateSkill: SkillDef;
  skillToRaiseForAlternate: SkillDef;
}[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const ownedOrder = new Map(state.skills.map((o, idx) => [o.id, { owned: o, idx }]));
  const out: {
    recipe: FusionRecipe;
    resultSkill: SkillDef;
    alternateSkill: SkillDef;
    skillToRaiseForAlternate: SkillDef;
  }[] = [];

  for (const r of recipes) {
    const entryA = ownedOrder.get(r.a);
    const entryB = ownedOrder.get(r.b);
    const defA = byId.get(r.a);
    const defB = byId.get(r.b);
    if (!entryA || !entryB || !defA || !defB) continue;

    const lvA = ownedLevel(defA, entryA.owned.xp);
    const lvB = ownedLevel(defB, entryB.owned.xp);
    if (lvA < FUSION_MIN_LEVEL || lvB < FUSION_MIN_LEVEL) continue;

    const aWins = lvA > lvB || (lvA === lvB && entryA.idx < entryB.idx);
    const resultId = aWins ? r.resultA : r.resultB;
    const altId = aWins ? r.resultB : r.resultA;
    const raiseDef = aWins ? defB : defA;

    const resultSkill = byId.get(resultId);
    const alternateSkill = byId.get(altId);
    if (resultSkill && alternateSkill) {
      out.push({ recipe: r, resultSkill, alternateSkill, skillToRaiseForAlternate: raiseDef });
    }
  }
  return out;
}

/**
 * Formats Draft cards (3 standard cards + optional 4th Fusion card per D1) into UI-ready view models.
 */
export function formatDraftCardsForUI(
  state: GameState,
  cards: readonly string[],
  skills: readonly SkillDef[],
  recipes: readonly FusionRecipe[] = [],
): DraftCardViewModel[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const viewModels: DraftCardViewModel[] = [];

  cards.forEach((code, idx) => {
    const [kind, id] = code.split(':');
    if (kind === 'fuse') {
      const recipe = recipes.find((r) => r.id === id);
      const avail = findAvailableFusions(state, skills, recipes).find((f) => f.recipe.id === id);
      if (recipe && avail) {
        viewModels.push({
          index: idx,
          cardCode: code,
          kind: 'fuse',
          titleTh: `🔥 ผสมสกิล: ${avail.resultSkill.name.th}`,
          subtitleTh: `พลัง Lv3: ${damageAtLevel(avail.resultSkill, 3)} · ทุก ${avail.resultSkill.cooldown} วิ`,
          rarity: avail.resultSkill.rarity,
          tags: avail.resultSkill.tags,
          alternateHintTh: `อยากได้ "${avail.alternateSkill.name.th}" แทน? ดัน ${avail.skillToRaiseForAlternate.name.th} ให้เลเวลสูงกว่าก่อนผสม`,
        });
      }
      return;
    }

    const def = byId.get(id);
    if (!def) return;
    const owned = state.skills.find((o) => o.id === id);
    const curLv = owned ? ownedLevel(def, owned.xp) : 1;

    if (kind === 'skill') {
      viewModels.push({
        index: idx,
        cardCode: code,
        kind: 'skill',
        titleTh: def.name.th,
        subtitleTh:
          def.kind === 'active'
            ? `สกิลโจมตี · พลัง ${damageAtLevel(def, 1)} · ทุก ${def.cooldown} วิ · ระยะ ${def.range} ช่อง`
            : 'สกิลติดตัว · ถึกขึ้นและเสริมพลังเอาชีวิตรอด',
        rarity: def.rarity,
        tags: def.tags,
      });
    } else {
      viewModels.push({
        index: idx,
        cardCode: code,
        kind: 'up',
        titleTh: `ฝึก ${def.name.th} (Lv${curLv})`,
        subtitleTh: `ได้ค่าฝึกสกิล +${upgradeXp(curLv)} ทันที`,
        rarity: def.rarity,
        tags: def.tags,
      });
    }
  });

  return viewModels;
}

/**
 * Builds the End-of-Run Share Card data (GDD §11: Wordle-style 7-night emoji track + ?seed= challenge URL).
 */
export function buildShareCardSummary(
  state: GameState,
  skills: readonly SkillDef[],
  baseUrl = 'https://aofazlarn-dev.github.io/RiftRubbish/',
): ShareCardSummary {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const emojis: string[] = [];

  for (let night = 1; night <= 7; night++) {
    if (night < state.day) {
      emojis.push(night === 4 ? '🐺' : '🟩');
    } else if (night === state.day) {
      if (state.status === 'won') {
        emojis.push('👑');
      } else if (state.status === 'lost') {
        emojis.push('💀');
      } else {
        emojis.push('⚔️');
      }
    } else {
      emojis.push('⬛');
    }
  }

  const topSkillsTh = [...state.skills]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 4)
    .map((o) => {
      const def = byId.get(o.id);
      const lv = def ? ownedLevel(def, o.xp) : 1;
      return `${def?.name.th ?? o.id} Lv${lv}`;
    });

  return {
    titleTh:
      state.status === 'won'
        ? 'Rift & Rubbish — พิชิตจันทร์เลือดคืนที่ 7!'
        : `Rift & Rubbish — สิ้นชีพในคืนที่ ${state.day}/7`,
    seed: state.seed,
    mode: state.mode,
    survivedNights: state.status === 'won' ? 7 : Math.max(0, state.day - 1),
    outcome: state.status === 'won' ? 'won' : 'lost',
    nightTrackEmojis: emojis.join(''),
    topSkillsTh,
    shareUrl: `${baseUrl}?seed=${encodeURIComponent(state.seed)}`,
  };
}
