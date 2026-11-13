/**
 * Floating virtual joystick for touch (GDD §11, mobile-first). Appears where the
 * finger first touches the left half of the screen. Output vector length is 0..1.
 */

import Phaser from 'phaser';
import type { Vec2 } from '../systems/movement';

const RADIUS = 60;

export class VirtualJoystick {
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private origin = new Phaser.Math.Vector2();
  private value: Vec2 = { x: 0, y: 0 };

  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.circle(0, 0, RADIUS, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35);
    this.knob = scene.add.circle(0, 0, 26, 0xffffff, 0.4);
    for (const obj of [this.base, this.knob]) obj.setScrollFactor(0).setDepth(1000).setVisible(false);

    scene.input.addPointer(2);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
  }

  get vector(): Vec2 {
    return this.value;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== null || p.x > this.scene.scale.width / 2) return;
    this.pointerId = p.id;
    this.origin.set(p.x, p.y);
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    const scale = len > RADIUS ? RADIUS / len : 1;
    this.knob.setPosition(this.origin.x + dx * scale, this.origin.y + dy * scale);
    this.value = { x: (dx * scale) / RADIUS, y: (dy * scale) / RADIUS };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.value = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
