/**
 * Headless bot run: plays a whole run with the same stepRun() the game uses.
 * The bot circles the base and always takes the first Draft card. It is a smoke test
 * and a rough balance probe, not a model of a real player.
 */

import { loadRunData } from '../src/data';
import { RunRng } from '../src/core/rng';
import { createRun, type GameState } from '../src/core/state';
import { CORE_X, CORE_Y, TILE } from '../src/core/world';
import { pickDraft } from '../src/systems/progression';
import { startRun, stepRun } from '../src/systems/run';

export interface BotResult {
  status: GameState['status'];
  day: number;
  phase: GameState['phase'];
  seconds: number;
  level: number;
  kills: number;
  coreHp: number;
  deaths: number;
  skills: string[];
  /** Core HP at the start of each night, for the balance §6.1 budget. */
  coreAtNight: number[];
}

export interface BotOptions {
  /** Which Draft card to take (default 0). */
  pick?: number;
  /** Stop after this many game seconds (default 1500). */
  maxSeconds?: number;
  dt?: number;
  /** Radius of the circle the bot walks around the core, in tiles (default 1.2: inside goblin aggro range). */
  radiusTiles?: number;
  /** Dodge monsters that get close (default true). */
  kite?: boolean;
}

export function runBot(seed: string, options: BotOptions = {}): BotResult {
  const dt = options.dt ?? 0.1;
  const maxSeconds = options.maxSeconds ?? 1500;
  const data = loadRunData();
  const state = createRun({ seed });
  state.player.x = CORE_X + TILE * 2;
  state.player.y = CORE_Y;
  const rng = RunRng.fromSeed(seed);
  startRun(state, rng, data);

  let seconds = 0;
  let deaths = 0;
  let wasDown = false;
  let lastPhase = state.phase;
  const coreAtNight: number[] = [];

  while (state.status === 'playing' && seconds < maxSeconds) {
    if (state.pendingDraft) {
      pickDraft(state, Math.min(options.pick ?? 0, state.pendingDraft.length - 1));
      continue;
    }
    // Circle close to the core: monsters heading for it come into range, and goblins
    // within 2 tiles turn on the player instead of the core (balance §3.3).
    const radius = (options.radiusTiles ?? 1.2) * TILE;
    const angle = seconds * 0.6;
    const tx = CORE_X + Math.cos(angle) * radius;
    const ty = CORE_Y + Math.sin(angle) * radius;
    let input = { x: tx - state.player.x, y: ty - state.player.y };
    if (options.kite ?? true) {
      // Step away from monsters that are about to touch, like a player who dodges.
      let ax = 0;
      let ay = 0;
      for (const m of state.monsters) {
        const dx = state.player.x - m.x;
        const dy = state.player.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 70) {
          ax += dx / d;
          ay += dy / d;
        }
      }
      const farFromCore = Math.hypot(state.player.x - CORE_X, state.player.y - CORE_Y) > TILE * 5;
      if ((ax !== 0 || ay !== 0) && !farFromCore) input = { x: ax, y: ay };
    }
    stepRun(state, rng, input, dt, data);
    seconds += dt;

    const down = state.respawnIn > 0;
    if (down && !wasDown) deaths++;
    wasDown = down;
    if (state.phase !== lastPhase) {
      if (state.phase === 'night') coreAtNight.push(Math.round(state.coreHp));
      lastPhase = state.phase;
    }
  }

  return {
    status: state.status,
    day: state.day,
    phase: state.phase,
    seconds: Math.round(seconds),
    level: state.player.level,
    kills: state.kills,
    coreHp: Math.round(state.coreHp),
    deaths,
    skills: state.skills.map((s) => s.id),
    coreAtNight,
  };
}
