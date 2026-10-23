/**
 * brogueGen.ts — faithful TypeScript port of BrogueCE's dungeon generator.
 *
 * Source of truth: BrogueCE `src/brogue/Architect.c` (functions
 * `digDungeon`, `carveDungeon`, `attachRooms`, `designRandomRoom`,
 * `designCavern`, `designEntranceRoom`, `designCrossRoom`,
 * `designSymmetricalCrossRoom`, `designSmallRoom`, `designCircularRoom`,
 * `designChunkyRoom`, `chooseRandomDoorSites`, `attachHallwayTo`,
 * `insertRoomAt`, `roomFitsAt`, `addLoops`, `finishWalls`,
 * `removeDiagonalOpenings`, `designLakes`, `fillLakes`, `finishDoors`,
 * `setUpWaypoints`) and `src/brogue/Grid.c` (`createBlobOnGrid`,
 * `cellularAutomataRound`, `drawRectangleOnGrid`, `drawCircleOnGrid`).
 *
 * The algorithm keeps Brogue's characteristic "room-and-hallway" structure
 * rather than a maze: hand-placed room templates (crosses, circles, chunky
 * blobs, organic caves) are stamped into the grid, then connected by
 * corridors whose length and direction are randomised, and finally loops are
 * punched through the walls so the player can backtrack freely.
 */

import { Rng, clamp } from "./rng";
import { Grid, NB_DIRS4, NB_DIRS8, NO_DIRECTION, oppositeDirection } from "./grid";

/* ------------------------------------------------------------------ */
/* Constants — ported from Brogue's Rogue.h                           */
/* ------------------------------------------------------------------ */

/** Brogue's terminal map is 79x29; we shrink it for a mobile screen. */
export const DCOLS = 35;
export const DROWS = 27;

export const HORIZONTAL_CORRIDOR_MIN_LENGTH = 5;
export const HORIZONTAL_CORRIDOR_MAX_LENGTH = 15;
export const VERTICAL_CORRIDOR_MIN_LENGTH = 2;
export const VERTICAL_CORRIDOR_MAX_LENGTH = 9;

export const CAVE_MIN_WIDTH = 26;
export const CAVE_MIN_HEIGHT = 12;

export const ROOM_TYPE_COUNT = 8;
export const MAX_WAYPOINT_COUNT = 40;
export const WAYPOINT_SIGHT_RADIUS = 10;

/** Amulet level. Brogue uses 26; we compress the run for mobile. */
export const AMULET_LEVEL = 8;
export const DEEPEST_LEVEL = 12;

/**
 * Room type frequencies, in Brogue's order:
 *  0. Cross room
 *  1. Small symmetrical cross room
 *  2. Small room
 *  3. Circular room
 *  4. Chunky room
 *  5. Cave
 *  6. Cavern (the kind that fills a level)
 *  7. Entrance room
 */
export const ROOM_TYPE_NAMES = [
  "cross",
  "symmetrical cross",
  "small",
  "circular",
  "chunky",
  "cave",
  "cavern",
  "entrance",
] as const;

export type RoomType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DungeonProfile {
  /** 8 room-type weights. */
  roomFrequencies: number[];
  /** Percent chance that a room sprouts a connecting corridor. */
  corridorChance: number;
}

/** Brogue's dungeonProfileCatalog[DP_BASIC]. */
export const DP_BASIC: DungeonProfile = {
  roomFrequencies: [2, 1, 1, 1, 7, 1, 0, 0],
  corridorChance: 10,
};

/** Brogue's dungeonProfileCatalog[DP_BASIC_FIRST_ROOM]. */
export const DP_BASIC_FIRST_ROOM: DungeonProfile = {
  roomFrequencies: [10, 0, 0, 3, 7, 10, 10, 0],
  corridorChance: 0,
};

/* ------------------------------------------------------------------ */
/* Room type selection                                                 */
/* ------------------------------------------------------------------ */

/**
 * Port of `designRandomRoom`'s weighted pick.
 * Returns the chosen room type index.
 */
export function pickRoomType(freqs: number[], rng: Rng): RoomType {
  let sum = 0;
  for (const f of freqs) sum += f;
  if (sum <= 0) return 0;
  let idx = rng.range(0, sum - 1);
  for (let i = 0; i < ROOM_TYPE_COUNT; i++) {
    if (idx < freqs[i]) return i as RoomType;
    idx -= freqs[i];
  }
  return 0;
}

