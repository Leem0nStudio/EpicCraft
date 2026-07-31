# Rendering Goal — World of ClaudeCraft

**Author:** Art Director  
**Status:** Draft  
**Date:** 2026-07-29  
**Applies to:** `src/render/`, `public/models/chars/`, sprite pipeline, GLB pipeline

---

## 1. Overview

World of ClaudeCraft renders as a **2D billboard sprite world embedded in a richly
lit 3D environment**. Characters and humanoid NPCs are hand-painted, brightly coloured
sprites that always face the camera, while creatures, props, and the world itself are
full 3D GLB models with PBR materials, dynamic lighting, and post-processing effects.

The visual identity sits at the intersection of classic Korean-style sprite-based
MMORPGs and modern 3D rendering. The target emotional response is **warm, vibrant,
and crafted** — the world should feel like a painted diorama come to life, not a
realistic simulation.

This hybrid approach gives us three decisive advantages:

- **Art efficiency.** Hand-painted sprites for characters bypass the need for
  high-poly sculpting, rigging, and skinning for every entity. One sprite sheet
  covers all camera angles through directional UV selection.
- **Visual clarity.** Sprites maintain crisp, readable silhouettes regardless of
  distance or angle. Characters read clearly against any background, which is
  critical for an isometric MMO where players must identify friend from foe at a
  glance.
- **Emotional warmth.** Hand-painted art reads as human-crafted. The slight
  imperfection and colour vibrancy of painted sprites creates a cozier, more
  inviting world than pure 3D realism.

---

## 2. Visual Style

### 2.1 Aesthetic DNA

The rendering style draws from five key reference games. Each contributes a
distinct element to our visual identity:

| Reference | Contribution | How It Applies |
|-----------|-------------|----------------|
| **Tree of Savior** | Isometric sprite rendering, warm fantasy palette, billboard NPCs in 3D environments | Character sprites sit naturally in the 3D world; sprite lighting matches world lighting direction |
| **Ragnarok Origin** | Crisp directional sprites, bold colour blocking, clean silhouettes | 4-direction sprite sheets with mirroring; high-contrast outlines; readable shapes at game resolution |
| **Granblue Fantasy Relink** (2D billboard NPCs) | High-quality illustrated billboards integrated into 3D scenes | Sprite resolution supports close-up viewing; subtle rim translation of 3D lighting onto 2D sprites |
| **Octopath Traveler II** | HD-2D aesthetic — pixel art characters in 3D environments with depth-of-field, bloom, and volumetric effects | Post-processing (bloom, vignette, AO) unifies 2D sprites and 3D world into a single image; sprites receive environmental colour bleed |
| **Eiyuden Chronicle** | Vibrant hand-painted character art, smooth animations, fantasy lighting | Saturation and warmth in sprite colours; dynamic lighting on 3D world creates contrast with painted characters |

### 2.2 Colour Language

The colour palette prioritises **warmth, saturation, and readability**:

- **World (3D):** Warm-tinted PBR materials with ambient occlusion and subtle
  bloom. The IBL environment is golden-hour biased (sun elevation ~35°). Foliage
  uses per-instance colour variation (HSL jitter) for organic variety.
- **Characters (2D sprites):** Hand-painted with saturated local colours. Each
  class has a dominant colour identity (warrior = steel blue/crimson, mage = deep
  purple/gold, rogue = charcoal/emerald, etc.). Sprites are pre-lit with a
  consistent light-from-above-left convention baked into the art.
- **Creatures (3D GLBs):** Mid-saturation PBR materials with roughness variation.
  Monsters trend darker and grittier to contrast with player characters.
- **UI:** Blue-black metal and parchment with bronze/gold edges (per DESIGN.md).
  The UI should feel like a crafted fantasy artifact, never a glass dashboard.

### 2.3 Sprite Rendering Principles

1. **Always face the camera.** Sprites are rendered on a camera-facing plane via
   quaternion copy (see `BillboardSprite.updateFacing` in
   `src/render/billboard/billboard.ts`). Directional views are selected via UV
   offset, not mesh rotation.
