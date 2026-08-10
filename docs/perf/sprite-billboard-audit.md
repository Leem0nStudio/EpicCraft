# Sprite Billboard (Flip Board) Audit — NPC + Player

Date: 2026-08-08

Audit of the 2D sprite billboard system (`src/render/billboard/`) that replaces
3D character visuals for NPCs and players: the sprite sheet loader/preload
(`loader.ts`), the pure direction/UV core (`types.ts`), and the per-entity
sprite (`billboard.ts`), plus its renderer integration (`renderer.ts`) and the
canvas preview consumer (`characters/sprite_preview.ts`).

Motivation: *improve performance on old devices* — phone-class GPUs, low VRAM,
thermal-throttled laptops. Every finding below is a per-entity cost that
multiplies with the crowd on screen.

## Findings fixed

### C2 — 41 MB of sheet textures gated the boot screen (fixed, prior pass)

`preloadBillboardTexture` registered every sprite sheet into the boot gate
(`assetsReady()`), so `startGame` waited on ~41 MB of texture fetches (sheets
range 0.2–6.4 MB each). The tiny meta JSONs (≈0.7 KB each) stayed gated — they
are needed synchronously by `getMetaSync()` at `createView` — but the textures
now warm the cache fire-and-forget, outside the gate, with a lazy
`loadSpriteSheetTexture` fallback.

### A3 — `requestAnimationFrame` polling loop could leak (fixed, prior pass)

The texture warm cache polls `requestAnimationFrame` until the texture arrives.
A 404/stalled fetch previously left that callback running forever. The poll now
stops on load **or** a hard 5-second deadline.

### F1 — Per-frame sector-table allocation in `cameraRelativeDirection()` (fixed)

The 8-sector direction table (array + 8 tuples) was rebuilt inside the function
on **every call** — i.e. per billboard entity per frame. With a crowd of
NPCs/players this was the largest per-frame allocation on the flip-board path.
Hoisted to a module constant (`SPRITE_SECTOR_ANCHORS`) + `TAU`. Semantics
byte-identical: the first-min-wins tie rule is preserved and pinned by the
sector tests.

### F2 — `getSourceDirection()` scanned `Object.entries()` per direction change

Each step / camera pan rebuilt an entries array to find the mirror mapping.
Now a direct `mirrorMap[dir]` property lookup — zero allocation.

### F3 — Redundant UV re-bake in `tick()` every 250 ms per billboard

`tick()` re-ran `updateMaterialFrame()` → `getFrameUVs()` + mirror scan every
idle frame-duration (4 FPS = every 250 ms) per entity even though sheets are
single-frame and nothing changes visually. `tick()` no longer re-bakes when the
frame cannot advance; a TODO documents the multi-frame path for future
animations.

### F4 — Redundant math in `getFrameUVs()`

`frameWidth / (columns * frameWidth)` ≡ `1/columns`, etc. — reduced to pure
column/row fractions (same float results, pinned by tests). Also removed the
dead `import * as THREE` from `types.ts`, keeping the module a pure testable
core (no DOM/renderer/clock).

### F5 — Per-entity texture clone + full GPU re-upload (fixed, this pass)

**The remaining big one.** `createBillboardMaterial()` did
`texture.clone()` + `needsUpdate = true` **per entity**. In three.js a cloned
texture with `needsUpdate` forces a full `gl.texImage2D` upload of the entire
sheet — so every NPC/player carried its own GPU copy of its sheet (0.2–6.4 MB
each) and creation stalled on the upload.

Fix: bake the frame/direction strip into **per-entity geometry UVs** instead of
a per-material texture matrix.

- One shared `MeshBasicMaterial` per sheet (`getBillboardMaterial`, cached);
  its `map` is the loader's shared texture — **no clone, no re-upload**. The
  whole crowd on a sheet shares a single GPU texture copy.
- Per-entity minimal quad geometry (`createBillboardGeometry`): 4 vertices, 6
  indices, a 32-byte UV attribute initialized from a cached 8-float
  `Float32Array` per (sheet, direction, row). Positions/index wrap shared CPU
  arrays in the entity's own `BufferAttribute`s, so `dispose()` frees only that
  entity's buffers.
- Direction/animation change is now a 32-byte copy into the entity's own
  attribute + `needsUpdate` (`updateBillboardFrame`) — no allocation, no
  texture touch.
- Mirrors (SW/W/NE) bake `uMax < uMin` so the strip samples right-to-left —
  the exact equivalent of the old negative-repeat texture matrix, now in the
  geometry.

Design constraint discovered while implementing: three **r165**
`WebGLAttributes.remove()` deletes a GL buffer unconditionally (no
`boundGeometries` refcounting), so **BufferAttribute objects must not be
shared across geometries** — disposing one billboard would free another's
buffer. Hence the per-entity attribute copy rather than sharing one attribute
object.

## Tests

- `tests/billboard.test.ts` (15): pins the 8 sector anchors + first-min-wins
  tie behavior, the mirror contract, `getFrameQuadUVs` corners (including
  `uMin > uMax` for mirrors) and consistency with `getFrameUVs`.
- `tests/billboard_loader.test.ts` (8): baked 8-float strips, per-entity
  attribute swap (same object, version bump), dispose-safety (distinct
  attributes), and one material + one texture per sheet (identity assertions).
  The registry is mocked to `[]` so importing the loader in jsdom does not fire
  real fetches; `TextureLoader.load` is stubbed for the material tests.

## Known remaining cost (documented, not cheap)

None within the flip-board path itself. The sprite sheets are still loaded as
full-size PNGs (0.2–6.4 MB each, ~41 MB total) — one GPU copy per sheet now
instead of per entity. Further compression (atlas packing, DXT/ETC2, or
`?gfx`-tiered sheet sizes) is asset-pipeline work, not renderer work, and
touches the offline asset pipeline rather than this module.
