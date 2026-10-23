/**
 * difficulty.ts — difficulty tiers.
 *
 * The brief asks for a roguelite that keeps the Brogue feel but is
 * "more accessible for ordinary people". Brogue's default run is brutal:
 * a rat does 3 damage a turn and there are 18 monsters on level 1, so
 * the player dies in about twenty turns.
 *
 * These tiers scale the parts that make Brogue punishing without
 * removing its character:
 *
 *  - `relaxed`  — fewer monsters, gentler damage, slower monsters
 *  - `standard` — Brogue-like numbers, but the player starts tougher
 *  - `brogue`   — the real thing
 */

export type DifficultyId = "relaxed" | "standard" | "brogue";

export interface Difficulty {
  id: DifficultyId;
  name: string;
  description: string;

  /** Multiplier on the number of monsters spawned per level. */
  monsterCount: number;
  /** Multiplier on monster damage. */
  monsterDamage: number;
  /** Multiplier on the player's starting HP. */
  playerHP: number;
  /** Multiplier on the player's starting accuracy. */
  playerAccuracy: number;
  /** Multiplier on the player's starting defence. */
  playerDefense: number;
  /** Extra starting HP regeneration per N turns. */
  regenEvery: number;
  /** How far away monsters spawn, in tiles. */
  minSpawnDistance: number;
  /** Chance a monster notices the player when within awareness range. */
  noticeChance: number;
  /** Healing potion potency multiplier. */
  potionPower: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  relaxed: {
    id: "relaxed",
    name: "SANTAH",
    description: "Monster lebih sedikit dan lebih lemah. Untuk belajar.",
    monsterCount: 0.45,
    monsterDamage: 0.5,
    playerHP: 1.5,
    playerAccuracy: 1.2,
    playerDefense: 1.5,
    regenEvery: 6,
    minSpawnDistance: 14,
    noticeChance: 0.12,
    potionPower: 1.5,
  },
  standard: {
    id: "standard",
    name: "BIASA",
    description: "Seimbang. Jumlah monster seperti Brogue, damage lebih rendah.",
    monsterCount: 0.75,
    monsterDamage: 0.7,
    playerHP: 1.2,
    playerAccuracy: 1.1,
    playerDefense: 1.2,
    regenEvery: 10,
    minSpawnDistance: 11,
    noticeChance: 0.18,
    potionPower: 1.2,
  },
  brogue: {
    id: "brogue",
    name: "BROGUE",
    description: "Murni Brogue. Mati adalah bagian dari permainan.",
    monsterCount: 1,
    monsterDamage: 1,
    playerHP: 1,
    playerAccuracy: 1,
    playerDefense: 1,
    regenEvery: 12,
    minSpawnDistance: 8,
    noticeChance: 0.25,
    potionPower: 1,
  },
};

export const DEFAULT_DIFFICULTY: DifficultyId = "standard";
