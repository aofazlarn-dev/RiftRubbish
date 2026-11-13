/**
 * Headless balance sim (backlog #9). Pure functions, no Phaser, no randomness.
 * Reproduces the hand calculations in docs/content/balance.md so a number change
 * there (or in src/) shows up as a failing test instead of a silent drift.
 *
 *  - Skill XP timing: balance §2.2–§2.3
 *  - Required DPS per night: balance §5.1, §5.4 (night 4 Elite kill rate 0.6, D21)
 */

import type { Phase } from '../src/core/events';
import { PHASE_SECONDS } from '../src/core/state';
import { SKILL_XP_THRESHOLDS, type SkillKind } from '../src/systems/skills';

/** Share of a phase in which an Active skill has a target (balance §2.2). */
export const ACTIVE_UPTIME: Record<Phase, number> = { day: 0.5, evening: 0, night: 1 };
/** Active skills earn their cooldown per hitting cast, i.e. ~1 SXP per second with a target. */
export const ACTIVE_SXP_PER_SECOND = 1;
/** Passive skills earn a flat rate in every phase, evening included. */
export const PASSIVE_SXP_PER_SECOND = 0.6;

const PHASE_ORDER: readonly Phase[] = ['day', 'evening', 'night'];

export interface SkillXpRun {
  kind: SkillKind;
  /** Game second the skill is equipped (0 = start of day 1). */
  acquiredAt: number;
  /** Skill XP granted by Draft "upgrade" cards, added at acquisition for simplicity. */
  bonusXp?: number;
}

function sxpRate(kind: SkillKind, phase: Phase): number {
  return kind === 'active' ? ACTIVE_SXP_PER_SECOND * ACTIVE_UPTIME[phase] : PASSIVE_SXP_PER_SECOND;
}

/**
 * Game second at which the skill reaches `level`, or null if not within `maxDays`.
 * Walks the day/evening/night timeline phase by phase.
 */
export function timeToSkillLevel(run: SkillXpRun, level: number, maxDays = 7): number | null {
  const target = SKILL_XP_THRESHOLDS[level];
  if (target === undefined) throw new Error(`No Skill XP threshold for level ${level}`);
  let xp = run.bonusXp ?? 0;
  if (xp >= target) return run.acquiredAt;

  let phaseStart = 0;
  for (let day = 1; day <= maxDays; day++) {
    for (const phase of PHASE_ORDER) {
      const phaseEnd = phaseStart + PHASE_SECONDS[phase];
      const from = Math.max(phaseStart, run.acquiredAt);
      if (from < phaseEnd) {
        const rate = sxpRate(run.kind, phase);
        const gain = rate * (phaseEnd - from);
        if (rate > 0 && xp + gain >= target) return from + (target - xp) / rate;
        xp += gain;
      }
      phaseStart = phaseEnd;
    }
  }
  return null;
}

export interface NightHp {
  night: number;
  /** Effective HP of normal monsters (balance §5.1, "มีผล" column). */
  normalHp: number;
  /** Elite + split bodies, night 4 only. */
  eliteHp: number;
}

/** Nights 1–6 from balance §5.1. Night 7 is the boss and is computed separately. */
export const NIGHT_HP: readonly NightHp[] = [
  { night: 1, normalHp: 448, eliteHp: 0 },
  { night: 2, normalHp: 952, eliteHp: 0 },
  { night: 3, normalHp: 1382, eliteHp: 0 },
  { night: 4, normalHp: 1480, eliteHp: 890 },
  { night: 5, normalHp: 2627, eliteHp: 0 },
  { night: 6, normalHp: 3335, eliteHp: 0 },
];

/** Extra DPS a two-element build needs against resistant monsters (balance §5.4). */
export const RESIST_MULTIPLIER: Record<number, number> = { 1: 1, 2: 1, 3: 1.05, 4: 1.1, 5: 1.2, 6: 1.2 };

const NORMAL_KILL_RATE = 0.85;
const ELITE_KILL_RATE = 0.6; // night 4 (D21)

/** DPS needed to kill ~85% of a night's monsters in the 40 s night (balance §5.4). */
export function requiredDps(night: NightHp): number {
  const hp = night.normalHp * NORMAL_KILL_RATE + night.eliteHp * ELITE_KILL_RATE;
  return (hp / PHASE_SECONDS.night) * (RESIST_MULTIPLIER[night.night] ?? 1);
}

/** Median-build DPS per night from the balance §5.4 table, used to report the tightness ratio. */
export const MEDIAN_DPS: Record<number, number> = { 1: 22, 2: 30, 3: 52, 4: 68, 5: 80, 6: 95 };

export interface NightReport {
  night: number;
  requiredDps: number;
  medianDps: number;
  /** required / median: ≤0.7 comfortable, 0.8–0.9 tight, >0.95 likely death (balance §5.4). */
  ratio: number;
}

export function nightReport(): NightReport[] {
  return NIGHT_HP.map((n) => {
    const required = requiredDps(n);
    const median = MEDIAN_DPS[n.night];
    return { night: n.night, requiredDps: required, medianDps: median, ratio: required / median };
  });
}
