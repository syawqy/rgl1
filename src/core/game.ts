/**
 * game.ts — the runtime game state, wiring the Brogue-derived systems
 * together: level, player, monsters, items, turns.
 */

import { Rng } from "./rng";
import { DIFFICULTIES, DEFAULT_DIFFICULTY, Difficulty, DifficultyId } from "./difficulty";
import { Level, generateLevel, isWalkable, bfsDistanceMap } from "./level";
import { D, L, T, combinedFlags } from "./terrain";
import { Combatant, makeCombatant, resolveAttack } from "./combat";
import { MONSTERS, HORDES, MonsterDef, HordeDef, awarenessRange } from "./monsters";
import { computeFOV, computeLighting, LightSource, minersLightRadius } from "./lighting";
import { Scheduler, createScheduler, addActor, advanceWorld, PLAYER_TICK_COST } from "./time";

export interface Monster extends Combatant {
  id: number;
  def: MonsterDef;
  x: number;
  y: number;
  /** "asleep" | "hunting" | "alerted" */
  state: "asleep" | "hunting" | "alerted";
  /** Ticks until the monster's next move. */
  ticksUntilTurn: number;
  /** Ticks until the monster's next attack. */
  attackTicksUntilTurn: number;
  /** true when the monster has noticed the player. */
  aware: boolean;
  /** Tiles of the monster's light. */
  lightRadius: number;
  /** true when the monster is dead. */
  dead: boolean;
  /** The monster's display glyph. */
  glyph: string;
}

export interface ItemDef {
  name: string;
  category:
    | "weapon"
    | "armor"
    | "potion"
    | "scroll"
    | "food"
    | "torch"
    | "ring"
    | "amulet";
  /** Damage range for weapons. */
  damageMin?: number;
  damageMax?: number;
  /** Armour value in tenths. */
  armorValue?: number;
  /** Enchantment in tenths. */
  enchantment?: number;
  /** Potions/scrolls: charges remaining. */
  charges?: number;
  /** Light radius in tiles. */
  lightRadius?: number;
  /** Effect description for potions/scrolls. */
  effect?: string;
}

export interface Item {
  def: ItemDef;
  x: number;
  y: number;
  charges?: number;
  identified: boolean;
}

export interface GameState {
  rng: Rng;
  seed: number;
  level: Level;
  depth: number;
  /** The player's combat stats. */
  player: Combatant;
  playerX: number;
  playerY: number;
  /** The player's light radius. */
  playerLight: number;
  monsters: Monster[];
  items: Item[];
  scheduler: Scheduler;
  /** Cells the player has seen on this level. */
  explored: Uint8Array;
  /** Cells currently in the field of view. */
  visible: Uint8Array;
  /** Light intensity per cell. */
  intensity: Float32Array;
  /** The player's inventory. */
  inventory: Item[];
  equippedWeapon: Item | null;
  equippedArmor: Item | null;
  /** Log of recent events for the message bar. */
  log: string[];
  /** true when the game is over. */
  gameOver: boolean;
  victory: boolean;
  /** The player's score. */
  score: number;
  /** Number of turns taken. */
  turn: number;
  /** The difficulty tier this run uses. */
  difficulty: Difficulty;
  /**
   * Presentation events for this turn. The core pushes plain data here
   * and the Phaser layer drains it to spawn effects, so the simulation
   * stays free of any rendering concerns.
   */
  events: GameEvent[];
}

/** A visual event produced by the simulation. */
export type GameEvent =
  | { kind: "hit"; x: number; y: number; damage: number; critical: boolean }
  | { kind: "miss"; x: number; y: number }
  | { kind: "playerHurt"; x: number; y: number; damage: number }
  | { kind: "playerDied" }
  | { kind: "monsterDied"; x: number; y: number; name: string }
  | { kind: "pickup"; x: number; y: number; name: string }
  | { kind: "descend"; depth: number }
  | { kind: "message"; text: string };

/* ------------------------------------------------------------------ */
/* Starting kit                                                        */
/* ------------------------------------------------------------------ */

/**
 * Brogue's starting kit: a dagger, leather armour, a light source and a
 * scroll. Ported from `RogueMain.c`'s `initializeRogue`.
 */
