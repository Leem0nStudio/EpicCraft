// Sprite sheet loader for billboard system.
// Loads and caches sprite sheet textures and metadata.
import * as THREE from 'three';
import { registerPreload } from '../assets/preload';
import { getAllSpriteFilenames, getSpriteUrls, type SpriteEntry } from './sprite_registry';
import type { Direction, SpriteSheetMeta } from './types';
import { getFrameQuadUVs } from './types';

export type { SpriteEntry } from './sprite_registry';

/** Cache for loaded sprite sheet textures. */
const textureCache = new Map<string, THREE.Texture>();

/** Cache for loaded sprite sheet metadata. */
const metaCache = new Map<string, SpriteSheetMeta>();

/** Preload promises keyed by URL — register into the boot gate. */
const preloadPromises = new Map<string, Promise<unknown>>();

/** Register a meta preload so assetsReady() covers billboard sprites. */
export function preloadBillboardMeta(url: string): Promise<unknown> {
  const existing = preloadPromises.get(url);
  if (existing) return existing;
  const p = loadSpriteSheetMeta(url).catch(() => {});
  preloadPromises.set(url, p);
  registerPreload(p);
  return p;
}

/** Preload a sprite sheet texture so it's ready before createView. Started at
 *  module import, but deliberately NOT registered in the boot gate: the sheets
 *  are 0.2 to 6.4 MB each (about 41 MB total), and gating startGame on them
 *  added real first-boot latency (sprite-billboard audit, finding C2). The meta
 *  JSONs stay gated (about 0.7 KB each, and getMetaSync() is a synchronous
 *  createView read); the texture merely warms the cache concurrently, and
 *  loadSpriteSheetTexture falls back to a lazy load if it is not ready yet. */
export function preloadBillboardTexture(url: string): void {
  if (textureCache.has(url)) return;
  const texture = new THREE.TextureLoader().load(
    url,
    undefined, // onLoad
    undefined, // onProgress
    () => {
      // onError: texture failed to load (404, etc.). The warm cache still stores
      // the empty texture, so loadSpriteSheetTexture returns it and the plane
      // renders empty instead of re-fetching and throwing on every createView.
      console.warn(`[billboard] Failed to preload texture: ${url}`);
    },
  );
  // Use LinearFilter for smooth, anti-aliased rendering of illustrated/vector art.
  // NearestFilter is only appropriate for pixel art; illustrated PNGs need bilinear
  // sampling to preserve clean edges and gradients.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(url, texture);
  // Warm the cache without blocking the boot gate (no registerPreload). The
  // polling loop stops on load OR on a hard deadline, so a texture that never
  // arrives (404, a stalled fetch) cannot leak a per-frame requestAnimationFrame
  // callback forever (sprite-billboard audit, finding A3).
  const deadline = Date.now() + 5000;
  const check = () => {
    if (texture.image || Date.now() >= deadline) return;
    requestAnimationFrame(check);
  };
  check();
}

/** Get cached meta synchronously (returns null if not yet loaded). */
export function getMetaSync(url: string): SpriteSheetMeta | null {
  return metaCache.get(url) ?? null;
}

/** Load a sprite sheet texture from URL. */
export function loadSpriteSheetTexture(url: string): THREE.Texture {
  const cached = textureCache.get(url);
  if (cached) return cached;

  const texture = new THREE.TextureLoader().load(url);
  // Use LinearFilter for smooth, anti-aliased rendering of illustrated/vector art.
  // NearestFilter is only appropriate for pixel art; illustrated PNGs need bilinear
  // sampling to preserve clean edges and gradients.
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(url, texture);
  return texture;
}

/** Load sprite sheet metadata from JSON. */
export async function loadSpriteSheetMeta(url: string): Promise<SpriteSheetMeta> {
  const cached = metaCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  const meta: SpriteSheetMeta = await response.json();
  metaCache.set(url, meta);
  return meta;
}

// Unit-quad geometry shared by ALL billboard planes. Each billboard wraps the
// shared position/index CPU arrays in its own BufferAttribute, so the UV
// attribute (which differs per entity) stays per-geometry while positions cost
// one 48-byte array for the whole crowd.
//
// PlaneGeometry(1,1) order: v0=(-0.5,-0.5) v1=(0.5,-0.5) v2=(-0.5,0.5) v3=(0.5,0.5),
// triangles (0,1,2) and (0,2,3) — front faces +Z (material is DoubleSide anyway).
const SHARED_QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
]);
const SHARED_QUAD_INDEX: number[] = [0, 1, 2, 0, 2, 3];

/** Per-entity materials would each upload a full sheet — share one per sheet
 *  instead. The UV frame/direction transform is baked into each billboard's
 *  geometry (sprite-billboard audit, finding F5), so the material and its
 *  texture are immutable after creation and can be shared by the whole crowd. */
const sheetMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

/** Cache of the 8 baked UV floats per (sheet, direction, row): one tiny
 *  Float32Array per frame, copied into each entity's attribute (never shared
 *  as a BufferAttribute — three r165 WebGLAttributes.remove() deletes the GL
 *  buffer unconditionally, so shared attribute objects would corrupt other
 *  billboards on dispose). */
const frameUvCache = new Map<string, Float32Array>();

