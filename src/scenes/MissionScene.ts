import Phaser from 'phaser';
import { dailyMissions } from '../systems/missions';
import { createRoButton, drawRoIconSlot, drawRoWindow, RO_PALETTE } from '../ui/roTheme';

const MISSION_LABELS: Record<string, { title: string; glyph: string }> = {
  M_KILL30: { title: 'ฆ่ามอนให้ได้ 30 ตัวในวันเดียว', glyph: '⚔️' },
  M_NOCORE: { title: 'คืนนี้แกนฐานไม่เสีย HP เลย', glyph: '🛡️' },
  M_FUSE: { title: 'ผสมสกิลได้ 1 ครั้งในวัน', glyph: '⚗️' },
  M_CHEST: { title: 'เปิดหีบเสี่ยงให้ครบ 2 ใบ', glyph: '🧰' },
  M_SURVIVE: { title: 'ตายไม่เกิน 1 ครั้งในวัน', glyph: '💚' },
  M_EAT: { title: 'กินมื้อเย็นทุกคืน', glyph: '🍖' },
};

/** Today's missions in "RO-Rift Classic" Eden Quest Board style: three per day in Casual. */
export class MissionScene extends Phaser.Scene {
  constructor() {
    super('MissionScene');
  }

  create(): void {
    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0b111e');
    const today = new Date().toISOString().slice(0, 10);
    const missions = dailyMissions(today, today, 'casual');

    const winW = Math.min(450, width - 20);
    const winH = Math.min(500, height - 24);
    const winX = Math.round((width - winW) / 2);
    const winY = Math.round((height - winH) / 2);
    const headerH = 30;

    const g = this.add.graphics();
    drawRoWindow(g, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.96 });

    this.add
      .text(winX + 24, winY + headerH / 2 + 1, compact ? '📜 EDEN QUEST BOARD' : '📜 EDEN QUEST BOARD · ภารกิจวันนี้', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '12px' : '14px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);

    this.add
      .text(winX + winW - 40, winY + headerH / 2 + 1, 'Casual Mode', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#93c5fd',
      })
      .setOrigin(1, 0.5);

    // Date subtitle banner
    const bannerY = winY + headerH + 12;
    g.fillStyle(RO_PALETTE.windowWell, 0.95).fillRoundedRect(winX + 14, bannerY, winW - 28, 38, 5);
    g.lineStyle(1, RO_PALETTE.windowBevelDark, 1).strokeRoundedRect(winX + 14, bannerY, winW - 28, 38, 5);
    this.add
      .text(width * 0.5, bannerY + 19, `วันที่ ${today} · ทำสำเร็จจ่าย Soul Shard ตอนรุ่งเช้า`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '12px' : '14px',
        color: '#fde68a',
        align: 'center',
        wordWrap: { width: winW - 44 },
      })
      .setOrigin(0.5);

    // Quest cards
    let cardY = bannerY + 52;
    const cardW = winW - 28;
    const cardH = compact ? 76 : 82;
    const cardX = winX + 14;

    missions.forEach((m, idx) => {
      const info = MISSION_LABELS[m.id] ?? { title: m.id, glyph: '📜' };
      g.fillStyle(RO_PALETTE.rowBg, 0.96).fillRoundedRect(cardX, cardY, cardW, cardH, 6);
      g.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.85).strokeRoundedRect(cardX, cardY, cardW, cardH, 6);

      const iconSize = 44;
      const iconX = cardX + 12;
      const iconY = cardY + Math.round((cardH - iconSize) / 2);
      drawRoIconSlot(g, iconX, iconY, iconSize, RO_PALETTE.windowGoldAccent);
      this.add.text(iconX + iconSize / 2, iconY + iconSize / 2, info.glyph, { fontSize: '22px' }).setOrigin(0.5);

      const textX = iconX + iconSize + 12;
      this.add.text(textX, cardY + 11, `[QUEST #${idx + 1}]`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#e5c158',
      });

      this.add.text(textX, cardY + 28, info.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '14px' : '15px',
        fontStyle: 'bold',
        color: '#f8fafc',
        wordWrap: { width: cardW - (iconSize + 132) },
      });

      this.add
        .text(cardX + cardW - 12, cardY + cardH / 2, `+${m.shards} 💎`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#fde047',
          backgroundColor: '#0b111edd',
          padding: { x: 9, y: 5 },
        })
        .setOrigin(1, 0.5);

      cardY += cardH + 12;
    });

    createRoButton(this, width * 0.5, winY + winH - 36, winW - 28, 42, '← กลับหน้าหลัก', {
      tone: 'crimson',
      fontSize: '16px',
      onClick: () => this.scene.start('TitleScene'),
    });
  }
}
