import Phaser from 'phaser';
import { exportMeta, importMeta, loadMeta, saveMeta } from '../core/metaSave';
import { buyMeta, META_ITEMS } from '../systems/meta';

/** Thai names for the approved meta items (PR #44). */
const META_NAMES: Record<string, string> = {
  META_GLOVE: 'ถุงมือพลาสติก (ดาเมจ +5%)',
  META_SLIPPER: 'รองเท้าแตะ (ความเร็ว +5%)',
  META_LID: 'ฝาถังขยะ (HP แกน +5%)',
};

/** Meta shop (approved draft, PR #44): three +5% items, bought with kept Soul Shard. */
export class MetaShopScene extends Phaser.Scene {
  constructor() {
    super('MetaShopScene');
  }

  create(): void {
    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0d0614');
    const meta = loadMeta();

    this.add
      .text(width * 0.5, height * 0.1, '🛒 ร้าน META', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '26px' : '34px',
        fontStyle: 'bold',
        color: '#fff0f5',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.18, `Soul Shard: ${meta.bank}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '18px' : '22px',
        color: '#4df0ff',
      })
      .setOrigin(0.5);

    const step = Math.min(90, height * 0.15);
    let y = height * 0.32;
    for (const item of META_ITEMS) {
      const owned = meta.owned.includes(item.id);
      const name = META_NAMES[item.id] ?? item.id;
      const label = owned ? `✔ ${name} (ซื้อแล้ว)` : `${name} — ${item.cost} Shard`;
      this.createButton(width * 0.5, y, label, owned ? 0x3a2a4d : 0x9b4dca, !owned, () => {
        const r = buyMeta(loadMeta().bank, loadMeta().owned, item.id);
        if (!r.bought) return;
        saveMeta({ ...loadMeta(), bank: r.bank, owned: r.owned });
        this.scene.restart();
      });
      y += step;
    }

    // Save by hand: copy the text to keep it, paste it back on another device (decision: localStorage + export/import).
    this.createButton(width * 0.5, height * 0.74, '⬆ ส่งออกข้อมูล', 0x3a2a4d, true, () => {
      window.prompt('คัดลอกข้อความนี้เก็บไว้', exportMeta());
    });
    this.createButton(width * 0.5, height * 0.82, '⬇ นำเข้าข้อมูล', 0x3a2a4d, true, () => {
      const text = window.prompt('วางข้อความที่ส่งออกไว้', '');
      if (!text) return;
      const next = importMeta(text, META_ITEMS.map((m) => m.id));
      if (!next) {
        window.alert('ข้อความนี้ใช้ไม่ได้ ข้อมูลเดิมยังอยู่');
        return;
      }
      saveMeta(next);
      this.scene.restart();
    });
    this.createButton(width * 0.5, height * 0.9, '← กลับ', 0xff2a55, true, () => this.scene.start('TitleScene'));
  }

  private createButton(x: number, y: number, label: string, fill: number, enabled: boolean, onClick: () => void): void {
    const w = Math.min(340, this.scale.width - 32);
    const bg = this.add.rectangle(x, y, w, 48, fill, enabled ? 0.9 : 0.45).setStrokeStyle(2, 0xffffff);
    const txt = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
      txt.setDepth(1);
    }
  }
}
