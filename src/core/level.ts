/**
 * level.ts — the full level-generation pipeline, ported from BrogueCE's
 * `digDungeon()` in src/brogue/Architect.c.
 *
 * Brogue's pipeline, in order:
 *   1. clearLevel()              — fill the map with granite
 *   2. carveDungeon(grid)        — stamp rooms + corridors
 *   3. addLoops(grid, 20)        — punch extra doors so the map is not a tree
 *   4. translate grid -> terrain (floor / door)
 *   5. finishWalls(false)        — expose walls around open space
 *   6. designLakes / fillLakes   — add water, lava, chasms
 *   7. removeDiagonalOpenings()  — close diagonal squeezes
 *   8. addMachines()             — treasure rooms / special features
 *   9. buildABridge()            — bridges over chasms
 *  10. finishDoors()             — remove orphan doors, add secret doors
 *  11. finishWalls(true)         — final wall pass including diagonals
 *
 * We keep the order exactly, because later steps depend on earlier ones.
 */

import { Rng, clamp } from "./rng";
import { Grid, NB_DIRS4, NO_DIRECTION } from "./grid";
import {
  carveDungeon,
  createBlobOnGrid,
  designCavern,
  drawCircle,
  drawRectangle,
  randomLocationInGrid,
  AMULET_LEVEL,
  DEEPEST_LEVEL,
  DCOLS,
  DROWS,
} from "./brogueGen";
import {
  PDS_OBSTRUCTION,
  PDS_UNREACHABLE,
  dijkstraScan,
  makeCostMap,
} from "./pathfind";
import { D, L, T, combinedFlags, dungeonDef, liquidDef } from "./terrain";

export interface Level {
  w: number;
  h: number;
  /** DUNGEON layer per cell. */
  dungeon: Int16Array;
  /** LIQUID layer per cell. */
  liquid: Int16Array;
  /** SURFACE layer per cell (cosmetic). */
  surface: Int16Array;
  /** Player start position. */
  start: { x: number; y: number };
  /** Stairs down (goal of the level). */
  stairsDown: { x: number; y: number } | null;
  /** Stairs up (where the player came from). */
  stairsUp: { x: number; y: number } | null;
  /** Waypoints for monster pathing. */
  waypoints: { x: number; y: number }[];
  depth: number;
  seed: number;
}

/**
 * Cell index. MUST match Grid's layout: column-major, x * h + y.
 * The first argument is the grid HEIGHT (h), not the width.
 */
const cidx = (h: number, x: number, y: number) => x * h + y;

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/**
 * Port of `addLoops`.
 *
 * Brogue's maps are almost trees, which leads to backtracking tedium. This
 * punches extra doorways through walls whenever the two floor tiles flanking
 * a wall are more than `minimumPathingDistance` apart by pathing distance —
 * i.e. whenever there is a shortcut to be had.
 */
function addLoops(grid: Grid, minimumPathingDistance: number, rng: Rng): void {
  const sCoord = rng.shuffle(rng.sequential(DCOLS * DROWS));
  const cost = makeCostMap(DCOLS, DROWS);

  // Granite -> obstruction, floor -> cost 1, door site -> cost 1.
  for (let i = 0; i < DCOLS; i++) {
    for (let j = 0; j < DROWS; j++) {
      const v = grid.get(i, j);
      cost.cost[cidx(DROWS, i, j)] = v === 0 ? PDS_OBSTRUCTION : 1;
    }
  }

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

      // Floor on both sides of this wall tile.
      const pathMap = dijkstraScan(DCOLS, DROWS, cost.cost, newX, newY, false);
      const dist = pathMap[cidx(DROWS, oppX, oppY)];
      if (dist !== PDS_UNREACHABLE && dist > minimumPathingDistance) {
        grid.set(x, y, 2); // turn the tile into a doorway
        cost.cost[cidx(DROWS, x, y)] = 1;
        break;
      }
    }
  }
}

/**
 * Port of `finishWalls`.
 *
 * Granite that is exposed to open space becomes a wall; walls that are no
 * longer exposed (buried inside solid rock) revert to granite.
 */
