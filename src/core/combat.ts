/**
 * combat.ts — faithful port of BrogueCE's combat maths.
 *
 * Source: `src/brogue/Combat.c` and `src/brogue/PowerTables.c`.
 *
 * Key design points that differ from most roguelikes:
 *
 *  1. Armor does NOT subtract a flat damage amount. It raises the
 *     defender's `defense`, which lowers the CHANCE of being hit.
 *
 *  2. `defenseFraction` and `accuracyFraction` are lookup tables in Brogue.
 *     Both are geometric:
 *       defenseFraction  = 0.877347265 ^ (armorPoints / 0.25 ... )
 *       accuracyFraction = 1.065 ^ enchantment
 *     We reproduce them as exact formulas over the same index range.
 *
 *  3. Damage uses `randClump`, which is NOT uniform — it clusters around
 *     the middle of the range.
 *
 *  4. Sneak / sleep / paralysis / lunge multiply damage by 3, and a
 *     dagger-style weapon multiplies it by 5 instead.
 */

import { Rng } from "./rng";
import {
  FP_FACTOR,
  POW_ACCURACY_FRACTION,
  POW_DAMAGE_FRACTION,
  POW_DEFENSE_FRACTION,
  POW_TABLE_LAST_INDEX,
} from "./powerTables";

export { FP_FACTOR };

/**
 * Port of Brogue's `defenseFraction(netDefense)`.
 *
 * Brogue:
 *   idx = clamp(netDefense * 4 / 10 / FP_FACTOR + 80, 0, 210)
 *   return POW_DEFENSE_FRACTION[idx]   // 16.16 fixed point
 *
 * The table is documented as `0.877347265^x`, where x is the change in
 * 0.25 armour points, ranging from -20 to 50.
 *
 * @param defense defence in "armour tenths" (leather armour = 30).
 */
export function defenseFraction(defense: number): number {
  // Brogue: idx = clamp(netDefense * 4 / 10 / FP_FACTOR + 80, 0, 286)
  // netDefense is 16.16 fixed point, so this reduces to
  // idx = (defence_in_tenths * 0.4) + 80.
  const idx = Math.max(
    0,
    Math.min(POW_TABLE_LAST_INDEX, Math.floor(defense * 0.4) + 80)
  );
  return POW_DEFENSE_FRACTION[idx] / FP_FACTOR;
}

/**
 * Port of Brogue's `accuracyFraction(netEnchant)`.
 *
 * @param enchantment enchantment in tenths (a +1 weapon = 10).
 */
export function accuracyFraction(enchantment: number): number {
  const idx = Math.max(
    0,
    Math.min(POW_TABLE_LAST_INDEX, Math.floor(enchantment * 4) + 80)
  );
  return POW_ACCURACY_FRACTION[idx] / FP_FACTOR;
}

/**
 * Port of Brogue's `damageFraction(netEnchant)`.
 * Enchantment also scales damage.
 */
export function damageFraction(enchantment: number): number {
  const idx = Math.max(
    0,
    Math.min(POW_TABLE_LAST_INDEX, Math.floor(enchantment * 4) + 80)
  );
  return POW_DAMAGE_FRACTION[idx] / FP_FACTOR;
}

export interface Combatant {
  maxHP: number;
  hp: number;
  /** Defence in armour tenths (leather armour = 30). */
  defense: number;
  /** Higher accuracy = easier to hit. The player's base accuracy is 100. */
  accuracy: number;
  /** Inclusive damage range. */
  damageMin: number;
  damageMax: number;
  /** Weapon net enchantment, in tenths (a +1 weapon = 10). */
  enchantment: number;
  /** true = cannot be hurt by weapons. */
  immuneToWeapons: boolean;
  /** true = always takes a hit. */
  invulnerable: boolean;
  /** true = this blow is a sneak attack. */
  sneakAttack: boolean;
  /** true = the target is asleep / paralyzed / stuck. */
  targetHelpless: boolean;
  /** true = the weapon grants the 5x sneak multiplier (dagger). */
  weaponHasSneakBonus: boolean;
  /** Turns of haste remaining: the actor acts twice per turn. */
  haste: number;
  /** true = immune to fire damage. */
  fireImmune: boolean;
  /** Turns of darkness remaining: the actor cannot see. */
  darkness: number;
}

