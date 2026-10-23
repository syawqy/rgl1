/**
 * items.ts — using, equipping and dropping items.
 *
 * Ported from BrogueCE `src/brogue/Items.c`:
 *  - potions and scrolls are single/limited use items that apply an effect
 *  - weapons and armor are equipped and change the player's combat stats
 *  - applying a potion can have a side effect (Brogue's potions are volatile)
 */

import { GameState, Item, pushLog } from "./game";
import { isWalkable } from "./level";

/** What happened when an item was used. */
export interface UseResult {
  ok: boolean;
  message: string;
}

/**
 * Use a potion or scroll: consume a charge and apply its effect.
 */
export function useConsumable(state: GameState, item: Item): UseResult {
  const name = item.def.name.toLowerCase();

  if (name.includes("healing")) {
    if (state.player.hp >= state.player.maxHP) {
      return { ok: false, message: "Kamu sudah darah penuh." };
    }
    const healed = Math.min(state.player.maxHP - state.player.hp, 8 + state.depth);
    state.player.hp += healed;
    item.charges = (item.charges ?? 1) - 1;
    return { ok: true, message: `Kamu merasa lebih baik. (+${healed} HP)` };
  }

  if (name.includes("strength")) {
    item.charges = (item.charges ?? 1) - 1;
    state.player.damageMin += 2;
    state.player.damageMax += 2;
    return { ok: true, message: "Kamu merasa lebih kuat." };
  }

  if (name.includes("speed")) {
    item.charges = (item.charges ?? 1) - 1;
    state.player.haste = 1;
    return { ok: true, message: "Kamu bergerak lebih cepat." };
  }

  if (name.includes("fire immunity")) {
    item.charges = (item.charges ?? 1) - 1;
    state.player.fireImmune = true;
    return { ok: true, message: "Kamu merasa tahan api." };
  }

  if (name.includes("darkness")) {
    item.charges = (item.charges ?? 1) - 1;
    state.player.darkness = 3;
    return { ok: true, message: "Kegelapan menyelimutimu." };
  }

  if (name.includes("identify")) {
    item.charges = (item.charges ?? 1) - 1;
    for (const it of state.inventory) it.identified = true;
    return { ok: true, message: "Kamu memahami milikmu." };
  }

  if (name.includes("magic mapping") || name.includes("aha")) {
    item.charges = (item.charges ?? 1) - 1;
    // Reveal the whole level.
    state.explored.fill(1);
    return { ok: true, message: "Peta level ini terungkap." };
  }

  if (name.includes("light")) {
    item.charges = (item.charges ?? 1) - 1;
    state.playerLight = 14;
    return { ok: true, message: "Area ini terang." };
  }

  if (name.includes("teleport")) {
    item.charges = (item.charges ?? 1) - 1;
    teleportRandomly(state);
    return { ok: true, message: "Kamu terseret ke tempat lain!" };
  }

  return { ok: false, message: "Tidak terjadi apa-apa." };
}

/** Move the player to a random walkable cell on the current level. */
export function teleportRandomly(state: GameState): void {
  const level = state.level;
  const candidates: { x: number; y: number }[] = [];
  for (let x = 1; x < level.w - 1; x++) {
    for (let y = 1; y < level.h - 1; y++) {
      // Only land on genuinely walkable floor — walls, doors and granite
      // are all rejected by isWalkable.
      if (!isWalkable(level, x, y)) continue;
      if (state.items.some((i) => i.x === x && i.y === y)) continue;
      if (state.monsters.some((m) => !m.dead && m.x === x && m.y === y)) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return;
  const pick = candidates[state.rng.int(candidates.length)];
  state.playerX = pick.x;
  state.playerY = pick.y;
}

/**
 * Equip a weapon or a piece of armour, swapping out whatever was worn.
 */
export function equipItem(state: GameState, item: Item): UseResult {
  if (item.def.category === "weapon") {
    state.equippedWeapon = item;
    state.player.damageMin = item.def.damageMin ?? 1;
    state.player.damageMax = item.def.damageMax ?? 3;
    state.player.enchantment = item.def.enchantment ?? 0;
    return { ok: true, message: `Kamu memakai ${item.def.name}.` };
  }

  if (item.def.category === "armor") {
    state.equippedArmor = item;
    state.player.defense = item.def.armorValue ?? 0;
    return { ok: true, message: `Kamu memakai ${item.def.name}.` };
  }

  return { ok: false, message: "Kamu tidak bisa memakai itu." };
}

/**
 * A consumable is used up when its charges run out; a weapon or armour is
 * kept indefinitely. Brogue's `itemIsKnown` / stacking rules are
 * simplified here: one copy of each item name is kept.
 */
export function consumeIfSpent(state: GameState, item: Item): void {
  const charges = item.charges ?? 1;
  if (item.def.category === "potion" || item.def.category === "scroll" || item.def.category === "food") {
    if (charges <= 0) {
      state.inventory = state.inventory.filter((i) => i !== item);
      if (state.equippedWeapon === item) state.equippedWeapon = null;
      if (state.equippedArmor === item) state.equippedArmor = null;
    }
  }
}

/** Drop an item on the floor at the player's position. */
export function dropItem(state: GameState, item: Item): UseResult {
  state.inventory = state.inventory.filter((i) => i !== item);
  item.x = state.playerX;
  item.y = state.playerY;
  state.items.push(item);
  if (state.equippedWeapon === item) {
    state.equippedWeapon = null;
    state.player.damageMin = 1;
    state.player.damageMax = 3;
  }
  if (state.equippedArmor === item) {
    state.equippedArmor = null;
    state.player.defense = 0;
  }
  pushLog(state, `You drop the ${item.def.name}.`);
  return { ok: true, message: `Melepas ${item.def.name}.` };
}

/** Human-readable summary of an item for the inventory panel. */
export function describeItem(item: Item): string {
  const d = item.def;
  const bits: string[] = [];
  if (d.damageMin !== undefined) {
    bits.push(`dmg ${d.damageMin}-${d.damageMax}`);
  }
  if (d.armorValue !== undefined) {
    bits.push(`def ${Math.floor(d.armorValue / 10)}`);
  }
  if (d.enchantment) {
    bits.push(`ench ${(d.enchantment / 10).toFixed(1)}`);
  }
  if (d.lightRadius) {
    bits.push(`light ${d.lightRadius}`);
  }
  if (d.effect) {
    bits.push(d.effect);
  }
  return bits.length ? bits.join(" · ") : "";
}
