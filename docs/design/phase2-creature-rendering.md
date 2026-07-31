# Phase 2: Creature Rendering Upgrades

**Author:** Art Director + Tech Lead  
**Status:** Draft  
**Date:** 2026-07-29  
**Depends on:** rendering-goal.md (§3.2 Phase 2 — Creatures)  
**Applies to:** `src/render/critters.ts`, `src/render/gfx.ts`, `public/models/creatures/`

---

## 1. Current State

### 1.1 Creature Material Setup (critters.ts)

Currently, all creatures use a simple material configuration:

```ts
function matFor(s: Species): THREE.Material {
  const opts = { color: TINT[s], roughness: 0.85, metalness: 0 };
  return GFX.standardMaterials
    ? new THREE.MeshStandardMaterial(opts)
    : new THREE.MeshLambertMaterial({ color: TINT[s] });
}
```

**Issues:**
- All species share the same roughness (0.85) and metalness (0)
- No rim-light applied (character rigs get it, creatures don't)
- No per-species visual differentiation beyond color

### 1.2 Existing Rim-Light System (gfx.ts)

The `addRimGlow()` function already exists and is used for character rigs:

```ts
export function addRimGlow(mat: THREE.Material): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimBoost = sharedUniforms.uRimBoost;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uRimBoost;`)
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.5, 0.6, 0.8) * 0.12 * uRimBoost *
          pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`
      );
  };
}
```

**Current behavior:**
- `uRimBoost` scales rim intensity (boosted in dungeons via `renderer.ts`)
- Only applied when `surfaceMat({ rim: true })` is called
- Creatures never call this path

---

## 2. Phase 2 Goals

| Goal | Success Metric |
|------|----------------|
| Per-species PBR materials | Each creature type has unique roughness/metalness values |
| Rim-light on creatures | Visible rim glow on high/ultra tiers |
| Per-species rim intensity | Configurable intensity per species (e.g., wolves > rabbits) |
| Tier alignment | Matches rendering-goal.md tier table |
| No performance regression | Frame time within budget (≤ 1ms for creatures) |

---

## 3. Vertical Phases

### Phase 2a: Per-Species Material Configs

**Outcome:** Each creature species has tuned PBR material properties.

**Scope:**
- Define per-species material configs in `critters.ts`
- Update `matFor()` to use species-specific roughness/metalness

**Implementation:**

```ts
// Per-species PBR material config
interface CreatureMaterialConfig {
  color: number;
  roughness: number;
  metalness: number;
  rimIntensity: number; // 0 = no rim, 0.08 = subtle, 0.12 = full
}

const CREATURE_MATERIALS: Record<Species, CreatureMaterialConfig> = {
  rabbit: {
    color: 0x9a8166,
    roughness: 0.92,  // fur: high roughness, no metalness
    metalness: 0,
    rimIntensity: 0.06, // subtle rim for small creatures
  },
  squirrel: {
    color: 0xa05a30,
    roughness: 0.88,  // fur: slightly smoother than rabbit
    metalness: 0,
    rimIntensity: 0.07,
  },
  bird: {
    color: 0x6b8fb5,
    roughness: 0.75,  // feathers: smoother, slight sheen
    metalness: 0.05,  // minimal metalness for feather reflectivity
    rimIntensity: 0.10, // birds benefit from rim for silhouette separation
  },
};

function matFor(s: Species): THREE.Material {
  const config = CREATURE_MATERIALS[s];
  if (GFX.standardMaterials) {
    return new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
    });
  }
  return new THREE.MeshLambertMaterial({ color: config.color });
}
```

**Tests:**
- Visual: Each species has distinct material response to lighting
- No runtime errors

**Exit Criteria:**
- Per-species materials render correctly
- Low tier still uses Lambert (no PBR)

**State for Next Phase:**
- `CREATURE_MATERIALS` config ready for rim-intensity values

---

### Phase 2b: Rim-Light on Creatures (High/Ultra)

**Outcome:** Creatures display rim-light glow on high/ultra tiers.

**Scope:**
- Apply `addRimGlow()` to creature materials when `GFX.standardMaterials` is true
- Gate rim-light to high/ultra tiers only

**Implementation:**

```ts
function matFor(s: Species): THREE.Material {
  const config = CREATURE_MATERIALS[s];
  if (GFX.standardMaterials) {
    const mat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
    });
    // Apply rim-light on high/ultra (standardMaterials = true)
    addRimGlow(mat);
    return mat;
  }
  return new THREE.MeshLambertMaterial({ color: config.color });
}
```

**Note:** The existing `addRimGlow()` uses `uRimBoost` which is already boosted in dungeons. This gives us dungeon rim-light for free.

**Tests:**
- Visual: Rim glow visible on creatures at high/ultra
- Visual: No rim glow on low/medium
- Performance: No frame-time regression

**Exit Criteria:**
- Rim-light visible on high/ultra
- Low/medium unaffected

**State for Next Phase:**
- Rim-light applied, but intensity is uniform across species

---

### Phase 2c: Per-Species Rim Intensity

**Outcome:** Each species has configurable rim-light intensity.

**Scope:**
- Extend `addRimGlow()` to accept an intensity parameter
- Use per-species `rimIntensity` from `CREATURE_MATERIALS`

**Implementation:**

```ts
// Extended rim-glow with configurable intensity
export function addRimGlow(mat: THREE.Material, intensity: number = 0.12): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimBoost = sharedUniforms.uRimBoost;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uRimBoost;`)
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.5, 0.6, 0.8) * ${intensity.toFixed(3)} * uRimBoost *
          pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`
      );
  };
}

// Usage in critters.ts
function matFor(s: Species): THREE.Material {
  const config = CREATURE_MATERIALS[s];
  if (GFX.standardMaterials) {
    const mat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
    });
    addRimGlow(mat, config.rimIntensity);
    return mat;
  }
  return new THREE.MeshLambertMaterial({ color: config.color });
}
```

**Tests:**
- Visual: Birds have stronger rim than rabbits
- Visual: Rim intensity matches config values
- No runtime errors

**Exit Criteria:**
- Per-species rim intensity working
- Documentation updated

**State for Next Phase:**
- Phase 2 complete, ready for documentation

---

### Phase 2d: Documentation + Tier Table Update

**Outcome:** Rendering goal document reflects Phase 2 changes.

**Scope:**
- Update `rendering-goal.md` §3.2 Phase 2 status to "Implemented"
- Update §4.4 tier table with creature-specific rim-light details
- Add per-species material config reference

**Exit Criteria:**
- Documentation accurate
- No outstanding TODOs

---

## 4. Tier Alignment

| Tier | Creature Materials | Rim-Light | Per-Species Intensity |
|------|-------------------|-----------|----------------------|
| **low** | Lambert (no PBR) | None | N/A |
| **medium** | Standard (shared roughness) | None | N/A |
| **high** | Standard (per-species) | Subtle (0.08) | Yes |
| **ultra** | Standard (per-species) | Full (0.12) + dungeon boost | Yes |

---

## 5. Performance Budget

| Metric | Target | Notes |
|--------|--------|-------|
| Creature draw calls | No increase | Same material count, just different params |
| Shader compilation | Minimal | `onBeforeCompile` cached per material |
| Frame time (creatures) | ≤ 1 ms | Within existing budget |

---

## 6. Future Work (Phase 3+)

- Distance-based LOD: full GLB at close, simplified at mid, sprite billboard at far
- Creature animation upgrades (idle, walk, attack cycles)
- Boss-specific emissive accents
- Mounts: rider sprite + creature GLB hybrid
