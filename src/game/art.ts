/**
 * art.ts — procedural sprite generation.
 *
 * The game ships no binary assets: every tile, monster and item sprite is
 * drawn to a canvas at boot time. This keeps the build tiny and lets the
 * palette shift per level depth.
 */

import Phaser from "phaser";

export const TILE_SIZE = 24;

/** Palette per depth band, so the dungeon gets colder as you descend. */
export interface Palette {
  floor: string;
  floorAlt: string;
  wall: string;
  wallTop: string;
  granite: string;
  door: string;
  secretDoor: string;
  stairsUp: string;
  stairsDown: string;
  water: string;
  deepWater: string;
  lava: string;
  chasm: string;
  bridge: string;
  background: string;
}

export function paletteForDepth(depth: number): Palette {
  if (depth <= 1) {
    return {
      floor: "#7d6d55",
      floorAlt: "#73634d",
      wall: "#4a3f33",
      wallTop: "#5e5040",
      granite: "#241e18",
      door: "#8a5a2b",
      secretDoor: "#6b4a2b",
      stairsUp: "#9a9a8a",
      stairsDown: "#b08a4a",
      water: "#2a4a6a",
      deepWater: "#16324a",
      lava: "#d04a20",
      chasm: "#0a0a10",
      bridge: "#7a5a38",
      background: "#0d0b09",
    };
  }
  if (depth <= 4) {
    return {
      floor: "#5f5f74",
      floorAlt: "#56566b",
      wall: "#383848",
      wallTop: "#484858",
      granite: "#1a1a26",
      door: "#7a5330",
      secretDoor: "#5f4526",
      stairsUp: "#9a9a9a",
      stairsDown: "#a07a4f",
      water: "#2a4a6a",
      deepWater: "#16324a",
      lava: "#d04a20",
      chasm: "#0a0a12",
      bridge: "#6a4f33",
      background: "#0a0a12",
    };
  }
  // Deep levels: colder, more violet.
  return {
    floor: "#544e72",
    floorAlt: "#4b4666",
    wall: "#302c46",
    wallTop: "#3d3857",
    granite: "#16141f",
    door: "#6f4a35",
    secretDoor: "#573c28",
    stairsUp: "#8a8a9a",
    stairsDown: "#9a7a55",
    water: "#264a5a",
    deepWater: "#122838",
    lava: "#d0481f",
    chasm: "#07060d",
    bridge: "#5f4a30",
    background: "#08070e",
  };
}

/**
 * Build the tile atlas. Returns the texture key.
 * Layout: row 0 = floor variants, row 1 = wall variants, row 2 = specials.
 */
