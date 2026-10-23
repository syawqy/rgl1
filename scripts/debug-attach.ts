import { Rng } from "../src/core/rng";
import { Grid, NB_DIRS4 } from "../src/core/grid";
import {
  carveDungeon,
  designRandomRoom,
  chooseRandomDoorSites,
  directionOfDoorSite,
  roomFitsAt,
  insertRoomAt,
  adjustProfileForDepth,
  adjustFirstRoomProfileForDepth,
  DP_BASIC,
  DP_BASIC_FIRST_ROOM,
  DCOLS,
  DROWS,
  type DoorSites,
} from "../src/core/brogueGen";

const seed = Number(process.argv[2] ?? 2);
const depth = Number(process.argv[3] ?? 1);
const rng = new Rng(seed);

function components(g: Grid): { biggest: number; total: number; count: number } {
  const seen = new Uint8Array(g.w * g.h);
  let total = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 1) total++;
  let biggest = 0;
  let count = 0;
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
          if (seen[ni] || g.get(nx, ny) !== 1) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      count++;
      if (reach > biggest) biggest = reach;
    }
  }
  return { biggest, total, count };
}

const grid = new Grid(DCOLS, DROWS);
const firstRoomDP = adjustFirstRoomProfileForDepth(DP_BASIC_FIRST_ROOM, depth);
designRandomRoom(grid, false, null, firstRoomDP.roomFrequencies, rng);
console.log("after first room:", JSON.stringify(components(grid)));

// Replicate attachRooms with tracing
const theDP = adjustProfileForDepth(DP_BASIC, depth);
const attempts = 35;
const maxRoomCount = 35;
const roomMap = new Grid(DCOLS, DROWS);
const sCoord = rng.shuffle(rng.sequential(DCOLS * DROWS));

let roomsBuilt = 0;
for (let roomsAttempted = 0; roomsBuilt < maxRoomCount && roomsAttempted < attempts; roomsAttempted++) {
  roomMap.fill(0);
  const doorSites: DoorSites = [
    { x: -1, y: -1 },
    { x: -1, y: -1 },
    { x: -1, y: -1 },
    { x: -1, y: -1 },
  ];
  const wantHallway = roomsAttempted <= attempts - 5 && rng.percent(theDP.corridorChance);
  designRandomRoom(roomMap, wantHallway, doorSites, theDP.roomFrequencies, rng);

  let placed = false;
  let placedWith = "";
  for (let i = 0; i < sCoord.length; i++) {
    const x = Math.floor(sCoord[i] / DROWS);
    const y = sCoord[i] % DROWS;
    const dir = directionOfDoorSite(grid, x, y);
    if (dir === -1) continue;
    const oppDir = dir === 0 ? 1 : dir === 1 ? 0 : dir === 2 ? 3 : 2;
    if (doorSites[oppDir].x === -1) continue;
    const offX = x - doorSites[oppDir].x;
    const offY = y - doorSites[oppDir].y;
    if (!roomFitsAt(grid, roomMap, offX, offY)) continue;

    insertRoomAt(grid, roomMap, offX, offY, doorSites[oppDir].x, doorSites[oppDir].y);
    grid.set(x, y, 2);
    roomsBuilt++;
    placed = true;
    placedWith = `at (${x},${y}) dir=${dir} opp=${oppDir} off=(${offX},${offY})`;
    break;
  }
  const c = components(grid);
  console.log(
    `attempt ${roomsAttempted} hallway=${wantHallway} placed=${placed} ${placedWith} -> biggest=${c.biggest}/${c.total} comps=${c.count}`
  );
}
