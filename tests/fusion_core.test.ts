/** Gap round 2 R3: Fusion Core can be spent (GDD §7 rule 4, D3, D14, D17). */
import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun } from '../src/core/state';
import { loadRunData } from '../src/data';
import skillsFull from '../src/data/skills_full.json';
import { tickSkills } from '../src/systems/combat';
import { canBoostWithCore, canFuse, fuse } from '../src/systems/fusion';
import { findDef, spawnMonster } from '../src/systems/monsters';
import { boostedRarity, coreBoostMult, SKILL_XP_THRESHOLDS, type FusionRecipe } from '../src/systems/skills';

const data = loadRunData();
const recipes = skillsFull.fusions as FusionRecipe[];
const lv = (n: number) => SKILL_XP_THRESHOLDS[n];

function withSkills(ids: string[], cores: number) {
  const s = createRun({ seed: 'core' });
  s.skills = ids.map((id) => ({ id, xp: lv(3), cooldownLeft: 0 }));
  s.cores = cores;
  return s;
}

describe('R3: Fusion Core', () => {
  it('+1 rarity stops at Legendary; Epic → Legendary ≈ ×1.21 (D17)', () => {
    expect(boostedRarity('epic', 1)).toBe('legendary');
    expect(boostedRarity('legendary', 1)).toBe('legendary');
    expect(boostedRarity('mythic', 1)).toBe('mythic');
    expect(coreBoostMult('epic', 1)).toBeCloseTo(1.207, 2);
    expect(coreBoostMult('epic', 0)).toBe(1);
  });

  it('a plain fusion keeps the Core; useCore spends one and marks the result', () => {
    const plain = withSkills(['J03', 'J02'], 1);
    fuse(plain, data.skills, recipes, 'J03', 'J02');
    expect(plain.cores).toBe(1);
    expect(plain.skills.find((s) => s.id === 'R01a')?.rarityBoost).toBeUndefined();

    const boosted = withSkills(['J03', 'J02'], 1);
    expect(fuse(boosted, data.skills, recipes, 'J03', 'J02', true)?.resultId).toBe('R01a');
    expect(boosted.cores).toBe(0);
    expect(boosted.skills.find((s) => s.id === 'R01a')?.rarityBoost).toBe(1);
  });

  it('useCore with no Core, or on a Legendary result, changes nothing', () => {
    const none = withSkills(['J03', 'J02'], 0);
    fuse(none, data.skills, recipes, 'J03', 'J02', true);
    expect(none.skills.find((s) => s.id === 'R01a')?.rarityBoost).toBeUndefined();

    const legend = withSkills(['J03', 'E03'], 1); // F10 → Legendary
    const f10 = recipes.find((r) => r.id === 'F10')!;
    expect(canBoostWithCore(legend, data.skills, f10, 'R10a')).toBe(false);
    fuse(legend, data.skills, recipes, 'J03', 'E03', true);
    expect(legend.cores).toBe(1);
  });

  it('the Mythic recipe F09 needs a Core and always takes it', () => {
    const f09 = recipes.find((r) => r.id === 'F09')!;
    const broke = withSkills(['W04', 'S04'], 0);
    expect(canFuse(broke, data.skills, f09)).toBe(false);
    expect(fuse(broke, data.skills, recipes, 'W04', 'S04')).toBeNull();

    const rich = withSkills(['W04', 'S04'], 1);
    expect(canFuse(rich, data.skills, f09)).toBe(true);
    expect(fuse(rich, data.skills, recipes, 'W04', 'S04')).not.toBeNull();
    expect(rich.cores).toBe(0);
  });

  it('a boosted skill hits harder in combat by the same ratio', () => {
    const hit = (boost?: number) => {
      const s = createRun({ seed: 'hit' });
      s.phase = 'night';
      s.skills = [{ id: 'J03', xp: lv(3), cooldownLeft: 0, ...(boost ? { rarityBoost: boost } : {}) }];
      s.monsters = [];
      const golem = spawnMonster(s, findDef(data.monsters, 'golem'), s.player.x + 40, s.player.y);
      golem.hp = golem.maxHp = 100000;
      tickSkills(s, 0.01, data.skills, data.monsters, RunRng.fromSeed('hit').get('combat'));
      return 100000 - golem.hp;
    };
    const base = hit();
    const boosted = hit(1);
    expect(base).toBeGreaterThan(0);
    // J03 is Common: +1 → Rare = ×1.2
    expect(boosted / base).toBeCloseTo(1.2, 2);
  });
});
