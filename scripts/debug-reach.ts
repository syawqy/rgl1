import { generateLevel, bfsDistanceMap } from "../src/core/level";
import { D, L, T, combinedFlags } from "../src/core/terrain";

const seed = Number(process.argv[2] ?? 1);
const depth = Number(process.argv[3] ?? 1);

const level = generateLevel({ depth, seed });
const dist = bfsDistanceMap(level, level.start.x, level.start.y);

let out = "";
for (let y = 0; y < level.h; y++) {
  let row = "";
  for (let x = 0; x < level.w; x++) {
    const at = x * level.h + y;
    const d = level.dungeon[at];
    const l = level.liquid[at];
    const flags = combinedFlags(d, l);
    if (x === level.start.x && y === level.start.y) {
      row += "@";
      continue;
    }
    if (level.stairsDown && x === level.stairsDown.x && y === level.stairsDown.y) {
      row += "D";
      continue;
    }
    if (flags & T.OBSTRUCTS_PASSABILITY) {
      row += d === D.WALL ? "#" : " ";
      continue;
    }
    // walkable: mark reachability
    if (dist[at] < 0) {
      row += l === L.NOTHING ? "x" : "X"; // unreachable floor
    } else {
      row += l === L.NOTHING ? "." : (l === L.DEEP_WATER ? "≈" : "~");
    }
  }
  out += row + "\n";
}
console.log(out);
console.log("@ = start, D = stairs down, . = reachable floor, x = UNREACHABLE floor");
