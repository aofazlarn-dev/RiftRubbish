import { describe, expect, it } from 'vitest';
import skillsData from '../src/data/skills.json';
import { createRun } from '../src/core/state';
import { canFuse, findRecipe, fuse, fusionOutcome } from '../src/systems/fusion';
import { validateSkills, type FusionRecipe } from '../src/systems/skills';

const skills = validateSkills(skillsData);
const recipes = (skillsData as unknown as { fusions: FusionRecipe[] }).fusions;

/** Skill XP for a given normal level (balance §2.1 thresholds). */
const XP_LV3 = 180;
const XP_LV2 = 50;

function runWith(entries: { id: string; xp: number }[]) {
  const s = createRun({ seed: 'fusion' });
  s.skills = entries.map((e) => ({ id: e.id, xp: e.xp, cooldownLeft: 0 }));
  return s;
}

describe('recipe lookup', () => {
  it('finds F05 in either order', () => {
    expect(findRecipe(recipes, 'E01', 'E02')?.id).toBe('F05');
    expect(findRecipe(recipes, 'E02', 'E01')?.id).toBe('F05');
  });

  it('returns null for a pair with no recipe', () => {
    expect(findRecipe(recipes, 'E01', 'W01')).toBeNull();
  });

  it('the shipped recipes point at fused results that exist', () => {
    const ids = new Set(skills.map((s) => s.id));
    for (const r of recipes) {
      expect(ids.has(r.resultA)).toBe(true);
      expect(ids.has(r.resultB)).toBe(true);
    }
  });
});

describe('fusion level rule', () => {
  it('needs both sources at Lv3 or higher', () => {
    const f05 = findRecipe(recipes, 'E01', 'E02')!;
    expect(canFuse(runWith([{ id: 'E01', xp: XP_LV3 }, { id: 'E02', xp: XP_LV3 }]), skills, f05)).toBe(true);
    expect(canFuse(runWith([{ id: 'E01', xp: XP_LV3 }, { id: 'E02', xp: XP_LV2 }]), skills, f05)).toBe(false);
  });

  it('a missing source blocks fusion', () => {
    const f05 = findRecipe(recipes, 'E01', 'E02')!;
    expect(canFuse(runWith([{ id: 'E01', xp: XP_LV3 }]), skills, f05)).toBe(false);
  });

  it('the higher level decides the result', () => {
    const f05 = findRecipe(recipes, 'E01', 'E02')!;
    const s = runWith([{ id: 'E01', xp: XP_LV2 }, { id: 'E02', xp: 420 }]); // E02 is Lv4
    expect(fusionOutcome(s, f05, 'E01')).toEqual({ resultId: 'R05b', fromId: 'E02' });
  });

  it('on a tie the source taken first decides', () => {
    const f05 = findRecipe(recipes, 'E01', 'E02')!;
    const s = runWith([{ id: 'E01', xp: XP_LV3 }, { id: 'E02', xp: XP_LV3 }]);
    expect(fusionOutcome(s, f05, 'E01').resultId).toBe('R05a');
    expect(fusionOutcome(s, f05, 'E02').resultId).toBe('R05b');
  });
});

describe('fuse', () => {
  it('replaces both sources with the result and keeps the higher Skill XP', () => {
    const s = runWith([{ id: 'E01', xp: XP_LV3 }, { id: 'E02', xp: 420 }]);
    const out = fuse(s, skills, recipes, 'E01', 'E02');
    expect(out?.resultId).toBe('R05b');
    expect(s.skills.map((x) => x.id)).toEqual(['R05b']);
    expect(s.skills[0].xp).toBe(420); // Lv4 inherited, so the result is Lv4 right away
  });

  it('returns null and changes nothing when a source is below Lv3', () => {
    const s = runWith([{ id: 'E01', xp: XP_LV2 }, { id: 'E02', xp: XP_LV3 }]);
    const before = JSON.stringify(s.skills);
    expect(fuse(s, skills, recipes, 'E01', 'E02')).toBeNull();
    expect(JSON.stringify(s.skills)).toBe(before);
  });

  it('a fused skill is capped at Lv7 and keeps the result kind', () => {
    const s = runWith([{ id: 'E01', xp: 1400 }, { id: 'E02', xp: XP_LV3 }]);
    fuse(s, skills, recipes, 'E01', 'E02');
    const def = skills.find((d) => d.id === s.skills[0].id)!;
    expect(def.fusedOnly).toBe(true);
    expect(def.kind).toBe('active');
  });

  it('a fused passive counts toward passive defence right away', () => {
    // F07 = Lava Rift (active, from W01) / Glacier Bulwark (passive, from W03).
    // W03 is the higher source (Lv4), so the passive result R07b is produced.
    const s = runWith([{ id: 'W01', xp: XP_LV3 }, { id: 'W03', xp: 420 }]);
    const out = fuse(s, skills, recipes, 'W01', 'W03');
    expect(out?.resultId).toBe('R07b');
    expect(s.player.damageReduction).toBeGreaterThan(0);
  });
});
