/**
 * debug-map.ts — print an ASCII map of a generated level.
 * Run with: npx vite-node scripts/debug-map.ts [seed] [depth]
 */
import { generateLevel } from "../src/core/level";
import { D, L } from "../src/core/terrain";

const seed = Number(process.argv[2] ?? 1);
const depth = Number(process.argv[3] ?? 1);

const t0 = Date.now();
const level = generateLevel({ depth, seed });
const dt = Date.now() - t0;

const GLYPH: Record<string, string> = {
  [D.GRANITE]: " ",
  [D.FLOOR]: ".",
  [D.WALL]: "#",
  [D.DOOR]: "+",
  [D.SECRET_DOOR]: "?",
  [D.STAIRS_UP]: "<",
  [D.STAIRS_DOWN]: ">",
  [D.GATE]: "=",
  [D.ALTAR]: "_",
};

const LIQ: Record<string, string> = {
  [L.NOTHING]: "",
  [L.SHALLOW_WATER]: "~",
  [L.DEEP_WATER]: "≈",
  [L.LAVA]: "!",
  [L.CHASM]: " ",
  [L.BRIDGE]: "=",
  [L.OBSIDIAN]: "o",
  [L.BRIMSTONE]: "b",
};

let out = "";
for (let y = 0; y < level.h; y++) {
  let row = "";
  for (let x = 0; x < level.w; x++) {
    const at = x * level.h + y;
    const d = level.dungeon[at];
    const l = level.liquid[at];
    if (x === level.start.x && y === level.start.y) {
      row += "@";
      continue;
    }
    if (level.stairsDown && x === level.stairsDown.x && y === level.stairsDown.y) {
      row += "D";
      continue;
    }
    const liq = LIQ[l] ?? "";
    row += liq || (GLYPH[d] ?? "?");
  }
  out += row + "\n";
}
console.log(out);
console.log(`seed=${seed} depth=${depth} time=${dt}ms waypoints=${level.waypoints.length}`);