export const STARTING_KIT: ItemDef[] = [
  { name: "dagger", category: "weapon", damageMin: 1, damageMax: 3, enchantment: 0 },
  { name: "leather armour", category: "armor", armorValue: 30, enchantment: 0 },
  { name: "torch", category: "torch", lightRadius: 10 },
  { name: "scroll of identify", category: "scroll", charges: 1, effect: "Reveals an item's properties." },
];

export const SCROLL_EFFECTS = [
  { name: "scroll of identify", effect: "Reveals an item's properties." },
  { name: "scroll of light", effect: "Lights up the area." },
  { name: "scroll of magic mapping", effect: "Reveals the whole level." },
  { name: "scroll of teleport", effect: "Moves you elsewhere on this level." },
  { name: "scroll of aha", effect: "Reveals the level's item and monster layout." },
];

export const POTION_EFFECTS = [
  { name: "potion of healing", effect: "Restores some health." },
  { name: "potion of strength", effect: "Temporarily increases damage." },
  { name: "potion of speed", effect: "Temporarily hastens you." },
  { name: "potion of fire immunity", effect: "Protects you from fire." },
  { name: "potion of darkness", effect: "Hides you, but you cannot see." },
];

export const ARMOR_TABLE: { name: string; value: number }[] = [
  { name: "leather armour", value: 30 },
  { name: "scale mail", value: 40 },
  { name: "chain mail", value: 50 },
  { name: "banded mail", value: 70 },
  { name: "splint mail", value: 90 },
  { name: "plate armor", value: 110 },
];

/* ------------------------------------------------------------------ */
/* Game creation                                                       */
/* ------------------------------------------------------------------ */

export interface NewGameOptions {
  /** Difficulty tier; defaults to "standard". */
  difficulty?: DifficultyId;
  seed?: number;
  depth?: number;
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = new Rng(seed);
  const depth = opts.depth ?? 1;
  const difficulty = DIFFICULTIES[opts.difficulty ?? DEFAULT_DIFFICULTY];

  const level = generateLevel({ depth, seed });
  const scheduler = createScheduler(0);

  const player = makeCombatant({
    maxHP: Math.round(20 * difficulty.playerHP),
    hp: Math.round(20 * difficulty.playerHP),
    defense: 0,
    accuracy: Math.round(100 * difficulty.playerAccuracy),
    damageMin: 1,
    damageMax: 3,
    enchantment: 0,
  });

  const state: GameState = {
    rng,
    seed,
    level,
    depth,
    player,
    playerX: level.start.x,
    playerY: level.start.y,
    playerLight: 10,
    monsters: [],
    items: [],
    scheduler,
    explored: new Uint8Array(level.w * level.h),
    visible: new Uint8Array(level.w * level.h),
    intensity: new Float32Array(level.w * level.h),
    inventory: [],
    equippedWeapon: null,
    equippedArmor: null,
    log: [],
    gameOver: false,
    victory: false,
    score: 0,
    turn: 0,
    events: [],
    difficulty,
  };

  giveStartingKit(state);
  spawnMonsters(state);
  spawnItems(state);
  refreshVision(state);
  pushLog(
    state,
    `Level ${depth}. Kesulitan: ${difficulty.name}. Cari tangga turun ▼.`
  );
  return state;
}

function giveStartingKit(state: GameState): void {
  for (const def of STARTING_KIT) {
    const item: Item = {
      def,
      x: state.playerX,
      y: state.playerY,
      charges: def.charges,
      identified: true,
    };
    state.inventory.push(item);
    if (def.category === "weapon" && !state.equippedWeapon) state.equippedWeapon = item;
    if (def.category === "armor" && !state.equippedArmor) state.equippedArmor = item;
  }
  // Leather armour: defence 30 tenths => 3 armour points.
  state.player.defense = state.equippedArmor?.def.armorValue ?? 0;
}

/* ------------------------------------------------------------------ */
/* Monster spawning                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pick a horde appropriate for the current depth, honouring Brogue's
 * 10% chance of an out-of-depth horde.
 */
