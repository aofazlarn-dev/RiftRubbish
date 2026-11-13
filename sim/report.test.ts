/**
 * Not a pass/fail test: prints bot results for a few seeds so balance can be read from the log.
 * Run with: npx vitest run sim/report.test.ts --config sim/vitest.report.config.ts
 */
import { it } from 'vitest';
import { runBot } from './bot';

it('bot report', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => {
    const r = runBot(`report-${s}`);
    return `${s}: ${r.status} day ${r.day} ${r.phase} t=${r.seconds}s lv${r.level} kills ${r.kills} core ${r.coreHp} deaths ${r.deaths} skills ${r.skills.join(',')} coreAtNight ${r.coreAtNight.join('/')}`;
  });
  console.log('\n' + rows.join('\n'));
});
