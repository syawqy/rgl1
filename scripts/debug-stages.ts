/**
 * Replicate generateLevel() step by step, reporting connectivity after each
 * stage, so we can see exactly which pipeline step breaks the map.
 */
import { Rng } from "../src/core/rng";
import { Grid, NB_DIRS4 } from "../src/core/grid";
import {
  carveDungeon,
  createBlobOnGrid,
  randomLocationInGrid,
  DCOLS,
  DROWS,
} from "../src/core/brogueGen";
import { D, L, T, combinedFlags } from "../src/core/terrain";
import { dijkstraScan, makeCostMap, PDS_OBSTRUCTION } from "../src/core/pathfind";

const seed = Number(process.argv[2] ?? 2);
const depth = Number(process.argv[3] ?? 1);
const rng = new Rng(seed);
const cidx = (h: number, x: number, y: number) => x * h + y;

/** Reachability over a passability predicate. */
function reach(
  w: number,
  h: number,
  passable: (x: number, y: number) => boolean,
  sx: number,
  sy: number
): { reach: number; total: number } {
  const seen = new Uint8Array(w * h);
  const stack = [cidx(h, sx, sy)];
  seen[stack[0]] = 1;
  let r = 0;
  while (stack.length) {
    const cur = stack.pop()!;
    const cy = cur % h;
    const cx = (cur - cy) / h;
    r++;
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cidx(h, nx, ny);
      if (seen[ni]) continue;
      if (!passable(nx, ny)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  let total = 0;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) if (passable(x, y)) total++;
  return { reach: r, total };
}

// ---- Stage 1: carve ----
const grid = carveDungeon(depth, rng);
const carvePassable = (x: number, y: number) => grid.get(x, y) === 1 || grid.get(x, y) === 2;
let floors = 0;
for (let i = 0; i < DCOLS; i++)
  for (let j = 0; j < DROWS; j++) if (grid.get(i, j) === 1) floors++;
const r1 = reach(DCOLS, DROWS, carvePassable, 0, 0);
console.log(`STAGE 1 carve: floor=${floors} (doors=2 also passable)`);
console.log(`  reachability of carve grid (from 0,0): ${r1.reach}/${r1.total}`);

// find biggest component of carve grid
function biggestComponent(g: Grid): number {
  const seen = new Uint8Array(g.w * g.h);
  let best = 0;
  for (let i = 0; i < g.w; i++)
    for (let j = 0; j < g.h; j++) {
      const si = cidx(g.h, i, j);
      if (seen[si] || (g.get(i, j) !== 1 && g.get(i, j) !== 2)) continue;
      const stack = [si];
      seen[si] = 1;
      let r = 0;
      while (stack.length) {
        const cur = stack.pop()!;
        const cy = cur % g.h;
        const cx = (cur - cy) / g.h;
        r++;
        for (let d = 0; d < 4; d++) {
          const nx = cx + NB_DIRS4[d][0];
          const ny = cy + NB_DIRS4[d][1];
          if (!g.inBounds(nx, ny)) continue;
          const ni = cidx(g.h, nx, ny);
          if (seen[ni]) continue;
          if (g.get(nx, ny) !== 1 && g.get(nx, ny) !== 2) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (r > best) best = r;
    }
  return best;
}
const bc = biggestComponent(grid);
console.log(`  biggest component of carve grid: ${bc} (total floor+door = ${r1.total})`);

// ---- Stage 2: addLoops ----
const sCoord = rng.shuffle(rng.sequential(DCOLS * DROWS));
const cost = makeCostMap(DCOLS, DROWS);
for (let i = 0; i < DCOLS; i++)
  for (let j = 0; j < DROWS; j++) cost.cost[cidx(DROWS, i, j)] = grid.get(i, j) === 0 ? PDS_OBSTRUCTION : 1;
const dirCoords: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];
for (const coord of sCoord) {
  const x = Math.floor(coord / DROWS);
  const y = coord % DROWS;
  if (grid.get(x, y) !== 0) continue;
  for (let d = 0; d <= 1; d++) {
    const newX = x + dirCoords[d][0];
    const newY = y + dirCoords[d][1];
    const oppX = x - dirCoords[d][0];
    const oppY = y - dirCoords[d][1];
    if (!grid.inBounds(newX, newY) || !grid.inBounds(oppX, oppY)) continue;
    if (grid.get(newX, newY) !== 1 || grid.get(oppX, oppY) !== 1) continue;
    const pathMap = dijkstraScan(DCOLS, DROWS, cost.cost, newX, newY, false);
    if (pathMap[cidx(DROWS, oppX, oppY)] > 20) {
      grid.set(x, y, 2);
      cost.cost[cidx(DROWS, x, y)] = 1;
      break;
    }
  }
}
console.log(`STAGE 2 addLoops: biggest component = ${biggestComponent(grid)}`);

// ---- Stage 3: translate to terrain ----
const dungeon = new Int16Array(DCOLS * DROWS).fill(D.GRANITE);
const liquid = new Int16Array(DCOLS * DROWS).fill(L.NOTHING);
for (let i = 0; i < DCOLS; i++)
  for (let j = 0; j < DROWS; j++) {
    const v = grid.get(i, j);
    if (v === 1) dungeon[cidx(DROWS, i, j)] = D.FLOOR;
    else if (v === 2) dungeon[cidx(DROWS, i, j)] = rng.percent(60) && depth < 12 ? D.DOOR : D.FLOOR;
  }
const terrainPassable = (x: number, y: number) => {
  const at = cidx(DROWS, x, y);
  return !(combinedFlags(dungeon[at], liquid[at]) & T.OBSTRUCTS_PASSABILITY);
};
let floors2 = 0;
for (let i = 0; i < dungeon.length; i++) if (dungeon[i] === D.FLOOR || dungeon[i] === D.DOOR) floors2++;
console.log(`STAGE 3 translate: floor+door=${floors2}`);
const r3 = reach(DCOLS, DROWS, terrainPassable, 0, 0);
console.log(`  reachability: ${r3.reach}/${r3.total} = ${(r3.reach / r3.total).toFixed(3)}`);

// find the biggest region & report its centre, then use that as the start
let best = { r: 0, sx: 0, sy: 0 };
{
  const seen = new Uint8Array(DCOLS * DROWS);
  for (let i = 0; i < DCOLS; i++)
    for (let j = 0; j < DROWS; j++) {
      const si = cidx(DROWS, i, j);
      if (seen[si] || !terrainPassable(i, j)) continue;
      const stack = [si];
      seen[si] = 1;
      let r = 0;
      while (stack.length) {
        const cur = stack.pop()!;
        const cy = cur % DROWS;
        const cx = (cur - cy) / DROWS;
        r++;
        for (let d = 0; d < 4; d++) {
          const nx = cx + NB_DIRS4[d][0];
          const ny = cy + NB_DIRS4[d][1];
          if (nx < 0 || ny < 0 || nx >= DCOLS || ny >= DROWS) continue;
          const ni = cidx(DROWS, nx, ny);
          if (seen[ni] || !terrainPassable(nx, ny)) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (r > best.r) best = { r, sx: i, sy: j };
    }
}
console.log(`  biggest region size=${best.r} at (${best.sx},${best.sy})`);

void randomLocationInGrid;
void createBlobOnGrid;