2. **Filter with LinearFilter.** Illustrated sprites use bilinear sampling
   (`THREE.LinearFilter`) for smooth anti-aliased edges. Nearest-neighbour
   filtering is rejected — it produces jagged edges inappropriate for
   hand-painted art at this scale.
3. **Full alpha blending.** No `alphaTest` cutoff. Illustrated art has smooth
   alpha gradients that would receive harsh edges from alpha testing.
4. **Depth write disabled.** Sprites render with `depthWrite: false` so they
   stack correctly with transparent VFX and other billboards.
5. **Render order priority.** Sprites use `renderOrder: 1` to draw after opaque
   world geometry but before UI overlays.

---

## 3. Entity Coverage

Rendering is rolled out in phases to control art production cost and validate the
pipeline incrementally.

### 3.1 Phase 1 — Players + Humanoid NPCs (SHIPPED)

**Status: Implemented and live.** Every player character class and all humanoid
town NPCs render as billboard sprites.

| Entity Type | Visual Representation | Sprite Sheet | Status |
|-------------|----------------------|--------------|--------|
| Player classes (warrior, mage, rogue, etc.) | Billboard sprite | `sprite_001_` through `sprite_014_` | ✅ Live |
| Humanoid town NPCs (Brother Aldric, Warden Fenwick, etc.) | Billboard sprite | Shared sheets mapped via `sprite_registry.ts` | ✅ Live |
| Player weapons/shields | 3D GLB (skin-attached) | `models/weapons/*.glb` | ✅ Live |

**Sprite registry mapping** lives in `src/render/billboard/sprite_registry.ts`.
To add a new player class or NPC type:

1. Create the sprite sheet PNG + JSON (see Section 4.3 for spec).
2. Add an entry to `SPRITE_REGISTRY` in `sprite_registry.ts`.
3. Preloading is automatic (`getAllSpriteFilenames` in `loader.ts`).

### 3.2 Phase 2 — Creatures (IN PROGRESS)

**Status: Partially implemented.** Critters (rabbits, squirrels, birds) now have
per-species PBR materials and rim-light. Remaining creature types (wildlife,
monsters, bosses) are pending.

| Entity Type | Visual Representation | Notes |
|-------------|----------------------|-------|
| Critters (rabbit, squirrel, bird) | 3D GLB | ✅ Per-species PBR + rim-light (implemented) |
| Wildlife (wolf, boar, frog, etc.) | 3D GLB | Pending: upgrade to per-species PBR + rim-light |
| Monsters (skeleton, goblin, orc, etc.) | 3D GLB | Pending: upgrade to per-species PBR + rim-light |
| Bosses (Greyjaw, Broodmother, etc.) | 3D GLB | Pending: higher-poly GLBs with emissive accents |

**Creature rendering upgrades in Phase 2:**
- ✅ PBR material pass (roughness/metalness tuning per species) — critters only
- ✅ Per-species rim-light intensity control — critters only
- ⏳ Distance-based LOD: full GLB at close range, simpler GLB at mid range, sprite
  billboard at far range (optional, gated by GFX tier)

See `docs/design/phase2-creature-rendering.md` for the full implementation plan.

### 3.3 Phase 3+ — Edge Cases (FUTURE)

| Entity Type | Visual Representation | Notes |
|-------------|----------------------|-------|
| Mounts | 3D GLB | Ridden creatures remain 3D; rider sprite attaches atop |
| Minions/pets | Billboards or GLBs | Evaluated per type; small sprites preferred for performance |
| Drones/familiars | Billboard sprite | Small, floaty — ideal for 1-frame sprite |

---

## 4. Technical Implementation

### 4.1 Billboard Sprite System

The billboard system lives in `src/render/billboard/` and is composed of four
modules:

```
src/render/billboard/
├── billboard.ts        # BillboardSprite class — mesh, material, tick, dispose
├── loader.ts           # Sprite sheet PNG/JSON loading, caching, preloading
├── types.ts            # Types: Direction, AnimationType, SpriteSheetMeta, cameraRelativeDirection
├── sprite_registry.ts  # Mapping: entity visual key → sprite filename
└── index.ts            # Barrel exports
```

