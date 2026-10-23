/**
 * MenuScene — the title screen. Kept deliberately simple so it works on a
 * phone: one big play button, a difficulty hint, and the seed display.
 */

import Phaser from "phaser";
import { DIFFICULTIES, DifficultyId } from "../../core/difficulty";

export class MenuScene extends Phaser.Scene {
  private difficulty: DifficultyId = "standard";
  private refreshDifficultyButtons: () => void = () => {};
  private diffDesc!: Phaser.GameObjects.Text;

  constructor() {
    super("menu");
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor("#0d0b09");

    this.add
      .text(w / 2, h * 0.22, "RGL1", {
        fontFamily: "monospace",
        fontSize: `${Math.round(Math.min(w * 0.16, 64))}px`,
        color: "#d4a843",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.add
      .text(
        w / 2,
        h * 0.34,
        "roguelike ala brogue\nuntuk layar sentuh",
        {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#6b5f4a",
          align: "center",
          lineSpacing: 6,
        }
      )
      .setOrigin(0.5)
      .setDepth(5);

    // Play button — big enough for a thumb.
    const btnW = Math.min(240, w * 0.7);
    const btnH = 64;
    const bx = w / 2 - btnW / 2;
    const by = h * 0.52;

    const g = this.add.graphics().setDepth(4);
    g.fillStyle(0x2a2118, 1);
    g.fillRoundedRect(bx, by, btnW, btnH, 10);
    g.lineStyle(2, 0xd4a843, 1);
    g.strokeRoundedRect(bx, by, btnW, btnH, 10);

    this.add
      .text(w / 2, by + btnH / 2, "MAIN", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#d4a843",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(5);

    const zone = this.add
      .zone(bx, by, btnW, btnH)
      .setOrigin(0)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    zone.on("pointerdown", () => {
      this.scene.start("game", { difficulty: this.difficulty });
    });

    // ---- Difficulty picker ----
    const diffIds: DifficultyId[] = ["relaxed", "standard", "brogue"];
    const diffW = Math.min(96, (w * 0.86) / 3);
    const diffH = 40;
    const diffGap = 8;
    const diffTotalW = diffW * 3 + diffGap * 2;
    const diffX = w / 2 - diffTotalW / 2;
    const diffY = h * 0.62;

    this.add
      .text(w / 2, diffY - 20, "KESULITAN", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#6b5f4a",
      })
      .setOrigin(0.5);

    const diffButtons: { id: DifficultyId; text: Phaser.GameObjects.Text; g: Phaser.GameObjects.Graphics }[] = [];

    diffIds.forEach((id, i) => {
      const bx = diffX + i * (diffW + diffGap);
      const g = this.add.graphics().setDepth(4);
      const label = this.add
        .text(bx + diffW / 2, diffY + diffH / 2, DIFFICULTIES[id].name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#cfc8b8",
        })
        .setOrigin(0.5)
        .setDepth(5);

      const hit = this.add
        .zone(bx, diffY, diffW, diffH)
        .setOrigin(0)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });

      hit.on("pointerdown", () => {
        this.difficulty = id;
        this.refreshDifficultyButtons();
        this.diffDesc.setText(DIFFICULTIES[id].description);
      });

      diffButtons.push({ id, text: label, g });
    });

    const refresh = () => {
      diffButtons.forEach((b) => {
        const active = b.id === this.difficulty;
        b.g.clear();
        b.g.fillStyle(active ? 0x3a2d18 : 0x1a1610, 1);
        b.g.fillRoundedRect(
          diffX + diffButtons.indexOf(b) * (diffW + diffGap),
          diffY,
          diffW,
          diffH,
          8
        );
        b.g.lineStyle(1.5, active ? 0xd4a843 : 0x4a4234, 1);
        b.g.strokeRoundedRect(
          diffX + diffButtons.indexOf(b) * (diffW + diffGap),
          diffY,
          diffW,
          diffH,
          8
        );
        b.text.setColor(active ? "#ffe08a" : "#8a8070");
      });
    };
    this.refreshDifficultyButtons = refresh;
    refresh();

    // Description of the selected difficulty.
    const diffDesc = this.add
      .text(w / 2, diffY + diffH + 16, DIFFICULTIES[this.difficulty].description, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#6b5f4a",
        align: "center",
        wordWrap: { width: w * 0.86 },
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.diffDesc = diffDesc;

    const seedText = this.add
      .text(w / 2, h * 0.9, `seed: ${(Math.random() * 0xffffffff) >>> 0}`, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#4a4234",
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.add
      .text(
        w / 2,
        h * 0.945,
        "dpad kiri jalan · tombol kanan aksi\nketuk peta untuk berjalan",
        {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#4a4234",
          align: "center",
          lineSpacing: 4,
        }
      )
      .setOrigin(0.5)
      .setDepth(5);

    this.time.delayedCall(60_000, () => {
      if (this.scene.isActive("menu")) {
        seedText.setText(`seed: ${(Math.random() * 0xffffffff) >>> 0}`);
      }
    });
  }
}
