import type Phaser from 'phaser';

/**
 * Shared "RO-Rift Classic" palette combining Ragnarok-inspired steel-blue windows,
 * brass corner accents, and dark slate sunken wells with Rift & Rubbish's crimson tones.
 */
export const RO_PALETTE = {
  windowOuterBorder: 0x0b111e,
  windowBevelLight: 0x9bb5dc,
  windowBevelDark: 0x2c3e5e,
  windowGoldAccent: 0xe5c158,
  windowBody: 0x182238,
  windowWell: 0x0f172a,
  rowBg: 0x1d2b45,
  rowHoverBg: 0x283b5e,
  rowSelectedBg: 0x27476e,
  headerTop: 0x3b5b8c,
  headerBottom: 0x253b61,
  headerHighlight: 0x93c5fd,
  headerCrimsonTop: 0x7f1d3d,
  headerCrimsonBottom: 0x4c1127,
  hpFill: 0x22c55e,
  hpLowFill: 0xef4444,
  spFill: 0x0284c7,
  expFill: 0xfacc15,
} as const;

export type RoButtonTone = 'blue' | 'crimson' | 'gold' | 'teal' | 'slate';

export interface RoWindowOptions {
  headerHeight?: number;
  crimsonHeader?: boolean;
  bodyAlpha?: number;
}

export interface RoButtonOptions {
  tone?: RoButtonTone;
  enabled?: boolean;
  fontSize?: string;
  scrollFactor?: number;
  onClick?: () => void;
}

interface ToneSpec {
  top: number;
  bottom: number;
  hoverTop: number;
  hoverBottom: number;
  border: number;
  textColor: string;
}

