# RGL1 — Roguelike ala Brogue untuk mobile

Sebuah game roguelite **mobile-first** yang terinspirasi dari
[BrogueCE](https://github.com/tmewett/BrogueCE), dibangun dengan
**Phaser 4 + TypeScript + Vite**.

Fokusnya bukan menyalin Brogue mentah, melainkan mempertahankan **rasa
roguelike**-nya: dungeon yang digali secara prosedural,~| combat yang
brutal tapi bisa dipelajari, dan item yang ditemukan. Semua itu dibungkus
dalam UI yang nyaman dipakai dengan jarum di layar sentuh.

## Yang diambil dari BrogueCE

### Generator dungeon

Pipeline `digDungeon()` diterjemahkan dari `Architect.c`:

1. Clear level
2. Place blob awal
3. Attach rooms
4. Add loops
5. Generate cave / cross-room regions
6. Translate grid → terrain
7. Expose & finish walls
8. Generate & fill lakes
9. Remove diagonal openings
10. Add bridges
11. Finalize doors
12. Final wall pass
13. Build monster waypoints
14. Place stairs & features

Room template yang di-port:

- Cross
- Symmetrical cross
- Small room
- Circular room
- Chunky room
- Cave
- Cavern
- Entrance

Cellular automata memakai **8 tetangga**, sama seperti `Grid.c` di Brogue.

Grid memakai urutan **column-major**, mengikuti model internal Brogue:

```ts
index = x * height + y
x = Math.floor(index / height)
y = index % height
```

### Combat

Tabel power diambil langsung dari `PowerTables.c`
(`src/core/powerTables.ts`):

- `POW_DEFENSE_FRACTION`
- `POW_ACCURACY_FRACTION`
- `POW_DAMAGE_FRACTION`

Armor **tidak** mengurangi damage secara flat — defense menurunkan
*peluang terkena hit*, seperti di Brogue.

Sneak attack memberi 3× damage, dagger sneak attack 5×.

### Terrain semantics

Opsi passed-through tapi berbahaya tidak dianggap wall:

| Terrain    | Bisa dilewati | Efek                       |
| ---------- | ------------- | -------------------------- |
| Deep water | Ya            | Lambat                     |
| Chasm      | Ya            | Turun otomatis             |
| Lava       | Ya            | Mematikan                  |
| Wall       | Tidak         | Menghalangi, termasuk diagonal |
| Granite    | Tidak         | Menghalangi, termasuk diagonal |

## Yang dibuat untuk accessibility

- **Tiga tingkat kesulitan**: `SANTAH`, `BIASA`, `BROGUE`
- Difficulty mengubah jumlah monster, damage, HP player, accuracy, jarak
  spawn, notice chance, dan regenerasi
- HUD berbahasa Indonesia
- Inventory berupa baris yang bisa diketuk — tidak butuh keyboard
- Pause menu dengan restart, quit, dan toggle suara
- Minimap (`PETA`)
- Audio prosedural via Web Audio API — **tanpa file audio sama sekali**
- Seluruh visual/art **dibuat secara prosedural** di canvas — tidak ada
  binary asset, game tetap satu bundle JS

## Kontrol

| Aksi         | Sentuh                | Keyboard          |
| ------------ | --------------------- | ----------------- |
| Jalan        | D-pad virtual         | WASD / panah      |
| Jalan ke sel | Ketuk peta            | —                 |
| Tunggu       | Tombol `WAIT`         | `Space` / `.`     |
| Inventory    | Tombol `BAG`          | `I` / `Tab`       |
| Turun tangga | Tombol `TURUN`        | `>`               |
| Jeda         | Tombol pause          | `P` / `Esc`       |

## Menjalankan

```bash
npm install
npm run dev      # dev server
npm run build    # production build -> dist/
npm test         # unit tests
```

## Verifikasi

```bash
npx tsc --noEmit          # type check
npx vitest run           # 65 unit tests
npx vite-node scripts/debug-connect.ts   # connectivity sweep
```

`scripts/debug-connect.ts` menjalankan sweep multi-seed × multi-depth untuk
memastikan **connectivity adalah invariant generator** — dungeon yang
terputus berarti ada bug.

## Deploy

Build statis, bisa ditaruh di subfolder mana pun:

```bash
npx vite build
cp -r dist/* /var/www/html/<slug>/
```

`vite.config.ts` memakai `base: "./"` sehingga asset tetap relatif.

## Struktur

```
src/core/     # simulasi murni, tanpa Phaser — mudah diuji
  rng.ts          seeded RNG
  terrain.ts      flag & layer terrain
  grid.ts         grid column-major
  brogueGen.ts    primitif generator Brogue
  level.ts        pipeline per level
  pathfind.ts     Dijkstra
  powerTables.ts  tabel asli PowerTables.c
  combat.ts       matematika combat
  monsters.ts     bestiary & spawning
  lighting.ts     FOV & line of sight
  time.ts         scheduler tick
  items.ts        item & effect
  difficulty.ts   tingkat kesulitan
  game.ts         runtime state
src/game/     # layer Phaser
  art.ts        tekstur prosedural
  audio.ts      efek suara prosedural
  touch.ts      kontrol sentuh
  effects.ts    feedback visual
  scenes/       Boot, Menu, Game
  ui/           InventoryPanel, PausePanel, Minimap
tests/        # unit tests
scripts/      # debug: ASCII map, connectivity sweep, tracing
```

## Lisensi

Kode ini mengikuti lisensi MIT repository BrogueCE. BrogueCE sendiri
diterbitkan di bawah lisensi MIT oleh David W. Skinner.
