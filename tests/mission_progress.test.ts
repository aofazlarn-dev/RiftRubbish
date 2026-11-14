import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { createRun } from '../src/core/state';
import { completedMissions, freshDayStats, missionShards, type DayStats } from '../src/systems/missions';
import { attachMissionTracker, chooseMissions, settleDay, settleRunEnd } from '../src/systems/missionTracker';

const day = (over: Partial<DayStats>): DayStats => ({ ...freshDayStats(), ...over });

describe('mission conditions (approved draft)', () => {
  it('M_KILL30: 30 kills in the day and night', () => {
    expect(completedMissions(['M_KILL30'], day({ kills: 29 }))).toEqual([]);
    expect(completedMissions(['M_KILL30'], day({ kills: 30 }))).toEqual(['M_KILL30']);
  });

  it('M_NOCORE: the core is not hit', () => {
    expect(completedMissions(['M_NOCORE'], day({ coreLost: true }))).toEqual([]);
    expect(completedMissions(['M_NOCORE'], day({ coreLost: false }))).toEqual(['M_NOCORE']);
  });

  it('M_FUSE, M_CHEST, M_SURVIVE, M_EAT', () => {
    expect(completedMissions(['M_FUSE'], day({ fuses: 1 }))).toEqual(['M_FUSE']);
    expect(completedMissions(['M_CHEST'], day({ chestsOpened: 1 }))).toEqual([]);
    expect(completedMissions(['M_CHEST'], day({ chestsOpened: 2 }))).toEqual(['M_CHEST']);
    expect(completedMissions(['M_SURVIVE'], day({ downs: 2 }))).toEqual([]);
    expect(completedMissions(['M_SURVIVE'], day({ downs: 1 }))).toEqual(['M_SURVIVE']);
    expect(completedMissions(['M_EAT'], day({ hungry: true }))).toEqual([]);
    expect(completedMissions(['M_EAT'], day({ hungry: false }))).toEqual(['M_EAT']);
  });

  it('shards add up over the completed missions', () => {
    expect(missionShards(['M_NOCORE', 'M_FUSE'])).toBe(9);
    expect(missionShards([])).toBe(0);
  });
});

describe('mission wiring', () => {
  it('Casual picks three missions; Daily picks none', () => {
    const c = createRun({ seed: 'm-c', mode: 'casual' });
    chooseMissions(c, '2026-11-15');
    expect(c.missionIds).toHaveLength(3);
    const d = createRun({ seed: 'm-d', mode: 'daily' });
    chooseMissions(d, '2026-11-15');
    expect(d.missionIds).toEqual([]);
  });

  it('player:down and skill:fused count into the day, settleDay pays and resets', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'm-settle', mode: 'casual' });
    s.missionIds = ['M_FUSE', 'M_SURVIVE'];
    s.dayStats = freshDayStats();
    attachMissionTracker(bus, s);
    bus.emit('skill:fused', { a: 'J02', b: 'J03', result: 'R01a' });
    bus.emit('player:down', { hp: 0 });
    const earned = settleDay(s);
    expect(earned).toBe(4 + 4); // fuse 4 + survive 4 (one death allowed)
    expect(s.missionShards).toBe(8);
    expect(s.dayStats?.fuses).toBe(0);
  });
});

describe('run end pays the day being played', () => {
  it('a win on day 7 still pays the day missions', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'end-d7', mode: 'casual' });
    s.missionIds = ['M_FUSE'];
    s.dayStats = freshDayStats();
    attachMissionTracker(bus, s);
    bus.emit('skill:fused', { a: 'J02', b: 'J03', result: 'R01a' });
    s.nightKillBase = 0;
    s.kills = 0;
    s.nightCoreStart = s.coreHp;
    const shards = settleRunEnd(s);
    expect(shards).toBe(4);
    expect(s.missionShards).toBe(4);
  });
});
