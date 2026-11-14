/**
 * One step of a whole run: clock, spawns, monsters, boss, skills, XP and Drafts.
 * Pure over GameState (no Phaser), so the scene and the headless sim call the same function.
 */

import type { EventBus } from '../core/events';
import type { RunRng } from '../core/rng';
import { FINAL_NIGHT, type GameState } from '../core/state';
import { CORE_X, CORE_Y, dist, TILE, WORLD } from '../core/world';
import { damageCore, damagePlayer, dawnRepair, isPlayerDown, tickSurvival } from './base';
import { bossStats, createBoss, tickBoss } from './boss';
import { advanceClock, recallEarly } from './clock';
import { tickSkills, type CombatFx } from './combat';
import { clearMonstersAtDawn, findDef, ringPoint, spawnDayPatrols, spawnMonster, tickMonsters, tickSpawns } from './monsters';
import { movePlayer, type Vec2 } from './movement';
import {
  autoMealId,
  fenceShieldHp,
  resolveEvening,
  TRAP_PLAYER_STUN_SEC,
  TRAP_TRIGGER_PX,
  trapPositions,
  type EveningChoiceId,
} from './evening';
import { overtimeAllowed } from './daily';
import { expireTutorialGifts, forceTutorialFusion, grantTutorialGift } from './tutorial';
import { clearChests, spawnChests, tickChests } from './chests';
import { clearGatherDay, placeWell, spawnGatherDay, tickGather } from './gather';
import { attachSystemVoice } from './systemVoice';
import { attachShardLedger } from './shards';
import { attachMissionTracker, chooseMissions, settleDay } from './missionTracker';
import { freshDayStats } from './missions';
import { applyMeta, startingSkillsFor } from './meta';
import { loadMeta } from '../core/metaSave';
import { grantXp, openDraftIfOwed } from './progression';
import type { SkillDef } from './skills';
import { buildNightSpawns, waveForNight, type MonsterDef, type WavesData } from './waves';

export interface RunData {
  skills: SkillDef[];
  monsters: MonsterDef[];
  waves: WavesData;
}

const ELITE_SPAWN_AT = 3;
const BOSS_SPAWN_TILES = 18;
const BOSS_AGGRO_TILES = 8;
const BOSS_SLAM_RADIUS = 96;
const BOSS_ATTACK_INTERVAL = 3;
const BOSS_CORE_REACH = 60;

/** Sets up day 1: patrols (with the guaranteed slimes) and the first skill Draft. */
export function startRun(state: GameState, rng: RunRng, data: RunData, bus?: EventBus): void {
  // Daily gets the fixed loadout (approved draft, PR #44): W01 + J03 owned from the start.
  for (const id of startingSkillsFor(state)) {
    if (!state.skills.some((s) => s.id === id)) state.skills.push({ id, xp: 0, cooldownLeft: 0 });
  }
  const patrol = data.waves.days.find((d) => d.day === 1);
  if (state.mode === 'casual') applyMeta(state, loadMeta().owned); // owned meta applies to Casual runs only (GDD §2)
  if (patrol) spawnDayPatrols(state, patrol, rng.get('combat'), data.monsters);
  placeWell(state, rng.get('map'));
  spawnGatherDay(state, rng.get('loot'));
  spawnChests(state, rng.get('loot'));
  state.draftsOwed += 1;
  openDraftIfOwed(state, rng.get('draft'), data.skills, bus, true);
  if (bus) {
    attachSystemVoice(bus, state); // subscribe before run:start so the welcome line plays (G5)
    attachShardLedger(bus, state); // settles Soul Shard when the run ends (G7)
    attachMissionTracker(bus, state); // per-day counters for the approved missions
  }
  chooseMissions(state, new Date().toISOString().slice(0, 10)); // Casual: 3 missions for today (Daily: none)
  bus?.emit('run:start', { seed: state.seed, mode: state.mode });
}

/**
 * Resolves this evening once (balance §6.2–6.3, Gap round 2 R1). The only place that cooks,
 * sets the night buff, the fence shield, the traps and overtime. Uses the player's request
 * (`requestedMeal`, `requestedChoice`) when set; otherwise the game picks the best affordable
 * meal and the free trap. Does nothing if this evening was already resolved.
 *  - meal: cooked from stock, or hungry if nothing can be cooked
 *  - fence: meal + a spare dish, core shield 30% of max HP until dawn
 *  - trap: 6 traps around the base, no cost
 *  - overtime: skip the meal (hungry), once per run from day 4, never in Daily
 */
