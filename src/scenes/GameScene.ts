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
import { phaseRemaining, recallEarly } from '../systems/clock';
import type { CombatFx } from '../systems/combat';
import { dailySeed } from '../systems/daily';
import { fenceShieldHp, trapPositions, type EveningChoiceId, type Inventory } from '../systems/evening';
import type { Vec2 } from '../systems/movement';
import { pickDraft, upgradeXp, xpToNext } from '../systems/progression';
import { startRun, stepRun, type RunData } from '../systems/run';
import { attachShardLedger } from '../systems/shards';
import { damageAtLevel, levelForXp, ownedLevel, type FusionRecipe, type Rarity, type SkillDef } from '../systems/skills';
import { attachSystemVoice } from '../systems/systemVoice';
import { DebugOverlay } from '../ui/DebugOverlay';
import { buildEveningOffer, formatInventorySummary, formatSynergySummary, resolveEveningSelection } from './eveningUiModel';
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
const FX_SECONDS = 0.18;

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
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private fxPool: Phaser.GameObjects.Image[] = [];
  private activeFxSprites: Phaser.GameObjects.Image[] = [];
  private barGraphics!: Phaser.GameObjects.Graphics;
  private liveFx: LiveFx[] = [];
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
  private preEveningInv: Inventory | null = null;
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
    this.overlay = undefined;
    this.overlayKey = '';
    this.skillDock = undefined;
    this.skillDockKey = '';
    this.bus.clear();
    this.ensureAnimations();

    const resumed = this.resume();
    this.state = resumed ?? this.newState();
    this.eveningPending = false;
    this.tutorialPending = false;
    this.tutorialShown = this.state.tutorial === 'fused' || this.state.tutorial === 'done';
    this.tutorialExpireShown = this.state.tutorial === 'done';
    this.systemToast = this.add
      .text(this.scale.width / 2, 16, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffd166',
        backgroundColor: '#1a0933ee',
        padding: { x: 14, y: 8 },
        align: 'center',
        wordWrap: { width: Math.min(460, this.scale.width - 24) },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1600)
      .setVisible(false);
    attachSystemVoice(this.bus, this.state);
    attachShardLedger(this.bus, this.state);
    this.bus.on('system:say', ({ th }) => {
      this.showSystemToast(`ระบบ: "${th}"`, 5);
    });
    this.rng = RunRng.restore(this.state.seed, this.state.rng);
    if (!resumed) startRun(this.state, this.rng, this.data_, this.bus);

    // Dev builds only: lets a debugger reach the live state (e.g. to test the end screens).
    if (import.meta.env.DEV) (window as unknown as { __scene?: GameScene }).__scene = this;

    this.drawWorld();
    this.barGraphics = this.add.graphics().setDepth(20);
    this.fxGraphics = this.add.graphics().setDepth(15);
    this.bossSprite = this.add.sprite(0, 0, 'boss_bloodmoon_walk').setDepth(9).setVisible(false);
    this.playerSprite = this.add.sprite(this.state.player.x, this.state.player.y, 'hero_idle').setScale(1.25).setDepth(10);
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
      if (this.state.status === 'playing' && !this.state.pendingDraft) recallEarly(this.state, this.bus);
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
      .text(18, 16, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffd166' })
      .setScrollFactor(0)
      .setDepth(900);
    this.hudHpText = this.add
      .text(22, 37, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(901);
    this.hudCoreText = this.add
      .text(22, 55, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(901);
    this.hudMetaText = this.add
      .text(18, 86, '', { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#d8b4f8' })
      .setScrollFactor(0)
      .setDepth(900);
    this.hudInvText = this.add
      .text(18, 102, '', { fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#a8dadc', wordWrap: { width: 228 } })
      .setScrollFactor(0)
      .setDepth(900);
    this.downBanner = this.add
      .text(this.scale.width / 2, 130, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ff6b6b',
        backgroundColor: '#1a0814dd',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(905)
      .setVisible(false);

    const btnStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#1b122bcc',
      padding: { x: 8, y: 5 },
    };
    const btnY = this.scale.height - 34;
    this.recallBtn = this.add
      .text(10, btnY, '[R] เรียกคืนเร็ว', btnStyle)
      .setScrollFactor(0)
      .setDepth(900)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.state.status === 'playing' && !this.state.pendingDraft) recallEarly(this.state, this.bus);
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
      this.systemToast.setX(size.width / 2);
    };
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', onResize));

    this.bus.on('phase:change', ({ day, phase }) => {
      this.cameras.main.flash(250, 255, 255, 255, false);
      this.sfx.playPhase(phase);
      console.info(`[phase] day ${day} → ${phase}`);
      if (phase === 'evening') {
        if (this.preEveningInv) {
          this.state.inventory = { ...this.preEveningInv };
          this.preEveningInv = null;
        }
        // Reset auto-applied beginEvening defaults while the Evening Overlay lets the player choose.
        this.state.coreShield = undefined;
        this.state.traps = [];
        const offer = buildEveningOffer(
          this.state.inventory ?? {},
          day,
          this.state.coreMaxHp,
          this.state.overtimeUsed ?? this.overtimeUsed,
          null,
          this.state.mode,
        );
        this.eveningMealId = offer.meals.find((m) => m.affordable)?.meal.id ?? null;
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
    if (!this.eveningPending && !this.tutorialPending) {
      const wasPhase = this.state.phase;
      if (wasPhase === 'day') {
        this.preEveningInv = { ...(this.state.inventory ?? {}) };
      }
      const fx = stepRun(this.state, this.rng, this.readInput(), dt, this.data_, this.bus);
      if (fx.some((f) => !f.missed)) this.sfx.playCast();
      for (const f of fx) this.liveFx.push({ ...f, ttl: FX_SECONDS });

      // stepRun emits phase:change before onPhaseStart mutates inventory/tutorial state; sync UI after.
      if (wasPhase === 'day' && this.state.phase === 'evening' && this.eveningPending && this.preEveningInv) {
        this.state.inventory = { ...this.preEveningInv };
        this.preEveningInv = null;
        this.state.coreShield = undefined;
        this.state.traps = [];
        const offer = buildEveningOffer(
          this.state.inventory ?? {},
          this.state.day,
          this.state.coreMaxHp,
          this.state.overtimeUsed ?? this.overtimeUsed,
          null,
          this.state.mode,
        );
        this.eveningMealId = offer.meals.find((m) => m.affordable)?.meal.id ?? null;
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
    const move = this.readInput();
    this.playerSprite.setPosition(s.player.x, s.player.y);
    if (move.x !== 0) this.playerSprite.setFlipX(move.x < 0);

    if (isPlayerDown(s)) {
      this.playerSprite.setAlpha(0.55).clearTint();
      if (this.playerSprite.anims.currentAnim?.key !== 'hero_death') this.playerSprite.play('hero_death', true);
    } else if (s.invulnLeft > 0) {
      this.playerSprite.setAlpha(0.8).setTexture('hero_hit', 0).setTint(0xff8080);
    } else {
      this.playerSprite.setAlpha(1).clearTint();
      const moving = move.x !== 0 || move.y !== 0;
      this.playerSprite.play(moving ? 'hero_walk' : 'hero_idle', true);
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
      sprite.setScale(m.affix ? 1.25 : 1);
      if (m.slowLeft > 0) sprite.setTint(0x80d8ff);
      else if (m.affix) sprite.setTint(0xe0aaff);
      else sprite.clearTint();
      sprite.setPosition(m.x, m.y);
      sprite.setAlpha(m.slowLeft > 0 ? 0.8 : 1);
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
      this.bossSprite.setPosition(boss.x, boss.y);
      const bossAnim = boss.rules.enraged ? 'boss_bloodmoon_enrage_walk' : 'boss_bloodmoon_walk';
      if (this.bossSprite.anims.currentAnim?.key !== bossAnim) this.bossSprite.play(bossAnim, true);
      this.bossSprite.setFlipX(boss.x > s.player.x);
    }
  }

  private fxColorForSkill(skillId: string): number {
    if (FX_COLOR[skillId]) return FX_COLOR[skillId];
    const def = this.data_.skills.find((d) => d.id === skillId);
    const tag = def?.tags[0];
    return (tag && TAG_FX_COLOR[tag]) || 0xffffff;
  }

  private drawFx(dt: number): void {
    const g = this.fxGraphics.clear();
    for (const img of this.activeFxSprites) {
      img.setVisible(false);
      this.fxPool.push(img);
    }
    this.activeFxSprites.length = 0;

    this.liveFx = this.liveFx.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.liveFx) {
      const alpha = f.ttl / FX_SECONDS;
      const color = f.missed ? 0x777777 : this.fxColorForSkill(f.skillId);
      const facing = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
      const vfxKey = f.shape === 'cone' ? 'vfx_cone' : f.shape === 'line' ? 'vfx_line' : f.shape === 'ring' ? 'vfx_ring' : 'vfx_projectile';

      if (this.textures.exists(vfxKey)) {
        const img = this.fxPool.pop() ?? this.add.image(0, 0, vfxKey).setDepth(16);
        img.setTexture(vfxKey).setVisible(true).setTint(color).setAlpha(0.85 * alpha);
        if (f.shape === 'cone') {
          const size = Math.max(48, (f.radius ?? 48) * 1.4);
          img.setPosition(f.x1, f.y1).setOrigin(0.15, 0.5).setRotation(facing).setDisplaySize(size, size);
        } else if (f.shape === 'line') {
          const len = Math.max(32, Math.hypot(f.x2 - f.x1, f.y2 - f.y1));
          img.setPosition(f.x1, f.y1).setOrigin(0, 0.5).setRotation(facing).setDisplaySize(len, 18);
        } else if (f.shape === 'ring') {
          const dia = Math.max(48, (f.radius ?? 48) * 2);
          img.setPosition(f.x2, f.y2).setOrigin(0.5).setRotation(0).setDisplaySize(dia, dia);
        } else {
          const progress = 1 - alpha;
          const px = f.x1 + (f.x2 - f.x1) * progress;
          const py = f.y1 + (f.y2 - f.y1) * progress;
          img.setPosition(px, py).setOrigin(0.5).setRotation(facing).setDisplaySize(26, 26);
        }
        this.activeFxSprites.push(img);
      }

      if (f.shape === 'cone' && f.radius) {
        g.fillStyle(color, 0.22 * alpha);
        g.slice(f.x1, f.y1, f.radius, facing - 0.87, facing + 0.87, false).fillPath();
        continue;
      }
      g.lineStyle(f.shape === 'line' ? 4 : 2, color, 0.65 * alpha);
      g.lineBetween(f.x1, f.y1, f.x2, f.y2);
      if (f.radius) g.fillStyle(color, 0.2 * alpha).fillCircle(f.x2, f.y2, f.radius);
    }
  }

  private drawBars(): void {
    const s = this.state;
    const g = this.barGraphics.clear();
    for (const c of s.chests ?? []) {
      if (c.opened) {
        g.lineStyle(1.5, 0x6c757d, 0.6).strokeRect(c.x - 9, c.y - 7, 18, 14);
      } else {
        g.fillStyle(0xffd166, 0.2).fillCircle(c.x, c.y, 18);
        g.fillStyle(0xd97706, 1).fillRect(c.x - 9, c.y - 7, 18, 14);
        g.lineStyle(2, 0xffea00, 1).strokeRect(c.x - 9, c.y - 7, 18, 14);
      }
    }
    for (const t of s.traps ?? []) {
      if (t.uses <= 0) continue;
      g.lineStyle(2, 0xff9f1c, 0.85).strokeCircle(t.x, t.y, 14);
      g.fillStyle(0xff9f1c, 0.22).fillCircle(t.x, t.y, 14);
    }
    const bar = (x: number, y: number, w: number, ratio: number, color: number) => {
      g.fillStyle(0x000000, 0.6).fillRect(x - w / 2, y, w, 6);
      g.fillStyle(color, 1).fillRect(x - w / 2, y, w * Phaser.Math.Clamp(ratio, 0, 1), 6);
    };
    bar(CORE_X, CORE_Y - 40, 90, s.coreHp / s.coreMaxHp, 0xc77dff);
    bar(s.player.x, s.player.y - 24, 36, s.player.hp / s.player.maxHp, 0x06d6a0);
    if (s.boss && s.boss.rules.hp > 0) bar(s.boss.x, s.boss.y - 44, 120, s.boss.rules.hp / s.boss.rules.maxHp, 0xff4d6d);
  }

  private drawHud(fpsSnap?: FpsMonitorSnapshot): void {
    const s = this.state;
    const panelW = Math.min(248, Math.max(196, this.scale.width - (import.meta.env.DEV ? 154 : 20)));
    const barW = panelW - 16;
    const g = this.hudGraphics.clear();

    // Translucent dark RPG HUD panel
    g.fillStyle(0x0d0614, 0.82).fillRoundedRect(10, 10, panelW, 118, 10);
    g.lineStyle(1.5, 0x9b4dca, 0.9).strokeRoundedRect(10, 10, panelW, 118, 10);

    // Player HP bar
    const hpRatio = Phaser.Math.Clamp(s.player.hp / Math.max(1, s.player.maxHp), 0, 1);
    g.fillStyle(0x2b121e, 1).fillRoundedRect(18, 36, barW, 14, 4);
    g.fillStyle(hpRatio < 0.35 ? 0xff4d6d : 0x06d6a0, 1).fillRoundedRect(18, 36, Math.max(2, barW * hpRatio), 14, 4);

    // Core HP bar
    const coreRatio = Phaser.Math.Clamp(s.coreHp / Math.max(1, s.coreMaxHp), 0, 1);
    g.fillStyle(0x1b122b, 1).fillRoundedRect(18, 54, barW, 14, 4);
    g.fillStyle(0x9d4edd, 1).fillRoundedRect(18, 54, Math.max(2, barW * coreRatio), 14, 4);

    // XP bar
    const nextXp = Math.max(1, xpToNext(s.player.level));
    const xpRatio = Phaser.Math.Clamp(s.player.xp / nextXp, 0, 1);
    g.fillStyle(0x102136, 1).fillRoundedRect(18, 73, barW, 7, 3);
    g.fillStyle(0x4cc9f0, 1).fillRoundedRect(18, 73, Math.max(2, barW * xpRatio), 7, 3);

    const left = phaseRemaining(s);
    const time = Number.isFinite(left) ? `${Math.ceil(left)} วิ` : 'จันทร์เลือด';
    this.hudTitle.setText(`วันที่ ${s.day}/7 · ${PHASE_LABEL[s.phase]} · ${time}`);
    this.hudHpText.setText(`เลือด ${Math.ceil(s.player.hp)}/${s.player.maxHp}`);
    const shieldTxt = (s.coreShield ?? 0) > 0 ? ` (+โล่ ${Math.ceil(s.coreShield!)})` : '';
    this.hudCoreText.setText(`แกนฐาน ${Math.ceil(s.coreHp)}/${s.coreMaxHp}${shieldTxt}`);
    const fpsText = fpsSnap
      ? ` · FPS ${Math.round(fpsSnap.averageFps)}${fpsSnap.lowEndFallbackActive ? ' (30fps)' : ''}`
      : '';
    this.hudMetaText.setText(`Lv${s.player.level} · ปราบ ${s.kills} · มอน ${s.monsters.length}${fpsText}`);
    const invStr = formatInventorySummary(s.inventory ?? {});
    const coreStr = (s.cores ?? 0) > 0 ? ` · Core ×${s.cores}` : '';
    const synStr = formatSynergySummary(
      s.skills.map((o) => o.id),
      this.data_.skills,
    );
    this.hudInvText.setText(`ของ: ${invStr}${coreStr}${synStr ? ` · ${synStr}` : ''}`);

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

    const dock = this.add.container(10, 134).setScrollFactor(0).setDepth(900);
    this.state.skills.forEach((o, i) => {
      const def = this.data_.skills.find((d) => d.id === o.id);
      const lv = def ? ownedLevel(def, o.xp) : levelForXp(o.xp);
      const x = i * 42;
      const borderColor = o.gift ? 0xff9f1c : def ? RARITY_COLOR[def.rarity] : 0x9b4dca;
      const slot = this.add.rectangle(x, 0, 36, 36, 0x120a24, 0.9).setOrigin(0).setStrokeStyle(2, borderColor);
      dock.add(slot);
      if (this.textures.exists(`icon_${o.id}`)) {
        dock.add(this.add.image(x + 18, 18, `icon_${o.id}`).setDisplaySize(28, 28));
      }
      const badge = o.gift ? 'ฟรี' : `${lv}`;
      dock.add(
        this.add
          .text(x + 34, 34, badge, {
            fontFamily: 'monospace',
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#ffd166',
            backgroundColor: '#0d0614cc',
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
    const totalCards = cards.length + (fusion ? 1 : 0);
    const cardW = Math.min(420, w - 32);
    const cardH = 92;
    const gap = 14;
    const top = Math.max(84, h / 2 - (totalCards * (cardH + gap)) / 2);
    const title = this.state.skills.length === 0 ? 'เลือกสกิลแรกของคุณ' : `เลเวล ${this.state.player.level}! เลือก 1 ใบ`;
    if (this.state.skills.length === 0 && this.state.day === 1) {
      box.add(
        this.add
          .text(w / 2, top - 78, '🚚 ตู้ม!! รถบรรทุกพุ่งชนคุณกระเด็นข้ามมิติ... ระบบกำลังติดตั้งสกิลเริ่มต้น', {
            fontFamily: 'sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ff9f1c',
            align: 'center',
            wordWrap: { width: Math.min(440, w - 24) },
          })
          .setOrigin(0.5),
      );
    }
    box.add(this.add.text(w / 2, top - 44, title, { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5));

    cards.forEach((card, i) => {
      const [type, id] = card.split(':');
      const def = this.data_.skills.find((d) => d.id === id);
      if (!def) return;
      const y = top + i * (cardH + gap);
      const frame = this.add
        .rectangle(w / 2, y, cardW, cardH, 0x1b1b2f, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(3, RARITY_COLOR[def.rarity])
        .setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => frame.setFillStyle(0x2b2b4a));
      frame.on('pointerout', () => frame.setFillStyle(0x1b1b2f));
      frame.on('pointerup', () => this.choose(i));
      const owned = this.state.skills.find((o) => o.id === id);
      const head =
        type === 'skill'
          ? `${i + 1}. ${def.name.th}  ·  ${RARITY_LABEL[def.rarity]}`
          : `${i + 1}. ฝึก ${def.name.th} (ตอนนี้ Lv${levelForXp(owned?.xp ?? 0)})`;
      const body =
        type === 'skill'
          ? def.kind === 'active'
            ? `${KIND_LABEL.active} · พลัง ${damageAtLevel(def, 1)} · ทุก ${def.cooldown} วิ · ระยะ ${def.range} ช่อง`
            : `${KIND_LABEL.passive} · ถึกขึ้น: รับดาเมจน้อยลงและเลือดสูงสุดเพิ่ม`
          : `ได้ค่าฝึกสกิล +${upgradeXp(levelForXp(owned?.xp ?? 0))} ทันที`;
      const hasIcon = this.textures.exists(`icon_${id}`);
      const textX = w / 2 - cardW / 2 + (hasIcon ? 82 : 16);
      const wrapW = cardW - (hasIcon ? 98 : 32);
      const cardItems: Phaser.GameObjects.GameObject[] = [frame];
      if (this.textures.exists(`card_frame_${def.rarity}`)) {
        cardItems.push(this.add.image(w / 2 - cardW / 2 + 44, y + cardH / 2, `card_frame_${def.rarity}`).setDisplaySize(54, 72));
      }
      if (hasIcon) {
        cardItems.push(this.add.image(w / 2 - cardW / 2 + 44, y + cardH / 2, `icon_${id}`).setDisplaySize(44, 44));
      }
      cardItems.push(
        this.add.text(textX, y + 14, head, {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: '#ffffff',
          wordWrap: { width: wrapW },
        }),
        this.add.text(textX, y + 48, body, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#cfd2ff',
          wordWrap: { width: wrapW },
        }),
      );
      box.add(cardItems);
    });

    if (fusion) {
      const fusionCardH = 104;
      const y = top + cards.length * (cardH + gap);
      const frame = this.add
        .rectangle(w / 2, y, cardW, fusionCardH, 0x2a1233, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(3, RARITY_COLOR[fusion.resultSkill.rarity])
        .setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => frame.setFillStyle(0x3c1b4a));
      frame.on('pointerout', () => frame.setFillStyle(0x2a1233));
      frame.on('pointerup', () => this.choose(cards.length));

      const srcA = this.state.skills.find((s) => s.id === fusion.recipe.a);
      const srcB = this.state.skills.find((s) => s.id === fusion.recipe.b);
      const inheritedXp = Math.max(srcA?.xp ?? 0, srcB?.xp ?? 0);
      const inheritedLv = ownedLevel(fusion.resultSkill, inheritedXp);

      const head = `${cards.length + 1}. ผสมสกิล: ${fusion.resultSkill.name.th} (Lv${inheritedLv} · ${RARITY_LABEL[fusion.resultSkill.rarity]})`;
      const previewLine =
        fusion.resultSkill.kind === 'active'
          ? `${KIND_LABEL.active} · พลัง ${damageAtLevel(fusion.resultSkill, inheritedLv)} · ทุก ${fusion.resultSkill.cooldown} วิ · ระยะ ${fusion.resultSkill.range} ช่อง`
          : `${KIND_LABEL.passive} · ถึกขึ้น: รับดาเมจน้อยลงและเลือดสูงสุดเพิ่ม`;
      const hintLine = `อีกผล: "${fusion.alternateSkill.name.th}" (ดัน ${fusion.skillToRaiseForAlternate.name.th} ให้สูงกว่าก่อนผสม)`;

      const previewText = this.add.text(w / 2 - cardW / 2 + 16, y + 40, previewLine, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#cfd2ff',
        wordWrap: { width: cardW - 32 },
      });
      const hintText = this.add.text(w / 2 - cardW / 2 + 16, y + 40 + previewText.height + 4, hintLine, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffd166',
        wordWrap: { width: cardW - 32 },
      });

      box.add([
        frame,
        this.add.text(w / 2 - cardW / 2 + 16, y + 12, head, { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff' }),
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
    const cardW = Math.min(440, w - 20);
    const leftX = w / 2 - cardW / 2;
    const panelH = Math.min(h - 24, 590);
    const topY = Math.max(12, (h - panelH) / 2);

    const panel = this.add
      .rectangle(w / 2, topY, cardW, panelH, 0x110b22, 0.96)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0xff9f1c);
    box.add(panel);

    let y = topY + 14;
    box.add(
      this.add
        .text(w / 2, y, `เย็นวันที่ ${s.day} — เตรียมรับมือคืนนี้`, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffd166',
        })
        .setOrigin(0.5, 0),
    );
    y += 28;
    box.add(
      this.add
        .text(w / 2, y, `กระเป๋า: ${offer.inventorySummary}`, {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#a8dadc',
          wordWrap: { width: cardW - 24 },
        })
        .setOrigin(0.5, 0),
    );
    y += 22;

    box.add(
      this.add.text(leftX + 14, y, '1. เลือกมื้อเย็น', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      }),
    );
    y += 20;

    const overtimeSelected = this.eveningChoiceId === 'overtime';
    for (const opt of offer.meals) {
      const selected = !overtimeSelected && this.eveningMealId === opt.meal.id;
      const rowH = 38;
      const bg = this.add
        .rectangle(w / 2, y, cardW - 24, rowH, selected ? 0x264653 : 0x1c1833, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0x2ec4b6 : opt.affordable ? 0x5c5470 : 0x332e47);
      if (opt.affordable && !overtimeSelected) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => {
          this.eveningMealId = opt.meal.id;
          // If fence becomes unaffordable after picking a meal, fallback to trap.
          const nextOffer = buildEveningOffer(inv, s.day, s.coreMaxHp, s.overtimeUsed ?? this.overtimeUsed, opt.meal.id, s.mode);
          if (this.eveningChoiceId === 'fence' && !nextOffer.choices.find((c) => c.id === 'fence')?.enabled) {
            this.eveningChoiceId = 'trap';
          }
        });
      }
      const titleColor = overtimeSelected ? '#6c757d' : opt.affordable ? '#ffffff' : '#7a758c';
      const subColor = overtimeSelected ? '#6c757d' : opt.affordable ? '#cfd2ff' : '#5e5970';
      box.add([
        bg,
        this.add.text(leftX + 22, y + 4, `${opt.meal.name} (${opt.recipeText})`, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: titleColor,
        }),
        this.add.text(leftX + 22, y + 20, opt.buffText, {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: subColor,
        }),
      ]);
      y += rowH + 4;
    }

    // Skip meal option
    const skipSelected = !overtimeSelected && this.eveningMealId === null;
    const skipBg = this.add
      .rectangle(w / 2, y, cardW - 24, 30, skipSelected ? 0x3d1e26 : 0x1c1833, 1)
      .setOrigin(0.5, 0)
      .setStrokeStyle(skipSelected ? 2 : 1, skipSelected ? 0xff6b6b : 0x5c5470);
    if (!overtimeSelected) {
      skipBg.setInteractive({ useHandCursor: true });
      skipBg.on('pointerup', () => {
        this.eveningMealId = null;
      });
    }
    box.add([
      skipBg,
      this.add.text(leftX + 22, y + 7, `ไม่กินมื้อเย็น (${offer.hungryBuffText})`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: overtimeSelected ? '#6c757d' : '#ff9e9e',
      }),
    ]);
    y += 38;

    box.add(
      this.add.text(leftX + 14, y, '2. ทางเลือกเย็นนี้ (1 จาก 3)', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      }),
    );
    y += 20;

    for (const choice of offer.choices) {
      const selected = this.eveningChoiceId === choice.id;
      const rowH = 48;
      const bg = this.add
        .rectangle(w / 2, y, cardW - 24, rowH, selected ? 0x2b2d42 : 0x18132c, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0xffd166 : choice.enabled ? 0x5c5470 : 0x332e47);
      if (choice.enabled) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => {
          this.eveningChoiceId = choice.id;
        });
      }
      const line1 = `${choice.titleTh} · ${choice.costTh}`;
      const line2 = choice.enabled ? choice.effectTh : `ล็อก: ${choice.lockedReasonTh ?? ''}`;
      box.add([
        bg,
        this.add.text(leftX + 22, y + 5, line1, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: choice.enabled ? '#ffd166' : '#6c757d',
          wordWrap: { width: cardW - 48 },
        }),
        this.add.text(leftX + 22, y + 24, line2, {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: choice.enabled ? '#e0e1dd' : '#7a758c',
          wordWrap: { width: cardW - 48 },
        }),
      ]);
      y += rowH + 5;
    }

    const confirmBtn = this.add
      .rectangle(w / 2, topY + panelH - 52, cardW - 40, 40, 0x2ec4b6)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    confirmBtn.on('pointerup', () => this.confirmEvening());
    box.add([
      confirmBtn,
      this.add
        .text(w / 2, topY + panelH - 32, 'ยืนยันและเริ่มค่ำคืน', {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#0b132b',
        })
        .setOrigin(0.5),
    ]);

    return box;
  }

  private confirmEvening(): void {
    const choiceId: EveningChoiceId = this.eveningChoiceId ?? 'trap';
    const res = resolveEveningSelection(this.state.inventory ?? {}, this.eveningMealId, choiceId);
    this.state.inventory = res.inventory;
    this.state.nightBuff = res.buff;
    this.state.coreShield = choiceId === 'fence' ? fenceShieldHp(this.state.coreMaxHp) : undefined;
    this.state.traps = choiceId === 'trap' ? trapPositions(CORE_X, CORE_Y, TILE) : [];
    if (res.usedOvertime) {
      this.overtimeUsed = true;
      this.state.overtimeUsed = true;
      this.state.overtimeChosen = true;
    }
    this.eveningPending = false;
    this.sfx.playLevelUp();
    saveRun(this.syncAndGetState());
  }

  private buildTutorialOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const card = buildTutorialFusionCardView();
    const cardW = Math.min(420, w - 24);
    const panelH = 310;
    const topY = Math.max(24, (h - panelH) / 2);

    const panel = this.add
      .rectangle(w / 2, topY, cardW, panelH, 0x160a2a, 0.97)
      .setOrigin(0.5, 0)
      .setStrokeStyle(3, 0xff9f1c);
    box.add(panel);

    box.add([
      this.add
        .text(w / 2, topY + 20, TUTORIAL_WELCOME_TITLE, {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          fontStyle: 'bold',
          color: '#ffd166',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
      this.add
        .text(w / 2, topY + 52, TUTORIAL_WELCOME_LINE, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#cfd2ff',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
    ]);

    const iconY = topY + 114;
    if (this.textures.exists(`icon_${card.sourceIds[0]}`)) {
      box.add(this.add.image(w / 2 - 96, iconY, `icon_${card.sourceIds[0]}`).setDisplaySize(44, 44));
    }
    box.add(this.add.text(w / 2 - 58, iconY, '+', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5));
    if (this.textures.exists(`icon_${card.sourceIds[1]}`)) {
      box.add(this.add.image(w / 2 - 20, iconY, `icon_${card.sourceIds[1]}`).setDisplaySize(44, 44));
    }
    box.add(this.add.text(w / 2 + 24, iconY, '→', { fontFamily: 'sans-serif', fontSize: '22px', color: '#ffd166' }).setOrigin(0.5));
    if (this.textures.exists(`icon_${card.resultId}`)) {
      box.add(this.add.image(w / 2 + 78, iconY, `icon_${card.resultId}`).setDisplaySize(54, 54));
    }

    box.add([
      this.add
        .text(w / 2, topY + 156, card.recipeTitleTh, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ff9f1c',
          align: 'center',
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0),
      this.add
        .text(w / 2, topY + 184, card.descTh, {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#e0e1dd',
          align: 'center',
          wordWrap: { width: cardW - 32 },
        })
        .setOrigin(0.5, 0),
    ]);

    const btn = this.add
      .rectangle(w / 2, topY + panelH - 58, cardW - 44, 44, 0xff9f1c)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => this.confirmTutorialFusion());
    box.add([
      btn,
      this.add
        .text(w / 2, topY + panelH - 36, card.buttonLabelTh, {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#0b132b',
        })
        .setOrigin(0.5),
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
    this.systemToastLeft = seconds;
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
    const cardW = Math.min(420, w - 24);
    const cardBg = this.add
      .rectangle(w / 2, h / 2 + 12, cardW, 384, 0x120a24, 0.94)
      .setStrokeStyle(2.5, won ? 0xffd166 : 0xff2a55);
    box.add([
      cardBg,
      this.add.text(w / 2, h / 2 - 138, title, { fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: won ? '#ffd166' : '#ff6b6b', align: 'center', wordWrap: { width: cardW - 28 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 - 74, line, { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: cardW - 28 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 - 30, stats, { fontFamily: 'sans-serif', fontSize: '16px', color: '#cfd2ff', align: 'center', wordWrap: { width: cardW - 28 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 + 6, share.nightTrackEmojis, { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffd166', align: 'center' }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 + 38, topSkillsText, { fontFamily: 'sans-serif', fontSize: '14px', color: '#a8dadc', align: 'center', wordWrap: { width: cardW - 28 } }).setOrigin(0.5),
    ]);
    const shareBtn = this.add
      .rectangle(w / 2, h / 2 + 86, 248, 44, 0x2a9d8f)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const shareLabel = this.add
      .text(w / 2, h / 2 + 86, 'คัดลอกลิงก์ท้าดวล (?seed=)', { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5);
    shareBtn.on('pointerup', () => {
      const shareText = `${share.titleTh}\n${share.nightTrackEmojis}\n${share.shareUrl}`;
      void navigator.clipboard?.writeText(shareText)?.catch(() => undefined);
      shareLabel.setText('คัดลอกแล้ว!');
    });
    const button = this.add
      .rectangle(w / 2, h / 2 + 144, 248, 50, 0x3a86ff)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    button.on('pointerup', () => this.newRun());
    box.add([
      shareBtn,
      shareLabel,
      button,
      this.add.text(w / 2, h / 2 + 144, 'เริ่มรอบใหม่ [N]', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5),
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

    // Scatter deterministic resource nodes from the map stream.
    const g = this.add.graphics().setDepth(1);
    for (let i = 0; i < 80; i++) {
      const x = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      const y = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      g.fillStyle(map.pick([0x4f772d, 0x7f7f7f, 0x3a86ff]), 0.9).fillCircle(x, y, 8);
    }
    // Base core in the centre (GDD §5).
    this.coreSprite = this.add.sprite(CORE_X, CORE_Y, 'base_core', 0).setDepth(5);
    this.add.text(CORE_X, CORE_Y + 42, 'แกนฐาน', { fontSize: '14px', color: '#e0aaff' }).setOrigin(0.5).setDepth(6);
  }
}