/**
 * Port of `adjustDungeonProfileForDepth`.
 * Deeper levels get more caves/caverns, fewer cross rooms and far more
 * corridors (so the map feels like a network rather than a chain).
 */
export function adjustProfileForDepth(profile: DungeonProfile, depth: number): DungeonProfile {
  const descentPercent = clamp(
    Math.floor((100 * (depth - 1)) / (AMULET_LEVEL - 1)),
    0,
    100
  );
  const f = profile.roomFrequencies.slice();
  f[0] += Math.floor((20 * (100 - descentPercent)) / 100);
  f[1] += Math.floor((10 * (100 - descentPercent)) / 100);
  f[3] += Math.floor((7 * (100 - descentPercent)) / 100);
  f[5] += Math.floor((10 * descentPercent) / 100);
  return {
    roomFrequencies: f,
    corridorChance: profile.corridorChance + Math.floor((80 * (100 - descentPercent)) / 100),
  };
}

/** Port of `adjustDungeonFirstRoomProfileForDepth`. */
export function adjustFirstRoomProfileForDepth(
  profile: DungeonProfile,
  depth: number
): DungeonProfile {
  const descentPercent = clamp(
    Math.floor((100 * (depth - 1)) / (AMULET_LEVEL - 1)),
    0,
    100
  );
  const f = profile.roomFrequencies.slice();
  if (depth === 1) {
    for (let i = 0; i < ROOM_TYPE_COUNT; i++) f[i] = 0;
    f[7] = 1; // entrance room
  } else {
    f[6] += Math.floor((50 * descentPercent) / 100);
  }
  return { roomFrequencies: f, corridorChance: profile.corridorChance };
}

/* ------------------------------------------------------------------ */
/* Grid helpers — ports of Brogue's Grid.c                            */
/* ------------------------------------------------------------------ */

/** Port of `drawRectangleOnGrid`. */
export function drawRectangle(
  g: Grid,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number
): void {
  for (let i = x; i < x + width; i++) {
    for (let j = y; j < y + height; j++) {
      if (g.inBounds(i, j)) g.set(i, j, value);
    }
  }
}

/** Port of `drawCircleOnGrid` (Brogue uses `< radius*radius + radius`). */
export function drawCircle(
  g: Grid,
  x: number,
  y: number,
  radius: number,
  value: number
): void {
  for (let i = Math.max(0, x - radius - 1); i < Math.min(g.w, x + radius + 1); i++) {
    for (let j = Math.max(0, y - radius - 1); j < Math.min(g.h, y + radius + 1); j++) {
      if ((i - x) * (i - x) + (j - y) * (j - y) < radius * radius + radius) {
        g.set(i, j, value);
      }
    }
  }
}

/**
 * Port of `cellularAutomataRound`.
 *
 * IMPORTANT: Brogue counts all EIGHT neighbours (DIRECTION_COUNT = 8), not
 * the four cardinal ones used by the classic "4-5 rule". The birth/survival
 * parameter strings are indexed by that neighbour count, so
 * "ffffffttt" means "born with 6, 7 or 8 neighbours".
 *
 * `birthParams` / `survivalParams` are 9-char strings: 't' = alive, 'f' = dead.
 */
export function cellularAutomataRound(
  g: Grid,
  birthParams: string,
  survivalParams: string
): void {
  const buffer = g.clone();
  for (let i = 0; i < g.w; i++) {
    for (let j = 0; j < g.h; j++) {
      let nbCount = 0;
      for (let d = 0; d < 8; d++) {
        const nx = i + NB_DIRS8[d][0];
        const ny = j + NB_DIRS8[d][1];
        if (g.inBounds(nx, ny) && buffer.get(nx, ny)) nbCount++;
      }
      const wasAlive = buffer.get(i, j) !== 0;
      if (!wasAlive && birthParams[nbCount] === "t") {
        g.set(i, j, 1);
      } else if (wasAlive && survivalParams[nbCount] === "t") {
        // survives
      } else {
        g.set(i, j, 0);
      }
    }
  }
}