export function pickHorde(rng: Rng, depth: number): HordeDef {
  if (depth > 1 && rng.percent(10)) {
    const deeper = Math.min(depth + rng.range(1, Math.min(5, Math.floor(depth / 2))), 26);
    const candidates = HORDES.filter((h) => deeper >= h.minDepth && deeper <= h.maxDepth);
    if (candidates.length > 0) return weightedPick(rng, candidates);
  }
  const candidates = HORDES.filter((h) => depth >= h.minDepth && depth <= h.maxDepth);
  if (candidates.length === 0) return HORDES[0];
  return weightedPick(rng, candidates);
}

function weightedPick(rng: Rng, items: HordeDef[]): HordeDef {
  const total = items.reduce((s, h) => s + h.frequency, 0);
  let roll = rng.range(0, total - 1);
  for (const h of items) {
    if (roll < h.frequency) return h;
    roll -= h.frequency;
  }
  return items[items.length - 1];
}

function spawnMonsters(state: GameState): void {
  const { rng, level } = state;
  const diff = state.difficulty;
  const hordeCount = Math.max(
    2,
    Math.round(rng.range(2, 6) * diff.monsterCount)
  );

  for (let h = 0; h < hordeCount; h++) {
    const horde = pickHorde(rng, state.depth);
    const leaderDef = MONSTERS.find((m) => m.name === horde.leader);
    if (!leaderDef) continue;

    const followerCount = Math.max(
      1,
      Math.round(rng.range(horde.min, horde.max) * diff.monsterCount)
    );
    const members = [leaderDef];
    for (let i = 0; i < followerCount; i++) {
      // Followers are usually the same species as the leader.
      members.push(leaderDef);
    }

    // Place the horde on a walkable cell, away from the player.
    const spot = findSpawnSpot(state, horde);
    if (!spot) continue;

    members.forEach((def, i) => {
      const monster = makeMonster(state, def, spot.x, spot.y);
      if (!monster) return;
      // Spread the group out slightly.
      if (i > 0) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const dx = rng.range(-2, 2);
          const dy = rng.range(-2, 2);
          const nx = monster.x + dx;
          const ny = monster.y + dy;
          if (isWalkable(level, nx, ny) && !monsterAt(state, nx, ny)) {
            monster.x = nx;
            monster.y = ny;
            break;
          }
        }
      }
      state.monsters.push(monster);
      addActor(state.scheduler, monster.id, def.movementSpeed, def.attackSpeed);
    });
  }
}

function findSpawnSpot(
  state: GameState,
  horde: HordeDef
): { x: number; y: number } | null {
  const diff = state.difficulty;

  // Try to place the horde far from the player first, then progressively
  // closer. On a 41x33 map a strict minimum distance can leave most of
  // the level empty, so we fall back rather than spawning nothing.
  for (let minDist = diff.minSpawnDistance; minDist >= 4; minDist -= 2) {
    const spot = trySpawnSpot(state, horde, minDist);
    if (spot) return spot;
  }
  return trySpawnSpot(state, horde, 0);
}

function trySpawnSpot(
  state: GameState,
  horde: HordeDef,
  minDist: number
): { x: number; y: number } | null {
  const { rng, level } = state;
  for (let attempt = 0; attempt < 120; attempt++) {
    const x = rng.range(1, level.w - 2);
    const y = rng.range(1, level.h - 2);
    if (!isWalkable(level, x, y)) continue;
    if (monsterAt(state, x, y)) continue;
    // Keep away from the player.
    const dist = Math.hypot(x - state.playerX, y - state.playerY);
    if (dist < minDist) continue;
    // Aquatic / fiery hordes need their terrain.
    if (horde.aquatic) {
      const liq = level.liquid[x * level.h + y];
      if (liq !== L.DEEP_WATER) continue;
    }
    if (horde.fiery) {
      const liq = level.liquid[x * level.h + y];
      if (liq !== L.LAVA) continue;
    }
    return { x, y };
  }
  return null;
}

let nextMonsterId = 1;

function makeMonster(
  state: GameState,
  def: MonsterDef,
  x: number,
  y: number
): Monster | null {
  if (!isWalkable(state.level, x, y)) return null;
  const hp = def.maxHP;
  return {
    id: nextMonsterId++,
    def,
    x,
    y,
    maxHP: hp,
    hp,
    defense: def.defense,
    accuracy: def.accuracy,
    damageMin: def.damageMin,
    damageMax: def.damageMax,
    enchantment: 0,
    immuneToWeapons: def.weaponImmune,
    invulnerable: false,
    sneakAttack: false,
    targetHelpless: false,
    weaponHasSneakBonus: false,
    haste: 0,
    fireImmune: false,
    darkness: 0,
    state: "asleep",
    ticksUntilTurn: def.movementSpeed,
    attackTicksUntilTurn: def.attackSpeed,
    aware: false,
    lightRadius: def.lightRadius,
    dead: false,
    glyph: def.name.charAt(0),
  };
}