/** Get the shared material for a sprite sheet (one per sheet, never cloned). */
export function getBillboardMaterial(textureUrl: string): THREE.MeshBasicMaterial {
  const cached = sheetMaterialCache.get(textureUrl);
  if (cached) return cached;

  // Shared texture from the cache — NO clone, NO needsUpdate: the sheet uploads
  // to the GPU exactly once and every billboard samples it (sprite-billboard
  // audit, finding F5: a crowd used to clone + re-upload the full 0.2-6.4 MB
  // sheet per entity). The frame/direction strip is selected by baked geometry
  // UVs, so the texture matrix stays at identity.
  const material = new THREE.MeshBasicMaterial({
    map: loadSpriteSheetTexture(textureUrl),
    transparent: true,
    // No alphaTest — illustrated/vector art has smooth alpha gradients that would
    // get harsh cutoff edges. Use full alpha blending for clean transparency.
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  sheetMaterialCache.set(textureUrl, material);
  return material;
}

// The shipped sheets are packed edge-to-edge with NO gutter between columns:
// the character art bleeds right up to (and sometimes across) every frame seam
// (verified against the PNGs: opaque pixels on both sides of each boundary).
// Sampling exactly at the seam with bilinear filtering blends the NEIGHBOR
// frame's art in on the sprite's right edge. Inset the strip by ~1.5 texels of
// the REAL sheet width (the JSON frameWidth is not the texture pixel width on
// every sheet) so the quad never samples the seam (sprite-billboard audit
// follow-up). Half a texel would only clear the filter reach; 1.5 texels also
// clears the few pixels of neighbor art that straddle the boundary.
const FRAME_SEAM_INSET_TEXELS = 1.5;

/** Get the 8 baked UV floats for a frame (PlaneGeometry vertex order: v0..v3
 *  bottom-left, bottom-right, top-left, top-right). Mirrored directions map
 *  uMax < uMin, so the strip samples right-to-left — the baked equivalent of
 *  the old negative-repeat texture matrix. */
export function getFrameUvArray(
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
  frame: number = 0,
): Float32Array {
  // Real sheet width in texels, read from the loaded texture when available
  // (the texture warms the cache concurrently at module import, so by the time
  // a view is created it is normally loaded). Fall back to the JSON-derived
  // width — close enough that the inset still clears the seam.
  const texture = textureCache.get(`/models/chars/${meta.image}`);
  const sheetWidth =
    (typeof texture?.image?.width === 'number' ? texture.image.width : 0) ||
    meta.frameWidth * meta.columns;
  const uInset = sheetWidth > 0 ? FRAME_SEAM_INSET_TEXELS / sheetWidth : 0;
  // The inset is part of the key: a first call before the texture finishes
  // loading caches the fallback-inset strip, and once the texture is loaded the
  // real-width strip must not be shadowed by that stale entry.
  const key = `${meta.image}|${direction}|${animRow}|${frame}|${uInset.toFixed(7)}`;
  const cached = frameUvCache.get(key);
  if (cached) return cached;

  const { uMin, uMax, vMin, vMax } = getFrameQuadUVs(meta, direction, animRow, frame, uInset);
  const uvs = new Float32Array([uMin, vMin, uMax, vMin, uMin, vMax, uMax, vMax]);
  frameUvCache.set(key, uvs);
  return uvs;
}

/** Create a per-entity billboard plane with the frame UVs baked in. Each
 *  billboard owns its geometry and its UV attribute (copied from the shared
 *  cached array); positions/index wrap the shared CPU arrays in this geometry's
 *  own BufferAttributes, so dispose() only frees this entity's buffers. */
export function createBillboardGeometry(
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(SHARED_QUAD_POSITIONS, 3));
  geometry.setIndex(SHARED_QUAD_INDEX);
  const uv = new THREE.BufferAttribute(new Float32Array(8), 2);
  uv.array.set(getFrameUvArray(meta, direction, animRow));
  geometry.setAttribute('uv', uv);
  return geometry;
}

/** Re-bake a billboard's UVs for a new direction/row (a 32-byte copy into the
 *  entity's own attribute — no allocation, no texture touch, no GPU re-upload
 *  of the sheet). Called on setDirection/setAnimation. */
export function updateBillboardFrame(
  geometry: THREE.BufferGeometry,
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
  frame: number = 0,
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  uv.array.set(getFrameUvArray(meta, direction, animRow, frame));
  uv.needsUpdate = true;
}

/** Get cached sprite URLs for an entity visual key. */
export function getSpriteUrlsForEntity(visualKey: string): SpriteEntry {
  return getSpriteUrls(visualKey);
}

// Preload ALL billboard sprites at module import: the META JSONs register into
// the boot gate (they are tiny, and getMetaSync() is a synchronous createView
// read); the TEXTURES warm the cache fire-and-forget, outside the gate (they
// are large, about 41 MB total, and must not delay startGame).
if (typeof window !== 'undefined') {
  for (const filename of getAllSpriteFilenames()) {
    const metaUrl = `/models/chars/${filename}.json`;
    const textureUrl = `/models/chars/${filename}.png`;
    preloadBillboardMeta(metaUrl);
    preloadBillboardTexture(textureUrl);
  }
}
