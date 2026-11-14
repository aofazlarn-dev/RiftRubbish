/**
 * Vertical-slice arena. Draws GameState and forwards input; every rule lives in src/systems
 * (stepRun). Placeholder shapes only — art comes from docs/art_requests.md later.
 */

import Phaser from 'phaser';
import { EventBus } from '../core/events';
import { RunRng } from '../core/rng';
import { autoSaveOnHide, clearRun, loadRun, saveRun } from '../core/save';
import { createRun, type GameState } from '../core/state';
import { CORE_X, CORE_Y, MAP_TILES, TILE, WORLD } from '../core/world';
import { loadRunData } from '../data';
import skillsJson from '../data/skills.json';
import { VirtualJoystick } from '../input/joystick';
import { isPlayerDown } from '../systems/base';
import { phaseRemaining, recallEarly } from '../systems/clock';
import type { CombatFx } from '../systems/combat';
import type { Vec2 } from '../systems/movement';
import { pickDraft, upgradeXp, xpToNext } from '../systems/progression';
import { startRun, stepRun, type RunData } from '../systems/run';
import { damageAtLevel, levelForXp, ownedLevel, type FusionRecipe, type Rarity, type SkillDef } from '../systems/skills';
import { DebugOverlay } from '../ui/DebugOverlay';
import { buildShareCardSummary, findAvailableFusions, pickFusionCard } from './HudOverlayScene';
import { MobileFpsMonitor, type FpsMonitorSnapshot } from './MobileFpsMonitor';

const FUSION_RECIPES: readonly FusionRecipe[] = skillsJson.fusions as FusionRecipe[];

const PHASE_TINT = { day: 0x000000, evening: 0x3a1a00, night: 0x05001a } as const;
const PHASE_ALPHA = { day: 0, evening: 0.25, night: 0.5 } as const;
const PHASE_LABEL = { day: 'กลางวัน', evening: 'เย็น', night: 'กลางคืน' } as const;

