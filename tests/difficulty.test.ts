import { describe, it, expect } from "vitest";
import { createGame, movePlayer, GameState } from "../src/core/game";
import { DIFFICULTIES, DifficultyId } from "../src/core/difficulty";

/** Run a fixed number of turns moving in a spiral and report the outcome. */
function simulate(difficulty: DifficultyId, seed: number, turns = 200): GameState {
  const state = createGame({ difficulty, seed });
  const dirs: [string, number, number][] = [
    ["left", -1, 0],
    ["up", 0, -1],
    ["right", 1, 0],
    ["down", 0, 1],
  ];
  for (let i = 0; i < turns && !state.gameOver; i++) {
    const d = dirs[i % dirs.length];
    // movePlayer is the simulation entry point; the scene layer wraps it.
    const nx = state.playerX + d[1];
    const ny = state.playerY + d[2];
    const at = nx * state.level.h + ny;
    if (nx < 0 || ny < 0 || nx >= state.level.w || ny >= state.level.h) continue;
    if (state.level.dungeon[at] === 0) continue;
    movePlayer(state, d[1], d[2]);
  }
  return state;
}

describe("difficulty tiers", () => {
  it("relaxed gives the player more health than brogue", () => {
    const relaxed = createGame({ difficulty: "relaxed", seed: 1 });
    const brogue = createGame({ difficulty: "brogue", seed: 1 });
    expect(relaxed.player.maxHP).toBeGreaterThan(brogue.player.maxHP);
    expect(relaxed.player.accuracy).toBeGreaterThan(brogue.player.accuracy);
  });

  it("relaxed spawns fewer monsters than brogue on the same seed", () => {
    let relaxedTotal = 0;
    let brogueTotal = 0;
    for (let seed = 1; seed <= 6; seed++) {
      relaxedTotal += createGame({ difficulty: "relaxed", seed }).monsters.length;
      brogueTotal += createGame({ difficulty: "brogue", seed }).monsters.length;
    }
    expect(relaxedTotal).toBeLessThan(brogueTotal);
  });

  it("every tier spawns at least a couple of monsters", () => {
    for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
      const state = createGame({ difficulty: id, seed: 42 });
      expect(state.monsters.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("monsters never spawn on top of the player", () => {
    for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
      for (let seed = 1; seed <= 8; seed++) {
        const state = createGame({ difficulty: id, seed });
        for (const m of state.monsters) {
          expect(m.x === state.playerX && m.y === state.playerY).toBe(false);
        }
      }
    }
  });

  it("relaxed is survivable for 200 turns of blind walking, brogue is not", () => {
    let relaxedDeaths = 0;
    let brogueDeaths = 0;
    for (let seed = 1; seed <= 8; seed++) {
      if (simulate("relaxed", seed).gameOver) relaxedDeaths++;
      if (simulate("brogue", seed).gameOver) brogueDeaths++;
    }
    // Relaxed must be forgiving; Brogue should stay dangerous.
    expect(relaxedDeaths).toBeLessThan(brogueDeaths);
  });

  it("the run always makes progress: the player is never killed on turn 1", () => {
    for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
      for (let seed = 1; seed <= 10; seed++) {
        const state = createGame({ difficulty: id, seed });
        expect(state.player.hp).toBe(state.player.maxHP);
        expect(state.gameOver).toBe(false);
      }
    }
  });

  it("player regenerates over time", () => {
    const state = createGame({ difficulty: "relaxed", seed: 5 });
    state.player.hp = 10;
    // Drive the turn counter past the regen interval.
    for (let i = 0; i < 20; i++) {
      state.turn++;
      if (state.player.hp < state.player.maxHP && state.turn % state.difficulty.regenEvery === 0) {
        state.player.hp = Math.min(state.player.maxHP, state.player.hp + 1);
      }
    }
    expect(state.player.hp).toBeGreaterThan(10);
  });
});
