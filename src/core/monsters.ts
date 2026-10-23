/**
 * monsters.ts — BrogueCE's bestiary, ported to TypeScript.
 *
 * Stats transcribed from BrogueCE `src/brogue/Globals.c` (the
 * `monsterCatalog` table) as reported by the source analysis.
 *
 * IMPORTANT — Brogue's "movementSpeed" and "attackSpeed" are TICKS UNTIL
 * THE NEXT ACTION, not distance per turn:
 *   100 ticks = one action per player turn
 *    50 ticks = two actions per player turn
 *    25 ticks = four actions per player turn
 *   200 ticks = one action every two player turns
 */

export interface MonsterDef {
  name: string;
  /** Plural/display alias. */
  article: string;
  maxHP: number;
  /** Defence in armour tenths (Brogue's raw defence stat). */
  defense: number;
  /** Accuracy (higher = easier to hit). */
  accuracy: number;
  damageMin: number;
  damageMax: number;
  /** Turns between regenerations. 0 = never regenerates. */
  turnsBetweenRegen: number;
  /** Ticks until the next move. */
  movementSpeed: number;
  /** Ticks until the next attack. */
  attackSpeed: number;
  /** true = the monster can fly over chasms and liquids. */
  flying: boolean;
  /** true = the monster can swim. */
  swimming: boolean;
  /** true = the monster can open doors. */
  canOpenDoors: boolean;
  /** true = the monster is a large creature (takes more space). */
  isLarge: boolean;
  /** true = the monster burns / is on fire. */
  fiery: boolean;
  /** true = immune to fire damage. */
  fireImmune: boolean;
  /** true = immune to weapon damage. */
  weaponImmune: boolean;
  /** Light radius emitted, in tiles. 0 = none. */
  lightRadius: number;
  /** Minimum depth this monster may appear at. */
  minDepth: number;
  /** Maximum depth this monster may appear at. */
  maxDepth: number;
  /** Relative spawn frequency. */
  frequency: number;
  /** true = this is a boss-tier monster. */
  boss: boolean;
}

type PartialMonster = Partial<MonsterDef> & Pick<MonsterDef, "name" | "maxHP" | "defense" | "accuracy" | "damageMin" | "damageMax">;

function mon(partial: PartialMonster): MonsterDef {
  return {
    article: "a",
    turnsBetweenRegen: 100,
    movementSpeed: 100,
    attackSpeed: 100,
    flying: false,
    swimming: false,
    canOpenDoors: true,
    isLarge: false,
    fiery: false,
    fireImmune: false,
    weaponImmune: false,
    lightRadius: 0,
    minDepth: 1,
    maxDepth: 40,
    frequency: 10,
    boss: false,
    ...partial,
  };
}

