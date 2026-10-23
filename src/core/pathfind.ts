/**
 * pathfind.ts — Dijkstra distance maps, ported from BrogueCE's Dijkstra.c.
 *
 * Brogue uses a sorted linked list ("pdsMap") to run Dijkstra efficiently.
 * We use a simple binary-heap Dijkstra over the same cost semantics, which
 * produces identical distances.
 */

import { NB_DIRS4, NB_DIRS8 } from "./grid";

export const PDS_FORBIDDEN = -1;
export const PDS_OBSTRUCTION = -2;
export const PDS_UNREACHABLE = 30000;

export interface CostMap {
  w: number;
  h: number;
  cost: Int16Array;
}

export function makeCostMap(w: number, h: number): CostMap {
  return { w, h, cost: new Int16Array(w * h) };
}

/** Min-heap keyed by distance. */
class MinHeap {
  private ids: number[] = [];
  private dist: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, d: number): void {
    this.ids.push(id);
    this.dist.push(d);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.dist[parent] <= this.dist[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { id: number; dist: number } | null {
    if (this.ids.length === 0) return null;
    const id = this.ids[0];
    const d = this.dist[0];
    const lastId = this.ids.pop()!;
    const lastD = this.dist.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.dist[0] = lastD;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.ids.length && this.dist[l] < this.dist[smallest]) smallest = l;
        if (r < this.ids.length && this.dist[r] < this.dist[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { id, dist: d };
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = ti;
    const td = this.dist[a];
    this.dist[a] = this.dist[b];
    this.dist[b] = td;
  }
}

/**
 * Run Dijkstra from (startX, startY) over the given cost map.
 *
 * `cost[i]` semantics mirror Brogue:
 *   > 0  : passable, cost of entering
 *   -1   : PDS_FORBIDDEN (never enter)
 *   -2   : PDS_OBSTRUCTION (cannot be crossed diagonally through)
 *
 * `useDiagonals` enables 8-way movement, matching Brogue's `dijkstraScan`.
 * Returns an Int16Array of distances (PDS_UNREACHABLE when unreachable).
 */
export function dijkstraScan(
  w: number,
  h: number,
  cost: Int16Array,
  startX: number,
  startY: number,
  useDiagonals: boolean
): Int16Array {
  const dist = new Int16Array(w * h).fill(PDS_UNREACHABLE);
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return dist;

  const idx = (x: number, y: number) => x * h + y;
  const heap = new MinHeap();
  dist[idx(startX, startY)] = 0;
  heap.push(idx(startX, startY), 0);

  const dirs = useDiagonals ? NB_DIRS8 : NB_DIRS4;

  while (heap.size > 0) {
    const cur = heap.pop()!;
    // index = x * h + y  =>  x = floor(cur / h), y = cur % h
    const cy = cur.id % h;
    const cx = (cur.id - cy) / h;
    if (cur.dist > dist[cur.id]) continue;

    for (let d = 0; d < dirs.length; d++) {
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = idx(nx, ny);
      const c = cost[ni];
      if (c < 0) continue;
      if (d >= 4) {
        // Diagonal: both orthogonal neighbours must be non-obstruction.
        const way1 = idx(cx + dirs[d][0], cy);
        const way2 = idx(cx, cy + dirs[d][1]);
        if (cost[way1] === PDS_OBSTRUCTION || cost[way2] === PDS_OBSTRUCTION) continue;
      }
      const nd = cur.dist + c;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        heap.push(ni, nd);
      }
    }
  }
  return dist;
}

/**
 * Port of `pathingDistance`: shortest path length between two points over
 * cells that are not pathing blockers.
 */
export function pathingDistance(
  w: number,
  h: number,
  cost: Int16Array,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dist = dijkstraScan(w, h, cost, x2, y2, true);
  const d = dist[x1 * h + y1];
  return d === PDS_UNREACHABLE ? PDS_UNREACHABLE : d;
}

/**
 * Extract a step-by-step path (excluding the start cell) from a distance
 * map, walking greedily downhill. Returns null when no path exists.
 */
export function tracePath(
  w: number,
  h: number,
  dist: Int16Array,
  startX: number,
  startY: number
): { x: number; y: number }[] | null {
  const idx = (x: number, y: number) => x * h + y;
  const path: { x: number; y: number }[] = [];
  let cx = startX;
  let cy = startY;
  const startDist = dist[idx(cx, cy)];
  if (startDist === PDS_UNREACHABLE) return null;

  for (let guard = 0; guard < w * h; guard++) {
    let bestX = -1;
    let bestY = -1;
    let best = dist[idx(cx, cy)];
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nd = dist[idx(nx, ny)];
      if (nd !== PDS_UNREACHABLE && nd < best) {
        best = nd;
        bestX = nx;
        bestY = ny;
      }
    }
    if (bestX < 0) break;
    path.push({ x: bestX, y: bestY });
    cx = bestX;
    cy = bestY;
    if (dist[idx(cx, cy)] === 0) break;
  }
  return path;
}

/** Convenience: build a cost map from a predicate over cell values. */
export function costMapFromPredicate(
  w: number,
  h: number,
  isBlocked: (v: number) => boolean,
  isDiagonalBlocked: (v: number) => boolean
): CostMap {
  const cm = makeCostMap(w, h);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const v = i * h + j;
      const blocked = isBlocked(v);
      cm.cost[v] = blocked ? (isDiagonalBlocked(v) ? PDS_OBSTRUCTION : PDS_FORBIDDEN) : 1;
    }
  }
  return cm;
}
