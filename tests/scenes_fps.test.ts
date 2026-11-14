import { describe, expect, it } from 'vitest';
import { createRun } from '../src/core/state';
import skillsData from '../src/data/skills.json';
import { validateSkills, type FusionRecipe } from '../src/systems/skills';
import { buildShareCardSummary, findAvailableFusions, formatDraftCardsForUI } from '../src/scenes/HudOverlayScene';
import { countGraphemes, MobileFpsMonitor } from '../src/scenes/MobileFpsMonitor';

describe('MobileFpsMonitor & countGraphemes (D23)', () => {
  it('switches to 30fps low-power mode after sustained low FPS (< 42 fps for >= 1.5s)', () => {
    const monitor = new MobileFpsMonitor(10);
    const first = monitor.recordFrame(16.6, 20);
    expect(first.targetFps).toBe(60);
    expect(monitor.isLowEndFallbackActive()).toBe(false);

    // 45 frames at 40ms (~25 fps, 1.8s total) with 40 monsters on screen
    let last = first;
    for (let i = 0; i < 45; i++) {
      last = monitor.recordFrame(40, 40);
    }
    expect(monitor.isLowEndFallbackActive()).toBe(true);
    expect(last.lowEndFallbackActive).toBe(true);
    expect(last.targetFps).toBe(30);
  });

  it('counts Thai graphemes accurately using Intl.Segmenter for the <= 70 grapheme rule (D23)', () => {
    const line = 'ระบบ: "แกนฐานรุ่นนี้ประกันหมดเมื่อวาน ระบบขออภัย"';
    expect(countGraphemes(line)).toBeLessThanOrEqual(70);
  });
});

describe('HudOverlayScene (Draft 4th Fusion card preview & Share Card §11)', () => {
  const skills = validateSkills(skillsData);
  const recipes = skillsData.fusions as FusionRecipe[];

  it('detects available fusion when both source skills are Lv >= 3 and formats alternate hint (D1)', () => {
    const state = createRun({ seed: 'test-ui' });
    // E01 (Lv4 = 420 xp) + E02 (Lv3 = 180 xp) => recipe F05 -> R05a (with alternate R05b if E02 > E01)
    state.skills.push(
      { id: 'E01', xp: 420, cooldownLeft: 0 },
      { id: 'E02', xp: 180, cooldownLeft: 0 },
    );

    const avail = findAvailableFusions(state, skills, recipes);
    expect(avail).toHaveLength(1);
    expect(avail[0].resultSkill.id).toBe('R05a');
    expect(avail[0].alternateSkill.id).toBe('R05b');

    const cards = formatDraftCardsForUI(
      state,
      ['skill:W01', 'up:E01', 'up:E02', 'fuse:F05'],
      skills,
      recipes,
    );
    expect(cards).toHaveLength(4);
    expect(cards[3].kind).toBe('fuse');
    expect(cards[3].alternateHintTh).toContain('หอกแกนลาวา');
  });

  it('builds a 7-night Wordle emoji track and ?seed= URL for the Share Card (§11)', () => {
    const state = createRun({ seed: 'RIFT-777' });
    state.day = 5;
    state.status = 'lost';
    state.skills.push({ id: 'W01', xp: 180, cooldownLeft: 0 });

    const summary = buildShareCardSummary(state, skills);
    expect(summary.nightTrackEmojis).toBe('🟩🟩🟩🐺💀⬛⬛');
    expect(summary.shareUrl).toContain('?seed=RIFT-777');
    expect(summary.topSkillsTh[0]).toContain('ฟันลาวา Lv3');
  });
});