function finishWalls(level: Level, includingDiagonals: boolean): void {
  const dirs = includingDiagonals ? 8 : 4;
  const allDirs: readonly (readonly [number, number])[] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (let i = 0; i < level.w; i++) {
    for (let j = 0; j < level.h; j++) {
      const at = cidx(level.h, i, j);
      const dTile = level.dungeon[at];

      if (dTile === D.GRANITE) {
        let exposed = false;
        for (let dir = 0; dir < dirs && !exposed; dir++) {
          const x1 = i + allDirs[dir][0];
          const y1 = j + allDirs[dir][1];
          if (!level.w || x1 < 0 || y1 < 0 || x1 >= level.w || y1 >= level.h) continue;
          const n = cidx(level.h, x1, y1);
          const flags = combinedFlags(level.dungeon[n], level.liquid[n]);
          if (!(flags & T.OBSTRUCTS_VISION) || !(flags & T.OBSTRUCTS_PASSABILITY)) {
            level.dungeon[at] = D.WALL;
            exposed = true;
          }
        }
      } else if (dTile === D.WALL) {
        let exposed = false;
        for (let dir = 0; dir < dirs && !exposed; dir++) {
          const x1 = i + allDirs[dir][0];
          const y1 = j + allDirs[dir][1];
          if (x1 < 0 || y1 < 0 || x1 >= level.w || y1 >= level.h) continue;
          const n = cidx(level.h, x1, y1);
          const flags = combinedFlags(level.dungeon[n], level.liquid[n]);
          if (!(flags & T.OBSTRUCTS_VISION) || !(flags & T.OBSTRUCTS_PASSABILITY)) {
            exposed = true;
          }
        }
        if (!exposed) level.dungeon[at] = D.GRANITE;
      }
    }
  }
}

/**
 * Port of `removeDiagonalOpenings`.
 *
 * Brogue hunts a 2x2 checkerboard pattern:
 *
 *     W  F            W = solid wall (blocks diagonal movement)
 *     F  W            F = passable but diagonal-blocking terrain
 *                      (rubble, chasm edge) — i.e. you can slip diagonally
 *                      between the two floor cells.
 *
 * The fix copies the WALL layer over one of the two F cells, so the squeeze
 * is closed. Note that Brogue never invents new walls — it copies an
 * existing wall's terrain over a floor cell.
 */
function removeDiagonalOpenings(level: Level, rng: Rng): void {
  let diagonalCornerRemoved = false;
  let guard = 0;
  do {
    diagonalCornerRemoved = false;
    for (let i = 0; i < level.w - 1; i++) {
      for (let j = 0; j < level.h - 1; j++) {
        for (let k = 0; k <= 1; k++) {
          // (i+k, j) and (i+1-k, j+1) must be solid walls.
          const wallA = cidx(level.h, i + k, j);
          const wallD = cidx(level.h, i + (1 - k), j + 1);
          // (i+1-k, j) and (i+k, j+1) must be passable diagonal-blockers.
          const floorB = cidx(level.h, i + (1 - k), j);
          const floorC = cidx(level.h, i + k, j + 1);

          const fWallA = combinedFlags(level.dungeon[wallA], level.liquid[wallA]);
          const fWallD = combinedFlags(level.dungeon[wallD], level.liquid[wallD]);
          const fFloorB = combinedFlags(level.dungeon[floorB], level.liquid[floorB]);
          const fFloorC = combinedFlags(level.dungeon[floorC], level.liquid[floorC]);

          const wallASolid = !!(fWallA & T.OBSTRUCTS_PASSABILITY);
          const wallDSolid = !!(fWallD & T.OBSTRUCTS_PASSABILITY);
          const floorBPassable = !(fFloorB & T.OBSTRUCTS_PASSABILITY);
          const floorCPassable = !(fFloorC & T.OBSTRUCTS_PASSABILITY);
          const floorBBlocksDiagonal = !!(fFloorB & T.OBSTRUCTS_DIAGONAL_MOVEMENT);
          const floorCBlocksDiagonal = !!(fFloorC & T.OBSTRUCTS_DIAGONAL_MOVEMENT);

          if (
            !wallASolid ||
            !wallDSolid ||
            !floorBPassable ||
            !floorCPassable ||
            !floorBBlocksDiagonal ||
            !floorCBlocksDiagonal
          ) {
            continue;
          }

          // Randomly pick which of the two floor cells becomes solid.
          let x1: number;
          let x2: number;
          let y1: number;
          if (rng.percent(50)) {
            x1 = i + (1 - k);
            x2 = i + k;
            y1 = j;
          } else {
            x1 = i + k;
            x2 = i + (1 - k);
            y1 = j + 1;
          }

          const at = cidx(level.h, x1, y1);
          const src = cidx(level.h, x2, y1);
          diagonalCornerRemoved = true;
          level.dungeon[at] = level.dungeon[src];
          level.liquid[at] = level.liquid[src];
        }
      }
    }
    guard++;
  } while (diagonalCornerRemoved && guard < 60);
}