export interface BlobResult {
  grid: Grid;
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * Port of `createBlobOnGrid`.
 *
 * Seeds a region with noise, runs the cellular automaton `roundCount` times,
 * then finds the largest connected blob and keeps only that blob. Retries
 * until the blob satisfies the minimum width/height.
 *
 * Brogue's cavern call uses:
 *   roundCount 5, percentSeeded 55,
 *   birth "ffffffttt", survival "ffffttttt"
 * i.e. birth needs 6-8 neighbours, survival needs 4-8.
 */
export function createBlobOnGrid(
  w: number,
  h: number,
  roundCount: number,
  minBlobWidth: number,
  minBlobHeight: number,
  maxBlobWidth: number,
  maxBlobHeight: number,
  percentSeeded: number,
  birthParams: string,
  survivalParams: string,
  rng: Rng
): BlobResult {
  let topBlobSize = 0;
  let topBlobNumber = 0;
  let topBlobMinX = maxBlobWidth;
  let topBlobMaxX = 0;
  let topBlobMinY = maxBlobHeight;
  let topBlobMaxY = 0;
  let grid = new Grid(w, h);

  // Guard against pathological infinite loops.
  let attempts = 0;
  const MAX_ATTEMPTS = 400;

  do {
    attempts++;
    grid = new Grid(w, h);

    // Seed the relevant portion with noise.
    for (let i = 0; i < Math.min(maxBlobWidth, w); i++) {
      for (let j = 0; j < Math.min(maxBlobHeight, h); j++) {
        grid.set(i, j, rng.percent(percentSeeded) ? 1 : 0);
      }
    }

    // Run the cellular automaton.
    for (let k = 0; k < roundCount; k++) {
      cellularAutomataRound(grid, birthParams, survivalParams);
    }

    // Label each blob with its own number, tracking the biggest.
    topBlobSize = 0;
    topBlobNumber = 0;
    topBlobMinX = maxBlobWidth;
    topBlobMaxX = 0;
    topBlobMinY = maxBlobHeight;
    topBlobMaxY = 0;
    let blobNumber = 2;
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        if (grid.get(i, j) === 1) {
          const size = grid.fillContiguousRegion(i, j, 1, blobNumber);
          if (size > topBlobSize) {
            topBlobSize = size;
            topBlobNumber = blobNumber;
          }
          blobNumber++;
        }
      }
    }

    // Measure the winning blob.
    for (let i = 0; i < w; i++) {
      let found = false;
      for (let j = 0; j < h; j++) {
        if (grid.get(i, j) === topBlobNumber) {
          found = true;
          break;
        }
      }
      if (found) {
        if (i < topBlobMinX) topBlobMinX = i;
        if (i > topBlobMaxX) topBlobMaxX = i;
      }
    }
    for (let j = 0; j < h; j++) {
      let found = false;
      for (let i = 0; i < w; i++) {
        if (grid.get(i, j) === topBlobNumber) {
          found = true;
          break;
        }
      }
      if (found) {
        if (j < topBlobMinY) topBlobMinY = j;
        if (j > topBlobMaxY) topBlobMaxY = j;
      }
    }

    const blobWidth = topBlobMaxX - topBlobMinX + 1;
    const blobHeight = topBlobMaxY - topBlobMinY + 1;

    if (
      blobWidth >= minBlobWidth &&
      blobHeight >= minBlobHeight &&
      topBlobNumber !== 0
    ) {
      // Keep only the winning blob.
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          grid.set(i, j, grid.get(i, j) === topBlobNumber ? 1 : 0);
        }
      }
      return {
        grid,
        minX: topBlobMinX,
        minY: topBlobMinY,
        width: blobWidth,
        height: blobHeight,
      };
    }
  } while (attempts < MAX_ATTEMPTS);

  // Fallback: a plain rectangle so generation never fails outright.
  const fallback = new Grid(w, h);
  const fw = Math.max(1, Math.min(minBlobWidth, w));
  const fh = Math.max(1, Math.min(minBlobHeight, h));
  drawRectangle(fallback, Math.floor((w - fw) / 2), Math.floor((h - fh) / 2), fw, fh, 1);
  return {
    grid: fallback,
    minX: Math.floor((w - fw) / 2),
    minY: Math.floor((h - fh) / 2),
    width: fw,
    height: fh,
  };
}

/* ------------------------------------------------------------------ */
/* Room templates — ports of the design*Room functions                 */
/* ------------------------------------------------------------------ */

