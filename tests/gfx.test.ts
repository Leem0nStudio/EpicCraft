import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAMEPLATE_INTERVAL_LOW_SEC, nameplateIntervalSec } from '../src/game/ui_tier_knobs';
import {
  classifyGpuRenderer,
  configureMaskedDoubleSidedVegetationMaterial,
  firstRunGraphicsPreset,
  forcedTierFromSearch,
  GFX_BUCKET_BANDS,
  GFX_BUDGETS,
  type GfxRuntimeHints,
  gfxInternalsForTest,
  graphicsPresetLabel,
  isConstrainedBrowser,
  isSoftwareGL,
  isWeakIntegratedGpu,
  resolveDefaultGraphicsPreset,
  shouldUseAutoGovernor,
  tierFromHints,
} from '../src/render/gfx';

const desktop: GfxRuntimeHints = {
  search: '',
  maxTouchPoints: 0,
  coarsePointer: false,
  narrowViewport: false,
};

describe('graphics tier resolution', () => {
  it('resolves an unset preset device-aware, matching the medium data-fx-level fallback', () => {
    // The 3D tier (tierFromHints) and the HUD data-fx-level (graphicsPresetLabel(settings def))
    // must agree on the unset/first-run default so they never diverge. An unrecognized device
    // falls to MEDIUM on BOTH paths (settings.ts graphicsPreset def is 2 = medium); the old code
    // fell back to ultra here while the HUD stayed medium, which this guards against.
    expect(desktop.graphicsPreset).toBeUndefined();
    expect(tierFromHints(desktop, false)).toBe('medium'); // unknown GPU -> medium fallback
    expect(graphicsPresetLabel(2)).toBe('medium'); // settings def -> same tier, no divergence
    // A recognized strong desktop GPU lifts the unset 3D tier to ultra...
    expect(
      tierFromHints({ ...desktop, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)' }, false),
    ).toBe('ultra');
    // ...and a recognized weak GPU drops it to low (the cost ceiling), not the old ultra default.
    expect(tierFromHints({ ...desktop, gpuRenderer: 'Adreno (TM) 330' }, false)).toBe('low');
    // an old discrete desktop GPU (GeForce 9400M / GTX 460 era) also resolves LOW instead of
    // the old strongDesktop -> auto-ultra trap (the classic old-laptop upgrade path)
    expect(
      tierFromHints({ ...desktop, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce 9400M)' }, false),
    ).toBe('low');
    expect(
      tierFromHints({ ...desktop, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 460)' }, false),
    ).toBe('low');
    // a masked vendor-only string ("NVIDIA Corporation") stays on the safe medium fallback,
    // never high/ultra: an unrecognized generic driver must not top the tier ladder
    expect(
      tierFromHints({ ...desktop, gpuRenderer: 'ANGLE (NVIDIA, NVIDIA Corporation)' }, false),
    ).toBe('medium');
  });

  it('honors explicit URL tier overrides', () => {
    expect(forcedTierFromSearch('?lowgfx')).toBe('low');
    expect(forcedTierFromSearch('?gfx=low')).toBe('low');
    expect(forcedTierFromSearch('?gfx=medium')).toBe('medium');
    expect(forcedTierFromSearch('?gfx=high')).toBe('high');
    expect(forcedTierFromSearch('?gfx=ultra')).toBe('ultra');
    expect(forcedTierFromSearch('?gfx=banana')).toBe(null);
  });

  it('treats phone-class and low-memory browsers as constrained', () => {
    expect(isConstrainedBrowser({ ...desktop, maxTouchPoints: 1, coarsePointer: true })).toBe(true);
    expect(isConstrainedBrowser({ ...desktop, maxTouchPoints: 1, narrowViewport: true })).toBe(
      true,
    );
    expect(isConstrainedBrowser({ ...desktop, deviceMemory: 4 })).toBe(true);
    expect(isConstrainedBrowser({ ...desktop, maxTouchPoints: 1 })).toBe(false);
    expect(isConstrainedBrowser(desktop)).toBe(false);
    // Firefox and Safari omit deviceMemory entirely, so the ONLY hardware hint left there is
    // core count: <= 4 cores without a reported deviceMemory must also count as constrained
    // (the memory signal exists on Chromium, so this branch only fires where it cannot).
    expect(isConstrainedBrowser({ ...desktop, hardwareConcurrency: 4 })).toBe(true);
    expect(isConstrainedBrowser({ ...desktop, hardwareConcurrency: 8 })).toBe(false);
    expect(isConstrainedBrowser({ ...desktop, deviceMemory: 8, hardwareConcurrency: 2 })).toBe(
      false,
    );
  });

  it('wires the low-core constrained shed through settingsFor, without touching the tier', () => {
    // settingsFor is the PRODUCTION call site: runtimeHints() provides hardwareConcurrency,
    // and isConstrainedBrowser only fires the low-core branch when deviceMemory is absent.
    // This pins the wiring (the branch must not exist only in the predicate's tests), and
    // that the shed is cosmetic-sharpness-only: the tier stays medium (PITFALL-1: cores
    // never demote a tier), only the one-shot allocations shrink.
    const lowCores = gfxInternalsForTest.settingsFor('medium', { hardwareConcurrency: 4 });
    const manyCores = gfxInternalsForTest.settingsFor('medium', { hardwareConcurrency: 8 });
    expect(lowCores.constrainedMemory).toBe(true);
    expect(manyCores.constrainedMemory).toBe(false);
    expect(lowCores.tier).toBe('medium');
    expect(manyCores.tier).toBe('medium');
    expect(lowCores.shadowMap).toBe(1536);
    expect(manyCores.shadowMap).toBe(2560);
  });

  it('resolves an unset preset by device, honoring legacy explicit values and URL force', () => {
    expect(tierFromHints(desktop, false)).toBe('medium'); // unknown device -> medium fallback
    expect(tierFromHints({ ...desktop, graphicsPreset: 0 }, false)).toBe('low'); // legacy explicit 0
    expect(tierFromHints(desktop, true)).toBe('low'); // software GL with no preset -> low floor
    // unset + unknown mobile -> medium (not the old unset -> ultra default)
    expect(tierFromHints({ ...desktop, maxTouchPoints: 1, coarsePointer: true }, false)).toBe(
      'medium',
    );
    // a URL-forced tier always wins, even on a touch device or software GL
    expect(
      tierFromHints(
        { ...desktop, search: '?gfx=high', maxTouchPoints: 1, coarsePointer: true },
        false,
      ),
    ).toBe('high');
    expect(tierFromHints({ ...desktop, search: '?gfx=ultra' }, true)).toBe('ultra');
  });

  it('honors persisted presets when the URL does not force a tier', () => {
    expect(tierFromHints({ ...desktop, graphicsPreset: 1 }, false)).toBe('low');
    expect(tierFromHints({ ...desktop, graphicsPreset: 2 }, false)).toBe('medium');
    expect(tierFromHints({ ...desktop, graphicsPreset: 3 }, false)).toBe('high');
    expect(tierFromHints({ ...desktop, graphicsPreset: 4 }, false)).toBe('ultra');
    expect(tierFromHints({ ...desktop, graphicsPreset: 5 }, false)).toBe('high');
    expect(tierFromHints({ ...desktop, search: '?gfx=low', graphicsPreset: 3 }, false)).toBe('low');
  });

  it('labels presets and runs the budget governor on every tier except ultra', () => {
    expect(graphicsPresetLabel(undefined)).toBe('ultra');
    expect(graphicsPresetLabel(0)).toBe('low');
    expect(graphicsPresetLabel(1)).toBe('low');
    expect(graphicsPresetLabel(2)).toBe('medium');
    expect(graphicsPresetLabel(3)).toBe('high');
    expect(graphicsPresetLabel(4)).toBe('ultra');
    expect(graphicsPresetLabel(5)).toBe('advanced');
    // The governor follows the RESOLVED tier: ON for low/medium/high, OFF only at ultra. A
    // first-run inconclusive device (the medium fallback) now keeps the governor ON to adapt; the
    // old unset-preset -> ultra label used to opt it out (no runtime adaptation on weak devices).
    expect(shouldUseAutoGovernor('low', '')).toBe(true);
    expect(shouldUseAutoGovernor('medium', '')).toBe(true);
    expect(shouldUseAutoGovernor('high', '')).toBe(true);
    expect(shouldUseAutoGovernor('ultra', '')).toBe(false);
    // The URL governor override beats the tier (force on even at ultra, off below it).
    expect(shouldUseAutoGovernor('ultra', '?gfx=ultra&governor=1')).toBe(true);
    expect(shouldUseAutoGovernor('low', '?governor=0')).toBe(false);
    expect(shouldUseAutoGovernor('ultra', '?gfx=ultra')).toBe(false);
  });

  it('keeps every quality tier bounded by explicit runtime budgets', () => {
    for (const [tier, budget] of Object.entries(GFX_BUDGETS)) {
      expect(budget.targetFps).toBe(60);
      expect(budget.maxRenderScale).toBeLessThanOrEqual(1);
      expect(budget.minRenderScaleDesktop).toBeGreaterThanOrEqual(0.5);
      expect(budget.minRenderScaleMobile).toBeGreaterThanOrEqual(0.5);
      expect(budget.dropFrameMs).toBeLessThan(budget.urgentFrameMs);
      expect(budget.recoverFrameMs).toBeLessThan(budget.dropFrameMs);
      expect(tier).toMatch(/^(low|medium|high|ultra)$/);
    }
  });

  it('defines tunable bucket bands for every quality tier', () => {
    for (const [tier, bands] of Object.entries(GFX_BUCKET_BANDS)) {
      expect(Object.keys(bands).sort()).toEqual(
        [
          'characters',
          'foliage',
          'grass',
          'lighting',
          'materials',
          'props',
          'resolution',
          'ui',
          'vfx',
          'waterSky',
          'weapons',
          'worldStreaming',
        ].sort(),
      );
      for (const band of Object.values(bands)) {
        expect(band.min).toBeGreaterThanOrEqual(0);
        expect(band.max).toBeLessThanOrEqual(1);
        expect(band.min).toBeLessThanOrEqual(band.baseline);
        expect(band.baseline).toBeLessThanOrEqual(band.max);
      }
      expect(tier).toMatch(/^(low|medium|high|ultra)$/);
    }
    expect(GFX_BUCKET_BANDS.low.grass.baseline).toBeGreaterThan(GFX_BUCKET_BANDS.low.grass.min);
    expect(GFX_BUCKET_BANDS.low.foliage.baseline).toBeGreaterThan(GFX_BUCKET_BANDS.low.foliage.min);
    expect(GFX_BUCKET_BANDS.low.characters.baseline).toBe(1);
    expect(GFX_BUCKET_BANDS.low.weapons.baseline).toBe(1);
  });

  it('keeps medium as a middle tier while high and ultra retain the premium pipeline', () => {
    const low = gfxInternalsForTest.settingsFor('low');
    const medium = gfxInternalsForTest.settingsFor('medium');
    const mediumIris = gfxInternalsForTest.settingsFor('medium', {
      search: '?gfx=medium',
      gpuRenderer: 'ANGLE (Intel, ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics 655)',
    });
    const high = gfxInternalsForTest.settingsFor('high');
    const ultra = gfxInternalsForTest.settingsFor('ultra');

    expect(low.standardMaterials).toBe(false);
    expect(low.leanFoliage).toBe(true);
    expect(low.lowPlus).toBe(true);
    expect(low.composer).toBe(false);
    expect(low.ao).toBe(false);

    expect(medium.standardMaterials).toBe(true);
    expect(medium.leanFoliage).toBe(false);
    expect(medium.lowPlus).toBe(false);
    expect(mediumIris.standardMaterials).toBe(true);
    expect(mediumIris.leanFoliage).toBe(true);
    expect(mediumIris.lowPlus).toBe(false);
    expect(medium.terrainSplat).toBe(true);
    expect(medium.composer).toBe(false);
    expect(medium.ao).toBe(false);
    expect(medium.shadowMap).toBeGreaterThan(low.shadowMap);
    expect(medium.shadowMap).toBeLessThan(high.shadowMap);
    expect(medium.pixelRatioCap).toBeLessThan(high.pixelRatioCap);
    // Shadow filter: 4-tap PCF on low/medium (the weak-device tiers, and the default
    // fallback for unrecognized devices), soft 5-tap PCFSoft only on high/ultra where
    // it reads at 4096-res maps. The renderer consumes this once at startup
    // (webgl.shadowMap.type); it is baked into shader defines, never toggled at runtime.
    expect(low.shadowFilter).toBe('pcf');
    expect(medium.shadowFilter).toBe('pcf');
    expect(high.shadowFilter).toBe('pcfsoft');
    expect(ultra.shadowFilter).toBe('pcfsoft');
    // LOW-tier presentation frame cap: the low tier is the only one that caps at ~30 FPS
    // (33.33 ms); medium and up present uncapped (0). The main.ts frame loop consumes
    // GFX.frameCapMs, so this pins the value the loop actually gates on.
    expect(low.frameCapMs).toBe(1000 / 30);
    expect(medium.frameCapMs).toBe(0);
    expect(high.frameCapMs).toBe(0);
    expect(ultra.frameCapMs).toBe(0);

    expect(high.standardMaterials).toBe(true);
    expect(high.composer).toBe(true);
    expect(high.ao).toBe(true);
    expect(high.msaaSamples).toBe(4);
    expect(high.shadowMap).toBe(4096);

    expect(ultra.standardMaterials).toBe(true);
    expect(ultra.composer).toBe(true);
    expect(ultra.ao).toBe(true);
    expect(ultra.msaaSamples).toBe(4);
    expect(ultra.shadowMap).toBe(high.shadowMap);
    expect(ultra.pixelRatioCap).toBeGreaterThan(high.pixelRatioCap);
    expect(GFX_BUCKET_BANDS.ultra.grass.baseline).toBeGreaterThan(
      GFX_BUCKET_BANDS.high.grass.baseline,
    );
    expect(GFX_BUCKET_BANDS.ultra.foliage.baseline).toBeGreaterThan(
      GFX_BUCKET_BANDS.high.foliage.baseline,
    );
  });

  it('sheds the memory-spike knobs on constrained (phone-class) browsers, cosmetics only', () => {
    // A phone-class hint set (touch + coarse pointer): matches iOS WebKit, whose
    // per-process memory ceiling kills the WebContent process at world entry.
    const phone = { maxTouchPoints: 5, coarsePointer: true, narrowViewport: true };
    const medium = gfxInternalsForTest.settingsFor('medium', phone);
    const high = gfxInternalsForTest.settingsFor('high', phone);
    const ultra = gfxInternalsForTest.settingsFor('ultra', phone);
    const desktopMedium = gfxInternalsForTest.settingsFor('medium');
    const desktopHigh = gfxInternalsForTest.settingsFor('high');

    expect(medium.constrainedMemory).toBe(true);
    expect(desktopMedium.constrainedMemory).toBe(false);

    // The big one-shot GPU allocations shrink...
    expect(medium.shadowMap).toBe(1536);
    expect(high.shadowMap).toBe(2048);
    expect(ultra.shadowMap).toBe(2048);
    expect(high.msaaSamples).toBe(0);
    expect(ultra.msaaSamples).toBe(0);
    expect(high.pixelRatioCap).toBe(1.48);
    expect(ultra.pixelRatioCap).toBe(1.48);

    // ...while everything a player can SEE OR REACT TO is untouched (fairness rule):
    // materials, splat, composer availability, grass density, and view behavior all
    // match the unconstrained tier.
    expect(medium.standardMaterials).toBe(desktopMedium.standardMaterials);
    expect(medium.terrainSplat).toBe(desktopMedium.terrainSplat);
    expect(medium.grassRadius).toBe(desktopMedium.grassRadius);
    expect(medium.grassStep).toBe(desktopMedium.grassStep);
    expect(high.composer).toBe(desktopHigh.composer);
    expect(high.ao).toBe(desktopHigh.ao);

    // Low deviceMemory alone (Chromium's clamped signal) also lands constrained.
    const lowMem = gfxInternalsForTest.settingsFor('medium', {
      maxTouchPoints: 0,
      coarsePointer: false,
      narrowViewport: false,
      deviceMemory: 4,
    });
    expect(lowMem.constrainedMemory).toBe(true);
    expect(lowMem.shadowMap).toBe(1536);
  });

  it('detects older Intel integrated GPUs and lows the unset 3D tier instead of defaulting ultra', () => {
    expect(
      isWeakIntegratedGpu(
        'ANGLE (Intel, ANGLE Metal Renderer: Intel(R) Iris(TM) Plus Graphics 655)',
      ),
    ).toBe(true);
    expect(isWeakIntegratedGpu('ANGLE (Apple, ANGLE Metal Renderer: Apple M2)')).toBe(false);
    // A recognized weak iGPU with no explicit preset now resolves the 3D tier to LOW (the cost
    // ceiling), instead of the old unset -> ultra default that ignored the GPU string entirely.
    expect(
      tierFromHints(
        { ...desktop, gpuRenderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 655)' },
        false,
      ),
    ).toBe('low');
  });

  it('classifies GPU renderer strings into device-capability buckets', () => {
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)')).toBe('strongDesktop');
    expect(classifyGpuRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2)')).toBe(
      'strongDesktop',
    );
    // AMD discrete + Intel Arc desktop -> strongDesktop (the "(TM)" Windows drivers print is tolerated)
    expect(classifyGpuRenderer('ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)')).toBe(
      'strongDesktop',
    );
    expect(classifyGpuRenderer('AMD Radeon(TM) RX 580')).toBe('strongDesktop');
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics)')).toBe(
      'strongDesktop',
    );
    expect(classifyGpuRenderer('Adreno (TM) 730')).toBe('flagshipMobile');
    expect(classifyGpuRenderer('Mali-G715')).toBe('flagshipMobile');
    expect(classifyGpuRenderer('Apple A17 Pro GPU')).toBe('flagshipMobile');
    // software rasterizers -> software. The bare "software" token stays in lockstep with
    // isSoftwareGL so a string like "Apple Software Renderer" lows BOTH the 3D tier and the HUD
    // data-fx-level (never one low, one medium).
    expect(classifyGpuRenderer('Google SwiftShader')).toBe('software');
    expect(classifyGpuRenderer('Mesa llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('software');
    expect(classifyGpuRenderer('Apple Software Renderer')).toBe('software');
    // WARP, the Windows D3D11 software fallback Chromium 141 switched to after removing the
    // SwiftShader WebGL path: caught via its "Microsoft Basic Render" tokens, not a bare "warp".
    expect(
      classifyGpuRenderer(
        'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
      ),
    ).toBe('software');
    // the codebase's named weak-integrated parts stay weak (checked before mid-integrated)
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 655)')).toBe('weak');
    expect(classifyGpuRenderer('Adreno (TM) 330')).toBe('weak');
    expect(classifyGpuRenderer('PowerVR SGX 544')).toBe('weak');
    // entry-level Mali Valhall (G51/G52) are weak (NOT shadowed by the mid Mali clause) -> LOW
    expect(classifyGpuRenderer('Mali-G51')).toBe('weak');
    expect(classifyGpuRenderer('Mali-G52')).toBe('weak');
    // older Intel UHD desktop iGPU stays weak; the modern UHD 7xx desktop part is mid
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) UHD Graphics 770)')).toBe('midIntegrated');
    // newer integrated + mid mobile -> their own buckets (the MEDIUM path)
    expect(classifyGpuRenderer('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)')).toBe(
      'midIntegrated',
    );
    // AMD Ryzen iGPUs print "(TM)" in Chrome's ANGLE string; both forms bucket midIntegrated
    expect(classifyGpuRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)')).toBe(
      'midIntegrated',
    );
    expect(classifyGpuRenderer('ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics)')).toBe(
      'midIntegrated',
    );
    expect(classifyGpuRenderer('AMD Radeon Vega 8 Graphics')).toBe('midIntegrated');
    expect(classifyGpuRenderer('Mali-G57')).toBe('midMobile');
    // old / entry discrete NVIDIA + pre-GCN AMD (2006-2012 era) -> weak, NOT strongDesktop:
    // the bare `geforce`/`nvidia`/`gtx` tokens used to send these to ULTRA on exactly the old
    // machines that can least afford it (and ultra opts the runtime governor out).
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce 9400M)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce 9800 GT)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GT 710)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 460)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 580)')).toBe('weak');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce 310M)')).toBe('weak');
    expect(classifyGpuRenderer('NVIDIA Quadro FX 3800')).toBe('weak');
    expect(classifyGpuRenderer('AMD Radeon HD 5770')).toBe('weak');
    expect(classifyGpuRenderer('AMD Radeon(TM) HD 6770M')).toBe('weak');
    // ...while the 2012+ mid parts and the masked vendor-only name stay off the weak bucket:
    // Kepler/Maxwell GTX 6xx+ and Pascal/RTX keep strongDesktop; GCN HD 7xxx stays unknown ->
    // medium; and a bare vendor token ("NVIDIA Corporation") is a MASKED name -> unknown ->
    // the safe medium fallback, never an auto-ultra from a generic old-laptop driver.
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 660)')).toBe('strongDesktop');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 1080)')).toBe('strongDesktop');
    expect(classifyGpuRenderer('AMD Radeon HD 7950')).toBe('unknown');
    expect(classifyGpuRenderer('ANGLE (NVIDIA, NVIDIA Corporation)')).toBe('unknown');
    // masked / unplaced / empty -> unknown -> the MEDIUM fallback path
    expect(classifyGpuRenderer('Apple GPU')).toBe('unknown');
    expect(classifyGpuRenderer(undefined)).toBe('unknown');
    expect(classifyGpuRenderer('')).toBe('unknown');
  });

  it('isSoftwareGL reads the live GL context and flags WARP + SwiftShader, not a real GPU', () => {
    const fakeRenderer = (rendererString: string): THREE.WebGLRenderer => {
      const getParameter = vi.fn(() => rendererString);
      const getExtension = vi.fn((name: string) =>
        name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null,
      );
      const gl = { getExtension, getParameter };
      return { getContext: () => gl } as unknown as THREE.WebGLRenderer;
    };
    // WARP is now caught here too (the narrow /swiftshader|llvmpipe|software/ used to miss it).
    expect(
      isSoftwareGL(
        fakeRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)'),
      ),
    ).toBe(true);
    expect(isSoftwareGL(fakeRenderer('Google SwiftShader'))).toBe(true);
    expect(isSoftwareGL(fakeRenderer('Mesa/X.org llvmpipe (LLVM 15.0.6, 256 bits)'))).toBe(true);
    expect(isSoftwareGL(fakeRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)'))).toBe(false);
  });

  describe('resolveDefaultGraphicsPreset: device-aware first-run default (medium fallback)', () => {
    // preset numbers: 1 low, 2 medium, 3 high, 4 ultra (never 5/advanced as an auto-default).
    const phone: GfxRuntimeHints = { ...desktop, maxTouchPoints: 5, coarsePointer: true };

    it('falls back to MEDIUM for a masked/unknown or mid GPU with no corroborating signal', () => {
      expect(resolveDefaultGraphicsPreset(desktop)).toBe(2); // no GPU/mem/cores -> medium
      expect(resolveDefaultGraphicsPreset({ ...desktop, gpuRenderer: 'Apple GPU' })).toBe(2); // masked
      expect(resolveDefaultGraphicsPreset({ ...desktop, gpuRenderer: 'Intel Iris Xe' })).toBe(2); // mid
      // AMD Ryzen iGPU desktop (ample RAM + cores) must bucket midIntegrated -> MEDIUM, NOT be
      // promoted to HIGH via the unknown-desktop branch (the "(TM)" misclassification regression).
      expect(
        resolveDefaultGraphicsPreset({
          ...desktop,
          gpuRenderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)',
          deviceMemory: 8,
          hardwareConcurrency: 16,
        }),
      ).toBe(2);
    });

    it('drops a software or weak GPU to LOW (only the GPU class can low, never RAM/cores)', () => {
      expect(resolveDefaultGraphicsPreset({ ...desktop, gpuRenderer: 'Google SwiftShader' })).toBe(
        1,
      );
      // a bare "software" renderer (e.g. Apple's GPU-disabled fallback) lows on BOTH paths, even on
      // a Chrome box with ample mem+cores (where the old asymmetry would have persisted it HIGH).
      expect(
        resolveDefaultGraphicsPreset({
          ...desktop,
          gpuRenderer: 'Apple Software Renderer',
          deviceMemory: 8,
          hardwareConcurrency: 16,
        }),
      ).toBe(1);
      expect(tierFromHints({ ...desktop, gpuRenderer: 'Apple Software Renderer' }, false)).toBe(
        'low',
      );
      expect(resolveDefaultGraphicsPreset({ ...desktop, gpuRenderer: 'Adreno (TM) 330' })).toBe(1);
      // entry-level Mali-G52 budget phone -> LOW (must not be shadowed into the mid Mali bucket)
      expect(resolveDefaultGraphicsPreset({ ...phone, gpuRenderer: 'Mali-G52' })).toBe(1);
      // PITFALL 1: a thin RAM/core count NEVER pulls a tier down (a flagship iPhone reports
      // cores=2 / mem=undefined); an unknown GPU with low mem+cores stays MEDIUM, not low.
      expect(resolveDefaultGraphicsPreset({ ...desktop, deviceMemory: 2 })).toBe(2);
      expect(
        resolveDefaultGraphicsPreset({ ...desktop, deviceMemory: 4, hardwareConcurrency: 2 }),
      ).toBe(2);
    });

    it('caps mobile at HIGH: flagship / strong-on-touch -> HIGH, weak phone -> LOW, else MEDIUM', () => {
      expect(
        resolveDefaultGraphicsPreset({ ...phone, gpuRenderer: 'Adreno (TM) 740', deviceMemory: 8 }),
      ).toBe(3); // flagship phone
      // an M-series iPad (strong GPU on a touch device) is capped at HIGH (ultra is desktop-only)
      expect(resolveDefaultGraphicsPreset({ ...phone, gpuRenderer: 'Apple M2' })).toBe(3);
      expect(resolveDefaultGraphicsPreset({ ...phone, gpuRenderer: 'Adreno (TM) 330' })).toBe(1); // old phone
      expect(resolveDefaultGraphicsPreset(phone)).toBe(2); // typical/unknown phone -> medium
    });

    it('rewards a strong desktop: ULTRA with a corroborating signal (or unreported mem), else HIGH', () => {
      const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)';
      expect(
        resolveDefaultGraphicsPreset({
          ...desktop,
          gpuRenderer: rtx,
          deviceMemory: 8,
          hardwareConcurrency: 16,
        }),
      ).toBe(4);
      // mem unreported (Firefox) with a recognized strong GPU still earns ULTRA
      expect(resolveDefaultGraphicsPreset({ ...desktop, gpuRenderer: rtx })).toBe(4);
      // a strong GPU but a present, sub-threshold mem+cores -> HIGH (corroboration absent)
      expect(
        resolveDefaultGraphicsPreset({
          ...desktop,
          gpuRenderer: rtx,
          deviceMemory: 4,
          hardwareConcurrency: 4,
        }),
      ).toBe(3);
    });

    it('raises an unknown desktop GPU to HIGH only with ample RAM AND cores', () => {
      expect(
        resolveDefaultGraphicsPreset({ ...desktop, deviceMemory: 8, hardwareConcurrency: 12 }),
      ).toBe(3);
      // ample on only one axis is not enough for the unknown bucket -> MEDIUM
      expect(
        resolveDefaultGraphicsPreset({ ...desktop, deviceMemory: 8, hardwareConcurrency: 4 }),
      ).toBe(2);
    });

    it('a software/weak device lands on LOW, restoring the 1/15s nameplate cost ceiling', () => {
      // The whole point of the default: a weak device -> low preset -> the data-fx-level low
      // tier -> the restored nameplate staleness ceiling (the PR901 weak-GPU mitigation).
      const preset = resolveDefaultGraphicsPreset({
        ...desktop,
        gpuRenderer: 'Google SwiftShader',
      });
      expect(preset).toBe(1);
      const label = graphicsPresetLabel(preset);
      expect(label).toBe('low');
      expect(nameplateIntervalSec(label as 'low')).toBe(NAMEPLATE_INTERVAL_LOW_SEC);
    });
  });

  describe('firstRunGraphicsPreset: device default applied at most once, never over a choice', () => {
    function stubGpu(renderer: string | undefined): void {
      gfxInternalsForTest.resetGpuRendererProbe();
      const getParameter = vi.fn(() => renderer);
      const getExtension = vi.fn((name: string) =>
        name === 'WEBGL_lose_context'
          ? { loseContext: vi.fn() }
          : { UNMASKED_RENDERER_WEBGL: 0x9246 },
      );
      const getContext = vi.fn(() =>
        renderer === undefined ? null : { getExtension, getParameter },
      );
      vi.stubGlobal('document', { createElement: vi.fn(() => ({ getContext })) });
    }
    afterEach(() => {
      vi.unstubAllGlobals();
      gfxInternalsForTest.resetGpuRendererProbe();
    });

    it('returns null once a device default has been applied (never re-detects over a choice)', () => {
      stubGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)');
      expect(firstRunGraphicsPreset(true)).toBeNull();
    });

    it('detects a recognized desktop GPU on first run, gated by the marker not the preset key', () => {
      // The gate is the dedicated marker arg, NOT the graphicsPreset key (which Settings.save()
      // def-fills the moment any setting is stored), so a strong desktop still resolves to a real
      // high-or-ultra tier on first run even after an unrelated setting has been persisted.
      stubGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)');
      const preset = firstRunGraphicsPreset(false);
      expect(preset).not.toBeNull();
      expect(preset).toBeGreaterThanOrEqual(3); // high or ultra, never the medium fallback
    });

    it('leaves a masked/inconclusive device unpersisted (null) so it re-detects later', () => {
      stubGpu('Apple GPU'); // masked -> unknown -> medium fallback -> null (not persisted, re-probed next boot)
      expect(firstRunGraphicsPreset(false)).toBeNull();
    });
  });

  describe('probeGpuRenderer: one cached probe, context released (PR901 exhaustion guard)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      gfxInternalsForTest.resetGpuRendererProbe();
    });

    it('creates exactly one WebGL context, loses it, and memoizes the renderer string', () => {
      gfxInternalsForTest.resetGpuRendererProbe();
      const loseContext = vi.fn();
      const getParameter = vi.fn(() => 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)');
      const getExtension = vi.fn((name: string) =>
        name === 'WEBGL_lose_context' ? { loseContext } : { UNMASKED_RENDERER_WEBGL: 0x9246 },
      );
      const getContext = vi.fn(() => ({ getExtension, getParameter }));
      const createElement = vi.fn(() => ({ getContext }));
      vi.stubGlobal('document', { createElement });

      const first = gfxInternalsForTest.probeGpuRenderer();
      const second = gfxInternalsForTest.probeGpuRenderer();

      expect(first).toBe('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080)');
      expect(second).toBe(first);
      // Memoized: only the first call probes; the rest reuse the cached string.
      expect(createElement).toHaveBeenCalledTimes(1);
      expect(getContext).toHaveBeenCalledTimes(1);
      // The throwaway probe context is released instead of left to leak (PR901).
      expect(loseContext).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps masked double-sided vegetation off the transparent blended path', () => {
    const mat = configureMaskedDoubleSidedVegetationMaterial(
      new THREE.MeshBasicMaterial({
        alphaTest: 0.3,
        transparent: true,
      }),
    );

    expect(mat.alphaTest).toBe(0.3);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.transparent).toBe(false);
    expect(mat.forceSinglePass).toBe(true);
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(true);
  });
});
