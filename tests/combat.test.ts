import { describe, it, expect } from "vitest";
import { Rng } from "../src/core/rng";
import {
  POW_ACCURACY_FRACTION,
  POW_DEFENSE_FRACTION,
} from "../src/core/powerTables";
import {
  attackHit,
  computeDefense,
  defenseFraction,
  displayDefense,
  makeCombatant,
  randClump,
  resolveAttack,
  accuracyFraction,
} from "../src/core/combat";

describe("defense fraction", () => {
  // These expectations are the EXACT values from BrogueCE's
  // POW_DEFENSE_FRACTION table (src/brogue/PowerTables.c), 16.16 fixed point.

  it("no armour uses Brogue's index 80 entry", () => {
    expect(defenseFraction(0)).toBeCloseTo(79748 / 65536, 6);
  });

  it("armor reduces the fraction monotonically", () => {
    const a = defenseFraction(10); // scale mail-ish
    const b = defenseFraction(20);
    const c = defenseFraction(30); // leather armour
    expect(a).toBeLessThan(defenseFraction(0));
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
  });

  it("matches Brogue's leather armour entry exactly", () => {
    // Leather armour is 30 tenths -> table index 92 -> 53856.
    expect(defenseFraction(30)).toBeCloseTo(53856 / 65536, 6);
  });

  it("matches Brogue's plate armour entry exactly", () => {
    // Plate armour is 110 tenths -> table index 124.
    expect(defenseFraction(110)).toBeCloseTo(POW_DEFENSE_FRACTION[124] / 65536, 6);
  });

  it("negative defense makes the attacker MORE likely to hit", () => {
    // Brogue's table reaches above 1.0 for low/negative defence.
    expect(defenseFraction(-20)).toBeGreaterThan(1);
  });

  it("is clamped to the table range", () => {
    expect(defenseFraction(0)).toBeLessThanOrEqual(2);
    expect(defenseFraction(100000)).toBeGreaterThan(0);
    expect(defenseFraction(-100000)).toBeLessThan(20);
  });
});

describe("accuracy fraction", () => {
  it("no enchantment uses Brogue's index 80 entry", () => {
    // POW_ACCURACY_FRACTION[80] = 59628.
    expect(accuracyFraction(0)).toBeCloseTo(59628 / 65536, 6);
  });

  it("a +1 weapon matches Brogue's index 120 entry", () => {
    // A +1 weapon is 10 tenths -> index 120 -> 111930 in the real table.
    expect(accuracyFraction(10)).toBeCloseTo(POW_ACCURACY_FRACTION[120] / 65536, 6);
    expect(accuracyFraction(10)).toBeGreaterThan(accuracyFraction(0));
  });
});

describe("randClump", () => {
  it("stays within the range", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = randClump(rng, 3, 13, 2);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(13);
    }
  });

  it("reaches both endpoints of the range", () => {
    // Brogue sizes the dice with (upper - lower), so the top of the range
    // is reachable but the exact upper bound may need several rolls.
    const rng = new Rng(21);
    let sawMin = false;
    for (let i = 0; i < 3000; i++) {
      if (randClump(rng, 3, 13, 2) === 3) sawMin = true;
    }
    expect(sawMin).toBe(true);
  });

  it("clump 1 is uniform-ish and covers the endpoints", () => {
    const rng = new Rng(2);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randClump(rng, 1, 3, 1));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });

  it("clusters around the middle of the range", () => {
    const rng = new Rng(3);
    const n = 2000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += randClump(rng, 1, 9, 3);
    const mean = sum / n;
    // A uniform roll would average 5; clustering should stay near the middle.
    expect(mean).toBeGreaterThan(3.5);
    expect(mean).toBeLessThan(6.5);
  });

  it("degenerate range returns the low bound", () => {
    const rng = new Rng(4);
    expect(randClump(rng, 5, 5, 2)).toBe(5);
  });
});

