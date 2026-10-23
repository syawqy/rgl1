/**
 * GameScene.ts — the main play scene.
 *
 * Rendering strategy: the whole level is drawn to ONE canvas texture per
 * layer (floor, walls, liquid), so a 51x25 dungeon costs 3 draw calls
 * instead of 1275 sprites. Actors and the light mask are drawn on top.
 */

import Phaser from "phaser";
import {
  createGame,
  descend,
  GameState,
  movePlayer,
  refreshVision,
  updatePlayerLight,
  isDeadlyLiquid,
} from "../../core/game";
import { D, L } from "../../core/terrain";
import { bfsDistanceMap } from "../../core/level";
import { InventoryPanel } from "../ui/InventoryPanel";
import { PausePanel } from "../ui/PausePanel";
import { Minimap } from "../ui/Minimap";
import { Audio } from "../audio";
import { Effects } from "../effects";
import { DifficultyId } from "../../core/difficulty";
import { controlInsets } from "../touch";
import {
  ACTOR,
  Palette,
  TILE_SIZE,
  actorFrame,
  buildActorTexture,
  buildTileTexture,
  frameForItem,
  frameForMonster,
  paletteForDepth,
} from "../art";
import { TouchControls, defaultLayout, GameAction } from "../touch";

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private palette!: Palette;
  private tileKey = "";
  private actorKey = "";

  /** Layer images. */
  private floorLayer!: Phaser.GameObjects.Image;
  private wallLayer!: Phaser.GameObjects.Image;
  private liquidLayer!: Phaser.GameObjects.Image;
  private lightMask!: Phaser.GameObjects.Image;
  private actorLayer!: Phaser.GameObjects.Container;
  /** Holds the whole map in screen space so it can be centred exactly. */
  private mapContainer!: Phaser.GameObjects.Container;
  /** Where the map container sits on screen, for converting taps to tiles. */
  private mapOrigin = { x: 0, y: 0, zoom: 1 };

  /** UI. */
  private hud!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private logPanel!: Phaser.GameObjects.Graphics;
  private controlsGraphics!: Phaser.GameObjects.Graphics;
  private controlsLabel: Phaser.GameObjects.Text[] = [];

  private controls!: TouchControls;
  private effects!: Effects;
  private inventoryPanel: InventoryPanel | null = null;
  private pausePanel: PausePanel | null = null;
  private minimap: Minimap | null = null;
  private audio = new Audio();
  private busy = false;

  constructor() {
    super("game");
  }

  create(): void {
    // The difficulty is chosen on the title screen and passed in through
    // the scene's data.
    const data = (this.scene.settings.data ?? {}) as { difficulty?: DifficultyId };
    this.state = createGame({
      seed: (Math.random() * 0xffffffff) >>> 0,
      difficulty: data.difficulty,
    });
    this.palette = paletteForDepth(this.state.depth);

    this.tileKey = buildTileTexture(this, this.palette);
    this.actorKey = buildActorTexture(this, this.palette);

    this.effects = new Effects(this);
    this.buildLayers();
    this.buildUI();
    this.buildMinimap();
    this.setupInput();
    this.redraw();

    this.scale.on("resize", () => {
      this.layoutCamera();
      this.redraw();
    });
    this.layoutCamera();
    this.redraw();
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  private buildLayers(): void {
    const level = this.state.level;
    const w = level.w * TILE_SIZE;
    const h = level.h * TILE_SIZE;

    // The map lives in a container that is positioned in screen space.
    // That lets us centre the level precisely between the HUD strip and
    // the touch controls, with no camera scroll maths involved.
    this.mapContainer = this.add.container(0, 0).setDepth(0);

    this.floorLayer = this.add.image(0, 0, this.tileKey).setOrigin(0);
    this.wallLayer = this.add.image(0, 0, this.tileKey).setOrigin(0);
    this.liquidLayer = this.add.image(0, 0, this.tileKey).setOrigin(0);
    this.lightMask = this.add.image(0, 0, this.tileKey).setOrigin(0);
    this.actorLayer = this.add.container(0, 0);

    this.mapContainer.add([
      this.floorLayer,
      this.wallLayer,
      this.liquidLayer,
      this.lightMask,
      this.actorLayer,
    ]);

    void w;
    void h;
  }

  /**
   * How wide the HUD block may be. In landscape the HUD shares the
   * screen with the map, so it has to stay inside the left column.
   */
  private hudWidth(): number {
    const w = this.scale.width;
    if (this.scale.height < w) {
      // Landscape: the HUD column is the same width the map is inset by.
      return Math.min(200, w * 0.26) - 12;
    }
    return Math.min(268, w * 0.68);
  }

  private buildUI(): void {

    this.hud = this.add
      .text(6, 4, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e8e0d0",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: 6, y: 4 },
        lineSpacing: 2,
        fixedWidth: this.hudWidth(),
      })
      .setOrigin(0, 0)
      .setDepth(10)
      .setScrollFactor(0);

    // The message bar lives directly under the HUD, not at the bottom:
    // the bottom strip belongs to the touch controls.
    // A slim log strip. The bottom of the screen belongs to the touch
    // controls, so the log lives directly under the HUD instead.
    // The log strip gets its own bordered panel so it reads as a
    // message log and not as more HUD text.
    this.logPanel = this.add.graphics().setDepth(9).setScrollFactor(0);

    this.messageText = this.add
      .text(8, 4, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#c8bfae",
        backgroundColor: "rgba(12,10,8,0.9)",
        padding: { x: 5, y: 3 },
        lineSpacing: 1,
        fixedWidth: this.hudWidth(),
        fixedHeight: 18,
      })
      .setOrigin(0, 0)
      .setDepth(10)
      .setScrollFactor(0);

    this.controlsGraphics = this.add.graphics().setDepth(9).setScrollFactor(0);
  }

  private buildMinimap(): void {
    const size = Math.min(104, this.scale.width * 0.25);
    // The minimap lives in the left column, below the HUD and the log
    // strip. The pause button owns the top-right corner, so putting the
    // minimap there made the two overlap.
    const x = 8;
    // Clear of the HUD block and the log strip below it.
    const y = this.messageText.y + this.messageText.height + 8;
    this.minimap = new Minimap(this, this.state, x, y, size);
  }

  private layoutCamera(): void {
    const level = this.state.level;
    const viewW = this.scale.width;
    const viewH = this.scale.height;

    // The map is drawn in screen space inside a container, so the camera
    // stays at 1:1 and we only scale and position the container. This
    // lets us centre the level precisely between the HUD strip and the
    // touch controls.
    const worldW = level.w * TILE_SIZE;
    const worldH = level.h * TILE_SIZE;

    // The play area is the screen minus the HUD strip on top and the
    // touch controls at the bottom.
    //
    // The insets adapt to the aspect ratio. In landscape the screen is
    // short, so the controls need proportionally more room or they sit
    // on top of the dungeon. The left column (HUD + minimap) also takes
    // horizontal space in landscape.
    const portrait = viewH >= viewW;

    // Bottom inset comes from the real control layout, so the map can
    // never end up underneath the d-pad or the action buttons.
    const insets = controlInsets(viewW, viewH);
    const bottomInset = Math.max(96, insets.bottom + 10);

    // Top inset clears the HUD block and the log strip.
    const topInset = portrait ? 92 : 68;

    // In landscape the HUD column sits beside the map, so the map is
    // inset to the right of it.
    const sideInset = portrait ? 0 : Math.min(200, viewW * 0.26);

    const visibleH = viewH - topInset - bottomInset;
    const visibleW = viewW - sideInset;
    const zoomWidth = (visibleW - 8) / worldW;
    const zoomHeight = visibleH / worldH;
    // The whole level is always visible, so the zoom may go below 1:1 in
    // a short landscape viewport. Forcing a minimum of 0.45 would make
    // the map overflow into the touch controls.
    const zoom = Math.max(0.18, Math.min(1.4, zoomWidth, zoomHeight));

    this.mapContainer.setScale(zoom);

    // Centre the map in the play area: horizontally in the space beside
    // the left column, vertically between the HUD and the controls.
    const dispW = worldW * zoom;
    const dispH = worldH * zoom;
    const originX = sideInset + (visibleW - dispW) / 2;
    const originY = topInset + (visibleH - dispH) / 2;
    this.mapContainer.setPosition(originX, originY);

    this.mapOrigin = { x: originX, y: originY, zoom };
  }

  /** Redraw the level into the layer canvases. */
  private redraw(): void {
    const level = this.state.level;
    const w = level.w;
    const h = level.h;
    const px = w * TILE_SIZE;
    const py = h * TILE_SIZE;
    const TS = TILE_SIZE;

    const floor = document.createElement("canvas");
    floor.width = px;
    floor.height = py;
    const fctx = floor.getContext("2d")!;

    const wall = document.createElement("canvas");
    wall.width = px;
    wall.height = py;
    const wctx = wall.getContext("2d")!;

    const liquid = document.createElement("canvas");
    liquid.width = px;
    liquid.height = py;
    const lctx = liquid.getContext("2d")!;

    const pal = this.palette;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = x * h + y;
        const d = level.dungeon[at];
        const l = level.liquid[at];
        const dx = x * TS;
        const dy = y * TS;
        const variant = (x * 7 + y * 13) & 3;

        // ---- Floor under everything ----
        fctx.fillStyle = variant % 2 === 0 ? pal.floor : pal.floorAlt;
        fctx.fillRect(dx, dy, TS, TS);
        fctx.fillStyle = "rgba(0,0,0,0.14)";
        fctx.fillRect(dx, dy, TS, 1);
        fctx.fillRect(dx, dy, 1, TS);
        // A subtle vertical gradient makes the floor read as a surface
        // rather than a flat colour block.
        fctx.fillStyle = "rgba(255,255,255,0.035)";
        fctx.fillRect(dx, dy + 1, TS, 2);

        // ---- Walls ----
        if (d === D.WALL) {
          const above = y > 0 ? level.dungeon[x * h + (y - 1)] : D.GRANITE;
          const isTop = above !== D.WALL && above !== D.GRANITE;
          wctx.fillStyle = isTop ? pal.wallTop : pal.wall;
          wctx.fillRect(dx, dy, TS, TS);
          wctx.fillStyle = "rgba(255,255,255,0.10)";
          wctx.fillRect(dx, dy, TS, isTop ? 3 : 2);
          // A dark drop edge separates the wall from whatever is below.
          wctx.fillStyle = "rgba(0,0,0,0.45)";
          wctx.fillRect(dx, dy + TS - 2, TS, 2);
          wctx.fillRect(dx + TS - 1, dy, 1, TS);
        } else if (d === D.GRANITE) {
          wctx.fillStyle = pal.granite;
          wctx.fillRect(dx, dy, TS, TS);
          wctx.fillStyle = "rgba(0,0,0,0.35)";
          wctx.fillRect(dx, dy + TS - 1, TS, 1);
        } else if (d === D.DOOR) {
          wctx.fillStyle = pal.door;
          wctx.fillRect(dx, dy, TS, TS);
          wctx.fillStyle = "rgba(0,0,0,0.28)";
          for (let i = 1; i < 4; i++) wctx.fillRect(dx + i * 6, dy + 2, 1, TS - 4);
          wctx.fillStyle = "#d8c07a";
          wctx.fillRect(dx + TS - 7, dy + TS / 2 - 1, 3, 3);
        } else if (d === D.SECRET_DOOR) {
          wctx.fillStyle = pal.secretDoor;
          wctx.fillRect(dx, dy, TS, TS);
          wctx.strokeStyle = "rgba(0,0,0,0.45)";
          wctx.lineWidth = 1;
          wctx.beginPath();
          wctx.moveTo(dx + 4, dy + 4);
          wctx.lineTo(dx + TS - 5, dy + TS - 5);
          wctx.stroke();
        } else if (d === D.STAIRS_UP || d === D.STAIRS_DOWN) {
          wctx.fillStyle = pal.floorAlt;
          wctx.fillRect(dx, dy, TS, TS);
          wctx.fillStyle = "rgba(0,0,0,0.32)";
          if (d === D.STAIRS_UP) {
            for (let i = 0; i < 4; i++) wctx.fillRect(dx + 3, dy + TS - 4 - i * 5, TS - 6, 3);
          } else {
            for (let i = 0; i < 4; i++) wctx.fillRect(dx + 3, dy + 4 + i * 5, TS - 6, 3);
          }
        }

        // ---- Liquid ----
        if (l === L.SHALLOW_WATER) {
          lctx.fillStyle = pal.water;
          lctx.fillRect(dx, dy, TS, TS);
          lctx.fillStyle = "rgba(255,255,255,0.12)";
          lctx.fillRect(dx + 2, dy + 6, 10, 1);
        } else if (l === L.DEEP_WATER) {
          lctx.fillStyle = pal.deepWater;
          lctx.fillRect(dx, dy, TS, TS);
          lctx.fillStyle = "rgba(255,255,255,0.07)";
          lctx.fillRect(dx + 4, dy + 8, 14, 1);
        } else if (l === L.LAVA) {
          lctx.fillStyle = pal.lava;
          lctx.fillRect(dx, dy, TS, TS);
          lctx.fillStyle = "rgba(255,220,120,0.55)";
          lctx.fillRect(dx + 3, dy + 7, 8, 2);
        } else if (l === L.CHASM) {
          lctx.fillStyle = pal.chasm;
          lctx.fillRect(dx, dy, TS, TS);
        } else if (l === L.BRIDGE) {
          lctx.fillStyle = pal.bridge;
          lctx.fillRect(dx, dy, TS, TS);
          lctx.fillStyle = "rgba(0,0,0,0.30)";
          for (let i = 1; i < 4; i++) lctx.fillRect(dx, dy + i * 6, TS, 1);
        }
      }
    }

    this.replaceTexture(this.floorLayer, floor, "rgl1-floor");
    this.replaceTexture(this.wallLayer, wall, "rgl1-wall");
    this.replaceTexture(this.liquidLayer, liquid, "rgl1-liquid");

    this.drawLightMask();
    this.drawActors();
    this.drainEvents();
    this.updateHud();
    this.minimap?.draw();
  }

  private replaceTexture(
    image: Phaser.GameObjects.Image,
    canvas: HTMLCanvasElement,
    key: string
  ): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
    image.setTexture(key);
  }

  /**
   * The light mask: a black overlay with holes punched where the player
   * can see. Everything the player has not seen stays black.
   */
  private drawLightMask(): void {
    const level = this.state.level;
    const w = level.w;
    const h = level.h;
    const TS = TILE_SIZE;

    const canvas = document.createElement("canvas");
    canvas.width = w * TS;
    canvas.height = h * TS;
    const ctx = canvas.getContext("2d")!;

    // Start fully black: unexplored territory is hidden.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w * TS, h * TS);

    // Two tiers, Brogue-style:
    //   - explored but not currently visible -> dim "memory" of the room
    //   - currently visible                   -> full brightness
    // We erase the black with `destination-out`, so the erase amount is
    // the inverse of how dark the cell should look.
    ctx.globalCompositeOperation = "destination-out";

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = x * h + y;
        const visible = this.state.visible[at] !== 0;
        const explored = this.state.explored[at] !== 0;
        if (!visible && !explored) continue;

        const lit = Math.max(0, Math.min(1, this.state.intensity[at]));
        // Visible cells: erase the darkness completely, with only a
        // slight dimming at the very edge of the light radius.
        // Explored cells: keep a dim but readable memory. Walls are
        // painted darker than the floor anyway, so they need a lighter
        // erase than the floor does to stay legible.
        const isWall =
          level.dungeon[at] === D.WALL || level.dungeon[at] === D.GRANITE;
        const erase = visible
          ? 1 - (1 - lit) * 0.12
          : isWall
            ? 0.5
            : 0.68;
        if (erase <= 0.01) continue;

        ctx.fillStyle = `rgba(0,0,0,${erase})`;
        ctx.fillRect(x * TS, y * TS, TS, TS);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    this.replaceTexture(this.lightMask, canvas, "rgl1-light");
    this.lightMask.setAlpha(1);
  }

  private drawActors(): void {
    this.actorLayer.removeAll(true);

    const TS = TILE_SIZE;

    // Items: only render what the player has actually seen.
    for (const item of this.state.items) {
      const at = item.x * this.state.level.h + item.y;
      if (!this.state.explored[at]) continue;
      const img = this.add.image(
        item.x * TS + TS / 2,
        item.y * TS + TS / 2,
        this.actorKey,
        actorFrame(frameForItem(item.def.category))
      );
      img.setDisplaySize(TS * 0.8, TS * 0.8);
      // Remembered items are dimmed, visible ones are bright.
      img.setAlpha(this.state.visible[at] ? 1 : 0.5);
      this.actorLayer.add(img);
    }

    // Monsters.
    for (const m of this.state.monsters) {
      if (m.dead) continue;
      const at = m.x * this.state.level.h + m.y;
      if (!this.state.explored[at]) continue;
      const img = this.add.image(
        m.x * TS + TS / 2,
        m.y * TS + TS / 2,
        this.actorKey,
        actorFrame(frameForMonster(m.def.name))
      );
      img.setDisplaySize(TS * 1, TS * 1);
      img.setAlpha(this.state.visible[at] ? 1 : 0.55);
      this.actorLayer.add(img);
    }

    // The player, with a gold ring underneath so the eye finds it
    // instantly among the monsters.
    const px = this.state.playerX * TS + TS / 2;
    const py = this.state.playerY * TS + TS / 2;

    // The player gets a bright ring plus a soft glow so the eye finds
    // it instantly, even in a busy room.
    const ring = this.add.graphics();
    ring.fillStyle(0xffd873, 0.14);
    ring.fillCircle(px, py, TS * 0.5);
    ring.lineStyle(2.5, 0xffd873, 1);
    ring.strokeCircle(px, py, TS * 0.46);
    this.actorLayer.add(ring);

    const player = this.add.image(
      px,
      py,
      this.actorKey,
      actorFrame(ACTOR.PLAYER)
    );
    player.setDisplaySize(TS * 1.15, TS * 1.15);
    this.actorLayer.add(player);
  }

  /**
   * Drain the simulation's event queue and turn it into visual feedback.
   */
  private drainEvents(): void {
    const events = this.state.events;
    if (events.length === 0) return;

    for (const ev of events) {
      switch (ev.kind) {
        case "hit": {
          this.audio.play("hit");
          this.effects.floatText(
            ev.x,
            ev.y,
            `${ev.damage}`,
            ev.critical ? "#ff9a4a" : "#ffe08a"
          );
          this.effects.pulse(ev.x, ev.y, ev.critical ? 0xff9a4a : 0xffe08a);
          break;
        }
        case "miss":
          this.audio.play("miss");
          this.effects.floatText(ev.x, ev.y, "miss", "#9aa4b0");
          break;
        case "playerHurt":
          this.audio.play("hurt");
          this.effects.floatText(ev.x, ev.y, `-${ev.damage}`, "#ff8080");
          this.effects.hurtFlash();
          break;
        case "playerDied":
          this.audio.play("hurt");
          this.effects.hurtFlash();
          break;
        case "monsterDied":
          this.audio.play("kill");
          this.effects.pulse(ev.x, ev.y, 0xcc6644, 34);
          this.effects.floatText(ev.x, ev.y, "x", "#cc6644");
          break;
        case "pickup":
          this.audio.play("pickup");
          this.effects.pulse(ev.x, ev.y, 0x88ddff, 22);
          break;
        case "descend":
          this.audio.play("descend");
          this.effects.floatText(this.state.playerX, this.state.playerY, "▼", "#d4a843");
          break;
        case "message":
          break;
      }
    }
    events.length = 0;
  }

  private updateHud(): void {
    const s = this.state;
    const hpBar = "█".repeat(Math.max(0, s.player.hp)).padEnd(20, "░");
    const lines = [
      `L${s.depth}  ATK ${s.player.damageMin}-${s.player.damageMax}  DEF ${Math.floor(s.player.defense / 10)}`,
      `HP ${hpBar} ${s.player.hp}/${s.player.maxHP}`,
      `Skor ${s.score}  Giliran ${s.turn}`,
    ];

    // Show the difficulty tier and a hint when standing on the stairs.
    const diff = s.difficulty.name;
    const onStairs =
      s.level.stairsDown &&
      s.level.stairsDown.x === s.playerX &&
      s.level.stairsDown.y === s.playerY;
    lines.push(onStairs ? `${diff}  ·  ▼ tekan TURUN` : diff);

    this.hud.setText(lines.join("\n"));

    // A single log line below the HUD block, truncated so it never
    // wraps into an orphaned fragment.
    const raw = s.log[0] ?? "";
    const oneLine = raw.length > 34 ? raw.slice(0, 33) + "…" : raw;
    this.messageText.setText(oneLine);
    this.messageText.setPosition(8, this.hud.y + this.hud.height + 6);

    // Panel behind the log strip.
    this.logPanel.clear();
    this.logPanel.fillStyle(0x0c0a08, 0.9);
    this.logPanel.fillRoundedRect(
      4,
      this.hud.y + this.hud.height + 2,
      this.messageText.width + 8,
      this.messageText.height + 4,
      4
    );
    this.logPanel.lineStyle(1, 0x4a4234, 0.9);
    this.logPanel.strokeRoundedRect(
      4,
      this.hud.y + this.hud.height + 2,
      this.messageText.width + 8,
      this.messageText.height + 4,
      4
    );

    // The minimap sits under the log strip, so it moves when the HUD
    // block grows or shrinks.
    this.minimap?.setPosition(8, this.messageText.y + this.messageText.height + 8);

    // Button labels: one text object per button so both are legible.
    if (this.controls) {
      const labels = this.controls.buttonLabels();
      while (this.controlsLabel.length > labels.length) {
        this.controlsLabel[0].destroy();
      }
      while (this.controlsLabel.length < labels.length) {
        this.controlsLabel.push(
          this.add
            .text(0, 0, "", {
              fontFamily: "monospace",
              fontSize: "10px",
              color: "#d4a843",
            })
            .setOrigin(0.5)
            .setDepth(11)
            .setScrollFactor(0)
        );
      }
      labels.forEach((b, i) => {
        this.controlsLabel[i].setText(b.text).setPosition(b.x, b.y);
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private setupInput(): void {
    // The browser requires a user gesture before audio can start.
    this.input.once("pointerdown", () => this.audio.unlock());
    this.input.keyboard?.once("keydown", () => this.audio.unlock());

    const layout = defaultLayout(this.scale.width, this.scale.height);

    this.controls = new TouchControls(
      this,
      layout,
      (action) => this.handleAction(action),
      (worldX, worldY) => this.handleTap(worldX, worldY)
    );

    // Keyboard.
    const kb = this.input.keyboard;
    if (kb) {
      kb.on("keydown", (event: KeyboardEvent) => {
        switch (event.key) {
          case "ArrowUp":
          case "w":
          case "W":
          case "8":
            this.handleAction("up");
            break;
          case "ArrowDown":
          case "s":
          case "S":
          case "2":
            this.handleAction("down");
            break;
          case "ArrowLeft":
          case "a":
          case "A":
          case "4":
            this.handleAction("left");
            break;
          case "ArrowRight":
          case "d":
          case "D":
          case "6":
            this.handleAction("right");
            break;
          case ".":
          case "5":
          case " ":
            this.handleAction("wait");
            break;
          case ">":
            this.handleAction("descend");
            break;
          case "i":
          case "I":
            this.handleAction("inventory");
            break;
          case "p":
          case "P":
          case "Escape":
            this.handleAction("pause");
            break;
          default:
            return;
        }
        event.preventDefault();
      });
    }
  }

  private handleAction(action: GameAction): void {
    if (this.busy || this.state.gameOver) return;
    if (action === "inventory") {
      this.showInventory();
      return;
    }
    if (action === "pause") {
      this.showPause();
      return;
    }
    if (action === "wait") {
      this.audio.play("step");
      this.state.turn++;
      refreshVision(this.state);
      this.redraw();
      return;
    }
    if (action === "descend") {
      this.tryDescend();
      return;
    }

    const deltas: Record<string, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const d = deltas[action];
    if (!d) return;

    updatePlayerLight(this.state);
    const result = movePlayer(this.state, d[0], d[1]);
    if (result === "moved") this.audio.play("step");

    if (result === "blocked") {
      // Check for a deadly liquid the player tried to enter.
      const nx = this.state.playerX + d[0];
      const ny = this.state.playerY + d[1];
      if (isDeadlyLiquid(this.state, nx, ny)) {
        this.state.gameOver = true;
        this.state.log.unshift("You step into the deadly liquid and die.");
      }
    }

    refreshVision(this.state);
    this.layoutCamera();
    this.redraw();

    if (this.state.gameOver) this.showGameOver();
  }

  private tryDescend(): void {
    const stairs = this.state.level.stairsDown;
    if (!stairs) {
      this.state.log.unshift("Tidak ada tangga turun di sini.");
      this.updateHud();
      return;
    }
    if (stairs.x !== this.state.playerX || stairs.y !== this.state.playerY) {
      this.state.log.unshift("Kamu harus berdiri di tangga untuk turun.");
      this.updateHud();
      return;
    }
    descend(this.state);
    this.layoutCamera();
    this.redraw();
  }

  private handleTap(screenX: number, screenY: number): void {
    if (this.busy || this.state.gameOver) return;
    const level = this.state.level;

    // The map is drawn in screen space, so we convert the screen point
    // back to a tile using the container's origin and scale.
    const worldX = (screenX - this.mapOrigin.x) / this.mapOrigin.zoom;
    const worldY = (screenY - this.mapOrigin.y) / this.mapOrigin.zoom;
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return;

    // Walk the player one step along the path.
    const dist = bfsDistanceMap(level, this.state.playerX, this.state.playerY);
    const target = tx * level.h + ty;
    if (dist[target] < 0) return;

    // Find the first step.
    let cx = this.state.playerX;
    let cy = this.state.playerY;
    for (let guard = 0; guard < level.w * level.h; guard++) {
      let bestX = -1;
      let bestY = -1;
      let best = dist[cx * level.h + cy];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        const nd = dist[nx * level.h + ny];
        if (nd >= 0 && nd < best) {
          best = nd;
          bestX = nx;
          bestY = ny;
        }
      }
      if (bestX < 0) break;
      const dx = bestX - cx;
      const dy = bestY - cy;
      updatePlayerLight(this.state);
      movePlayer(this.state, dx, dy);
      refreshVision(this.state);
      if (this.state.gameOver) break;
      cx = bestX;
      cy = bestY;
      if (dist[cx * level.h + cy] === 0) break;
    }
    this.layoutCamera();
    this.redraw();
    if (this.state.gameOver) this.showGameOver();
  }

  /* ---------------------------------------------------------------- */
  /* Overlays                                                          */
  /* ---------------------------------------------------------------- */

  private showPause(): void {
    if (this.pausePanel || this.inventoryPanel) return;
    this.busy = true;
    const s = this.state;
    this.pausePanel = new PausePanel(
      this,
      {
        depth: s.depth,
        turn: s.turn,
        score: s.score,
        hp: s.player.hp,
        maxHp: s.player.maxHP,
      },
      {
        onResume: () => {
          this.pausePanel = null;
          this.busy = false;
        },
        onRestart: () => {
          this.pausePanel = null;
          this.busy = false;
          this.scene.restart({ difficulty: s.difficulty.id });
        },
        onQuit: () => {
          this.pausePanel = null;
          this.busy = false;
          this.scene.start("menu");
        },
        soundOn: this.audio.isEnabled(),
        onToggleSound: () => {
          const next = !this.audio.isEnabled();
          this.audio.setEnabled(next);
          // Rebuild the panel so the label reflects the new state.
          this.pausePanel = null;
          this.showPause();
          return next;
        },
      }
    );
  }

  private showInventory(): void {
    if (this.inventoryPanel) return;
    this.busy = true;

    this.inventoryPanel = new InventoryPanel(this, this.state, {
      onMessage: (message) => {
        this.state.log.unshift(message);
        this.state.log.length = Math.min(this.state.log.length, 40);
        this.updateHud();
      },
      onClose: () => {
        this.inventoryPanel = null;
        this.busy = false;
      },
    });
  }

  private showGameOver(): void {
    const s = this.state;
    const title = s.victory ? "YOU WIN!" : "YOU DIED";
    const panel = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        [
          title,
          "",
          `Level reached: ${s.depth}`,
          `Turns: ${s.turn}`,
          `Score: ${s.score}`,
          "",
          "Tap to play again.",
        ].join("\n"),
        {
          fontFamily: "monospace",
          fontSize: "18px",
          color: s.victory ? "#ffe08a" : "#e88a8a",
          backgroundColor: "rgba(10,10,16,0.95)",
          padding: { x: 24, y: 20 },
          align: "center",
        }
      )
      .setOrigin(0.5)
      .setDepth(30);

    void panel;
    this.input.once("pointerdown", () => {
      this.scene.restart();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  override update(): void {
    if (this.controls) {
      this.controls.draw(this.controlsGraphics, 0.22);
    }
  }
}