/** Port of `designEntranceRoom`: the big upside-down T at the start. */
export function designEntranceRoom(g: Grid): void {
  g.fill(0);
  const roomWidth = 8;
  const roomHeight = 6;
  const roomWidth2 = 16;
  const roomHeight2 = 4;
  const roomX = Math.floor(DCOLS / 2 - roomWidth / 2 - 1);
  const roomY = DROWS - roomHeight - 2;
  const roomX2 = Math.floor(DCOLS / 2 - roomWidth2 / 2 - 1);
  const roomY2 = DROWS - roomHeight2 - 2;
  drawRectangle(g, roomX, roomY, roomWidth, roomHeight, 1);
  drawRectangle(g, roomX2, roomY2, roomWidth2, roomHeight2, 1);
}

/** Port of `designCrossRoom`: two overlapping rectangles forming a cross. */
export function designCrossRoom(g: Grid, rng: Rng): void {
  g.fill(0);
  const roomWidth = rng.range(3, 12);
  const roomX = rng.range(
    Math.max(0, Math.floor(DCOLS / 2 - (roomWidth - 1))),
    Math.min(DCOLS, Math.floor(DCOLS / 2))
  );
  const roomWidth2 = rng.range(4, 20);
  const roomX2 =
    roomX + Math.floor(roomWidth / 2) + rng.range(0, 2) + rng.range(0, 2) - 3 - Math.floor(roomWidth2 / 2);

  const roomHeight = rng.range(3, 7);
  const roomY = Math.floor(DROWS / 2 - roomHeight);

  const roomHeight2 = rng.range(2, 5);
  const roomY2 = Math.floor(DROWS / 2 - roomHeight2 - (rng.range(0, 2) + rng.range(0, 1)));

  drawRectangle(g, roomX - 5, roomY + 5, roomWidth, roomHeight, 1);
  drawRectangle(g, roomX2 - 5, roomY2 + 5, roomWidth2, roomHeight2, 1);
}

/** Port of `designSymmetricalCrossRoom`. */
export function designSymmetricalCrossRoom(g: Grid, rng: Rng): void {
  g.fill(0);
  const majorWidth = rng.range(4, 8);
  const majorHeight = rng.range(4, 5);
  let minorWidth = rng.range(3, 4);
  if (majorHeight % 2 === 0) minorWidth -= 1;
  let minorHeight = 3;
  if (majorWidth % 2 === 0) minorHeight -= 1;

  drawRectangle(
    g,
    Math.floor((DCOLS - majorWidth) / 2),
    Math.floor((DROWS - minorHeight) / 2),
    majorWidth,
    minorHeight,
    1
  );
  drawRectangle(
    g,
    Math.floor((DCOLS - minorWidth) / 2),
    Math.floor((DROWS - majorHeight) / 2),
    minorWidth,
    majorHeight,
    1
  );
}

/** Port of `designSmallRoom`. */
export function designSmallRoom(g: Grid, rng: Rng): void {
  g.fill(0);
  const width = rng.range(3, 6);
  const height = rng.range(2, 4);
  drawRectangle(g, Math.floor((DCOLS - width) / 2), Math.floor((DROWS - height) / 2), width, height, 1);
}

/** Port of `designCircularRoom` (with the optional inner hole). */
export function designCircularRoom(g: Grid, rng: Rng): void {
  const radius = rng.percent(5) ? rng.range(4, 10) : rng.range(2, 4);
  g.fill(0);
  drawCircle(g, Math.floor(DCOLS / 2), Math.floor(DROWS / 2), radius, 1);
  if (radius > 6 && rng.percent(50)) {
    drawCircle(g, Math.floor(DCOLS / 2), Math.floor(DROWS / 2), rng.range(3, radius - 3), 0);
  }
}

/** Port of `designChunkyRoom`: a cluster of overlapping circles. */
export function designChunkyRoom(g: Grid, rng: Rng): void {
  const chunkCount = rng.range(2, 8);
  g.fill(0);
  drawCircle(g, Math.floor(DCOLS / 2), Math.floor(DROWS / 2), 2, 1);
  let minX = Math.floor(DCOLS / 2 - 3);
  let maxX = Math.floor(DCOLS / 2 + 3);
  let minY = Math.floor(DROWS / 2 - 3);
  let maxY = Math.floor(DROWS / 2 + 3);

  for (let i = 0; i < chunkCount; ) {
    const x = rng.range(minX, maxX);
    const y = rng.range(minY, maxY);
    if (g.get(x, y)) {
      drawCircle(g, x, y, 2, 1);
      i++;
      minX = Math.max(1, Math.min(x - 3, minX));
      maxX = Math.min(DCOLS - 2, Math.max(x + 3, maxX));
      minY = Math.max(1, Math.min(y - 3, minY));
      maxY = Math.min(DROWS - 2, Math.max(y + 3, maxY));
    }
  }
}

