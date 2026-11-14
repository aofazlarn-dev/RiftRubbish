/** Loads and checks the JSON content once. Scenes and the sim both use this. */

import monstersJson from './monsters.json';
import skillsJson from './skills_full.json';
import wavesJson from './waves.json';
import type { RunData } from '../systems/run';
import { validateSkills } from '../systems/skills';
import type { MonsterDef, WavesData } from '../systems/waves';

export function loadRunData(): RunData {
  return {
    skills: validateSkills(skillsJson),
    // JSON imports infer a narrow literal type; the shape is checked by tests/waves.test.ts.
    monsters: monstersJson.monsters as unknown as MonsterDef[],
    waves: wavesJson as unknown as WavesData,
  };
}
