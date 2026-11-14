import { describe, expect, it } from 'vitest';
import { runBot } from '../sim/bot';
import { loadRunData } from '../src/data';
import { EventBus } from '../src/core/events';
import { RunRng } from '../src/core/rng';
import { createRun, deserialize, serialize, type GameState } from '../src/core/state';
import { CORE_X, CORE_Y, TILE } from '../src/core/world';
import { damageCore, damagePlayer, dawnRepair, tickSurvival } from '../src/systems/base';
import { createBoss } from '../src/systems/boss';
import { elementMultiplier, tickSkills } from '../src/systems/combat';
import { findDef, spawnMonster, tickMonsters, tickSpawns } from '../src/systems/monsters';
import { grantXp, openDraftIfOwed, pickDraft, xpToNext } from '../src/systems/progression';
import { startRun, stepRun } from '../src/systems/run';

const data = loadRunData();

function newState(seed = 't'): GameState {
  const s = createRun({ seed });
  s.player.x = CORE_X + TILE * 2;
  s.player.y = CORE_Y;
  return s;
}

describe('base and survival (GDD ยง5)', () => {
  it('player death costs 15% core, respawns at full HP after 10 s', () => {
    const s = newState();
    const downs: number[] = [];
    const bus = new EventBus();
    bus.on('player:down', ({ hp }) => downs.push(hp));
    damagePlayer(s, 999, bus);
    expect(s.player.hp).toBe(0);
    expect(s.coreHp).toBe(850);
    expect(s.respawnIn).toBe(10);
    expect(downs).toEqual([0]);
    tickSurvival(s, 9.9);
    expect(s.player.hp).toBe(0);
    tickSurvival(s, 0.2);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('i-frames block a second hit for 0.5 s', () => {
    const s = newState();
    expect(damagePlayer(s, 10)).toBe(10);
    expect(damagePlayer(s, 10)).toBe(0);
    tickSurvival(s, 0.5);
    expect(damagePlayer(s, 10)).toBe(10);
  });

  it('the run is lost when the core reaches 0, and only once', () => {
    const s = newState();
    const ends: string[] = [];
    const bus = new EventBus();
    bus.on('run:end', ({ result }) => ends.push(result));
    damageCore(s, 1000, bus);
    damageCore(s, 50, bus);
    expect(s.status).toBe('lost');
    expect(ends).toEqual(['lose']);
  });

  it('dawn repairs 10% of the core and never above max', () => {
    const s = newState();
    s.coreHp = 500;
    dawnRepair(s);
    expect(s.coreHp).toBe(600);
    s.coreHp = 980;
    dawnRepair(s);
    expect(s.coreHp).toBe(1000);
  });

  it('Stoneskin adds Max HP and cuts damage by 8% at Lv1', () => {
    const s = newState();
    s.draftsOwed = 1;
    s.pendingDraft = ['skill:W03'];
    pickDraft(s, 0, data.skills);
    expect(s.player.maxHp).toBe(110);
    expect(damagePlayer(s, 100)).toBeCloseTo(92);
  });
});

describe('monsters (balance ยง3.3, ยง5.1)', () => {
  it('a goblin walks to the core and damages it; a bat never does', () => {
    const s = newState();
    s.player.x = 100; // far away
    s.player.y = 100;
    spawnMonster(s, findDef(data.monsters, 'goblin'), CORE_X + 200, CORE_Y);
    spawnMonster(s, findDef(data.monsters, 'bat'), CORE_X - 30, CORE_Y);
    s.respawnIn = 5; // player down: everything heads for the core
    for (let i = 0; i < 80; i++) tickMonsters(s, 0.1, data.monsters);
    expect(s.coreHp).toBeLessThan(1000);
    expect((1000 - s.coreHp) % 8).toBe(0); // only the goblin (8 per hit) ever hit it
  });

  it('a slime chases a nearby player and deals contact damage', () => {
    const s = newState();
    spawnMonster(s, findDef(data.monsters, 'slime'), s.player.x + 100, s.player.y);
    for (let i = 0; i < 30; i++) tickMonsters(s, 0.1, data.monsters);
    expect(s.player.hp).toBe(95);
  });

  it('a day patrol ignores a far player and the core', () => {
    const s = newState();
    const m = spawnMonster(s, findDef(data.monsters, 'goblin'), CORE_X + 600, CORE_Y, { patrol: true });
    for (let i = 0; i < 50; i++) tickMonsters(s, 0.1, data.monsters);
    expect(m.x).toBe(CORE_X + 600);
    expect(s.coreHp).toBe(1000);
  });

  it('never has more than 40 monsters alive; the rest wait in the queue', () => {
    const s = newState();
    s.phase = 'night';
    s.phaseElapsed = 39;
    s.spawnQueue = Array.from({ length: 60 }, () => ({ t: 0, monsterId: 'slime', affix: false }));
    tickSpawns(s, RunRng.fromSeed('cap').get('combat'), data.monsters, data.waves.maxOnScreen);
    expect(s.monsters).toHaveLength(40);
    expect(s.spawnQueue).toHaveLength(20);
  });

  it('junk-shield affix adds a shield worth 50% of max HP (the +50% effective HP), HP unchanged', () => {
    const s = newState();
    const m = spawnMonster(s, findDef(data.monsters, 'goblin'), 0, 0, { affixId: 'junk_shield' });
    expect(m.hp).toBe(30);
    expect(m.shield).toBe(15);
    expect(m.affix).toBe(true);
  });

  it('other affixes do not change HP', () => {
    const s = newState();
    const m = spawnMonster(s, findDef(data.monsters, 'goblin'), 0, 0, { affixId: 'rush' });
    expect(m.hp).toBe(30);
    expect(m.shield).toBeUndefined();
  });
});

describe('combat (balance ยง3.1)', () => {
  it('element multipliers: weak ร—1.5, resist 50% ร—0.5, 75% ร—0.25, best tag wins', () => {
    const golem = findDef(data.monsters, 'golem');
    expect(elementMultiplier(golem, ['ice'])).toBe(1.5);
    expect(elementMultiplier(golem, ['lightning'])).toBe(0.5);
    expect(elementMultiplier(golem, ['earth'])).toBe(0.25);
    expect(elementMultiplier(golem, ['earth', 'fire'])).toBe(1);
    expect(elementMultiplier(golem, [])).toBe(1);
  });

  it('Fireball kills a slime in range, grants player XP and Skill XP equal to its cooldown', () => {
    const s = newState();
    s.skills.push({ id: 'E01', xp: 0, cooldownLeft: 0 });
    spawnMonster(s, findDef(data.monsters, 'slime'), s.player.x + 100, s.player.y); // 12 HP, weak to fire: 6ร—1.5 = 9
    const rng = RunRng.fromSeed('c').get('combat');
    const first = tickSkills(s, 0.1, data.skills, data.monsters, rng);
    expect(first.fx).toHaveLength(1);
    expect(s.monsters[0].hp).toBe(3);
    expect(s.skills[0].xp).toBe(1.8);
    let xp = 0;
    for (let i = 0; i < 20; i++) xp += tickSkills(s, 0.1, data.skills, data.monsters, rng).xpGained;
    expect(s.monsters).toHaveLength(0);
    expect(xp).toBe(1);
    expect(s.kills).toBe(1);
  });

  it('does not cast with no target in range, and earns no Skill XP', () => {
    const s = newState();
    s.skills.push({ id: 'W01', xp: 0, cooldownLeft: 0 });
    spawnMonster(s, findDef(data.monsters, 'slime'), s.player.x + 500, s.player.y);
    const out = tickSkills(s, 0.1, data.skills, data.monsters, RunRng.fromSeed('c').get('combat'));
    expect(out.fx).toHaveLength(0);
    expect(s.skills[0].xp).toBe(0);
  });

  it('Chain Lightning jumps to nearby monsters with 15% less damage per jump', () => {
    const s = newState();
    s.skills.push({ id: 'E03', xp: 0, cooldownLeft: 0 });
    const golem = findDef(data.monsters, 'goblin'); // no resist, 30 HP
    const a = spawnMonster(s, golem, s.player.x + 60, s.player.y);
    const b = spawnMonster(s, golem, s.player.x + 120, s.player.y);
    tickSkills(s, 0.1, data.skills, data.monsters, RunRng.fromSeed('c').get('combat'));
    expect(a.hp).toBeCloseTo(18);
    expect(b.hp).toBeCloseTo(30 - 12 * 0.85);
  });

  it('killing the boss wins the run', () => {
    const s = newState();
    s.day = 7;
    s.phase = 'night';
    s.skills.push({ id: 'E02', xp: 0, cooldownLeft: 0 });
    s.boss = { x: s.player.x + 60, y: s.player.y, slamTimer: 3, coreTimer: 3, rules: { ...createBoss(), hp: 5 } };
    const ends: string[] = [];
    const bus = new EventBus();
    bus.on('run:end', ({ result }) => ends.push(result));
    tickSkills(s, 0.1, data.skills, data.monsters, RunRng.fromSeed('c').get('combat'), bus);
    expect(s.status).toBe('won');
    expect(ends).toEqual(['win']);
  });
});

describe('progression and Draft (balance ยง1.2, ยง9)', () => {
  it('XP curve: 5 to Lv2, 7 to Lv3, 210 flat from Lv20', () => {
    expect(xpToNext(1)).toBe(5);
    expect(xpToNext(2)).toBe(7);
    expect(xpToNext(19)).toBe(210);
    expect(xpToNext(30)).toBe(210);
  });

  it('one big XP grant can owe several Drafts', () => {
    const s = newState();
    grantXp(s, 5 + 7 + 3);
    expect(s.player.level).toBe(3);
    expect(s.player.xp).toBe(3);
    expect(s.draftsOwed).toBe(2);
  });

  it('the first Draft offers only real attack skills', () => {
    const s = newState();
    startRun(s, RunRng.fromSeed('first'), data);
    expect(s.pendingDraft).toHaveLength(3);
    for (const card of s.pendingDraft!) {
      const def = data.skills.find((d) => `skill:${d.id}` === card)!;
      expect(def.kind).toBe('active');
      expect(def.junk).toBeFalsy();
    }
  });

  it('the run is paused while a Draft is open and resumes after a pick', () => {
    const s = newState();
    const rng = RunRng.fromSeed('pause');
    startRun(s, rng, data);
    stepRun(s, rng, { x: 0, y: 0 }, 1, data);
    expect(s.phaseElapsed).toBe(0);
    expect(pickDraft(s, 0, data.skills)).toBe(true);
    expect(s.skills).toHaveLength(1);
    stepRun(s, rng, { x: 0, y: 0 }, 1, data);
    expect(s.phaseElapsed).toBe(1);
  });

  it('never offers a 5th Active; fills with upgrade cards instead', () => {
    const s = newState();
    for (const id of ['W01', 'E01', 'E02', 'E03']) s.skills.push({ id, xp: 0, cooldownLeft: 0 });
    s.draftsOwed = 1;
    openDraftIfOwed(s, RunRng.fromSeed('slots').get('draft'), data.skills);
    expect(s.pendingDraft).not.toContain('skill:J03');
    expect(s.pendingDraft).toContain('skill:W03');
    expect(s.pendingDraft!.filter((c) => c.startsWith('up:'))).toHaveLength(2);
  });

  it('an upgrade card adds +40 Skill XP at Lv1', () => {
    const s = newState();
    s.skills.push({ id: 'E01', xp: 10, cooldownLeft: 0 });
    s.pendingDraft = ['up:E01'];
    pickDraft(s, 0, data.skills);
    expect(s.skills[0].xp).toBe(50);
  });
});

describe('run loop', () => {
  it('night 1 queues 40 spawns; dawn clears monsters and repairs the core', () => {
    const s = newState();
    const rng = RunRng.fromSeed('loop');
    startRun(s, rng, data);
    pickDraft(s, 0, data.skills);
    s.phase = 'evening';
    s.phaseElapsed = 19.95;
    stepRun(s, rng, { x: 0, y: 0 }, 0.1, data);
    expect(s.phase).toBe('night');
    expect(s.spawnQueue.length + s.monsters.filter((m) => !m.patrol).length).toBeGreaterThanOrEqual(40);
    s.coreHp = 800;
    s.phaseElapsed = 39.95;
    s.pendingDraft = null;
    s.draftsOwed = 0;
    stepRun(s, rng, { x: 0, y: 0 }, 0.1, data);
    expect(s.phase).toBe('day');
    expect(s.day).toBe(2);
    expect(s.coreHp).toBe(900);
    expect(s.spawnQueue).toHaveLength(0);
    expect(s.monsters.every((m) => m.patrol)).toBe(true);
  });

  it('night 7 spawns the boss 18 tiles from the core', () => {
    const s = newState();
    const rng = RunRng.fromSeed('boss');
    s.day = 7;
    s.phase = 'evening';
    s.phaseElapsed = 19.95;
    stepRun(s, rng, { x: 0, y: 0 }, 0.1, data);
    expect(s.boss).not.toBeNull();
    // Spawns at 18 tiles, then walks toward the core for this 0.1 s step (70 px/s โ’ 7 px).
    expect(Math.hypot(s.boss!.x - CORE_X, s.boss!.y - CORE_Y)).toBeCloseTo(18 * TILE - 7, 0);
  });

  it('a version 1 save loads with the new fields filled in', () => {
    const v1 = { ...createRun({ seed: 'old' }), version: 1 } as Record<string, unknown>;
    for (const key of ['status', 'skills', 'monsters', 'spawnQueue', 'boss', 'pendingDraft', 'draftsOwed']) delete v1[key];
    const loaded = deserialize(JSON.stringify(v1));
    expect(loaded.version).toBe(2);
    expect(loaded.status).toBe('playing');
    expect(loaded.skills).toEqual([]);
  });

  it('a mid-run state survives save and load', () => {
    const s = newState();
    const rng = RunRng.fromSeed('save');
    startRun(s, rng, data);
    pickDraft(s, 0, data.skills);
    for (let i = 0; i < 200; i++) stepRun(s, rng, { x: 1, y: 0 }, 0.1, data);
    expect(deserialize(serialize(s))).toEqual(s);
  });
});

describe('headless bot run', () => {
  it('plays a whole run to a win or a loss without breaking', () => {
    const r = runBot('bot-1');
    expect(['won', 'lost']).toContain(r.status);
    expect(r.kills).toBeGreaterThan(50);
    expect(r.level).toBeGreaterThan(3);
    expect(Number.isFinite(r.coreHp)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(runBot('bot-2', { maxSeconds: 400 })).toEqual(runBot('bot-2', { maxSeconds: 400 }));
  });
});