const BUTTON_TONES: Record<RoButtonTone, ToneSpec> = {
  blue: {
    top: 0x3b5b8c,
    bottom: 0x243a60,
    hoverTop: 0x4a70aa,
    hoverBottom: 0x2f4b7a,
    border: RO_PALETTE.windowBevelLight,
    textColor: '#f8fafc',
  },
  crimson: {
    top: 0x9f1239,
    bottom: 0x6b0f2a,
    hoverTop: 0xbe123c,
    hoverBottom: 0x881337,
    border: RO_PALETTE.windowGoldAccent,
    textColor: '#fff1f2',
  },
  gold: {
    top: 0xd97706,
    bottom: 0x92400e,
    hoverTop: 0xf59e0b,
    hoverBottom: 0xb45309,
    border: RO_PALETTE.windowGoldAccent,
    textColor: '#fefce8',
  },
  teal: {
    top: 0x0d9488,
    bottom: 0x115e59,
    hoverTop: 0x14b8a6,
    hoverBottom: 0x0f766e,
    border: RO_PALETTE.windowBevelLight,
    textColor: '#f0fdfa',
  },
  slate: {
    top: 0x28354f,
    bottom: 0x192234,
    hoverTop: 0x334466,
    hoverBottom: 0x222e46,
    border: RO_PALETTE.windowBevelDark,
    textColor: '#94a3b8',
  },
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Formats classic RO integer EXP progress percentage ("0%".."100%").
 */
export function formatExpPercent(xp: number, nextXp: number): string {
  const denom = Math.max(1, Number.isFinite(nextXp) ? nextXp : 1);
  const ratio = clamp01(xp / denom);
  return `${Math.floor(ratio * 100)}%`;
}

/**
 * Formats classic RO skill hotkey bar labels ("F1".."F9", extending cleanly past 9).
 */
export function hotkeyLabelForSlot(index: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  return `F${safe + 1}`;
}

/**
 * Draws a 3-layer beveled RO-Rift window panel with steel-blue (or crimson) header bar,
 * top specular line, left status gem orb, brass corner ticks, and faux window controls (`— □`).
 */
export function drawRoWindow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: RoWindowOptions = {},
): void {
  const headerH = Math.max(18, Math.min(h - 4, opts.headerHeight ?? 26));
  const bodyAlpha = opts.bodyAlpha ?? 0.94;
  const crimson = opts.crimsonHeader ?? false;

  // Outer shadow border + slate-blue body
  g.fillStyle(RO_PALETTE.windowOuterBorder, 0.96).fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 6);
  g.fillStyle(RO_PALETTE.windowBody, bodyAlpha).fillRoundedRect(x, y, w, h, 5);

  // Two-tone header bar
  const topCol = crimson ? RO_PALETTE.headerCrimsonTop : RO_PALETTE.headerTop;
  const botCol = crimson ? RO_PALETTE.headerCrimsonBottom : RO_PALETTE.headerBottom;
  const specCol = crimson ? 0xfda4af : RO_PALETTE.headerHighlight;
  const halfH = Math.ceil(headerH / 2);

  g.fillStyle(topCol, 1).fillRoundedRect(x + 2, y + 2, w - 4, halfH + 2, { tl: 4, tr: 4, bl: 0, br: 0 });
  g.fillStyle(botCol, 1).fillRect(x + 2, y + 2 + halfH, w - 4, headerH - halfH - 2);
  g.lineStyle(1, specCol, 0.6).lineBetween(x + 4, y + 3, x + w - 4, y + 3);
  g.lineStyle(1.5, RO_PALETTE.windowOuterBorder, 0.9).lineBetween(x + 1, y + headerH, x + w - 1, y + headerH);

  // Left glowing status gem orb
  const orbX = x + 13;
  const orbY = y + headerH / 2 + 1;
  g.fillStyle(RO_PALETTE.windowOuterBorder, 1).fillCircle(orbX, orbY, 5);
  g.fillStyle(crimson ? 0xfb7185 : RO_PALETTE.spFill, 1).fillCircle(orbX, orbY, 3.5);
  g.fillStyle(0xffffff, 0.75).fillCircle(orbX - 1, orbY - 1, 1.3);

  // Faux RO window buttons (— and □) on right of header
  if (w >= 96) {
    const midY = y + Math.floor(headerH / 2) + 1;
    const minX = x + w - 30;
    const maxX = x + w - 16;
    // Minimize glyph (—)
    g.fillStyle(RO_PALETTE.windowOuterBorder, 0.45).fillRoundedRect(minX - 5, midY - 5, 10, 10, 2);
    g.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.9).lineBetween(minX - 3, midY + 1, minX + 3, midY + 1);
    // Maximize glyph (□)
    g.fillStyle(RO_PALETTE.windowOuterBorder, 0.45).fillRoundedRect(maxX - 5, midY - 5, 10, 10, 2);
    g.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.9).strokeRect(maxX - 3, midY - 3, 6, 6);
  }

  // Silver-steel outer bevel + dark inner bevel
  g.lineStyle(1.5, RO_PALETTE.windowBevelLight, 0.85).strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 5);
  g.lineStyle(1, RO_PALETTE.windowBevelDark, 0.9).strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 4);

  // Brass/gold corner L-ticks for RO-Rift signature trim
  const tick = 7;
  g.lineStyle(2, RO_PALETTE.windowGoldAccent, 0.92);
  // Top-left
  g.lineBetween(x + 1, y + tick, x + 1, y + 1);
  g.lineBetween(x + 1, y + 1, x + tick, y + 1);
  // Top-right
  g.lineBetween(x + w - tick, y + 1, x + w - 1, y + 1);
  g.lineBetween(x + w - 1, y + 1, x + w - 1, y + tick);
  // Bottom-left
  g.lineBetween(x + 1, y + h - tick, x + 1, y + h - 1);
  g.lineBetween(x + 1, y + h - 1, x + tick, y + h - 1);
  // Bottom-right
  g.lineBetween(x + w - tick, y + h - 1, x + w - 1, y + h - 1);
  g.lineBetween(x + w - 1, y + h - tick, x + w - 1, y + h - 1);
}

/**
 * Draws a sunken RO segmented HP / SP / EXP gauge bar with top specular gloss and 25/50/75% ticks.
 */
export function drawRoGaugeBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  fillColor: number,
): void {
  const r = clamp01(ratio);
  g.fillStyle(RO_PALETTE.windowOuterBorder, 1).fillRoundedRect(x, y, w, h, 3);
  g.lineStyle(1, 0x475569, 0.9).strokeRoundedRect(x, y, w, h, 3);

  const innerW = Math.max(0, w - 2);
  const fillW = r > 0 ? Math.max(3, Math.round(innerW * r)) : 0;
  if (fillW > 0) {
    g.fillStyle(fillColor, 1).fillRoundedRect(x + 1, y + 1, fillW, Math.max(2, h - 2), 2);
    const glossH = Math.max(2, Math.floor(h * 0.35));
    g.fillStyle(0xffffff, 0.3).fillRect(x + 2, y + 1, Math.max(1, fillW - 2), glossH);
  }

  // Quarter segment dividers
  g.lineStyle(1, RO_PALETTE.windowOuterBorder, 0.45);
  for (const frac of [0.25, 0.5, 0.75]) {
    const tx = Math.round(x + w * frac);
    g.lineBetween(tx, y + 1, tx, y + h - 1);
  }
}

