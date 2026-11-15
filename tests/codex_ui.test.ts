import { describe, expect, it } from 'vitest';
import skillsFullJson from '../src/data/skills_full.json';
import { createRun } from '../src/core/state';
import {
  buildCodexEntries,
  buildDraftCardHint,
  buildSynergyHudBadges,
  formatSynergyHudLine,
} from '../src/scenes/codexUiModel';
import type { FusionRecipe, SkillDef } from '../src/systems/skills';

const SKILLS = skillsFullJson.skills as SkillDef[];
const RECIPES = skillsFullJson.fusions as FusionRecipe[];

describe('codexUiModel (R4 Synergy HUD + G6 Fusion Codex)', () => {
  it('builds R4 Synergy HUD badges/tooltips with 2/4/6 tiers from SYNERGY_TEXT_TH and excludes gift skills', () => {
    const s = createRun({ seed: 'syn-ui-1', mode: 'casual' });
    s.skills = [
      { id: 'W01', xp: 0, cooldownLeft: 0 }, // earth + fire
      { id: 'E01', xp: 0, cooldownLeft: 0 }, // fire -> fire tier 2
      { id: 'J02', xp: 0, cooldownLeft: 0, gift: true }, // earth gift must NOT count
      { id: 'J03', xp: 0, cooldownLeft: 0, gift: true }, // earth gift must NOT count
    ];
    s.synergy = { fire: 2, ice: 0, lightning: 0, beast: 0, earth: 0, shadow: 0 };

    const badges = buildSynergyHudBadges(s, SKILLS);
    expect(badges.map((b) => [b.tag, b.count, b.tier])).toEqual([
      ['fire', 2, 2],
      ['earth', 1, 0], // gifts excluded -> remains 1, not 3
    ]);
    expect(badges[0].chipTextTh).toContain('ขั้น 2');
    expect(badges[0].tooltipTh).toContain('สกิลไฟแรงขึ้น 20%');
    expect(badges[0].tooltipTh).toContain('✔ ครบ 2');
    expect(badges[0].tooltipTh).not.toMatch(/Active|Passive|stack|aura|DPS|crit/i);

    const line = formatSynergyHudLine(s, SKILLS);
    expect(line).toContain('ไฟ(2)');
    expect(line).toContain('สกิลไฟแรงขึ้น 20%');
  });

  it('shows draft card hints for unlocking a Synergy tier and highlighting fusion partners', () => {
    const s = createRun({ seed: 'draft-hint-1', mode: 'casual' });
    s.skills = [
      { id: 'J02', xp: 20, cooldownLeft: 0 }, // earth (1)
      { id: 'J04', xp: 20, cooldownLeft: 0 }, // fire (1)
    ];

    const hintJ03 = buildDraftCardHint('J03', s, SKILLS, RECIPES);
    expect(hintJ03.tagsLineTh).toContain('ปลดดินขั้น 2');
    expect(hintJ03.fusionLineTh).toContain('คู่ผสมที่มีแล้ว');
    expect(hintJ03.fusionLineTh).toContain('สะดุดล้ม');

    const hintNew = buildDraftCardHint('E01', s, SKILLS, RECIPES);
    expect(hintNew.tagsLineTh).toContain('ปลดไฟขั้น 2');
  });

  it('lists all 10 fusion recipes and 6 synergy tags in Codex entries with ready/missing Core states', () => {
    const s = createRun({ seed: 'codex-1', mode: 'casual' });
    s.cores = 0;
    s.skills = [
      { id: 'J02', xp: 180, cooldownLeft: 0 }, // Lv3 (SKILL_XP_THRESHOLDS[3] = 180)
      { id: 'J03', xp: 180, cooldownLeft: 0 }, // Lv3 -> F01 ready!
    ];

    const codex = buildCodexEntries(s, SKILLS, RECIPES);
    expect(codex.recipes).toHaveLength(10);
    expect(codex.synergies).toHaveLength(6);

    const f01 = codex.recipes.find((r) => r.id === 'F01');
    expect(f01?.readyToFuse).toBe(true);
    expect(f01?.statusLabelTh).toBe('✨ พร้อมผสม!');

    const f09 = codex.recipes.find((r) => r.id === 'F09');
    expect(f09?.requiresCore).toBe(true);
  });
});
