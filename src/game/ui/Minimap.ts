/**
 * Minimap — a small overview of the level.
 *
 * A phone screen cannot show a whole dungeon at a readable tile size, so
 * the minimap gives the player a sense of the layout: walls in grey,
 * explored floor in tan, the stairs in blue, the player in gold, and
 * monsters only where they are actually visible.
 */

import Phaser from "phaser";
import { D } from "../../core/terrain";
import { GameState } from "../../core/game";

/** Canvas pixels per dungeon tile in the minimap texture. */
const TILE = 4;

export class Minimap {
  private image: Phaser.GameObjects.Image;
  private key = "rgl1-minimap";
  private state: GameState;
  private size: number;
  private scene: Phaser.Scene;
  private x: number;
  private y: number;

  constructor(scene: Phaser.Scene, state: GameState, x: number, y: number, size: number) {
    this.state = state;
    this.size = size;
    this.scene = scene;
    this.x = x;
    this.y = y;

    const h = size * (state.level.h / state.level.w);
    // The panel is positioned from these fields.

    // A framed panel so the minimap reads as a widget and not a stray
    // part of the dungeon. The label sits inside the frame so the panel
    // needs no extra clearance above it.
    const frame = scene.add.graphics().setDepth(11);
    frame.fillStyle(0x1a1610, 0.95);
    frame.fillRoundedRect(this.x - 4, this.y - 4, this.size + 8, h + 8, 6);
    frame.lineStyle(1.5, 0x6b5f4a, 0.95);
    frame.strokeRoundedRect(this.x - 4, this.y - 4, this.size + 8, h + 8, 6);

    scene.add
      .text(this.x + 2, this.y + 1, "PETA", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#c8b48a",
        backgroundColor: "rgba(10,8,6,0.8)",
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0, 0)
      .setDepth(13);

    this.image = scene.add.image(x, y, this.key).setOrigin(0, 0).setDepth(12);
    this.draw();
  }

  draw(): void {
    const level = this.state.level;
    const w = level.w;
    const h = level.h;

    const canvas = document.createElement("canvas");
    canvas.width = w * TILE;
    canvas.height = h * TILE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = x * h + y;
        const d = level.dungeon[at];
        if (!this.state.explored[at]) continue;

        if (d === D.WALL || d === D.GRANITE) {
          ctx.fillStyle = "#5a5044";
        } else if (d === D.DOOR || d === D.SECRET_DOOR) {
          ctx.fillStyle = "#c08a44";
        } else if (d === D.STAIRS_DOWN) {
          ctx.fillStyle = "#5a9ad4";
        } else if (d === D.STAIRS_UP) {
          ctx.fillStyle = "#d4a843";
        } else {
          ctx.fillStyle = "#9a8a68";
        }
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Monsters, only where the player can actually see them.
    for (const m of this.state.monsters) {
      if (m.dead) continue;
      const at = m.x * h + m.y;
      if (!this.state.visible[at]) continue;
      ctx.fillStyle = "#e05a4a";
      ctx.fillRect(m.x * TILE - 1, m.y * TILE - 1, TILE + 2, TILE + 2);
    }

    // Items.
    for (const item of this.state.items) {
      const at = item.x * h + item.y;
      if (!this.state.explored[at]) continue;
      ctx.fillStyle = "#88ddff";
      ctx.fillRect(item.x * TILE, item.y * TILE, TILE, TILE);
    }

    // The player.
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(
      this.state.playerX * TILE - 2,
      this.state.playerY * TILE - 2,
      TILE + 4,
      TILE + 4
    );

    const scene = this.image.scene;
    if (scene.textures.exists(this.key)) {
      scene.textures.remove(this.key);
    }
    scene.textures.addCanvas(this.key, canvas);
    this.image.setTexture(this.key);
    // `setTexture` resets the display size, so it has to be re-applied.
    this.image.setDisplaySize(this.size, this.size * (h / w));
  }

  /** Move the minimap panel (used when the HUD height changes). */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const h = this.size * (this.state.level.h / this.state.level.w);

    const frame = this.scene.children.list.find(
      (o) => o instanceof Phaser.GameObjects.Graphics && o.depth === 11
    ) as Phaser.GameObjects.Graphics | undefined;
    if (frame) {
      frame.clear();
      frame.fillStyle(0x1a1610, 0.95);
      frame.fillRoundedRect(x - 4, y - 4, this.size + 8, h + 8, 6);
      frame.lineStyle(1.5, 0x6b5f4a, 0.95);
      frame.strokeRoundedRect(x - 4, y - 4, this.size + 8, h + 8, 6);
    }

    this.image.setPosition(x, y);
    const label = this.scene.children.list.find(
      (o) => o instanceof Phaser.GameObjects.Text && o.text === "PETA"
    ) as Phaser.GameObjects.Text | undefined;
    if (label) label.setPosition(x + 2, y + 1);
  }

  destroy(): void {
    this.image.destroy();
  }
}
