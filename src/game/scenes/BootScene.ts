/**
 * BootScene — generates every texture procedurally, then hands over to the
 * title screen. No binary assets are loaded, so the whole game is one
 * JS bundle plus an HTML shell.
 */

import Phaser from "phaser";
import { paletteForDepth, buildTileTexture, buildActorTexture } from "../art";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    const palette = paletteForDepth(1);
    buildTileTexture(this, palette);
    buildActorTexture(this, palette);

    const el = document.getElementById("boot");
    if (el) {
      el.classList.add("hidden");
      window.setTimeout(() => el.remove(), 500);
    }

    this.scene.start("menu");
  }
}