**Camera-facing mechanism** (from `billboard.ts` line 76-81):
The sprite plane copies the camera's quaternion each frame. This keeps the plane's
front face (+Z) always pointing toward the camera, while UV offsets select which
directional view (SE, E, N, NW — the other three are mirrored) to display.

```ts
updateFacing(camera: THREE.Camera): void {
  this.mesh.quaternion.copy(camera.quaternion);
}
```

**Direction selection** (from `types.ts`, `cameraRelativeDirection`):
The system computes the angle from entity to camera relative to the entity's facing
direction, then snaps to the nearest of 7 sprite directions (4 source + 3 mirrored).
This follows the Ragnarok Online convention where the displayed sprite depends on
which side of the character the camera sees.

### 4.2 GLB Coexistence

Sprite and GLB rendering coexist within the same scene graph. The renderer
distinguishes them by entity type:

| Rendering Path | Entity Types | Module |
|----------------|-------------|--------|
| Billboard sprite | Players, humanoid NPCs | `billboard/` + `renderer.ts` billboard views |
| GLB + PBR | Creatures, critters | `critters.ts`, `characters/` |
| GLB + merged | Props, foliage, dungeon modules | `props.ts`, `foliage.ts`, `dungeon.ts` |
| GLB + placed | Editor-placed assets | `placed_assets.ts` |

**Sprite entities** are stored in `renderer.billboards: Map<number, { billboard, shadowGeo, shadowMat }>`.
**GLB entities** are stored in `renderer.views: Map<number, EntityView>`.
Both are updated each frame in `Renderer.sync()`.

A single `entity` can have only one visual representation. The selection is made at
entity creation time based on the entity's visual key (see `createVisualForEntity` in
`renderer.ts`).

### 4.3 Sprite Sheet Requirements

#### Format

| Property | Specification | Rationale |
|----------|--------------|-----------|
| File format | PNG (24-bit colour + 8-bit alpha) | Full colour fidelity, lossless, universal browser support |
| Colour space | sRGB | Loaded with `THREE.SRGBColorSpace` |
| Filtering | `LinearFilter` (bilinear) | Smooth edges for illustrated art |
| Max dimensions | 4096 × 4096 pixels | WebGL texture size limit across all target devices |
| Naming | `sprite_XXX_.png` | Follows existing convention; numeric suffix avoids name collisions |
| Metadata | JSON sidecar (`sprite_XXX_.json`) | Frame dimensions, direction mapping, animation FPS |

#### Frame Grid

| Parameter | Current Standard | Notes |
|-----------|-----------------|-------|
| Columns | 4 | SE, E, N, NW (source directions) |
| Rows | 1 | All animations share row 0 currently |
| Frame width | 688 px | At 2752 × 1536 total canvas |
| Frame height | 1536 px | Full character height |
| Mirroring | SW↔SE, W↔E, NE↔NW | 3 mirror pairs reduce art cost by ~43 % |

#### Frame Budget (Phase 2 Target)

Once multi-row animation is introduced, the target is:

| Animation | Row | Frames | Motion Description |
|-----------|-----|--------|-------------------|
| idle | 0 | 1–2 | Subtle breathing/weight shift loop |
| walk | 1 | 2 | Leg stride cycle (left-right) |
| attack | 2 | 2 | Strike wind-up + hit |
| cast | 3 | 2 | Hands raise + release |

4 rows × 4 columns × 2 frames = **32 cells per sprite sheet maximum**.

### 4.4 Integration with Existing GFX Tiers

The rendering goal maps to the existing tier system in `src/render/gfx.ts`:

