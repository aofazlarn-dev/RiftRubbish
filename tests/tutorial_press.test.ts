/** Gap round 2 R5: the welcome gift is fused by the player's press, not at night start (GDD §3). */
import { describe, expect, it } from 'vitest';
import { RunRng } from '../src/core/rng';
import { createRun, PHASE_SECONDS } from '../src/core/state';
import { loadRunData } from '../src/data';
import { stepRun, submitEvening } from '../src/systems/run';
import { forceTutorialFusion } from '../src/systems/tutorial';

const data = loadRunData();

function atDuskOfDay1(mode: 'casual' | 'daily' = 'casual') {
  const s = createRun({ seed: 'r5', mode });
  const rng = RunRng.fromSeed('r5');
  s.pendingDraft = null;
  s.draftsOwed = 0;
  s.phase = 'evening';
  s.eveningResolved = false;
  submitEvening(s, null, 'trap');
  s.phaseElapsed = PHASE_SECONDS.evening - 0.01;
  return { s, rng };
}

describe('R5: tutorial fusion on press', () => {
  it('night 1 starts with the two junk skills, not the meteor', () => {
    const { s, rng } = atDuskOfDay1();
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    expect(s.phase).toBe('night');
    expect(s.tutorial).toBe('gift');
    expect(s.skills.filter((o) => o.gift).map((o) => o.id).sort()).toEqual(['J02', 'J03']);
  });

  it('the press fuses them into R01a (the scene calls forceTutorialFusion)', () => {
    const { s, rng } = atDuskOfDay1();
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    expect(forceTutorialFusion(s)).toBe(true);
    expect(s.skills.filter((o) => o.gift).map((o) => o.id)).toEqual(['R01a']);
  });

  it('with no screen (sim) the next night tick fuses it', () => {
    const { s, rng } = atDuskOfDay1();
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    expect(s.tutorial).toBe('fused');
  });

  it('Daily never gets the gift', () => {
    const { s, rng } = atDuskOfDay1('daily');
    stepRun(s, rng, { x: 0, y: 0 }, 0.05, data);
    expect(s.tutorial).toBeUndefined();
  });
});
