import Phaser from 'phaser';
import { loadMeta } from '../core/metaSave';
import { clearRun, loadRun } from '../core/save';
import type { Mode } from '../core/state';
import skillsFullJson from '../data/skills_full.json';
import type { FusionRecipe, SkillDef } from '../systems/skills';
import { createRoButton, drawRoWindow, RO_PALETTE, type RoButtonTone } from '../ui/roTheme';
import { buildCodexEntries } from './codexUiModel';

const TITLE_SKILLS: readonly SkillDef[] = skillsFullJson.skills as SkillDef[];
const TITLE_RECIPES: readonly FusionRecipe[] = skillsFullJson.fusions as FusionRecipe[];

export interface TitleMenuSelection {
  mode: Mode;
  seed: string;
}

/**
 * GDD §2 & §11: Launch Title Screen in "RO-Rift Classic" steel-blue & brass aesthetic
 * layered over Rift & Rubbish's Blood Moon Key Art:
 * 1. รอด 7 คืน (Casual)
 * 2. Daily Seed
 * 3. Meta Shop & Mission Board
 * 4. 🔒 Hardcore — มาในอัปเดต 1 (Locked button per GDD §2)
 */
export class TitleScene extends Phaser.Scene {
  private codexModal?: Phaser.GameObjects.Container;
  private codexTab: 'recipes' | 'synergy' = 'recipes';

  constructor() {
    super('TitleScene');
  }

  preload(): void {
    this.load.image('title_bg', 'assets/ui/title_bg.jpg');
  }

