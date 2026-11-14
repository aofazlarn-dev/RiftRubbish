import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { TitleScene } from './scenes/TitleScene';

// `?renderer=canvas` forces the Canvas renderer for devices or browsers where WebGL fails.
const forceCanvas = new URLSearchParams(window.location.search).get('renderer') === 'canvas';

new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#120d1a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  fps: { target: 60, min: 30 },
  render: { antialias: true, powerPreference: 'high-performance' },
  scene: [TitleScene, GameScene],
});
