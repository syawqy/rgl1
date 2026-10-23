/**
 * touch.ts — mobile-first input for a tile-based roguelite.
 *
 * Design goals:
 *  - One-thumb play: a virtual D-pad in the bottom-left and action buttons
 *    in the bottom-right, both big enough for a thumb.
 *  - Tap-to-move: tapping a visible tile walks the player there.
 *  - Swipe: a quick flick in a direction issues one move in that direction.
 *  - Desktop still works: WASD / arrows / numpad, plus click-to-move.
 */

import Phaser from "phaser";

export type GameAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "wait"
  | "inventory"
  | "descend"
  | "pause"
  | "message";

export interface TouchLayout {
  /** Width of the virtual stick zone (bottom-left). */
  stickSize: number;
  /** Height of the button row. */
  buttonSize: number;
  /** Margin from the screen edges. */
  margin: number;
}

export const defaultLayout = (width: number, height: number): TouchLayout => {
  // The stick has to fit in the shorter of the two dimensions, otherwise
  // it runs off the bottom of a small phone.
  const byHeight = height * 0.22;
  return {
    stickSize: Math.min(150, Math.max(92, Math.min(width * 0.32, byHeight))),
    buttonSize: Math.min(72, Math.max(52, width * 0.16)),
    margin: Math.max(10, width * 0.03),
  };
};

/**
 * The screen area the touch controls occupy, so the map renderer can
 * stay clear of it. Derived from the same numbers the controls use, so
 * the two can never drift apart.
 */
export function controlInsets(
  width: number,
  height: number
): { top: number; bottom: number; left: number; right: number } {
  const { stickSize, buttonSize, margin } = defaultLayout(width, height);
  return {
    top: margin,
    // The stick is the tallest element and sits in the bottom-left.
    bottom: stickSize + margin,
    // The stick reaches this far from the left edge.
    left: margin + stickSize,
    // The three action buttons reach this far from the right edge.
    right: margin + buttonSize * 3.6,
  };
}

export class TouchControls {
  private scene: Phaser.Scene;
  private layout: TouchLayout;
  private onAction: (action: GameAction) => void;
  private onTapTile: (x: number, y: number) => void;

  /** Currently pressed direction, if any. */
  private held: GameAction | null = null;
  private repeatTimer: Phaser.Time.TimerEvent | null = null;

  /** True when the device is touch-primary. */
  readonly isTouch: boolean;

  constructor(
    scene: Phaser.Scene,
    layout: TouchLayout,
    onAction: (action: GameAction) => void,
    onTapTile: (x: number, y: number) => void
  ) {
    this.scene = scene;
    this.layout = layout;
    this.onAction = onAction;
    this.onTapTile = onTapTile;

    this.isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0);