/** Port of `designCavern`: an organic cave blob centred in the grid. */
export function designCavern(
  g: Grid,
  minWidth: number,
  maxWidth: number,
  minHeight: number,
  maxHeight: number,
  rng: Rng
): void {
  g.fill(0);
  const blob = createBlobOnGrid(
    DCOLS,
    DROWS,
    5,
    minWidth,
    minHeight,
    Math.min(maxWidth, DCOLS),
    Math.min(maxHeight, DROWS),
    55,
    "ffffffttt",
    "ffffttttt",
    rng
  );

  // Position the cave in the middle of the grid.
  const destX = Math.floor((DCOLS - blob.width) / 2);
  const destY = Math.floor((DROWS - blob.height) / 2);

  // Find a flood-fill insertion point (first filled cell).
  let fillX = -1;
  let fillY = -1;
  outer: for (let i = 0; i < DCOLS; i++) {
    for (let j = 0; j < DROWS; j++) {
      if (blob.grid.get(i, j)) {
        fillX = i;
        fillY = j;
        break outer;
      }
    }
  }
  if (fillX < 0) return;

  insertRoomAt(g, blob.grid, destX - blob.minX, destY - blob.minY, fillX, fillY);
}

/**
 * Port of `insertRoomAt`: stamps a room (or blob) into the dungeon map,
 * growing outwards from the insertion point through contiguous room cells.
 */
