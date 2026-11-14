import { describe, expect, it } from 'vitest';
import skillsFullData from '../src/data/skills_full.json';
import { validateSkills } from '../src/systems/skills';

describe('skills_full.json (18 starter skills + 10 recipes + 20 fused results)', () => {
  it('passes validateSkills() and has all 18 starter skills and 20 fused skills', () => {
    const allSkills = validateSkills(skillsFullData);
    const starters = allSkills.filter((s) => !s.fusedOnly);
    const fused = allSkills.filter((s) => s.fusedOnly);

    expect(starters).toHaveLength(18);
    expect(fused).toHaveLength(20);
    expect(starters.filter((s) => s.junk)).toHaveLength(6);
  });

  it('contains all 10 fusion recipes F01..F10 pointing to valid skill IDs', () => {
    const allIds = new Set(skillsFullData.skills.map((s) => s.id));
    expect(skillsFullData.fusions).toHaveLength(10);
    for (const f of skillsFullData.fusions) {
      expect(allIds.has(f.a)).toBe(true);
      expect(allIds.has(f.b)).toBe(true);
      expect(allIds.has(f.resultA)).toBe(true);
      expect(allIds.has(f.resultB)).toBe(true);
    }
  });
});
