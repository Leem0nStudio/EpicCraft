# HUD / DOM Per-Frame Hot Path Audit

Date: 2026-08-09

Audit of the per-frame DOM work in the HUD coordinator (`src/ui/hud.ts`
`update()` + the two bar renderers it calls every frame). This is the tail end
of the "HUD/DOM" leg of the old-devices hot-path sweep (shadows and the sprite
flip board shipped in `shadow-path-audit.md` / `sprite-billboard-audit.md`;
audio tier caps in `audio_tier_knobs.ts`; the low-tier 30 FPS presentation cap
in `src/main.ts`).

Motivation: *improve performance on old devices* — phone-class CPUs, thermal-
throttled laptops. The HUD coordinator runs once per presented frame, and every
selector query, class toggle, and raw style write in it is main-thread work that
does not scale with the scene; on a 30 FPS-capped low tier it still runs at
frame rate.

## What the per-frame path already did (prior passes, verified)

The coordinator already cadences its subsystems (fast ~100 ms / medium ~250 ms /
slow ~500 ms bands), routes per-frame painter writes through the elided
PainterHost facet (`setText`/`setDisplay`/`toggleClass`/`setStyleProp`/`setAttr`
over the hot-write caches), tiers the buff-bar and target-frame refresh rate on
`data-fx-level`, and change-gates the pet-present body class
(`mobile-pet-active`, `lastPetPresent`) and the low-health vignette.

## Findings fixed in this pass

### H1 — `renderPetBar` / `renderStanceBar` re-queried their roots every frame (fixed)

Both renderers start with `const bar = $('#petbar') as HTMLElement` /
`$('#stancebar')`, and `update()` calls both unconditionally every frame. The
two cached fields (`petBarEl`, `stanceBarEl`) had been added in the prior pass
but never wired.

Fix: the renderers now read the cached fields — the per-frame path performs
zero selector queries for these roots.

### H2 — Raw `bar.style.display` writes every frame in both bar renderers (fixed)

Even when the bar's signature was unchanged, the renderers re-wrote
`bar.style.display = 'flex'` / `'none'` raw (uncounted, unelided) every frame.
Both now route through the shared elided `setDisplay` writer, so an unchanged
bar costs zero DOM writes and the skip-rate counters see it.

### H3 — Talent-button glow re-queried + re-toggled every frame (fixed)

`update()` ran `document.getElementById('mm-talents')` and
`document.getElementById('mobile-talents')` and re-toggled `has-points` every
frame, even though unspent-talent state changes only on level-up or spend.

Fix: cached refs (`mmTalentsEl`, `mobileTalentsEl`, added last pass but
unwired) plus a change gate (`lastTalGlow`): the toggle fires only when the
glow state flips.

### H4 — `body.spirit-mode` re-toggled every frame (fixed)

`update()` ran `document.body.classList.toggle('spirit-mode', ghost)` every
frame. Death/release transitions are rare; the toggle now fires only when the
ghost state flips (`lastSpiritMode`).

### H5 — `.low` resource-bar pulse class re-toggled every frame (fixed)

`updateLowResource()` ran `bar.classList.toggle('low', v.active)` every frame
(the expensive style/label writes were already signature-diffed). The class
toggle is now change-gated on `lastLowResourceActive`, so an unchanged frame
costs zero class work.

## Net effect per unchanged frame

- 2 selector queries removed (`#petbar`, `#stancebar`).
- 2 raw `style.display` writes replaced by elided `setDisplay` no-ops.
- 2 selector queries + 2 `has-points` toggles removed (talent glow).
- 1 `body` class toggle removed (spirit-mode).
- 1 resource-bar class toggle removed (`.low`).

All removed work is on the every-frame path, so the saving multiplies by the
presentation rate (60 on full tiers, 30 on the low-tier frame cap).

## Validation

- **Static pin:** `tests/hud_perf_budget.test.ts` gained an ARM 1b block that
  scans the `update()` path source and fails if a future edit re-introduces a
  per-frame `$('#petbar')` / `$('#stancebar')` query, a raw
  `getElementById('mm-talents')` / `('mobile-talents')` in the coordinator, or
  an ungated `classList.toggle('spirit-mode'` / `('has-points'` /
  `('low'` — the change-gate wiring is now a standing perf-budget contract.
- **Vitest:** hud_perf_budget (40 tests, incl. the new ARM 1b) + client_shell
  (89) + mobile_hud_layout (16) + hud_chrome_i18n (4) — all green.
- **tsc --noEmit** scoped to the edited modules: clean (full-project tsc runs
  in the platform check).

## Remaining known cost

The coordinator still runs several signature-diffed builders on the medium/slow
bands and the elided writers for player/target frames each frame — that is the
designed floor (fast combat-critical widgets stay frame-rate, everything else is
cadenced or diffed). The next large structural lever is the HUD program's
R-24 per-frame hardening and dirty-state conversion of quest/social/market
panels (`docs/hud-program-roadmap.md`), which is a program-scoped effort, not a
hot-path fix.
