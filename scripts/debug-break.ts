import { generateLevel, bfsDistanceMap } from "../src/core/level";
import { D, L, T, combinedFlags } from "../src/core/terrain";

const seed = Number(process.argv[2] ?? 2);
const depth = Number(process.argv[3] ?? 1);

const level = generateLevel({ depth, seed });
const dist = bfsDistanceMap(level, level.start.x, level.start.y);
const at = (x: number, y: number) => x * level.h + y;
const walk = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return false;
  const f = combinedFlags(level.dungeon[at(x, y)], level.liquid[at(x, y)]);
  return !(f & T.OBSTRUCTS_PASSABILITY);
};

// 1. Every DOOR cell: is it reachable, and does it link two regions?
let doors = 0;
let doorUnreachable = 0;
const kinds: Record<string, number> = {};
for (let x = 0; x < level.w; x++) {
  for (let y = 0; y < level.h; y++) {
    if (level.dungeon[at(x, y)] !== D.DOOR) continue;
    doors++;
    if (dist[at(x, y)] < 0) doorUnreachable++;
    const n = [
      walk(x + 1, y) ? "E" : "",
      walk(x - 1, y) ? "W" : "",
      walk(x, y + 1) ? "S" : "",
      walk(x, y - 1) ? "N" : "",
    ].join("");
    kinds[n] = (kinds[n] ?? 0) + 1;
  }
}
console.log(`doors=${doors} unreachableDoors=${doorUnreachable}`);
console.log("door neighbour patterns:", JSON.stringify(kinds));

// 2. Walkable cells adjacent to the start component but NOT in it
const startRegion: { x: number; y: number }[] = [];
for (let x = 0; x < level.w; x++)
  for (let y = 0; y < level.h; y++)
    if (dist[at(x, y)] >= 0) startRegion.push({ x, y });

let boundary: Record<string, number> = {};
for (const p of startRegion) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!walk(nx, ny)) {
      const k = `d${level.dungeon[at(nx, ny)]}`;
      boundary[k] = (boundary[k] ?? 0) + 1;
      continue;
    }
    if (dist[at(nx, ny)] < 0) {
      const k = `UNREACHABLE d${level.dungeon[at(nx, ny)]} l${level.liquid[at(nx, ny)]}`;
      boundary[k] = (boundary[k] ?? 0) + 1;
    }
  }
}
console.log("start-region boundary:", JSON.stringify(boundary, null, 1));

// 3. How many walkable cells total, how many liquid-blocked
let walkable = 0;
let liquidBlocked = 0;
for (let x = 0; x < level.w; x++)
  for (let y = 0; y < level.h; y++) {
    if (walk(x, y)) walkable++;
    else if (level.liquid[at(x, y)] !== L.NOTHING) liquidBlocked++;
  }
console.log(`walkable=${walkable} liquidBlocked=${liquidBlocked} startRegion=${startRegion.length}`);
