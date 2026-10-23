/**
 * main.ts — Phaser bootstrap.
 *
 * The game is a single WebGL canvas that fills the viewport, works in
 * portrait and landscape, and starts with the title screen.
 */

import Phaser from "phaser";
import { BootScene } from "./game/scenes/BootScene";
import { MenuScene } from "./game/scenes/MenuScene";
import { GameScene } from "./game/scenes/GameScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0d0b09",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%",
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  input: {
    activePointers: 3,
    touch: { capture: true },
  },
  scene: [BootScene, MenuScene, GameScene],
});

// Expose for debugging / E2E checks.
(window as unknown as { __rgl1?: Phaser.Game }).__rgl1 = game;
