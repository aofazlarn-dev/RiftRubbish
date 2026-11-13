/** Player movement from an input vector (keyboard or joystick). Pure, so it is testable. */

import type { PlayerState } from '../core/state';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

/** Clamps the vector to length 1 so diagonal keys are not faster, keeps analog input < 1. */
export function normalizeInput(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= 1) return { x: v.x, y: v.y };
  return { x: v.x / len, y: v.y / len };
}

export function movePlayer(player: PlayerState, input: Vec2, dt: number, bounds: Bounds): void {
  const dir = normalizeInput(input);
  player.x = clamp(player.x + dir.x * player.speed * dt, 0, bounds.width);
  player.y = clamp(player.y + dir.y * player.speed * dt, 0, bounds.height);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