| Feature | low | medium (default) | high | ultra |
|---------|-----|------------------|------|-------|
| Sprite filter | LinearFilter | LinearFilter | LinearFilter | LinearFilter |
| Sprite shadows | Circle blob | Circle blob | Circle blob + soft edge | Circle blob + soft edge |
| Creature GLB materials | Lambert | Standard | Standard + rim-light | Standard + rim-light + env |
| Creature rim intensity | None | None | Per-species (0.06-0.10) | Per-species (0.06-0.10) + dungeon boost |
| Rim-light on sprites | None | Subtle vertex tint | Full rim | Full rim + animated |
| Environment response | None | None | Sprite colour bleed from IBL | Sprite colour bleed + IBL |
| Post chain | Direct render | Bloom + grade | N8AO + bloom + grade | N8AO (full) + bloom + grade |
| GLB distance LOD | Billboard at 60u | Billboard at 80u | Simplified mesh at 100u | Full mesh at all ranges |

---

## 5. Lighting Strategy

### 5.1 Philosophy: Tiered Hybrid 2D/3D Lighting

Sprites are **pre-lit** — the hand-painted art bakes in a consistent light
direction (above-left, matching the world sun). The 3D world is **dynamically
lit** with PBR materials, IBL environment maps, and shadow-casting directional
light. The challenge is making these two lighting systems feel like one cohesive
image.

The solution is a **tiered hybrid approach**: 

**Default (all tiers):** Baked lighting only. Sprites carry their own pre-computed
lighting, and the 3D world provides enough ambient/hemi light that no 2D/3D
disconnect is visible. This is the safe, cheap, and currently shipped path.

**Higher tiers (high/ultra):** The environment's lighting subtly influences sprites
via three mechanisms:

1. **Rim-light pass** — A subtle emissive rim on sprite edges, tinted to match the
   scene's key light colour. This sells sprite silhouettes against dark backgrounds
   and ties the 2D character visually into the 3D scene.
2. **Environment colour bleed** — The IBL environment map contributes a faint
   tint to sprite shadow regions, simulating bounced light from the ground/sky.
3. **Sun response** — Sprite brightness shifts subtly when the character faces
   toward vs. away from the sun direction (a per-frame tint blend, not full
   re-lighting).

### 5.2 Rim-Light Implementation (High/Ultra Tiers)

The rim-light is implemented as a shared `onBeforeCompile` snippet on sprite
materials. It follows the same pattern already established for the 3D rig rim-light
in `graphics-plan.md` Step 8:

```glsl
// Fragment shader injection on sprite material:
float rim = 1.0 - saturate(dot(normalize(vViewPosition), vec3(0.0, 0.0, 1.0)));
totalEmissiveRadiance += uRimColor * uRimIntensity * pow(rim, 3.0);
```

Parameters are tier-gated:
- `uRimColor`: scene key light colour (`SUN_ANCHOR` tint) on ultra; fixed warm
  white on high.
- `uRimIntensity`: 0.0 on low/medium; 0.08 on high; 0.12 on ultra.

### 5.3 Bake vs. Dynamic: Decision Matrix

| Scene Element | Lighting Method | Rationale |
|---------------|----------------|-----------|
| Character sprites | Baked (painted) | Pre-lit in authoring tool; consistent look independent of environment |
| Creature GLBs | Dynamic (PBR + IBL) | Full material response to scene lighting |
| Terrain | Dynamic (splat PBR + hemi + directional) | Procedural terrain needs dynamic normals |
| Water | Dynamic (ShaderMaterial) | Animated normals, fresnel, sun glints |
| Props (buildings, fences) | Dynamic (PBR) | Absorbed into merged-geometry draws; benefits from IBL |
| Sky | Dynamic (ShaderMaterial dome) | Procedural per-biome sky with sun position |
| UI | Static (painted) | Tokens and themes, no scene lighting response |

### 5.4 Directional Light Conventions

- **Sun elevation:** ~35° above horizon (fixed; no day/night cycle).
- **Sun azimuth:** South-east (world +Z / +X quadrant).
- **Light colour:** Warm `0xffedd0` (golden-hour tint).
- **Shadow map:** PCFSoft, 4096 at high/ultra, 1024 at low.
- **IBL:** Per-biome equirectangular HDRI environment maps generated from the
  procedural sky dome. Environment intensity scaled by biome (vale: 0.55,
  dungeon: 0.05).
