/**
 * Vertical-slice arena. Draws GameState and forwards input; every rule lives in src/systems
 * (stepRun). Placeholder shapes only — art comes from docs/art_requests.md later.
 */

import Phaser from 'phaser';
import { SoundEffects } from '../audio/sfx';
import { EventBus } from '../core/events';
import { RunRng } from '../core/rng';
import { autoSaveOnHide, clearRun, loadRun, saveRun } from '../core/save';
import { createRun, type GameState, type Mode } from '../core/state';
import { CORE_X, CORE_Y, MAP_TILES, TILE, WORLD } from '../core/world';
import { loadRunData } from '../data';
import skillsFullJson from '../data/skills_full.json';
import { VirtualJoystick } from '../input/joystick';
import { isPlayerDown } from '../systems/base';
import { phaseRemaining } from '../systems/clock';
import type { CombatFx } from '../systems/combat';
import { dailySeed } from '../systems/daily';
import { autoMealId, type EveningChoiceId } from '../systems/evening';
import type { Vec2 } from '../systems/movement';
import { attachMissionTracker } from '../systems/missionTracker';
import { pickDraft, upgradeXp, xpToNext } from '../systems/progression';
import { recallToEvening, startRun, stepRun, submitEvening, type RunData } from '../systems/run';
import { attachShardLedger } from '../systems/shards';
import { damageAtLevel, levelForXp, ownedLevel, type FusionRecipe, type Rarity, type SkillDef } from '../systems/skills';
import { attachSystemVoice } from '../systems/systemVoice';
import { DebugOverlay } from '../ui/DebugOverlay';
import {
  createRoButton,
  drawRoGaugeBar,
  drawRoIconSlot,
  drawRoWindow,
  formatExpPercent,
  hotkeyLabelForSlot,
  RO_PALETTE,
} from '../ui/roTheme';
import { buildEveningOffer, formatInventorySummary, formatSynergySummary } from './eveningUiModel';
import { buildShareCardSummary, findAvailableFusions, pickFusionCard } from './HudOverlayScene';
import { MobileFpsMonitor, type FpsMonitorSnapshot } from './MobileFpsMonitor';
import {
  buildTutorialFusionCardView,
  TUTORIAL_EXPIRE_LINE,
  TUTORIAL_WELCOME_LINE,
  TUTORIAL_WELCOME_TITLE,
} from './tutorialUiModel';

const FUSION_RECIPES: readonly FusionRecipe[] = skillsFullJson.fusions as FusionRecipe[];

const PHASE_TINT = { day: 0x000000, evening: 0x3a1a00, night: 0x05001a } as const;
const PHASE_ALPHA = { day: 0, evening: 0.25, night: 0.5 } as const;
const PHASE_LABEL = { day: 'กลางวัน', evening: 'เย็น', night: 'กลางคืน' } as const;

/** Sprite sheet texture key per monster `defId`. */
const MONSTER_SPRITE: Record<string, string> = {
  slime: 'mob_slime_walk',
  bat: 'mob_bat_walk',
  goblin: 'mob_goblin_walk',
  skeleton: 'mob_skeleton_archer_walk',
  golem: 'mob_mud_golem_walk',
  spirit: 'mob_fog_wraith_walk',
  rift_wolf: 'elite_rift_wolf_walk',
};
const SKILL_ICON_IDS: readonly string[] = skillsFullJson.skills.map((s) => s.id);
const CARD_FRAME_KEYS = ['common', 'rare', 'epic', 'legendary', 'mythic', 'fusion'] as const;
const VFX_SHAPES = ['projectile', 'cone', 'ring', 'line'] as const;
const TAG_FX_COLOR: Record<string, number> = {
  fire: 0xff5400,
  ice: 0x48cae4,
  lightning: 0xffe66d,
  shadow: 0xc77dff,
  earth: 0x8d6e63,
  junk: 0xadb5bd,
};
const FX_COLOR: Record<string, number> = { W01: 0xff7b00, E01: 0xff4d00, E02: 0x8ecae6, E03: 0xffe066, J03: 0xb0a090 };
const FX_SECONDS = 0.38;

// Player-facing words: no dev terms such as Active/Passive (D24).
const KIND_LABEL: Record<SkillDef['kind'], string> = { active: 'สกิลโจมตี', passive: 'สกิลติดตัว' };
const RARITY_LABEL: Record<Rarity, string> = {
  common: 'ธรรมดา',
  rare: 'หายาก',
  epic: 'มหากาพย์',
  legendary: 'ตำนาน',
  mythic: 'เทพนิยาย',
};
const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x6c757d,
  rare: 0x3a86ff,
  epic: 0x9d4edd,
  legendary: 0xffb703,
  mythic: 0xff006e,
};

interface LiveFx extends CombatFx {
  ttl: number;
}

interface CombatPopup {
  text: Phaser.GameObjects.Text;
  ttl: number;
  maxTtl: number;
  vy: number;
}

export class GameScene extends Phaser.Scene {
  state!: GameState;
  bus = new EventBus();
  rng!: RunRng;
  private data_!: RunData;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private bossSprite!: Phaser.GameObjects.Sprite;
  private coreSprite!: Phaser.GameObjects.Sprite;
  private monsterSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private spritePool: Phaser.GameObjects.Sprite[] = [];
  private shadowGraphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private fxPool: Phaser.GameObjects.Image[] = [];
  private activeFxSprites: Phaser.GameObjects.Image[] = [];
  private barGraphics!: Phaser.GameObjects.Graphics;
  private liveFx: LiveFx[] = [];
  private combatPopups: CombatPopup[] = [];
  private popupPool: Phaser.GameObjects.Text[] = [];
  private animTime = 0;
  private castPoseLeft = 0;
  private sfx = new SoundEffects();
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private joystick!: VirtualJoystick;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudTitle!: Phaser.GameObjects.Text;
  private hudHpText!: Phaser.GameObjects.Text;
  private hudCoreText!: Phaser.GameObjects.Text;
  private hudMetaText!: Phaser.GameObjects.Text;
  private hudInvText!: Phaser.GameObjects.Text;
  private downBanner!: Phaser.GameObjects.Text;
  private recallBtn!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;
  private restartBtn!: Phaser.GameObjects.Text;
  private skillDock?: Phaser.GameObjects.Container;
  private skillDockKey = '';
  private hudPanelH = 126;
  private phaseShade!: Phaser.GameObjects.Rectangle;
  private debug!: DebugOverlay;
  private fpsMonitor = new MobileFpsMonitor();
  private stopAutoSave?: () => void;
  private overlay?: Phaser.GameObjects.Container;
  /** What the overlay currently shows, so it is rebuilt only when that changes. */
  private overlayKey = '';
  private launchOpts?: { mode?: Mode; seed?: string; resumeSaved?: boolean };
  private eveningPending = false;
  private eveningMealId: string | null = null;
  private eveningChoiceId: EveningChoiceId | null = null;
  private overtimeUsed = false;
  private tutorialPending = false;
  private tutorialShown = false;
  private tutorialExpireShown = false;
  private systemToast!: Phaser.GameObjects.Text;
  private systemToastLeft = 0;

  constructor() {
    super('game');
  }

  init(data?: { mode?: Mode; seed?: string; resumeSaved?: boolean }): void {
    this.launchOpts = data;
  }

