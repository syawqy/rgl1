import { generateLevel, bfsDistanceMap } from "../src/core/level";
import { T, combinedFlags } from "../src/core/terrain";

for (let seed = 1; seed <= 12; seed++) {
  for (const depth of [1, 3, 5, 8]) {
    const level = generateLevel({ depth, seed });
    const dist = bfsDistanceMap(level, level.start.x, level.start.y);
    let total = 0;
    let reach = 0;
    for (let i = 0; i < level.w; i++) {
      for (let j = 0; j < level.h; j++) {
        const at = i * level.h + j;
        const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
        if (flags & T.OBSTRUCTS_PASSABILITY) continue;
        total++;
        if (dist[at] >= 0) reach++;
      }
    }
    const ratio = reach / total;
    if (ratio < 0.95) {
      console.log(`BAD seed=${seed} depth=${depth} ratio=${ratio.toFixed(3)} reach=${reach}/${total}`);
      console.log(`  start=(${level.start.x},${level.start.y}) distStart=${dist[level.start.x * level.h + level.start.y]}`);
    }
  }
}
console.log("done");