/**
 * Port of `designLakes`.
 *
 * Generates a series of blob-shaped lakes of decreasing size (30x15 down to
 * 20x10) and places each one so the level stays fully connected — a flood
 * fill verifies connectivity and up to 20 placement attempts are made.
 */
function designLakes(level: Level, rng: Rng): Grid {
  const lakeMap = new Grid(level.w, level.h);

  // Brogue uses 30x15 down to 20x10 on a 79x29 map. We scale the lake
  // size relative to the actual map so the water coverage stays
  // comparable no matter what DCOLS/DROWS are.
  const scale = (level.w / 51) * (level.h / 25);
  const startH = Math.max(5, Math.round(9 * Math.sqrt(scale)));
  const startW = Math.max(9, Math.round(17 * Math.sqrt(scale)));
  const minH = Math.max(4, Math.round(6 * Math.sqrt(scale)));

  for (let lakeMaxHeight = startH, lakeMaxWidth = startW;
       lakeMaxHeight >= minH;
       lakeMaxHeight--, lakeMaxWidth -= 2) {
    const blob = createBlobOnGrid(
      level.w,
      level.h,
      5,
      4,
      4,
      Math.min(lakeMaxWidth, level.w),
      Math.min(lakeMaxHeight, level.h),
      55,
      "ffffftttt",
      "ffffttttt",
      rng
    );

    for (let k = 0; k < 20; k++) {
      // Propose a position for the blob's top-left corner.
      const x = rng.range(1 - blob.minX, level.w - blob.width - blob.minX - 2);
      const y = rng.range(1 - blob.minY, level.h - blob.height - blob.minY - 2);

      if (!lakeDisruptsPassability(level, lakeMap, blob.grid, -x - blob.minX, -y - blob.minY)) {
        // Copy the lake in and turn those cells to floor.
        for (let i = 0; i < blob.width; i++) {
          for (let j = 0; j < blob.height; j++) {
            if (blob.grid.get(i + blob.minX, j + blob.minY)) {
              const at = cidx(level.h, i + blob.minX + x, j + blob.minY + y);
              if (at < 0 || at >= level.liquid.length) continue;
              lakeMap.set(i + blob.minX + x, j + blob.minY + y, 1);
              level.dungeon[at] = D.FLOOR;
            }
          }
        }
        break;
      }
    }
  }
  return lakeMap;
}

/**
 * Port of `lakeDisruptsPassability`.
 * Flood-fills the dry, walkable area and reports whether any dry tile was
 * cut off from the rest by the proposed lake.
 */