export function monsterAt(state: GameState, x: number, y: number): Monster | undefined {
  return state.monsters.find((m) => !m.dead && m.x === x && m.y === y);
}

/* ------------------------------------------------------------------ */
/* Item spawning                                                       */
/* ------------------------------------------------------------------ */

function spawnItems(state: GameState): void {
  const { rng, level } = state;
  const count = rng.range(3, 7);
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = rng.range(1, level.w - 2);
      const y = rng.range(1, level.h - 2);
      if (!isWalkable(level, x, y)) continue;
      if (itemAt(state, x, y)) continue;
      const def = pickItemDef(state, rng);
      state.items.push({ def, x, y, charges: def.charges, identified: false });
      break;
    }
  }

  // The Amulet of Yendor lies on its own depth: picking it up wins the
  // run. Brogue puts it on depth 26; we use AMULET_DEPTH.
  if (state.depth === AMULET_DEPTH) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = rng.range(1, level.w - 2);
      const y = rng.range(1, level.h - 2);
      if (!isWalkable(level, x, y)) continue;
      if (itemAt(state, x, y)) continue;
      if (state.monsters.some((m) => !m.dead && m.x === x && m.y === y)) continue;
      state.items.push({
        def: {
          name: "Amulet of Yendor",
          category: "amulet",
          effect: "Escape with the Amulet and win the game.",
        },
        x,
        y,
        charges: 1,
        identified: true,
      });
      break;
    }
  }
}

function pickItemDef(state: GameState, rng: Rng): ItemDef {
  const roll = rng.range(0, 100);
  if (roll < 30) {
    // Weapon: scale with depth.
    const tier = Math.min(ARMOR_TABLE.length - 1, Math.floor(state.depth / 3));
    const names = ["dagger", "mace", "spear", "sword", "war axe", "greatsword"];
    const min = 1 + tier;
    const max = 3 + tier * 2;
    return {
      name: names[tier],
      category: "weapon",
      damageMin: min,
      damageMax: max,
      enchantment: rng.range(-1, 2) * 10,
    };
  }
  if (roll < 55) {
    const armor = ARMOR_TABLE[Math.min(ARMOR_TABLE.length - 1, Math.floor(state.depth / 3))];
    return {
      name: armor.name,
      category: "armor",
      armorValue: armor.value,
      enchantment: rng.range(-1, 2) * 10,
    };
  }
  if (roll < 75) {
    const eff = rng.pick(POTION_EFFECTS);
    return { name: eff.name, category: "potion", charges: 1, effect: eff.effect };
  }
  if (roll < 90) {
    const eff = rng.pick(SCROLL_EFFECTS);
    return { name: eff.name, category: "scroll", charges: 1, effect: eff.effect };
  }
  return { name: "torch", category: "torch", lightRadius: 10 };
}

export function itemAt(state: GameState, x: number, y: number): Item | undefined {
  return state.items.find((i) => i.x === x && i.y === y);
}

/* ------------------------------------------------------------------ */
/* Vision                                                              */
/* ------------------------------------------------------------------ */

export function refreshVision(state: GameState): void {
  const { level, playerX, playerY } = state;

  // The player's field of view.
  state.visible = computeFOV(level, playerX, playerY, state.playerLight);

  // Light sources: the player's own light, torches, and glowing monsters.
  const sources: LightSource[] = [
    {
      x: playerX,
      y: playerY,
      radius: state.playerLight,
      fadePercent: 0,
      color: 0xffffff,
    },
  ];
  for (const item of state.items) {
    if (item.def.lightRadius) {
      sources.push({
        x: item.x,
        y: item.y,
        radius: item.def.lightRadius,
        fadePercent: 50,
        color: 0xffaa44,
      });
    }
  }
  for (const m of state.monsters) {
    if (m.dead || !m.lightRadius) continue;
    sources.push({
      x: m.x,
      y: m.y,
      radius: m.lightRadius,
      fadePercent: 0,
      color: 0xff6622,
    });
  }

  const { intensity, seen } = computeLighting(level, sources);
  state.intensity = intensity;
  for (let i = 0; i < state.explored.length; i++) {
    if (seen[i]) state.explored[i] = 1;
  }

  // Walls that border an explored area are remembered too. Without this
  // the dungeon reads as a floating blob of floor on pure black instead
  // of a carved-out level, because the wall ring around a room is
  // usually outside the light radius.
  rememberBorderingWalls(state);
}

