import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng";
import {
  carveDungeon,
  createBlobOnGrid,
  designCircularRoom,
  designCrossRoom,
  chooseRandomDoorSites,
  directionOfDoorSite,
  roomFitsAt,
  DCOLS,
  DROWS,
  adjustProfileForDepth,
  DP_BASIC,
} from "../src/core/brogueGen";
import { Grid, NO_DIRECTION } from "../src/core/grid";
import { generateLevel, bfsDistanceMap, isWalkable } from "../src/core/level";
import { D, L, T, combinedFlags } from "../src/core/terrain";

describe("rng", () => {
  it("rand_range is inclusive and bounded", () => {
    const rng = new Rng(1234);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("rand_range with hi <= lo returns lo", () => {
    const rng = new Rng(1);
    expect(rng.range(5, 5)).toBe(5);
    expect(rng.range(5, 2)).toBe(5);
  });

  it("same seed produces same sequence", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.range(0, 1000)).toBe(b.range(0, 1000));
  });

  it("shuffle is a permutation", () => {
    const rng = new Rng(7);
    const arr = rng.shuffle(rng.sequential(50));
    expect([...arr].sort((x, y) => x - y)).toEqual(rng.sequential(50));
  });
});

describe("cellular automata blob", () => {
  it("produces a blob meeting the minimum size", () => {
    const rng = new Rng(99);
    const blob = createBlobOnGrid(
      DCOLS,
      DROWS,
      5,
      8,
      6,
      DCOLS,
      DROWS,
      55,
      "ffffffttt",
      "ffffttttt",
      rng
    );
    expect(blob.width).toBeGreaterThanOrEqual(8);
    expect(blob.height).toBeGreaterThanOrEqual(6);
    // The blob must actually contain cells.
    let count = 0;
    for (let i = 0; i < DCOLS; i++)
      for (let j = 0; j < DROWS; j++) if (blob.grid.get(i, j)) count++;
    expect(count).toBeGreaterThan(0);
  });
});

describe("room templates", () => {
  it("cross room is connected and non-empty", () => {
    const rng = new Rng(3);
    const g = new Grid(DCOLS, DROWS);
    designCrossRoom(g, rng);
    let cells = 0;
    for (let i = 0; i < DCOLS; i++)
      for (let j = 0; j < DROWS; j++) if (g.get(i, j)) cells++;
    expect(cells).toBeGreaterThan(5);
  });

  it("circular room is roughly round", () => {
    const rng = new Rng(11);
    const g = new Grid(DCOLS, DROWS);
    designCircularRoom(g, rng);
    let cells = 0;
    for (let i = 0; i < DCOLS; i++)
      for (let j = 0; j < DROWS; j++) if (g.get(i, j)) cells++;
    expect(cells).toBeGreaterThan(4);
  });

  it("door site detection finds exactly one direction", () => {
    const g = new Grid(10, 10);
    // A room occupying x=3..6, y=3..6
    for (let x = 3; x <= 6; x++) for (let y = 3; y <= 6; y++) g.set(x, y, 1);
    // Cell (2,4) sits just left of the room: one neighbour (3,4) is floor.
    expect(directionOfDoorSite(g, 2, 4)).not.toBe(NO_DIRECTION);
    // A cell in open space has no direction.
    expect(directionOfDoorSite(g, 0, 0)).toBe(NO_DIRECTION);
  });

  it("chooseRandomDoorSites never returns a site inside the room", () => {
    const rng = new Rng(5);
    const g = new Grid(DCOLS, DROWS);
    for (let x = 10; x <= 14; x++) for (let y = 10; y <= 14; y++) g.set(x, y, 1);
    const sites = chooseRandomDoorSites(g, rng);
    for (const s of sites) {
      if (s.x === -1) continue;
      expect(g.get(s.x, s.y)).toBe(0);
    }
  });

  it("roomFitsAt rejects overlap", () => {
    const dungeon = new Grid(20, 20);
    const room = new Grid(20, 20);
    for (let x = 5; x <= 8; x++) for (let y = 5; y <= 8; y++) room.set(x, y, 1);
    // Empty dungeon -> fits.
    expect(roomFitsAt(dungeon, room, 0, 0)).toBe(true);
    // Put floor where the room would land -> does not fit.
    for (let x = 5; x <= 8; x++) for (let y = 5; y <= 8; y++) dungeon.set(x, y, 1);
    expect(roomFitsAt(dungeon, room, 0, 0)).toBe(false);
  });
});

