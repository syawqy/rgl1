/**
 * terrain.ts — layered terrain model, ported from BrogueCE.
 *
 * Brogue's map is *layered*: every cell has a DUNGEON layer (granite, floor,
 * wall, door), a LIQUID layer (water, lava, chasm, bridge) and a SURFACE
 * layer (rubble, blood, webs). Terrain flags are OR-ed across layers, so a
 * floor tile under deep water becomes impassable.
 *
 * We keep that model because the ported generator (finishWalls,
 * removeDiagonalOpenings, pathing) depends on the flag semantics.
 */

/** Terrain flag bits. Mirrors Brogue's T_* flags in Rogue.h. */
export const T = {
  /** Blocks movement. */
  OBSTRUCTS_PASSABILITY: 1 << 0,
  /** Blocks line of sight. */
  OBSTRUCTS_VISION: 1 << 1,
  /** Blocks scent propagation (waypoint placement uses this). */
  OBSTRUCTS_SCENT: 1 << 2,
  /** Blocks pathing even if passable (e.g. rubble). */
  PATHING_BLOCKER: 1 << 3,
  /** Diagonal movement through this tile is disallowed. */
  OBSTRUCTS_DIAGONAL_MOVEMENT: 1 << 4,
  /** Can be bridged over (chasms). */
  CAN_BE_BRIDGED: 1 << 5,
  /** Deep water / lava / chasm: deadly or very slow. */
  IS_DEEP: 1 << 6,
  /** Shallow water: wadeable at a cost. */
  IS_SHALLOW: 1 << 7,
  /** Lava: instant death. */
  IS_LAVA: 1 << 8,
  /** Chasm: instant death. */
  IS_CHASM: 1 << 9,
  /** Stairs down. */
  STAIRS_DOWN: 1 << 10,
  /** Stairs up. */
  STAIRS_UP: 1 << 11,
  /** Items may spawn here. */
  GENERATES_ITEMS: 1 << 12,
  /** Monsters may spawn here. */
  GENERATES_MONSTERS: 1 << 13,
  /** Emits light. */
  LIGHT_SOURCE: 1 << 14,
} as const;

/* ------------------------------------------------------------------ */
/* DUNGEON layer                                                       */
/* ------------------------------------------------------------------ */

export const D = {
  GRANITE: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  SECRET_DOOR: 4,
  STAIRS_UP: 5,
  STAIRS_DOWN: 6,
  GATE: 7,
  ALTAR: 8,
} as const;

export interface LayerDef {
  id: number;
  name: string;
  flags: number;
  color: number;
  /** movement cost; Infinity = impassable */
  cost: number;
  /** true when a creature can stand here */
  passable: boolean;
  /** true when sight passes through */
  transparent: boolean;
}

const DUNGEON_DEFS: LayerDef[] = [];

function ddef(
  id: number,
  name: string,
  flags: number,
  color: number,
  cost: number,
  passable: boolean,
  transparent: boolean
): void {
  DUNGEON_DEFS[id] = { id, name, flags, color, cost, passable, transparent };
}

ddef(D.GRANITE, "granite", T.OBSTRUCTS_PASSABILITY | T.OBSTRUCTS_VISION | T.OBSTRUCTS_SCENT | T.PATHING_BLOCKER | T.OBSTRUCTS_DIAGONAL_MOVEMENT, 0x0a0a0f, Infinity, false, false);
ddef(D.FLOOR, "floor", T.GENERATES_ITEMS | T.GENERATES_MONSTERS, 0x3a3a48, 1, true, true);
ddef(D.WALL, "wall", T.OBSTRUCTS_PASSABILITY | T.OBSTRUCTS_VISION | T.OBSTRUCTS_SCENT | T.PATHING_BLOCKER | T.OBSTRUCTS_DIAGONAL_MOVEMENT, 0x1e1e2a, Infinity, false, false);
ddef(D.DOOR, "door", T.GENERATES_ITEMS | T.GENERATES_MONSTERS | T.LIGHT_SOURCE, 0x7a5330, 1, true, true);
ddef(D.SECRET_DOOR, "secret door", T.GENERATES_ITEMS | T.GENERATES_MONSTERS, 0x6b4a2b, 1, true, true);
ddef(D.STAIRS_UP, "stairs up", T.STAIRS_UP | T.GENERATES_ITEMS | T.GENERATES_MONSTERS, 0x8a8a9a, 1, true, true);
ddef(D.STAIRS_DOWN, "stairs down", T.STAIRS_DOWN | T.GENERATES_ITEMS | T.GENERATES_MONSTERS, 0xa07a4f, 1, true, true);
ddef(D.GATE, "gate", T.OBSTRUCTS_PASSABILITY | T.OBSTRUCTS_VISION | T.OBSTRUCTS_SCENT | T.PATHING_BLOCKER | T.OBSTRUCTS_DIAGONAL_MOVEMENT, 0x33333f, Infinity, false, false);
ddef(D.ALTAR, "altar", T.GENERATES_ITEMS, 0x5a4a6a, 1, true, true);

