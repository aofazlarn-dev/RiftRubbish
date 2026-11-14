import Phaser from 'phaser';
import type { Mode } from '../core/state';

export interface TitleMenuSelection {
  mode: Mode;
  seed: string;
}

/**
 * GDD §2 & §11: Launch Title Screen in Blood Moon Red (#ff2a55) & Rift Purple (#9b4dca) palette:
 * 1. รอด 7 คืน (Casual)
 * 2. Daily Seed
 * 3. 🔒 Hardcore — มาในอัปเดต 1 (Locked button per GDD §2)
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d0614');

    // Rift Purple & Blood Moon backdrop circles
    this.add.circle(width * 0.5, height * 0.28, 110, 0xff2a55, 0.22).setStrokeStyle(3, 0xff2a55, 0.8);
    this.add.circle(width * 0.5, height * 0.28, 145, 0x9b4dca, 0.12).setStrokeStyle(2, 0x9b4dca, 0.6);

    this.add
      .text(width * 0.5, height * 0.12, '[ SYSTEM ERROR: REINCARNATION COMPLETE ]', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4df0ff',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.24, 'RIFT & RUBBISH', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '42px',
        fontStyle: 'bold',
        color: '#fff0f5',
        stroke: '#590d22',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.34, 'รอยแยกมิติ สกิลขยะ กับระบบกวนประสาท', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#d8b4f8',
      })
      .setOrigin(0.5);

    // 1. Casual Mode Button
    this.createMenuButton(
      width * 0.5,
      height * 0.52,
      '⚔️ รอด 7 คืน (CASUAL)',
      0xff2a55,
      true,
      () => this.startGame('casual', `CASUAL-${Date.now() % 100000}`),
    );

    // 2. Daily Seed Button
    const todaySeed = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.createMenuButton(
      width * 0.5,
      height * 0.65,
      `🎲 DAILY SEED (#${todaySeed})`,
      0x9b4dca,
      true,
      () => this.startGame('daily', `DAILY-${todaySeed}`),
    );

    // 3. Locked Hardcore Button (GDD §2: shown locked on launch day)
    this.createMenuButton(
      width * 0.5,
      height * 0.78,
      '🔒 HARDCORE — มาในอัปเดต 1',
      0x3a2a4d,
      false,
    );
  }

  private createMenuButton(
    x: number,
    y: number,
    label: string,
    fillColor: number,
    enabled: boolean,
    onClick?: () => void,
  ): void {
    const bg = this.add
      .rectangle(x, y, 340, 48, fillColor, enabled ? 0.9 : 0.45)
      .setStrokeStyle(2, enabled ? 0xffffff : 0x6e5a85);

    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: enabled ? '#ffffff' : '#9a8bb0',
      })
      .setOrigin(0.5);

    if (enabled && onClick) {
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setAlpha(1))
        .on('pointerout', () => bg.setAlpha(0.9))
        .on('pointerdown', onClick);
      txt.setDepth(1);
    }
  }

  private startGame(mode: Mode, seed: string): void {
    this.scene.start('game', { mode, seed });
  }
}
