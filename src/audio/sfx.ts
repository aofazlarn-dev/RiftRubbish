/**
 * Lightweight Web Audio API retro SFX synthesizer (no external audio files or dependencies).
 * Safely no-ops in headless/Node environments or before user gesture unlock.
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastCastAt = 0;

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'triangle', gainPeak = 0.08, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playCast(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastCastAt < 180) return;
    this.lastCastAt = now;
    this.tone(440, 0.07, 'triangle', 0.035);
  }

  playLevelUp(): void {
    this.tone(523.25, 0.1, 'sine', 0.08, 0);
    this.tone(659.25, 0.1, 'sine', 0.08, 0.07);
    this.tone(783.99, 0.16, 'sine', 0.09, 0.14);
  }

  playFuse(): void {
    this.tone(440, 0.12, 'triangle', 0.09, 0);
    this.tone(554.37, 0.12, 'triangle', 0.09, 0.06);
    this.tone(659.25, 0.14, 'triangle', 0.09, 0.12);
    this.tone(880, 0.24, 'sine', 0.1, 0.18);
  }

  playHurt(): void {
    this.tone(140, 0.14, 'sawtooth', 0.07, 0);
  }

  playPhase(phase: 'day' | 'evening' | 'night'): void {
    if (phase === 'night') {
      this.tone(220, 0.25, 'sawtooth', 0.06, 0);
      this.tone(164.81, 0.32, 'sawtooth', 0.06, 0.12);
    } else if (phase === 'evening') {
      this.tone(392, 0.15, 'triangle', 0.06, 0);
      this.tone(329.63, 0.2, 'triangle', 0.06, 0.1);
    } else {
      this.tone(440, 0.14, 'sine', 0.06, 0);
      this.tone(587.33, 0.2, 'sine', 0.06, 0.1);
    }
  }
}