export function buildTileTexture(scene: Phaser.Scene, palette: Palette): string {
  const key = "rgl1-tiles";
  if (scene.textures.exists(key)) scene.textures.remove(key);

  const TS = TILE_SIZE;
  // Every tile is one cell in a SINGLE row, so the frame index is simply
  // the cell number (see FRAME below). A 2D atlas made the linear
  // FRAME indices point outside the canvas.
  const cells = 24;
  const canvas = document.createElement("canvas");
  canvas.width = TS * cells;
  canvas.height = TS;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const cell = (i: number) => [i * TS, 0] as const;

  // 0-3: floor variants
  for (let i = 0; i < 4; i++) {
    const [ox, oy] = cell(i);
    ctx.fillStyle = i % 2 === 0 ? palette.floor : palette.floorAlt;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(ox, oy, TS, 1);
    ctx.fillRect(ox, oy, 1, TS);
  }

  // 4-7: wall bodies
  for (let i = 0; i < 4; i++) {
    const [ox, oy] = cell(4 + i);
    ctx.fillStyle = palette.wall;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(ox, oy, TS, 2);
  }

  // 8-11: wall tops (used when the cell above is open)
  for (let i = 0; i < 4; i++) {
    const [ox, oy] = cell(8 + i);
    ctx.fillStyle = palette.wallTop;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.fillRect(ox, oy, TS, 3);
  }

  // 12: door
  {
    const [ox, oy] = cell(12);
    ctx.fillStyle = palette.door;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    for (let i = 1; i < 4; i++) ctx.fillRect(ox + i * 6, oy + 2, 1, TS - 4);
    ctx.fillStyle = "#d8c07a";
    ctx.fillRect(ox + TS - 7, oy + TS / 2 - 1, 3, 3);
  }

  // 13: secret door
  {
    const [ox, oy] = cell(13);
    ctx.fillStyle = palette.secretDoor;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + 4, oy + 4);
    ctx.lineTo(ox + TS - 5, oy + TS - 5);
    ctx.moveTo(ox + TS - 5, oy + 4);
    ctx.lineTo(ox + 4, oy + TS - 5);
    ctx.stroke();
  }

  // 14: stairs up
  {
    const [ox, oy] = cell(14);
    ctx.fillStyle = palette.floorAlt;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (let i = 0; i < 4; i++) ctx.fillRect(ox + 3, oy + TS - 4 - i * 5, TS - 6, 3);
  }

  // 15: stairs down
  {
    const [ox, oy] = cell(15);
    ctx.fillStyle = palette.floorAlt;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (let i = 0; i < 4; i++) ctx.fillRect(ox + 3, oy + 4 + i * 5, TS - 6, 3);
  }

  // 16: bridge
  {
    const [ox, oy] = cell(16);
    ctx.fillStyle = palette.bridge;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (let i = 1; i < 4; i++) ctx.fillRect(ox, oy + i * 6, TS, 1);
  }

  // 17: shallow water
  {
    const [ox, oy] = cell(17);
    ctx.fillStyle = palette.water;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(ox + 2, oy + 6, 10, 1);
    ctx.fillRect(ox + 8, oy + 13, 12, 1);
  }

  // 18: deep water
  {
    const [ox, oy] = cell(18);
    ctx.fillStyle = palette.deepWater;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(ox + 4, oy + 8, 14, 1);
  }

  // 19: lava
  {
    const [ox, oy] = cell(19);
    ctx.fillStyle = palette.lava;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,220,120,0.55)";
    ctx.fillRect(ox + 3, oy + 7, 8, 2);
    ctx.fillRect(ox + 12, oy + 14, 8, 2);
  }

  // 20: chasm
  {
    const [ox, oy] = cell(20);
    ctx.fillStyle = palette.chasm;
    ctx.fillRect(ox, oy, TS, TS);
  }

  // 21: granite (solid rock)
  {
    const [ox, oy] = cell(21);
    ctx.fillStyle = palette.granite;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(ox + 3, oy + 5, 8, 2);
    ctx.fillRect(ox + 12, oy + 14, 7, 2);
  }

  // 22: rubble
  {
    const [ox, oy] = cell(22);
    ctx.fillStyle = palette.floorAlt;
    ctx.fillRect(ox, oy, TS, TS);
    ctx.fillStyle = "rgba(120,110,90,0.7)";
    ctx.fillRect(ox + 4, oy + 6, 6, 5);
    ctx.fillRect(ox + 13, oy + 12, 5, 4);
  }

  // 23: unused / blank
  {
    const [ox, oy] = cell(23);
    ctx.fillStyle = palette.floor;
    ctx.fillRect(ox, oy, TS, TS);
  }

  scene.textures.addCanvas(key, canvas);

  // Register each cell as its own frame. `addCanvas` only creates one
  // frame for the whole canvas, so we add them by hand.
  const tex = scene.textures.get(key);
  for (let i = 0; i < cells; i++) {
    const name = `t${i}`;
    if (tex.has(name)) tex.remove(name);
    tex.add(name, 0, i * TS, 0, TS, TS);
  }

  return key;
}

/** Resolve a tile frame index to a Phaser frame name. */
export function tileFrame(index: number): string {
  return `t${index}`;
}

/** Frame indices in the tile texture. */
export const FRAME = {
  FLOOR_0: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  WALL_0: 4,
  WALL_1: 5,
  WALL_2: 6,
  WALL_3: 7,
  WALL_TOP_0: 8,
  WALL_TOP_1: 9,
  WALL_TOP_2: 10,
  WALL_TOP_3: 11,
  DOOR: 12,
  SECRET_DOOR: 13,
  STAIRS_UP: 14,
  STAIRS_DOWN: 15,
  BRIDGE: 16,
  WATER: 17,
  DEEP_WATER: 18,
  LAVA: 19,
  CHASM: 20,
  GRANITE: 21,
  RUBBLE: 22,
} as const;

