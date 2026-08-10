import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The loader's module-scope preload loop iterates getAllSpriteFilenames() when
// window exists (jsdom does), firing real fetches for every shipped sheet.
// Mock the registry to an empty list so importing the loader in tests is
// side-effect free; the functions under test take meta as an argument.
vi.mock('../src/render/billboard/sprite_registry', () => ({
  getAllSpriteFilenames: () => [],
  getSpriteUrls: () => ({ textureUrl: '', metaUrl: '' }),
}));

import {
  createBillboardGeometry,
  getBillboardMaterial,
  getFrameUvArray,
  updateBillboardFrame,
} from '../src/render/billboard/loader';
import type { SpriteSheetMeta } from '../src/render/billboard/types';

// Baked-UV refactor (sprite-billboard audit, finding F5): billboards no longer
// clone + re-upload the sprite sheet per entity. One material + one texture per
// sheet (shared by the crowd), and each entity's frame/direction strip is baked
// into a tiny per-entity geometry UV attribute.

const META_4X1: SpriteSheetMeta = {
  image: 'test.png',
  frameWidth: 115,
  frameHeight: 256,
  columns: 4,
  rows: 1,
  fps: { idle: 4, walk: 8, attack: 10, cast: 6 },
  directions: { SE: 0, E: 1, N: 2, NW: 3 },
  mirrorDirections: { SW: 'SE', W: 'E', NE: 'NW' },
  animations: {
    idle: { row: 0 },
    walk: { row: 0 },
    attack: { row: 0 },
    cast: { row: 0 },
  },
};

// The sheets are packed edge-to-edge with NO gutter (the art bleeds across
// every column seam), so the loader insets each strip by ~1.5 texels of the
// real sheet width to keep bilinear sampling off the seams. With no texture in
// the cache the width falls back to frameWidth * columns = 460, so the inset
// is 1.5 / 460. Tests below pin BOTH the seam-clearing inset and the fact that
// the strip is still a single column wide (no bleeding into the neighbor).
const INSET_4X1 = 1.5 / (115 * 4);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getFrameUvArray (baked 8-float strip, PlaneGeometry vertex order)', () => {
  it('returns v0..v3 = BL, BR, TL, TR for a base direction', () => {
    const uvs = getFrameUvArray(META_4X1, 'SE', 0);
    // PlaneGeometry(1,1) attribute order: bottom-left, bottom-right, top-left, top-right.
    // Both u edges are pulled IN by the seam inset so bilinear sampling never
    // touches the no-gutter column seams (the right-edge "cut" artifact).
    expect(uvs[0]).toBeCloseTo(INSET_4X1); // BL u
    expect(uvs[1]).toBe(0); // BL v
    expect(uvs[2]).toBeCloseTo(0.25 - INSET_4X1); // BR u
    expect(uvs[3]).toBe(0); // BR v
    expect(uvs[4]).toBeCloseTo(INSET_4X1); // TL u
    expect(uvs[5]).toBe(1); // TL v
    expect(uvs[6]).toBeCloseTo(0.25 - INSET_4X1); // TR u
    expect(uvs[7]).toBe(1); // TR v
  });

  it('bakes mirrors right-to-left (uMax < uMin), also inset off the seams', () => {
    const sw = getFrameUvArray(META_4X1, 'SW', 0);
    // BL samples the right edge of the SE column, BR the left edge; both pulled
    // in by the same inset (the frame is still exactly one column wide).
    expect(sw[0]).toBeCloseTo(0.25 - INSET_4X1); // BL u
    expect(sw[2]).toBeCloseTo(INSET_4X1); // BR u
    expect(sw[0]).toBeGreaterThan(sw[2]);
    // The strip must stay exactly one column wide even with the inset: the
    // mirrored view reads [INSET, 0.25 - INSET], i.e. width 0.25 - 2*INSET.
    expect(sw[0] - sw[2]).toBeCloseTo(0.25 - 2 * INSET_4X1);
  });

  it('uses the real texture width for the inset when the sheet is loaded', () => {
    // Simulate a loaded 917px-wide sheet (sprite_001_): the inset becomes
    // 1.5 / 917 instead of the JSON-fallback 1.5 / 460, so the strip pulls in
    // less — the JSON frameWidth is not the pixel width on every sheet.
    // The loader looks the texture up by `/models/chars/<image>`, matching the
    // material URL used here.
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());
    const tex = getBillboardMaterial('/models/chars/test.png').map;
    if (tex) tex.image = { width: 917 };
    const uvs = getFrameUvArray(META_4X1, 'SE', 0);
    // The inset is part of the cache key, so this call (real width 917) must
    // NOT return the fallback-inset strip cached by the earlier tests.
    expect(uvs[0]).toBeCloseTo(1.5 / 917);
    expect(uvs[2]).toBeCloseTo(0.25 - 1.5 / 917);
  });

  it('caches per (sheet, direction, row) and returns the same instance', () => {
    const a = getFrameUvArray(META_4X1, 'E', 0);
    const b = getFrameUvArray(META_4X1, 'E', 0);
    expect(a).toBe(b);
    const nw = getFrameUvArray(META_4X1, 'NW', 0);
    expect(nw).not.toBe(a);
  });
});

