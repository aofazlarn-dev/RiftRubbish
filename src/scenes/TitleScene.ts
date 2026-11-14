import Phaser from 'phaser';
import { clearRun, loadRun } from '../core/save';
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
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    if (linkSeed) {
      this.scene.start('game', { mode: 'casual' as Mode, seed: linkSeed });
      return;
    }

    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0d0614');

    // Rift Purple & Blood Moon backdrop circles
    this.add.circle(width * 0.5, height * 0.24, compact ? 86 : 110, 0xff2a55, 0.22).setStrokeStyle(3, 0xff2a55, 0.8);
    this.add.circle(width * 0.5, height * 0.24, compact ? 116 : 145, 0x9b4dca, 0.12).setStrokeStyle(2, 0x9b4dca, 0.6);

    this.add
      .text(width * 0.5, height * 0.1, '[ SYSTEM ERROR: REINCARNATION COMPLETE ]', {
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '14px',
        color: '#4df0ff',
        align: 'center',
        wordWrap: { width: width - 24 },
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.21, 'RIFT & RUBBISH', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '34px' : '42px',
        fontStyle: 'bold',
        color: '#fff0f5',
        stroke: '#590d22',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, height * 0.3, 'รอยแยกมิติ สกิลขยะ กับระบบกวนประสาท', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '15px' : '18px',
        color: '#d8b4f8',
        align: 'center',
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5);

    const saved = loadRun();
    const hasResume = !!saved && saved.status === 'playing';
    let y = hasResume ? height * 0.44 : height * 0.5;
    const step = hasResume ? Math.min(64, height * 0.11) : Math.min(72, height * 0.13);

    if (hasResume && saved) {
      this.createMenuButton(
        width * 0.5,
        y,
        `▶ เล่นรอบเดิมต่อ (วันที่ ${saved.day}/7)`,
        0x2a9d8f,
        true,
        () => this.scene.start('game', { resumeSaved: true }),
      );
      y += step;
    }

    // 1. Casual Mode Button
    this.createMenuButton(
      width * 0.5,
      y,
      '⚔️ รอด 7 คืน (CASUAL)',
      0xff2a55,
      true,
      () => this.startGame('casual', `CASUAL-${Date.now() % 100000}`),
    );
    y += step;

    // 2. Daily Seed Button
    const todaySeed = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.createMenuButton(
      width * 0.5,
      y,
      `🎲 DAILY SEED (#${todaySeed})`,
      0x9b4dca,
      true,
      () => this.startGame('daily', `DAILY-${todaySeed}`),
    );
    y += step;

    // 3. Locked Hardcore Button (GDD §2: shown locked on launch day)
    this.createMenuButton(
      width * 0.5,
      y,
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
    const btnWidth = Math.min(340, this.scale.width - 32);
    const bg = this.add
      .rectangle(x, y, btnWidth, 48, fillColor, enabled ? 0.9 : 0.45)
      .setStrokeStyle(2, enabled ? 0xffffff : 0x6e5a85);

    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: this.scale.width < 400 ? '16px' : '18px',
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
    clearRun();
    this.scene.start('game', { mode, seed });
  }
}
