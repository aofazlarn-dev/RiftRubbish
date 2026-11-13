import { describe, expect, it } from 'vitest';
import monstersData from '../src/data/monsters.json';
import wavesData from '../src/data/waves.json';
import { RunRng } from '../src/core/rng';
import { BOSS_ENRAGE_SECONDS, bossCcDuration, bossStats, createBoss, damageBoss, tickBoss } from '../src/systems/boss';
import { buildNightSpawns, waveForNight, waveTotalHp, type MonsterDef, type WavesData } from '../src/systems/waves';

const monsters = monstersData.monsters as MonsterDef[];
const waves = wavesData as WavesData;
const combat = (seed: string) => RunRng.fromSeed(seed).get('combat');

describe('wave data (balance §5.1)', () => {
  it('raw HP per night matches the balance table', () => {
    const expected = [448, 952, 1382, 1480, 2502, 3032, 2300];
    for (let night = 1; night <= 7; night++) {
      expect(waveTotalHp(waveForNight(waves, night), monsters)).toBe(expected[night - 1]);
    }
  });

  it('monster counts per night match the balance table', () => {
    const expected = [40, 60, 76, 59, 74, 80, 50];
    waves.nights.forEach((n, i) => {
      expect(Object.values(n.spawns).reduce((a, b) => a + b, 0)).toBe(expected[i]);
    });
  });

  it('every night keeps at least 2 monster types with no resistance (balance §3.1)', () => {
    for (const n of waves.nights) {
      const free = Object.keys(n.spawns).filter(
        (id) => Object.keys(monsters.find((m) => m.id === id)!.resist).length === 0,
      );
      // Night 7's background wave has only goblins without resistance; the boss itself resists nothing.
      expect(free.length).toBeGreaterThanOrEqual(n.night === 7 ? 1 : 2);
    }
  });
});

describe('spawn schedule', () => {
  it('nights 1–6 spawn 30% / 40% / 30% and nothing in the last 5 seconds', () => {
    const spawns = buildNightSpawns(waveForNight(waves, 3), combat('s'));
    expect(spawns).toHaveLength(76);
    const inRange = (a: number, b: number) => spawns.filter((s) => s.t >= a && s.t < b).length;
    expect(inRange(0, 10)).toBe(22);
    expect(inRange(10, 25)).toBe(30);
    expect(inRange(25, 35)).toBe(24);
    expect(inRange(35, 40)).toBe(0);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = buildNightSpawns(waveForNight(waves, 2), combat('same'));
    const b = buildNightSpawns(waveForNight(waves, 2), combat('same'));
    const c = buildNightSpawns(waveForNight(waves, 2), combat('other'));
    expect(a).toEqual(b);
    expect(a.map((s) => s.monsterId)).not.toEqual(c.map((s) => s.monsterId));
  });

  it('night 7 trickles one monster every 1.8 s within the first 90 s', () => {
    const spawns = buildNightSpawns(waveForNight(waves, 7), combat('boss'));
    expect(spawns).toHaveLength(50);
    expect(spawns[1].t - spawns[0].t).toBeCloseTo(1.8);
    expect(spawns[49].t).toBeLessThan(90);
  });

  it('no affix before night 5; some affixes on night 6', () => {
    expect(buildNightSpawns(waveForNight(waves, 4), combat('a')).some((s) => s.affix)).toBe(false);
    expect(buildNightSpawns(waveForNight(waves, 6), combat('a')).some((s) => s.affix)).toBe(true);
  });
});

describe('boss (balance §3.5)', () => {
  it('enrages at 90 s with speed ×1.3 and damage ×1.5', () => {
    const boss = createBoss();
    expect(tickBoss(boss, BOSS_ENRAGE_SECONDS - 1).enragedNow).toBe(false);
    expect(bossStats(boss)).toEqual({ speed: 70, slamDamage: 20, orbDamage: 10, coreDamage: 50 });
    expect(tickBoss(boss, 1).enragedNow).toBe(true);
    expect(bossStats(boss)).toEqual({ speed: 91, slamDamage: 30, orbDamage: 15, coreDamage: 75 });
  });

  it('summons 3 goblins + 2 spirits every 15 s after enrage, never before', () => {
    const boss = createBoss();
    expect(tickBoss(boss, 89).summons).toHaveLength(0);
    expect(tickBoss(boss, 1 + 14).summons).toHaveLength(0); // t=104
    const tick = tickBoss(boss, 1); // t=105
    expect(tick.summons).toEqual([['goblin', 'goblin', 'goblin', 'spirit', 'spirit']]);
    expect(tickBoss(boss, 30).summons).toHaveLength(2); // one big dt still yields both groups
  });

  it('dies at 0 HP, reports the kill once, and stops ticking', () => {
    const boss = createBoss();
    expect(damageBoss(boss, 4999)).toBe(false);
    expect(damageBoss(boss, 50)).toBe(true);
    expect(boss.hp).toBe(0);
    expect(damageBoss(boss, 10)).toBe(false);
    expect(tickBoss(boss, 200)).toEqual({ enragedNow: false, summons: [] });
  });

  it('crowd control lasts 25% on the boss', () => {
    expect(bossCcDuration(2)).toBe(0.5);
  });
});
