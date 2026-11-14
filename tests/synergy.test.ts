/** Gap round 2 R4: synergy tiers change the game (GDD §6, skills_fusion §2). */
import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun, type GameState } from '../src/core/state';
import { loadRunData } from '../src/data';
import { applyPassives, damagePlayer } from '../src/systems/base';
import { tickSkills } from '../src/systems/combat';
import { findDef, spawnMonster } from '../src/systems/monsters';
import { SKILL_XP_THRESHOLDS } from '../src/systems/skills';
import { synergyCounts, synergyTiers, tierFor } from '../src/systems/synergy';

const data = loadRunData();

function owning(ids: string[], gift: string[] = []): GameState {
  const s = createRun({ seed: 'syn' });
  s.phase = 'night';
  s.monsters = [];
  s.skills = [
    ...ids.map((id) => ({ id, xp: SKILL_XP_THRESHOLDS[1], cooldownLeft: 0 })),
    ...gift.map((id) => ({ id, xp: 0, cooldownLeft: 0, gift: true })),
  ];
  applyPassives(s, data.skills);
  return s;
}

/** Damage one cast of `id` deals to a tough golem, with the other owned skills set as given. */
function oneCast(cast: string, others: string[], seed = 'dmg'): number {
  const s = owning([cast, ...others]);
  for (const o of s.skills) if (o.id !== cast) o.cooldownLeft = 999;
  const golem = spawnMonster(s, findDef(data.monsters, 'golem'), s.player.x + 30, s.player.y);
  golem.hp = golem.maxHp = 100000;
  golem.affix = false;
  golem.resistTag = null;
  tickSkills(s, 0.01, data.skills, data.monsters, RunRng.fromSeed(seed).get('combat'));
  return 100000 - golem.hp;
}

describe('R4: synergy', () => {
  it('tiers at 2 / 4 / 6; tutorial gift skills do not count', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(tierFor)).toEqual([0, 2, 2, 4, 4, 6, 6]);
    const s = owning(['J01'], ['J02', 'J03']);
    expect(synergyCounts(s, data.skills).earth).toBe(1);
    expect(synergyTiers(s, data.skills).earth).toBe(0);
  });

  it('earth 2: Max HP +10%; earth 4: damage taken −10%', () => {
    expect(owning(['J01']).player.maxHp).toBe(100);
    expect(owning(['J01', 'J03']).player.maxHp).toBe(110);
    const four = owning(['J01', 'J03', 'J02', 'S03']);
    expect(four.synergy?.earth).toBe(4);
    const hp = four.player.hp;
    damagePlayer(four, 10);
    expect(hp - four.player.hp).toBeCloseTo(9, 5);
  });

  it('fire 2: fire skills hit 20% harder; non-fire skills unchanged', () => {
    const lone = oneCast('E01', []);
    const paired = oneCast('E01', ['J04']); // J04 = fire passive
    expect(paired / lone).toBeCloseTo(1.2, 5);
    expect(oneCast('J01', ['J04', 'E01'])).toBe(oneCast('J01', []));
    expect(oneCast('J01', [])).toBeGreaterThan(0);
  });

  it('earth 6: junk skills deal ×2', () => {
    const base = oneCast('J01', ['J03', 'J02', 'S03', 'W03']); // earth 5
    const six = oneCast('J01', ['J03', 'J02', 'S03', 'W03', 'R01b']); // earth 6
    expect(base).toBeGreaterThan(0);
    expect(six / base).toBeCloseTo(2, 5);
  });

  it('lightning 2: chains jump one more target', () => {
    const hitCount = (others: string[]) => {
      const s = owning(['E03', ...others]);
      for (const o of s.skills) if (o.id !== 'E03') o.cooldownLeft = 999;
      for (let i = 0; i < 8; i++) {
        const m = spawnMonster(s, findDef(data.monsters, 'golem'), s.player.x + 30 + i * 20, s.player.y);
        m.hp = m.maxHp = 100000;
      }
      tickSkills(s, 0.01, data.skills, data.monsters, RunRng.fromSeed('chain').get('combat'));
      return s.monsters.filter((m) => m.hp < 100000).length;
    };
    expect(hitCount(['S02'])).toBe(hitCount([]) + 1); // S02 carries lightning
  });

  it('shadow 6: once per night a killing hit leaves 30% HP', () => {
    const s = owning(['W02', 'W04', 'S04', 'J06', 'R06b', 'R09b']);
    expect(s.synergy?.shadow).toBe(6);
    s.player.hp = 5;
    damagePlayer(s, 50);
    expect(s.player.hp).toBe(Math.round(s.player.maxHp * 0.3));
    expect(s.respawnIn).toBe(0);
    s.invulnLeft = 0;
    s.player.hp = 5;
    damagePlayer(s, 50);
    expect(s.player.hp).toBe(0); // only once per night
  });

  it('earth 6: every 10 s the quake stuns monsters within 4 tiles', () => {
    const s = owning(['J01', 'J02', 'J03', 'S03', 'W03', 'R01b']);
    for (const o of s.skills) o.cooldownLeft = 999;
    const near = spawnMonster(s, findDef(data.monsters, 'golem'), s.player.x + 60, s.player.y);
    const rng = RunRng.fromSeed('quake').get('combat');
    tickSkills(s, 9.9, data.skills, data.monsters, rng);
    expect(near.stunLeft ?? 0).toBe(0);
    tickSkills(s, 0.2, data.skills, data.monsters, rng);
    expect(near.stunLeft).toBe(1);
  });
});