export function beginEvening(state: GameState): void {
  if (state.eveningResolved === true) return;
  const inv = state.inventory ?? {};
  const mealId = state.requestedMeal === undefined ? autoMealId(inv) : state.requestedMeal;
  const res = resolveEvening(inv, mealId, state.requestedChoice, {
    day: state.day,
    overtimeUsed: state.overtimeUsed ?? false,
    overtimeAllowed: overtimeAllowed(state.mode),
  });
  state.requestedChoice = undefined;
  state.requestedMeal = undefined;
  state.eveningResolved = true;

  state.inventory = res.inventory;
  state.nightBuff = res.buff;
  // Mission M_EAT reads this at dawn: no meal tonight (overtime included).
  if (res.hungry) state.dayStats = { ...(state.dayStats ?? freshDayStats()), hungry: true };
  state.coreShield = res.choice === 'fence' ? fenceShieldHp(state.coreMaxHp) : 0;
  state.traps = res.choice === 'trap' ? trapPositions(CORE_X, CORE_Y, TILE) : [];
  if (res.choice === 'overtime') {
    state.overtimeUsed = true;
    state.overtimeChosen = true;
  }
}

/** The evening screen's confirm: records the player's pick and resolves the evening at once. */
export function submitEvening(state: GameState, mealId: string | null, choice: EveningChoiceId): void {
  if (state.phase !== 'evening') return;
  state.requestedMeal = mealId;
  state.requestedChoice = choice;
  beginEvening(state);
}

/**
 * "เรียกคืนเร็ว" (D22) for the scene: skips to evening and runs the same evening start as the
 * clock does (chests end, mission stats, evening opens). Returns false outside the day.
 */
export function recallToEvening(state: GameState, rng: RunRng, data: RunData, bus?: EventBus): boolean {
  if (!recallEarly(state, bus)) return false;
  onPhaseStart(state, rng, data);
  return true;
}

/** Trap contact for the player: a 1.5 s stun per trap, 3 uses each. Also counts the stun down. */
function tickPlayerTraps(state: GameState, dt: number): void {
  state.player.stunLeft = Math.max(0, (state.player.stunLeft ?? 0) - dt);
  for (const t of state.traps ?? []) {
    if (t.uses > 0 && dist(t.x, t.y, state.player.x, state.player.y) <= TRAP_TRIGGER_PX) {
      t.uses -= 1;
      state.player.stunLeft = Math.max(state.player.stunLeft ?? 0, TRAP_PLAYER_STUN_SEC);
    }
  }
}

function onPhaseStart(state: GameState, rng: RunRng, data: RunData): void {
  const combat = rng.get('combat');
  if (state.phase === 'night') {
    // The evening was opened but not confirmed (sim, or skipped): the game picks for the player.
    if (state.eveningResolved === false) beginEvening(state);
    state.nightCoreStart = state.coreHp; // mission M_NOCORE reads this at dawn
    state.nightKillBase = state.kills; // mission M_KILL30 counts kills from here
    if (state.day === 1) {
      // Welcome gift at the start of night 1: J02 + J03 are fused into R01a at once (G2, GDD §3).
      grantTutorialGift(state);
      forceTutorialFusion(state);
    }
    const wave = waveForNight(data.waves, state.day);
    const queue = buildNightSpawns(wave, combat, FINAL_NIGHT);
    if (wave.elite) queue.push({ t: ELITE_SPAWN_AT, monsterId: wave.elite, affix: false });
    queue.sort((a, b) => a.t - b.t);
    state.spawnQueue = queue;
    if (wave.boss) {
      const p = ringPoint(combat, BOSS_SPAWN_TILES, BOSS_SPAWN_TILES);
      state.boss = {
        x: p.x,
        y: p.y,
        slamTimer: BOSS_ATTACK_INTERVAL,
        coreTimer: BOSS_ATTACK_INTERVAL,
        rules: createBoss(),
      };
    }
  } else if (state.phase === 'evening') {
    // Mission input for today: opened chests (M_CHEST), then the chests end at dusk.
    const opened = (state.chests ?? []).filter((c) => c.opened).length;
    state.dayStats = { ...(state.dayStats ?? freshDayStats()), chestsOpened: opened };
    clearChests(state); // daytime chests end at dusk
    clearGatherDay(state); // unpicked grain and mushrooms wither (R2)
    // The evening opens; the player resolves it on the evening screen (submitEvening).
    // If nothing resolves it (sim, or the player never confirms), night start does (below).
    state.eveningResolved = false;
  } else if (state.phase === 'day') {
    // Dawn: read the night's stats before repairs, then score the day's missions (approved draft).
    const ds = state.dayStats ?? freshDayStats();
    state.dayStats = {
      ...ds,
      kills: state.kills - (state.nightKillBase ?? 0), // day 1 has no night base yet
      coreLost: state.coreHp < (state.nightCoreStart ?? state.coreHp),
    };
    settleDay(state);
    clearMonstersAtDawn(state);
    dawnRepair(state);
    state.nightBuff = undefined;
    state.coreShield = 0; // the fence lasts only through the night
    state.traps = [];
    placeWell(state, rng.get('map')); // older saves had no well
    spawnGatherDay(state, rng.get('loot')); // nodes to walk to; nothing is given for free (R2)
    expireTutorialGifts(state); // the welcome gift leaves at dawn of day 2 (G2)
    spawnChests(state, rng.get('loot'));
    const patrol = data.waves.days.find((d) => d.day === state.day);
    if (patrol) spawnDayPatrols(state, patrol, combat, data.monsters);
  }
}

