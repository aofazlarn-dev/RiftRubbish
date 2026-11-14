/** R6: every meal buff from balance §6.2 does something in the game (Gap round 2 follow-up). */
import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun } from '../src/core/state';
import { loadRunData } from '../src/data';
import { applyPassives, tickSurvival } from '../src/systems/base';
import { tickSkills } from '../src/systems/combat';
import { getMeal } from '../src/systems/evening';
import { findDef, spawnMonster } from '../src/systems/monsters';

const data = loadRunData();

function night(buffMeal?: string) {
  const s = createRun({ seed: 'meal' });
  s.phase = 'night';
  s.monsters = [];
  s.skills = [{ id: 'E01', xp: 0, cooldownLeft: 0 }];
  if (buffMeal) s.nightBuff = getMeal(buffMeal).buff;
  applyPassives(s, data.skills);
  return s;
}

function castOnce(s: ReturnType<typeof night>) {
  const m = spawnMonster(s, findDef(data.monsters, 'golem'), s.player.x + 40, s.player.y);
  m.hp = m.maxHp = 100000;
  tickSkills(s, 0.01, data.skills, data.monsters, RunRng.fromSeed('meal').get('combat'));
}

describe('R6: meal buffs apply', () => {
  it('hard bread: Max HP +20% for the night', () => {
    expect(night().player.maxHp).toBe(100);
    expect(night('hard_bread').player.maxHp).toBe(120);
  });

  it('mushroom soup: Skill XP +30%', () => {
    const plain = night();
    castOnce(plain);
    const soup = night('glow_mushroom_soup');
    castOnce(soup);
    expect(soup.skills[0].xp / plain.skills[0].xp).toBeCloseTo(1.3, 5);
  });

  it('bento: cooldown −8% and 0.5 HP/s regen', () => {
    const plain = night();
    castOnce(plain);
    const bento = night('otherworld_bento');
    castOnce(bento);
    expect(bento.skills[0].cooldownLeft / plain.skills[0].cooldownLeft).toBeCloseTo(0.92, 5);
    bento.player.hp = 50;
    tickSurvival(bento, 2);
    expect(bento.player.hp).toBeCloseTo(51, 5);
  });
});