/**
 * Mark the wall and granite cells that touch an explored floor cell as
 * explored, so the shape of the carved level stays visible.
 */
function rememberBorderingWalls(state: GameState): void {
  const level = state.level;
  const h = level.h;
  const w = level.w;

  const isSolid = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const d = level.dungeon[x * h + y];
    return d === D.WALL || d === D.GRANITE;
  };

  // Collect first, then write, so we do not cascade the marking.
  const toMark: number[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const at = x * h + y;
      if (!state.explored[at]) continue;
      const d = level.dungeon[at];
      if (d === D.WALL || d === D.GRANITE) continue;

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isSolid(nx, ny)) continue;
        const nat = nx * h + ny;
        if (!state.explored[nat]) toMark.push(nat);
      }
    }
  }
  for (const at of toMark) state.explored[at] = 1;
}

/* ------------------------------------------------------------------ */
/* Player actions                                                      */
/* ------------------------------------------------------------------ */

export type MoveResult = "moved" | "blocked" | "attacked" | "descended" | "picked" | "nothing";

/**
 * Try to move the player in a direction.
 * Bumping into a monster attacks it (Brogue's "bump to attack").
 */
export function movePlayer(state: GameState, dx: number, dy: number): MoveResult {
  if (state.gameOver) return "nothing";
  const nx = state.playerX + dx;
  const ny = state.playerY + dy;
  const { level } = state;

  // Descend the stairs.
  if (level.stairsDown && nx === level.stairsDown.x && ny === level.stairsDown.y) {
    descend(state);
    return "descended";
  }

  // Attack a monster.
  const target = monsterAt(state, nx, ny);
  if (target) {
    playerAttack(state, target);
    endPlayerTurn(state);
    return "attacked";
  }

  // Pick up an item.
  const item = itemAt(state, nx, ny);
  if (item && !state.inventory.some((i) => i.def.name === item.def.name)) {
    state.inventory.push(item);
    state.items = state.items.filter((i) => i !== item);
    pushLog(state, `Kamu mengambil ${item.def.name}.`);
    state.events.push({ kind: "pickup", x: item.x, y: item.y, name: item.def.name });

    if (item.def.category === "amulet") {
      // The Amulet of Yendor: the win condition.
      state.victory = true;
      state.gameOver = true;
      state.score += 1000;
      pushLog(state, "Kamu menemukan Amulet of Yendor! Kamu menang!");
      return "picked";
    }

    if (item.def.category === "weapon" && !state.equippedWeapon) {
      state.equippedWeapon = item;
      state.player.damageMin = item.def.damageMin ?? 1;
      state.player.damageMax = item.def.damageMax ?? 3;
    }
    if (item.def.category === "armor" && !state.equippedArmor) {
      state.equippedArmor = item;
      state.player.defense = item.def.armorValue ?? 0;
    }
  }

  // Move.
  if (!isWalkable(level, nx, ny)) {
    // A closed door opens instead of blocking.
    const at = nx * level.h + ny;
    if (level.dungeon[at] === D.DOOR) {
      level.dungeon[at] = D.FLOOR;
      pushLog(state, "Kamu membuka pintu.");
    } else {
      return "blocked";
    }
  }

  state.playerX = nx;
  state.playerY = ny;
  endPlayerTurn(state);
  return "moved";
}

