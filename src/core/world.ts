/** World geometry shared by systems and scenes (GDD §4: 64×64 tiles of 32 px, base in the centre). */

export const TILE = 32;
export const MAP_TILES = 64;
export const WORLD = TILE * MAP_TILES;
export const CORE_X = WORLD / 2;
export const CORE_Y = WORLD / 2;

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function clampToWorld(v: number): number {
  return Math.max(0, Math.min(WORLD, v));
}