function tickBossFight(state: GameState, dt: number, rng: RunRng, data: RunData, bus?: EventBus): void {
  const boss = state.boss;
  if (!boss || boss.rules.hp <= 0 || state.status !== 'playing') return;
  const stats = bossStats(boss.rules);

  // Chases the player inside 8 tiles, otherwise walks to the core (balance §3.5).
  const toPlayer = dist(boss.x, boss.y, state.player.x, state.player.y);
  const chasePlayer = !isPlayerDown(state) && toPlayer <= BOSS_AGGRO_TILES * TILE;
  const tx = chasePlayer ? state.player.x : CORE_X;
  const ty = chasePlayer ? state.player.y : CORE_Y;
  const stopAt = chasePlayer ? 30 : BOSS_CORE_REACH * 0.8;
  const d = dist(boss.x, boss.y, tx, ty);
  if (d > stopAt) {
    const step = Math.min(stats.speed * dt, d - stopAt);
    boss.x += ((tx - boss.x) / d) * step;
    boss.y += ((ty - boss.y) / d) * step;
  }

  boss.slamTimer -= dt;
  if (boss.slamTimer <= 0) {
    boss.slamTimer = BOSS_ATTACK_INTERVAL;
    if (dist(boss.x, boss.y, state.player.x, state.player.y) <= BOSS_SLAM_RADIUS) {
      damagePlayer(state, stats.slamDamage, bus);
    }
  }
  if (dist(boss.x, boss.y, CORE_X, CORE_Y) <= BOSS_CORE_REACH) {
    boss.coreTimer -= dt;
    if (boss.coreTimer <= 0) {
      boss.coreTimer = BOSS_ATTACK_INTERVAL;
      damageCore(state, stats.coreDamage, bus);
    }
  }

  const tick = tickBoss(boss.rules, dt);
  for (const group of tick.summons) {
    for (const id of group) {
      const p = ringPoint(rng.get('combat'), 0.5, 2, boss.x, boss.y);
      spawnMonster(state, findDef(data.monsters, id), p.x, p.y);
    }
  }
}

/**
 * Advances the run by `dt` seconds. Does nothing while a Draft is open or after the run ended.
 * Returns the skill effects to draw this frame.
 */
export function stepRun(
  state: GameState,
  rng: RunRng,
  input: Vec2,
  dt: number,
  data: RunData,
  bus?: EventBus,
): CombatFx[] {
  if (state.status !== 'playing') return [];
  openDraftIfOwed(state, rng.get('draft'), data.skills, bus);
  if (state.pendingDraft) return [];

  state.runTime = (state.runTime ?? 0) + dt;
  tickSurvival(state, dt);
  tickPlayerTraps(state, dt);
  if (state.phase === 'day') tickChests(state, rng.get('loot'));
  tickGather(state, bus); // daytime auto-pickup of ingredients (R2)
  if (!isPlayerDown(state) && (state.player.stunLeft ?? 0) <= 0) {
    movePlayer(state.player, input, dt * (state.nightBuff?.speedMult ?? 1), { width: WORLD, height: WORLD });
  }

  const before = `${state.day}:${state.phase}`;
  advanceClock(state, dt, bus);
  if (`${state.day}:${state.phase}` !== before) onPhaseStart(state, rng, data);

  if (state.phase === 'night') {
    tickSpawns(state, rng.get('combat'), data.monsters, data.waves.maxOnScreen, data.skills);
  }
  tickMonsters(state, dt, data.monsters, bus);
  tickBossFight(state, dt, rng, data, bus);

  const combat = tickSkills(state, dt, data.skills, data.monsters, rng.get('combat'), bus);
  grantXp(state, combat.xpGained, bus);
  return combat.fx;
}
