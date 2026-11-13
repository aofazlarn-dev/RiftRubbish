/**
 * Vertical-slice arena (backlog week 1–3). Draws GameState; game rules live in src/systems.
 * Placeholder shapes only — art comes later.
 */

import Phaser from 'phaser';
import { EventBus } from '../core/events';
import { RunRng } from '../core/rng';
import { autoSaveOnHide, clearRun, loadRun, saveRun } from '../core/save';
import { createRun, type GameState } from '../core/state';
import { VirtualJoystick } from '../input/joystick';
import { advanceClock, phaseRemaining, recallEarly } from '../systems/clock';
import { movePlayer, type Vec2 } from '../systems/movement';
import { DebugOverlay } from '../ui/DebugOverlay';

export const TILE = 32;
export const MAP_TILES = 64; // GDD §4: 64×64
const WORLD = TILE * MAP_TILES;

const PHASE_TINT = { day: 0x000000, evening: 0x3a1a00, night: 0x05001a } as const;
const PHASE_ALPHA = { day: 0, evening: 0.25, night: 0.55 } as const;
const PHASE_LABEL = { day: 'กลางวัน', evening: 'เย็น', night: 'กลางคืน' } as const;

export class GameScene extends Phaser.Scene {
  state!: GameState;
  bus = new EventBus();
  rng!: RunRng;

  private playerSprite!: Phaser.GameObjects.Arc;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private joystick!: VirtualJoystick;
  private hud!: Phaser.GameObjects.Text;
  private phaseShade!: Phaser.GameObjects.Rectangle;
  private debug!: DebugOverlay;
  private stopAutoSave?: () => void;

  constructor() {
    super('game');
  }

  create(): void {
    this.state = this.startOrResume();
    this.rng = RunRng.restore(this.state.seed, this.state.rng);

    this.drawWorld();
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
    kb.on('keydown-R', () => recallEarly(this.state, this.bus));
    kb.on('keydown-N', () => this.newRun());
    this.joystick = new VirtualJoystick(this);

    this.hud = this.add
      .text(12, 12, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(900);
    this.debug = new DebugOverlay(this);

    this.bus.on('phase:change', ({ day, phase }) => {
      this.cameras.main.flash(250, 255, 255, 255, false);
      console.info(`[phase] day ${day} → ${phase}`);
      saveRun(this.state); // snapshot at each phase boundary as well
    });

    this.stopAutoSave = autoSaveOnHide(() => this.syncAndGetState(), () => this.scene.pause());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopAutoSave?.());
    this.game.events.on(Phaser.Core.Events.VISIBLE, () => this.scene.resume());
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1); // clamp long frames (tab switch, GC pause)
    movePlayer(this.state.player, this.readInput(), dt, { width: WORLD, height: WORLD });
    advanceClock(this.state, dt, this.bus);

    this.playerSprite.setPosition(this.state.player.x, this.state.player.y);
    this.phaseShade.setFillStyle(PHASE_TINT[this.state.phase], PHASE_ALPHA[this.state.phase]);
    this.phaseShade.setSize(this.scale.width, this.scale.height);

    const left = phaseRemaining(this.state);
    const time = Number.isFinite(left) ? `${Math.ceil(left)} วิ` : 'จันทร์เลือด';
    this.hud.setText(
      `วันที่ ${this.state.day} · ${PHASE_LABEL[this.state.phase]} · ${time}\n` +
        `HP ${this.state.player.hp}/${this.state.player.maxHp} · แกนฐาน ${this.state.coreHp}/${this.state.coreMaxHp}\n` +
        (this.state.phase === 'day' ? '[R] เรียกคืนเร็ว  ' : '') + '[N] รอบใหม่',
    );
    this.debug.update(this.state, this.children.length);
  }

  private readInput(): Vec2 {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (x !== 0 || y !== 0) return { x, y };
    return this.joystick.vector;
  }

  /** Copies live RNG stream states into the plain state before saving. */
  private syncAndGetState(): GameState {
    this.state.rng = this.rng.snapshot();
    return this.state;
  }

  private startOrResume(): GameState {
    const linkSeed = new URLSearchParams(window.location.search).get('seed');
    const saved = loadRun();
    if (saved && (!linkSeed || saved.seed === linkSeed)) return saved;

    const seed = linkSeed ?? `run-${Date.now().toString(36)}`;
    const run = createRun({ seed, fromSeedLink: linkSeed !== null });
    run.player.x = WORLD / 2 + TILE * 2;
    run.player.y = WORLD / 2;
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
    this.add.rectangle(WORLD / 2, WORLD / 2, 40, 40, 0x9d4edd).setStrokeStyle(3, 0xe0aaff);
    this.add.text(WORLD / 2, WORLD / 2 + 34, 'แกนฐาน', { fontSize: '14px', color: '#e0aaff' }).setOrigin(0.5);
  }
}