export function makeCombatant(partial: Partial<Combatant> = {}): Combatant {
  return {
    maxHP: 20,
    hp: 20,
    defense: 0,
    accuracy: 100,
    damageMin: 1,
    damageMax: 3,
    enchantment: 0,
    immuneToWeapons: false,
    invulnerable: false,
    sneakAttack: false,
    targetHelpless: false,
    weaponHasSneakBonus: false,
    haste: 0,
    fireImmune: false,
    darkness: 0,
    ...partial,
  };
}

/**
 * Port of Brogue's `randClumpedRange(lower, upper, clump)`.
 *
 * The range is modelled as `clump` dice, which approximates a Gaussian
 * distribution centred on the middle of the range. Note Brogue uses
 * `upperBound - lowerBound` (NOT +1) when sizing the dice.
 */
export function randClump(rng: Rng, min: number, max: number, clump = 1): number {
  if (max <= min) return min;
  if (clump <= 1) return rng.range(min, max);

  const span = max - min;
  const numSides = Math.floor(span / clump);

  let total = 0;
  let i = 0;
  for (; i < span % clump; i++) {
    total += rng.range(0, numSides + 1);
  }
  for (; i < clump; i++) {
    total += rng.range(0, numSides);
  }
  return total + min;
}

/**
 * Port of Brogue's `attackHit`.
 * Returns true when the attack connects.
 */
export function attackHit(rng: Rng, attacker: Combatant, defender: Combatant): boolean {
  // Automatically hit if the defender is sleeping, paralyzed, stuck or captive.
  if (defender.targetHelpless) return true;
  if (defender.invulnerable) return true;

  const accuracy = attacker.accuracy * accuracyFraction(attacker.enchantment);
  const hitProbability = Math.max(
    0,
    Math.min(100, accuracy * defenseFraction(defender.defense))
  );
  return rng.percent(hitProbability);
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  killed: boolean;
  /** true = the blow was a sneak / helpless-target hit. */
  critical: boolean;
}

/**
 * Port of Brogue's melee attack resolution.
 */
export function resolveAttack(
  rng: Rng,
  attacker: Combatant,
  defender: Combatant
): AttackResult {
  const sneak = attacker.sneakAttack || defender.targetHelpless;
  const alwaysHits = sneak;

  if (!(alwaysHits || attackHit(rng, attacker, defender))) {
    return { hit: false, damage: 0, killed: false, critical: false };
  }

  let damage: number;
  if (defender.immuneToWeapons || defender.invulnerable) {
    damage = 0;
  } else {
    // Brogue scales weapon damage by damageFraction(netEnchant). We apply
    // it as a ratio against the unenchanted baseline so that a listed
    // damage range means exactly that at zero enchantment.
    const scale = damageFraction(attacker.enchantment) / damageFraction(0);
    damage = Math.max(1, Math.round(randClump(rng, attacker.damageMin, attacker.damageMax) * scale));
  }

  if (sneak) {
    damage *= attacker.weaponHasSneakBonus ? 5 : 3;
  }

  defender.hp -= damage;
  const killed = defender.hp <= 0;
  if (killed) defender.hp = 0;

  return { hit: true, damage, killed, critical: sneak };
}

/**
 * Port of Brogue's displayed armour value: `player.info.defense / 10`.
 * Defence is stored in tenths, so leather armour (30) displays as 3.
 */
export function displayDefense(defense: number): number {
  return Math.floor(defense / 10);
}

/**
 * Port of Brogue's armour computation:
 *   player.info.defense = (theItem->armor * FP_FACTOR + enchant * 10) / FP_FACTOR
 *
 * With `enchant` in 16.16 fixed point, the enchantment term reduces to
 * `enchantPoints * 10` tenths of defence.
 *
 * @param armorTenths the armour item's value in tenths (leather = 30).
 * @param enchantTenths the enchantment in tenths (a +1 weapon = 10).
 */
export function computeDefense(armorTenths: number, enchantTenths: number): number {
  return armorTenths + enchantTenths * 10;
}
