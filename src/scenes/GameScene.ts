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
import { forceTutorialFusion } from '../systems/tutorial';
import { attachShardLedger } from '../systems/shards';
import { boostedRarity, coreBoostMult, damageAtLevel, levelForXp, ownedLevel, type FusionRecipe, type Rarity, type SkillDef } from '../systems/skills';
import { canBoostWithCore } from '../systems/fusion';
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
import {
  buildDraftCardHint,
  buildSynergyHudBadges,
  buildCodexEntries,
  formatSynergyHudLine,
  SYNERGY_META_TH,
} from './codexUiModel';
import { buildEveningOffer, formatInventorySummary, formatMealBuff } from './eveningUiModel';
import { buildShareCardSummary, findAvailableFusions, pickFusionCard } from './HudOverlayScene';
import { MobileFpsMonitor, type FpsMonitorSnapshot } from './MobileFpsMonitor';
import {
  buildTutorialFusionCardView,
  TUTORIAL_EXPIRE_LINE,
  TUTORIAL_WELCOME_LINE,
  TUTORIAL_WELCOME_TITLE,
} from './tutorialUiModel';

const FUSION_RECIPES: readonly FusionRecipe[] = skillsFullJson.fusions as FusionRecipe[];

const PHASE_TINT = { day: 0x000000, evening: 0xffa670, night: 0x1e1b4b } as const;
const PHASE_ALPHA = { day: 0, evening: 0.14, night: 0.34 } as const;
/** Player-facing names for picked-up ingredients (R2). */
const ITEM_LABEL: Record<string, string> = { grain: '🌾 ธัญพืช', mushroom: '🍄 เห็ด', water: '💧 น้ำ', fish: '🐟 ปลา', meat: '🍖 เนื้อสด' };

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

/** Per-species visual scale multiplier for clear enemy silhouette hierarchy. */
const MONSTER_VISUAL_SCALE: Record<string, number> = {
  slime: 0.30,
  bat: 0.45,
  goblin: 0.54,
  skeleton: 0.56,
  spirit: 0.54,
  golem: 0.70,
  rift_wolf: 0.70,
};

type FacingDir = 'down' | 'side' | 'up';
const FACING_DIRS: readonly FacingDir[] = ['down', 'side', 'up'];
const FACING_ROW: Record<FacingDir, number> = { down: 0, side: 1, up: 2 };

/** Resolves 3-row top-down sprite facing (`down` / `side` + `flipX` / `up`) from movement vector. */
function resolveFacing(dx: number, dy: number, prevDir: FacingDir, prevFlipX: boolean): { dir: FacingDir; flipX: boolean } {
  if (Math.hypot(dx, dy) < 0.01) return { dir: prevDir, flipX: prevFlipX };
  if (Math.abs(dy) > Math.abs(dx) * 1.1) {
    return { dir: dy > 0 ? 'down' : 'up', flipX: false };
  }
  return { dir: 'side', flipX: dx !== 0 ? dx < 0 : prevFlipX };
}
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
  /** Set for ingredient popups: where it started, to stack popups on the same spot. */
  itemAt?: string;
}

export class GameScene extends Phaser.Scene {
  state!: GameState;
  bus = new EventBus();
  rng!: RunRng;
  private data_!: RunData;

  private playerSprite!: Phaser.GameObjects.Sprite;
  private bossSprite!: Phaser.GameObjects.Sprite;
  private coreSprite!: Phaser.GameObjects.Sprite;
  private wellSprite?: Phaser.GameObjects.Sprite;
  private wellLabel?: Phaser.GameObjects.Text;
  private nodeSprites: Phaser.GameObjects.Sprite[] = [];
  private chestSprites: Phaser.GameObjects.Sprite[] = [];
  private monsterSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private spritePool: Phaser.GameObjects.Sprite[] = [];
  private shadowGraphics!: Phaser.GameObjects.Graphics;
  private lightPoolSprites: Phaser.GameObjects.Image[] = [];
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private atmosphereGraphics!: Phaser.GameObjects.Graphics;
  private ambientMotes: Array<{
    ox: number;
    oy: number;
    vx: number;
    vy: number;
    r: number;
    phase: number;
    speed: number;
    variant: number;
  }> = [];
  private vignetteOverlay?: Phaser.GameObjects.Image;
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
  private hudHeroPortrait?: Phaser.GameObjects.Sprite;
  private hudHpText!: Phaser.GameObjects.Text;
  private hudCoreText!: Phaser.GameObjects.Text;
  private hudMetaText!: Phaser.GameObjects.Text;
  private hudInvText!: Phaser.GameObjects.Text;
  private radarLabel!: Phaser.GameObjects.Text;
  private downBanner!: Phaser.GameObjects.Text;
  private recallBtn!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;
  private codexBtn!: Phaser.GameObjects.Text;
  private restartBtn!: Phaser.GameObjects.Text;
  private skillDock?: Phaser.GameObjects.Container;
  private skillDockKey = '';
  private dockTooltip?: Phaser.GameObjects.Container;
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
  private codexOpen = false;
  private codexTab: 'recipes' | 'synergy' = 'recipes';
  private prevKills = 0;
  private comboCount = 0;
  private comboWindow = 0;
  private bossWarnShown = false;
  private seenElites = new Set<number>();
  private heroFacing: FacingDir = 'down';
  private heroFlipX = false;
  private mobPrevPos = new Map<number, { x: number; y: number }>();
  private mobFacing = new Map<number, { dir: FacingDir; flipX: boolean }>();
  private mobPrevHp = new Map<number, number>();
  private mobFlashLeft = new Map<number, number>();
  private bossPrevPos?: { x: number; y: number };
  private bossFacing: { dir: FacingDir; flipX: boolean } = { dir: 'down', flipX: false };
  private bossPrevHp?: number;
  private bossFlashLeft = 0;
  private systemToast!: Phaser.GameObjects.Text;
  private systemToastLeft = 0;

  constructor() {
    super('game');
  }

  init(data?: { mode?: Mode; seed?: string; resumeSaved?: boolean }): void {
    this.launchOpts = data;
  }

