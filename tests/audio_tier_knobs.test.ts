import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SFX_MAX_VOICES_FULL,
  SFX_MAX_VOICES_LOW,
  sfxMaxVoices,
} from '../src/game/audio_tier_knobs';
import type { UiEffectsTier } from '../src/game/ui_effects_profile';

// Per-tier AUDIO cost knobs (the audio sibling of ui_tier_knobs). The headline
// gate is the same two-controller hazard: every knob is a pure function of the
// STATIC tier and NEVER reads the FPS governor, so only the static preset can
// move a knob. These tests pin that (import-absence + behavioral), the
// no-op-on-full invariant (medium/high/ultra are byte-equivalent to the
// pre-tiering hard cap), and that low measurably sheds.

// The four published tiers and the three that must stay at full cost (only low sheds).
const ALL_TIERS: readonly UiEffectsTier[] = ['low', 'medium', 'high', 'ultra'];
const FULL_TIERS: readonly UiEffectsTier[] = ['medium', 'high', 'ultra'];

describe('audio_tier_knobs - determinism (pure: same input, same output)', () => {
  it('sfxMaxVoices returns an identical value on repeated calls', () => {
    for (const tier of ALL_TIERS) {
      expect(sfxMaxVoices(tier)).toBe(sfxMaxVoices(tier));
    }
  });
});

describe('audio_tier_knobs - no-op on full tiers (the unchanged hard cap)', () => {
  it('medium/high/ultra keep the full 24-voice hard cap', () => {
    for (const tier of FULL_TIERS) {
      expect(sfxMaxVoices(tier)).toBe(SFX_MAX_VOICES_FULL);
      expect(sfxMaxVoices(tier)).toBe(24); // the pre-tiering MAX_VOICES value
    }
  });
});

describe('audio_tier_knobs - low sheds on every knob', () => {
  it('the low tier halves the concurrent-voice cap', () => {
    expect(sfxMaxVoices('low')).toBe(SFX_MAX_VOICES_LOW);
    expect(sfxMaxVoices('low')).toBeLessThan(SFX_MAX_VOICES_FULL);
  });
});

describe('audio_tier_knobs - LOW shed magnitudes are pinned to literals (perf-gate bounds)', () => {
  // The full-tier value is literal-pinned above (24, the pre-tiering hard cap).
  // Pin the LOW shed amount to a literal too, so retuning how much low sheds is
  // a DELIBERATE change that must edit this test, not a silent drift the
  // self-referential `toBe(CONST)` assertions would pass.
  it('pins each audio tier constant', () => {
    expect(SFX_MAX_VOICES_FULL).toBe(24);
    expect(SFX_MAX_VOICES_LOW).toBe(12);
  });
});

describe('audio_tier_knobs - import absence + two-controller hazard (source scan)', () => {
  // The headline acceptance: the mapping reads the STATIC tier ONLY and never the FPS
  // governor, so flipping the static preset is the only thing that can move a knob.
  const src = readFileSync(
    fileURLToPath(new URL('../src/game/audio_tier_knobs.ts', import.meta.url)),
    'utf8',
  );
  // Blank out comments so prose (which legitimately names the governor + the static
  // preset) cannot create a false positive; only real code is scanned.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('imports ONLY the UiEffectsTier type from the sibling resolver, nothing else', () => {
    const froms = [...code.matchAll(/\bimport\b[^;]*\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(froms).toEqual(['./ui_effects_profile']);
    expect(code).not.toMatch(/\bimport\s*\(/); // no dynamic import either
  });

  it('never reads the FPS governor state (the two-controller hazard)', () => {
    expect(code).not.toMatch(/governor/i);
    expect(code).not.toMatch(/render_budget/);
    expect(code).not.toMatch(/\.state\s*\(/);
    expect(code).not.toMatch(/\.levels\b/);
  });

  it('never reaches into src/render, src/ui, or src/net', () => {
    expect(code).not.toMatch(/['"][^'"]*\/render\//);
    expect(code).not.toMatch(/['"][^'"]*\/ui\//);
    expect(code).not.toMatch(/['"][^'"]*\/net\//);
  });

  it('touches no DOM global and no nondeterministic clock/random (purity)', () => {
    expect(code).not.toMatch(/\b(document|window|navigator|localStorage|sessionStorage)\s*[.[]/);
    expect(code).not.toMatch(/\b(Math\.random|Date\.now|performance\.now)\b/);
  });
});

describe('audio_tier_knobs - behavioral: only the tier moves a knob', () => {
  it('repeated unrelated churn cannot move a knob (no hidden state)', () => {
    const before = ALL_TIERS.map(sfxMaxVoices);
    // Unrelated churn that a governor-driven knob would react to (it must not here).
    for (let i = 0; i < 1000; i++) sfxMaxVoices(i % 2 === 0 ? 'ultra' : 'low');
    const after = ALL_TIERS.map(sfxMaxVoices);
    expect(after).toEqual(before);
    // And low is strictly cheaper than ultra (the gate's point).
    expect(before[0]).toBeLessThan(before[3]);
  });
});