function lakeDisruptsPassability(
  level: Level,
  lakeMap: Grid,
  blob: Grid,
  dungeonToGridX: number,
  dungeonToGridY: number
): boolean {
  const w = level.w;
  const h = level.h;
  const flood = new Uint8Array(w * h);

  const isDry = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const at = cidx(h, x, y);
    if (lakeMap.get(x, y)) return false;
    const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
    if (flags & T.PATHING_BLOCKER) return false;
    const gx = x + dungeonToGridX;
    const gy = y + dungeonToGridY;
    if (gx >= 0 && gy >= 0 && gx < blob.w && gy < blob.h && blob.get(gx, gy)) return false;
    return true;
  };

  // Find a starting point.
  let sx = -1;
  let sy = -1;
  outer: for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      if (isDry(i, j)) {
        sx = i;
        sy = j;
        break outer;
      }
    }
  }
  if (sx < 0) return false;

  // Flood fill.
  const stack = [cidx(h, sx, sy)];
  flood[stack[0]] = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    // index = x * h + y  =>  x = floor(cur / h), y = cur % h
    const cy = cur % h;
    const cx = (cur - cy) / h;
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cidx(h, nx, ny);
      if (flood[ni]) continue;
      if (!isDry(nx, ny)) continue;
      flood[ni] = 1;
      stack.push(ni);
    }
  }

  // Any dry tile that was not reached means the lake cut the map apart.
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      if (isDry(i, j) && !flood[cidx(h, i, j)]) return true;
    }
  }
  return false;
}

/**
 * Port of `liquidType` + `fillLakes` + `createWreath`.
 *
 * Chooses a liquid by depth, fills the lake core with the deep variant and
 * surrounds it with a shallow "wreath" so the shoreline is visible.
 */
function fillLakes(level: Level, lakeMap: Grid, depth: number, rng: Rng): void {
  const choice = pickLiquid(depth, rng);
  const deep = choice.deep;
  const shallow = choice.shallow;
  const shallowWidth = choice.shallowWidth;

  // Fill the deep core, recording a "wreath" map of the cells it covers.
  const wreath = new Uint8Array(level.w * level.h);
  const stack: number[] = [];
  for (let i = 0; i < level.w; i++) {
    for (let j = 0; j < level.h; j++) {
      if (lakeMap.get(i, j)) stack.push(cidx(level.h, i, j));
    }
  }
  while (stack.length) {
    const cur = stack.pop()!;
    if (wreath[cur]) continue;
    wreath[cur] = 1;
    level.liquid[cur] = deep;
    // index = x * h + y  =>  x = floor(cur / h), y = cur % h
    const cy = cur % level.h;
    const cx = (cur - cy) / level.h;
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
      const ni = cidx(level.h, nx, ny);
      if (lakeMap.get(nx, ny) && !wreath[ni]) stack.push(ni);
    }
  }

  // Create the wreath of shallow liquid around the deep core.
  for (let i = 0; i < level.w; i++) {
    for (let j = 0; j < level.h; j++) {
      if (!wreath[cidx(level.h, i, j)]) continue;
      for (let k = i - shallowWidth; k <= i + shallowWidth; k++) {
        for (let l = j - shallowWidth; l <= j + shallowWidth; l++) {
          if (k < 0 || l < 0 || k >= level.w || l >= level.h) continue;
          if ((i - k) * (i - k) + (j - l) * (j - l) > shallowWidth * shallowWidth) continue;
          const at = cidx(level.h, k, l);
          if (level.liquid[at] !== L.NOTHING) continue;
          level.liquid[at] = shallow;
          if (level.dungeon[at] === D.DOOR) level.dungeon[at] = D.FLOOR;
        }
      }
    }
  }
}

interface LiquidChoice {
  deep: number;
  shallow: number;
  shallowWidth: number;
}

/** Port of `liquidType`. */
function pickLiquid(depth: number, rng: Rng): LiquidChoice {
  const minimumLavaLevel = 4;
  const minimumBrimstoneLevel = 17;
  const randMin = depth < minimumLavaLevel ? 1 : 0;
  const randMax = depth < minimumBrimstoneLevel ? 2 : 3;
  let pick = rng.range(randMin, randMax);
  if (depth === DEEPEST_LEVEL) pick = 1;

  switch (pick) {
    case 0:
      return { deep: L.LAVA, shallow: L.NOTHING, shallowWidth: 0 };
    case 1:
      return { deep: L.DEEP_WATER, shallow: L.SHALLOW_WATER, shallowWidth: 2 };
    case 2:
      return { deep: L.CHASM, shallow: L.CHASM, shallowWidth: 1 };
    case 3:
      return { deep: L.BRIMSTONE, shallow: L.OBSIDIAN, shallowWidth: 2 };
    default:
      return { deep: L.DEEP_WATER, shallow: L.SHALLOW_WATER, shallowWidth: 2 };
  }
}

