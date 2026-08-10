# Sun Shadow Path Audit

Date: 2026-08-09

Audit of the sun shadow path (`src/render/renderer.ts` sun setup + per-frame
update, `src/render/render_budget.ts` governor, `src/render/gfx.ts` tier
settings). This is the single biggest fixed GPU cost per frame and the one hot
path the runtime governor did not touch.

Motivation: *improve performance on old devices* — phone-class GPUs, low VRAM,
thermal-throttled laptops. Shadows are the largest fixed per-frame GPU cost that
scales with neither the crowd nor the view distance: every frame, three re-bakes
the full depth pass of every shadow caster inside a fixed 190u×190u ortho box
and samples it with the most expensive filter three ships.

## Findings fixed

### S1 — The governor had no shadow knob (fixed)

`RenderBudgetLevels` carried grass/foliage/vfx/lighting/resolution but not
shadows, and `RenderBudgetGovernor.degrade()` never reduced one. Under sustained
frame pressure — exactly the old-device scenario — the 2048²–4096²
`PCFSoftShadowMap` pass kept rendering every frame at full tier resolution while
grass, lighting and resolution all gave way around it.

Fix: a **binary** `shadow` level (`0 | 1`) with its own cap (`minShadowLevel`,
`0` for every tier). The governor gives it in last — only after the cheap
scalers (foliage → grass → lighting → vfx) are all floored, or immediately
under severe frame/submit pressure (≥1.25×) — and recovers it **first**, in a
single step, because it is the cheapest way to hand the biggest visual win
back.

Applied in `renderer.applyRenderBudgetState()` via
`applyShadowLevel(state.levels.shadow)` (see S3 for the mechanism).

### S2 — `PCFSoftShadowMap` was hardcoded for every tier (fixed)

The renderer set `webgl.shadowMap.type = THREE.PCFSoftShadowMap` unconditionally.
PCFSoft is the most expensive filter in three (5-tap + blur) and `medium` is the
default fallback tier for unrecognized/weak devices — so the machines that need
every GPU cycle paid the premium while its softness barely reads at 2048–2560
res.

Fix: a new tier-aware `GfxSettings.shadowFilter` (`'pcf' | 'pcfsoft'`):
4-tap `PCFShadowMap` for `low`/`medium`, `PCFSoftShadowMap` only for
`high`/`ultra` where it softens at 4096-res maps. The advanced graphics preset's
shadow-quality slider (`< 0.5`) now also drops the filter to PCF alongside its
1024-res map. The renderer reads it once at startup; it is baked into compiled
shader defines, so it is never toggled at runtime (see S3).

### S3 — Mechanism: per-light `shadow.autoUpdate` freeze (the safe lever)

Three options for disabling the pass at runtime, and why only one is safe:

- **`castShadow` toggle** — unsafe: `WebGLLights` derives
  `NUM_DIR_LIGHT_SHADOWS` from it and `WebGLPrograms` bakes
  `shadowMapEnabled` into material defines at compile time. Flipping it at
  runtime forces a shader recompile storm mid-frame.
- **`renderer.shadowMap.enabled` toggle** — same problem: the
  `shadowMapEnabled` define gates the shadow sampler in every compiled program.
- **Per-light `shadow.autoUpdate = false`** — safe. `WebGLShadowMap.render()`
  early-skips the light's depth pass when `autoUpdate` is false, and
  `shadow.updateMatrices(light)` runs only *after* that skip, so the frozen
  `shadow.matrix` stays coherent with the stale map (the sun light is
  directional and effectively static in this game; its target follows are
  gated off while frozen). No shader recompile, no GPU allocation.

`applyShadowLevel()` flips exactly this flag (and sets `needsUpdate` so the
first frame after recovery re-bakes once). The depth-pass culling and the blob
shadows under billboards are untouched.

## Design detail — why binary, not a resolution knob

three r165 only (re)allocates a light's shadow render target when
`shadow.map === null`; there is no runtime resolution change without a manual
`dispose()`, and a per-frame realloc is precisely what the governor avoids.
A binary on/off is the only allocation-free runtime lever, which is why the
governor treats it as the last step before render-resolution scaling rather
than a gradual dial.

## Validation

- **Vitest:** render_budget (8 governor tests incl. 2 new: shadow drops last /
  recovers first) + gfx (shadowFilter per tier) + architecture + the billboard /
  sfx / audio-tier suites from the surrounding passes — all green.
- **tsc --strict** scoped to the edited modules: clean (full-project tsc runs in
  the platform check).
- **Biome:** clean on all edited files.

## Remaining known cost

The depth pass itself (the re-bake of all casters in the ortho box while
`autoUpdate` is on) is still a full-scene pass; shrinking the 190u box or
culling low-detail casters at distance is a larger feature, not a governor
knob. The binary switch already removes the pass entirely on weak devices under
pressure.
