import { describe, expect, it } from 'vitest';
import {
  buildTutorialFusionCardView,
  TUTORIAL_EXPIRE_LINE,
  TUTORIAL_WELCOME_LINE,
  TUTORIAL_WELCOME_TITLE,
} from '../src/scenes/tutorialUiModel';

describe('tutorialUiModel (G2 Welcome Gift)', () => {
  it('provides forced fusion card view for J02 + J03 -> R01a without dev terms (D24)', () => {
    const view = buildTutorialFusionCardView();
    expect(view.sourceIds).toEqual(['J02', 'J03']);
    expect(view.resultId).toBe('R01a');
    expect(view.recipeTitleTh).toContain('สะดุดล้ม');
    expect(view.recipeTitleTh).toContain('ขว้างหิน');
    expect(view.recipeTitleTh).toContain('อุกกาบาตตกใส่ตัวเอง');
    expect(view.descTh).toContain('5 เท่า');
    expect(view.descTh).toContain('20%');
    expect(view.descTh).not.toMatch(/Active|Passive|stack|aura/i);
  });

  it('matches GDD §3 exact system lines for tutorial start and dawn expire', () => {
    expect(TUTORIAL_WELCOME_TITLE).toContain('บังคับผสม');
    expect(TUTORIAL_WELCOME_LINE).toContain('ระบบ:');
    expect(TUTORIAL_EXPIRE_LINE).toBe('ทดลองใช้ฟรีหมดแล้ว อยากได้ก็ผสมเองสิ');
  });
});