/**
 * Draws a sunken beveled icon slot well.
 */
export function drawRoIconSlot(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  borderColor: number = RO_PALETTE.windowBevelLight,
  fillColor: number = RO_PALETTE.windowWell,
): void {
  g.fillStyle(fillColor, 0.96).fillRoundedRect(x, y, size, size, 4);
  // Inner top-left shadow for sunken well depth
  g.lineStyle(1.5, RO_PALETTE.windowOuterBorder, 0.95);
  g.lineBetween(x + 2, y + 2, x + size - 2, y + 2);
  g.lineBetween(x + 2, y + 2, x + 2, y + size - 2);
  // Crisp outer rim
  g.lineStyle(2, borderColor, 0.95).strokeRoundedRect(x, y, size, size, 4);
}

function drawButtonSurface(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  spec: ToneSpec,
  hovered: boolean,
  enabled: boolean,
): void {
  g.clear();
  const top = hovered && enabled ? spec.hoverTop : spec.top;
  const bot = hovered && enabled ? spec.hoverBottom : spec.bottom;
  const alpha = enabled ? 0.98 : 0.55;
  const half = Math.ceil(h / 2);

  g.fillStyle(RO_PALETTE.windowOuterBorder, 0.95).fillRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 7);
  g.fillStyle(top, alpha).fillRoundedRect(-w / 2, -h / 2, w, half, { tl: 6, tr: 6, bl: 0, br: 0 });
  g.fillStyle(bot, alpha).fillRoundedRect(-w / 2, 0, w, h - half, { tl: 0, tr: 0, bl: 6, br: 6 });

  // Top gloss strip
  g.fillStyle(0xffffff, enabled ? (hovered ? 0.22 : 0.14) : 0.05).fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, Math.max(3, Math.floor(h * 0.22)));

  // Silver/Gold outer rim + inner dark shadow
  g.lineStyle(2, enabled ? spec.border : RO_PALETTE.windowBevelDark, enabled ? 0.95 : 0.75).strokeRoundedRect(
    -w / 2,
    -h / 2,
    w,
    h,
    6,
  );
  if (enabled) {
    g.lineStyle(1, RO_PALETTE.windowOuterBorder, 0.65).strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 4);
  }
}

/**
 * Builds a centered 3D beveled RO-Rift button container.
 */
export function createRoButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: RoButtonOptions = {},
): Phaser.GameObjects.Container {
  const tone = opts.tone ?? 'blue';
  const enabled = opts.enabled ?? true;
  const spec = enabled ? BUTTON_TONES[tone] : BUTTON_TONES.slate;
  const container = scene.add.container(x, y);

  const g = scene.add.graphics();
  drawButtonSurface(g, w, h, spec, false, enabled);
  container.add(g);

  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: opts.fontSize ?? (scene.scale.width < 400 ? '15px' : '17px'),
      fontStyle: 'bold',
      color: enabled ? spec.textColor : '#94a3b8',
      stroke: '#0b111e',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: w - 18 },
    })
    .setOrigin(0.5);
  container.add(txt);

  if (enabled) {
    const hit = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      drawButtonSurface(g, w, h, spec, true, true);
      container.setScale(1.015);
    });
    hit.on('pointerout', () => {
      drawButtonSurface(g, w, h, spec, false, true);
      container.setScale(1);
    });
    hit.on('pointerdown', () => {
      container.setScale(0.985);
    });
    hit.on('pointerup', () => {
      container.setScale(1.015);
      opts.onClick?.();
    });
    container.add(hit);
  }

  if (opts.scrollFactor !== undefined) {
    container.setScrollFactor(opts.scrollFactor);
    container.each((child: Phaser.GameObjects.GameObject) => {
      (child as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(opts.scrollFactor!);
    });
  }

  return container;
}
