import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/events';
import { createRun } from '../src/core/state';
import lines from '../src/data/system_lines.json';
import { attachSystemVoice, lineText, say, variantId } from '../src/systems/systemVoice';

function capture(bus: EventBus) {
  const said: Array<GameEvents['system:say']> = [];
  bus.on('system:say', (p) => said.push(p));
  return said;
}

describe('system lines data (system_lines.md)', () => {
  it('has the parsed lines with TH and EN text', () => {
    expect(Object.keys(lines).length).toBeGreaterThanOrEqual(120);
    const w = lineText('WELCOME_01');
    expect(w.th.length).toBeGreaterThan(0);
    expect(w.en.length).toBeGreaterThan(0);
  });

  it('throws for an unknown line id', () => {
    expect(() => lineText('NOPE_99')).toThrow('Unknown system line');
  });
});

describe('say and cooldown', () => {
  it('emits the line on the bus', () => {
    const bus = new EventBus();
    const said = capture(bus);
    const s = createRun({ seed: 'say' });
    expect(say(s, bus, 'WELCOME_01')).toBe(true);
    expect(said).toHaveLength(1);
    expect(said[0].id).toBe('WELCOME_01');
  });

  it('TRASH_04 (J04) repeats at most once per 30 s', () => {
    const bus = new EventBus();
    const said = capture(bus);
    const s = createRun({ seed: 'cooldown' });
    s.runTime = 0;
    expect(say(s, bus, 'TRASH_04')).toBe(true);
    s.runTime = 10;
    expect(say(s, bus, 'TRASH_04')).toBe(false);
    s.runTime = 31;
    expect(say(s, bus, 'TRASH_04')).toBe(true);
    expect(said).toHaveLength(2);
  });
});

describe('variants rotate', () => {
  it('wraps around the count', () => {
    expect(variantId('DOWN', 4, 0)).toBe('DOWN_01');
    expect(variantId('DOWN', 4, 3)).toBe('DOWN_04');
    expect(variantId('DOWN', 4, 4)).toBe('DOWN_01');
  });
});

describe('attachSystemVoice triggers', () => {
  it('welcome on run start, trash line on the matching pick, then unsubscribes', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'attach' });
    const said = capture(bus);
    const off = attachSystemVoice(bus, s);
    bus.emit('run:start', { seed: 'attach', mode: 'casual' });
    bus.emit('draft:pick', { card: 'skill:J02' });
    expect(said.map((x) => x.id)).toEqual(['WELCOME_01', 'TRASH_01']);
    off();
    bus.emit('draft:pick', { card: 'skill:J03' });
    expect(said).toHaveLength(2);
  });

  it('a lose ends with a LOSE line, a win with a WIN line', () => {
    const bus = new EventBus();
    const s = createRun({ seed: 'endings' });
    s.kills = 5;
    const said = capture(bus);
    attachSystemVoice(bus, s);
    bus.emit('run:end', { night: 3, result: 'lose' });
    bus.emit('run:end', { night: 7, result: 'win' });
    expect(said[0].id).toMatch(/^LOSE_0[1-4]$/);
    expect(said[1].id).toMatch(/^WIN_0[1-4]$/);
  });
});
