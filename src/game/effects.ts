/**
 * effects.ts — short-lived visual feedback.
 *
 * Covers the feedback the player needs to read the game:
 *  - floating damage numbers when a monster is hit
 *  - a red flash on the player when they take damage
 *  - a "miss" text when an attack misses
 *  - a pickup sparkle
 *  - a short-lived marker where the player last attacked
 */

import Phaser from "phaser";
import { TILE_SIZE } from "./art";

export class Effects {
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layer = scene.add.container(0, 0).setDepth(8);
  }

  /** Floating text that rises and fades. */
  floatText(x: number, y: number, text: string, color = "#ffe08a"): void {
    const t = this.scene.add
      .text(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE, text, {
        fontFamily: "monospace",
        fontSize: "12px",
        color,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);
    this.layer.add(t);

    this.scene.tweens.add({
      targets: t,
      y: t.y - 18,
      alpha: 0,
      duration: 700,
      ease: "Cubic.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  /** A quick expanding ring at a tile (attack, pickup). */
  pulse(x: number, y: number, color = 0xffe08a, radius = 26): void {
    const g = this.scene.add.graphics();
    this.layer.add(g);

    const px = x * TILE_SIZE + TILE_SIZE / 2;
    const py = y * TILE_SIZE + TILE_SIZE / 2;

    g.lineStyle(2, color, 1);
    g.strokeCircle(px, py, 4);

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        g.clear();
        g.lineStyle(2, color, 1 - v);
        g.strokeCircle(px, py, 4 + v * radius);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** A red vignette flash, used when the player is hurt. */
  hurtFlash(): void {
    const { width, height } = this.scene.scale;
    const rect = this.scene.add
      .rectangle(0, 0, width, height, 0xcc2222, 0.35)
      .setOrigin(0)
      .setDepth(15);

    this.scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration: 320,
      onComplete: () => rect.destroy(),
    });
  }

  /** A brief highlight ring on the player. */
  playerFlash(color = 0xffffff): void {
    const g = this.scene.add.graphics();
    this.layer.add(g);

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 200,
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        g.clear();
        g.lineStyle(2, color, 1 - v);
        g.strokeCircle(0, 0, TILE_SIZE * (0.4 + v * 0.5));
      },
      onComplete: () => g.destroy(),
    });
  }

  destroy(): void {
    this.layer.destroy(true);
  }
}
