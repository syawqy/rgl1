import { generateLevel, bfsDistanceMap } from "../src/core/level";
import { carveDungeon } from "../src/core/brogueGen";
import { Rng } from "../src/core/rng";
import { Grid, NB_DIRS4 } from "../src/core/grid";
import { D, L, T, combinedFlags } from "../src/core/terrain";

const seed = Number(process.argv[2] ?? 2);
const depth = Number(process.argv[3] ?? 1);
const rng = new Rng(seed);

// Step through the pipeline manually
const grid = carveDungeon(depth, rng);
let floors = 0;
for (let i = 0; i < grid.cells.length; i++) if (grid.get(i % grid.w, Math.floor(i / grid.w)) === 1) floors++;
console.log(`after carveDungeon: floor cells = ${floors}`);

// check connectivity of the raw carve grid
function gridReach(g: Grid, sx: number, sy: number): { reach: number; total: number } {
  const seen = new Uint8Array(g.w * g.h);
  const stack = [sx * g.h + sy];
  seen[stack[0]] = 1;
  let reach = 0;
  while (stack.length) {
    const cur = stack.pop()!;
    const cy = cur % g.h;
    const cx = (cur - cy) / g.h;
    reach++;
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (!g.inBounds(nx, ny)) continue;
      const ni = nx * g.h + ny;
      if (seen[ni]) continue;
      if (g.get(nx, ny) !== 1) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  let total = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 1) total++;
  return { reach, total };
}

// find largest component
function largestComponent(g: Grid): { reach: number; total: number } {
  const seen = new Uint8Array(g.w * g.h);
  let best = { reach: 0, total: 0 };
  let total = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 1) total++;
  for (let i = 0; i < g.w; i++) {
    for (let j = 0; j < g.h; j++) {
      const si = i * g.h + j;
      if (seen[si] || g.get(i, j) !== 1) continue;
      const stack = [si];
      seen[si] = 1;
      let reach = 0;
      while (stack.length) {
        const cur = stack.pop()!;
        const cy = cur % g.h;
        const cx = (cur - cy) / g.h;
        reach++;
        for (let d = 0; d < 4; d++) {
          const nx = cx + NB_DIRS4[d][0];
          const ny = cy + NB_DIRS4[d][1];
          if (!g.inBounds(nx, ny)) continue;
          const ni = nx * g.h + ny;
          if (seen[ni]) continue;
          if (g.get(nx, ny) !== 1) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      if (reach > best.reach) best = { reach, total };
    }
  }
  return best;
}

const lc = largestComponent(grid);
console.log(`largest connected component of carve grid: ${lc.reach}/${lc.total} = ${(lc.reach / lc.total).toFixed(3)}`);

const level = generateLevel({ depth, seed });
const dist = bfsDistanceMap(level, level.start.x, level.start.y);
let total = 0, reach = 0;
for (let i = 0; i < level.w; i++)
  for (let j = 0; j < level.h; j++) {
    const at = i * level.h + j;
    const f = combinedFlags(level.dungeon[at], level.liquid[at]);
    if (f & T.OBSTRUCTS_PASSABILITY) continue;
    total++;
    if (dist[at] >= 0) reach++;
  }
console.log(`final level reachability: ${reach}/${total} = ${(reach / total).toFixed(3)}`);
void gridReach;
void D;
void L;
