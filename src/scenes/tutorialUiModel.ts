/**
 * Pure UI model for the G2 Welcome Gift tutorial overlay (GDD §3, D15, D24).
 * Kept free of Phaser so it can be tested directly in Vitest.
 */

export const TUTORIAL_WELCOME_TITLE = 'ของขวัญต้อนรับจากระบบ! (บังคับผสม)';
export const TUTORIAL_WELCOME_LINE = 'ระบบ: "เห็นแก่มือใหม่ เอาขยะสองชิ้นนี้ไปยำรวมกันซะ"';
export const TUTORIAL_EXPIRE_LINE = 'ทดลองใช้ฟรีหมดแล้ว อยากได้ก็ผสมเองสิ';

export interface TutorialFusionCardView {
  recipeTitleTh: string;
  resultNameTh: string;
  descTh: string;
  buttonLabelTh: string;
  sourceIds: readonly ['J02', 'J03'];
  resultId: 'R01a';
}

export function buildTutorialFusionCardView(): TutorialFusionCardView {
  return {
    recipeTitleTh: 'สะดุดล้ม + ขว้างหิน → อุกกาบาตตกใส่ตัวเอง',
    resultNameTh: 'อุกกาบาตตกใส่ตัวเอง (ทดลองใช้)',
    descTh:
      'ร่ายอุกกาบาตพลัง 5 เท่าของขว้างหิน! เสียเลือดสูงสุด 10% ต่อครั้ง (เหลือต่ำสุด 1 HP และหยุดร่ายเองเมื่อเลือด ≤ 20%) ใช้ได้ถึงรุ่งเช้าวันถัดไป',
    buttonLabelTh: 'กดผสมรับของขวัญ [1]',
    sourceIds: ['J02', 'J03'],
    resultId: 'R01a',
  };
}
