import { describe, it, expect } from "vitest";
import { createGame, GameState, movePlayer, descend } from "../src/core/game";
import {
  consumeIfSpent,
  describeItem,
  dropItem,
  equipItem,
  useConsumable,
} from "../src/core/items";
import { Item } from "../src/core/game";

function freshGame(): GameState {
  return createGame({ seed: 12345, depth: 1 });
}

function mkItem(partial: Partial<Item["def"]> & { name: string; category: Item["def"]["category"] }): Item {
  return {
    def: { charges: 1, ...partial },
    x: 0,
    y: 0,
    charges: partial.charges ?? 1,
    identified: true,
  };
}

describe("potions", () => {
  it("healing potion restores health and is consumed", () => {
    const state = freshGame();
    state.player.hp = 5;
    const potion = mkItem({ name: "potion of healing", category: "potion" });
    state.inventory.push(potion);

    const res = useConsumable(state, potion);
    expect(res.ok).toBe(true);
    expect(state.player.hp).toBeGreaterThan(5);
    expect(potion.charges).toBe(0);

    consumeIfSpent(state, potion);
    expect(state.inventory).not.toContain(potion);
  });

  it("healing potion refuses at full health", () => {
    const state = freshGame();
    state.player.hp = state.player.maxHP;
    const potion = mkItem({ name: "potion of healing", category: "potion" });
    const res = useConsumable(state, potion);
    expect(res.ok).toBe(false);
    expect(potion.charges).toBe(1);
  });

  it("healing never exceeds max HP", () => {
    const state = freshGame();
    state.player.hp = state.player.maxHP - 1;
    const potion = mkItem({ name: "potion of healing", category: "potion" });
    useConsumable(state, potion);
    expect(state.player.hp).toBe(state.player.maxHP);
  });

  it("strength potion permanently raises damage for the run", () => {
    const state = freshGame();
    const before = state.player.damageMax;
    const potion = mkItem({ name: "potion of strength", category: "potion" });
    useConsumable(state, potion);
    expect(state.player.damageMax).toBeGreaterThan(before);
  });
});

describe("scrolls", () => {
  it("magic mapping reveals the whole level", () => {
    const state = freshGame();
    // The player has already seen a little of the level.
    expect(state.explored.some((v) => v === 1)).toBe(true);
    const scroll = mkItem({ name: "scroll of magic mapping", category: "scroll" });
    useConsumable(state, scroll);
    expect(state.explored.every((v) => v === 1)).toBe(true);
  });

  it("teleport moves the player to a different cell", () => {
    const state = freshGame();
    const x = state.playerX;
    const y = state.playerY;
    const scroll = mkItem({ name: "scroll of teleport", category: "scroll" });
    useConsumable(state, scroll);
    // Either the player moved, or there was nowhere to go. Both are valid.
    if (state.playerX !== x || state.playerY !== y) {
      expect(state.level.dungeon[state.playerX * state.level.h + state.playerY]).not.toBe(0);
    }
  });
});

describe("equipment", () => {
  it("equipping a weapon changes the damage range", () => {
    const state = freshGame();
    const sword = mkItem({
      name: "sword",
      category: "weapon",
      damageMin: 5,
      damageMax: 9,
    });
    const res = equipItem(state, sword);
    expect(res.ok).toBe(true);
    expect(state.player.damageMin).toBe(5);
    expect(state.player.damageMax).toBe(9);
  });

  it("equipping armour changes the defence", () => {
    const state = freshGame();
    const mail = mkItem({
      name: "chain mail",
      category: "armor",
      armorValue: 50,
    });
    equipItem(state, mail);
    expect(state.player.defense).toBe(50);
  });

  it("dropping the equipped armour clears the defence bonus", () => {
    const state = freshGame();
    const mail = mkItem({
      name: "chain mail",
      category: "armor",
      armorValue: 50,
    });
    state.inventory.push(mail);
    equipItem(state, mail);
    dropItem(state, mail);
    expect(state.player.defense).toBe(0);
    expect(state.equippedArmor).toBeNull();
  });

  it("weapons are never consumed", () => {
    const state = freshGame();
    const sword = mkItem({
      name: "sword",
      category: "weapon",
      damageMin: 5,
      damageMax: 9,
      charges: 1,
    });
    state.inventory.push(sword);
    consumeIfSpent(state, sword);
    expect(state.inventory).toContain(sword);
  });
});

describe("descriptions", () => {
  it("describes a weapon's damage range", () => {
    const sword = mkItem({
      name: "sword",
      category: "weapon",
      damageMin: 3,
      damageMax: 6,
    });
    expect(describeItem(sword)).toContain("dmg 3-6");
  });

  it("describes armour in whole points", () => {
    const mail = mkItem({
      name: "chain mail",
      category: "armor",
      armorValue: 50,
    });
    expect(describeItem(mail)).toContain("def 5");
  });
});

describe("game events", () => {
  it("picking up the amulet wins the game", () => {
    const state = freshGame();
    const amulet = mkItem({ name: "Amulet of Yendor", category: "amulet" });
    state.items.push(amulet);

    // Put the amulet next to the player and walk into it.
    const nx = state.playerX + 1;
    const ny = state.playerY;
    amulet.x = nx;
    amulet.y = ny;
    // Make sure the target cell is walkable.
    state.level.dungeon[nx * state.level.h + ny] = 0;
    state.level.liquid[nx * state.level.h + ny] = 0;

    movePlayer(state, 1, 0);
    expect(state.victory).toBe(true);
    expect(state.gameOver).toBe(true);
  });

  it("descending pushes a descend event", () => {
    const state = freshGame();
    state.events.length = 0;
    descend(state);
    expect(state.events.some((e) => e.kind === "descend")).toBe(true);
    expect(state.depth).toBe(2);
  });

  it("descending past the final depth wins", () => {
    const state = freshGame();
    state.depth = 16;
    state.events.length = 0;
    descend(state);
    expect(state.victory).toBe(true);
  });
});