  create(): void {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    if (linkSeed) {
      this.scene.start('game', { mode: 'casual' as Mode, seed: linkSeed });
      return;
    }

    this.codexModal = undefined;
    this.codexTab = 'recipes';
    const escHandler = () => this.closeCodexModal();
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });

    const { width, height } = this.scale;
    const compact = width < 440;
    this.cameras.main.setBackgroundColor('#0b111e');

    // Full-screen Key Art backdrop with cover scaling & deep navy-obsidian vignette
    if (this.textures.exists('title_bg')) {
      const bg = this.add.image(width * 0.5, height * 0.5, 'title_bg');
      const scale = Math.max(width / bg.width, height / bg.height);
      bg.setScale(scale).setAlpha(0.68);
    }
    this.add.rectangle(0, 0, width, height, 0x0b111e, 0.58).setOrigin(0);

    // Subtle Blood Moon & RO steel-blue emblem rings behind title
    const emblemY = compact ? 92 : Math.max(106, height * 0.16);
    this.add.circle(width * 0.5, emblemY, compact ? 64 : 84, 0xff2a55, 0.22).setStrokeStyle(2.5, RO_PALETTE.windowGoldAccent, 0.8);
    this.add.circle(width * 0.5, emblemY, compact ? 84 : 110, RO_PALETTE.headerTop, 0.16).setStrokeStyle(2, RO_PALETTE.windowBevelLight, 0.65);

    this.add
      .text(width * 0.5, compact ? 34 : Math.max(40, height * 0.06), '[ RIFT & RUBBISH · SYSTEM ERROR ]', {
        fontFamily: 'monospace',
        fontSize: compact ? '11px' : '13px',
        fontStyle: 'bold',
        color: '#93c5fd',
        backgroundColor: '#0f172add',
        padding: { x: 10, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, compact ? 80 : Math.max(88, height * 0.145), 'RIFT & RUBBISH', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '34px' : '46px',
        fontStyle: 'bold',
        color: '#fffbeb',
        stroke: '#1e1b4b',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    this.add
      .text(width * 0.5, compact ? 118 : Math.max(132, height * 0.215), 'รอยแยกมิติ สกิลขยะ กับระบบกวนประสาท', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '14px' : '18px',
        fontStyle: 'bold',
        color: '#fde68a',
        stroke: '#0b111e',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5);

    const saved = loadRun();
    const hasResume = !!saved && saved.status === 'playing';
    const meta = loadMeta();
    const todaySeed = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const menuItems: Array<{ label: string; tone: RoButtonTone; enabled: boolean; onClick?: () => void }> = [];
    if (hasResume && saved) {
      menuItems.push({
        label: `▶ เล่นรอบเดิมต่อ (วันที่ ${saved.day}/7)`,
        tone: 'teal',
        enabled: true,
        onClick: () => this.scene.start('game', { resumeSaved: true }),
      });
    }
    menuItems.push(
      {
        label: '⚔️ รอด 7 คืน (CASUAL)',
        tone: 'crimson',
        enabled: true,
        onClick: () => this.startGame('casual', `CASUAL-${Date.now() % 100000}`),
      },
      {
        label: `🎲 DAILY SEED (#${todaySeed})`,
        tone: 'blue',
        enabled: true,
        onClick: () => this.startGame('daily', `DAILY-${todaySeed}`),
      },
      {
        label: '🛒 ร้าน META (Kafra Shop)',
        tone: 'gold',
        enabled: true,
        onClick: () => this.scene.start('MetaShopScene'),
      },
      {
        label: '📜 ภารกิจวันนี้ (Quest Board)',
        tone: 'teal',
        enabled: true,
        onClick: () => this.scene.start('MissionScene'),
      },
      {
        label: '📖 สารานุกรมสูตร & Synergy',
        tone: 'blue',
        enabled: true,
        onClick: () => this.openCodexModal(),
      },
      {
        label: '🔒 HARDCORE — มาในอัปเดต 1',
        tone: 'slate',
        enabled: false,
      },
    );

    const btnH = compact ? 36 : 38;
    const gap = 7;
    const headerH = 28;
    const winW = Math.min(392, width - 20);
    const winH = headerH + 16 + menuItems.length * btnH + (menuItems.length - 1) * gap + 14;
    const titleBottom = compact ? 142 : Math.max(158, height * 0.255);
    const winX = Math.round((width - winW) / 2);
    const winY = Math.round(Math.min(height - winH - 16, Math.max(titleBottom + 12, (height + titleBottom - winH) / 2)));

    const winG = this.add.graphics();
    drawRoWindow(winG, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.92 });

    this.add
      .text(winX + 24, winY + headerH / 2 + 1, compact ? 'SYSTEM GATEWAY' : 'SYSTEM GATEWAY · เลือกโหมด', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: compact ? '12px' : '13px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);

    this.add
      .text(winX + winW - 40, winY + headerH / 2 + 1, `💎 Shard: ${meta.bank}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fde047',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setOrigin(1, 0.5);

    const btnW = winW - 28;
    let btnY = winY + headerH + 16 + btnH / 2;
    for (const item of menuItems) {
      createRoButton(this, width * 0.5, btnY, btnW, btnH, item.label, {
        tone: item.tone,
        enabled: item.enabled,
        fontSize: compact ? '15px' : '16px',
        onClick: item.onClick,
      });
      btnY += btnH + gap;
    }
  }

  private openCodexModal(): void {
    this.closeCodexModal();
    const { width: w, height: h } = this.scale;
    const { recipes, synergies } = buildCodexEntries(null, TITLE_SKILLS, TITLE_RECIPES);
    const box = this.add.container(0, 0).setDepth(2000);
    box.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.78).setOrigin(0).setInteractive());

    const winW = Math.min(540, w - 16);
    const winH = Math.min(640, h - 24);
    const winX = Math.round((w - winW) / 2);
    const winY = Math.round((h - winH) / 2);
    const headerH = 28;

    const winG = this.add.graphics();
    drawRoWindow(winG, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.97 });
    box.add(winG);

    box.add([
      this.add
        .text(winX + 24, winY + headerH / 2 + 1, 'CODEX · สารานุกรมสูตรผสม & Synergy', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(winX + winW - 12, winY + headerH / 2 + 1, '✕ ปิด', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#fda4af',
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.closeCodexModal()),
    ]);

    const tabW = Math.floor((winW - 36) / 2);
    const tabY = winY + headerH + 24;
    box.add([
      createRoButton(this, winX + 14 + tabW / 2, tabY, tabW, 30, `⚗️ สูตรผสม (${recipes.length})`, {
        tone: this.codexTab === 'recipes' ? 'gold' : 'slate',
        fontSize: '13px',
        onClick: () => {
          this.codexTab = 'recipes';
          this.openCodexModal();
        },
      }),
      createRoButton(this, winX + winW - 14 - tabW / 2, tabY, tabW, 30, `✨ ธาตุ & Synergy (${synergies.length})`, {
        tone: this.codexTab === 'synergy' ? 'gold' : 'slate',
        fontSize: '13px',
        onClick: () => {
          this.codexTab = 'synergy';
          this.openCodexModal();
        },
      }),
    ]);

    const bodyTop = tabY + 22;
    const footerH = 44;
    const listH = winH - (bodyTop - winY) - footerH;
    const listLeft = winX + 14;
    const listW = winW - 28;

    if (this.codexTab === 'recipes') {
      const rowH = Math.max(42, Math.floor(listH / recipes.length));
      recipes.forEach((r, idx) => {
        const ry = bodyTop + idx * rowH;
        const rowBg = idx % 2 === 0 ? RO_PALETTE.rowBg : 0x151e30;
        winG.fillStyle(rowBg, 0.94).fillRoundedRect(listLeft, ry, listW, rowH - 4, 4);
        winG.lineStyle(1, 0x334155, 0.9).strokeRoundedRect(listLeft, ry, listW, rowH - 4, 4);
        const coreTag = r.requiresCore ? ' · 💠 Core' : '';
        box.add([
          this.add.text(listLeft + 8, ry + 4, `${r.id} · ${r.aNameTh} + ${r.bNameTh}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11.5px',
            fontStyle: 'bold',
            color: '#f8fafc',
            wordWrap: { width: listW - 88 },
          }),
          this.add
            .text(listLeft + listW - 8, ry + 4, r.requiresCore ? 'ต้อง Lv3 + Core' : 'ต้องการ Lv3', {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '10px',
              fontStyle: 'bold',
              color: '#fde047',
            })
            .setOrigin(1, 0),
          this.add.text(listLeft + 10, ry + 21, `↳ ${r.resultANameTh} / ${r.resultBNameTh}${coreTag}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            color: '#93c5fd',
            wordWrap: { width: listW - 20 },
          }),
        ]);
      });
    } else {
      const rowH = Math.max(66, Math.floor(listH / synergies.length));
      synergies.forEach((syn, idx) => {
        const ry = bodyTop + idx * rowH;
        winG.fillStyle(RO_PALETTE.rowBg, 0.95).fillRoundedRect(listLeft, ry, listW, rowH - 5, 5);
        winG.lineStyle(1, 0x334155, 0.92).strokeRoundedRect(listLeft, ry, listW, rowH - 5, 5);
        const tierSummary = syn.tiers.map((t) => `(${t.tier}) ${t.textTh}`).join('   ');
        box.add([
          this.add.text(listLeft + 10, ry + 6, `${syn.icon} ${syn.labelTh}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: syn.colorHex,
          }),
          this.add.text(listLeft + 10, ry + 27, tierSummary, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11.5px',
            color: '#e2e8f0',
            wordWrap: { width: listW - 20 },
          }),
        ]);
      });
    }

    box.add(
      createRoButton(this, w / 2, winY + winH - 22, Math.min(220, winW - 40), 30, '[ESC] ปิดสารานุกรม', {
        tone: 'blue',
        fontSize: '13px',
        onClick: () => this.closeCodexModal(),
      }),
    );
    this.codexModal = box;
  }

  private closeCodexModal(): void {
    this.codexModal?.destroy();
    this.codexModal = undefined;
  }

  private startGame(mode: Mode, seed: string): void {
    clearRun();
    this.scene.start('game', { mode, seed });
  }
}