/** Placeholder look per monster: colour and radius. */
const MONSTER_STYLE: Record<string, { color: number; radius: number }> = {
  slime: { color: 0x7bd389, radius: 9 },
  bat: { color: 0x9d8df1, radius: 7 },
  goblin: { color: 0xe07a5f, radius: 10 },
  skeleton: { color: 0xe9ecef, radius: 9 },
  golem: { color: 0x8d6e63, radius: 16 },
  spirit: { color: 0x90e0ef, radius: 10 },
  rift_wolf: { color: 0xff006e, radius: 20 },
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

  private playerSprite!: Phaser.GameObjects.Arc;
  private bossSprite!: Phaser.GameObjects.Rectangle;
  private monsterSprites = new Map<number, Phaser.GameObjects.Arc>();
  private spritePool: Phaser.GameObjects.Arc[] = [];
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private barGraphics!: Phaser.GameObjects.Graphics;
  private liveFx: LiveFx[] = [];
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private joystick!: VirtualJoystick;
  private hud!: Phaser.GameObjects.Text;
  private phaseShade!: Phaser.GameObjects.Rectangle;
  private debug!: DebugOverlay;
  private fpsMonitor = new MobileFpsMonitor();
  private stopAutoSave?: () => void;
  private overlay?: Phaser.GameObjects.Container;
  /** What the overlay currently shows, so it is rebuilt only when that changes. */
  private overlayKey = '';

  constructor() {
    super('game');
  }

  create(): void {
    this.data_ = loadRunData();
    this.monsterSprites.clear();
    this.spritePool = [];
    this.liveFx = [];
    this.overlay = undefined;
    this.overlayKey = '';
    this.bus.clear();

    const resumed = this.resume();
    this.state = resumed ?? this.newState();
    this.rng = RunRng.restore(this.state.seed, this.state.rng);
    if (!resumed) startRun(this.state, this.rng, this.data_, this.bus);

    // Dev builds only: lets a debugger reach the live state (e.g. to test the end screens).
    if (import.meta.env.DEV) (window as unknown as { __scene?: GameScene }).__scene = this;

    this.drawWorld();
    this.barGraphics = this.add.graphics().setDepth(20);
    this.fxGraphics = this.add.graphics().setDepth(15);
    this.bossSprite = this.add.rectangle(0, 0, 56, 56, 0xc1121f).setStrokeStyle(3, 0xffd6a5).setDepth(9).setVisible(false);
    this.playerSprite = this.add.circle(this.state.player.x, this.state.player.y, 12, 0xffd166).setDepth(10);
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
    for (const [key, index] of [['ONE', 0], ['TWO', 1], ['THREE', 2], ['FOUR', 3]] as const) {
      kb.on(`keydown-${key}`, () => this.choose(index));
    }
    this.joystick = new VirtualJoystick(this);

    this.hud = this.add
      .text(12, 12, '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', lineSpacing: 3 })
      .setScrollFactor(0)
      .setDepth(900);
    this.debug = new DebugOverlay(this);

    this.bus.on('phase:change', ({ day, phase }) => {
      this.cameras.main.flash(250, 255, 255, 255, false);
      console.info(`[phase] day ${day} → ${phase}`);
      saveRun(this.syncAndGetState()); // snapshot at each phase boundary as well
    });
    this.bus.on('player:down', () => this.cameras.main.shake(300, 0.01));
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
    const fx = stepRun(this.state, this.rng, this.readInput(), dt, this.data_, this.bus);
    for (const f of fx) this.liveFx.push({ ...f, ttl: FX_SECONDS });
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
    this.playerSprite.setPosition(s.player.x, s.player.y);
    this.playerSprite.setAlpha(isPlayerDown(s) ? 0.25 : s.invulnLeft > 0 ? 0.6 : 1);

    // Monster sprites are pooled: reuse circles instead of creating and destroying them.
    const alive = new Set<number>();
    for (const m of s.monsters) {
      alive.add(m.uid);
      let sprite = this.monsterSprites.get(m.uid);
      if (!sprite) {
        const style = MONSTER_STYLE[m.defId] ?? { color: 0xffffff, radius: 9 };
        sprite = this.spritePool.pop() ?? this.add.circle(0, 0, 9, 0xffffff).setDepth(8);
        sprite.setRadius(style.radius * (m.affix ? 1.2 : 1));
        sprite.setFillStyle(style.color);
        sprite.setStrokeStyle(m.affix ? 3 : 0, 0xc77dff);
        sprite.setVisible(true);
        this.monsterSprites.set(m.uid, sprite);
      }
      sprite.setPosition(m.x, m.y);
      sprite.setAlpha(m.slowLeft > 0 ? 0.6 : 1);
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
      this.bossSprite.setFillStyle(boss.rules.enraged ? 0xff0000 : 0xc1121f);
    }
  }

  private drawFx(dt: number): void {
    const g = this.fxGraphics.clear();
    this.liveFx = this.liveFx.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.liveFx) {
      const alpha = f.ttl / FX_SECONDS;
      const color = f.missed ? 0x777777 : (FX_COLOR[f.skillId] ?? 0xffffff);
      if (f.shape === 'cone' && f.radius) {
        const facing = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
        g.fillStyle(color, 0.35 * alpha);
        g.slice(f.x1, f.y1, f.radius, facing - 0.87, facing + 0.87, false).fillPath();
        continue;
      }
      g.lineStyle(f.shape === 'line' ? 5 : 3, color, alpha);
      g.lineBetween(f.x1, f.y1, f.x2, f.y2);
      if (f.radius) g.fillStyle(color, 0.3 * alpha).fillCircle(f.x2, f.y2, f.radius);
    }
  }

  private drawBars(): void {
    const s = this.state;
    const g = this.barGraphics.clear();
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
    const left = phaseRemaining(s);
    const time = Number.isFinite(left) ? `${Math.ceil(left)} วิ` : 'จันทร์เลือด';
    const skills = s.skills
      .map((o) => {
        const def = this.data_.skills.find((d) => d.id === o.id);
        const lv = def ? ownedLevel(def, o.xp) : levelForXp(o.xp);
        return `${this.skillName(o.id)} Lv${lv}`;
      })
      .join(' · ');
    const fpsText = fpsSnap
      ? ` · FPS ${Math.round(fpsSnap.averageFps)}${fpsSnap.lowEndFallbackActive ? ' · โหมดประหยัด 30fps' : ''}`
      : '';
    const down = isPlayerDown(s) ? `\nล้มลง! ฟื้นที่ฐานใน ${Math.ceil(s.respawnIn)} วิ` : '';
    this.hud.setText(
      `วันที่ ${s.day}/7 · ${PHASE_LABEL[s.phase]} · ${time}\n` +
        `เลือด ${Math.ceil(s.player.hp)}/${s.player.maxHp} · แกนฐาน ${Math.ceil(s.coreHp)}/${s.coreMaxHp}\n` +
        `เลเวล ${s.player.level} (${Math.floor(s.player.xp)}/${xpToNext(s.player.level)}) · ปราบ ${s.kills} · มอน ${s.monsters.length}${fpsText}\n` +
        (skills ? `${skills}\n` : '') +
        (s.phase === 'day' ? '[R] เรียกคืนเร็ว  ' : '') +
        '[N] รอบใหม่' +
        down,
    );
  }

  private skillName(id: string): string {
    return this.data_.skills.find((d) => d.id === id)?.name.th ?? id;
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
          : '';
    const size = `${this.scale.width}x${this.scale.height}`;
    if (`${key}|${size}` === this.overlayKey) return;
    this.overlayKey = `${key}|${size}`;
    this.overlay?.destroy();
    this.overlay = undefined;
    if (s.status !== 'playing') this.overlay = this.buildEndOverlay();
    else if (s.pendingDraft) this.overlay = this.buildDraftOverlay(s.pendingDraft);
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
    const top = Math.max(70, h / 2 - (totalCards * (cardH + gap)) / 2);
    const title = this.state.skills.length === 0 ? 'เลือกสกิลแรกของคุณ' : `เลเวล ${this.state.player.level}! เลือก 1 ใบ`;
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
      box.add([
        frame,
        this.add.text(w / 2 - cardW / 2 + 16, y + 14, head, { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' }),
        this.add.text(w / 2 - cardW / 2 + 16, y + 50, body, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: '#cfd2ff',
          wordWrap: { width: cardW - 32 },
        }),
      ]);
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

  private buildEndOverlay(): Phaser.GameObjects.Container {
    const { box, w, h } = this.overlayBase();
    const s = this.state;
    const won = s.status === 'won';
    const title = won ? 'ชนะ! ราชันจันทร์เลือดล้มแล้ว' : 'แกนฐานพัง — จบรอบ';
    // On a loss the line teases the System or the monsters, not the player (D24).
    const line = won
      ? 'ระบบ: "ไม่อยู่ในแผนเลยนะเนี่ย... ยินดีด้วย"'
      : 'ระบบ: "แกนฐานรุ่นนี้ประกันหมดเมื่อวาน ระบบขออภัย"';
    const stats = `รอดถึงวันที่ ${s.day} · เลเวล ${s.player.level} · ปราบมอน ${s.kills} ตัว`;
    const share = buildShareCardSummary(s, this.data_.skills);
    const topSkillsText = share.topSkillsTh.length > 0 ? `สกิลเด่น: ${share.topSkillsTh.join(' · ')}` : `Seed: ${share.seed}`;
    box.add([
      this.add.text(w / 2, h / 2 - 138, title, { fontFamily: 'sans-serif', fontSize: '28px', color: won ? '#ffd166' : '#ff6b6b', align: 'center', wordWrap: { width: w - 32 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 - 74, line, { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', align: 'center', wordWrap: { width: w - 32 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 - 30, stats, { fontFamily: 'sans-serif', fontSize: '16px', color: '#cfd2ff', align: 'center', wordWrap: { width: w - 32 } }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 + 6, share.nightTrackEmojis, { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffd166', align: 'center' }).setOrigin(0.5),
      this.add.text(w / 2, h / 2 + 38, topSkillsText, { fontFamily: 'sans-serif', fontSize: '14px', color: '#a8dadc', align: 'center', wordWrap: { width: w - 32 } }).setOrigin(0.5),
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
    if (this.state.status !== 'playing' || !this.state.pendingDraft) return;
    if (index < this.state.pendingDraft.length) {
      pickDraft(this.state, index, this.data_.skills, this.bus);
    } else if (index === this.state.pendingDraft.length) {
      const fusion = findAvailableFusions(this.state, this.data_.skills, FUSION_RECIPES)[0];
      if (!fusion) return;
      const out = pickFusionCard(this.state, fusion.recipe.id, this.data_.skills, FUSION_RECIPES);
      if (out) this.bus.emit('draft:pick', { card: `fuse:${fusion.recipe.id}` });
    }
  }

  // ---- run lifecycle ---------------------------------------------------------------------

  /** Copies live RNG stream states into the plain state before saving. */
  private syncAndGetState(): GameState {
    this.state.rng = this.rng.snapshot();
    return this.state;
  }

  /** A saved run that is still in progress, unless a ?seed= link asks for a different one. */
  private resume(): GameState | null {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    const saved = loadRun();
    if (saved && saved.status === 'playing' && (!linkSeed || saved.seed === linkSeed)) return saved;
    return null;
  }

  private newState(): GameState {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    const seed = linkSeed ?? `run-${Date.now().toString(36)}`;
    const run = createRun({ seed, fromSeedLink: linkSeed !== null });
    run.player.x = CORE_X + TILE * 2;
    run.player.y = CORE_Y;
    return run;
  }

  private newRun(): void {
    clearRun();
    this.scene.restart();
  }

  private drawWorld(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1d2b1f).fillRect(0, 0, WORLD, WORLD);
    g.lineStyle(1, 0x2b3d2d, 0.6);
    for (let i = 0; i <= MAP_TILES; i++) {
      g.lineBetween(i * TILE, 0, i * TILE, WORLD);
      g.lineBetween(0, i * TILE, WORLD, i * TILE);
    }
    // Scatter a few placeholder resource nodes from the map stream (deterministic per seed).
    const map = RunRng.fromSeed(this.state.seed).get('map');
    for (let i = 0; i < 80; i++) {
      const x = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      const y = map.int(1, MAP_TILES - 2) * TILE + TILE / 2;
      g.fillStyle(map.pick([0x4f772d, 0x7f7f7f, 0x3a86ff]), 0.9).fillCircle(x, y, 8);
    }
    // Base core in the centre (GDD §5).
    this.add.rectangle(CORE_X, CORE_Y, 40, 40, 0x9d4edd).setStrokeStyle(3, 0xe0aaff);
    this.add.text(CORE_X, CORE_Y + 34, 'แกนฐาน', { fontSize: '14px', color: '#e0aaff' }).setOrigin(0.5);
  }
}