describe('createBillboardGeometry / updateBillboardFrame (per-entity UV swap)', () => {
  it('creates a unit quad whose UVs match the baked strip', () => {
    const geo = createBillboardGeometry(META_4X1, 'SE', 0);
    expect(geo.getAttribute('position').array).toEqual(
      new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]),
    );
    expect(geo.getIndex()?.array).toEqual(new Uint16Array([0, 1, 2, 0, 2, 3]));
    expect(geo.getAttribute('uv').array).toEqual(getFrameUvArray(META_4X1, 'SE', 0));
  });

  it('re-bakes the UV attribute on direction change (no new attributes, no texture touch)', () => {
    const geo = createBillboardGeometry(META_4X1, 'SE', 0);
    const uvAttr = geo.getAttribute('uv');
    const version0 = uvAttr.version;

    updateBillboardFrame(geo, META_4X1, 'W', 0);
    expect(geo.getAttribute('uv')).toBe(uvAttr); // same attribute object reused
    expect(uvAttr.array).toEqual(getFrameUvArray(META_4X1, 'W', 0));
    // r165's needsUpdate is a setter-only accessor: it bumps `version` (which
    // signals WebGLAttributes to re-upload this tiny 32-byte buffer) but has no
    // getter, so the bump is what we pin.
    expect(uvAttr.version).toBe(version0 + 1);
  });

  it('keeps per-entity UV attributes distinct (dispose-safe: no shared attribute objects)', () => {
    const a = createBillboardGeometry(META_4X1, 'SE', 0);
    const b = createBillboardGeometry(META_4X1, 'SE', 0);
    expect(a.getAttribute('uv')).not.toBe(b.getAttribute('uv'));
    // Updating one entity must never affect the other.
    updateBillboardFrame(a, META_4X1, 'NE', 0);
    expect(b.getAttribute('uv').array).toEqual(getFrameUvArray(META_4X1, 'SE', 0));
  });
});

describe('getBillboardMaterial (one material + one texture per sheet)', () => {
  const URL = '/models/chars/sprite_003_.png';

  beforeEach(() => {
    // ImageLoader needs DOM/network; stub load() so the shared texture cache
    // fills synchronously. loadSpriteSheetTexture still caches by URL, so the
    // identity assertions below are about the cache, not the stub.
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockReturnValue(new THREE.Texture());
  });

  it('shares a single material for the same sheet', () => {
    const m1 = getBillboardMaterial(URL);
    const m2 = getBillboardMaterial(URL);
    expect(m1).toBe(m2);
  });

  it('shares the cached (uncloned) texture — no per-entity texture clone', () => {
    const m1 = getBillboardMaterial(URL);
    const m2 = getBillboardMaterial(URL);
    // The material's map IS the loader's cached texture, shared by every
    // material on the sheet. Clones were the per-entity GPU upload cost: each
    // `texture.clone() + needsUpdate` re-uploaded the full sheet to the GPU.
    expect(m1.map).toBe(m2.map);
    expect(m1.map).toBeDefined();
    expect(m1.transparent).toBe(true);
    expect(m1.side).toBe(THREE.DoubleSide);
  });
});