  preload(): void {
    const v = '?v=studio1';
    for (let i = 1; i <= 5; i++) {
      this.load.image(`tile_ground_0${i}`, `assets/tiles/tile_ground_0${i}.png${v}`);
    }
    this.load.image('sanctuary_plaza', `assets/tiles/sanctuary_plaza.png${v}`);
    this.load.spritesheet('world_props', `assets/tiles/world_props.png${v}`, { frameWidth: 160, frameHeight: 160 });
    this.load.spritesheet('world_decals', `assets/tiles/world_decals.png${v}`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('gather_nodes', `assets/tiles/gather_nodes.png${v}`, { frameWidth: 160, frameHeight: 160 });
    this.load.spritesheet('base_core', `assets/sprites/base_core.png${v}`, { frameWidth: 160, frameHeight: 160 });
    this.load.spritesheet('hero_idle', 'assets/sprites/hero_idle.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_walk', 'assets/sprites/hero_walk.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_hit', 'assets/sprites/hero_hit.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_death', 'assets/sprites/hero_death.png', { frameWidth: 128, frameHeight: 128 });

    for (const key of [
      'mob_slime_walk',
      'mob_bat_walk',
      'mob_goblin_walk',
      'mob_skeleton_archer_walk',
      'mob_mud_golem_walk',
      'mob_fog_wraith_walk',
    ]) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, { frameWidth: 128, frameHeight: 128 });
    }
    this.load.spritesheet('elite_rift_wolf_walk', 'assets/sprites/elite_rift_wolf_walk.png', {
      frameWidth: 128,
      frameHeight: 128,
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
    const makeDirectionalAnims = (texKey: string, cols: number, frameRate: number) => {
      if (!this.textures.exists(texKey)) return;
      FACING_DIRS.forEach((dir, row) => {
        const key = `${texKey}_${dir}`;
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(texKey, { start: row * cols, end: row * cols + cols - 1 }),
          frameRate,
          repeat: -1,
        });
      });
    };
    makeDirectionalAnims('hero_idle', 2, 3);
    makeDirectionalAnims('hero_walk', 4, 10);
    makeAnim('hero_death', 4, 8, 0);
    for (const key of Object.values(MONSTER_SPRITE)) {
      makeDirectionalAnims(key, 4, key === 'mob_bat_walk' ? 10 : 8);
    }
    makeDirectionalAnims('boss_bloodmoon_walk', 4, 8);
    makeDirectionalAnims('boss_bloodmoon_enrage_walk', 4, 10);
  }

  create(): void {
    this.data_ = loadRunData();
    this.monsterSprites.clear();
    this.spritePool = [];
    this.wellSprite = undefined;
    this.wellLabel = undefined;
    this.nodeSprites = [];
    this.chestSprites = [];
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
    this.dockTooltip = undefined;
    this.codexOpen = false;
    this.codexTab = 'recipes';
    this.comboCount = 0;
    this.comboWindow = 0;
    this.bossWarnShown = false;
    this.seenElites.clear();
    this.heroFacing = 'down';
    this.heroFlipX = false;
    this.mobPrevPos.clear();
    this.mobFacing.clear();
    this.mobPrevHp.clear();
    this.mobFlashLeft.clear();
    this.bossPrevPos = undefined;
    this.bossFacing = { dir: 'down', flipX: false };
    this.bossPrevHp = undefined;
    this.bossFlashLeft = 0;
    this.bus.clear();
    this.ensureAnimations();

    const resumed = this.resume();
    this.state = resumed ?? this.newState();
    // A save made during an open evening reopens the same evening screen (GDD §10).
    this.eveningPending = this.state.phase === 'evening' && this.state.eveningResolved === false;
    this.eveningMealId = this.eveningPending ? autoMealId(this.state.inventory ?? {}) : null;
    this.eveningChoiceId = 'trap';
    // A save made while the forced fusion screen was open reopens it (R5).
    this.tutorialPending = this.state.mode === 'casual' && this.state.tutorial === 'gift' && this.state.phase === 'night';
    this.tutorialShown = this.tutorialPending || this.state.tutorial === 'fused' || this.state.tutorial === 'done';
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
    this.shadowGraphics = this.add.graphics().setDepth(3.2);
    if (!this.textures.exists('vfx_soft_glow') && typeof this.textures.createCanvas === 'function') {
      const gTex = this.textures.createCanvas('vfx_soft_glow', 128, 128);
      if (gTex) {
        const gCtx = gTex.context;
        const grad = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.52)');
        grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.14)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        gCtx.fillStyle = grad;
        gCtx.fillRect(0, 0, 128, 128);
        gTex.refresh();
      }
    }
    this.lightPoolSprites = [];
    const lightTexKey = this.textures.exists('vfx_soft_glow')
      ? 'vfx_soft_glow'
      : this.textures.exists('vfx_projectile')
        ? 'vfx_projectile'
        : null;
    if (lightTexKey) {
      for (let i = 0; i < 6; i++) {
        this.lightPoolSprites.push(
          this.add
            .image(CORE_X, CORE_Y, lightTexKey)
            .setDepth(3.5)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0),
        );
      }
    }
    this.barGraphics = this.add.graphics().setDepth(20);
    this.fxGraphics = this.add.graphics().setDepth(15);
    this.atmosphereGraphics = this.add.graphics().setDepth(24);
    this.ambientMotes = [];
    const atmRng = RunRng.fromSeed(this.state.seed).get('map');
    for (let i = 0; i < 28; i++) {
      this.ambientMotes.push({
        ox: (atmRng.next() - 0.5) * 1400,
        oy: (atmRng.next() - 0.5) * 860,
        vx: (atmRng.next() - 0.35) * 18,
        vy: -8 - atmRng.next() * 14,
        r: 1.5 + atmRng.next() * 1.9,
        phase: atmRng.next() * Math.PI * 2,
        speed: 1.8 + atmRng.next() * 2.2,
        variant: i % 3,
      });
    }
    this.bossSprite = this.add.sprite(0, 0, 'boss_bloodmoon_walk').setScale(1.18).setDepth(9).setVisible(false);
    this.playerSprite = this.add.sprite(this.state.player.x, this.state.player.y, 'hero_idle').setScale(0.58).setDepth(this.depthAtY(this.state.player.y));
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.playerSprite, true, 0.15, 0.15);

    this.phaseShade = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(500);
    if (!this.textures.exists('vignette_radial') && typeof this.textures.createCanvas === 'function') {
      const cTex = this.textures.createCanvas('vignette_radial', 256, 256);
      if (cTex) {
        const ctx = cTex.context;
        const grad = ctx.createRadialGradient(128, 128, 72, 128, 128, 176);
        grad.addColorStop(0, 'rgba(5, 8, 22, 0)');
        grad.addColorStop(0.55, 'rgba(5, 8, 22, 0.28)');
        grad.addColorStop(1, 'rgba(5, 8, 22, 0.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        cTex.refresh();
      }
    }
    if (this.textures.exists('vignette_radial')) {
      this.vignetteOverlay = this.add
        .image(0, 0, 'vignette_radial')
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(501)
        .setAlpha(0);
    }

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'), down: kb.addKey('DOWN'), left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'),
      w: kb.addKey('W'), a: kb.addKey('A'), s: kb.addKey('S'), d: kb.addKey('D'),
    };
    kb.on('keydown-R', () => {
      if (this.state.status === 'playing' && !this.state.pendingDraft) recallToEvening(this.state, this.rng, this.data_, this.bus);
    });
    kb.on('keydown-N', () => this.newRun());
    kb.on('keydown-B', () => {
      if (this.state.status === 'playing') {
        this.codexOpen = !this.codexOpen;
      }
    });
    kb.on('keydown-ESC', () => {
      if (this.codexOpen) this.codexOpen = false;
      this.hideDockTooltip();
    });
    kb.on('keydown-C', () => this.chooseFusion(true)); // fuse with a Fusion Core (R3)
    kb.on('keydown-M', () => {
      this.sfx.toggleMute();
    });
    for (const [key, index] of [['ONE', 0], ['TWO', 1], ['THREE', 2], ['FOUR', 3]] as const) {
      kb.on(`keydown-${key}`, () => this.choose(index));
    }
    this.joystick = new VirtualJoystick(this);

    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(890);
    if (this.textures.exists('hero_idle')) {
      this.hudHeroPortrait = this.add
        .sprite(38, 66, 'hero_idle', 0)
        .setCrop(24, 6, 80, 74)
        .setScale(0.45)
        .setScrollFactor(0)
        .setDepth(900);
    }
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
      .text(68, 40, '', {
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
      .text(68, 58, '', {
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

    const compactHud = this.scale.width < 440;
    const btnStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: compactHud ? '11px' : '12px',
      fontStyle: 'bold',
      color: '#f8fafc',
      backgroundColor: '#1d2b45ee',
      stroke: '#0b111e',
      strokeThickness: 2,
      padding: { x: compactHud ? 7 : 9, y: 5 },
    };
    const btnY = this.scale.height - 34;
    this.recallBtn = this.add
      .text(10, btnY, compactHud ? '[R] เรียกคืน' : '[R] เรียกคืนเร็ว', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.state.status === 'playing' && !this.state.pendingDraft) recallToEvening(this.state, this.rng, this.data_, this.bus);
      });
    this.muteBtn = this.add
      .text(100, btnY, '[M] เสียง: เปิด', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.sfx.toggleMute();
      });
    this.codexBtn = this.add
      .text(196, btnY, compactHud ? '[B] สูตร' : '[B] สูตรผสม', { ...btnStyle, color: '#fde68a' })
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.state.status === 'playing') this.codexOpen = !this.codexOpen;
      });
    this.restartBtn = this.add
      .text(274, btnY, '[N] รอบใหม่', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.newRun());

    this.radarLabel = this.add
      .text(this.scale.width - 96, this.scale.height - 148, '🧭 RADAR', {
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#fde68a',
        stroke: '#0b111e',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(900);
    this.prevKills = this.state.kills;
    this.layoutBottomButtons();

    this.debug = new DebugOverlay(this);
    const onResize = (size: Phaser.Structs.Size) => {
      const y = size.height - 34;
      this.recallBtn.setY(y);
      this.muteBtn.setY(y);
      this.codexBtn.setY(y);
      this.restartBtn.setY(y);
      this.layoutBottomButtons();
      this.radarLabel.setPosition(size.width - 96, size.height - 148);
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
    this.bus.on('item:pickup', ({ kind, count, x, y }) => this.spawnItemPopup(kind, count, x, y));
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
    if (this.comboWindow > 0) {
      this.comboWindow = Math.max(0, this.comboWindow - dt);
      if (this.comboWindow === 0) this.comboCount = 0;
    }
    if (!this.eveningPending && !this.tutorialPending && !this.codexOpen) {
      const fx = stepRun(this.state, this.rng, this.readInput(), dt, this.data_, this.bus);
      if (fx.some((f) => !f.missed)) {
        this.sfx.playCast();
        this.castPoseLeft = 0.24;
        if (fx.some((f) => !f.missed && (f.skillId === 'R01a' || (f.radius ?? 0) >= 90))) {
          this.cameras.main.shake(90, 0.0022, false);
        }
      }
      for (const f of fx) {
        this.liveFx.push({ ...f, ttl: FX_SECONDS });
        this.spawnCombatPopup(f);
      }

      if (this.state.kills > this.prevKills) {
        const gained = this.state.kills - this.prevKills;
        this.prevKills = this.state.kills;
        this.comboCount = this.comboWindow > 0 ? this.comboCount + gained : gained;
        this.comboWindow = 2.6;
        if (this.comboCount >= 3) this.spawnComboPopup(this.comboCount);
      }
      for (const m of this.state.monsters) {
        if (m.defId === 'rift_wolf' && !this.seenElites.has(m.uid)) {
          this.seenElites.add(m.uid);
          this.showSystemToast('🐺 Rift Wolf ปรากฏตัว! ปราบเพื่อรับ Fusion Core 💠', 5);
        }
      }
      if (this.state.boss && this.state.boss.rules.hp > 0 && !this.bossWarnShown) {
        this.bossWarnShown = true;
        this.cameras.main.shake(320, 0.008);
        this.showSystemToast('⚠️ ราชันจันทร์เลือดปรากฏตัว! ศึกชี้ชะตาคืนสุดท้าย!', 6);
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

    this.drawActors(dt);
    this.drawFx(dt);
    this.drawBars();
    this.phaseShade.setFillStyle(PHASE_TINT[this.state.phase], PHASE_ALPHA[this.state.phase]);
    this.phaseShade.setSize(this.scale.width, this.scale.height);
    this.updateVignette();
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

  private layoutBottomButtons(): void {
    let x = 10;
    const gap = this.scale.width < 440 ? 5 : 8;
    for (const btn of [this.recallBtn, this.muteBtn, this.codexBtn, this.restartBtn]) {
      if (!btn || !btn.visible) continue;
      btn.setX(x);
      x += Math.ceil(btn.width) + gap;
    }
  }

  // ---- drawing -------------------------------------------------------------------------

  private depthAtY(y: number): number {
    return 4 + y * 0.003;
  }

  private drawActors(dt: number): void {
    const s = this.state;
    const sg = this.shadowGraphics.clear();
    const move = this.readInput();
    const moving = move.x !== 0 || move.y !== 0;
    const down = isPlayerDown(s);

    // Warm atmospheric Gaussian glow halos & animated ember sparks over the 4 Sanctuary braziers, Core & Hero
    const phaseLight = s.phase === 'night' ? 1.0 : s.phase === 'evening' ? 0.72 : 0.36;
    const emberPulse = 0.26 + 0.09 * Math.sin(this.animTime * 7.2);
    const braziers: Array<[number, number]> = [
      [-108, -92],
      [108, -92],
      [-110, 28],
      [110, 28],
    ];
    for (let i = 0; i < braziers.length; i++) {
      const [bx, by] = braziers[i];
      const lx = CORE_X + bx;
      const ly = CORE_Y + by;
      sg.fillStyle(0xf97316, emberPulse * 0.48).fillEllipse(lx, ly, 44, 26);
      sg.fillStyle(0xfef08a, emberPulse * 0.45).fillEllipse(lx, ly - 4, 16, 11);
      // Rising animated flame ember sparks above brazier bowl
      for (let k = 0; k < 2; k++) {
        const sp = (this.animTime * 2.1 + i * 0.37 + k * 0.5) % 1;
        const sx = lx + Math.sin(this.animTime * 6.5 + i + k * 2.1) * 4.2;
        const sy = ly - 10 - sp * 20;
        sg.fillStyle(k === 0 ? 0xfef08a : 0xf97316, (1 - sp) * 0.88).fillCircle(sx, sy, 2.2 * (1 - sp * 0.5));
      }
      const lp = this.lightPoolSprites[i];
      if (lp) {
        const flicker = 1 + 0.08 * Math.sin(this.animTime * 8.4 + i * 1.7);
        lp.setPosition(lx, ly + 4)
          .setTint(0xfb923c)
          .setDisplaySize(172 * flicker, 108 * flicker)
          .setAlpha((0.36 + 0.12 * Math.sin(this.animTime * 6.5 + i)) * phaseLight);
      }
    }
    const coreLight = this.lightPoolSprites[4];
    if (coreLight) {
      const cp = 1 + 0.06 * Math.sin(this.animTime * 3.1);
      coreLight
        .setPosition(CORE_X, CORE_Y - 4)
        .setTint(0xc084fc)
        .setDisplaySize(236 * cp, 148 * cp)
        .setAlpha(0.32 * phaseLight + 0.08);
    }
    const heroLight = this.lightPoolSprites[5];
    if (heroLight) {
      const heroAlpha = down ? 0 : s.phase === 'night' ? 0.38 : s.phase === 'evening' ? 0.24 : 0.12;
      heroLight
        .setPosition(s.player.x, s.player.y + 4)
        .setTint(0xfde68a)
        .setDisplaySize(208, 128)
        .setAlpha(heroAlpha);
    }

    // 2.5D drop shadow + subtle luminous Violet pedestal ring for Core
    sg.fillStyle(0x0f172a, 0.18).fillEllipse(CORE_X + 5, CORE_Y + 20, 96, 36);
    sg.fillStyle(0x0f172a, 0.26).fillEllipse(CORE_X + 3, CORE_Y + 18, 74, 26);
    const corePulse = 0.28 + 0.12 * Math.sin(this.animTime * 3.2);
    sg.lineStyle(2.2, 0xd8b4fe, corePulse).strokeEllipse(CORE_X, CORE_Y + 6, 104 + Math.sin(this.animTime * 2.5) * 6, 66 + Math.sin(this.animTime * 2.5) * 4);

    const heroNextFacing = resolveFacing(move.x, move.y, this.heroFacing, this.heroFlipX);
    this.heroFacing = heroNextFacing.dir;
    this.heroFlipX = heroNextFacing.flipX;
    this.playerSprite.setFlipX(this.heroFlipX);
    this.playerSprite.setPosition(s.player.x, s.player.y - 12);
    this.playerSprite.setDepth(this.depthAtY(s.player.y));
    // 2.5D penumbra + contact shadow + crisp readable cyan Hero ground ring beneath feet
    sg.fillStyle(0x0f172a, down ? 0.12 : 0.18).fillEllipse(s.player.x + 3, s.player.y + 13, 38, 16);
    sg.fillStyle(0x0f172a, down ? 0.18 : 0.30).fillEllipse(s.player.x + 1, s.player.y + 11, 26, 11);
    if (!down) {
      sg.lineStyle(1.4, 0x38bdf8, 0.38).strokeEllipse(s.player.x, s.player.y + 11, 30, 13);
    }

    if (!down && this.castPoseLeft > 0) {
      const auraAlpha = Math.min(1, this.castPoseLeft / 0.24) * 0.72;
      const ringPulse = 1 + (1 - auraAlpha) * 0.14;
      sg.lineStyle(2.5, 0xfbbf24, auraAlpha).strokeEllipse(s.player.x, s.player.y + 11, 56 * ringPulse, 26 * ringPulse);
      sg.lineStyle(1.8, 0x38bdf8, auraAlpha * 0.9).strokeEllipse(s.player.x, s.player.y + 11, 42 * ringPulse, 19 * ringPulse);
      sg.fillStyle(0x38bdf8, auraAlpha * 0.22).fillEllipse(s.player.x, s.player.y + 11, 44, 20);
      for (let k = 0; k < 4; k++) {
        const ra = this.animTime * 6 + (k * Math.PI) / 2;
        sg.fillStyle(0xfef08a, auraAlpha).fillCircle(
          s.player.x + Math.cos(ra) * 26 * ringPulse,
          s.player.y + 11 + Math.sin(ra) * 12 * ringPulse,
          2.2,
        );
      }
    }

    // Subtle pastel walking dust puffs behind feet when hero moves
    if (!down && moving) {
      const dirX = move.x !== 0 ? -Math.sign(move.x) : this.playerSprite.flipX ? 1 : -1;
      const dirY = move.y !== 0 ? -Math.sign(move.y) : 0;
      for (let p = 0; p < 3; p++) {
        const phase = (this.animTime * 4.5 + p * 0.33) % 1;
        const px = s.player.x + dirX * (6 + phase * 16) + Math.sin(p * 2.1 + this.animTime * 8) * 3;
        const py = s.player.y + 12 + dirY * (4 + phase * 10) - phase * 4;
        const pr = 4.2 * (1 - phase * 0.55);
        sg.fillStyle(0xfef9c3, (1 - phase) * 0.42).fillCircle(px, py, pr);
      }
    }

    if (down) {
      this.playerSprite.setFlipX(false).setAlpha(0.75).clearTint().setScale(0.58, 0.58).setRotation(0);
      if (this.playerSprite.anims.currentAnim?.key !== 'hero_death') this.playerSprite.play('hero_death', true);
    } else if (s.invulnLeft > 0) {
      this.playerSprite
        .setAlpha(0.92)
        .setTexture('hero_hit', FACING_ROW[this.heroFacing])
        .setTint(0xff9999)
        .setScale(0.58, 0.58)
        .setRotation(0);
    } else {
      this.playerSprite.setAlpha(1).clearTint().setRotation(0);
      const heroAnim = `${moving ? 'hero_walk' : 'hero_idle'}_${this.heroFacing}`;
      if (this.playerSprite.anims.currentAnim?.key !== heroAnim) this.playerSprite.play(heroAnim, true);
      const castPop = this.castPoseLeft > 0 ? 1.05 : 1;
      this.playerSprite.setScale(0.58 * castPop, 0.58 * castPop);
    }

    // Core visual reflects damage state (frame 0 healthy, 1 damaged, 2 broken) with gentle levitation.
    if (this.coreSprite) {
      const frame = s.coreHp <= 0 ? 2 : s.coreHp < s.coreMaxHp * 0.6 ? 1 : 0;
      const floatOff = frame < 2 ? Math.sin(this.animTime * 2.6) * 2.8 : 0;
      this.coreSprite.setFrame(frame).setY(CORE_Y - 12 - floatOff).setDepth(this.depthAtY(CORE_Y));
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
      const prevHp = this.mobPrevHp.get(m.uid) ?? m.hp;
      if (m.hp < prevHp) this.mobFlashLeft.set(m.uid, 0.085);
      this.mobPrevHp.set(m.uid, m.hp);
      const flashRem = Math.max(0, (this.mobFlashLeft.get(m.uid) ?? 0) - dt);
      if (flashRem > 0) this.mobFlashLeft.set(m.uid, flashRem);
      else this.mobFlashLeft.delete(m.uid);

      const prev = this.mobPrevPos.get(m.uid);
      const aggroPlayer = m.defId === 'bat' || m.defId === 'spirit' || m.defId === 'rift_wolf';
      const fallbackTargetX = aggroPlayer ? s.player.x : CORE_X;
      const fallbackTargetY = aggroPlayer ? s.player.y : CORE_Y;
      const stepDx = prev ? m.x - prev.x : 0;
      const stepDy = prev ? m.y - prev.y : 0;
      const useStep = prev && Math.hypot(stepDx, stepDy) > 0.05;
      const dx = useStep ? stepDx : fallbackTargetX - m.x;
      const dy = useStep ? stepDy : fallbackTargetY - m.y;
      const prevFacing = this.mobFacing.get(m.uid) ?? { dir: 'down' as FacingDir, flipX: false };
      const mobDir = resolveFacing(dx, dy, prevFacing.dir, prevFacing.flipX);
      this.mobFacing.set(m.uid, mobDir);
      this.mobPrevPos.set(m.uid, { x: m.x, y: m.y });

      const mobAnim = `${texKey}_${mobDir.dir}`;
      if (sprite.anims.currentAnim?.key !== mobAnim) sprite.play(mobAnim, true);
      sprite.setFlipX(mobDir.flipX).setRotation(0);

      const airMob = m.defId === 'bat' || m.defId === 'spirit';
      const phase = this.animTime * (airMob ? 12 : 9.5) + m.uid * 1.7;
      const mobBob = airMob ? 5 + Math.sin(phase) * 3.5 : 0;
      const speciesScale = MONSTER_VISUAL_SCALE[m.defId] ?? 0.52;
      const hitPop = flashRem > 0 ? 1.09 : 1.0;
      const baseScale = speciesScale * (m.affix ? 1.18 : 1.0) * hitPop;
      sprite.setScale(baseScale, baseScale);

      if (flashRem > 0) sprite.setTintFill(0xffffff);
      else if (m.slowLeft > 0) sprite.setTint(0x80d8ff);
      else if (m.affix) sprite.setTint(0xe0aaff);
      else sprite.clearTint();
      sprite.setPosition(m.x, m.y - 6 - mobBob).setDepth(this.depthAtY(m.y));
      sprite.setAlpha(m.slowLeft > 0 ? 0.8 : 1);

      const shadowW = Math.round(speciesScale * 58 * (m.affix ? 1.2 : 1.0));
      sg.fillStyle(0x0f172a, 0.15).fillEllipse(m.x + 3, m.y + 13, shadowW + 8, 14);
      sg.fillStyle(0x0f172a, 0.26).fillEllipse(m.x + 1, m.y + 11, shadowW, 10);
      if (m.affix) {
        sg.lineStyle(1.8, 0xc084fc, 0.65).strokeEllipse(m.x, m.y + 11, shadowW + 14, 16);
      }
    }
    for (const [uid, sprite] of this.monsterSprites) {
      if (alive.has(uid)) continue;
      sprite.setVisible(false);
      this.spritePool.push(sprite);
      this.monsterSprites.delete(uid);
      this.mobPrevPos.delete(uid);
      this.mobFacing.delete(uid);
      this.mobPrevHp.delete(uid);
      this.mobFlashLeft.delete(uid);
    }

    const boss = s.boss;
    const bossAlive = !!boss && boss.rules.hp > 0;
    this.bossSprite.setVisible(bossAlive);
    if (boss && bossAlive) {
      const prevB = this.bossPrevHp ?? boss.rules.hp;
      if (boss.rules.hp < prevB) this.bossFlashLeft = 0.09;
      else this.bossFlashLeft = Math.max(0, this.bossFlashLeft - dt);
      this.bossPrevHp = boss.rules.hp;

      const bDx = this.bossPrevPos && Math.hypot(boss.x - this.bossPrevPos.x, boss.y - this.bossPrevPos.y) > 0.05
        ? boss.x - this.bossPrevPos.x
        : s.player.x - boss.x;
      const bDy = this.bossPrevPos && Math.hypot(boss.x - this.bossPrevPos.x, boss.y - this.bossPrevPos.y) > 0.05
        ? boss.y - this.bossPrevPos.y
        : s.player.y - boss.y;
      this.bossPrevPos = { x: boss.x, y: boss.y };
      this.bossFacing = resolveFacing(bDx, bDy, this.bossFacing.dir, this.bossFacing.flipX);

      this.bossSprite.setPosition(boss.x, boss.y - 16).setDepth(this.depthAtY(boss.y)).setRotation(0);
      if (this.bossFlashLeft > 0) this.bossSprite.setTintFill(0xffffff);
      else this.bossSprite.clearTint();
      const bossBase = boss.rules.enraged ? 'boss_bloodmoon_enrage_walk' : 'boss_bloodmoon_walk';
      const bossAnim = `${bossBase}_${this.bossFacing.dir}`;
      if (this.bossSprite.anims.currentAnim?.key !== bossAnim) this.bossSprite.play(bossAnim, true);
      this.bossSprite.setFlipX(this.bossFacing.flipX);
      sg.fillStyle(0x0f172a, 0.18).fillEllipse(boss.x + 6, boss.y + 38, 108, 36);
      sg.fillStyle(0x0f172a, 0.28).fillEllipse(boss.x + 2, boss.y + 34, 86, 28);
      sg.lineStyle(2.5, boss.rules.enraged ? 0xff4d79 : 0xf43f5e, 0.65).strokeEllipse(boss.x, boss.y + 34, 104, 38);
    }

    // HD 2.5D sprites for the base well and gatherable ingredient nodes (R2) with Y-depth sorting.
    const hasGatherTex = this.textures.exists('gather_nodes');
    if (hasGatherTex && s.well) {
      const w = s.well;
      const full = w.water + w.fish > 0;
      const frame = full ? 2 : 3;
      if (!this.wellSprite || !this.wellSprite.scene) {
        this.wellSprite = this.add.sprite(w.x, w.y - 6, 'gather_nodes', frame).setScale(0.42);
      }
      if (!this.wellLabel || !this.wellLabel.scene) {
        this.wellLabel = this.add
          .text(w.x, w.y - 38, '💧 บ่อน้ำ', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#bae6fd',
            backgroundColor: '#0f172acc',
            stroke: '#090d16',
            strokeThickness: 3,
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5);
      }
      this.wellSprite.setFrame(frame).setPosition(w.x, w.y - 6).setDepth(this.depthAtY(w.y)).setVisible(true);
      const labelBob = Math.sin(this.animTime * 3.4) * 2.5;
      this.wellLabel
        .setPosition(w.x, w.y - 44 + labelBob)
        .setDepth(this.depthAtY(w.y) + 0.2)
        .setVisible(full && s.phase === 'day');
      sg.fillStyle(0x0f172a, 0.15).fillEllipse(w.x + 6, w.y + 13, 52, 18);
      sg.fillStyle(0x0f172a, 0.25).fillEllipse(w.x + 2, w.y + 11, 42, 14);
    } else {
      this.wellSprite?.setVisible(false);
      this.wellLabel?.setVisible(false);
    }

    let nodeIdx = 0;
    if (hasGatherTex) {
      for (const n of s.resourceNodes ?? []) {
        if (n.taken) continue;
        let spr = this.nodeSprites[nodeIdx];
        if (!spr || !spr.scene) {
          spr = this.add.sprite(n.x, n.y, 'gather_nodes', 0);
          this.nodeSprites[nodeIdx] = spr;
        }
        const frame = n.kind === 'grain' ? 0 : 1;
        const bob = Math.sin(this.animTime * 2.8 + n.x * 0.05) * 1.4;
        const sway = Math.sin(this.animTime * 3.1 + n.y * 0.05) * 0.045;
        spr
          .setFrame(frame)
          .setPosition(n.x, n.y - 8 - bob)
          .setScale(0.36)
          .setRotation(sway)
          .setDepth(this.depthAtY(n.y))
          .setVisible(true);
        sg.fillStyle(0x0f172a, 0.14).fillEllipse(n.x + 4, n.y + 10, 36, 13);
        sg.fillStyle(0x0f172a, 0.22).fillEllipse(n.x + 1, n.y + 9, 28, 10);
        nodeIdx++;
      }
    }
    for (let i = nodeIdx; i < this.nodeSprites.length; i++) {
      this.nodeSprites[i]?.setVisible(false);
    }

    const hasDecalTex = this.textures.exists('world_decals');
    let chestIdx = 0;
    if (hasDecalTex) {
      for (const c of s.chests ?? []) {
        let cspr = this.chestSprites[chestIdx];
        if (!cspr || !cspr.scene) {
          cspr = this.add.sprite(c.x, c.y, 'world_decals', 2).setScale(0.38);
          this.chestSprites[chestIdx] = cspr;
        }
        cspr.setPosition(c.x, c.y - 4).setDepth(this.depthAtY(c.y)).setVisible(true);
        if (c.opened) {
          cspr.setTint(0x64748b).setAlpha(0.55);
        } else {
          cspr.clearTint().setAlpha(1);
          sg.fillStyle(0x0f172a, 0.24).fillEllipse(c.x + 2, c.y + 10, 30, 12);
          sg.fillStyle(0xfbbf24, 0.22).fillEllipse(c.x, c.y + 6, 44, 22);
        }
        chestIdx++;
      }
    }
    for (let i = chestIdx; i < this.chestSprites.length; i++) {
      this.chestSprites[i]?.setVisible(false);
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

  /** "+1 ธัญพืช" over a picked-up ingredient (R2). Shares the combat popup pool. */
  private spawnItemPopup(kind: string, count: number, x: number, y: number): void {
    if (this.combatPopups.length >= 20) return;
    const label = ITEM_LABEL[kind] ?? kind;
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
    // Stack popups that start on the same spot (the well gives water and fish together).
    const stacked = this.combatPopups.filter((p) => p.itemAt === `${x},${y}` && p.ttl > p.maxTtl - 0.1).length;
    txt.setText(`+${count} ${label}`).setColor('#86efac').setPosition(x, y - 18 - stacked * 18).setScale(1).setAlpha(1).setVisible(true);
    this.combatPopups.push({ text: txt, ttl: 0.9, maxTtl: 0.9, vy: 28, itemAt: `${x},${y}` });
  }

  private spawnComboPopup(combo: number): void {
    if (this.combatPopups.length >= 20) return;
    const label = combo >= 10 ? `🔥 ${combo} COMBO! คลั่ง!` : `🔥 ${combo} COMBO!`;
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
        .setDepth(26);
    txt
      .setText(label)
      .setColor(combo >= 10 ? '#fb7185' : '#fdba74')
      .setPosition(this.state.player.x, this.state.player.y - 46)
      .setScale(1.15)
      .setAlpha(1)
      .setVisible(true);
    this.combatPopups.push({ text: txt, ttl: 0.85, maxTtl: 0.85, vy: 36 });
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
      img.setTexture(key).setBlendMode(Phaser.BlendModes.ADD).setVisible(true);
      this.activeFxSprites.push(img);
      return img;
    };

    const drawStarburst = (cx: number, cy: number, rays: number, rad: number, col: number, a: number, rotOff = 0) => {
      for (let i = 0; i < rays; i++) {
        const ang = rotOff + (i * Math.PI * 2) / rays;
        const inner = rad * 0.28;
        const outer = rad * (i % 2 === 0 ? 1.15 : 0.78);
        g.lineStyle(2.2, col, a).lineBetween(
          cx + Math.cos(ang) * inner,
          cy + Math.sin(ang) * inner,
          cx + Math.cos(ang) * outer,
          cy + Math.sin(ang) * outer,
        );
      }
      g.fillStyle(0xffffff, a).fillCircle(cx, cy, Math.max(2.5, rad * 0.24));
    };

    this.liveFx = this.liveFx.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.liveFx) {
      const alpha = Phaser.Math.Clamp(f.ttl / FX_SECONDS, 0, 1);
      const progress = 1 - alpha;
      const color = f.missed ? 0x94a3b8 : this.fxColorForSkill(f.skillId);
      const facing = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
      const vfxKey = f.shape === 'cone' ? 'vfx_cone' : f.shape === 'line' ? 'vfx_line' : f.shape === 'ring' ? 'vfx_ring' : 'vfx_projectile';

      // Brief 2.5D foreshortened caster magic rune ellipse on ground plane.
      if (!f.missed && progress < 0.5) {
        const castAlpha = (1 - progress / 0.5) * 0.72;
        const castR = 14 + progress * 24;
        g.lineStyle(2.2, 0xfef08a, castAlpha).strokeEllipse(f.x1, f.y1 + 8, castR * 2.1, castR * 1.25);
        g.lineStyle(1.6, color, castAlpha * 0.9).strokeEllipse(f.x1, f.y1 + 8, castR * 1.4, castR * 0.85);
      }

      if (f.shape === 'cone') {
        const radius = f.radius ?? 52;
        const reach = radius * (0.76 + 0.26 * Math.sin(Math.min(1, progress * 1.45) * Math.PI * 0.5));
        if (this.textures.exists(vfxKey)) {
          const size = Math.max(66, radius * 1.85);
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.95 * alpha)
            .setPosition(f.x1, f.y1 - 4)
            .setOrigin(0.14, 0.5)
            .setRotation(facing)
            .setDisplaySize(size, size);
          acquireVfx(vfxKey)
            .setTint(0xffffff)
            .setAlpha(0.55 * alpha)
            .setPosition(f.x1, f.y1 - 4)
            .setOrigin(0.14, 0.5)
            .setRotation(facing + 0.08 * progress)
            .setDisplaySize(size * 0.82, size * 0.82);
        }
        // Foreshortened ground cleave glow + triple-layered crescent sword waves
        g.fillStyle(color, 0.22 * alpha).fillEllipse(
          f.x1 + Math.cos(facing) * (radius * 0.45),
          f.y1 + 10 + Math.sin(facing) * (radius * 0.35),
          radius * 1.2,
          radius * 0.72,
        );
        g.fillStyle(color, 0.26 * alpha);
        g.slice(f.x1, f.y1 - 4, reach, facing - 0.88, facing + 0.88, false).fillPath();
        g.fillStyle(0xffffff, 0.18 * alpha);
        g.slice(f.x1, f.y1 - 4, reach * 0.66, facing - 0.72, facing + 0.72, false).fillPath();
        g.lineStyle(8, color, 0.45 * alpha).beginPath().arc(f.x1, f.y1 - 4, reach * 0.94, facing - 0.86, facing + 0.86, false).strokePath();
        g.lineStyle(4.5, color, 0.85 * alpha).beginPath().arc(f.x1, f.y1 - 4, reach * 0.78, facing - 0.8, facing + 0.8, false).strokePath();
        g.lineStyle(2.5, 0xffffff, 0.95 * alpha).beginPath().arc(f.x1, f.y1 - 4, reach, facing - 0.85, facing + 0.85, false).strokePath();
        // Flying starlight / sakura spark motes bursting off slash edge
        for (let k = 0; k < 6; k++) {
          const sa = facing - 0.72 + (k / 5) * 1.44 + progress * 0.14;
          const sr = reach * (0.72 + 0.34 * progress) + (k % 2) * 5;
          const sx = f.x1 + Math.cos(sa) * sr;
          const sy = f.y1 - 4 + Math.sin(sa) * sr - progress * 8;
          g.fillStyle(k % 2 === 0 ? 0xffffff : color, alpha).fillCircle(sx, sy, 2.8 * alpha + 1);
        }
      } else if (f.shape === 'line') {
        const len = Math.max(36, Math.hypot(f.x2 - f.x1, f.y2 - f.y1));
        if (this.textures.exists(vfxKey)) {
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.95 * alpha)
            .setPosition(f.x1, f.y1 - 6)
            .setOrigin(0, 0.5)
            .setRotation(facing)
            .setDisplaySize(len, 30 * (0.8 + 0.3 * alpha));
        }
        const dx = f.x2 - f.x1;
        const dy = f.y2 - f.y1;
        const nx = len > 0 ? -dy / len : 0;
        const ny = len > 0 ? dx / len : 0;
        // Ground glow projection under beam
        g.lineStyle(10, 0x090d16, 0.2 * alpha).lineBetween(f.x1, f.y1 + 10, f.x2, f.y2 + 10);
        g.lineStyle(12, color, 0.28 * alpha).lineBetween(f.x1, f.y1 - 6, f.x2, f.y2 - 6);
        const drawBolt = (width: number, col: number, a: number) => {
          g.lineStyle(width, col, a).beginPath().moveTo(f.x1, f.y1 - 6);
          const segments = 6;
          for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const jag = Math.sin((i + 1) * 3.7 + this.animTime * 42) * 10 * alpha;
            g.lineTo(f.x1 + dx * t + nx * jag, f.y1 - 6 + dy * t + ny * jag);
          }
          g.lineTo(f.x2, f.y2 - 6).strokePath();
        };
        drawBolt(5.5, color, 0.85 * alpha);
        drawBolt(2.2, 0xffffff, 0.98 * alpha);
        // Secondary spiraling energy helix along beam
        g.lineStyle(2, 0xfef08a, 0.72 * alpha).beginPath().moveTo(f.x1, f.y1 - 6);
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const wave = Math.sin(t * Math.PI * 3.5 + this.animTime * 34) * 8 * Math.sin(t * Math.PI);
          g.lineTo(f.x1 + dx * t + nx * wave, f.y1 - 6 + dy * t + ny * wave);
        }
        g.strokePath();
        // Muzzle star flare + 8-ray impact starburst
        drawStarburst(f.x1, f.y1 - 6, 4, 10 * alpha + 3, color, 0.9 * alpha, facing);
        drawStarburst(f.x2, f.y2 - 6, 8, 16 * alpha + 6, color, 0.95 * alpha, -facing);
        g.lineStyle(2.2, 0xffffff, 0.82 * alpha).strokeEllipse(f.x2, f.y2 + 2, (12 + 22 * progress), (7 + 13 * progress));
      } else if (f.shape === 'ring') {
        const radius = f.radius ?? 52;
        const dia = Math.max(54, radius * 2);
        if (this.textures.exists(vfxKey)) {
          const rScale = 0.65 + 0.45 * progress;
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.95 * alpha)
            .setPosition(f.x2, f.y2 + 4)
            .setOrigin(0.5)
            .setRotation(progress * 2.8)
            .setDisplaySize(dia * rScale, dia * rScale * 0.64);
          acquireVfx(vfxKey)
            .setTint(0xfef08a)
            .setAlpha(0.55 * alpha)
            .setPosition(f.x2, f.y2 + 4)
            .setOrigin(0.5)
            .setRotation(-progress * 3.8)
            .setDisplaySize(dia * rScale * 0.72, dia * rScale * 0.46);
        }
        const waveR = radius * (0.45 + 0.65 * progress);
        // 2.5D foreshortened ground shockwave ellipses
        g.fillStyle(color, 0.24 * alpha).fillEllipse(f.x2, f.y2 + 4, waveR * 2, waveR * 1.28);
        g.lineStyle(4, color, 0.88 * alpha).strokeEllipse(f.x2, f.y2 + 4, waveR * 2, waveR * 1.28);
        g.lineStyle(2.2, 0xffffff, 0.8 * alpha).strokeEllipse(f.x2, f.y2 + 4, waveR * 1.44, waveR * 0.92);
        // 8 Orbiting rising magic star motes around ring perimeter
        for (let k = 0; k < 8; k++) {
          const ma = progress * 2.2 + (k * Math.PI * 2) / 8;
          const mx = f.x2 + Math.cos(ma) * waveR * 0.82;
          const my = f.y2 + 4 + Math.sin(ma) * waveR * 0.52 - progress * 28 - (k % 3) * 6;
          g.fillStyle(k % 2 === 0 ? 0xfef08a : 0xffffff, 0.9 * alpha).fillCircle(mx, my, 2.4 * alpha + 1);
        }
        // 3D Vertical Spell Pillar rising into sky + base flare
        if (!f.missed) {
          const beamW = Math.max(14, radius * 0.58) * (1 - progress * 0.35);
          const beamH = 104 * Math.sin(Math.min(1, progress * 1.4) * Math.PI * 0.5);
          g.fillStyle(color, 0.18 * alpha).fillRect(f.x2 - beamW * 0.72, f.y2 + 4 - beamH * 1.05, beamW * 1.44, beamH * 1.05);
          g.fillStyle(color, 0.3 * alpha).fillRect(f.x2 - beamW * 0.5, f.y2 + 4 - beamH, beamW, beamH);
          g.fillStyle(0xffffff, 0.42 * alpha).fillRect(f.x2 - beamW * 0.2, f.y2 + 4 - beamH * 0.95, beamW * 0.4, beamH * 0.95);
        }
        if (f.skillId === 'R01a' && progress < 0.8) {
          const drop = 1 - progress / 0.8;
          const mx = f.x2 - 86 * drop;
          const my = f.y2 - 160 * drop;
          g.lineStyle(12, 0xff5400, 0.88).lineBetween(mx, my, f.x2, f.y2);
          g.lineStyle(5, 0xfef08a, 0.98).lineBetween(mx, my, f.x2, f.y2);
          // Fluffy cartoon smoke puffs along meteor trail
          for (let sm = 0; sm < 3; sm++) {
            const st = 0.25 + sm * 0.28;
            g.fillStyle(0xfda4af, 0.45 * alpha).fillCircle(mx + (f.x2 - mx) * st, my + (f.y2 - my) * st, 6 + sm * 3);
          }
          drawStarburst(f.x2, f.y2, 8, 18 + 14 * (1 - drop), 0xff9f1c, 0.95);
        }
      } else {
        const eased = Math.min(1, progress * 1.35);
        const px = f.x1 + (f.x2 - f.x1) * eased;
        const py = f.y1 + (f.y2 - f.y1) * eased;
        const elev = Math.sin(eased * Math.PI) * 10 + 6;
        // Ground shadow traveling beneath elevated projectile
        g.fillStyle(0x090d16, 0.26 * alpha).fillEllipse(px + 2, py + 12, 18, 8);
        for (let k = 5; k >= 1; k--) {
          const bt = Math.max(0, eased - k * 0.075);
          const bx = f.x1 + (f.x2 - f.x1) * bt;
          const by = f.y1 + (f.y2 - f.y1) * bt - (Math.sin(bt * Math.PI) * 10 + 6);
          g.fillStyle(k % 2 === 0 ? 0xfef08a : color, (0.8 - k * 0.13) * alpha).fillCircle(bx, by, 6.2 - k * 0.85);
        }
        if (this.textures.exists(vfxKey)) {
          acquireVfx(vfxKey)
            .setTint(color)
            .setAlpha(0.98 * alpha)
            .setPosition(px, py - elev)
            .setOrigin(0.5)
            .setRotation(facing + progress * 2.5)
            .setDisplaySize(34, 34);
        }
        g.fillStyle(0xffffff, 0.95 * alpha).fillCircle(px, py - elev, 4.8);
        g.lineStyle(2.5, color, 0.6 * alpha).lineBetween(f.x1, f.y1 - 6, px, py - elev);
        if (progress > 0.52) {
          const burst = (progress - 0.52) / 0.48;
          const br = 8 + burst * 24;
          g.lineStyle(2.6, 0xffffff, (1 - burst) * 0.92).strokeEllipse(f.x2, f.y2 + 2, br * 2, br * 1.3);
          g.lineStyle(2, color, (1 - burst) * 0.75).strokeEllipse(f.x2, f.y2 + 2, br * 2.5, br * 1.62);
          drawStarburst(f.x2, f.y2 - 4, 8, br * 1.15, color, (1 - burst) * 0.95, facing);
        }
      }
    }
    this.drawAtmosphere(dt);
  }

  private drawAtmosphere(dt: number): void {
    const ag = this.atmosphereGraphics.clear();
    if (!this.ambientMotes.length) return;
    const cam = this.cameras.main;
    const cx = cam.midPoint.x;
    const cy = cam.midPoint.y;
    const halfW = 700;
    const halfH = 430;
    const phase = this.state.phase;

    for (const m of this.ambientMotes) {
      m.ox += m.vx * dt + Math.sin(this.animTime * m.speed + m.phase) * 9 * dt;
      m.oy += m.vy * dt + Math.cos(this.animTime * m.speed * 0.8 + m.phase) * 5 * dt;
      if (m.ox < -halfW) m.ox += halfW * 2;
      if (m.ox > halfW) m.ox -= halfW * 2;
      if (m.oy < -halfH) m.oy += halfH * 2;
      if (m.oy > halfH) m.oy -= halfH * 2;

      const wx = cx + m.ox;
      const wy = cy + m.oy;
      const pulse = 0.55 + 0.45 * Math.sin(this.animTime * (m.speed * 1.4) + m.phase);

      if (phase === 'day') {
        const col = m.variant === 0 ? 0xfef08a : m.variant === 1 ? 0xd9f99d : 0xffffff;
        ag.fillStyle(col, 0.42 * pulse).fillCircle(wx, wy, m.r * 1.55);
        ag.fillStyle(0xffffff, 0.62 * pulse).fillCircle(wx, wy, m.r * 0.6);
      } else if (phase === 'evening') {
        const col = m.variant === 0 ? 0xf97316 : m.variant === 1 ? 0xfacc15 : 0xfef08a;
        ag.fillStyle(col, 0.32 * pulse).fillCircle(wx, wy, m.r * 2.1);
        ag.fillStyle(0xfef9c3, 0.72 * pulse).fillCircle(wx, wy, m.r * 0.85);
      } else {
        const col = m.variant === 0 ? 0x67e8f9 : m.variant === 1 ? 0xc084fc : 0xa7f3d0;
        ag.fillStyle(col, 0.24 * pulse).fillCircle(wx, wy, m.r * 3.1);
        ag.fillStyle(col, 0.55 * pulse).fillCircle(wx, wy, m.r * 1.6);
        ag.fillStyle(0xffffff, 0.9 * pulse).fillCircle(wx, wy, m.r * 0.65);
      }
    }
    // Soft warm canopy sunbeam shafts during sunlit daytime
    if (phase === 'day') {
      const shimmer = 0.032 + 0.012 * Math.sin(this.animTime * 0.9);
      for (let b = 0; b < 3; b++) {
        const bx = cx - 340 + b * 310 + Math.sin(this.animTime * 0.35 + b) * 18;
        const by = cy - 420;
        ag.fillStyle(0xfef08a, shimmer).fillPoints(
          [
            { x: bx - 44, y: by },
            { x: bx + 44, y: by },
            { x: bx + 220, y: by + 760 },
            { x: bx + 110, y: by + 760 },
          ],
          true,
        );
      }
    }
  }

  private updateVignette(): void {
    if (!this.vignetteOverlay) return;
    const a = this.state.phase === 'night' ? 0.52 : this.state.phase === 'evening' ? 0.26 : 0;
    this.vignetteOverlay.setDisplaySize(this.scale.width, this.scale.height).setAlpha(a);
  }

  private drawBars(): void {
    const s = this.state;
    const g = this.barGraphics.clear();
    if (!this.textures.exists('world_decals')) {
      for (const c of s.chests ?? []) {
        if (c.opened) {
          g.fillStyle(0x090d16, 0.25).fillEllipse(c.x + 2, c.y + 8, 24, 9);
          g.fillStyle(0x475569, 0.85).fillRect(c.x - 10, c.y - 4, 20, 10);
          g.fillStyle(0x1e293b, 0.9).fillRect(c.x - 8, c.y - 8, 16, 6);
          g.lineStyle(1.5, 0x94a3b8, 0.7).strokeRect(c.x - 10, c.y - 4, 20, 10);
        } else {
          g.fillStyle(0x090d16, 0.34).fillEllipse(c.x + 2, c.y + 9, 28, 11);
          g.fillStyle(0xfbbf24, 0.22).fillEllipse(c.x, c.y + 4, 42, 24);
          g.fillStyle(0x78350f, 1).fillRect(c.x - 11, c.y - 2, 22, 10);
          g.fillStyle(0xd97706, 1).fillRect(c.x - 11, c.y - 9, 22, 8);
          g.lineStyle(1.5, 0x451a03, 1).strokeRect(c.x - 11, c.y - 9, 22, 17);
        }
      }
    }
    // Gatherable ingredients (R2): pulsing aura ring underneath the 2.5D gather_nodes sprites.
    const hasGatherTex = this.textures.exists('gather_nodes');
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 4);
    for (const n of s.resourceNodes ?? []) {
      if (n.taken) continue;
      const glow = n.kind === 'grain' ? 0xfde047 : 0xc084fc;
      g.fillStyle(glow, 0.14 + 0.14 * pulse).fillEllipse(n.x, n.y + 8, 36, 15);
      g.lineStyle(1.8, glow, 0.78).strokeEllipse(n.x, n.y + 8, 30 + pulse * 4, 12 + pulse * 2);
      if (!hasGatherTex) {
        if (n.kind === 'grain') {
          g.lineStyle(2, 0xa16207, 1).lineBetween(n.x, n.y + 8, n.x, n.y - 6);
          g.lineBetween(n.x - 4, n.y + 8, n.x - 5, n.y - 3).lineBetween(n.x + 4, n.y + 8, n.x + 5, n.y - 3);
          g.fillStyle(0xfacc15, 1).fillEllipse(n.x, n.y - 7, 5, 9).fillEllipse(n.x - 5, n.y - 4, 4, 8).fillEllipse(n.x + 5, n.y - 4, 4, 8);
        } else {
          g.fillStyle(0xf5f5f4, 1).fillRect(n.x - 2, n.y - 1, 4, 8);
          g.fillStyle(0xa855f7, 1).fillEllipse(n.x, n.y - 3, 16, 9);
          g.fillStyle(0xf0abfc, 1).fillCircle(n.x - 4, n.y - 4, 1.5).fillCircle(n.x + 3, n.y - 5, 1.5);
        }
      }
    }
    if (s.well) {
      const w = s.well;
      const full = w.water + w.fish > 0;
      if (!hasGatherTex) {
        g.fillStyle(0x090d16, 0.3).fillEllipse(w.x, w.y + 10, 34, 10);
        g.fillStyle(0x57534e, 1).fillCircle(w.x, w.y, 15);
        g.fillStyle(full ? 0x0ea5e9 : 0x1e293b, 1).fillCircle(w.x, w.y, 10);
        g.lineStyle(2, 0xa8a29e, 1).strokeCircle(w.x, w.y, 15);
      }
      if (full && s.phase === 'day') {
        g.lineStyle(2, 0x7dd3fc, 0.55 + 0.45 * pulse).strokeEllipse(w.x, w.y + 10, 44 + pulse * 6, 17 + pulse * 3);
      }
    }
    for (const t of s.traps ?? []) {
      if (t.uses <= 0) continue;
      // 2.5D foreshortened rune trap pad
      g.fillStyle(0x090d16, 0.28).fillEllipse(t.x + 1, t.y + 5, 32, 19);
      g.fillStyle(0xff9f1c, 0.24).fillEllipse(t.x, t.y + 3, 28, 17);
      g.lineStyle(2, 0xff9f1c, 0.9).strokeEllipse(t.x, t.y + 3, 28, 17);
      g.lineStyle(1.5, 0xfef08a, 0.8).lineBetween(t.x - 7, t.y + 3, t.x + 7, t.y + 3);
      g.lineStyle(1.5, 0xfef08a, 0.8).lineBetween(t.x, t.y - 2, t.x, t.y + 8);
    }
    const bar = (x: number, y: number, w: number, ratio: number, color: number, h = 7, shieldRatio = 0) => {
      const r = Phaser.Math.Clamp(ratio, 0, 1);
      const rad = Math.min(3, Math.floor(h / 2));
      g.fillStyle(0x050811, 0.88).fillRoundedRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, rad + 1);
      g.fillStyle(0x1e293b, 0.92).fillRoundedRect(x - w / 2, y, w, h, rad);
      const fillW = Math.round(w * r);
      if (fillW >= 3) {
        g.fillStyle(color, 1).fillRoundedRect(x - w / 2, y, fillW, h, Math.min(rad, Math.floor(fillW / 2)));
        g.fillStyle(0xffffff, 0.34).fillRect(x - w / 2 + 1, y + 1, Math.max(1, fillW - 2), Math.max(1, Math.floor(h * 0.32)));
      }
      if (shieldRatio > 0) {
        const sw = Math.round(w * Phaser.Math.Clamp(shieldRatio, 0, 1));
        if (sw >= 3) {
          g.lineStyle(1.5, 0x38bdf8, 0.95).strokeRoundedRect(x - w / 2, y, sw, h, Math.min(rad, Math.floor(sw / 2)));
        }
      }
    };
    const coreShieldRatio = (s.coreShield ?? 0) > 0 ? Math.min(1, s.coreShield! / Math.max(1, s.coreMaxHp * 0.4)) : 0;
    bar(CORE_X, CORE_Y - 78, 96, s.coreHp / s.coreMaxHp, 0xc084fc, 8, coreShieldRatio);
    bar(s.player.x, s.player.y - 48, 42, s.player.hp / s.player.maxHp, 0x22c55e, 7);
    for (const m of s.monsters) {
      if (m.hp < m.maxHp) {
        const mw = m.defId === 'rift_wolf' || m.defId === 'golem' ? 36 : 26;
        bar(m.x, m.y - (m.defId === 'golem' || m.defId === 'rift_wolf' ? 32 : 24), mw, m.hp / m.maxHp, m.affix ? 0xe879f9 : 0xf43f5e, 4.5);
      }
    }
    if (s.boss && s.boss.rules.hp > 0) bar(s.boss.x, s.boss.y - 68, 128, s.boss.rules.hp / s.boss.rules.maxHp, 0xff4d6d, 9);
  }

  private drawHud(fpsSnap?: FpsMonitorSnapshot): void {
    const s = this.state;
    const panelW = Math.min(288, Math.max(222, this.scale.width - (import.meta.env.DEV ? 148 : 20)));
    const hasPortrait = !!this.hudHeroPortrait;
    const barX = hasPortrait ? 64 : 18;
    const barW = panelW - barX - 10;

    const left = phaseRemaining(s);
    const time = Number.isFinite(left) ? `${Math.ceil(left)} วิ` : 'จันทร์เลือด';
    this.hudTitle.setText(`วันที่ ${s.day}/7 · ${PHASE_LABEL[s.phase]} · ${time}`);
    this.hudHpText.setX(barX + 5).setText(`HP ${Math.ceil(s.player.hp)}/${s.player.maxHp}`);
    const shieldTxt = (s.coreShield ?? 0) > 0 ? ` (+โล่ ${Math.ceil(s.coreShield!)})` : '';
    this.hudCoreText.setX(barX + 5).setText(`แกนฐาน ${Math.ceil(s.coreHp)}/${s.coreMaxHp}${shieldTxt}`);

    const nextXp = Math.max(1, xpToNext(s.player.level));
    const fpsText = fpsSnap
      ? ` · FPS ${Math.round(fpsSnap.averageFps)}${fpsSnap.lowEndFallbackActive ? ' (30fps)' : ''}`
      : '';
    this.hudMetaText.setText(`Lv.${s.player.level} (${formatExpPercent(s.player.xp, nextXp)}) · ปราบ ${s.kills} · มอน ${s.monsters.length}${fpsText}`);

    const invStr = formatInventorySummary(s.inventory ?? {});
    const coreStr = (s.cores ?? 0) > 0 ? ` · Core ×${s.cores}` : '';
    const synStr = formatSynergyHudLine(s, this.data_.skills);
    const buffStr = s.phase === 'night' && s.nightBuff ? formatMealBuff(s.nightBuff) : '';
    const extraLines = [synStr, buffStr ? `🍲 ${buffStr}` : ''].filter(Boolean);
    this.hudInvText.setWordWrapWidth(panelW - 22);
    this.hudInvText.setText(`ของ: ${invStr}${coreStr}${extraLines.length > 0 ? `\n${extraLines.join(' · ')}` : ''}`);

    const panelH = Math.max(126, 106 + Math.ceil(this.hudInvText.height) + 8);
    this.hudPanelH = panelH;
    this.skillDock?.setY(10 + panelH + 6);
    if (this.systemToast.visible) this.positionSystemToast();

    const g = this.hudGraphics.clear();
    // Classic RO / Concept Fantasy Gold & Slate Basic Info window frame
    drawRoWindow(g, 10, 10, panelW, panelH, { headerHeight: 24, bodyAlpha: 0.92 });

    // Ornate Gold-Framed Hero Portrait Thumbnail inside Basic Info HUD
    if (hasPortrait) {
      g.fillStyle(0x16243d, 0.98).fillRoundedRect(17, 38, 42, 42, 4);
      g.lineStyle(1.8, RO_PALETTE.windowGoldAccent, 0.95).strokeRoundedRect(17, 38, 42, 42, 4);
      g.lineStyle(1, RO_PALETTE.windowOuterBorder, 0.9).strokeRoundedRect(19, 40, 38, 38, 3);
    }

    // Segmented HP / CORE / EXP bars
    const hpRatio = Phaser.Math.Clamp(s.player.hp / Math.max(1, s.player.maxHp), 0, 1);
    drawRoGaugeBar(g, barX, 39, barW, 14, hpRatio, hpRatio < 0.35 ? RO_PALETTE.hpLowFill : RO_PALETTE.hpFill);

    const coreRatio = Phaser.Math.Clamp(s.coreHp / Math.max(1, s.coreMaxHp), 0, 1);
    drawRoGaugeBar(g, barX, 57, barW, 14, coreRatio, RO_PALETTE.spFill);

    const xpRatio = Phaser.Math.Clamp(s.player.xp / nextXp, 0, 1);
    drawRoGaugeBar(g, barX, 75, barW, 8, xpRatio, RO_PALETTE.expFill);

    // Sunken status well for inventory + Synergy
    const wellH = Math.max(22, panelH - 107);
    g.fillStyle(RO_PALETTE.windowWell, 0.92).fillRoundedRect(16, 101, panelW - 12, wellH, 4);
    g.lineStyle(1, RO_PALETTE.windowBevelDark, 0.95).strokeRoundedRect(16, 101, panelW - 12, wellH, 4);

    // Bottom-right 88x88 Tactical Mini-Radar with Fantasy Gold Bezel & Crosshairs
    const radarSize = 88;
    const rx = this.scale.width - 100;
    const ry = this.scale.height - 138;
    this.radarLabel.setPosition(rx, ry - 15).setText('🧭 N · RADAR');
    g.fillStyle(RO_PALETTE.windowOuterBorder, 0.95).fillRoundedRect(rx - 3, ry - 3, radarSize + 6, radarSize + 6, 7);
    g.fillStyle(0x09111e, 0.9).fillRoundedRect(rx, ry, radarSize, radarSize, 5);
    g.lineStyle(1.8, RO_PALETTE.windowGoldAccent, 0.92).strokeRoundedRect(rx, ry, radarSize, radarSize, 5);
    g.lineStyle(1, 0x38bdf8, 0.16).strokeCircle(rx + radarSize / 2, ry + radarSize / 2, radarSize * 0.34);
    g.lineStyle(1, 0x94a3b8, 0.14)
      .lineBetween(rx + radarSize / 2, ry + 4, rx + radarSize / 2, ry + radarSize - 4)
      .lineBetween(rx + 4, ry + radarSize / 2, rx + radarSize - 4, ry + radarSize / 2);
    const toRadar = (wx: number, wy: number) => ({
      x: rx + 4 + Phaser.Math.Clamp(wx / WORLD, 0, 1) * (radarSize - 8),
      y: ry + 4 + Phaser.Math.Clamp(wy / WORLD, 0, 1) * (radarSize - 8),
    });
    const corePt = toRadar(CORE_X, CORE_Y);
    g.fillStyle(0x38bdf8, 0.95).fillRect(corePt.x - 3, corePt.y - 3, 6, 6);
    if (s.well) {
      const wp = toRadar(s.well.x, s.well.y);
      g.fillStyle(s.well.water + s.well.fish > 0 ? 0x0ea5e9 : 0x475569, 0.95).fillCircle(wp.x, wp.y, 2.5);
    }
    for (const n of s.resourceNodes ?? []) {
      if (n.taken) continue;
      const np = toRadar(n.x, n.y);
      g.fillStyle(n.kind === 'grain' ? 0xfacc15 : 0xc084fc, 0.9).fillCircle(np.x, np.y, 2);
    }
    for (const c of s.chests ?? []) {
      if (c.opened) continue;
      const cp = toRadar(c.x, c.y);
      g.fillStyle(0xfbbf24, 0.95).fillRect(cp.x - 1.5, cp.y - 1.5, 3, 3);
    }
    for (const m of s.monsters) {
      const mp = toRadar(m.x, m.y);
      const elite = m.defId === 'rift_wolf' || !!m.affix;
      g.fillStyle(elite ? 0xe879f9 : 0xf43f5e, 0.95).fillCircle(mp.x, mp.y, elite ? 2.6 : 1.7);
    }
    if (s.boss && s.boss.rules.hp > 0) {
      const bp = toRadar(s.boss.x, s.boss.y);
      g.fillStyle(0xff0055, 1).fillCircle(bp.x, bp.y, 3.8);
      g.lineStyle(1, 0xfef08a, 0.9).strokeCircle(bp.x, bp.y, 4.5);
    }
    const playerPt = toRadar(s.player.x, s.player.y);
    g.fillStyle(0xffffff, 1).fillCircle(playerPt.x, playerPt.y, 2.8);
    g.lineStyle(1, 0xfde047, 1).strokeCircle(playerPt.x, playerPt.y, 3.2);

    this.recallBtn.setVisible(s.phase === 'day' && s.status === 'playing' && !s.pendingDraft);
    this.muteBtn.setText(`[M] ${this.sfx.isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด'}`);
    this.codexBtn.setText(this.scale.width < 440 ? '[B] สูตร' : '[B] สูตรผสม');
    this.layoutBottomButtons();
    if (isPlayerDown(s)) {
      this.downBanner.setText(`ล้มลง! ฟื้นที่ฐานใน ${Math.ceil(s.respawnIn)} วิ`).setVisible(true);
    } else {
      this.downBanner.setVisible(false);
    }

    this.syncSkillDock();
  }

  private showDockTooltip(text: string, screenX: number, screenY: number, borderColor: number = RO_PALETTE.windowGoldAccent): void {
    this.hideDockTooltip();
    const maxW = Math.min(280, this.scale.width - 20);
    const lbl = this.add.text(10, 8, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#f8fafc',
      lineSpacing: 3,
      wordWrap: { width: maxW - 20 },
    });
    const w = Math.min(maxW, Math.max(140, Math.ceil(lbl.width) + 20));
    const h = Math.ceil(lbl.height) + 16;
    const tx = Phaser.Math.Clamp(Math.round(screenX), 10, Math.max(10, this.scale.width - w - 10));
    const ty = Phaser.Math.Clamp(Math.round(screenY), 10, Math.max(10, this.scale.height - h - 48));

    const box = this.add.container(tx, ty).setScrollFactor(0).setDepth(1200);
    const bg = this.add.graphics();
    bg.fillStyle(RO_PALETTE.windowOuterBorder, 0.97).fillRoundedRect(-1, -1, w + 2, h + 2, 6);
    bg.fillStyle(0x0f172a, 0.96).fillRoundedRect(0, 0, w, h, 5);
    bg.lineStyle(1.5, borderColor, 0.95).strokeRoundedRect(1, 1, w - 2, h - 2, 5);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerup', () => this.hideDockTooltip());
    box.add([bg, lbl]);
    box.each((child: Phaser.GameObjects.GameObject) => {
      (child as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    });
    this.dockTooltip = box;
  }

  private hideDockTooltip(): void {
    this.dockTooltip?.destroy();
    this.dockTooltip = undefined;
  }

  private syncSkillDock(): void {
    const synKey = Object.entries(this.state.synergy ?? {})
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    const skillsKey = this.state.skills
      .map((o) => {
        const def = this.data_.skills.find((d) => d.id === o.id);
        const lv = def ? ownedLevel(def, o.xp) : levelForXp(o.xp);
        return `${o.id}:${lv}:${o.gift ? 1 : 0}`;
      })
      .join(',');
    const key = `${skillsKey}|${synKey}|${this.scale.width}`;
    if (key === this.skillDockKey) return;
    this.skillDockKey = key;
    this.skillDock?.destroy();
    this.skillDock = undefined;
    if (this.state.skills.length === 0) return;

    const badges = buildSynergyHudBadges(this.state, this.data_.skills);
    const count = this.state.skills.length;
    const slotSize = 38;
    const step = 42;
    const padX = 6;
    const padY = 5;
    const slotsW = count * step - 4 + padX * 2;
    const chipRowH = badges.length > 0 ? 22 : 0;
    const chipGap = badges.length > 0 ? 4 : 0;
    const dockX = 10;
    const dockY = 10 + this.hudPanelH + 6;
    const dock = this.add.container(dockX, dockY).setScrollFactor(0).setDepth(900);

    const dockG = this.add.graphics();
    dock.add(dockG);

    const skillTexts: Phaser.GameObjects.GameObject[] = [];
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

      skillTexts.push(
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
      skillTexts.push(
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

      if (def) {
        const hit = this.add
          .rectangle(sx, sy, slotSize, slotSize, 0x000000, 0)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        const dmgLine =
          def.kind === 'active'
            ? `พลังโจมตี ${damageAtLevel(def, lv)} · ทุก ${def.cooldown} วิ · ระยะ ${def.range} ช่อง`
            : `${KIND_LABEL.passive} · เสริมความถึกและป้องกันฐาน`;
        const tagLine = def.tags
          .filter((t) => t in SYNERGY_META_TH)
          .map((t) => {
            const m = SYNERGY_META_TH[t as keyof typeof SYNERGY_META_TH];
            return `${m.icon} ${m.labelTh}`;
          })
          .join(' · ');
        const tipLines = [
          `${def.name.th} (${o.gift ? 'สกิลของขวัญ' : `Lv${lv} · ${RARITY_LABEL[def.rarity]}`})`,
          dmgLine,
          tagLine ? `ธาตุ: ${tagLine}` : '',
        ].filter(Boolean);
        const showTip = () => this.showDockTooltip(tipLines.join('\n'), dockX + sx, dockY + slotSize + chipRowH + 16, borderColor);
        hit.on('pointerover', showTip);
        hit.on('pointerout', () => this.hideDockTooltip());
        hit.on('pointerup', showTip);
        dock.add(hit);
      }
    });
    dock.add(skillTexts);

    let chipTotalW = 0;
    if (badges.length > 0) {
      let cx = padX;
      const cy = padY + slotSize + chipGap;
      const maxRowX = Math.max(slotsW, Math.min(340, this.scale.width - 20)) - padX;
      for (const b of badges) {
        const meta = SYNERGY_META_TH[b.tag];
        const chipBg = b.tier >= 2 ? 0x1e293b : 0x0f172a;
        const chipBorder = b.tier >= 2 ? RO_PALETTE.windowGoldAccent : 0x475569;
        const txt = this.add.text(cx + 5, cy + 3, b.chipTextTh, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: b.tier >= 2 ? meta.colorHex : '#cbd5e1',
        });
        const cw = Math.ceil(txt.width) + 10;
        if (cx > padX && cx + cw > maxRowX) {
          txt.destroy();
          continue;
        }
        dockG.fillStyle(chipBg, 0.94).fillRoundedRect(cx, cy, cw, chipRowH - 2, 4);
        dockG.lineStyle(b.tier >= 2 ? 1.5 : 1, chipBorder, 0.95).strokeRoundedRect(cx, cy, cw, chipRowH - 2, 4);
        dock.add(txt);
        const hit = this.add
          .rectangle(cx, cy, cw, chipRowH - 2, 0x000000, 0)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        const showSyn = () => this.showDockTooltip(b.tooltipTh, dockX + cx, dockY + cy + chipRowH + 6, chipBorder);
        hit.on('pointerover', showSyn);
        hit.on('pointerout', () => this.hideDockTooltip());
        hit.on('pointerup', showSyn);
        dock.add(hit);
        cx += cw + 4;
        chipTotalW = Math.max(chipTotalW, cx - 4 + padX);
      }
    }

    const dockW = Math.max(slotsW, chipTotalW);
    const dockH = slotSize + padY * 2 + (chipTotalW > 0 ? chipGap + chipRowH : 0);
    dockG.fillStyle(RO_PALETTE.windowOuterBorder, 0.96).fillRoundedRect(-1, -1, dockW + 2, dockH + 2, 6);
    dockG.fillStyle(RO_PALETTE.windowBody, 0.92).fillRoundedRect(0, 0, dockW, dockH, 5);
    dockG.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.85).strokeRoundedRect(1, 1, dockW - 2, dockH - 2, 5);
    // Re-stroke slots & chips on top of the resized dock body.
    this.state.skills.forEach((o, i) => {
      const def = this.data_.skills.find((d) => d.id === o.id);
      const borderColor = o.gift ? 0xff9f1c : def ? RARITY_COLOR[def.rarity] : RO_PALETTE.windowBevelLight;
      drawRoIconSlot(dockG, padX + i * step, padY, slotSize, borderColor);
    });
    if (badges.length > 0) {
      let cx = padX;
      const cy = padY + slotSize + chipGap;
      const maxRowX = Math.max(slotsW, Math.min(340, this.scale.width - 20)) - padX;
      for (const b of badges) {
        const approxMeasure = this.add.text(0, 0, b.chipTextTh, { fontFamily: 'system-ui, sans-serif', fontSize: '10px', fontStyle: 'bold' });
        const cw = Math.ceil(approxMeasure.width) + 10;
        approxMeasure.destroy();
        if (cx > padX && cx + cw > maxRowX) continue;
        const chipBg = b.tier >= 2 ? 0x1e293b : 0x0f172a;
        const chipBorder = b.tier >= 2 ? RO_PALETTE.windowGoldAccent : 0x475569;
        dockG.fillStyle(chipBg, 0.94).fillRoundedRect(cx, cy, cw, chipRowH - 2, 4);
        dockG.lineStyle(b.tier >= 2 ? 1.5 : 1, chipBorder, 0.95).strokeRoundedRect(cx, cy, cw, chipRowH - 2, 4);
        cx += cw + 4;
      }
    }

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
              : this.codexOpen
                ? `codex:${this.codexTab}:${s.skills.map((o) => `${o.id}:${o.xp}`).join(',')}:${s.cores}`
                : '';
    const size = `${this.scale.width}x${this.scale.height}`;
    if (`${key}|${size}` === this.overlayKey) return;
    this.overlayKey = `${key}|${size}`;
    this.hideDockTooltip();
    this.overlay?.destroy();
    this.overlay = undefined;
    if (s.status !== 'playing') this.overlay = this.buildEndOverlay();
    else if (s.pendingDraft) this.overlay = this.buildDraftOverlay(s.pendingDraft);
    else if (this.eveningPending) this.overlay = this.buildEveningOverlay();
    else if (this.tutorialPending) this.overlay = this.buildTutorialOverlay();
    else if (this.codexOpen) this.overlay = this.buildCodexOverlay();
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
    const cardW = Math.min(444, w - 28);
    const cardH = 98;
    // Taller when the Core button shows, so head, preview, hint and button never overlap (R3).
    const fusionCanBoost =
      !!fusion && canBoostWithCore(this.state, this.data_.skills, fusion.recipe, fusion.resultSkill.id);
    const fusionCardH = fusionCanBoost ? 158 : 130;
    const gap = 8;
    const winW = cardW + 24;
    const headerH = 28;
    const introH = showIntro ? 36 : 0;
    const cardsH = cards.length * cardH + Math.max(0, cards.length - 1) * gap + (fusion ? gap + fusionCardH : 0);
    const winH = headerH + 14 + 32 + introH + cardsH + 12;
    const winX = Math.round((w - winW) / 2);
    const winY = Math.max(18, Math.round((h - winH) / 2));

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
      const hint = buildDraftCardHint(id, this.state, this.data_.skills, FUSION_RECIPES);

      const hasIcon = this.textures.exists(`icon_${id}`);
      const slotX = cardLeft + 12;
      const slotY = y + Math.round((cardH - 58) / 2);
      drawRoIconSlot(slotG, slotX, slotY, 58, RARITY_COLOR[def.rarity]);

      const textX = cardLeft + 80;
      const wrapW = cardW - 118;
      const cardItems: Phaser.GameObjects.GameObject[] = [frame];
      if (this.textures.exists(`card_frame_${def.rarity}`)) {
        cardItems.push(this.add.image(slotX + 29, slotY + 29, `card_frame_${def.rarity}`).setDisplaySize(50, 56));
      }
      if (hasIcon) {
        cardItems.push(this.add.image(slotX + 29, slotY + 29, `icon_${id}`).setDisplaySize(42, 42));
      }
      const headTxt = this.add.text(textX, y + 8, head, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#f8fafc',
        wordWrap: { width: wrapW },
      });
      const bodyTxt = this.add.text(textX, y + 31, body, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#cbd5e1',
        wordWrap: { width: wrapW },
      });
      cardItems.push(
        this.add
          .text(cardLeft + cardW - 10, y + 8, `[${i + 1}]`, {
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#93c5fd',
            backgroundColor: '#0b111ecc',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(1, 0),
        headTxt,
        bodyTxt,
      );
      let nextHintY = Math.max(y + 52, Math.round(bodyTxt.y + bodyTxt.height + 3));
      if (hint.tagsLineTh) {
        const tagTxt = this.add.text(textX, nextHintY, hint.tagsLineTh, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#fde047',
          wordWrap: { width: cardW - 92 },
        });
        cardItems.push(tagTxt);
        nextHintY = Math.round(tagTxt.y + tagTxt.height + 2);
      }
      if (hint.fusionLineTh && nextHintY < y + cardH - 12) {
        cardItems.push(
          this.add.text(textX, nextHintY, hint.fusionLineTh, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            color: '#86efac',
            wordWrap: { width: cardW - 92 },
          }),
        );
      }
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

      const fSlotG = this.add.graphics();
      const fSlotX = cardLeft + 12;
      const fSlotY = y + 12;
      drawRoIconSlot(fSlotG, fSlotX, fSlotY, 56, RARITY_COLOR[fusion.resultSkill.rarity]);

      const srcA = this.state.skills.find((s) => s.id === fusion.recipe.a);
      const srcB = this.state.skills.find((s) => s.id === fusion.recipe.b);
      const inheritedXp = Math.max(srcA?.xp ?? 0, srcB?.xp ?? 0);
      const inheritedLv = ownedLevel(fusion.resultSkill, inheritedXp);

      const head = `${cards.length + 1}. ⚗️ ผสมสกิล: ${fusion.resultSkill.name.th} (Lv${inheritedLv} · ${RARITY_LABEL[fusion.resultSkill.rarity]})`;
      const previewLine =
        fusion.resultSkill.kind === 'active'
          ? `${KIND_LABEL.active} · พลัง ${damageAtLevel(fusion.resultSkill, inheritedLv)} · ทุก ${fusion.resultSkill.cooldown} วิ · ระยะ ${fusion.resultSkill.range} ช่อง`
          : `${KIND_LABEL.passive} · ถึกขึ้น: รับดาเมจน้อยลงและเลือดสูงสุดเพิ่ม`;
      const coreNote = fusion.recipe.requiresCore ? ' · ใช้ Fusion Core 1 ลูก' : '';
      const hintLine = `อีกผล: "${fusion.alternateSkill.name.th}" (ดัน ${fusion.skillToRaiseForAlternate.name.th} ให้สูงกว่าก่อนผสม)${coreNote}`;
      const canBoost = fusionCanBoost;

      const fTextX = cardLeft + 78;
      const fWrapW = cardW - 116;
      const headText = this.add.text(fTextX, y + 10, head, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        wordWrap: { width: fWrapW },
      });
      const previewText = this.add.text(fTextX, y + 13 + headText.height, previewLine, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#e2e8f0',
        wordWrap: { width: cardW - 92 },
      });
      const hintText = this.add.text(fTextX, previewText.y + previewText.height + 4, hintLine, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11.5px',
        color: '#fde047',
        wordWrap: { width: cardW - 92 },
      });

      const fusionItems: Phaser.GameObjects.GameObject[] = [frame, fSlotG];
      if (this.textures.exists('card_frame_fusion')) {
        fusionItems.push(this.add.image(fSlotX + 28, fSlotY + 28, 'card_frame_fusion').setDisplaySize(48, 54));
      }
      if (this.textures.exists(`icon_${fusion.resultSkill.id}`)) {
        fusionItems.push(this.add.image(fSlotX + 28, fSlotY + 28, `icon_${fusion.resultSkill.id}`).setDisplaySize(40, 40));
      }
      fusionItems.push(
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
        headText,
        previewText,
        hintText,
      );
      box.add(fusionItems);
      if (canBoost) {
        // Fusion Core "+1 rarity" (R3, D17): a separate button so a plain tap never spends the Core.
        const boosted = boostedRarity(fusion.resultSkill.rarity, 1);
        const mult = coreBoostMult(fusion.resultSkill.rarity, 1).toFixed(2);
        const label = `💠 ใช้ Core → ${RARITY_LABEL[boosted]} (ดาเมจ ×${mult}) [C]`;
        const btn = this.add
          .text(cardLeft + cardW - 10, y + fusionCardH - 8, label, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#0b132b',
            backgroundColor: '#67e8f9',
            padding: { x: 8, y: 4 },
          })
          .setOrigin(1, 1)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerup', (_p: unknown, _x: number, _y: number, ev: { stopPropagation(): void }) => {
          ev.stopPropagation();
          this.chooseFusion(true);
        });
        box.add(btn);
      }
    }
    return box;
  }

  private buildCodexOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const { recipes, synergies } = buildCodexEntries(this.state, this.data_.skills, FUSION_RECIPES);
    const winW = Math.min(540, w - 16);
    const winH = Math.min(640, h - 24);
    const winX = Math.round((w - winW) / 2);
    const winY = Math.round((h - winH) / 2);
    const headerH = 28;

    const winG = this.add.graphics();
    drawRoWindow(winG, winX, winY, winW, winH, { headerHeight: headerH, bodyAlpha: 0.97 });
    box.add(winG);

    box.add(
      this.add
        .text(winX + 24, winY + headerH / 2 + 1, 'CODEX · สารานุกรมสูตรผสม & Synergy (หยุดเวลา)', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f8fafc',
          stroke: '#0b111e',
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5),
    );

    const closeBtn = this.add
      .text(winX + winW - 12, winY + headerH / 2 + 1, '✕ ปิด', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fda4af',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        this.codexOpen = false;
      });
    box.add(closeBtn);

    const tabW = Math.floor((winW - 36) / 2);
    const tabY = winY + headerH + 24;
    box.add([
      createRoButton(this, winX + 14 + tabW / 2, tabY, tabW, 30, `⚗️ สูตรผสม (${recipes.length})`, {
        tone: this.codexTab === 'recipes' ? 'gold' : 'slate',
        fontSize: '13px',
        scrollFactor: 0,
        onClick: () => {
          this.codexTab = 'recipes';
        },
      }),
      createRoButton(this, winX + winW - 14 - tabW / 2, tabY, tabW, 30, `✨ ธาตุ & Synergy (${synergies.length})`, {
        tone: this.codexTab === 'synergy' ? 'gold' : 'slate',
        fontSize: '13px',
        scrollFactor: 0,
        onClick: () => {
          this.codexTab = 'synergy';
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
        const rowBg = r.readyToFuse ? 0x1e3a2f : idx % 2 === 0 ? RO_PALETTE.rowBg : 0x151e30;
        const border = r.readyToFuse ? 0x22c55e : 0x334155;
        winG.fillStyle(rowBg, 0.94).fillRoundedRect(listLeft, ry, listW, rowH - 4, 4);
        winG.lineStyle(1, border, 0.9).strokeRoundedRect(listLeft, ry, listW, rowH - 4, 4);

        const lvA = r.aOwnedLv !== null ? `(Lv${r.aOwnedLv})` : '';
        const lvB = r.bOwnedLv !== null ? `(Lv${r.bOwnedLv})` : '';
        const topLine = `${r.id} · ${r.aNameTh}${lvA} + ${r.bNameTh}${lvB}`;
        const coreTag = r.requiresCore ? ' · 💠 Core' : '';
        const botLine = `↳ ${r.resultANameTh} / ${r.resultBNameTh}${coreTag}`;
        box.add([
          this.add.text(listLeft + 8, ry + 4, topLine, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11.5px',
            fontStyle: 'bold',
            color: '#f8fafc',
            wordWrap: { width: listW - 110 },
          }),
          this.add
            .text(listLeft + listW - 8, ry + 4, r.statusLabelTh, {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '10.5px',
              fontStyle: 'bold',
              color: r.readyToFuse ? '#86efac' : '#fde047',
            })
            .setOrigin(1, 0),
          this.add.text(listLeft + 10, ry + 21, botLine, {
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
        const active = syn.tier >= 2;
        winG.fillStyle(active ? 0x1c2840 : RO_PALETTE.rowBg, 0.95).fillRoundedRect(listLeft, ry, listW, rowH - 5, 5);
        winG.lineStyle(active ? 1.5 : 1, active ? RO_PALETTE.windowGoldAccent : 0x334155, 0.92).strokeRoundedRect(listLeft, ry, listW, rowH - 5, 5);

        box.add([
          this.add.text(listLeft + 10, ry + 6, `${syn.icon} ${syn.labelTh} · สะสม ${syn.count} สกิล`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: syn.colorHex,
          }),
          this.add
            .text(listLeft + listW - 10, ry + 7, active ? `เปิดขั้น ${syn.tier}!` : 'ยังไม่เปิดขั้น 2', {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '11px',
              fontStyle: 'bold',
              color: active ? '#fde047' : '#94a3b8',
            })
            .setOrigin(1, 0),
        ]);

        const tierSummary = syn.tiers
          .map((t) => `${t.unlocked ? '✓' : '○'} (${t.tier}) ${t.textTh}`)
          .join('   ');
        box.add(
          this.add.text(listLeft + 10, ry + 27, tierSummary, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11.5px',
            color: active ? '#f8fafc' : '#cbd5e1',
            wordWrap: { width: listW - 20 },
          }),
        );
      });
    }

    box.add(
      createRoButton(this, w / 2, winY + winH - 22, Math.min(220, winW - 40), 30, '[ESC / B] กลับสู่สนามรบ', {
        tone: 'blue',
        fontSize: '13px',
        scrollFactor: 0,
        onClick: () => {
          this.codexOpen = false;
        },
      }),
    );
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
    // The player's press is what fuses the gift (GDD §3 "กดผสมเท่านั้น", R5).
    forceTutorialFusion(this.state);
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
      const dockOffset = this.state.skills.length > 0 ? 84 : 8;
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
    const cardH = 446;
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
    const restartBtn = createRoButton(this, w / 2, topY + 356, shareBtnW, 42, '▶ เริ่มรอบใหม่ [N]', {
      tone: 'blue',
      fontSize: '17px',
      scrollFactor: 0,
      onClick: () => this.newRun(),
    });
    const menuBtn = createRoButton(this, w / 2, topY + 410, shareBtnW, 38, '🏠 เมนูหลัก / ร้าน Meta', {
      tone: 'gold',
      fontSize: '15px',
      scrollFactor: 0,
      onClick: () => this.scene.start('TitleScene'),
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
      menuBtn,
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
      this.chooseFusion(false);
    }
  }

  /** The 4th card. `useCore` spends a Fusion Core for "+1 rarity" when it can (R3, D17). */
  private chooseFusion(useCore: boolean): void {
    if (this.state.status !== 'playing' || !this.state.pendingDraft) return;
    const fusion = findAvailableFusions(this.state, this.data_.skills, FUSION_RECIPES)[0];
    if (!fusion) return;
    const out = pickFusionCard(this.state, fusion.recipe.id, this.data_.skills, FUSION_RECIPES, useCore);
    if (out) {
      this.sfx.playFuse();
      this.bus.emit('draft:pick', { card: `fuse:${fusion.recipe.id}${useCore ? '+core' : ''}` });
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
    const hasDecals = this.textures.exists('world_decals');
    const decalStamp = hasDecals ? this.make.image({ key: 'world_decals', frame: 0, add: false }) : undefined;
    const plazaY = CORE_Y + 4;
    if (this.textures.exists('tile_ground_01')) {
      const rt = this.add.renderTexture(0, 0, WORLD, WORLD).setOrigin(0).setDepth(0);
      rt.beginDraw();
      for (let ty = 0; ty < WORLD; ty += 128) {
        for (let tx = 0; tx < WORLD; tx += 128) {
          const tileIdx = map.int(1, 5);
          rt.batchDrawFrame(`tile_ground_0${tileIdx}`, undefined, tx, ty);
        }
      }
      // Bake non-repeating studio wildflower tufts + painted cardinal flagstone paths into static ground RenderTexture
      if (decalStamp) {
        for (let d = 0; d < 140; d++) {
          const dx = map.int(64, WORLD - 64);
          const dy = map.int(64, WORLD - 64);
          if (Math.hypot(dx - CORE_X, dy - CORE_Y) < 268) continue;
          const sc = 0.28 + (d % 4) * 0.04;
          decalStamp.setFrame(0).setScale(sc).setFlipX(d % 2 === 0).setAlpha(0.92);
          rt.draw(decalStamp, dx, dy);
        }
        // Studio-illustrated sandstone flagstone clusters along N/S/E/W pathways
        for (const [isVert, dir] of [
          [false, -1],
          [false, 1],
          [true, -1],
          [true, 1],
        ] as const) {
          const len = isVert ? 440 : 540;
          const start = isVert ? 156 : 228;
          const steps = 12;
          for (let step = 0; step < steps; step++) {
            const t = step / (steps - 1);
            const dist = start + t * len;
            const wobble = Math.sin(step * 2.1 + dir) * 5;
            const px = isVert ? CORE_X + wobble : CORE_X + dir * dist;
            const py = isVert ? plazaY + dir * dist : plazaY + wobble * 0.7;
            const sc = (0.45 - t * 0.06) * (step % 2 === 0 ? 1.0 : 0.92);
            decalStamp.setFrame(1).setScale(sc).setFlipX((step + (dir > 0 ? 1 : 0)) % 2 === 0).setAlpha(0.96);
            rt.draw(decalStamp, px, py);
          }
        }
      }
      rt.endDraw();
      decalStamp?.destroy();
    } else {
      const gBg = this.add.graphics().setDepth(0);
      gBg.fillStyle(0x1d2b1f).fillRect(0, 0, WORLD, WORLD);
      gBg.lineStyle(1, 0x2b3d2d, 0.6);
      for (let i = 0; i <= MAP_TILES; i++) {
        gBg.lineBetween(i * TILE, 0, i * TILE, WORLD);
        gBg.lineBetween(0, i * TILE, WORLD, i * TILE);
      }
    }

    // World-space painterly meadow glades + soft outer boundary stone walkway + studio crystal pylons.
    const gRoads = this.add.graphics().setDepth(0.8);
    for (let i = 0; i < 36; i++) {
      const gx = map.int(120, WORLD - 120);
      const gy = map.int(120, WORLD - 120);
      const grx = map.int(140, 290);
      const gry = map.int(90, 185);
      if (i % 2 === 0) {
        gRoads.fillStyle(0xbef264, 0.085).fillEllipse(gx, gy, grx, gry);
      } else {
        gRoads.fillStyle(0x064e3b, 0.13).fillEllipse(gx, gy, grx, gry);
      }
    }

    // Warm sunlit clearing glow around Sanctuary + subtle darker mossy perimeter outside ring
    gRoads.fillStyle(0x052e16, 0.11).fillRect(0, 0, WORLD, WORLD);
    gRoads.fillStyle(0xbef264, 0.08).fillEllipse(CORE_X - 40, plazaY - 30, 1240, 740);

    // Outer sanctuary subtle worn mossy stone boundary track + 8 studio Cyan Crystal Pylons
    gRoads.lineStyle(18, 0x0b1f14, 0.16).strokeEllipse(CORE_X, plazaY + 2, 1082, 622);
    gRoads.lineStyle(8, 0x94a3b8, 0.20).strokeEllipse(CORE_X, plazaY, 1080, 620);
    gRoads.lineStyle(1.6, 0x38bdf8, 0.16).strokeEllipse(CORE_X, plazaY, 1080, 620);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI * 2) / 8 + Math.PI / 8;
      const sx = CORE_X + Math.cos(a) * 540;
      const sy = plazaY + Math.sin(a) * 310;
      gRoads.fillStyle(0x38bdf8, 0.18).fillEllipse(sx, sy - 6, 54, 28);
      gRoads.fillStyle(0x07121b, 0.28).fillEllipse(sx + 4, sy + 4, 34, 15);
      if (hasDecals) {
        this.add
          .sprite(sx, sy + 2, 'world_decals', 3)
          .setOrigin(0.5, 0.88)
          .setScale(0.48)
          .setDepth(this.depthAtY(sy));
      }
    }

    const drawRoadTrack = (vertical: boolean, dir: -1 | 1) => {
      const len = vertical ? 440 : 540;
      const start = vertical ? 136 : 210;
      const cx0 = CORE_X + (vertical ? 0 : dir * (start + len * 0.45));
      const cy0 = plazaY + (vertical ? dir * (start + len * 0.45) : 0);
      gRoads.fillStyle(0x283820, 0.34).fillEllipse(cx0, cy0, vertical ? 64 : len, vertical ? len : 52);
      gRoads.fillStyle(0x524632, 0.26).fillEllipse(cx0, cy0, vertical ? 42 : len * 0.9, vertical ? len * 0.9 : 34);
      if (!hasDecals) {
        const steps = 11;
        for (let step = 0; step < steps; step++) {
          const t = step / (steps - 1);
          const dist = start + t * len;
          const px = vertical ? CORE_X : CORE_X + dir * dist;
          const py = vertical ? plazaY + dir * dist : plazaY;
          gRoads.fillStyle(0x94a3b8, 0.88).fillEllipse(px, py, 20, 14);
        }
      }
    };

    drawRoadTrack(false, -1);
    drawRoadTrack(false, 1);
    drawRoadTrack(true, -1);
    drawRoadTrack(true, 1);

    // Pre-rendered 2.5D Sanctuary Plaza around Core.
    if (this.textures.exists('sanctuary_plaza')) {
      this.add.image(CORE_X, plazaY, 'sanctuary_plaza').setDepth(1.5);
    }

    // Deterministic 2.5D world props (oak trees, crystal clusters, mossy shrine arches, waystones) with min spacing & organic offset.
    const gPropShadows = this.add.graphics().setDepth(2.2);
    const hasProps = this.textures.exists('world_props');
    const placedProps: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 110 && placedProps.length < 64; i++) {
      const x = map.int(1, MAP_TILES - 2) * TILE + TILE / 2 + map.int(-14, 14);
      const y = map.int(1, MAP_TILES - 2) * TILE + TILE / 2 + map.int(-14, 14);
      const kind = map.int(0, 3);
      if (Math.hypot(x - CORE_X, y - CORE_Y) < 276) continue;
      if ((Math.abs(x - CORE_X) < 62 && Math.abs(y - plazaY) < 560) || (Math.abs(y - plazaY) < 48 && Math.abs(x - CORE_X) < 800)) {
        continue;
      }
      if (placedProps.some((p) => Math.hypot(p.x - x, p.y - y) < 112)) continue;
      placedProps.push({ x, y });
      if (hasProps) {
        const sc = 0.64 + ((i % 4) * 0.045);
        // Subtle soft ground AO only for rock/obelisk props (tree & arch already carry painted cast shadow)
        if (kind === 1 || kind === 3) {
          gPropShadows.fillStyle(0x07170e, 0.24).fillEllipse(x + 5, y + 4, 48 * (sc / 0.7), 18 * (sc / 0.7));
        }
        this.add
          .sprite(x, y, 'world_props', kind)
          .setOrigin(0.5, 0.84)
          .setScale(sc)
          .setDepth(this.depthAtY(y));
      } else {
        gPropShadows.fillStyle(0x2d6a4f, 0.9).fillCircle(x, y, 8);
      }
    }

    // 2.5D Illustrated Base Core crystal dais nested into Sanctuary Plaza center (GDD §5).
    this.coreSprite = this.add
      .sprite(CORE_X, CORE_Y - 12, 'base_core', 0)
      .setScale(0.95)
      .setDepth(this.depthAtY(CORE_Y));
    this.add
      .text(CORE_X, CORE_Y + 58, 'แกนฐาน', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#f3e8ff',
        backgroundColor: '#0f172acc',
        stroke: '#090d16',
        strokeThickness: 3,
        padding: { x: 7, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(this.depthAtY(CORE_Y) + 0.1);
  }
}
