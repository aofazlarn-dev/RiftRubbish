import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { TitleScene } from './scenes/TitleScene';
import { MetaShopScene } from './scenes/MetaShopScene';
import { MissionScene } from './scenes/MissionScene';

declare global {
  interface Window {
    __lowSpecRenderer?: boolean;
  }
}

/**
 * Detects PCs without hardware GPU acceleration (no GPU, basic display driver,
 * or CPU software WebGL such as SwiftShader / llvmpipe / Microsoft Basic Render Driver).
 * On those machines Phaser.CANVAS with low-spec perf scaling avoids 5–15 FPS CPU shader bottlenecks.
 */
function detectSoftwareOrNoGpu(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const strictCtx =
      testCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ??
      testCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!strictCtx) return true;

    const gl = strictCtx as WebGLRenderingContext;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
      if (/swiftshader|llvmpipe|softpipe|microsoft basic render|software adapter/i.test(renderer)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

const params = new URLSearchParams(window.location.search);
const rendererParam = params.get('renderer');
const noHardwareGpu = detectSoftwareOrNoGpu();
const forceCanvas = rendererParam === 'canvas' || (rendererParam !== 'webgl' && noHardwareGpu);
window.__lowSpecRenderer = forceCanvas || noHardwareGpu || params.get('perf') === 'low';

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
  render: {
    antialias: !window.__lowSpecRenderer,
    roundPixels: true,
    powerPreference: window.__lowSpecRenderer ? 'default' : 'high-performance',
  },
  scene: [TitleScene, MetaShopScene, MissionScene, GameScene],
});