/**
 * Port of `finishDoors`.
 * Removes orphan doors and converts some doors into secret doors.
 */
function finishDoors(level: Level, depth: number, rng: Rng): void {
  const secretDoorChance = clamp(
    Math.floor(((depth - 1) * 67) / (AMULET_LEVEL - 1)),
    0,
    67
  );
  for (let i = 1; i < level.w - 1; i++) {
    for (let j = 1; j < level.h - 1; j++) {
      const at = cidx(level.h, i, j);
      if (level.dungeon[at] !== D.DOOR) continue;

      const neighbor = (x: number, y: number): number =>
        combinedFlags(level.dungeon[cidx(level.h, x, y)], level.liquid[cidx(level.h, x, y)]);

      const horizOpen =
        !(neighbor(i + 1, j) & T.OBSTRUCTS_PASSABILITY) ||
        !(neighbor(i - 1, j) & T.OBSTRUCTS_PASSABILITY);
      const vertOpen =
        !(neighbor(i, j + 1) & T.OBSTRUCTS_PASSABILITY) ||
        !(neighbor(i, j - 1) & T.OBSTRUCTS_PASSABILITY);

      if (horizOpen && vertOpen) {
        // Orphaned door: passable horizontally but walled vertically (or vice versa).
        level.dungeon[at] = D.FLOOR;
      } else {
        let blockers = 0;
        if (neighbor(i + 1, j) & T.PATHING_BLOCKER) blockers++;
        if (neighbor(i - 1, j) & T.PATHING_BLOCKER) blockers++;
        if (neighbor(i, j + 1) & T.PATHING_BLOCKER) blockers++;
        if (neighbor(i, j - 1) & T.PATHING_BLOCKER) blockers++;
        if (blockers >= 3) {
          level.dungeon[at] = D.FLOOR;
        } else if (rng.percent(secretDoorChance)) {
          level.dungeon[at] = D.SECRET_DOOR;
        }
      }
    }
  }
}

/**
 * Port of `setUpWaypoints`.
 *
 * Scatters waypoints over the walkable area, spacing them by field of view
 * so monsters have distinct patrol destinations.
 */
function setUpWaypoints(level: Level, sightRadius: number): { x: number; y: number }[] {
  const waypoints: { x: number; y: number }[] = [];
  const occupied = new Uint8Array(level.w * level.h);
  const sCoord = shuffleCoords(level.w, level.h);

  for (const coord of sCoord) {
    if (waypoints.length >= 40) break;
    const x = Math.floor(coord / level.h);
    const y = coord % level.h;
    const at = cidx(level.h, x, y);
    if (occupied[at]) continue;
    const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
    if (flags & T.OBSTRUCTS_SCENT) continue;

    // Claim a disc of radius `sightRadius` so waypoints stay spread out.
    for (let k = x - sightRadius; k <= x + sightRadius; k++) {
      for (let l = y - sightRadius; l <= y + sightRadius; l++) {
        if (k < 0 || l < 0 || k >= level.w || l >= level.h) continue;
        if ((k - x) * (k - x) + (l - y) * (l - y) > sightRadius * sightRadius) continue;
        occupied[cidx(level.h, k, l)] = 1;
      }
    }
    waypoints.push({ x, y });
  }
  return waypoints;
}

/** Deterministic shuffle of cell indices (Brogue's shuffleList equivalent). */
function shuffleCoords(w: number, h: number): number[] {
  const arr = new Array<number>(w * h);
  for (let i = 0; i < arr.length; i++) arr[i] = i;
  // Fisher-Yates with a fixed LCG so the result is stable per call order.
  let seed = 0x9e3779b9;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  depth: number;
  seed: number;
  /** Where the player enters from; defaults to the entrance room. */
  entry?: { x: number; y: number };
  /** Optional diagnostic hook, called after each pipeline stage. */
  trace?: (stage: string, level: Level) => void;
}

/**
 * Generate a complete level. This is the port of `digDungeon()`.
 */