function playerAttack(state: GameState, target: Monster): void {
  const weapon = state.equippedWeapon;
  const attacker = {
    ...state.player,
    damageMin: weapon?.def.damageMin ?? state.player.damageMin,
    damageMax: weapon?.def.damageMax ?? state.player.damageMax,
    enchantment: weapon?.def.enchantment ?? 0,
    // A sneak attack lands when the monster is unaware.
    sneakAttack: target.state === "asleep" && !target.aware,
    weaponHasSneakBonus: weapon?.def.name === "dagger",
  };

  const res = resolveAttack(state.rng, attacker, target);
  if (!res.hit) {
    pushLog(state, `Kamu meleset menyerang ${target.def.name}.`);
    state.events.push({ kind: "miss", x: target.x, y: target.y });
    return;
  }
  if (res.damage <= 0) {
    pushLog(state, `${target.def.name} mengabaikan seranganmu.`);
    state.events.push({ kind: "miss", x: target.x, y: target.y });
    return;
  }
  target.hp -= res.damage;
  target.aware = true;
  target.state = "hunting";
  pushLog(
    state,
    `Kamu memukul ${target.def.name} untuk ${res.damage}${res.critical ? " (serangan diam-diam!)" : ""}.`
  );
  state.events.push({
    kind: "hit",
    x: target.x,
    y: target.y,
    damage: res.damage,
    critical: res.critical,
  });
  if (target.hp <= 0) {
    killMonster(state, target);
  }
}

function killMonster(state: GameState, target: Monster): void {
  target.dead = true;
  state.score += target.def.maxHP;
  pushLog(state, `${target.def.name} mati.`);
  state.events.push({
    kind: "monsterDied",
    x: target.x,
    y: target.y,
    name: target.def.name,
  });
  // Drop its loot.
  if (state.rng.percent(50)) {
    const armor = ARMOR_TABLE[Math.min(ARMOR_TABLE.length - 1, Math.floor(state.depth / 3))];
    state.items.push({
      def: { name: armor.name, category: "armor", armorValue: armor.value, enchantment: 0 },
      x: target.x,
      y: target.y,
      identified: false,
    });
  }
}

function endPlayerTurn(state: GameState): void {
  state.turn++;
  state.scheduler.playerTurn++;

  // Monster turns.
  advanceWorld(state.scheduler, PLAYER_TICK_COST, (actor) => {
    if (actor.id === 0) return;
    const monster = state.monsters.find((m) => m.id === actor.id);
    if (!monster || monster.dead) return;
    monsterTurn(state, monster);
  });

  // Slow natural regeneration. Brogue has none; we add a trickle so a
  // mobile player is not forced to end the run at 1 HP.
  const regenEvery = state.difficulty.regenEvery;
  if (state.player.hp < state.player.maxHP && state.turn % regenEvery === 0) {
    state.player.hp = Math.min(state.player.maxHP, state.player.hp + 1);
  }

  if (state.player.hp <= 0 && !state.gameOver) {
    state.player.hp = 0;
    state.gameOver = true;
    pushLog(state, "Kamu mati.");
    state.events.push({ kind: "playerDied" });
  }

  refreshVision(state);
}

function monsterTurn(state: GameState, monster: Monster): void {
  const { level } = state;

  // Awareness check (Brogue's model).
  const dist = Math.hypot(monster.x - state.playerX, monster.y - state.playerY);
  const range = awarenessRange(14);
  if (!monster.aware) {
    const notice = state.difficulty.noticeChance * 100;
    if (dist <= range && state.rng.percent(notice)) {
      monster.aware = true;
      monster.state = "hunting";
      pushLog(state, `${monster.def.name} melihatmu.`);
    }
  } else if (dist > range * 3) {
    monster.aware = false;
    monster.state = "asleep";
  }

  if (!monster.aware) return;

  // Adjacent? Attack.
  if (dist === 1) {
    monsterAttack(state, monster);
    return;
  }

  // Otherwise step toward the player.
  const dx = Math.sign(state.playerX - monster.x);
  const dy = Math.sign(state.playerY - monster.y);
  const options: [number, number][] = [];
  if (dx !== 0) options.push([dx, 0]);
  if (dy !== 0) options.push([0, dy]);
  if (options.length === 2 && state.rng.percent(50)) {
    options.reverse();
  }

  for (const [mx, my] of options) {
    const nx = monster.x + mx;
    const ny = monster.y + my;
    if (!isWalkable(level, nx, ny)) continue;
    if (monsterAt(state, nx, ny)) continue;
    // The player is in the way — attack instead.
    if (nx === state.playerX && ny === state.playerY) {
      monsterAttack(state, monster);
      return;
    }
    monster.x = nx;
    monster.y = ny;
    return;
  }
}