/* ------------------------------------------------------------------ */
/* LIQUID layer                                                        */
/* ------------------------------------------------------------------ */

export const L = {
  NOTHING: 0,
  SHALLOW_WATER: 1,
  DEEP_WATER: 2,
  LAVA: 3,
  CHASM: 4,
  CHASM_EDGE: 8,
  BRIDGE: 5,
  OBSIDIAN: 6,
  BRIMSTONE: 7,
} as const;

const LIQUID_DEFS: LayerDef[] = [];

function ldef(
  id: number,
  name: string,
  flags: number,
  color: number,
  cost: number,
  passable: boolean,
  transparent: boolean
): void {
  LIQUID_DEFS[id] = { id, name, flags, color, cost, passable, transparent };
}

ldef(L.NOTHING, "nothing", 0, 0x000000, 1, true, true);
ldef(L.SHALLOW_WATER, "shallow water", T.IS_SHALLOW, 0x2a4a6a, 2, true, true);
ldef(L.DEEP_WATER, "deep water", T.IS_DEEP, 0x16324a, 3, true, true);
ldef(L.LAVA, "lava", T.IS_LAVA | T.LIGHT_SOURCE, 0xd04a20, 1, true, true);
ldef(L.CHASM, "chasm", T.IS_CHASM | T.CAN_BE_BRIDGED, 0x0d0d14, 1, true, true);
// Brogue's CHASM_EDGE has NO terrain flags: it is walkable ground at the
// lip of a chasm. Without it, a chasm lake becomes an impassable blob.
ldef(L.CHASM_EDGE, "chasm edge", T.IS_CHASM, 0x1a1a24, 1, true, true);
ldef(L.BRIDGE, "bridge", 0, 0x7a5a38, 1, true, true);
ldef(L.OBSIDIAN, "obsidian", T.OBSTRUCTS_PASSABILITY | T.PATHING_BLOCKER, 0x241830, Infinity, false, true);
ldef(L.BRIMSTONE, "inert brimstone", T.OBSTRUCTS_PASSABILITY | T.PATHING_BLOCKER, 0x8a6a20, Infinity, false, true);

/* ------------------------------------------------------------------ */
/* SURFACE layer (cosmetic)                                            */
/* ------------------------------------------------------------------ */

export const S = {
  NOTHING: 0,
  RUBBLE: 1,
  BLOOD: 2,
  GRASS: 3,
  WEB: 4,
} as const;

const SURFACE_COLORS = [0x000000, 0x4a4a52, 0x6a1a1a, 0x2f5a35, 0xb0b0c0];

export const dungeonDef = (id: number): LayerDef => DUNGEON_DEFS[id] ?? DUNGEON_DEFS[D.FLOOR];
export const liquidDef = (id: number): LayerDef => LIQUID_DEFS[id] ?? LIQUID_DEFS[L.NOTHING];
export const surfaceColor = (id: number): number => SURFACE_COLORS[id] ?? 0x000000;

/* ------------------------------------------------------------------ */
/* Combined helpers                                                    */
/* ------------------------------------------------------------------ */

/** OR of the dungeon + liquid layer flags for a cell. */
export function combinedFlags(dungeonTile: number, liquidTile: number): number {
  return dungeonDef(dungeonTile).flags | liquidDef(liquidTile).flags;
}

export function isPassable(dungeonTile: number, liquidTile: number): boolean {
  return dungeonDef(dungeonTile).passable && liquidDef(liquidTile).passable;
}

export function isTransparent(dungeonTile: number, liquidTile: number): boolean {
  return dungeonDef(dungeonTile).transparent && liquidDef(liquidTile).transparent;
}

export function hasFlag(dungeonTile: number, liquidTile: number, flag: number): boolean {
  return (combinedFlags(dungeonTile, liquidTile) & flag) !== 0;
}

/** Movement cost of entering a cell. Infinity means impassable. */
export function moveCost(dungeonTile: number, liquidTile: number): number {
  const d = dungeonDef(dungeonTile);
  const l = liquidDef(liquidTile);
  if (!d.passable || !l.passable) return Infinity;
  return d.cost * l.cost;
}
