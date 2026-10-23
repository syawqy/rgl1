/**
 * InventoryPanel — a mobile-friendly inventory overlay.
 *
 * Instead of the "press any key" text panel, the player gets a list of
 * tappable rows. Tapping a consumable uses it, tapping a weapon or armour
 * equips it, and a long-press (or the DROP button) drops it.
 */

import Phaser from "phaser";
import { GameState } from "../../core/game";
import {
  consumeIfSpent,
  describeItem,
  dropItem,
  equipItem,
  useConsumable,
} from "../../core/items";

export interface InventoryCallbacks {
  onMessage: (message: string) => void;
  onClose: () => void;
}

export class InventoryPanel {
  private container: Phaser.GameObjects.Container;
  private rows: Phaser.GameObjects.Text[] = [];
  private hint: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private state: GameState;
  private cb: InventoryCallbacks;

  constructor(scene: Phaser.Scene, state: GameState, cb: InventoryCallbacks) {
    this.scene = scene;
    this.state = state;
    this.cb = cb;

    const w = scene.scale.width;
    const h = scene.scale.height;

    this.container = scene.add.container(0, 0).setDepth(25);

    // Dim the whole screen so the panel reads as modal.
    const dim = scene.add
      .rectangle(0, 0, w, h, 0x000000, 0.72)
      .setOrigin(0)
      .setInteractive();
    this.container.add(dim);

    const panelW = Math.min(w - 20, 340);
    const panelH = Math.min(h - 40, 420);
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;

    // A clearly visible panel: the game background is nearly black, so
    // the panel needs its own brightness to read as a separate surface.
    const bg = scene.add.rectangle(px, py, panelW, panelH, 0x2a2418, 0.99).setOrigin(0);
    bg.setStrokeStyle(2, 0xd4a843, 1);
    this.container.add(bg);

    // A header strip so the title does not float on the panel body.
    const header = scene.add
      .rectangle(px, py, panelW, 30, 0x3a3020, 1)
      .setOrigin(0);
    this.container.add(header);

    const title = scene.add
      .text(px + 12, py + 8, "TAS", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#d4a843",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.container.add(title);

    const close = scene.add
      .text(px + panelW - 14, py + 12, "✕", {
        fontFamily: "monospace",
        fontSize: "17px",
        color: "#cfc8b8",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => this.close());
    this.container.add(close);

    this.hint = scene.add
      .text(px + 12, py + panelH - 30, "ketuk untuk pakai · equipped ▸", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8a7f66",
      })
      .setOrigin(0, 0);
    this.container.add(this.hint);

    this.buildRows(px, py, panelW);
  }

  private buildRows(px: number, py: number, panelW: number): void {
    const items = this.state.inventory;
    const rowH = 30;
    const panelH = Math.min(this.scene.scale.height - 40, 420);
    const maxRows = Math.floor((panelH - 78) / rowH);

    this.rows.forEach((r) => r.destroy());
    this.rows = [];

    const shown = items.slice(0, maxRows);
    shown.forEach((item, i) => {
      const y = py + 40 + i * rowH;
      const equipped =
        this.state.equippedWeapon === item || this.state.equippedArmor === item;

      const label = `${equipped ? "▸" : " "} ${item.def.name}`;
      const detail = describeItem(item);

      // The name gets a fixed column so the detail text on the right
      // can never sit on top of it.
      const nameWidth = Math.max(90, panelW * 0.5);
      const row = this.scene.add
        .text(px + 12, y, label, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: equipped ? "#ffe08a" : "#f0e8d8",
          backgroundColor: equipped ? "rgba(212,168,67,0.14)" : undefined,
          padding: { x: 4, y: 3 },
          fixedWidth: nameWidth,
          fixedHeight: 22,
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      if (detail) {
        const d = this.scene.add
          .text(px + panelW - 12, y + 5, detail, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#a89a7a",
            align: "right",
          })
          .setOrigin(1, 0);
        this.container.add(d);
      }

      row.on("pointerdown", () => this.activate(item));
      this.container.add(row);
      this.rows.push(row);
    });

    if (items.length === 0) {
      const empty = this.scene.add
        .text(px + 12, py + 40, "(tasmu kosong)", {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#4a4234",
        })
        .setOrigin(0, 0);
      this.container.add(empty);
    }

    if (items.length > maxRows) {
      const more = this.scene.add
        .text(px + 12, py + 40 + maxRows * rowH, `+${items.length - maxRows} lainnya`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#6b5f4a",
        })
        .setOrigin(0, 0);
      this.container.add(more);
    }
  }

  private activate(item: { def: { category: string; name: string } } & object): void {
    const it = item as Parameters<typeof useConsumable>[1];

    if (it.def.category === "potion" || it.def.category === "scroll" || it.def.category === "food") {
      const res = useConsumable(this.state, it);
      if (res.ok) consumeIfSpent(this.state, it);
      this.cb.onMessage(res.message);
    } else if (it.def.category === "weapon" || it.def.category === "armor") {
      const res = equipItem(this.state, it);
      this.cb.onMessage(res.message);
    } else {
      this.cb.onMessage("Tidak ada yang terjadi.");
    }

    this.rebuild();
  }

  /** Rebuild the rows in place (after using or equipping something). */
  rebuild(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const panelW = Math.min(w - 20, 340);
    const panelH = Math.min(h - 40, 420);
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;

    // Remove the old rows and their detail labels, then rebuild.
    this.container.list.slice().forEach((child) => {
      if (child instanceof Phaser.GameObjects.Text) {
        const txt = child as Phaser.GameObjects.Text;
        if (txt !== this.hint) child.destroy();
      }
    });
    this.rows = [];
    this.buildRows(px, py, panelW);
  }

  /** Drop the last-tapped item; bound to a dedicated button. */
  dropSelected(): void {
    const equipped =
      this.state.equippedWeapon ?? this.state.equippedArmor ?? null;
    if (!equipped) {
      this.cb.onMessage("Tidak ada barang untuk dilepas.");
      return;
    }
    const res = dropItem(this.state, equipped);
    this.cb.onMessage(res.message);
    this.rebuild();
  }

  close(): void {
    this.container.destroy(true);
    this.cb.onClose();
  }
}
