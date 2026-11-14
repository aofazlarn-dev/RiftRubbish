/**
 * GDD §5 & §12: Mobile-first FPS tracker with automatic 30fps low-end fallback
 * when rendering up to 40 simultaneous monsters on low-spec mobile devices.
 */
export interface FpsMonitorSnapshot {
  currentFps: number;
  averageFps: number;
  targetFps: 60 | 30;
  lowEndFallbackActive: boolean;
  monsterCount: number;
}

export class MobileFpsMonitor {
  private readonly samplesMs: number[] = [];
  private readonly maxSamples: number;
  private lowEndFallback = false;
  private lowFpsStreakSec = 0;

  constructor(maxSamples = 30) {
    this.maxSamples = Math.max(5, maxSamples);
  }

  /**
   * Records a frame delta (in milliseconds) and current on-screen monster count.
   * Activates 30fps low-end fallback (reducing non-essential VFX particles) if average FPS
   * stays below 42 fps for >= 1.5 seconds.
   */
  recordFrame(deltaMs: number, monsterCount: number): FpsMonitorSnapshot {
    const clampedDelta = Math.max(1, Math.min(250, deltaMs));
    this.samplesMs.push(clampedDelta);
    if (this.samplesMs.length > this.maxSamples) {
      this.samplesMs.shift();
    }

    const avgDelta =
      this.samplesMs.reduce((acc, v) => acc + v, 0) / this.samplesMs.length;
    const avgFps = 1000 / avgDelta;
    const currentFps = 1000 / clampedDelta;

    if (!this.lowEndFallback) {
      if (avgFps < 42) {
        this.lowFpsStreakSec += clampedDelta / 1000;
        if (this.lowFpsStreakSec >= 1.5) {
          this.lowEndFallback = true;
        }
      } else {
        this.lowFpsStreakSec = Math.max(0, this.lowFpsStreakSec - clampedDelta / 2000);
      }
    }

    return {
      currentFps: Number(currentFps.toFixed(1)),
      averageFps: Number(avgFps.toFixed(1)),
      targetFps: this.lowEndFallback ? 30 : 60,
      lowEndFallbackActive: this.lowEndFallback,
      monsterCount,
    };
  }

  isLowEndFallbackActive(): boolean {
    return this.lowEndFallback;
  }

  reset(): void {
    this.samplesMs.length = 0;
    this.lowEndFallback = false;
    this.lowFpsStreakSec = 0;
  }
}

/**
 * Counts Thai/English user-facing line length by grapheme cluster (D23: max 70 graphemes,
 * combining Thai vowels/tone marks do not count as separate characters).
 */
export function countGraphemes(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
    let count = 0;
    for (const _ of seg.segment(text)) {
      count += 1;
    }
    return count;
  }
  // Fallback stripping Thai combining marks (U+0E31, U+0E34..U+0E3A, U+0E47..U+0E4E)
  const stripped = text.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '');
  return [...stripped].length;
}