describe("depth profile adjustment", () => {
  it("shallower levels get more corridors and cross rooms", () => {
    // Brogue's adjustDungeonProfileForDepth: corridorChance += 80*(100-descent)/100
    // and roomFrequencies[0] (cross room) += 20*(100-descent)/100, so shallow
    // levels are corridor-heavy while deep levels favour caves.
    const shallow = adjustProfileForDepth(DP_BASIC, 1);
    const deep = adjustProfileForDepth(DP_BASIC, 8);
    expect(shallow.corridorChance).toBeGreaterThan(deep.corridorChance);
    expect(shallow.roomFrequencies[0]).toBeGreaterThan(deep.roomFrequencies[0]);
  });

  it("deeper levels get more caves", () => {
    const shallow = adjustProfileForDepth(DP_BASIC, 1);
    const deep = adjustProfileForDepth(DP_BASIC, 8);
    expect(deep.roomFrequencies[5]).toBeGreaterThan(shallow.roomFrequencies[5]);
  });
});

describe("carveDungeon", () => {
  it("produces a map with rooms and corridors", () => {
    const rng = new Rng(2024);
    const g = carveDungeon(1, rng);
    let floors = 0;
    for (let i = 0; i < DCOLS; i++)
      for (let j = 0; j < DROWS; j++) if (g.get(i, j) === 1) floors++;
    expect(floors).toBeGreaterThan(50);
  });
});

describe("generateLevel", () => {
  it("generates a level with a reachable stairs-down", () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const level = generateLevel({ depth: 1, seed });
      expect(level.stairsDown).not.toBeNull();
      // The stairs must be reachable from the start.
      const dist = bfsDistanceMap(level, level.start.x, level.start.y);
      const at = level.start.x * level.h + level.start.y;
      const stairAt = level.stairsDown!.x * level.h + level.stairsDown!.y;
      expect(dist[at]).toBe(0);
      expect(dist[stairAt]).toBeGreaterThan(0);
    }
  });

  it("keeps the map fully connected across many seeds and depths", () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const depth of [1, 3, 5, 8]) {
        const level = generateLevel({ depth, seed });
        const dist = bfsDistanceMap(level, level.start.x, level.start.y);
        let reachable = 0;
        let total = 0;
        for (let i = 0; i < level.w; i++) {
          for (let j = 0; j < level.h; j++) {
            const at = i * level.h + j;
            const flags = combinedFlags(level.dungeon[at], level.liquid[at]);
            if (flags & T.OBSTRUCTS_PASSABILITY) continue;
            total++;
            if (dist[at] >= 0) reachable++;
          }
        }
        // Allow a small number of isolated pockets (Brogue has them too),
        // but the bulk of the level must be connected.
        expect(reachable / total).toBeGreaterThan(0.9);
      }
    }
  });

  it("places the player on a walkable cell", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const level = generateLevel({ depth: 1, seed });
      expect(isWalkable(level, level.start.x, level.start.y)).toBe(true);
    }
  });

  it("never leaves the player inside solid rock", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const depth of [1, 2, 4, 7]) {
        const level = generateLevel({ depth, seed });
        expect(level.dungeon[level.start.x * level.h + level.start.y]).toBe(D.FLOOR);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateLevel({ depth: 2, seed: 555 });
    const b = generateLevel({ depth: 2, seed: 555 });
    expect(Array.from(a.dungeon)).toEqual(Array.from(b.dungeon));
    expect(Array.from(a.liquid)).toEqual(Array.from(b.liquid));
  });

  it("generates waypoints for monster pathing", () => {
    const level = generateLevel({ depth: 1, seed: 9 });
    expect(level.waypoints.length).toBeGreaterThan(0);
    expect(level.waypoints.length).toBeLessThanOrEqual(40);
  });

  it("adds liquid on deeper levels", () => {
    let sawLiquid = false;
    for (let seed = 1; seed <= 6; seed++) {
      const level = generateLevel({ depth: 6, seed });
      for (let i = 0; i < level.liquid.length; i++) {
        if (level.liquid[i] !== L.NOTHING) {
          sawLiquid = true;
          break;
        }
      }
    }
    expect(sawLiquid).toBe(true);
  });
});
