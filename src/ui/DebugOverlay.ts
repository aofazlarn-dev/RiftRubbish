/** FPS, object count and run info. Toggle with the backquote key (`). Visible in dev builds by default. */

import Phaser from 'phaser';
import type { GameState } from '../core/state';

export class DebugOverlay {
  private text: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    this.text = scene.add
      .text(scene.scale.width - 12, 12, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9ef01a',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 4 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setVisible(import.meta.env.DEV);
    scene.input.keyboard?.on('keydown-BACKTICK', () => this.text.setVisible(!this.text.visible));
  }

  update(state: GameState, objects: number): void {
    if (!this.text.visible) return;
    this.text.setX(this.scene.scale.width - 12);
    const fps = this.scene.game.loop.actualFps.toFixed(0);
    this.text.setText(
      [
        `FPS ${fps}`,
        `objects ${objects}`,
        `seed ${state.seed}${state.fromSeedLink ? ' (link: no shards)' : ''}`,
        `pos ${state.player.x.toFixed(0)},${state.player.y.toFixed(0)}`,
      ].join('\n'),
    );
  }
}
