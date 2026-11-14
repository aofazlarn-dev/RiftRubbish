import Phaser from 'phaser';
import { exportMeta, importMeta, loadMeta, saveMeta } from '../core/metaSave';
import { buyMeta, META_ITEMS } from '../systems/meta';
import { createRoButton, drawRoIconSlot, drawRoWindow, RO_PALETTE } from '../ui/roTheme';

interface MetaDisplayInfo {
  name: string;
  desc: string;
  glyph: string;
}

const META_INFO: Record<string, MetaDisplayInfo> = {
  META_GLOVE: { name: 'ถุงมือพลาสติก', desc: 'พลังโจมตีถาวร +5% ทุกรอบ', glyph: '🧤' },
  META_SLIPPER: { name: 'รองเท้าแตะช้างดาว', desc: 'ความเร็วเคลื่อนที่ถาวร +5%', glyph: '👟' },
  META_LID: { name: 'ฝาถังขยะเสริมเหล็ก', desc: 'HP แกนฐานสูงสุดถาวร +5%', glyph: '🛡️' },
};

/** Meta shop in "RO-Rift Classic" Kafra window style: three +5% items, bought with kept Soul Shard. */
export class MetaShopScene extends Phaser.Scene {
  constructor() {
    super('MetaShopScene');
  }

  create(): void {
    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0b111e');
    const meta = loadMeta();

    const winW = Math.min(450, width - 20);
    const winH = Math.min(540, height - 24);
    const winX = Math.round((width - winW) / 2);
    const winY = Math.round((height - winH) / 2);
    const headerH = 30;

    const g = this.add.graphics();
    drawRoWindow(g, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.96 });

    this.add
      .text(winX + 24, winY + headerH / 2 + 1, compact ? '🛒 KAFRA META SHOP' : '🛒 KAFRA META SHOP · ร้านวิญญาณ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '12px' : '14px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);

    this.add
      .text(winX + winW - 40, winY + headerH / 2 + 1, `💎 ${meta.bank} Shard`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fde047',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setOrigin(1, 0.5);

    // Sub-header bank banner
    const bannerY = winY + headerH + 12;
    g.fillStyle(RO_PALETTE.windowWell, 0.95).fillRoundedRect(winX + 14, bannerY, winW - 28, 44, 5);
    g.lineStyle(1, RO_PALETTE.windowBevelDark, 1).strokeRoundedRect(winX + 14, bannerY, winW - 28, 44, 5);

    this.add
      .text(winX + 26, bannerY + 13, `Soul Shard คงเหลือ: 💎 ${meta.bank}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '14px' : '16px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0, 0.5);

    this.add
      .text(winX + 26, bannerY + 32, 'อัปเกรดถาวรติดตัว (ใช้ได้ทุกรอบทั้ง Casual และ Daily)', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#cbd5e1',
      })
      .setOrigin(0, 0.5);

    // Item slots list
    let rowY = bannerY + 56;
    const rowW = winW - 28;
    const rowH = compact ? 66 : 70;
    const rowX = winX + 14;

    for (const item of META_ITEMS) {
      const owned = meta.owned.includes(item.id);
      const affordable = meta.bank >= item.cost;
      const info = META_INFO[item.id] ?? { name: item.id, desc: '', glyph: '✨' };

      const rowBg = this.add
        .rectangle(rowX, rowY, rowW, rowH, owned ? RO_PALETTE.windowWell : RO_PALETTE.rowBg, 0.96)
        .setOrigin(0)
        .setStrokeStyle(1.5, owned ? 0x22c55e : affordable ? RO_PALETTE.windowGoldAccent : RO_PALETTE.windowBevelDark);

      // Sunken icon slot well
      const iconSize = 44;
      const iconX = rowX + 10;
      const iconY = rowY + Math.round((rowH - iconSize) / 2);
      drawRoIconSlot(g, iconX, iconY, iconSize, owned ? 0x22c55e : RO_PALETTE.windowBevelLight);
      this.add.text(iconX + iconSize / 2, iconY + iconSize / 2, info.glyph, { fontSize: '22px' }).setOrigin(0.5).setDepth(2);

      const textX = iconX + iconSize + 12;
      this.add
        .text(textX, rowY + 12, info.name, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: compact ? '14px' : '16px',
          fontStyle: 'bold',
          color: owned ? '#86efac' : '#f8fafc',
        })
        .setDepth(2);

      this.add
        .text(textX, rowY + 36, info.desc, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          color: '#cbd5e1',
          wordWrap: { width: rowW - (iconSize + 132) },
        })
        .setDepth(2);

      const pillText = owned ? '✔ ซื้อแล้ว' : `${item.cost} 💎`;
      const pillColor = owned ? '#4ade80' : affordable ? '#fde047' : '#f87171';
      this.add
        .text(rowX + rowW - 14, rowY + rowH / 2, pillText, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: compact ? '13px' : '14px',
          fontStyle: 'bold',
          color: pillColor,
          backgroundColor: '#0b111ecc',
          padding: { x: 8, y: 5 },
        })
        .setOrigin(1, 0.5)
        .setDepth(2);

      if (!owned) {
        rowBg.setInteractive({ useHandCursor: true })
          .on('pointerover', () => rowBg.setFillStyle(RO_PALETTE.rowHoverBg, 0.98))
          .on('pointerout', () => rowBg.setFillStyle(RO_PALETTE.rowBg, 0.96))
          .on('pointerup', () => {
            const cur = loadMeta();
            const r = buyMeta(cur.bank, cur.owned, item.id);
            if (!r.bought) return;
            saveMeta({ ...cur, bank: r.bank, owned: r.owned });
            this.scene.restart();
          });
      }

      rowY += rowH + 10;
    }

    // Bottom action footer: Export / Import / Back
    const backY = winY + winH - 36;
    const utilY = backY - 50;
    const halfBtnW = Math.floor((winW - 36) / 2);

    createRoButton(this, winX + 14 + halfBtnW / 2, utilY, halfBtnW, 38, '⬆ ส่งออกข้อมูล', {
      tone: 'blue',
      fontSize: compact ? '13px' : '14px',
      onClick: () => {
        window.prompt('คัดลอกข้อความนี้เก็บไว้', exportMeta());
      },
    });

    createRoButton(this, winX + winW - 14 - halfBtnW / 2, utilY, halfBtnW, 38, '⬇ นำเข้าข้อมูล', {
      tone: 'blue',
      fontSize: compact ? '13px' : '14px',
      onClick: () => {
        const text = window.prompt('วางข้อความที่ส่งออกไว้', '');
        if (!text) return;
        const next = importMeta(text, META_ITEMS.map((m) => m.id));
        if (!next) {
          window.alert('ข้อความนี้ใช้ไม่ได้ ข้อมูลเดิมยังอยู่');
          return;
        }
        saveMeta(next);
        this.scene.restart();
      },
    });

    createRoButton(this, width * 0.5, backY, winW - 28, 42, '← กลับหน้าหลัก', {
      tone: 'crimson',
      fontSize: '16px',
      onClick: () => this.scene.start('TitleScene'),
    });
  }
}
