import Phaser from 'phaser';
import { dailyMissions } from '../systems/missions';

/** Today's missions (approved draft, PR #44): three per day in Casual, with the Shard each pays. */
export class MissionScene extends Phaser.Scene {
  constructor() {
    super('MissionScene');
  }

  create(): void {
    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0d0614');
    const today = new Date().toISOString().slice(0, 10);
    const missions = dailyMissions(today, today, 'casual');

    this.add
      .text(width * 0.5, height * 0.12, '📜 ภารกิจวันนี้', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '26px' : '34px',
        fontStyle: 'bold',
        color: '#fff0f5',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.2, `วันที่ ${today} · ทำสำเร็จจ่าย Shard ตอนรุ่งเช้า`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '14px' : '16px',
        color: '#f3d5ff',
        align: 'center',
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5);

    const labels: Record<string, string> = {
      M_KILL30: 'ฆ่ามอนให้ได้ 30 ตัวในวันเดียว',
      M_NOCORE: 'คืนนี้แกนไม่เสีย HP เลย',
      M_FUSE: 'ผสมสกิลได้ 1 ครั้งในวัน',
      M_CHEST: 'เปิดหีบเสี่ยงให้ครบ 2 ใบ',
      M_SURVIVE: 'ตายไม่เกิน 1 ครั้งในวัน',
      M_EAT: 'กินมื้อเย็นทุกคืน',
    };
    let y = height * 0.34;
    for (const m of missions) {
      this.add
        .text(width * 0.5, y, `${labels[m.id]}  (+${m.shards} Shard)`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: compact ? '16px' : '18px',
          color: '#ffffff',
          align: 'center',
          wordWrap: { width: width - 32 },
        })
        .setOrigin(0.5);
      y += Math.min(80, height * 0.13);
    }

    const back = this.add
      .rectangle(width * 0.5, height * 0.9, Math.min(340, width - 32), 48, 0xff2a55, 0.9)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width * 0.5, height * 0.9, '← กลับ', { fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    back.on('pointerdown', () => this.scene.start('TitleScene'));
  }
}
