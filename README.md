# stackhaus 🏗️

A 3D architecture game — **Tetris meets Jenga**. Crane pieces fall from the sky;
you position them to raise a balanced building. Real rigid-body physics decides
whether your tower stands or topples.

## Play

```bash
bun src/server.ts
# → http://127.0.0.1:3028
```

| input | action |
|---|---|
| WASD / arrows | guide the falling piece |
| Q / E | rotate flat (yaw) |
| R | tip over (roll — turn a beam into a column) |
| Shift (hold) | fast fall |
| Space | hard drop |
| drag / wheel | orbit / zoom camera |

Touch controls appear on coarse-pointer devices.

## Rules

- Guide each falling piece onto the tower. Touching the tower (or platform)
  while positioning **locks the piece instantly** — mind your clearances.
- Score rewards **height** and **centred** placements; overhangs pay less and
  risk everything.
- The **balance gauge** (bottom-left) shows the tower's live centre of mass.
  The **wobble warning** appears when the structure is moving.
- If any settled piece drifts from where it landed, the tower has **toppled**
  and the build is over. Best score persists locally.

## Pieces

Architectural-model set, all axis-aligned boxes: **Cube** 2×2×2, **Slab** 4×1×4,
**Beam** 4×1×1, **Column** 1×4×1, **Wall** 4×2×1.

## How it works

- **three.js r160** (CDN import map) renders the warm architectural-model scene:
  sun + soft shadows, basswood palette, edge-lined pieces.
- **cannon-es** (CDN) runs the rigid-body simulation: the crane-held piece is a
  velocity-driven dynamic body, released pieces settle, sleep, and are watched
  for topple displacement.
- `public/logic.js` holds the pure game math (pieces, rotations, centre of
  mass, scoring, topple test) — shared with the test suite.
- `public/audio.js` synthesizes every sound (lock thud, creak, crash, chime);
  zero audio assets.
- `src/server.ts` is a zero-dependency Bun static server.

## Tests

```bash
bun test   # 10 tests, 35 assertions — pure logic (physics is engine-driven)
```

Browser-verified in headless Chromium: full loop (fall → lock → settle →
score), 5-piece tower, and a deliberate off-centre build toppling into the
game-over screen — all with zero JS errors.
