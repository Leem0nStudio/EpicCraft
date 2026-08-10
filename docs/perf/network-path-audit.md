# Network Mirror Hot-Path Audit

Date: 2026-08-09

Audit of the online client's per-message and per-frame network work: the
snapshot decode (`ClientWorld.applySnapshot` + `applyWire` in
`src/net/online.ts`), the per-frame input flush (`flushInput` / `sendInput`
in `online.ts`, driven from the online leg of the frame loop in `src/main.ts`),
and the render-side interpolation read (`src/render/net_interp_core.ts`).
This is the "red" (network) leg of the old-devices hot-path sweep; the sprite
flip board, HUD/DOM, and sun shadow legs shipped in
`sprite-billboard-audit.md`, `hud-dom-audit.md`, and `shadow-path-audit.md`.

Motivation: *improve performance on old devices* - phone-class CPUs,
thermal-throttled laptops. The mirror decodes 20 Hz snapshots (so every
per-entity cost multiplies by the crowd on screen) and flushes input once per
presented frame (so every per-frame allocation is GC pressure even when idle).

## Findings fixed

### N1 - `applyWire` allocated a fresh `{x,y,z}` prevPos per entity per snapshot (fixed)

The interpolation re-anchor ran:

```ts
e.prevPos = { x: e.prevPos.x + (e.pos.x - e.prevPos.x) * entAlpha, ... };
```

and the teleport-snap branch ran `e.prevPos = { x: w.x, y: w.y, z: w.z };` -
a fresh object per ENTITY per 20 Hz SNAPSHOT, in both branches. With a town
crowd (tens of mirror entities) that is 1000+ small object allocations per
second, the same per-crowd class the billboard pass removed from
`cameraRelativeDirection()` (sprite-billboard-audit F1).

Fix: mutate the existing `prevPos` object in place in both branches. `prevPos`
is always an existing object (initialized by `blankEntity`, overwritten only
by this code, never aliased to `pos`), so field writes are safe, the float
math is byte-identical, and the per-snapshot allocation is gone. Object
identity is now a contract: the renderer reads `prevPos` fields live each
frame, and `tests/net_hot_path.test.ts` pins that identity.

### N2 - `inputSignature()` allocated an array + join string every frame (fixed)

`flushInput()` (and the 50 ms heartbeat) compute the change-detection
signature via `[f,b,tl,tr,sl,sr,j,facing].join(',')`. Online, `flushInput`
runs once per presented frame and computes the signature even when the
unchanged-signature check bails, so the array + joined string was an
every-frame allocation on the online path.

Fix: build the same comma-separated string with plain concatenation. The
string is only ever compared for equality, never parsed, and the shape is
byte-identical to the former join, so the flush semantics (skip unchanged,
frame-throttle changed) are pinned by `tests/net_hot_path.test.ts`.

## Already clean (verified, no change needed)

- **`wireSeen` is a reused scratch Set**, cleared per message instead of
  allocating one per snapshot (20 Hz).
- **Threat, cooldowns, and auras mutate in place.** `e.threat` /
  `e.cooldowns` clear + re-fill the same Map; the aura set is updated
  index-for-index when the shape is unchanged (a fresh aura array + objects
  is built only when the set actually changes composition). The stable
  timer-wire self timers also update schedules in place.
- **Heavy self fields are delta-guarded** (`inv`, `qlog`, `tal`, `party`,
  `market`, ...), so the expensive rebuilds only run on the snapshots that
  carry them, not every tick.
- **The prune loop is allocation-free**: the despawn-grace `missingSince`
  Map is maintained in place and the entity map is only ever deleted from.
- **The renderer reads prevPos without allocating.** `renderer.sync`
  (online path) and `self_motion` compute interpolated poses from
  `prevPos`/`pos` field reads; `remoteEntityAlpha` (`net_interp_core.ts`) is
  pure arithmetic with module constants. The re-anchor math in `applyWire`
  is documented LOCKSTEP with that core.
- **The server omits empty `rings` / `hourglasses`**, so the client's
  `flatMap` rebuild runs only when the effects are actually present
  (bounded, rare), not every snapshot.
- **The per-frame online loop in `main.ts` is tight**: `Object.assign` into
  the shared `moveInput`, `wrapAngle`, and array-swap drains, no per-frame
  object allocation.
- `prepareSnapshotTimers` returns one tiny `{mode, time}` object per
  snapshot and `drainEvents` swaps arrays; both are negligible and
  allocation-free per entity.

## Tests

- `tests/net_hot_path.test.ts` (3): pins prevPos object identity across
  snapshots (the regression guard for N1), the teleport-snap branch
  (snapped exact values, same object, never aliases pos), and the
  unchanged-signature skip + 16 ms changed-throttle semantics (N2). Uses the
  repo's bare-client idiom (`Object.create(ClientWorld.prototype)`) with a
  stubbed `performance.now` so the re-anchor alpha is deterministic.
- The surrounding online suites (xp, weapon_stow, vale_cup_client,
  social_frames, target_frame, inventory_order, v027_port_restorations) stay
  green; all 108 tests in the batch pass.

## Remaining known cost

The snapshot JSON.parse itself is the wire payload the server sends; shrinking
it (fewer terse fields, coarser far-tier deltas) is server encoding work owned
by the bandwidth invariants (`tests/bandwidth.test.ts`), not the client decode
path. Inside the decode, the remaining allocations are all bounded by change
rate: first-sight `blankEntity`, identity-record `cloneItemInstancePayload`
clones, aura fresh-builds on composition change, and the `rings` /
`hourglasses` rebuilds while those effects are live.
