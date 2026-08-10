// Pure per-tier AUDIO cost knobs (v0.28.0). The sibling module ui_tier_knobs.ts
// owns the HUD per-element cost mapping; this one owns the audio engine cost
// mapping. The shape is identical, and the two-controller hazard applies the
// same way: every knob is a pure function of the STATIC effects tier (the
// data-fx-level stamp the preset applier writes), NEVER the FPS governor, so a
// knob can only move when the static preset moves.
//
// This file is host-agnostic and DOM/Three-free: it imports nothing at runtime
// (only the UiEffectsTier TYPE, erased at compile time), references no governor,
// and uses no DOM global / Math.random / Date.now / performance.now. It is
// registered in UI_PURE_CORES (tests/architecture.test.ts) alongside
// ui_effects_profile.ts and ui_tier_knobs.ts, so the purity guard pins the
// no-governor / no-DOM / determinism rules, and tests/audio_tier_knobs.test.ts
// adds the import-absence + behavioral assertions.
//
// NO-OP-ON-FULL INVARIANT: only the 'low' tier sheds cost (mirroring every
// other tier knob). Every knob returns its full-effects value for
// medium/high/ultra, so the tier branch is a no-op there and the full path is
// byte-identical to pre-tiering. Audio polyphony is cosmetic richness, not an
// actionable signal: the low cap lowers the concurrency ceiling (a source is
// skipped only under load, exactly as the hard cap already does today), it
// never silences a specific cue.

import type { UiEffectsTier } from './ui_effects_profile';

/**
 * Concurrent one-shot SFX sources at the full effects tiers: the long-standing
 * hard frame-budget guard (24 simultaneous decoded clips through the spatial
 * panner chain). Full tiers keep this exact value.
 */
export const SFX_MAX_VOICES_FULL = 24;
/**
 * Concurrent one-shot SFX sources on the low tier: half the full ceiling. The
 * classic old-device trade: mixing ~12 simultaneous decoded clips costs about
 * half of the ~24-clip worst case (a raid zerg) on CPUs that are already the
 * frame bottleneck. 12 concurrent cues is still ample audio feedback (a busy
 * fight: player attack + target hit + a few creatures' casts/footsteps +
 * ambience), and the cap only ever SKIPS a source under load, the same
 * behavior the 24-cap already has today.
 */
export const SFX_MAX_VOICES_LOW = 12;

/** The concurrent one-shot SFX voice cap for `tier`: 24 at the full tiers
 *  (unchanged), 12 on low. Consumed by the Sfx engine's frame-budget guard. */
export function sfxMaxVoices(tier: UiEffectsTier): number {
  return tier === 'low' ? SFX_MAX_VOICES_LOW : SFX_MAX_VOICES_FULL;
}