/** Build the actor atlas: player, monsters, items. */
export function buildActorTexture(scene: Phaser.Scene, _palette: Palette): string {
  const key = "rgl1-actors";
  if (scene.textures.exists(key)) scene.textures.remove(key);

  const S = 20;
  const cols = 17;
  const rows = 1;
  const canvas = document.createElement("canvas");
  canvas.width = S * cols;
  canvas.height = S * rows;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // One row of 16 cells, in the order of the ACTOR map:
  //   0 player, 1 rat, 2 bat, 3 goblin, 4 ogre, 5 skeleton, 6 slime,
  //   7 wisp, 8 item, 9 scroll, 10 potion, 11 weapon, 12 armor,
  //   13 torch, 14 sparkle, 15 blood


  // Every actor gets a dark outline so it reads clearly against both
  // the dungeon floor and the black of the unexplored area.
  const outline = (col: number, row: number, draw: (ox: number, oy: number) => void) => {
    const ox = col * S;
    const oy = row * S;
    ctx.save();
    // Draw the silhouette 4 times, offset, in near-black.
    ctx.fillStyle = "#0a0806";
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      ctx.save();
      ctx.translate(ox + dx, oy + dy);
      draw(0, 0);
      ctx.restore();
    }
    ctx.restore();
    draw(ox, oy);
  };

  // Player: a hooded figure with a lantern.
  outline(0, 0, (ox, oy) => {
    ctx.fillStyle = "#f0e2c0";
    ctx.fillRect(ox + 6, oy + 4, 8, 8);
    ctx.fillStyle = "#5a86c4";
    ctx.fillRect(ox + 4, oy + 12, 12, 6);
    ctx.fillStyle = "#1a2233";
    ctx.fillRect(ox + 7, oy + 6, 2, 2);
    ctx.fillRect(ox + 11, oy + 6, 2, 2);
    // Lantern.
    ctx.fillStyle = "#ffdd66";
    ctx.fillRect(ox + 15, oy + 9, 3, 4);
  });

  // Monsters: distinct silhouettes, each with its own shape.
  outline(1, 0, (ox, oy) => {
    // rat: low body with a tail
    ctx.fillStyle = "#9a8465";
    ctx.fillRect(ox + 4, oy + 9, 11, 7);
    ctx.fillStyle = "#7a6a55";
    ctx.fillRect(ox + 14, oy + 6, 3, 4);
    ctx.fillStyle = "#3a3226";
    ctx.fillRect(ox + 13, oy + 11, 5, 1);
  });
  outline(2, 0, (ox, oy) => {
    // bat: spread wings
    ctx.fillStyle = "#7a4a86";
    ctx.beginPath();
    ctx.moveTo(ox + 10, oy + 6);
    ctx.lineTo(ox + 2, oy + 4);
    ctx.lineTo(ox + 5, oy + 11);
    ctx.lineTo(ox + 10, oy + 10);
    ctx.lineTo(ox + 15, oy + 11);
    ctx.lineTo(ox + 18, oy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#241829";
    ctx.fillRect(ox + 8, oy + 7, 1, 1);
    ctx.fillRect(ox + 11, oy + 7, 1, 1);
  });
  outline(3, 0, (ox, oy) => {
    // goblin: pointy ears
    ctx.fillStyle = "#7aa34f";
    ctx.fillRect(ox + 6, oy + 5, 8, 10);
    ctx.fillStyle = "#5a7a3a";
    ctx.beginPath();
    ctx.moveTo(ox + 6, oy + 6);
    ctx.lineTo(ox + 1, oy + 3);
    ctx.lineTo(ox + 6, oy + 9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + 14, oy + 6);
    ctx.lineTo(ox + 19, oy + 3);
    ctx.lineTo(ox + 14, oy + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2e3f1e";
    ctx.fillRect(ox + 8, oy + 8, 2, 2);
    ctx.fillRect(ox + 11, oy + 8, 2, 2);
  });
  outline(4, 0, (ox, oy) => {
    // ogre: big block
    ctx.fillStyle = "#b0784a";
    ctx.fillRect(ox + 3, oy + 4, 14, 13);
    ctx.fillStyle = "#8a5a3a";
    ctx.fillRect(ox + 6, oy + 1, 8, 4);
    ctx.fillStyle = "#402a1a";
    ctx.fillRect(ox + 6, oy + 8, 2, 2);
    ctx.fillRect(ox + 12, oy + 8, 2, 2);
  });
  outline(5, 0, (ox, oy) => {
    // skeleton: skull + ribs
    ctx.fillStyle = "#e8e4d4";
    ctx.fillRect(ox + 6, oy + 3, 8, 8);
    ctx.fillStyle = "#c8c4b4";
    ctx.fillRect(ox + 7, oy + 12, 6, 6);
    ctx.fillStyle = "#3a3a34";
    ctx.fillRect(ox + 8, oy + 6, 2, 2);
    ctx.fillRect(ox + 11, oy + 6, 2, 2);
  });
  outline(6, 0, (ox, oy) => {
    // slime: blob
    ctx.fillStyle = "#b06ac4";
    ctx.beginPath();
    ctx.arc(ox + 10, oy + 12, 7, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#8a5a9a";
    ctx.fillRect(ox + 6, oy + 11, 8, 4);
    ctx.fillStyle = "#432a50";
    ctx.fillRect(ox + 7, oy + 8, 2, 2);
    ctx.fillRect(ox + 12, oy + 8, 2, 2);
  });
  outline(7, 0, (ox, oy) => {
    // wisp: floating orb with a tail
    ctx.fillStyle = "#a0e0ff";
    ctx.beginPath();
    ctx.arc(ox + 10, oy + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6ab0d8";
    ctx.fillRect(ox + 9, oy + 12, 3, 5);
  });

  // Row 1: item markers
  const drawDiamond = (col: number, row: number, fill: string) => {
    const ox = col * S;
    const oy = row * S;
    ctx.beginPath();
    ctx.moveTo(ox + S / 2, oy + 3);
    ctx.lineTo(ox + S - 3, oy + S / 2);
    ctx.lineTo(ox + S / 2, oy + S - 3);
    ctx.lineTo(ox + 3, oy + S / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  drawDiamond(8, 0, "#d8c07a"); // gold / generic item
  drawDiamond(9, 0, "#b0b0c0"); // scroll
  drawDiamond(10, 0, "#d85a5a"); // potion
  drawDiamond(11, 0, "#c0c0c8"); // weapon
  drawDiamond(12, 0, "#8a8a9a"); // armor
  drawDiamond(13, 0, "#ffaa44"); // torch
  drawDiamond(14, 0, "#ffffff"); // sparkle
  drawDiamond(15, 0, "#ff4444"); // blood
  // 16: the Amulet of Yendor — a gold disc on a red field.
  {
    const ox = 16 * S;
    const oy = 0;
    ctx.fillStyle = "#7a2020";
    ctx.fillRect(ox, oy, S, S);
    ctx.beginPath();
    ctx.arc(ox + S / 2, oy + S / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f0c860";
    ctx.fill();
    ctx.strokeStyle = "#8a6a20";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  scene.textures.addCanvas(key, canvas);

  // `addCanvas` registers the whole canvas as ONE frame, so we have to
  // add the individual cells ourselves or every sprite renders the same.
  const tex = scene.textures.get(key);
  for (let i = 0; i < cols * rows; i++) {
    const name = `a${i}`;
    if (tex.has(name)) tex.remove(name);
    tex.add(name, 0, i * S, 0, S, S);
  }

  // `addCanvas` registers the whole canvas as frame 0, so our own frames
  // start at index 1. Every consumer goes through `actorFrame()` which
  // applies this offset, so the public ACTOR indices stay 0-based.
  return key;
}

/** Actor frame indices. */
export const ACTOR = {
  PLAYER: 0,
  RAT: 1,
  BAT: 2,
  GOBLIN: 3,
  OGRE: 4,
  SKELETON: 5,
  SLIME: 6,
  WISP: 7,
  ITEM: 8,
  SCROLL: 9,
  POTION: 10,
  WEAPON: 11,
  ARMOR: 12,
  TORCH: 13,
  SPARKLE: 14,
  BLOOD: 15,
  AMULET: 16,
} as const;

/** Map a monster name to an actor frame. */
export function frameForMonster(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("rat") || n.includes("kobold") || n.includes("jackal")) return ACTOR.RAT;
  if (n.includes("bat") || n.includes("wisp") || n.includes("imp") || n.includes("pixie"))
    return ACTOR.WISP;
  if (n.includes("goblin") || n.includes("kobold")) return ACTOR.GOBLIN;
  if (n.includes("ogre") || n.includes("troll") || n.includes("giant")) return ACTOR.OGRE;
  if (n.includes("skeleton") || n.includes("zombie") || n.includes("revenant")) return ACTOR.SKELETON;
  if (n.includes("jelly") || n.includes("bloat") || n.includes("toad")) return ACTOR.SLIME;
  return ACTOR.GOBLIN;
}

/** Map an item category to an actor frame. */
export function frameForItem(category: string): number {
  switch (category) {
    case "scroll":
      return ACTOR.SCROLL;
    case "potion":
      return ACTOR.POTION;
    case "weapon":
      return ACTOR.WEAPON;
    case "armor":
      return ACTOR.ARMOR;
    case "torch":
      return ACTOR.TORCH;
    case "amulet":
      return ACTOR.AMULET;
    default:
      return ACTOR.ITEM;
  }
}


/**
 * Resolve an ACTOR index to a real Phaser frame index.
 *
 * `textures.addCanvas()` registers the whole canvas as frame 0, so the
 * frames we add afterwards are numbered from 1. This helper hides that.
 */
export function actorFrame(actorIndex: number): string {
  return `a${actorIndex}`;
}