    this.install();
  }

  private install(): void {
    const scene = this.scene;

    // Allow up to 3 simultaneous pointers (stick + two buttons).
    scene.input.addPointer(2);

    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const zone = this.zoneFor(pointer.x, pointer.y);
      if (!zone) {
        // Not on a control: treat as a tap on the map.
        if (this.isTouch || pointer.button === 0) {
          this.onTapTile(pointer.worldX, pointer.worldY);
        }
        return;
      }
      if (zone === "wait") {
        this.onAction("wait");
        return;
      }
      if (zone === "inventory") {
        this.onAction("inventory");
        return;
      }
      if (zone === "descend") {
        this.onAction("descend");
        return;
      }
      if (zone === "pause") {
        this.onAction("pause");
        return;
      }
      this.press(zone);
    });

    scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const zone = this.zoneFor(pointer.x, pointer.y);
      if (
        zone &&
        zone !== "wait" &&
        zone !== "inventory" &&
        zone !== "descend" &&
        zone !== "pause"
      ) {
        this.release();
      } else if (!zone) {
        this.release();
      }
    });

    scene.input.on("pointerupoutside", () => this.release());
  }

  private press(direction: GameAction): void {
    this.held = direction;
    this.onAction(direction);
    // Auto-repeat so holding a direction keeps moving.
    this.repeatTimer = this.scene.time.addEvent({
      delay: 190,
      loop: true,
      callback: () => {
        if (this.held) this.onAction(this.held);
      },
    });
  }

  private release(): void {
    this.held = null;
    if (this.repeatTimer) {
      this.repeatTimer.remove(false);
      this.repeatTimer = null;
    }
  }

  /**
   * Which control (if any) sits under a screen-space point.
   */
  private zoneFor(
    px: number,
    py: number
  ): GameAction | "wait" | "inventory" | null {
    const zone = this.rawZoneFor(px, py);
    return zone;
  }

  private rawZoneFor(
    px: number,
    py: number
  ): GameAction | "wait" | "inventory" | null {
    const { stickSize, buttonSize, margin } = this.layout;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    // D-pad: bottom-left quadrant, split into 4 wedges.
    const stickCX = margin + stickSize / 2;
    const stickCY = h - margin - stickSize / 2;
    const stickDist = Math.hypot(px - stickCX, py - stickCY);
    if (stickDist <= stickSize * 0.62) {
      const dx = px - stickCX;
      const dy = py - stickCY;
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
      return dy > 0 ? "down" : "up";
    }

    // PAUSE button: top-right corner, always reachable.
    const pauseSize = buttonSize * 0.72;
    if (
      px >= w - margin - pauseSize * 1.4 &&
      py >= margin - buttonSize * 0.2 &&
      py <= margin + pauseSize * 1.6
    ) {
      return "pause";
    }

    // Buttons: bottom-right. Three of them: WAIT, BAG, STAIRS.
    const btnY = h - margin - buttonSize;
    const btnX = w - margin - buttonSize * 3.6;
    if (px >= btnX && py >= btnY - buttonSize * 0.2) {
      const relX = px - btnX;
      if (relX < buttonSize * 1.1) return "wait";
      if (relX < buttonSize * 2.4) return "inventory";
      return "descend";
    }

    return null;
  }

  /** Draw the control overlay. Called every frame or on resize. */
  draw(graphics: Phaser.GameObjects.Graphics, alpha = 0.28): void {
    const { stickSize, buttonSize, margin } = this.layout;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    graphics.clear();

    // D-pad base.
    const stickCX = margin + stickSize / 2;
    const stickCY = h - margin - stickSize / 2;
    // A solid dark disc so the d-pad reads as a control rather than
    // blending into the dungeon behind it.
    graphics.fillStyle(0x000000, Math.min(0.85, alpha + 0.45));
    graphics.fillCircle(stickCX, stickCY, stickSize * 0.56);
    graphics.lineStyle(2, 0xd4a843, Math.min(1, alpha + 0.6));
    graphics.strokeCircle(stickCX, stickCY, stickSize * 0.56);

    // Direction wedges. Each arrow must point in its own direction, so
    // the triangle is built in local space and then rotated.
    const wedge = stickSize * 0.2;
    graphics.fillStyle(0xd4a843, Math.min(1, alpha + 0.55));
    const arrow = (
      x: number,
      y: number,
      dir: "up" | "down" | "left" | "right"
    ) => {
      const s = wedge * 0.6;
      const offset = wedge * 0.95;
      // Centre of the arrow.
      const cx = x + (dir === "right" ? offset : dir === "left" ? -offset : 0);
      const cy = y + (dir === "down" ? offset : dir === "up" ? -offset : 0);
      // Rotation so the triangle's tip points the right way.
      const rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir];

      graphics.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = rot + (Math.PI * 2 * i) / 3 - Math.PI / 2;
        const vx = cx + Math.cos(a) * s;
        const vy = cy + Math.sin(a) * s;
        if (i === 0) graphics.moveTo(vx, vy);
        else graphics.lineTo(vx, vy);
      }
      graphics.closePath();
      graphics.fillPath();
    };
    arrow(stickCX, stickCY, "up");
    arrow(stickCX, stickCY, "down");
    arrow(stickCX, stickCY, "left");
    arrow(stickCX, stickCY, "right");

    // PAUSE button, top-right.
    const pauseSize = buttonSize * 0.9;
    graphics.fillStyle(0x000000, Math.min(0.85, alpha + 0.45));
    graphics.fillRoundedRect(w - margin - pauseSize * 1.9, margin, pauseSize * 1.9, pauseSize, 6);
    graphics.lineStyle(1.5, 0xd4a843, Math.min(1, alpha + 0.55));
    graphics.strokeRoundedRect(w - margin - pauseSize * 1.9, margin, pauseSize * 1.9, pauseSize, 6);
    // The classic two-bar pause glyph.
    graphics.fillStyle(0xd4a843, Math.min(1, alpha + 0.55));
    const barW = Math.max(2, pauseSize * 0.14);
    const barH = pauseSize * 0.42;
    const gx = w - margin - pauseSize * 1.9 + pauseSize * 0.95;
    const gy = margin + (pauseSize - barH) / 2;
    graphics.fillRect(gx, gy, barW, barH);
    graphics.fillRect(gx + barW * 1.8, gy, barW, barH);

    // Action buttons: WAIT, BAG, STAIRS.
    const btnY = h - margin - buttonSize;
    const btnX = w - margin - buttonSize * 3.6;
    graphics.fillStyle(0x000000, Math.min(0.85, alpha + 0.45));
    graphics.fillRoundedRect(btnX, btnY, buttonSize * 1.1, buttonSize, 8);
    graphics.fillRoundedRect(btnX + buttonSize * 1.3, btnY, buttonSize, buttonSize, 8);
    graphics.fillRoundedRect(btnX + buttonSize * 2.5, btnY, buttonSize, buttonSize, 8);
    graphics.lineStyle(2, 0xd4a843, Math.min(1, alpha + 0.6));
    graphics.strokeRoundedRect(btnX, btnY, buttonSize * 1.1, buttonSize, 8);
    graphics.strokeRoundedRect(btnX + buttonSize * 1.3, btnY, buttonSize, buttonSize, 8);
    graphics.strokeRoundedRect(btnX + buttonSize * 2.5, btnY, buttonSize, buttonSize, 8);
  }

  /** Label text drawn on top of the buttons. */
  buttonLabels(): { x: number; y: number; text: string }[] {
    const { buttonSize, margin } = this.layout;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const btnY = h - margin - buttonSize;
    const btnX = w - margin - buttonSize * 3.6;
    return [
      { x: btnX + buttonSize * 0.55, y: btnY + buttonSize / 2, text: "WAIT" },
      { x: btnX + buttonSize * 1.3 + buttonSize / 2, y: btnY + buttonSize / 2, text: "BAG" },
      { x: btnX + buttonSize * 2.5 + buttonSize / 2, y: btnY + buttonSize / 2, text: "TURUN" },
    ];
  }

  destroy(): void {
    this.release();
  }
}
