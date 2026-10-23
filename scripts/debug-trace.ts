import { generateLevel, bfsDistanceMap, Level } from "../src/core/level";
import { T, combinedFlags } from "../src/core/terrain";

const seed = Number(process.argv[2] ?? 2);
const depth = Number(process.argv[3] ?? 1);

function stats(level: Level): string {
  const dist = bfsDistanceMap(level, level.start.x, level.start.y);
  let total = 0;
  let reach = 0;
  for (let x = 0; x < level.w; x++)
    for (let y = 0; y < level.h; y++) {
      const at = x * level.h + y;
      const f = combinedFlags(level.dungeon[at], level.liquid[at]);
      if (f & T.OBSTRUCTS_PASSABILITY) continue;
      total++;
      if (dist[at] >= 0) reach++;
    }
  return `reach=${reach}/${total} (${(reach / total).toFixed(3)})`;
}

generateLevel({
  depth,
  seed,
  trace: (stage, level) => {
    // start may not be placed yet; use the first walkable cell as the origin
    let sx = 0;
    let sy = 0;
    let found = false;
    for (let x = 0; x < level.w && !found; x++)
      for (let y = 0; y < level.h; y++) {
        const at = x * level.h + y;
        const f = combinedFlags(level.dungeon[at], level.liquid[at]);
        if (!(f & T.OBSTRUCTS_PASSABILITY)) {
          sx = x;
          sy = y;
          found = true;
          break;
        }
      }
    const saved = { x: level.start.x, y: level.start.y };
    level.start = { x: sx, y: sy };
    console.log(`${stage.padEnd(34)} ${stats(level)}`);
    level.start = saved;
  },
});
