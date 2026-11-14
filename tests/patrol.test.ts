import { describe, expect, it } from 'vitest';
import { createRun, type GameState } from '../src/core/state';
import { CORE_X, CORE_Y, TILE } from '../src/core/world';
import { loadRunData } from '../src/data';
import { findDef, spawnMonster, tickMonsters } from '../src/systems/monsters';

const data = loadRunData();
const goblin = findDef(data.monsters, 'goblin');
const HOME_X = CORE_X + 600;
const HOME_Y = CORE_Y;

function patrolAt(s: GameState) {
  s.monsters = [];
  return spawnMonster(s, goblin, HOME_X, HOME_Y, { patrol: true });
}

describe('day patrols notice the player within 8 tiles (up from 5)', () => {
  it('starts a chase at 7 tiles', () => {
    const s = createRun({ seed: 'patrol-near' });
    const m = patrolAt(s);
    s.player.x = HOME_X - 7 * TILE;
    s.player.y = HOME_Y;
    tickMonsters(s, 0.01, data.monsters);
    expect(m.aggro).toBe(true);
  });

  it('ignores the player at 9 tiles', () => {
    const s = createRun({ seed: 'patrol-far' });
    const m = patrolAt(s);
    s.player.x = HOME_X - 9 * TILE;
    s.player.y = HOME_Y;
    tickMonsters(s, 0.01, data.monsters);
    expect(m.aggro).toBe(false);
  });
});

describe('patrol leash: gives up when the player is more than 10 tiles from home', () => {
  it('keeps chasing within 10 tiles of home', () => {
    const s = createRun({ seed: 'patrol-leash-in' });
    const m = patrolAt(s);
    m.aggro = true;
    s.player.x = HOME_X - 9 * TILE;
    s.player.y = HOME_Y;
    tickMonsters(s, 0.01, data.monsters);
    expect(m.aggro).toBe(true);
  });

  it('drops the chase beyond 10 tiles from home', () => {
    const s = createRun({ seed: 'patrol-leash-out' });
    const m = patrolAt(s);
    m.aggro = true;
    s.player.x = HOME_X - 11 * TILE;
    s.player.y = HOME_Y;
    tickMonsters(s, 0.01, data.monsters);
    expect(m.aggro).toBe(false);
  });
});