function monsterAttack(state: GameState, monster: Monster): void {
  const scaled: Monster = {
    ...monster,
    damageMin: Math.max(0, Math.round(monster.damageMin * state.difficulty.monsterDamage)),
    damageMax: Math.max(1, Math.round(monster.damageMax * state.difficulty.monsterDamage)),
  };
  const res = resolveAttack(state.rng, scaled, state.player);
  if (!res.hit) {
    pushLog(state, `${monster.def.name} meleset.`);
    return;
  }
  if (res.damage <= 0) {
    pushLog(state, `Serangan ${monster.def.name} tak berpengaruh.`);
    return;
  }
  state.player.hp -= res.damage;
  pushLog(state, `${monster.def.name} memukulmu untuk ${res.damage}.`);
  state.events.push({
    kind: "playerHurt",
    x: state.playerX,
    y: state.playerY,
    damage: res.damage,
  });
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    state.events.push({ kind: "playerDied" });
  }
}

/* ------------------------------------------------------------------ */
/* Level transitions                                                   */
/* ------------------------------------------------------------------ */

/**
 * The Amulet of Yendor lies on this depth (Brogue puts it on depth 26).
 * Finding it is the win condition.
 */
export const AMULET_DEPTH = 26;

/**
 * How deep the dungeon goes. Brogue's standard run is 40 levels deep;
 * we use a shorter 16-level run so a mobile session can actually be
 * finished.
 */
export const MAX_DEPTH = 16;

/** Descend to the next level. */
export function descend(state: GameState): void {
  const nextDepth = state.depth + 1;
  pushLog(state, "Kamu turun ke level berikutnya.");
  state.events.push({ kind: "descend", depth: nextDepth });

  if (nextDepth > MAX_DEPTH) {
    // The Amulet of Yendor is found — victory.
    state.victory = true;
    state.gameOver = true;
    state.score += 1000;
    pushLog(state, "Kamu menemukan Amulet of Yendor dan melarikan diri! Kamu menang!");
    return;
  }

  const newSeed = state.rng.range(0, 0xffffffff);
  const level = generateLevel({ depth: nextDepth, seed: newSeed });
  state.level = level;
  state.depth = nextDepth;
  state.playerX = level.start.x;
  state.playerY = level.start.y;
  state.explored = new Uint8Array(level.w * level.h);
  state.visible = new Uint8Array(level.w * level.h);
  state.intensity = new Float32Array(level.w * level.h);
  state.monsters = [];
  state.items = [];
  state.scheduler = createScheduler(0);

  spawnMonsters(state);
  spawnItems(state);
  refreshVision(state);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function pushLog(state: GameState, message: string): void {
  state.log.unshift(message);
  if (state.log.length > 60) state.log.pop();
}

/** Distance map from the player — used for the "distance to stairs" HUD. */
export function distanceMapFromPlayer(state: GameState): Int16Array {
  return bfsDistanceMap(state.level, state.playerX, state.playerY);
}

/** True when the cell holds deadly liquid. */
export function isDeadlyLiquid(state: GameState, x: number, y: number): boolean {
  const at = x * state.level.h + y;
  const liq = state.level.liquid[at];
  return liq === L.LAVA || liq === L.CHASM;
}

/** True when the cell is filled with water. */
export function isWater(state: GameState, x: number, y: number): boolean {
  const at = x * state.level.h + y;
  const liq = state.level.liquid[at];
  return liq === L.DEEP_WATER || liq === L.SHALLOW_WATER;
}

export { D, L, T, combinedFlags, MINER_LIGHT_BASE };

/** Brogue's base miner light radius, in tiles. */
const MINER_LIGHT_BASE = 10;

/** Recompute the player's light radius (torch in inventory, in water, etc). */
export function updatePlayerLight(state: GameState): void {
  let radius = MINER_LIGHT_BASE;
  const hasTorch =
    state.equippedWeapon?.def.category === "torch" ||
    state.inventory.some((i) => i.def.category === "torch");
  if (hasTorch) radius = 10;
  state.playerLight = minersLightRadius(
    radius,
    1,
    0,
    isWater(state, state.playerX, state.playerY)
  );
}
