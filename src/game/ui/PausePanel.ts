/**
 * PausePanel — the in-game pause / quit overlay.
 *
 * Mobile players need an obvious way out of a run, so the panel has
 * large tap targets for the three things a player actually wants:
 * lanjut (resume), ulang (restart) and keluar (back to the menu).
 */

import Phaser from "phaser";

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  /** Toggle the sound. Returns the new state. */
  onToggleSound?: () => boolean;
  /** Current sound state, for the button label. */
  soundOn?: boolean;
}

export class PausePanel {
  private container: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    info: { depth: number; turn: number; score: number; hp: number; maxHp: number },
    cb: PauseCallbacks
  ) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    this.container = scene.add.container(0, 0).setDepth(28);

    const dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.8).setOrigin(0);
    this.container.add(dim);

    const panelW = Math.min(w - 32, 320);
    const px = (w - panelW) / 2;
    const py = h * 0.28;

    const bg = scene.add.rectangle(px, py, panelW, 130 + (cb.onToggleSound ? 4 : 3) * 48, 0x2a2418, 0.99).setOrigin(0);
    bg.setStrokeStyle(2, 0xd4a843, 1);
    this.container.add(bg);

    const title = scene.add
      .text(w / 2, py + 14, "JEDA", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#d4a843",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.container.add(title);

    const stats = scene.add
      .text(
        w / 2,
        py + 48,
        [
          `Level ${info.depth}   Giliran ${info.turn}`,
          `Skor ${info.score}`,
          `HP ${info.hp}/${info.maxHp}`,
        ].join("\n"),
        {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#cfc8b8",
          align: "center",
          lineSpacing: 4,
        }
      )
      .setOrigin(0.5, 0);
    this.container.add(stats);

    const buttons: [string, () => void][] = [
      ["LANJUT", cb.onResume],
      ["ULANG", cb.onRestart],
      ["KELUAR", cb.onQuit],
    ];

    if (cb.onToggleSound) {
      buttons.push([
        cb.soundOn === false ? "SUARA: OFF" : "SUARA: ON",
        () => cb.onToggleSound!(),
      ]);
    }

    const btnH = 40;
    const gap = 8;
    buttons.forEach(([label, action], i) => {
      const by = py + 112 + i * (btnH + gap);
      const g = scene.add.graphics();
      g.fillStyle(0x3a2d18, 1);
      g.fillRoundedRect(px + 24, by, panelW - 48, btnH, 8);
      g.lineStyle(1.5, 0xd4a843, 0.9);
      g.strokeRoundedRect(px + 24, by, panelW - 48, btnH, 8);
      this.container.add(g);

      const t = scene.add
        .text(w / 2, by + btnH / 2, label, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#ffe08a",
        })
        .setOrigin(0.5);
      this.container.add(t);

      const zone = scene.add
        .zone(px + 24, by, panelW - 48, btnH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => {
        this.close();
        action();
      });
      this.container.add(zone);
    });
  }

  close(): void {
    this.container.destroy(true);
  }
}
