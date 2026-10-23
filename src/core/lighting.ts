/**
 * lighting.ts — field of view and light falloff.
 *
 * Ported from BrogueCE `src/brogue/Light.c`:
 *  - the player's "miner's light" radius is 100 (i.e. 10 tiles) by default,
 *    scaled by a light multiplier, halved in water (but never below 3),
 *    and crushed to as little as 5% by darkness.
 *  - each light source has a "fade%" — the fraction of light remaining at
 *    the edge of its radius.
 */

import { Grid, NB_DIRS8 } from "./grid";
import { T, combinedFlags } from "./terrain";

export interface LevelLike {
  w: number;
  h: number;
  dungeon: Int16Array;
  liquid: Int16Array;
  surface: Int16Array;
}

export const LIGHT_FRACTION = 1000; // 16.16-style scale used by Brogue

/**
 * Port of Brogue's `updateMinersLightRadius`.
 *
 * @param baseRadius the base radius in tiles (Brogue's miner light is 10).
 * @param lightMultiplier ring/equipment multiplier; negative means cursed.
 * @param darkness 0..1 how dark the player is.
 * @param inWater true when the player is standing in water.
 */
export function minersLightRadius(
  baseRadius: number,
  lightMultiplier = 1,
  darkness = 0,
  inWater = false
): number {
  let radius: number;

  if (lightMultiplier < 0) {
    radius = baseRadius / (-1 * lightMultiplier + 1);
  } else {
    radius = baseRadius * lightMultiplier;
    radius = Math.max(radius, lightMultiplier * 2 + 2);
  }

  if (darkness > 0) {
    const baseFraction = 1 - darkness;
    const fraction = baseFraction * baseFraction * baseFraction;
    radius *= Math.max(fraction, 0.05);
  }

  if (inWater && radius > 3) {
    radius = radius / 2;
    radius = Math.max(radius, 3);
  }

  return Math.max(radius, 2);
}

/**
 * The light intensity at a given distance from a source.
 *
 * Brogue's lights have a `fade%` — the fraction of light that remains at
 * the outer edge of the radius. Light falls off linearly from the source
 * to that edge value.
 *
 * @param radius the light's radius in tiles
 * @param fadePercent the percentage of light remaining at the edge (0..100)
 * @param distance distance from the source in tiles
 * @returns intensity 0..1
 */
export function lightIntensity(
  radius: number,
  fadePercent: number,
  distance: number
): number {
  if (distance > radius) return 0;
  if (radius <= 0) return 0;
  const edge = fadePercent / 100;
  // Linear falloff from 1.0 at the source to `edge` at the radius.
  const t = distance / radius;
  return 1 - t * (1 - edge);
}

/** A light source on the map. */
export interface LightSource {
  x: number;
  y: number;
  radius: number;
  /** percent of light remaining at the edge */
  fadePercent: number;
  /** 0xRRGGBB */
  color: number;
}

/**
 * Compute the visible/lighted map for a set of light sources.
 *
 * @returns a Float32Array of intensities (0..1) per cell, plus a
 *          Uint8Array of "seen" flags.
 */
export function computeLighting(
  level: LevelLike,
  sources: LightSource[]
): { intensity: Float32Array; seen: Uint8Array } {
  const { w, h } = level;
  const intensity = new Float32Array(w * h);
  const seen = new Uint8Array(w * h);

  const idx = (x: number, y: number) => x * h + y;

  for (const src of sources) {
    const r = Math.ceil(src.radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = src.x + dx;
        const y = src.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const distance = Math.hypot(dx, dy);
        if (distance > src.radius) continue;

        // Occlusion: walk a Bresenham line and stop at the first opaque cell.
        if (!hasLineOfSight(level, src.x, src.y, x, y)) continue;

        const i = lightIntensity(src.radius, src.fadePercent, distance);
        const at = idx(x, y);
        if (i > intensity[at]) intensity[at] = i;
        seen[at] = 1;
      }
    }
  }

  return { intensity, seen };
}

/**
 * Bresenham line-of-sight test through transparent tiles.
 * The destination itself does not need to be transparent.
 */
export function hasLineOfSight(
  level: LevelLike,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const { w, h } = level;
  const idx = (x: number, y: number) => x * h + y;
  const opaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const at = idx(x, y);
    const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
    return (flags & T.OBSTRUCTS_VISION) !== 0;
  };

  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (let guard = 0; guard < w * h + 8; guard++) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) return true;
    if (opaque(x, y)) return false;
  }
  return false;
}

/**
 * Port of Brogue's `getFOVMask` — the set of cells visible from a point
 * with a given radius, blocked by opaque terrain.
 */
export function computeFOV(
  level: LevelLike,
  originX: number,
  originY: number,
  radius: number
): Uint8Array {
  const { w, h } = level;
  const seen = new Uint8Array(w * h);
  const idx = (x: number, y: number) => x * h + y;

  if (originX < 0 || originY < 0 || originX >= w || originY >= h) return seen;
  seen[idx(originX, originY)] = 1;

  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (Math.hypot(dx, dy) > radius) continue;
      if (!hasLineOfSight(level, originX, originY, x, y)) continue;
      seen[idx(x, y)] = 1;
    }
  }
  return seen;
}

/**
 * Port of Brogue's `diagonalBlocked` — a diagonal move is blocked when
 * either of the two orthogonal neighbours blocks diagonal movement.
 */
export function diagonalBlocked(
  level: LevelLike,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  if (x1 === x2 || y1 === y2) return false;
  const { w, h } = level;
  const flagsAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w || y >= h) return T.OBSTRUCTS_DIAGONAL_MOVEMENT;
    const at = x * h + y;
    return combinedFlags(level.dungeon[at], level.liquid[at]);
  };
  if (flagsAt(x1, y2) & T.OBSTRUCTS_DIAGONAL_MOVEMENT) return true;
  if (flagsAt(x2, y1) & T.OBSTRUCTS_DIAGONAL_MOVEMENT) return true;
  return false;
}

/** All eight neighbour offsets, re-exported for convenience. */
export { NB_DIRS8, Grid };