- **Fill light:** Hemisphere light with green ground-bounce (`0x46603a`) at 0.45
  intensity.

### 5.5 Why Not Dynamic Sprite Lighting

Full dynamic lighting on 2D sprites (normal-mapped billboards, per-pixel lighting)
was considered and rejected for this project:

| Approach | Rejected Because |
|----------|-----------------|
| Per-pixel lighting on sprite planes | Requires generating normal maps for every sprite frame; art cost multiplies by 4× without proportional visual gain in isometric view |
| Vertex-colour tint from scene lights | Produces flat, unconvincing shading; sprites read as "tinted cutouts" rather than volumetric characters |
| Sprite-rendered shadow maps | Sprite planes cast incorrect shadows (they're always camera-facing); would require shadowproxy geometry per sprite |

The tiered rim-light bleed approach achieves 80 % of the visual integration at
< 5 % of the implementation cost of full dynamic lighting.

---

## 6. Animation Standards

### 6.1 Frame Budget

Animations are intentionally **minimal** — 1–2 frames per animation type. This is
a deliberate stylistic and production choice:

- **Stylistic:** Low-frame-count animation reads as "illustrated storybook" motion,
  consistent with the hand-painted aesthetic. The slight snap between frames
  communicates the crafted nature of the art (versus the uncanny valley of
  under-animated 3D).
- **Production:** Each additional frame costs ~25 % more art time per sprite sheet
  (painting, shading, and cleanup). Keeping to 1–2 frames lets us ship more entity
  types faster.

### 6.2 Current (Phase 1) — Single Frame

All entities currently use 1 frame for all animation types (idle, walk, attack,
cast reference the same row 0). The `tick()` method in `BillboardSprite` detects
frame duration but does not advance the frame:

```ts
// From billboard.ts (line 84-103):
tick(dt: number): boolean {
  if (!this.state.playing) return false;
  const fps = getAnimFPS(this.meta, this.state.type);
  this.animTime += dt;
  const frameDuration = 1 / fps;
  // Currently single-frame: always stays at frame 0
  this.currentFrame = 0;
  this.updateMaterial();
  return false; // No frame change
}
```

### 6.3 Target (Phase 2) — 2-Frame Loop

| Animation | Frames | Loop | Visual Description |
|-----------|--------|------|-------------------|
| idle | 1–2 | Yes | Frame 0: neutral stance. Frame 1 (optional): subtle weight shift or breath. Loop period: ~1 s (1 FPS) |
| walk | 2 | Yes | Frame 0: left foot forward. Frame 1: right foot forward. Loop at 4–8 FPS depending on movement speed |
| attack | 1–2 | No | Frame 0: wind-up. Frame 1 (optional): strike pose. Plays once, returns to idle |
| cast | 1–2 | No | Frame 0: hands raised. Frame 1 (optional): release pose. Plays once, returns to idle |

### 6.4 Frame Timing

Animation playback speed is controlled by the `fps` field in `SpriteSheetMeta`:

```json
"fps": {
  "idle": 1,
  "walk": 6,
  "attack": 10,
  "cast": 6
}
```

For a 2-frame idle animation at 1 FPS, each frame displays for 1000 ms, creating
a slow, gentle breathing loop. For a 2-frame walk at 6 FPS, each frame displays
for ~167 ms, producing a brisk stride.

### 6.5 Animation Transitions

Transitions are instant (no blend). When the animation type changes:
1. Frame resets to 0.
2. `animTime` resets to 0.
3. Material UV updates immediately to the new frame.

This snap-cut is consistent with the low-frame-count aesthetic. Future work could
add a cross-fade or a single-frame "transition pose" between walk→idle, but this
is deferred until Phase 3.

---

## 7. Quality Benchmarks

### 7.1 Sprite Quality Criteria

Every sprite sheet must pass the following criteria before being accepted into the
pipeline:

| Criterion | Standard | Measurement |
|-----------|----------|-------------|
| **Colour saturation** | Average saturation ≥ 65 in HSV across the character area | Sample 5 random pixels per frame; reject if any fall below 40 saturation |
| **Edge clarity** | No alpha pixels within 2 px of a fully opaque pixel that have alpha < 0.5 | Scan tool checks sprite edge gradient: must not exceed 3 px of partial alpha on intended hard edges |
| **Silhouette readability** | Character shape is identifiable at 64 × 64 px downscale | Visual review at game resolution; must distinguish class silhouette at a glance |
| **Colour banding** | No more than 3 visible colour bands on any continuous surface | Visual review; flat gradients acceptable, posterized banding rejected |
| **Lighting consistency** | Light direction matches above-left convention across all frames | Visual review; shadow/ highlight positions must be consistent |
| **Frame-to-frame coherence** | Painted elements (face, hands, armour details) remain recognisably the same across frames | Side-by-side comparison; no anatomical drift |
| **Noise/grain** | No intentional noise or canvas texture in flat colour areas | Visual review at 100 %; flat areas should be intentionally flat |

### 7.2 Benchmark Visual Alignment

Each sprite sheet is compared against the reference game styles:

| Reference | Alignment Check |
|-----------|----------------|
| **Tree of Savior** | Does the sprite sit naturally in the 3D world without seeming like a cutout? Test by rendering against the terrain at 3 camera angles. |
| **Ragnarok Origin** | Is the class silhouette readable at 50 % game resolution? Can you identify the class from shape alone? |
| **Granblue Fantasy Relink** (billboard NPCs) | Does the sprite hold up at close zoom? Are the painted details crisp at 100 % pixel scale? |
| **Octopath Traveler II** | Do post-processing effects (bloom, AO, vignette) unify the sprite with the 3D world? View with all post-processing enabled. |
| **Eiyuden Chronicle** | Is the colour palette warm and vibrant? Does the sprite feel hand-crafted rather than procedurally generated? |

### 7.3 Technical Quality Gates

| Gate | Threshold | Automated? |
|------|-----------|------------|
| Texture memory | Each sprite sheet ≤ 16 MB uncompressed (4096 × 4096 × 4 bytes) | Yes (build-time check) |
| Load time | JSON metadata ≤ 4 KB per sheet | Yes (build-time check) |
| Frame count | ≤ 2 frames per animation type | Yes (JSON schema validation) |
| Direction coverage | Must define all 7 directions (4 source + 3 mirrors) | Yes (JSON schema validation) |
| GLB poly count | Creatures ≤ 15K tris; props ≤ 5K tris; characters ≤ 25K tris | Yes (build-time GLB inspect) |
| Draw calls | Billboard entities: 1 draw per sprite (shared geometry) | Yes (runtime webgl.info) |

### 7.4 Performance Budget

| Metric | Target | Tier |
|--------|--------|------|
| Billboard entities per scene | ≤ 60 active | All tiers |
| Billboard draw calls | 1 per visible sprite (shared geometry + material) | All tiers |
| Billboard texture binds | 1 per unique sprite sheet | All tiers |
| Creature GLB draws | ≤ 30 visible (instancing reduces to ~8 unique) | All tiers |
| Total scene draws | ≤ 300 typical, ≤ 1.2 M tris visible | high |
| Frame time budget (sprites) | ≤ 1 ms | All tiers |

---

## 8. References

### 8.1 Benchmark Games

| Game | Style Reference | Key Takeaway |
|------|----------------|--------------|
| **[Tree of Savior](https://store.steampowered.com/app/372000/Tree_of_Savior/)** (IMC Games) | Isometric 2.5D, hand-painted sprites in 3D environments | The benchmark for how billboard characters integrate with a fully 3D world. Warm, vibrant colour palette. |
| **[Ragnarok Origin](https://www.ragnarokorigin.com/)** (Gravity) | Directional character sprites, bold class silhouettes | The direction system (4 source + 3 mirrored angles) is directly adapted from RO's sprite convention. |
| **[Granblue Fantasy Relink](https://granbluefantasyrelink.com/)** (Cygames) — 2D billboard NPCs | High-resolution illustrated billboards in 3D scenes | Proof that 2D billboards can coexist with high-quality 3D rendering without feeling dated. |
| **[Octopath Traveler II](https://octopath traveler.square-enix-games.com/)** (Square Enix / Acquire) | HD-2D: pixel sprites + 3D environments + depth-of-field + bloom | The post-processing unification of 2D and 3D elements. Sprite colour bleed from environment. |
| **[Eiyuden Chronicle: Hundred Heroes](https://www.eiyudenchronicle.com/)** (Rabbit & Bear Studios) | Vibrant hand-painted 2D characters in 3D environments | High colour saturation, warm lighting, and emotional readability. |

### 8.2 Internal References

| Reference | Location |
|-----------|----------|
| Existing sprite sheets | `public/models/chars/sprite_001_.png` through `sprite_014_.png` |
| Sprite metadata format | `public/models/chars/sprite_001_.json` |
| Billboard system source | `src/render/billboard/` |
| GFX tier configuration | `src/render/gfx.ts` |
| Graphics implementation plan | `docs/design/graphics-plan.md` |
| Lookdev hookup notes | `docs/design/lookdev-hookup.md` |
| Design language (UI) | `DESIGN.md` (repo root) |

### 8.3 Tools

| Tool | Purpose |
|------|---------|
| Sprite sheet authoring | Clip Studio Paint / Photoshop / Aseprite (hand-painted, 688 × 1536 px frames) |
| GLB optimisation | `npx gltf-transform optimize` (Draco compression, texture resize) |
| GLB inspection | `npx gltf-transform inspect` (poly count, texture memory) |
| Sprite sheet validation | Build-time script (schema + dimension + memory checks) |

---

## Appendix A — Sprite Sheet Template

```json
{
  "image": "sprite_XXX_.png",
  "frameWidth": 688,
  "frameHeight": 1536,
  "columns": 4,
  "rows": 4,
  "fps": {
    "idle": 1,
    "walk": 6,
    "attack": 10,
    "cast": 6
  },
  "directions": {
    "SE": 0,
    "E": 1,
    "N": 2,
    "NW": 3
  },
  "mirrorDirections": {
    "SW": "SE",
    "W": "E",
    "NE": "NW"
  },
  "animations": {
    "idle":   { "row": 0 },
    "walk":   { "row": 1 },
    "attack": { "row": 2 },
    "cast":   { "row": 3 }
  }
}
```

## Appendix B — Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-29 | **Entity scope:** phased rollout (players + NPCs first, creatures later) | Controls art production cost; validates billboard pipeline before expanding scope |
| 2026-07-29 | **Lighting:** tiered hybrid (baked default, rim-light + env bleed on high/ultra) | Balances visual quality against performance; keeps low tier performant |
| 2026-07-29 | **GLB coexistence:** sprites + GLBs both used per entity type | Enables best-fit representation per entity (characters = sprites, creatures = GLBs) |
| 2026-07-29 | **Animation frames:** minimal (1–2 frames per animation) | Stylistic choice (storybook feel); production efficiency (faster to produce more entities) |
| 2026-07-29 | **Sprite filter:** LinearFilter (not NearestFilter) | Illustrated art needs bilinear sampling; nearest-neighbour is for pixel art only |
| 2026-07-29 | **No dynamic sprite lighting** | Pre-lit sprites with tiered rim-light bleed achieve 80 % integration at < 5 % cost of full dynamic |
| 2026-07-29 | **Per-species PBR materials:** critters get unique roughness/metalness | Birds (0.75 roughness, 0.05 metalness) read as feathers; rabbits (0.92, 0) read as fur |
| 2026-07-29 | **Per-species rim intensity:** configurable per species (0.06-0.10) | Birds need stronger rim for silhouette separation; small critters get subtle treatment |
| 2026-07-29 | **addRimGlow() intensity parameter:** default 0.12, configurable | Backward compatible; character rigs use default, creatures use per-species values |