  preload(): void {
    for (let i = 1; i <= 5; i++) {
      this.load.image(`tile_ground_0${i}`, `assets/tiles/tile_ground_0${i}.png`);
    }
    this.load.spritesheet('base_core', 'assets/sprites/base_core.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('hero_idle', 'assets/sprites/hero_idle.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('hero_walk', 'assets/sprites/hero_walk.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('hero_hit', 'assets/sprites/hero_hit.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('hero_death', 'assets/sprites/hero_death.png', { frameWidth: 32, frameHeight: 32 });

    for (const key of [
      'mob_slime_walk',
      'mob_bat_walk',
      'mob_goblin_walk',
      'mob_skeleton_archer_walk',
      'mob_mud_golem_walk',
      'mob_fog_wraith_walk',
    ]) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, { frameWidth: 32, frameHeight: 32 });
    }
    this.load.spritesheet('elite_rift_wolf_walk', 'assets/sprites/elite_rift_wolf_walk.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet('boss_bloodmoon_walk', 'assets/sprites/boss_bloodmoon_walk.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet('boss_bloodmoon_enrage_walk', 'assets/sprites/boss_bloodmoon_enrage_walk.png', {
      frameWidth: 128,
      frameHeight: 128,
    });

    for (const id of SKILL_ICON_IDS) {
      this.load.image(`icon_${id}`, `assets/icons/${id}.png`);
    }
    for (const r of CARD_FRAME_KEYS) {
      this.load.image(`card_frame_${r}`, `assets/ui/card_frame_${r}.png`);
    }
    for (const shape of VFX_SHAPES) {
      this.load.image(`vfx_${shape}`, `assets/vfx/vfx_${shape}.png`);
    }
  }

  private ensureAnimations(): void {
    const makeAnim = (key: string, frames: number, frameRate: number, repeat: number) => {
      if (this.anims.exists(key) || !this.textures.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }),
        frameRate,
        repeat,
      });
    };
    makeAnim('hero_idle', 2, 4, -1);
    makeAnim('hero_walk', 4, 10, -1);
    makeAnim('hero_death', 4, 8, 0);
    for (const key of Object.values(MONSTER_SPRITE)) {
      makeAnim(key, 4, key === 'mob_bat_walk' ? 10 : 8, -1);
    }
    makeAnim('boss_bloodmoon_walk', 4, 8, -1);
    makeAnim('boss_bloodmoon_enrage_walk', 4, 10, -1);
  }

  create(): void {
    this.data_ = loadRunData();
    this.monsterSprites.clear();
    this.spritePool = [];
    this.fxPool = [];
    this.activeFxSprites = [];
    this.liveFx = [];
    this.combatPopups = [];
    this.popupPool = [];
    this.animTime = 0;
    this.castPoseLeft = 0;
    this.overlay = undefined;
    this.overlayKey = '';
    this.skillDock = undefined;
    this.skillDockKey = '';
    this.bus.clear();
    this.ensureAnimations();

    const resumed = this.resume();
    this.state = resumed ?? this.newState();
    // A save made during an open evening reopens the same evening screen (GDD §10).
    this.eveningPending = this.state.phase === 'evening' && this.state.eveningResolved === false;
    this.eveningMealId = this.eveningPending ? autoMealId(this.state.inventory ?? {}) : null;
    this.eveningChoiceId = 'trap';
    this.tutorialPending = false;
    this.tutorialShown = this.state.tutorial === 'fused' || this.state.tutorial === 'done';
    this.tutorialExpireShown = this.state.tutorial === 'done';
    this.systemToast = this.add
      .text(this.scale.width / 2, 16, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#fde68a',
        backgroundColor: '#182238ee',
        stroke: '#0b111e',
        strokeThickness: 2,
        padding: { x: 14, y: 7 },
        align: 'center',
        wordWrap: { width: Math.min(460, this.scale.width - 24) },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1600)
      .setVisible(false);
    this.bus.on('system:say', ({ th }) => {
      this.showSystemToast(`ระบบ: "${th}"`, 5);
    });
    this.rng = RunRng.restore(this.state.seed, this.state.rng);
    if (resumed) {
      attachSystemVoice(this.bus, this.state);
      attachShardLedger(this.bus, this.state);
      attachMissionTracker(this.bus, this.state);
    } else {
      startRun(this.state, this.rng, this.data_, this.bus);
    }

    // Dev builds only: lets a debugger reach the live state (e.g. to test the end screens).
    if (import.meta.env.DEV) (window as unknown as { __scene?: GameScene }).__scene = this;

    this.drawWorld();
    this.shadowGraphics = this.add.graphics().setDepth(4);
    this.barGraphics = this.add.graphics().setDepth(20);
    this.fxGraphics = this.add.graphics().setDepth(15);
    this.bossSprite = this.add.sprite(0, 0, 'boss_bloodmoon_walk').setDepth(9).setVisible(false);
    this.playerSprite = this.add.sprite(this.state.player.x, this.state.player.y, 'hero_idle').setScale(1.45).setDepth(10);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.playerSprite, true, 0.15, 0.15);

    this.phaseShade = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(500);

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'), down: kb.addKey('DOWN'), left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'),
      w: kb.addKey('W'), a: kb.addKey('A'), s: kb.addKey('S'), d: kb.addKey('D'),
    };
    kb.on('keydown-R', () => {
      if (this.state.status === 'playing' && !this.state.pendingDraft) recallToEvening(this.state, this.rng, this.data_, this.bus);
    });
    kb.on('keydown-N', () => this.newRun());
    kb.on('keydown-M', () => {
      this.sfx.toggleMute();
    });
    for (const [key, index] of [['ONE', 0], ['TWO', 1], ['THREE', 2], ['FOUR', 3]] as const) {
      kb.on(`keydown-${key}`, () => this.choose(index));
    }
    this.joystick = new VirtualJoystick(this);

    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(890);
    this.hudTitle = this.add
      .text(31, 15, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f8fafc',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(900);
    this.hudHpText = this.add
      .text(23, 40, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(901);
    this.hudCoreText = this.add
      .text(23, 58, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(901);
    this.hudMetaText = this.add
      .text(18, 86, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fef08a',
        stroke: '#0b111e',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(900);
    this.hudInvText = this.add
      .text(21, 105, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#bae6fd',
        wordWrap: { width: 224 },
      })
      .setScrollFactor(0)
      .setDepth(900);
    this.downBanner = this.add
      .text(this.scale.width / 2, 200, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#fecdd3',
        backgroundColor: '#4c1127ee',
        stroke: '#0b111e',
        strokeThickness: 2,
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(905)
      .setVisible(false);

    const btnStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f8fafc',
      backgroundColor: '#1d2b45ee',
      stroke: '#0b111e',
      strokeThickness: 2,
      padding: { x: 9, y: 5 },
    };
    const btnY = this.scale.height - 34;
    this.recallBtn = this.add
      .text(10, btnY, '[R] เรียกคืนเร็ว', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.state.status === 'playing' && !this.state.pendingDraft) recallToEvening(this.state, this.rng, this.data_, this.bus);
      });
    this.muteBtn = this.add
      .text(122, btnY, '[M] เสียง: เปิด', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.sfx.toggleMute();
      });
    this.restartBtn = this.add
      .text(226, btnY, '[N] รอบใหม่', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.newRun());

    this.debug = new DebugOverlay(this);
    const onResize = (size: Phaser.Structs.Size) => {
      const y = size.height - 34;
      this.recallBtn.setY(y);
      this.muteBtn.setY(y);
      this.restartBtn.setY(y);
      this.downBanner.setX(size.width / 2);
      this.systemToast.setWordWrapWidth(Math.min(460, size.width - 24));
      this.positionSystemToast();
    };
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this.bus.on('phase:change', ({ day, phase }) => {
      this.cameras.main.flash(250, 255, 255, 255, false);
      this.sfx.playPhase(phase);
      console.info(`[phase] day ${day} → ${phase}`);
      if (phase === 'evening') {
        // Nothing is cooked yet: the evening is resolved only when the player confirms (R1).
        this.eveningMealId = autoMealId(this.state.inventory ?? {});
        this.eveningChoiceId = 'trap';
        this.eveningPending = true;
      } else if (phase === 'night' && day === 1 && this.state.mode === 'casual' && !this.tutorialShown) {
        this.tutorialPending = true;
        this.tutorialShown = true;
      } else if (phase === 'day' && day === 2 && this.state.mode === 'casual' && !this.tutorialExpireShown) {
        this.tutorialExpireShown = true;
        this.showSystemToast(`ระบบ: "${TUTORIAL_EXPIRE_LINE}"`, 6);
      }
      saveRun(this.syncAndGetState()); // snapshot at each phase boundary as well
    });
    this.bus.on('player:down', () => {
      this.cameras.main.shake(300, 0.01);
      this.sfx.playHurt();
    });
    this.bus.on('player:levelup', () => this.sfx.playLevelUp());
    this.bus.on('run:end', () => clearRun()); // a finished run cannot be resumed

    this.stopAutoSave = autoSaveOnHide(
      () => this.syncAndGetState(),
      () => this.scene.pause(),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopAutoSave?.());
    this.game.events.on(Phaser.Core.Events.VISIBLE, () => this.scene.resume());
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1); // clamp long frames (tab switch, GC pause)
    this.animTime += dt;
    if (this.castPoseLeft > 0) this.castPoseLeft = Math.max(0, this.castPoseLeft - dt);
    if (!this.eveningPending && !this.tutorialPending) {
      const fx = stepRun(this.state, this.rng, this.readInput(), dt, this.data_, this.bus);
      if (fx.some((f) => !f.missed)) {
        this.sfx.playCast();
        this.castPoseLeft = 0.24;
      }
      for (const f of fx) {
        this.liveFx.push({ ...f, ttl: FX_SECONDS });
        this.spawnCombatPopup(f);
      }

      if (this.state.mode === 'casual' && this.state.tutorial === 'fused' && !this.tutorialShown) {
        this.tutorialPending = true;
        this.tutorialShown = true;
      } else if (this.state.mode === 'casual' && this.state.tutorial === 'done' && !this.tutorialExpireShown) {
        this.tutorialExpireShown = true;
        this.showSystemToast(`ระบบ: "${TUTORIAL_EXPIRE_LINE}"`, 6);
      }
    }
    if (this.systemToastLeft > 0) {
      this.systemToastLeft = Math.max(0, this.systemToastLeft - dt);
      this.systemToast.setVisible(this.systemToastLeft > 0);
    }
    const fpsSnap = this.fpsMonitor.recordFrame(deltaMs, this.state.monsters.length);

    this.drawActors();
    this.drawFx(dt);
    this.drawBars();
    this.phaseShade.setFillStyle(PHASE_TINT[this.state.phase], PHASE_ALPHA[this.state.phase]);
    this.phaseShade.setSize(this.scale.width, this.scale.height);
    this.drawHud(fpsSnap);
    this.syncOverlay();
    this.debug.update(this.state, this.children.length);
  }

  private readInput(): Vec2 {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (x !== 0 || y !== 0) return { x, y };
    return this.joystick.vector;
  }

  // ---- drawing -------------------------------------------------------------------------

  private drawActors(): void {
    const s = this.state;
    const sg = this.shadowGraphics.clear();
    const move = this.readInput();
    const moving = move.x !== 0 || move.y !== 0;
    const down = isPlayerDown(s);

    sg.fillStyle(0x090d16, 0.36).fillEllipse(CORE_X, CORE_Y + 26, 64, 18);
    const corePulse = 0.22 + 0.1 * Math.sin(this.animTime * 3.2);
    sg.lineStyle(2, 0xc084fc, corePulse).strokeCircle(CORE_X, CORE_Y + 6, 42 + Math.sin(this.animTime * 2.5) * 3);

    if (move.x !== 0) this.playerSprite.setFlipX(move.x < 0);
    const bob = !down && moving ? Math.abs(Math.sin(this.animTime * 14)) * 3 : 0;
    this.playerSprite.setPosition(s.player.x, s.player.y - bob);
    sg.fillStyle(0x090d16, down ? 0.22 : 0.38).fillEllipse(s.player.x, s.player.y + 15, 28, 10);

    if (!down && this.castPoseLeft > 0) {
      const auraAlpha = Math.min(1, this.castPoseLeft / 0.24) * 0.6;
      sg.lineStyle(2.5, 0xfbbf24, auraAlpha).strokeEllipse(s.player.x, s.player.y + 13, 44, 18);
      sg.fillStyle(0x38bdf8, auraAlpha * 0.25).fillEllipse(s.player.x, s.player.y + 13, 38, 14);
    }

    if (down) {
      this.playerSprite.setAlpha(0.55).clearTint().setScale(1.45, 1.45).setRotation(0);
      if (this.playerSprite.anims.currentAnim?.key !== 'hero_death') this.playerSprite.play('hero_death', true);
    } else if (s.invulnLeft > 0) {
      this.playerSprite.setAlpha(0.85).setTexture('hero_hit', 0).setTint(0xff8080).setScale(1.52, 1.38).setRotation(0);
    } else {
      this.playerSprite.setAlpha(1).clearTint();
      this.playerSprite.play(moving ? 'hero_walk' : 'hero_idle', true);
      const breath = moving ? Math.sin(this.animTime * 14) * 0.05 : Math.sin(this.animTime * 4.2) * 0.045;
      const castPop = this.castPoseLeft > 0 ? 1.09 : 1;
      this.playerSprite.setScale(1.45 * (1 - breath * 0.5) * castPop, 1.45 * (1 + breath) * castPop);
      const tilt = moving ? Math.sin(this.animTime * 14) * 0.075 : this.castPoseLeft > 0 ? (this.playerSprite.flipX ? -0.1 : 0.1) : 0;
      this.playerSprite.setRotation(tilt);
    }

    // Core visual reflects damage state (frame 0 healthy, 1 damaged, 2 broken).
    if (this.coreSprite) {
      const frame = s.coreHp <= 0 ? 2 : s.coreHp < s.coreMaxHp * 0.6 ? 1 : 0;
      this.coreSprite.setFrame(frame);
    }

    // Monster sprites are pooled: reuse Sprite instances instead of creating and destroying them.
    const alive = new Set<number>();
    for (const m of s.monsters) {
      alive.add(m.uid);
      let sprite = this.monsterSprites.get(m.uid);
      const texKey = MONSTER_SPRITE[m.defId] ?? 'mob_slime_walk';
      if (!sprite) {
        sprite = this.spritePool.pop() ?? this.add.sprite(0, 0, texKey).setDepth(8);
        sprite.setVisible(true);
        this.monsterSprites.set(m.uid, sprite);
      }
      if (sprite.anims.currentAnim?.key !== texKey) sprite.play(texKey, true);
      const targetX = m.defId === 'bat' || m.defId === 'spirit' || m.defId === 'rift_wolf' ? s.player.x : CORE_X;
      sprite.setFlipX(m.x > targetX);

      const airMob = m.defId === 'bat' || m.defId === 'spirit';
      const phase = this.animTime * (airMob ? 14 : 9.5) + m.uid * 1.7;
      const mobBob = airMob ? 4 + Math.sin(phase) * 4.5 : Math.abs(Math.sin(phase)) * 3;
      const baseScale = m.affix ? 1.45 : 1.2;
      const squash = Math.sin(phase * 2) * 0.06;
      sprite.setScale(baseScale * (1 - squash * 0.5), baseScale * (1 + squash));
      sprite.setRotation(Math.sin(phase) * 0.05);

      if (m.slowLeft > 0) sprite.setTint(0x80d8ff);
      else if (m.affix) sprite.setTint(0xe0aaff);
      else sprite.clearTint();
      sprite.setPosition(m.x, m.y - mobBob);
      sprite.setAlpha(m.slowLeft > 0 ? 0.8 : 1);

      const shadowW = m.affix ? 28 : 22;
      sg.fillStyle(0x090d16, 0.34).fillEllipse(m.x, m.y + 12, shadowW, 8);
      if (m.affix) {
        sg.lineStyle(1.5, 0xc084fc, 0.55).strokeEllipse(m.x, m.y + 12, shadowW + 8, 12);
      }
    }
    for (const [uid, sprite] of this.monsterSprites) {
      if (alive.has(uid)) continue;
      sprite.setVisible(false);
      this.spritePool.push(sprite);
      this.monsterSprites.delete(uid);
    }

    const boss = s.boss;
    const bossAlive = !!boss && boss.rules.hp > 0;
    this.bossSprite.setVisible(bossAlive);
    if (boss && bossAlive) {
      const bossBob = Math.sin(this.animTime * 5) * 4;
      this.bossSprite.setPosition(boss.x, boss.y - bossBob);
      const bossAnim = boss.rules.enraged ? 'boss_bloodmoon_enrage_walk' : 'boss_bloodmoon_walk';
      if (this.bossSprite.anims.currentAnim?.key !== bossAnim) this.bossSprite.play(bossAnim, true);
      this.bossSprite.setFlipX(boss.x > s.player.x);
      sg.fillStyle(0x090d16, 0.45).fillEllipse(boss.x, boss.y + 42, 86, 26);
      sg.lineStyle(2.5, boss.rules.enraged ? 0xff2a55 : 0xe11d48, 0.55).strokeEllipse(boss.x, boss.y + 42, 96, 32);
    }
  }

  private fxColorForSkill(skillId: string): number {
    if (FX_COLOR[skillId]) return FX_COLOR[skillId];
    const def = this.data_.skills.find((d) => d.id === skillId);
    const tag = def?.tags[0];
    return (tag && TAG_FX_COLOR[tag]) || 0xffffff;
  }

  private estimateFxDamage(skillId: string): number {
    const def = this.data_.skills.find((d) => d.id === skillId);
    if (!def) return 0;
    const owned = this.state.skills.find((o) => o.id === skillId);
    const lv = owned ? ownedLevel(def, owned.xp) : 1;
    return Math.max(1, Math.round(damageAtLevel(def, lv)));
  }

  private spawnCombatPopup(fx: CombatFx): void {
    if (this.combatPopups.length >= 20) return;
    const dmg = this.estimateFxDamage(fx.skillId);
    const label = fx.missed ? 'MISS' : dmg > 0 ? `${dmg}!` : 'HIT!';
    const txt =
      this.popupPool.pop() ??
      this.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#fde047',
          stroke: '#090d16',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(25);
    const jitter = (((Math.round(fx.x2) + Math.round(fx.y2)) % 17) - 8);
    txt
      .setText(label)
      .setColor(fx.missed ? '#cbd5e1' : '#fde047')
      .setPosition(fx.x2 + jitter, fx.y2 - 16)
      .setScale(fx.missed ? 0.9 : 1.28)
      .setAlpha(1)
      .setVisible(true);
    this.combatPopups.push({ text: txt, ttl: 0.55, maxTtl: 0.55, vy: 34 });
  }

  private updatePopups(dt: number): void {
    const active: CombatPopup[] = [];
    for (const p of this.combatPopups) {
      p.ttl -= dt;
      if (p.ttl <= 0) {
        p.text.setVisible(false);
        this.popupPool.push(p.text);
        continue;
      }
      const ratio = p.ttl / p.maxTtl;
      p.text.y -= p.vy * dt;
      p.text.setAlpha(Math.min(1, ratio * 1.6));
      const popScale = ratio > 0.72 ? 1 + (ratio - 0.72) * 1.1 : 1;
      p.text.setScale(popScale);
      active.push(p);
    }
    this.combatPopups = active;
  }

  private drawFx(dt: number): void {
    this.updatePopups(dt);
    const g = this.fxGraphics.clear();
    for (const img of this.activeFxSprites) {
      img.setVisible(false);
      this.fxPool.push(img);
    }
    this.activeFxSprites.length = 0;

    const acquireVfx = (key: string): Phaser.GameObjects.Image => {
      const img = this.fxPool.pop() ?? this.add.image(0, 0, key).setDepth(16);
      img.setTexture(key).setVisible(true);
      this.activeFxSprites.push(img);
      return img;
    };

    this.liveFx = this.liveFx.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.liveFx) {
      const alpha = Phaser.Math.Clamp(f.ttl / FX_SECONDS, 0, 1);
      const progress = 1 - alpha;
      const color = f.missed ? 0x94a3b8 : this.fxColorForSkill(f.skillId);
      const facing = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
      const vfxKey = f.shape === 'cone' ? 'vfx_cone' : f.shape === 'line' ? 'vfx_line' : f.shape === 'ring' ? 'vfx_ring' : 'vfx_projectile';

      // Brief caster rune circle around the origin on initial cast.
      if (!f.missed && progress < 0.5) {
        const castAlpha = (1 - progress / 0.5) * 0.6;
        const castR = 14 + progress * 22;
        g.lineStyle(2, 0xfef08a, castAlpha).strokeCircle(f.x1, f.y1, castR);
        g.lineStyle(1.5, color, castAlpha * 0.85).strokeCircle(f.x1, f.y1, castR * 0.65);
      }

      if (f.shape === 'cone') {
        const radius = f.radius ?? 52;
        if (this.textures.exists(vfxKey)) {
          const size = Math.max(58, radius * 1.65);
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.92 * alpha)
            .setPosition(f.x1, f.y1)
            .setOrigin(0.15, 0.5)
            .setRotation(facing)
            .setDisplaySize(size, size);
        }
        g.fillStyle(color, 0.28 * alpha);
        g.slice(f.x1, f.y1, radius, facing - 0.87, facing + 0.87, false).fillPath();
        g.fillStyle(0xffffff, 0.16 * alpha);
        g.slice(f.x1, f.y1, radius * 0.68, facing - 0.72, facing + 0.72, false).fillPath();
        g.lineStyle(3.5, 0xffffff, 0.85 * alpha);
        g.beginPath().arc(f.x1, f.y1, radius, facing - 0.85, facing + 0.85, false).strokePath();
        g.lineStyle(6, color, 0.65 * alpha);
        g.beginPath().arc(f.x1, f.y1, radius * 0.78, facing - 0.78, facing + 0.78, false).strokePath();
      } else if (f.shape === 'line') {
        const len = Math.max(36, Math.hypot(f.x2 - f.x1, f.y2 - f.y1));
        if (this.textures.exists(vfxKey)) {
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.9 * alpha)
            .setPosition(f.x1, f.y1)
            .setOrigin(0, 0.5)
            .setRotation(facing)
            .setDisplaySize(len, 24);
        }
        const dx = f.x2 - f.x1;
        const dy = f.y2 - f.y1;
        const nx = len > 0 ? -dy / len : 0;
        const ny = len > 0 ? dx / len : 0;
        const drawBolt = (width: number, col: number, a: number) => {
          g.lineStyle(width, col, a).beginPath().moveTo(f.x1, f.y1);
          const segments = 5;
          for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const jag = Math.sin((i + 1) * 3.7 + this.animTime * 42) * 11 * alpha;
            g.lineTo(f.x1 + dx * t + nx * jag, f.y1 + dy * t + ny * jag);
          }
          g.lineTo(f.x2, f.y2).strokePath();
        };
        drawBolt(5, color, 0.75 * alpha);
        drawBolt(2, 0xffffff, 0.95 * alpha);
        g.fillStyle(0xffffff, 0.85 * alpha).fillCircle(f.x2, f.y2, 7 * alpha + 3);
      } else if (f.shape === 'ring') {
        const radius = f.radius ?? 52;
        const dia = Math.max(52, radius * 2);
        if (this.textures.exists(vfxKey)) {
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.9 * alpha)
            .setPosition(f.x2, f.y2)
            .setOrigin(0.5)
            .setRotation(progress * 3.5)
            .setDisplaySize(dia * (0.65 + 0.45 * progress), dia * (0.65 + 0.45 * progress));
        }
        const waveR = radius * (0.45 + 0.65 * progress);
        g.fillStyle(color, 0.24 * alpha).fillCircle(f.x2, f.y2, waveR);
        g.lineStyle(3.5, color, 0.85 * alpha).strokeCircle(f.x2, f.y2, waveR);
        g.lineStyle(2, 0xffffff, 0.75 * alpha).strokeCircle(f.x2, f.y2, waveR * 0.72);
        if (f.skillId === 'R01a' && progress < 0.75) {
          const drop = 1 - progress / 0.75;
          const mx = f.x2 - 80 * drop;
          const my = f.y2 - 150 * drop;
          g.lineStyle(9, 0xff5400, 0.85).lineBetween(mx, my, f.x2, f.y2);
          g.lineStyle(3.5, 0xfef08a, 0.95).lineBetween(mx, my, f.x2, f.y2);
          g.fillStyle(0xffffff, 0.9).fillCircle(f.x2, f.y2, 10 + 12 * (1 - drop));
        }
      } else {
        const eased = Math.min(1, progress * 1.35);
        const px = f.x1 + (f.x2 - f.x1) * eased;
        const py = f.y1 + (f.y2 - f.y1) * eased;
        for (let k = 3; k >= 1; k--) {
          const bt = Math.max(0, eased - k * 0.09);
          const bx = f.x1 + (f.x2 - f.x1) * bt;
          const by = f.y1 + (f.y2 - f.y1) * bt;
          g.fillStyle(color, (0.75 - k * 0.18) * alpha).fillCircle(bx, by, 6.5 - k * 1.2);
        }
        if (this.textures.exists(vfxKey)) {
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.95 * alpha)
            .setPosition(px, py)
            .setOrigin(0.5)
            .setRotation(facing + progress * 2.5)
            .setDisplaySize(30, 30);
        }
        g.fillStyle(0xffffff, 0.92 * alpha).fillCircle(px, py, 4.5);
        g.lineStyle(2, color, 0.55 * alpha).lineBetween(f.x1, f.y1, px, py);
        if (progress > 0.55) {
          const burst = (progress - 0.55) / 0.45;
          const br = 8 + burst * 22;
          g.lineStyle(2.5, 0xffffff, (1 - burst) * 0.9).strokeCircle(f.x2, f.y2, br);
          for (let sIdx = 0; sIdx < 6; sIdx++) {
            const ang = (sIdx * Math.PI) / 3 + facing;
            g.lineStyle(2, color, (1 - burst) * 0.95).lineBetween(
              f.x2 + Math.cos(ang) * (br * 0.45),
              f.y2 + Math.sin(ang) * (br * 0.45),
              f.x2 + Math.cos(ang) * (br * 1.15),
              f.y2 + Math.sin(ang) * (br * 1.15),
            );
          }
        }
      }
    }
  }

  private drawBars(): void {
    const s = this.state;
    const g = this.barGraphics.clear();
    for (const c of s.chests ?? []) {
      if (c.opened) {
        g.lineStyle(1.5, 0x6c757d, 0.6).strokeRect(c.x - 9, c.y - 7, 18, 14);
      } else {
        g.fillStyle(0xffd166, 0.24).fillCircle(c.x, c.y, 19);
        g.fillStyle(0xd97706, 1).fillRect(c.x - 9, c.y - 7, 18, 14);
        g.lineStyle(2, 0xffea00, 1).strokeRect(c.x - 9, c.y - 7, 18, 14);
        g.fillStyle(0xfef08a, 1).fillRect(c.x - 2, c.y - 1, 4, 4);
      }
    }
    for (const t of s.traps ?? []) {
      if (t.uses <= 0) continue;
      g.lineStyle(2, 0xff9f1c, 0.85).strokeCircle(t.x, t.y, 14);
      g.fillStyle(0xff9f1c, 0.22).fillCircle(t.x, t.y, 14);
      g.lineStyle(1.5, 0xfef08a, 0.75).lineBetween(t.x - 6, t.y, t.x + 6, t.y);
      g.lineStyle(1.5, 0xfef08a, 0.75).lineBetween(t.x, t.y - 6, t.x, t.y + 6);
    }
    const bar = (x: number, y: number, w: number, ratio: number, color: number) => {
      g.fillStyle(0x090d16, 0.8).fillRect(x - w / 2 - 1, y - 1, w + 2, 8);
      g.fillStyle(color, 1).fillRect(x - w / 2, y, w * Phaser.Math.Clamp(ratio, 0, 1), 6);
    };
    bar(CORE_X, CORE_Y - 40, 90, s.coreHp / s.coreMaxHp, 0xc77dff);
    bar(s.player.x, s.player.y - 26, 36, s.player.hp / s.player.maxHp, 0x06d6a0);
    if (s.boss && s.boss.rules.hp > 0) bar(s.boss.x, s.boss.y - 46, 120, s.boss.rules.hp / s.boss.rules.maxHp, 0xff4d6d);
  }

  private drawHud(fpsSnap?: FpsMonitorSnapshot): void {
    const s = this.state;
    const panelW = Math.min(266, Math.max(216, this.scale.width - (import.meta.env.DEV ? 148 : 20)));
    const barW = panelW - 16;

    const left = phaseRemaining(s);
    const time = Number.isFinite(left) ? `${Math.ceil(left)} วิ` : 'จันทร์เลือด';
    this.hudTitle.setText(`วันที่ ${s.day}/7 · ${PHASE_LABEL[s.phase]} · ${time}`);
    this.hudHpText.setText(`HP ${Math.ceil(s.player.hp)}/${s.player.maxHp}`);
    const shieldTxt = (s.coreShield ?? 0) > 0 ? ` (+โล่ ${Math.ceil(s.coreShield!)})` : '';
    this.hudCoreText.setText(`แกนฐาน ${Math.ceil(s.coreHp)}/${s.coreMaxHp}${shieldTxt}`);

    const nextXp = Math.max(1, xpToNext(s.player.level));
    const fpsText = fpsSnap
      ? ` · FPS ${Math.round(fpsSnap.averageFps)}${fpsSnap.lowEndFallbackActive ? ' (30fps)' : ''}`
      : '';
    this.hudMetaText.setText(`Lv.${s.player.level} (${formatExpPercent(s.player.xp, nextXp)}) · ปราบ ${s.kills} · มอน ${s.monsters.length}${fpsText}`);

    const invStr = formatInventorySummary(s.inventory ?? {});
    const coreStr = (s.cores ?? 0) > 0 ? ` · Core ×${s.cores}` : '';
    const synStr = formatSynergySummary(
      s.skills.map((o) => o.id),
      this.data_.skills,
    );
    this.hudInvText.setWordWrapWidth(panelW - 22);
    this.hudInvText.setText(`ของ: ${invStr}${coreStr}${synStr ? ` · ${synStr}` : ''}`);

    const panelH = Math.max(126, 106 + Math.ceil(this.hudInvText.height) + 8);
    this.hudPanelH = panelH;
    this.skillDock?.setY(10 + panelH + 6);
    if (this.systemToast.visible) this.positionSystemToast();

    const g = this.hudGraphics.clear();
    // Classic RO Basic Info window frame
    drawRoWindow(g, 10, 10, panelW, panelH, { headerHeight: 24, bodyAlpha: 0.92 });

    // Segmented HP / CORE / EXP bars
    const hpRatio = Phaser.Math.Clamp(s.player.hp / Math.max(1, s.player.maxHp), 0, 1);
    drawRoGaugeBar(g, 18, 39, barW, 14, hpRatio, hpRatio < 0.35 ? RO_PALETTE.hpLowFill : RO_PALETTE.hpFill);

    const coreRatio = Phaser.Math.Clamp(s.coreHp / Math.max(1, s.coreMaxHp), 0, 1);
    drawRoGaugeBar(g, 18, 57, barW, 14, coreRatio, RO_PALETTE.spFill);

    const xpRatio = Phaser.Math.Clamp(s.player.xp / nextXp, 0, 1);
    drawRoGaugeBar(g, 18, 75, barW, 8, xpRatio, RO_PALETTE.expFill);

    // Sunken status well for inventory + Synergy
    const wellH = Math.max(22, panelH - 107);
    g.fillStyle(RO_PALETTE.windowWell, 0.92).fillRoundedRect(16, 101, panelW - 12, wellH, 4);
    g.lineStyle(1, RO_PALETTE.windowBevelDark, 0.95).strokeRoundedRect(16, 101, panelW - 12, wellH, 4);

    this.recallBtn.setVisible(s.phase === 'day' && s.status === 'playing' && !s.pendingDraft);
    this.muteBtn.setText(`[M] ${this.sfx.isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด'}`);
    if (isPlayerDown(s)) {
      this.downBanner.setText(`ล้มลง! ฟื้นที่ฐานใน ${Math.ceil(s.respawnIn)} วิ`).setVisible(true);
    } else {
      this.downBanner.setVisible(false);
    }

    this.syncSkillDock();
  }

  private syncSkillDock(): void {
    const key = this.state.skills
      .map((o) => {
        const def = this.data_.skills.find((d) => d.id === o.id);
        const lv = def ? ownedLevel(def, o.xp) : levelForXp(o.xp);
        return `${o.id}:${lv}:${o.gift ? 1 : 0}`;
      })
      .join(',');
    if (key === this.skillDockKey) return;
    this.skillDockKey = key;
    this.skillDock?.destroy();
    this.skillDock = undefined;
    if (this.state.skills.length === 0) return;

    const count = this.state.skills.length;
    const slotSize = 38;
    const step = 42;
    const padX = 6;
    const padY = 5;
    const dockW = count * step - 4 + padX * 2;
    const dockH = slotSize + padY * 2;
    const dock = this.add.container(10, 10 + this.hudPanelH + 6).setScrollFactor(0).setDepth(900);

    const dockG = this.add.graphics();
    dockG.fillStyle(RO_PALETTE.windowOuterBorder, 0.96).fillRoundedRect(-1, -1, dockW + 2, dockH + 2, 6);
    dockG.fillStyle(RO_PALETTE.windowBody, 0.92).fillRoundedRect(0, 0, dockW, dockH, 5);
    dockG.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.85).strokeRoundedRect(1, 1, dockW - 2, dockH - 2, 5);
    dock.add(dockG);

    this.state.skills.forEach((o, i) => {
      const def = this.data_.skills.find((d) => d.id === o.id);
      const lv = def ? ownedLevel(def, o.xp) : levelForXp(o.xp);
      const sx = padX + i * step;
      const sy = padY;
      const borderColor = o.gift ? 0xff9f1c : def ? RARITY_COLOR[def.rarity] : RO_PALETTE.windowBevelLight;
      drawRoIconSlot(dockG, sx, sy, slotSize, borderColor);

      if (this.textures.exists(`icon_${o.id}`)) {
        dock.add(this.add.image(sx + slotSize / 2, sy + slotSize / 2 + 2, `icon_${o.id}`).setDisplaySize(24, 24));
      }

      dock.add(
        this.add.text(sx + 2, sy + 2, hotkeyLabelForSlot(i), {
          fontFamily: 'monospace',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#93c5fd',
          backgroundColor: '#0b111ee0',
          padding: { x: 2, y: 0 },
        }),
      );

      const badge = o.gift ? 'ฟรี' : `Lv${lv}`;
      dock.add(
        this.add
          .text(sx + slotSize - 2, sy + slotSize - 2, badge, {
            fontFamily: 'monospace',
            fontSize: '9px',
            fontStyle: 'bold',
            color: o.gift ? '#fde047' : '#ffffff',
            backgroundColor: '#0b111ed9',
            padding: { x: 2, y: 0 },
          })
          .setOrigin(1, 1),
      );
    });
    dock.each((child: Phaser.GameObjects.GameObject) => {
      (child as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    });
    this.skillDock = dock;
  }

  // ---- Draft and end-of-run overlays -----------------------------------------------------

  private syncOverlay(): void {
    const s = this.state;
    const fusionIds = s.pendingDraft
      ? findAvailableFusions(s, this.data_.skills, FUSION_RECIPES).map((f) => f.recipe.id).join(',')
      : '';
    const key =
      s.status !== 'playing'
        ? `end:${s.status}`
        : s.pendingDraft
          ? `draft:${s.pendingDraft.join(',')}|fuse:${fusionIds}`
          : this.eveningPending
            ? `evening:${s.day}:${this.eveningMealId ?? 'none'}:${this.eveningChoiceId ?? 'none'}`
            : this.tutorialPending
              ? 'tutorial:night1'
              : '';
    const size = `${this.scale.width}x${this.scale.height}`;
    if (`${key}|${size}` === this.overlayKey) return;
    this.overlayKey = `${key}|${size}`;
    this.overlay?.destroy();
    this.overlay = undefined;
    if (s.status !== 'playing') this.overlay = this.buildEndOverlay();
    else if (s.pendingDraft) this.overlay = this.buildDraftOverlay(s.pendingDraft);
    else if (this.eveningPending) this.overlay = this.buildEveningOverlay();
    else if (this.tutorialPending) this.overlay = this.buildTutorialOverlay();
    // Children do not inherit the container's scroll factor for input hit tests, so set it on each.
    this.overlay?.each((child: Phaser.GameObjects.GameObject) => {
      (child as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    });
    if (this.systemToast.visible) this.positionSystemToast();
  }

  private overlayBase(): { box: Phaser.GameObjects.Container; w: number; h: number } {
    const w = this.scale.width;
    const h = this.scale.height;
    const box = this.add.container(0, 0).setScrollFactor(0).setDepth(1500);
    // The dark sheet also swallows taps so the joystick does not start under the overlay.
    box.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.72).setOrigin(0).setInteractive());
    return { box, w, h };
  }

  private buildDraftOverlay(cards: string[]): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const availFusions = findAvailableFusions(this.state, this.data_.skills, FUSION_RECIPES);
    const fusion = availFusions[0];
    const showIntro = this.state.skills.length === 0 && this.state.day === 1;
    const cardW = Math.min(432, w - 36);
    const cardH = 88;
    const fusionCardH = 100;
    const gap = 10;
    const winW = cardW + 24;
    const headerH = 28;
    const introH = showIntro ? 38 : 0;
    const cardsH = cards.length * cardH + Math.max(0, cards.length - 1) * gap + (fusion ? gap + fusionCardH : 0);
    const winH = headerH + 14 + 32 + introH + cardsH + 14;
    const winX = Math.round((w - winW) / 2);
    const winY = Math.max(54, Math.round((h - winH) / 2));

    const winG = this.add.graphics();
    drawRoWindow(winG, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.96 });
    box.add(winG);

    box.add(
      this.add
        .text(winX + 24, winY + headerH / 2 + 1, 'SKILL SELECT · เลือกสกิล', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
    );

    const title = this.state.skills.length === 0 ? 'เลือกสกิลแรกของคุณ' : `เลเวล ${this.state.player.level}! เลือก 1 ใบ`;
    box.add(
      this.add
        .text(w / 2, winY + headerH + 22, title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '21px',
          fontStyle: 'bold',
          color: '#fde68a',
          stroke: '#0b111e',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    );

    if (showIntro) {
      box.add(
        this.add
          .text(w / 2, winY + headerH + 54, '🚚 ตู้ม!! รถบรรทุกพุ่งชนคุณกระเด็นข้ามมิติ... ระบบกำลังติดตั้งสกิลเริ่มต้น', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ff9f1c',
            align: 'center',
            wordWrap: { width: winW - 28 },
          })
          .setOrigin(0.5),
      );
    }

    const cardsTop = winY + headerH + 42 + introH;
    const slotG = this.add.graphics();
    box.add(slotG);

    cards.forEach((card, i) => {
      const [type, id] = card.split(':');
      const def = this.data_.skills.find((d) => d.id === id);
      if (!def) return;
      const y = cardsTop + i * (cardH + gap);
      const cardLeft = w / 2 - cardW / 2;
      const frame = this.add
        .rectangle(w / 2, y, cardW, cardH, RO_PALETTE.rowBg, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(2.5, RARITY_COLOR[def.rarity])
        .setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => frame.setFillStyle(RO_PALETTE.rowHoverBg));
      frame.on('pointerout', () => frame.setFillStyle(RO_PALETTE.rowBg));
      frame.on('pointerup', () => this.choose(i));

      const owned = this.state.skills.find((o) => o.id === id);
      const head =
        type === 'skill'
          ? `${i + 1}. ${def.name.th} · ${RARITY_LABEL[def.rarity]}`
          : `${i + 1}. ฝึก ${def.name.th} (Lv${levelForXp(owned?.xp ?? 0)})`;
      const body =
        type === 'skill'
          ? def.kind === 'active'
            ? `${KIND_LABEL.active} · พลัง ${damageAtLevel(def, 1)} · ทุก ${def.cooldown} วิ · ระยะ ${def.range} ช่อง`
            : `${KIND_LABEL.passive} · ถึกขึ้น: รับดาเมจน้อยลงและเลือดสูงสุดเพิ่ม`
          : `ได้ค่าฝึกสกิล +${upgradeXp(levelForXp(owned?.xp ?? 0))} ทันที`;

      const hasIcon = this.textures.exists(`icon_${id}`);
      const slotX = cardLeft + 12;
      const slotY = y + Math.round((cardH - 58) / 2);
      drawRoIconSlot(slotG, slotX, slotY, 58, RARITY_COLOR[def.rarity]);

      const textX = cardLeft + 82;
      const wrapW = cardW - 122;
      const cardItems: Phaser.GameObjects.GameObject[] = [frame];
      if (this.textures.exists(`card_frame_${def.rarity}`)) {
        cardItems.push(this.add.image(slotX + 29, slotY + 29, `card_frame_${def.rarity}`).setDisplaySize(50, 56));
      }
      if (hasIcon) {
        cardItems.push(this.add.image(slotX + 29, slotY + 29, `icon_${id}`).setDisplaySize(42, 42));
      }
      cardItems.push(
        this.add
          .text(cardLeft + cardW - 10, y + 10, `[${i + 1}]`, {
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#93c5fd',
            backgroundColor: '#0b111ecc',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(1, 0),
        this.add.text(textX, y + 12, head, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#f8fafc',
          wordWrap: { width: wrapW },
        }),
        this.add.text(textX, y + 44, body, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#cbd5e1',
          wordWrap: { width: wrapW },
        }),
      );
      box.add(cardItems);
    });
    // Ensure sunken icon slots sit above card background fills
    box.bringToTop(slotG);
    box.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Image || child instanceof Phaser.GameObjects.Text) {
        box.bringToTop(child);
      }
    });

    if (fusion) {
      const y = cardsTop + cards.length * (cardH + gap);
      const cardLeft = w / 2 - cardW / 2;
      const frame = this.add
        .rectangle(w / 2, y, cardW, fusionCardH, 0x2d1b4e, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(3, RARITY_COLOR[fusion.resultSkill.rarity])
        .setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => frame.setFillStyle(0x3b2560));
      frame.on('pointerout', () => frame.setFillStyle(0x2d1b4e));
      frame.on('pointerup', () => this.choose(cards.length));

      const srcA = this.state.skills.find((s) => s.id === fusion.recipe.a);
      const srcB = this.state.skills.find((s) => s.id === fusion.recipe.b);
      const inheritedXp = Math.max(srcA?.xp ?? 0, srcB?.xp ?? 0);
      const inheritedLv = ownedLevel(fusion.resultSkill, inheritedXp);

      const head = `${cards.length + 1}. ⚗️ ผสมสกิล: ${fusion.resultSkill.name.th} (Lv${inheritedLv} · ${RARITY_LABEL[fusion.resultSkill.rarity]})`;
      const previewLine =
        fusion.resultSkill.kind === 'active'
          ? `${KIND_LABEL.active} · พลัง ${damageAtLevel(fusion.resultSkill, inheritedLv)} · ทุก ${fusion.resultSkill.cooldown} วิ · ระยะ ${fusion.resultSkill.range} ช่อง`
          : `${KIND_LABEL.passive} · ถึกขึ้น: รับดาเมจน้อยลงและเลือดสูงสุดเพิ่ม`;
      const hintLine = `อีกผล: "${fusion.alternateSkill.name.th}" (ดัน ${fusion.skillToRaiseForAlternate.name.th} ให้สูงกว่าก่อนผสม)`;

      const previewText = this.add.text(cardLeft + 14, y + 38, previewLine, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#e2e8f0',
        wordWrap: { width: cardW - 28 },
      });
      const hintText = this.add.text(cardLeft + 14, y + 38 + previewText.height + 4, hintLine, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#fde047',
        wordWrap: { width: cardW - 28 },
      });

      box.add([
        frame,
        this.add
          .text(cardLeft + cardW - 10, y + 10, `[${cards.length + 1}]`, {
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#fde047',
            backgroundColor: '#0b111ecc',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(1, 0),
        this.add.text(cardLeft + 14, y + 10, head, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ffffff',
          wordWrap: { width: cardW - 60 },
        }),
        previewText,
        hintText,
      ]);
    }
    return box;
  }

  private buildEveningOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const s = this.state;
    const inv = s.inventory ?? {};
    const offer = buildEveningOffer(inv, s.day, s.coreMaxHp, s.overtimeUsed ?? this.overtimeUsed, this.eveningMealId, s.mode);
    const cardW = Math.min(444, w - 20);
    const leftX = Math.round(w / 2 - cardW / 2);
    const panelH = Math.min(h - 24, 598);
    const topY = Math.max(12, Math.round((h - panelH) / 2));

    const winG = this.add.graphics();
    drawRoWindow(winG, leftX, topY, cardW, panelH, { headerHeight: 28, bodyAlpha: 0.97 });
    box.add(winG);

    box.add(
      this.add
        .text(leftX + 24, topY + 15, `CAMP & DEFENSE · เย็นวันที่ ${s.day}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
    );

    let y = topY + 34;
    winG.fillStyle(RO_PALETTE.windowWell, 0.95).fillRoundedRect(leftX + 12, y, cardW - 24, 24, 4);
    winG.lineStyle(1, RO_PALETTE.windowBevelDark, 1).strokeRoundedRect(leftX + 12, y, cardW - 24, 24, 4);
    box.add(
      this.add
        .text(w / 2, y + 12, `กระเป๋า: ${offer.inventorySummary}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          color: '#93c5fd',
          wordWrap: { width: cardW - 34 },
        })
        .setOrigin(0.5),
    );
    y += 30;

    box.add(
      this.add.text(leftX + 14, y, '1. เลือกมื้อเย็น', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#fde68a',
      }),
    );
    y += 19;

    const overtimeSelected = this.eveningChoiceId === 'overtime';
    for (const opt of offer.meals) {
      const selected = !overtimeSelected && this.eveningMealId === opt.meal.id;
      const rowH = 38;
      const bg = this.add
        .rectangle(w / 2, y, cardW - 24, rowH, selected ? RO_PALETTE.rowSelectedBg : RO_PALETTE.rowBg, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0x38bdf8 : opt.affordable ? 0x475569 : 0x2c3e5e);
      if (opt.affordable && !overtimeSelected) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => {
          if (!selected) bg.setFillStyle(RO_PALETTE.rowHoverBg);
        });
        bg.on('pointerout', () => {
          bg.setFillStyle(selected ? RO_PALETTE.rowSelectedBg : RO_PALETTE.rowBg);
        });
        bg.on('pointerup', () => {
          this.eveningMealId = opt.meal.id;
          // If fence becomes unaffordable after picking a meal, fallback to trap.
          const nextOffer = buildEveningOffer(inv, s.day, s.coreMaxHp, s.overtimeUsed ?? this.overtimeUsed, opt.meal.id, s.mode);
          if (this.eveningChoiceId === 'fence' && !nextOffer.choices.find((c) => c.id === 'fence')?.enabled) {
            this.eveningChoiceId = 'trap';
          }
        });
      }
      const titleColor = overtimeSelected ? '#64748b' : opt.affordable ? '#f8fafc' : '#64748b';
      const subColor = overtimeSelected ? '#64748b' : opt.affordable ? '#bae6fd' : '#475569';
      box.add([
        bg,
        this.add.text(leftX + 22, y + 4, `${opt.meal.name} (${opt.recipeText})`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: titleColor,
        }),
        this.add.text(leftX + 22, y + 20, opt.buffText, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          color: subColor,
        }),
      ]);
      y += rowH + 4;
    }

    // Skip meal option
    const skipSelected = !overtimeSelected && this.eveningMealId === null;
    const skipBg = this.add
      .rectangle(w / 2, y, cardW - 24, 30, skipSelected ? 0x4c1127 : RO_PALETTE.rowBg, 1)
      .setOrigin(0.5, 0)
      .setStrokeStyle(skipSelected ? 2 : 1, skipSelected ? 0xfb7185 : 0x475569);
    if (!overtimeSelected) {
      skipBg.setInteractive({ useHandCursor: true });
      skipBg.on('pointerup', () => {
        this.eveningMealId = null;
      });
    }
    box.add([
      skipBg,
      this.add.text(leftX + 22, y + 7, `ไม่กินมื้อเย็น (${offer.hungryBuffText})`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: overtimeSelected ? '#64748b' : '#fda4af',
      }),
    ]);
    y += 37;

    box.add(
      this.add.text(leftX + 14, y, '2. ทางเลือกเย็นนี้ (1 จาก 3)', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#fde68a',
      }),
    );
    y += 19;

    for (const choice of offer.choices) {
      const selected = this.eveningChoiceId === choice.id;
      const rowH = 48;
      const bg = this.add
        .rectangle(w / 2, y, cardW - 24, rowH, selected ? RO_PALETTE.rowSelectedBg : RO_PALETTE.rowBg, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(selected ? 2 : 1, selected ? RO_PALETTE.windowGoldAccent : choice.enabled ? 0x475569 : 0x2c3e5e);
      if (choice.enabled) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => {
          if (!selected) bg.setFillStyle(RO_PALETTE.rowHoverBg);
        });
        bg.on('pointerout', () => {
          bg.setFillStyle(selected ? RO_PALETTE.rowSelectedBg : RO_PALETTE.rowBg);
        });
        bg.on('pointerup', () => {
          this.eveningChoiceId = choice.id;
        });
      }
      const line1 = `${choice.titleTh} · ${choice.costTh}`;
      const line2 = choice.enabled ? choice.effectTh : `ล็อก: ${choice.lockedReasonTh ?? ''}`;
      box.add([
        bg,
        this.add.text(leftX + 22, y + 5, line1, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: choice.enabled ? '#fde047' : '#64748b',
          wordWrap: { width: cardW - 48 },
        }),
        this.add.text(leftX + 22, y + 24, line2, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          color: choice.enabled ? '#e2e8f0' : '#64748b',
          wordWrap: { width: cardW - 48 },
        }),
      ]);
      y += rowH + 5;
    }

    box.add(
      createRoButton(this, w / 2, topY + panelH - 32, cardW - 40, 40, '✔ ยืนยันและเริ่มค่ำคืน', {
        tone: 'teal',
        fontSize: '16px',
        scrollFactor: 0,
        onClick: () => this.confirmEvening(),
      }),
    );

    return box;
  }

  private confirmEvening(): void {
    const choiceId: EveningChoiceId = this.eveningChoiceId ?? 'trap';
    // The rules live in systems/ (R1): the screen only passes the player's pick.
    submitEvening(this.state, this.eveningMealId, choiceId);
    if (this.state.overtimeUsed) this.overtimeUsed = true;
    this.eveningPending = false;
    this.sfx.playLevelUp();
    saveRun(this.syncAndGetState());
  }

  private buildTutorialOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const card = buildTutorialFusionCardView();
    const cardW = Math.min(432, w - 24);
    const panelH = 330;
    const leftX = Math.round(w / 2 - cardW / 2);
    const topY = Math.max(24, Math.round((h - panelH) / 2));

    const winG = this.add.graphics();
    drawRoWindow(winG, leftX, topY, cardW, panelH, { headerHeight: 28, bodyAlpha: 0.97 });
    box.add(winG);

    box.add([
      this.add
        .text(leftX + 24, topY + 15, 'SYSTEM GIFT · ของขวัญต้อนรับ (Night 1)', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(w / 2, topY + 42, TUTORIAL_WELCOME_TITLE, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#fde047',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
      this.add
        .text(w / 2, topY + 72, TUTORIAL_WELCOME_LINE, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#cbd5e1',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
    ]);

    const iconY = topY + 132;
    drawRoIconSlot(winG, w / 2 - 120, iconY - 24, 48, RO_PALETTE.windowBevelLight);
    drawRoIconSlot(winG, w / 2 - 44, iconY - 24, 48, RO_PALETTE.windowBevelLight);
    drawRoIconSlot(winG, w / 2 + 49, iconY - 29, 58, RO_PALETTE.windowGoldAccent);

    if (this.textures.exists(`icon_${card.sourceIds[0]}`)) {
      box.add(this.add.image(w / 2 - 96, iconY, `icon_${card.sourceIds[0]}`).setDisplaySize(38, 38));
    }
    box.add(this.add.text(w / 2 - 58, iconY, '+', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#f8fafc' }).setOrigin(0.5));
    if (this.textures.exists(`icon_${card.sourceIds[1]}`)) {
      box.add(this.add.image(w / 2 - 20, iconY, `icon_${card.sourceIds[1]}`).setDisplaySize(38, 38));
    }
    box.add(this.add.text(w / 2 + 24, iconY, '→', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#fde047' }).setOrigin(0.5));
    if (this.textures.exists(`icon_${card.resultId}`)) {
      box.add(this.add.image(w / 2 + 78, iconY, `icon_${card.resultId}`).setDisplaySize(46, 46));
    }

    box.add([
      this.add
        .text(w / 2, topY + 174, card.recipeTitleTh, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ff9f1c',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
      this.add
        .text(w / 2, topY + 202, card.descTh, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          color: '#e2e8f0',
          align: 'center',
          wordWrap: { width: cardW - 32 },
        })
        .setOrigin(0.5, 0),
      createRoButton(this, w / 2, topY + panelH - 34, cardW - 44, 42, card.buttonLabelTh, {
        tone: 'gold',
        fontSize: '16px',
        scrollFactor: 0,
        onClick: () => this.confirmTutorialFusion(),
      }),
    ]);

    return box;
  }

  private confirmTutorialFusion(): void {
    this.tutorialPending = false;
    this.sfx.playFuse();
    this.showSystemToast('ระบบ: "รับอุกกาบาตตกใส่ตัวเอง Lv1 (ทดลองใช้คืนแรก)!"', 4);
    saveRun(this.syncAndGetState());
  }

  private showSystemToast(message: string, seconds = 5): void {
    this.systemToast.setText(message).setVisible(true);
    this.positionSystemToast();
    this.systemToastLeft = seconds;
  }

  private positionSystemToast(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.systemToast.setX(w / 2);
    if (w >= 760) {
      this.systemToast.setOrigin(0.5, 0).setY(16);
      return;
    }
    if (this.overlay) {
      if (this.state.skills.length === 0 && this.state.pendingDraft) {
        this.systemToast.setOrigin(0.5, 0).setY(144);
      } else {
        this.systemToast.setOrigin(0.5, 1).setY(h - 72);
      }
    } else {
      const dockOffset = this.state.skills.length > 0 ? 58 : 8;
      this.systemToast.setOrigin(0.5, 0).setY(10 + this.hudPanelH + dockOffset);
    }
  }

  private buildEndOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const s = this.state;
    const won = s.status === 'won';
    const title = won ? 'ชนะ! ราชันจันทร์เลือดล้มแล้ว' : 'แกนฐานพัง — จบรอบ';
    // On a loss the line teases the System or the monsters, not the player (D24).
    const line = won
      ? 'ระบบ: "ไม่อยู่ในแผนเลยนะเนี่ย... ยินดีด้วย"'
      : 'ระบบ: "แกนฐานรุ่นนี้ประกันหมดเมื่อวาน ระบบขออภัย"';
    const shardLine = ` · ได้รับ +${s.shardsEarned ?? 0} Soul Shard`;
    const stats = `รอดถึงวันที่ ${s.day} · เลเวล ${s.player.level} · ปราบมอน ${s.kills} ตัว${shardLine}`;
    const share = buildShareCardSummary(s, this.data_.skills);
    const topSkillsText = share.topSkillsTh.length > 0 ? `สกิลเด่น: ${share.topSkillsTh.join(' · ')}` : `Seed: ${share.seed}`;
    const cardW = Math.min(436, w - 20);
    const cardH = 408;
    const leftX = Math.round(w / 2 - cardW / 2);
    const topY = Math.max(12, Math.round(h / 2 - cardH / 2 + 8));

    const winG = this.add.graphics();
    drawRoWindow(winG, leftX, topY, cardW, cardH, { headerHeight: 30, crimsonHeader: !won, bodyAlpha: 0.97 });
    winG.fillStyle(RO_PALETTE.windowWell, 0.94).fillRoundedRect(leftX + 14, topY + 86, cardW - 28, 178, 6);
    winG.lineStyle(1, RO_PALETTE.windowBevelDark, 1).strokeRoundedRect(leftX + 14, topY + 86, cardW - 28, 178, 6);
    box.add(winG);

    const shareBtnW = Math.min(280, cardW - 40);
    const shareBtn = createRoButton(this, w / 2, topY + 302, shareBtnW, 40, 'คัดลอกลิงก์ท้าดวล (?seed=)', {
      tone: 'teal',
      fontSize: '15px',
      scrollFactor: 0,
      onClick: () => {
        const shareText = `${share.titleTh}\n${share.nightTrackEmojis}\n${share.shareUrl}`;
        void navigator.clipboard?.writeText(shareText)?.catch(() => undefined);
        const lbl = shareBtn.getAt(1);
        if (lbl && 'setText' in lbl) (lbl as Phaser.GameObjects.Text).setText('✔ คัดลอกแล้ว!');
      },
    });
    const restartBtn = createRoButton(this, w / 2, topY + 358, shareBtnW, 44, '▶ เริ่มรอบใหม่ [N]', {
      tone: 'blue',
      fontSize: '18px',
      scrollFactor: 0,
      onClick: () => this.newRun(),
    });

    box.add([
      this.add
        .text(leftX + 24, topY + 16, won ? 'MVP VICTORY · ชนะศึกจันทร์เลือด' : 'BATTLE REPORT · แกนฐานพัง', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
      this.add
        .text(w / 2, topY + 58, title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '23px',
          fontStyle: 'bold',
          color: won ? '#fde047' : '#fda4af',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5),
      this.add
        .text(w / 2, topY + 114, line, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#f8fafc',
          align: 'center',
          wordWrap: { width: cardW - 44 },
        })
        .setOrigin(0.5),
      this.add
        .text(w / 2, topY + 162, stats, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: '#bae6fd',
          align: 'center',
          wordWrap: { width: cardW - 44 },
        })
        .setOrigin(0.5),
      this.add
        .text(w / 2, topY + 206, share.nightTrackEmojis, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '20px',
          color: '#fde047',
          align: 'center',
        })
        .setOrigin(0.5),
      this.add
        .text(w / 2, topY + 240, topSkillsText, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#93c5fd',
          align: 'center',
          wordWrap: { width: cardW - 44 },
        })
        .setOrigin(0.5),
      shareBtn,
      restartBtn,
    ]);
    return box;
  }

  private choose(index: number): void {
    if (this.tutorialPending && index === 0) {
      this.confirmTutorialFusion();
      return;
    }
    if (this.state.status !== 'playing' || !this.state.pendingDraft) return;
    if (index < this.state.pendingDraft.length) {
      pickDraft(this.state, index, this.data_.skills, this.bus);
    } else if (index === this.state.pendingDraft.length) {
      const fusion = findAvailableFusions(this.state, this.data_.skills, FUSION_RECIPES)[0];
      if (!fusion) return;
      const out = pickFusionCard(this.state, fusion.recipe.id, this.data_.skills, FUSION_RECIPES);
      if (out) {
        this.sfx.playFuse();
        this.bus.emit('draft:pick', { card: `fuse:${fusion.recipe.id}` });
      }
    }
  }

  // ---- run lifecycle ---------------------------------------------------------------------

  /** Copies live RNG stream states into the plain state before saving. */
  private syncAndGetState(): GameState {
    this.state.rng = this.rng.snapshot();
    return this.state;
  }

  /** A saved run that is still in progress, unless a ?seed= link or menu selection asks for a new one. */
  private resume(): GameState | null {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    const saved = loadRun();
    if (!saved || saved.status !== 'playing') return null;
    if (linkSeed && saved.seed !== linkSeed) return null;
    if (this.launchOpts?.seed && !this.launchOpts.resumeSaved && saved.seed !== this.launchOpts.seed) return null;
    return saved;
  }

  private newState(): GameState {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    const mode: Mode = this.launchOpts?.mode ?? 'casual';
    const seed =
      linkSeed ??
      this.launchOpts?.seed ??
      (mode === 'daily' ? dailySeed(new Date().toISOString().slice(0, 10)) : `run-${Date.now().toString(36)}`);
    const run = createRun({ seed, mode, fromSeedLink: linkSeed !== null });
    run.player.x = CORE_X + TILE * 2;
    run.player.y = CORE_Y;
    return run;
  }

  private newRun(): void {
    clearRun();
    this.scene.restart({ mode: this.state.mode });
  }

  private drawWorld(): void {
    const map = RunRng.fromSeed(this.state.seed).get('map');
    if (this.textures.exists('tile_ground_01')) {
      const rt = this.add.renderTexture(0, 0, WORLD, WORLD).setOrigin(0).setDepth(0);
      rt.beginDraw();
      for (let ty = 0; ty < MAP_TILES; ty++) {
        for (let tx = 0; tx < MAP_TILES; tx++) {
          const tileIdx = map.int(1, 5);
          rt.batchDrawFrame(`tile_ground_0${tileIdx}`, undefined, tx * TILE, ty * TILE);
        }
      }
      rt.endDraw();
    } else {
      const gBg = this.add.graphics().setDepth(0);
      gBg.fillStyle(0x1d2b1f).fillRect(0, 0, WORLD, WORLD);
      gBg.lineStyle(1, 0x2b3d2d, 0.6);
      for (let i = 0; i <= MAP_TILES; i++) {
        gBg.lineBetween(i * TILE, 0, i * TILE, WORLD);
        gBg.lineBetween(0, i * TILE, WORLD, i * TILE);
      }
    }

    // Sanctuary Plaza around the Core (stone flagstones, rune circles, corner braziers).
    const gPlaza = this.add.graphics().setDepth(1);
    gPlaza.fillStyle(0x1e293b, 0.45).fillCircle(CORE_X, CORE_Y, 170);
    gPlaza.fillStyle(0x475569, 0.92).fillCircle(CORE_X, CORE_Y, 146);
    gPlaza.fillStyle(0x64748b, 0.9).fillCircle(CORE_X, CORE_Y, 134);
    gPlaza.lineStyle(3, 0x334155, 0.95).strokeCircle(CORE_X, CORE_Y, 146);
    gPlaza.lineStyle(2, 0x94a3b8, 0.65).strokeCircle(CORE_X, CORE_Y, 132);
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      gPlaza.lineStyle(2, 0x334155, 0.65).lineBetween(
        CORE_X + Math.cos(ang) * 44,
        CORE_Y + Math.sin(ang) * 44,
        CORE_X + Math.cos(ang) * 144,
        CORE_Y + Math.sin(ang) * 144,
      );
      gPlaza.lineStyle(1.5, 0x7dd3fc, 0.45).lineBetween(
        CORE_X + Math.cos(ang + Math.PI / 8) * 62,
        CORE_Y + Math.sin(ang + Math.PI / 8) * 62,
        CORE_X + Math.cos(ang + Math.PI / 8) * 96,
        CORE_Y + Math.sin(ang + Math.PI / 8) * 96,
      );
    }
    gPlaza.lineStyle(2.5, 0x38bdf8, 0.55).strokeCircle(CORE_X, CORE_Y, 96);
    gPlaza.lineStyle(2, 0xc084fc, 0.6).strokeCircle(CORE_X, CORE_Y, 62);
    for (const [bx, by] of [
      [-98, -98],
      [98, -98],
      [-98, 98],
      [98, 98],
    ]) {
      const px = CORE_X + bx;
      const py = CORE_Y + by;
      gPlaza.fillStyle(0x090d16, 0.35).fillEllipse(px, py + 7, 26, 10);
      gPlaza.fillStyle(0x334155, 1).fillRect(px - 8, py - 8, 16, 16);
      gPlaza.lineStyle(1.5, 0x94a3b8, 0.9).strokeRect(px - 8, py - 8, 16, 16);
      gPlaza.fillStyle(0xf97316, 0.35).fillCircle(px, py - 2, 16);
      gPlaza.fillStyle(0xfbbf24, 0.95).fillCircle(px, py - 2, 5);
    }

    // Scatter deterministic layered RPG props from the map stream (outside Sanctuary Plaza).
    const gProps = this.add.graphics().setDepth(2);
    for (let i = 0; i < 84; i++) {
      const x = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      const y = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      const kind = map.int(0, 2);
      if (Math.hypot(x - CORE_X, y - CORE_Y) < 176) continue;
      if (kind === 0) {
        // Herb bush with wildflowers
        gProps.fillStyle(0x090d16, 0.28).fillEllipse(x, y + 6, 22, 9);
        gProps.fillStyle(0x1b4332, 0.95).fillCircle(x - 4, y, 7).fillCircle(x + 4, y + 1, 7);
        gProps.fillStyle(0x2d6a4f, 0.95).fillCircle(x, y - 3, 7);
        gProps.fillStyle(0x52b788, 0.9).fillCircle(x - 2, y - 4, 4);
        gProps.fillStyle(i % 2 === 0 ? 0xfef08a : 0xf9a8d4, 0.95).fillCircle(x + 3, y - 3, 2).fillCircle(x - 4, y + 1, 2);
      } else if (kind === 1) {
        // Faceted rock outcrop + crystal ore vein
        gProps.fillStyle(0x090d16, 0.3).fillEllipse(x, y + 6, 22, 8);
        gProps.fillStyle(0x475569, 0.95).fillRect(x - 8, y - 5, 16, 11);
        gProps.fillStyle(0x64748b, 0.95).fillRect(x - 6, y - 7, 11, 9);
        gProps.fillStyle(0x94a3b8, 0.85).fillRect(x - 5, y - 7, 5, 3);
        gProps.fillStyle(i % 3 === 0 ? 0xfbbf24 : 0x38bdf8, 0.95).fillRect(x + 1, y - 4, 4, 5).fillRect(x - 4, y - 1, 3, 4);
      } else {
        // Mana dew spring puddle
        gProps.fillStyle(0x3f6212, 0.8).fillEllipse(x, y, 22, 14);
        gProps.fillStyle(0x0284c7, 0.88).fillEllipse(x, y, 17, 10);
        gProps.fillStyle(0x7dd3fc, 0.7).fillEllipse(x - 2, y - 1, 9, 5);
        gProps.fillStyle(0xe0f2fe, 0.95).fillCircle(x - 3, y - 2, 2);
      }
    }

    // Base core in the centre (GDD §5).
    this.coreSprite = this.add.sprite(CORE_X, CORE_Y, 'base_core', 0).setScale(1.15).setDepth(5);
    this.add
      .text(CORE_X, CORE_Y + 46, 'แกนฐาน', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f3e8ff',
        stroke: '#090d16',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6);
  }
}