/** The bestiary. */
export const MONSTERS: MonsterDef[] = [
  mon({ name: "rat", maxHP: 6, defense: 0, accuracy: 80, damageMin: 1, damageMax: 3, minDepth: 1, maxDepth: 5, frequency: 12 }),
  mon({ name: "kobold", maxHP: 7, defense: 0, accuracy: 80, damageMin: 1, damageMax: 4, minDepth: 1, maxDepth: 6, frequency: 12 }),
  mon({ name: "jackal", maxHP: 8, defense: 0, accuracy: 70, damageMin: 2, damageMax: 4, movementSpeed: 50, minDepth: 1, maxDepth: 3, frequency: 10 }),
  mon({ name: "eel", maxHP: 18, defense: 27, accuracy: 100, damageMin: 3, damageMax: 7, turnsBetweenRegen: 5, movementSpeed: 50, swimming: true, minDepth: 2, maxDepth: 17, frequency: 8 }),
  mon({ name: "monkey", maxHP: 12, defense: 17, accuracy: 100, damageMin: 1, damageMax: 3, minDepth: 2, maxDepth: 9, frequency: 8 }),
  mon({ name: "bloat", maxHP: 4, defense: 0, accuracy: 100, damageMin: 0, damageMax: 0, turnsBetweenRegen: 5, flying: true, minDepth: 2, maxDepth: 13, frequency: 7 }),
  mon({ name: "goblin", maxHP: 15, defense: 10, accuracy: 70, damageMin: 2, damageMax: 5, minDepth: 3, maxDepth: 10, frequency: 11 }),
  mon({ name: "goblin conjurer", maxHP: 10, defense: 10, accuracy: 70, damageMin: 2, damageMax: 4, minDepth: 3, maxDepth: 10, frequency: 5 }),
  mon({ name: "goblin mystic", maxHP: 10, defense: 10, accuracy: 70, damageMin: 2, damageMax: 4, minDepth: 3, maxDepth: 10, frequency: 5 }),
  mon({ name: "goblin totem", maxHP: 30, defense: 0, accuracy: 0, damageMin: 0, damageMax: 0, turnsBetweenRegen: 0, attackSpeed: 300, minDepth: 5, maxDepth: 13, frequency: 3 }),
  mon({ name: "pink jelly", maxHP: 50, defense: 0, accuracy: 85, damageMin: 1, damageMax: 3, turnsBetweenRegen: 0, minDepth: 4, maxDepth: 13, frequency: 6 }),
  mon({ name: "toad", maxHP: 18, defense: 0, accuracy: 90, damageMin: 1, damageMax: 4, minDepth: 4, maxDepth: 11, frequency: 6 }),
  mon({ name: "vampire bat", maxHP: 18, defense: 25, accuracy: 100, damageMin: 2, damageMax: 6, movementSpeed: 50, flying: true, minDepth: 6, maxDepth: 13, frequency: 8 }),
  mon({ name: "acid mound", maxHP: 15, defense: 10, accuracy: 70, damageMin: 1, damageMax: 3, minDepth: 6, maxDepth: 13, frequency: 5 }),
  mon({ name: "centipede", maxHP: 20, defense: 20, accuracy: 80, damageMin: 4, damageMax: 12, minDepth: 7, maxDepth: 14, frequency: 7 }),
  mon({ name: "ogre", maxHP: 55, defense: 60, accuracy: 125, damageMin: 9, damageMax: 13, attackSpeed: 200, isLarge: true, minDepth: 7, maxDepth: 13, frequency: 7 }),
  mon({ name: "spider", maxHP: 20, defense: 70, accuracy: 90, damageMin: 3, damageMax: 4, attackSpeed: 200, minDepth: 9, maxDepth: 16, frequency: 7 }),
  mon({ name: "wraith", maxHP: 50, defense: 60, accuracy: 120, damageMin: 6, damageMax: 13, turnsBetweenRegen: 50, isLarge: true, minDepth: 10, maxDepth: 17, frequency: 6 }),
  mon({ name: "zombie", maxHP: 80, defense: 0, accuracy: 120, damageMin: 7, damageMax: 12, turnsBetweenRegen: 0, isLarge: true, minDepth: 11, maxDepth: 18, frequency: 6 }),
  mon({ name: "troll", maxHP: 65, defense: 70, accuracy: 125, damageMin: 10, damageMax: 15, isLarge: true, minDepth: 12, maxDepth: 19, frequency: 5 }),
  mon({ name: "naga", maxHP: 75, defense: 70, accuracy: 150, damageMin: 7, damageMax: 11, swimming: true, minDepth: 13, maxDepth: 20, frequency: 5 }),
  mon({ name: "salamander", maxHP: 60, defense: 70, accuracy: 150, damageMin: 5, damageMax: 11, fiery: true, fireImmune: true, lightRadius: 3, minDepth: 13, maxDepth: 20, frequency: 5 }),
  mon({ name: "imp", maxHP: 35, defense: 90, accuracy: 225, damageMin: 4, damageMax: 9, lightRadius: 6, minDepth: 17, maxDepth: 24, frequency: 4 }),
  mon({ name: "revenant", maxHP: 30, defense: 0, accuracy: 200, damageMin: 15, damageMax: 20, turnsBetweenRegen: 0, weaponImmune: true, minDepth: 19, maxDepth: 27, frequency: 4 }),
  mon({ name: "lich", maxHP: 35, defense: 80, accuracy: 175, damageMin: 2, damageMax: 6, turnsBetweenRegen: 0, lightRadius: 15, minDepth: 20, maxDepth: 28, frequency: 4 }),
  mon({ name: "dragon", maxHP: 150, defense: 90, accuracy: 250, damageMin: 25, damageMax: 50, movementSpeed: 50, attackSpeed: 200, fireImmune: true, isLarge: true, minDepth: 24, maxDepth: 39, frequency: 3 }),

  // Boss-tier
  mon({ name: "goblin warlord", maxHP: 30, defense: 17, accuracy: 100, damageMin: 3, damageMax: 6, minDepth: 5, maxDepth: 15, frequency: 2, boss: true }),
  mon({ name: "black jelly", maxHP: 120, defense: 0, accuracy: 130, damageMin: 3, damageMax: 8, turnsBetweenRegen: 0, minDepth: 10, maxDepth: 24, frequency: 1, boss: true }),
  mon({ name: "vampire", maxHP: 75, defense: 60, accuracy: 120, damageMin: 4, damageMax: 15, movementSpeed: 50, minDepth: 15, maxDepth: 30, frequency: 1, boss: true }),
  mon({ name: "flamedancer", maxHP: 65, defense: 80, accuracy: 120, damageMin: 3, damageMax: 8, fireImmune: true, fiery: true, lightRadius: 10, minDepth: 18, maxDepth: 32, frequency: 1, boss: true }),
  mon({ name: "stone guardian", maxHP: 1000, defense: 0, accuracy: 200, damageMin: 12, damageMax: 17, turnsBetweenRegen: 0, weaponImmune: true, fireImmune: true, isLarge: true, minDepth: 25, maxDepth: 39, frequency: 1, boss: true }),
  mon({ name: "warden of yendor", maxHP: 1000, defense: 0, accuracy: 300, damageMin: 12, damageMax: 17, turnsBetweenRegen: 0, movementSpeed: 200, attackSpeed: 200, weaponImmune: true, isLarge: true, minDepth: 26, maxDepth: 26, frequency: 1, boss: true }),
];

