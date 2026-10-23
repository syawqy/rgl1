/**
 * grid.ts — column-major 2D grid, mirroring Brogue's `short **grid[x][y]`.
 *
 * Brogue indexes grids as grid[x][y] (column-major). We keep that exact
 * layout so the ported generator code can be read side-by-side with the
 * original C, but flatten it into a single Int16Array for speed.
 *
 * Index for (x, y) is `x * height + y`.
 */

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly cells: Int16Array;

  constructor(w: number, h: number, fill = 0) {
    this.w = w;
    this.h = h;
    this.cells = new Int16Array(w * h);
    if (fill !== 0) this.cells.fill(fill);
  }

  idx(x: number, y: number): number {
    return x * this.h + y;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  get(x: number, y: number): number {
    return this.cells[this.idx(x, y)];
  }

  set(x: number, y: number, v: number): void {
    this.cells[this.idx(x, y)] = v;
  }

  fill(v: number): void {
    this.cells.fill(v);
  }

  clone(): Grid {
    const g = new Grid(this.w, this.h);
    g.cells.set(this.cells);
    return g;
  }

  /** Replace every value in [min, max] with `value`. (Brogue's findReplaceGrid) */
  findReplace(min: number, max: number, value: number): void {
    const c = this.cells;
    for (let i = 0; i < c.length; i++) {
      if (c[i] >= min && c[i] <= max) c[i] = value;
    }
  }

  /**
   * Flood-fill the contiguous region containing (x, y), marking every cell
   * that currently holds `eligible` with `fillValue`.
   * Returns the number of cells marked. (Brogue's fillContiguousRegion)
   */
  fillContiguousRegion(
    x: number,
    y: number,
    eligible: number,
    fillValue: number,
    out?: Int32Array
  ): number {
    const stack: number[] = [this.idx(x, y)];
    let count = 0;
    while (stack.length) {
      const cur = stack.pop()!;
      // index = x * h + y  =>  x = floor(cur / h), y = cur % h
      const cy = cur % this.h;
      const cx = (cur - cy) / this.h;
      if (!this.inBounds(cx, cy)) continue;
      if (this.get(cx, cy) !== eligible) continue;
      this.set(cx, cy, fillValue);
      count++;
      if (out) out[count - 1] = cur;
      // 4 cardinal neighbours: {0,-1} {0,1} {-1,0} {1,0}
      for (let d = 0; d < 4; d++) {
        const nx = cx + NB_DIRS4[d][0];
        const ny = cy + NB_DIRS4[d][1];
        if (this.inBounds(nx, ny) && this.get(nx, ny) === eligible) {
          stack.push(this.idx(nx, ny));
        }
      }
    }
    return count;
  }

  /**
   * 4-connected reachability flood fill over cells where `isOpen(cell)` is
   * true. Returns a Uint8Array mask. Used for passability checks.
   */
  floodOpen(sx: number, sy: number, isOpen: (v: number) => boolean): Uint8Array {
    const mask = new Uint8Array(this.w * this.h);
    if (!this.inBounds(sx, sy) || !isOpen(this.get(sx, sy))) return mask;
    const stack = [this.idx(sx, sy)];
    mask[stack[0]] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      // index = x * h + y  =>  x = floor(cur / h), y = cur % h
      const cy = cur % this.h;
      const cx = (cur - cy) / this.h;
      for (let d = 0; d < 4; d++) {
        const nx = cx + NB_DIRS4[d][0];
        const ny = cy + NB_DIRS4[d][1];
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (mask[ni]) continue;
        if (!isOpen(this.get(nx, ny))) continue;
        mask[ni] = 1;
        stack.push(ni);
      }
    }
    return mask;
  }
}

/** Brogue's nbDirs[8][2]: up, down, left, right, then the 4 diagonals. */
export const NB_DIRS8: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** The 4 cardinal directions, in Brogue's order. */
export const NB_DIRS4: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export const DIR_UP = 0;
export const DIR_DOWN = 1;
export const DIR_LEFT = 2;
export const DIR_RIGHT = 3;
export const NO_DIRECTION = -1;

export function oppositeDirection(dir: number): number {
  switch (dir) {
    case DIR_UP:
      return DIR_DOWN;
    case DIR_DOWN:
      return DIR_UP;
    case DIR_LEFT:
      return DIR_RIGHT;
    case DIR_RIGHT:
      return DIR_LEFT;
    default:
      return NO_DIRECTION;
  }
}