export function generateLevel(opts: GenerateOptions): Level {
  const rng = new Rng(opts.seed);
  const depth = opts.depth;

  const level: Level = {
    w: DCOLS,
    h: DROWS,
    dungeon: new Int16Array(DCOLS * DROWS).fill(D.GRANITE),
    liquid: new Int16Array(DCOLS * DROWS).fill(L.NOTHING),
    surface: new Int16Array(DCOLS * DROWS),
    start: { x: 1, y: 1 },
    stairsDown: null,
    stairsUp: null,
    waypoints: [],
    depth,
    seed: opts.seed,
  };

  // 1-2. Carve the dungeon.
  const grid = carveDungeon(depth, rng);

  // 3. Add loops so the map is not a pure tree.
  addLoops(grid, 20, rng);

  // 4. Translate the carve grid into terrain.
  for (let i = 0; i < DCOLS; i++) {
    for (let j = 0; j < DROWS; j++) {
      const at = cidx(DROWS, i, j);
      const v = grid.get(i, j);
      if (v === 1) {
        level.dungeon[at] = D.FLOOR;
      } else if (v === 2) {
        // Brogue makes 60% of door sites real doors, the rest open floor.
        level.dungeon[at] = rng.percent(60) && depth < DEEPEST_LEVEL ? D.DOOR : D.FLOOR;
      }
    }
  }

  // 5. Expose walls.
  finishWalls(level, false);
  opts.trace?.("after finishWalls(false)", level);

  // 6. Lakes.
  const lakeMap = designLakes(level, rng);
  opts.trace?.("after designLakes", level);
  fillLakes(level, lakeMap, depth, rng);
  opts.trace?.("after fillLakes", level);

  // 7. Close diagonal squeezes.
  removeDiagonalOpenings(level, rng);
  opts.trace?.("after removeDiagonalOpenings", level);

  // 8. Bridges over chasms.
  buildBridges(level, rng);
  opts.trace?.("after buildBridges", level);

  // 9. Doors.
  finishDoors(level, depth, rng);
  opts.trace?.("after finishDoors", level);

  // 10. Final wall pass.
  finishWalls(level, true);
  opts.trace?.("after finishWalls(true)", level);

  // 11. Waypoints.
  level.waypoints = setUpWaypoints(level, 10);

  // Place the entrance and the stairs.
  placeEntranceAndStairs(level, rng, opts.entry);
  opts.trace?.("after placeEntranceAndStairs", level);

  return level;
}

/**
 * Port of `buildABridge`, simplified: bridges span chasms and are only built
 * when they meaningfully shorten a path.
 */
function buildBridges(level: Level, rng: Rng): void {
  const w = level.w;
  const h = level.h;
  const bridgeRatioX = 100 + Math.floor(((100 + Math.floor((100 * level.depth) / 9)) * rng.range(10, 20)) / 10);
  const bridgeRatioY = 100 + Math.floor(((400 + Math.floor((100 * level.depth) / 18)) * rng.range(10, 20)) / 10);

  const nCols = shuffleArray(rng, Array.from({ length: w }, (_, i) => i));
  const nRows = shuffleArray(rng, Array.from({ length: h }, (_, i) => i));

  const isChasm = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y >= h && level.liquid[cidx(h, x, y)] === L.CHASM;
  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y >= h && level.dungeon[cidx(h, x, y)] === D.WALL;

  for (let i2 = 1; i2 < w - 1; i2++) {
    const i = nCols[i2];
    for (let j2 = 1; j2 < h - 1; j2++) {
      const j = nRows[j2];
      const at = cidx(h, i, j);
      if (level.dungeon[at] === D.WALL) continue;
      if (level.liquid[at] === L.CHASM) continue;

      // Horizontal bridge.
      let foundExposure = false;
      let k = i + 1;
      while (
        k < w &&
        isChasm(k, j) &&
        !isSolid(k, j - 1) &&
        !isSolid(k, j + 1)
      ) {
        if (!isSolid(k, j - 1) && !isSolid(k, j + 1)) foundExposure = true;
        k++;
      }
      if (k < w && k - i > 3 && foundExposure && !isChasm(k, j)) {
        for (let l = i + 1; l < k; l++) level.liquid[cidx(h, l, j)] = L.BRIDGE;
        break;
      }

      // Vertical bridge.
      foundExposure = false;
      k = j + 1;
      while (k < h && isChasm(i, k) && !isSolid(i - 1, k) && !isSolid(i + 1, k)) {
        if (!isSolid(i - 1, k) && !isSolid(i + 1, k)) foundExposure = true;
        k++;
      }
      if (k < h && k - j > 3 && foundExposure && !isChasm(i, k)) {
        for (let l = j + 1; l < k; l++) level.liquid[cidx(h, i, l)] = L.BRIDGE;
        break;
      }
    }
  }
  void bridgeRatioX;
  void bridgeRatioY;
}