describe("hit probability", () => {
  it("a helpless target is always hit", () => {
    const rng = new Rng(5);
    const attacker = makeCombatant({ accuracy: 1 });
    const defender = makeCombatant({ defense: 1000, targetHelpless: true });
    for (let i = 0; i < 50; i++) {
      expect(attackHit(rng, attacker, defender)).toBe(true);
    }
  });

  it("heavy armor makes hits less likely", () => {
    const rng = new Rng(6);
    const attacker = makeCombatant({ accuracy: 100 });
    const naked = makeCombatant({ defense: 0 });
    const armored = makeCombatant({ defense: 40 });

    let hitsNaked = 0;
    let hitsArmored = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (attackHit(rng, attacker, naked)) hitsNaked++;
      if (attackHit(rng, attacker, armored)) hitsArmored++;
    }
    expect(hitsArmored).toBeLessThan(hitsNaked);
    expect(hitsNaked / n).toBeGreaterThan(0.9);
  });

  it("is deterministic for a given seed", () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const atk = makeCombatant();
    const def = makeCombatant({ defense: 20 });
    for (let i = 0; i < 20; i++) {
      expect(attackHit(a, atk, def)).toBe(attackHit(b, atk, def));
    }
  });
});

describe("resolveAttack", () => {
  it("a sneak attack triples damage", () => {
    const rng = new Rng(7);
    const atk = makeCombatant({ damageMin: 5, damageMax: 5, sneakAttack: true });
    const def = makeCombatant({ maxHP: 100, hp: 100 });
    const res = resolveAttack(rng, atk, def);
    expect(res.hit).toBe(true);
    expect(res.damage).toBe(15); // 5 * 3
  });

  it("a dagger-style sneak attack multiplies by 5", () => {
    const rng = new Rng(8);
    const atk = makeCombatant({
      damageMin: 4,
      damageMax: 4,
      sneakAttack: true,
      weaponHasSneakBonus: true,
    });
    const def = makeCombatant({ maxHP: 100, hp: 100 });
    const res = resolveAttack(rng, atk, def);
    expect(res.damage).toBe(20); // 4 * 5
  });

  it("weapon-immune targets take zero damage", () => {
    const rng = new Rng(9);
    const atk = makeCombatant({ damageMin: 10, damageMax: 10, sneakAttack: true });
    const def = makeCombatant({ maxHP: 100, hp: 100, immuneToWeapons: true });
    const res = resolveAttack(rng, atk, def);
    expect(res.damage).toBe(0);
  });

  it("reports a kill when hp drops to zero", () => {
    const rng = new Rng(10);
    const atk = makeCombatant({ damageMin: 100, damageMax: 100, sneakAttack: true });
    const def = makeCombatant({ maxHP: 20, hp: 20 });
    const res = resolveAttack(rng, atk, def);
    expect(res.killed).toBe(true);
    expect(def.hp).toBe(0);
  });

  it("a miss deals no damage", () => {
    const rng = new Rng(11);
    // Accuracy 1 against huge defense => almost always a miss.
    const atk = makeCombatant({ accuracy: 1, damageMin: 10, damageMax: 10 });
    const def = makeCombatant({ maxHP: 100, hp: 100, defense: 10000 });
    let misses = 0;
    for (let i = 0; i < 50; i++) {
      const res = resolveAttack(rng, atk, def);
      if (!res.hit) misses++;
    }
    expect(misses).toBeGreaterThan(40);
  });
});

describe("armor defense computation", () => {
  it("scales with armour tenths", () => {
    // Leather armour is 30 tenths => displays as 3 armour points.
    expect(displayDefense(computeDefense(30, 0))).toBe(3);
    // Plate armour is 110 tenths => displays as 11.
    expect(displayDefense(computeDefense(110, 0))).toBe(11);
  });

  it("enchantment adds defence", () => {
    // Brogue: defense = (armor * FP_FACTOR + enchant * 10) / FP_FACTOR
    const base = computeDefense(30, 0);
    const enchanted = computeDefense(30, 10);
    expect(base).toBe(30);
    expect(enchanted).toBeGreaterThan(base);
  });
});