/** Monster groups: a leader plus a number of followers. */
export interface HordeDef {
  leader: string;
  /** minimum followers */
  min: number;
  /** maximum followers */
  max: number;
  /** clumping factor for the follower count */
  clump: number;
  minDepth: number;
  maxDepth: number;
  frequency: number;
  /** true = the horde only spawns in deep water. */
  aquatic?: boolean;
  /** true = the horde only spawns in lava. */
  fiery?: boolean;
}

export const HORDES: HordeDef[] = [
  { leader: "rat", min: 1, max: 3, clump: 1, minDepth: 1, maxDepth: 5, frequency: 10 },
  { leader: "kobold", min: 1, max: 3, clump: 1, minDepth: 1, maxDepth: 6, frequency: 10 },
  { leader: "jackal", min: 1, max: 3, clump: 1, minDepth: 3, maxDepth: 7, frequency: 8 },
  { leader: "goblin", min: 1, max: 3, clump: 1, minDepth: 3, maxDepth: 10, frequency: 9 },
  { leader: "goblin totem", min: 2, max: 4, clump: 1, minDepth: 5, maxDepth: 13, frequency: 4 },
  { leader: "vampire bat", min: 1, max: 3, clump: 1, minDepth: 6, maxDepth: 13, frequency: 6 },
  { leader: "centipede", min: 1, max: 2, clump: 1, minDepth: 7, maxDepth: 14, frequency: 5 },
  { leader: "ogre", min: 1, max: 2, clump: 1, minDepth: 7, maxDepth: 13, frequency: 5 },
  { leader: "eel", min: 1, max: 4, clump: 1, minDepth: 8, maxDepth: 22, frequency: 4, aquatic: true },
  { leader: "spider", min: 1, max: 2, clump: 1, minDepth: 9, maxDepth: 16, frequency: 5 },
  { leader: "wraith", min: 1, max: 2, clump: 1, minDepth: 10, maxDepth: 17, frequency: 4 },
  { leader: "zombie", min: 1, max: 2, clump: 1, minDepth: 11, maxDepth: 18, frequency: 4 },
  { leader: "troll", min: 1, max: 1, clump: 1, minDepth: 12, maxDepth: 19, frequency: 3 },
  { leader: "naga", min: 1, max: 2, clump: 1, minDepth: 13, maxDepth: 20, frequency: 3, aquatic: true },
  { leader: "salamander", min: 1, max: 2, clump: 1, minDepth: 13, maxDepth: 20, frequency: 3, fiery: true },
  { leader: "ogre shaman", min: 1, max: 3, clump: 1, minDepth: 14, maxDepth: 21, frequency: 3 },
  { leader: "imp", min: 1, max: 2, clump: 1, minDepth: 17, maxDepth: 24, frequency: 3 },
  { leader: "revenant", min: 1, max: 2, clump: 1, minDepth: 19, maxDepth: 27, frequency: 3 },
  { leader: "lich", min: 1, max: 2, clump: 1, minDepth: 20, maxDepth: 28, frequency: 2 },
  { leader: "dragon", min: 1, max: 1, clump: 1, minDepth: 24, maxDepth: 39, frequency: 2 },
];

/** The player base stealth radius (Brogue uses 14 tiles). */
export const PLAYER_STEALTH_RADIUS = 14;

/**
 * Port of Brogue's awareness model.
 *
 *  - Within `awareness` range while unaware: 25% chance to notice.
 *  - Already hunting and out of range: 3% chance to retain tracking.
 *  - Beyond 3x the awareness range: awareness is lost.
 */
export const AWARENESS_MULTIPLIER = 2;
export const AWARENESS_NOTICE_CHANCE = 25;
export const AWARENESS_RETAIN_CHANCE = 3;
export const AWARENESS_MAX_MULTIPLIER = 3;

export function awarenessRange(stealthRadius: number): number {
  return stealthRadius * AWARENESS_MULTIPLIER;
}