export function insertRoomAt(
  dungeonMap: Grid,
  roomMap: Grid,
  roomToDungeonX: number,
  roomToDungeonY: number,
  xRoom: number,
  yRoom: number
): void {
  const stack: [number, number][] = [[xRoom, yRoom]];
  while (stack.length) {
    const [rx, ry] = stack.pop()!;
    const dx = rx + roomToDungeonX;
    const dy = ry + roomToDungeonY;
    if (!dungeonMap.inBounds(dx, dy)) continue;
    dungeonMap.set(dx, dy, 1);
    for (let dir = 0; dir < 4; dir++) {
      const nx = rx + NB_DIRS4[dir][0];
      const ny = ry + NB_DIRS4[dir][1];
      if (
        roomMap.inBounds(nx, ny) &&
        roomMap.get(nx, ny) &&
        dungeonMap.inBounds(nx + roomToDungeonX, ny + roomToDungeonY) &&
        dungeonMap.get(nx + roomToDungeonX, ny + roomToDungeonY) === 0
      ) {
        stack.push([nx, ny]);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Door sites & corridors                                              */
/* ------------------------------------------------------------------ */

/**
 * Port of `directionOfDoorSite`.
 * If the cell is empty and exactly one cardinal neighbour is room floor, the
 * cell is a valid door site facing that direction.
 */
export function directionOfDoorSite(g: Grid, x: number, y: number): number {
  if (g.get(x, y)) return NO_DIRECTION; // already occupied
  let solutionDir = NO_DIRECTION;
  for (let dir = 0; dir < 4; dir++) {
    const newX = x + NB_DIRS4[dir][0];
    const newY = y + NB_DIRS4[dir][1];
    const oppX = x - NB_DIRS4[dir][0];
    const oppY = y - NB_DIRS4[dir][1];
    if (g.inBounds(oppX, oppY) && g.inBounds(newX, newY) && g.get(oppX, oppY) === 1) {
      if (solutionDir !== NO_DIRECTION) return NO_DIRECTION; // ambiguous
      solutionDir = dir;
    }
  }
  return solutionDir;
}

export type DoorSites = [Pos, Pos, Pos, Pos];

export interface Pos {
  x: number;
  y: number;
}

const INVALID: Pos = { x: -1, y: -1 };

/**
 * Port of `chooseRandomDoorSites`.
 * Picks one candidate door site per cardinal direction. A candidate is
 * rejected if a ray cast 10 tiles outward re-enters the room.
 */
export function chooseRandomDoorSites(roomMap: Grid, rng: Rng): DoorSites {
  const grid = roomMap.clone();
  const sites: DoorSites = [INVALID, INVALID, INVALID, INVALID];

  for (let i = 0; i < roomMap.w; i++) {
    for (let j = 0; j < roomMap.h; j++) {
      if (!grid.get(i, j)) {
        const dir = directionOfDoorSite(roomMap, i, j);
        if (dir !== NO_DIRECTION) {
          let newX = i + NB_DIRS4[dir][0];
          let newY = j + NB_DIRS4[dir][1];
          let failed = false;
          for (let k = 0; k < 10 && roomMap.inBounds(newX, newY) && !failed; k++) {
            if (grid.get(newX, newY)) failed = true;
            newX += NB_DIRS4[dir][0];
            newY += NB_DIRS4[dir][1];
          }
          if (!failed) {
            grid.set(i, j, dir + 2); // 2..5, distinct from 0 (empty) and 1 (floor)
          }
        }
      }
    }
  }

  for (let dir = 0; dir < 4; dir++) {
    const loc = randomLocationInGrid(grid, dir + 2, rng);
    sites[dir] = loc;
  }
  return sites;
}

/** Port of `randomLocationInGrid`. */
export function randomLocationInGrid(g: Grid, validValue: number, rng: Rng): Pos {
  let count = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === validValue) count++;
  if (count <= 0) return { x: -1, y: -1 };
  let index = rng.range(0, count - 1);
  for (let i = 0; i < g.w; i++) {
    for (let j = 0; j < g.h; j++) {
      if (g.get(i, j) === validValue) {
        if (index === 0) return { x: i, y: j };
        index--;
      }
    }
  }
  return { x: -1, y: -1 };
}

/**
 * Port of `attachHallwayTo`.
 * Bolts a perpendicular hallway onto the room at one of the four door sites,
 * then relocates three of the door sites to radiate from the hallway's end.
 */
export function attachHallwayTo(g: Grid, doorSites: DoorSites, rng: Rng): void {
  // Pick a direction.
  const dirs = rng.shuffle([0, 1, 2, 3]);
  let dir = NO_DIRECTION;
  for (const d of dirs) {
    if (
      doorSites[d].x !== -1 &&
      doorSites[d].y !== -1 &&
      g.inBounds(
        doorSites[d].x + NB_DIRS4[d][0] * HORIZONTAL_CORRIDOR_MAX_LENGTH,
        doorSites[d].y + NB_DIRS4[d][1] * VERTICAL_CORRIDOR_MAX_LENGTH
      )
    ) {
      dir = d;
      break;
    }
  }
  if (dir === NO_DIRECTION) return;

  const length =
    dir === 0 || dir === 1
      ? rng.range(VERTICAL_CORRIDOR_MIN_LENGTH, VERTICAL_CORRIDOR_MAX_LENGTH)
      : rng.range(HORIZONTAL_CORRIDOR_MIN_LENGTH, HORIZONTAL_CORRIDOR_MAX_LENGTH);

  let x = doorSites[dir].x;
  let y = doorSites[dir].y;
  for (let i = 0; i < length; i++) {
    if (g.inBounds(x, y)) g.set(x, y, 1);
    x += NB_DIRS4[dir][0];
    y += NB_DIRS4[dir][1];
  }
  x = clamp(x - NB_DIRS4[dir][0], 0, g.w - 1);
  y = clamp(y - NB_DIRS4[dir][1], 0, g.h - 1);

  const allowObliqueHallwayExit = rng.percent(15);
  for (let dir2 = 0; dir2 < 4; dir2++) {
    const newX = x + NB_DIRS4[dir2][0];
    const newY = y + NB_DIRS4[dir2][1];
    if (
      (dir2 !== dir && !allowObliqueHallwayExit) ||
      !g.inBounds(newX, newY) ||
      g.get(newX, newY)
    ) {
      doorSites[dir2] = { x: -1, y: -1 };
    } else {
      doorSites[dir2] = { x: newX, y: newY };
    }
  }
}

/**
 * Port of `designRandomRoom`.
 * Picks a room type by weight, draws it, optionally attaches a hallway, and
 * records the door sites.
 */
export function designRandomRoom(
  g: Grid,
  attachHallway: boolean,
  doorSites: DoorSites | null,
  freqs: number[],
  rng: Rng
): void {
  const type = pickRoomType(freqs, rng);
  switch (type) {
    case 0:
      designCrossRoom(g, rng);
      break;
    case 1:
      designSymmetricalCrossRoom(g, rng);
      break;
    case 2:
      designSmallRoom(g, rng);
      break;
    case 3:
      designCircularRoom(g, rng);
      break;
    case 4:
      designChunkyRoom(g, rng);
      break;
    case 5: {
      const sub = rng.range(0, 2);
      if (sub === 0) designCavern(g, 3, 12, 4, 8, rng);
      else if (sub === 1) designCavern(g, 3, 12, 15, DROWS - 2, rng);
      else designCavern(g, 20, DROWS - 2, 4, 8, rng);
      break;
    }
    case 6:
      designCavern(g, CAVE_MIN_WIDTH, DCOLS - 2, CAVE_MIN_HEIGHT, DROWS - 2, rng);
      break;
    case 7:
      designEntranceRoom(g);
      break;
  }

  if (doorSites) {
    chooseRandomDoorSites(g, rng).forEach((s, i) => (doorSites[i] = s));
    if (attachHallway) {
      let dir = rng.range(0, 3);
      for (let i = 0; doorSites[dir].x === -1 && i < 3; i++) {
        dir = (dir + 1) % 4;
      }
      attachHallwayTo(g, doorSites, rng);
    }
  }
}

/**
 * Port of `roomFitsAt`.
 * The room fits if every one of its cells — plus a 1-cell margin around each
 * — lands on empty dungeon space.
 */
export function roomFitsAt(
  dungeonMap: Grid,
  roomMap: Grid,
  roomToDungeonX: number,
  roomToDungeonY: number
): boolean {
  for (let xRoom = 0; xRoom < roomMap.w; xRoom++) {
    for (let yRoom = 0; yRoom < roomMap.h; yRoom++) {
      if (roomMap.get(xRoom, yRoom)) {
        const xDungeon = xRoom + roomToDungeonX;
        const yDungeon = yRoom + roomToDungeonY;
        for (let i = xDungeon - 1; i <= xDungeon + 1; i++) {
          for (let j = yDungeon - 1; j <= yDungeon + 1; j++) {
            if (!dungeonMap.inBounds(i, j) || dungeonMap.get(i, j) > 0) return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Port of `attachRooms`.
 *
 * The heart of Brogue's layout: build a room in "hyperspace", then slide it
 * across real space in a random but predetermined order until one of its door
 * sites lines up with a valid door site on the existing dungeon wall.
 */
export function attachRooms(
  g: Grid,
  profile: DungeonProfile,
  attempts: number,
  maxRoomCount: number,
  rng: Rng
): void {
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
    designRandomRoom(
      roomMap,
      roomsAttempted <= attempts - 5 && rng.percent(profile.corridorChance),
      doorSites,
      profile.roomFrequencies,
      rng
    );

    // Slide hyperspace across real space in a random but predetermined order.
    for (let i = 0; i < sCoord.length; i++) {
      const x = Math.floor(sCoord[i] / DROWS);
      const y = sCoord[i] % DROWS;

      const dir = directionOfDoorSite(g, x, y);
      const oppDir = oppositeDirection(dir);
      if (
        dir !== NO_DIRECTION &&
        doorSites[oppDir].x !== -1 &&
        roomFitsAt(g, roomMap, x - doorSites[oppDir].x, y - doorSites[oppDir].y)
      ) {
        insertRoomAt(
          g,
          roomMap,
          x - doorSites[oppDir].x,
          y - doorSites[oppDir].y,
          doorSites[oppDir].x,
          doorSites[oppDir].y
        );
        g.set(x, y, 2); // door site
        roomsBuilt++;
        break;
      }
    }
  }
}

/**
 * Port of `carveDungeon`.
 * Places the first room then attaches up to 35 more.
 */
export function carveDungeon(depth: number, rng: Rng): Grid {
  const grid = new Grid(DCOLS, DROWS);
  const theDP = adjustProfileForDepth(DP_BASIC, depth);
  const firstRoomDP = adjustFirstRoomProfileForDepth(DP_BASIC_FIRST_ROOM, depth);

  designRandomRoom(grid, false, null, firstRoomDP.roomFrequencies, rng);
  attachRooms(grid, theDP, 35, 35, rng);
  return grid;
}

export { clamp };