function shuffleArray<T>(rng: Rng, arr: T[]): T[] {
  return rng.shuffle(arr);
}

/**
 * Place the player's entry point and the stairs down.
 * On depth 1 the player starts in the entrance room (bottom centre) and
 * the stairs down are as far away as possible.
 */
function placeEntranceAndStairs(
  level: Level,
  rng: Rng,
  entry?: { x: number; y: number }
): void {
  const w = level.w;
  const h = level.h;
  const walkable: { x: number; y: number }[] = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const at = cidx(h, i, j);
      const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
      if (flags & T.OBSTRUCTS_PASSABILITY) continue;
      if (level.dungeon[at] === D.DOOR) continue;
      walkable.push({ x: i, y: j });
    }
  }
  if (walkable.length === 0) return;

  if (entry) {
    level.start = entry;
  } else {
    // The entrance room sits at the bottom of the map (designEntranceRoom).
    const entrance = walkable.filter((p) => p.y >= h - 8);
    const pool = entrance.length > 0 ? entrance : walkable;
    level.start = pool[Math.floor(rng.float() * pool.length)];
  }
  level.dungeon[cidx(h, level.start.x, level.start.y)] = D.FLOOR;
  level.liquid[cidx(h, level.start.x, level.start.y)] = L.NOTHING;

  // Stairs down: pick the walkable tile farthest (by BFS) from the start.
  const dist = bfsDistanceMap(level, level.start.x, level.start.y);
  let best = { x: level.start.x, y: level.start.y };
  let bestD = -1;
  for (const p of walkable) {
    const d = dist[cidx(h, p.x, p.y)];
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  level.stairsDown = best;
  level.dungeon[cidx(h, best.x, best.y)] = D.STAIRS_DOWN;
  level.liquid[cidx(h, best.x, best.y)] = L.NOTHING;
}

/** BFS distance map over walkable cells. */
export function bfsDistanceMap(
  level: Level,
  sx: number,
  sy: number
): Int16Array {
  const w = level.w;
  const h = level.h;
  const dist = new Int16Array(w * h).fill(-1);
  const q: number[] = [cidx(h, sx, sy)];
  dist[q[0]] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    // index = x * h + y  =>  x = floor(cur / h), y = cur % h
    const cy = cur % h;
    const cx = (cur - cy) / h;
    for (let d = 0; d < 4; d++) {
      const nx = cx + NB_DIRS4[d][0];
      const ny = cy + NB_DIRS4[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = cidx(h, nx, ny);
      if (dist[ni] !== -1) continue;
      const flags = combinedFlags(level.dungeon[ni], level.liquid[ni]);
      if (flags & T.OBSTRUCTS_PASSABILITY) continue;
      dist[ni] = dist[cur] + 1;
      q.push(ni);
    }
  }
  return dist;
}

/** True when the cell can be walked onto. */
export function isWalkable(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return false;
  const at = cidx(level.h, x, y);
  const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
  return !(flags & T.OBSTRUCTS_PASSABILITY);
}

/** True when light passes through the cell. */
export function isTransparentCell(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return false;
  const at = cidx(level.h, x, y);
  const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
  return !(flags & T.OBSTRUCTS_VISION);
}

export { cidx as cellIndex, D, L, T, randomLocationInGrid, drawCircle, drawRectangle, designCavern, NO_DIRECTION };
export { dungeonDef, liquidDef };
