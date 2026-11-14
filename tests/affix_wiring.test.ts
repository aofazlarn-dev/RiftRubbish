import { describe, expect, it } from 'vitest';
import { createRun, type GameState } from '../src/core/state';
import { CORE_X, CORE_Y } from '../src/core/world';
import { loadRunData } from '../src/data';
import { affixedMultiplier } from '../src/systems/combat';
import { findDef, queueDeathEffects, spawnMonster, tickMonsters } from '../src/systems/monsters';
import type { MonsterDef } from '../src/systems/waves';

const data = loadRunData();
const goblin = findDef(data.monsters, 'goblin');

function newState(): GameState {
  return createRun({ seed: 'affix-wiring' });
}

describe('junk shield regen (balance §4: refills after 5 s without a hit)', () => {
  it('refills to full after 5 s with no hit', () => {
    const s = newState();
    s.monsters = [];
    const m = spawnMonster(s, goblin, CORE_X + 400, CORE_Y, { affixId: 'junk_shield' });
    m.shield = 3;
    tickMonsters(s, 4.9, data.monsters);
    expect(m.shield).toBe(3);
    tickMonsters(s, 0.2, data.monsters);
    expect(m.shield).toBe(m.shieldMax);
  });
});

describe('burst (balance §4: explodes 1.0 s after death, r = 64 px, player 12 / core 20)', () => {
  it('queues on death and damages the core only when the timer runs out', () => {
    const s = newState();
    s.coreHp = 1000;
    s.monsters = [];
    const m = spawnMonster(s, goblin, CORE_X, CORE_Y, { affixId: 'burst' });
    m.hp = 0;
    queueDeathEffects(s);
    s.monsters = [];
    expect(s.bursts).toHaveLength(1);

    tickMonsters(s, 0.5, data.monsters);
    expect(s.coreHp).toBe(1000);
    tickMonsters(s, 0.5, data.monsters);
    expect(s.coreHp).toBe(980);
    expect(s.bursts).toHaveLength(0);
  });

  it('a non-burst death queues nothing', () => {
    const s = newState();
    s.monsters = [];
    const m = spawnMonster(s, goblin, 0, 0, { affixId: 'rush' });
    m.hp = 0;
    queueDeathEffects(s);
    expect(s.bursts ?? []).toHaveLength(0);
  });
});

describe('rush (+40% speed)', () => {
  it('moves 1.4× as far as the same goblin without the affix', () => {
    const plain = newState();
    plain.monsters = [];
    const a = spawnMonster(plain, goblin, CORE_X + 400, CORE_Y);
    const rushed = newState();
    rushed.monsters = [];
    const b = spawnMonster(rushed, goblin, CORE_X + 400, CORE_Y, { affixId: 'rush' });
    const startA = a.x;
    const startB = b.x;
    tickMonsters(plain, 0.1, data.monsters);
    tickMonsters(rushed, 0.1, data.monsters);
    expect((b.x - startB) / (a.x - startA)).toBeCloseTo(1.4, 5);
  });
});

describe('pack leader aura (+20% speed and damage, not stacked)', () => {
  it('a goblin within 96 px of a leader moves 1.2× as far', () => {
    const plain = newState();
    plain.monsters = [];
    const a = spawnMonster(plain, goblin, CORE_X + 400, CORE_Y);
    const aura = newState();
    aura.monsters = [];
    const b = spawnMonster(aura, goblin, CORE_X + 400, CORE_Y);
    spawnMonster(aura, goblin, CORE_X + 400 + 50, CORE_Y, { affixId: 'pack_leader' });
    const startA = a.x;
    const startB = b.x;
    tickMonsters(plain, 0.1, data.monsters);
    tickMonsters(aura, 0.1, data.monsters);
    expect((b.x - startB) / (a.x - startA)).toBeCloseTo(1.2, 5);
  });

  it('a goblin out of range of the leader gets no bonus', () => {
    const plain = newState();
    plain.monsters = [];
    const a = spawnMonster(plain, goblin, CORE_X + 400, CORE_Y);
    const far = newState();
    far.monsters = [];
    const b = spawnMonster(far, goblin, CORE_X + 400, CORE_Y);
    spawnMonster(far, goblin, CORE_X + 400, CORE_Y + 300, { affixId: 'pack_leader' });
    const startA = a.x;
    const startB = b.x;
    tickMonsters(plain, 0.1, data.monsters);
    tickMonsters(far, 0.1, data.monsters);
    expect((b.x - startB) / (a.x - startA)).toBeCloseTo(1, 5);
  });
});

describe('resist by choice in damage (combined with the element table)', () => {
  const plainDef = { weak: [], resist: {} } as Pick<MonsterDef, 'weak' | 'resist'>;
  const fireWeak = { weak: ['fire'], resist: {} } as Pick<MonsterDef, 'weak' | 'resist'>;

  it('halves damage that carries the chosen tag', () => {
    expect(affixedMultiplier({ resistTag: 'fire' }, plainDef, ['fire'])).toBe(0.5);
    expect(affixedMultiplier({ resistTag: 'fire' }, plainDef, ['ice'])).toBe(1);
  });

  it('a weakness keeps its bonus and only loses the affix half', () => {
    expect(affixedMultiplier({ resistTag: 'fire' }, fireWeak, ['fire'])).toBeCloseTo(0.75, 5);
  });

  it('no tag chosen means no change', () => {
    expect(affixedMultiplier({ resistTag: null }, plainDef, ['fire'])).toBe(1);
  });
});
