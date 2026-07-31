// Sprite sheet loader for billboard system.
// Loads and caches sprite sheet textures and metadata.
import * as THREE from 'three';
import { registerPreload } from '../assets/preload';
import type { SpriteSheetMeta, AnimationType, Direction } from './types';
import { getFrameUVs, getAnimRow } from './types';
import { getAllSpriteFilenames, getSpriteUrls, type SpriteEntry } from './sprite_registry';

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

/** Preload a sprite sheet texture so it's ready before createView. */
export function preloadBillboardTexture(url: string): void {
  if (textureCache.has(url)) return;
  const texture = new THREE.TextureLoader().load(
    url,
    undefined, // onLoad
    undefined, // onProgress
    () => {
      // onError: texture failed to load (404, etc.) — resolve anyway to avoid
      // blocking the boot gate. The billboard system will fallback gracefully.
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
  registerPreload(new Promise<void>((resolve) => {
    // Resolve when the image data is uploaded to GPU, or after a timeout
    // to avoid blocking the boot gate on missing textures.
    const timeout = setTimeout(() => resolve(), 5000);
    const check = () => {
      if (texture.image) {
        clearTimeout(timeout);
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  }));
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

/** Create a material for a billboard sprite. */
export function createBillboardMaterial(
  texture: THREE.Texture,
  meta: SpriteSheetMeta,
  direction: Direction,
  animType: AnimationType,
): THREE.MeshBasicMaterial {
  const animRow = getAnimRow(meta, animType);
  const uvs = getFrameUVs(meta, direction, animRow, 0);

  // Clone texture to allow independent UV transforms
  const matTexture = texture.clone();
  matTexture.needsUpdate = true;

  // Set UV offset and scale for the first frame
  matTexture.offset.set(uvs.u, uvs.v);
  matTexture.repeat.set(
    uvs.mirror ? -uvs.uSize : uvs.uSize,
    uvs.vSize,
  );

  return new THREE.MeshBasicMaterial({
    map: matTexture,
    transparent: true,
    // No alphaTest — illustrated/vector art has smooth alpha gradients that would
    // get harsh cutoff edges. Use full alpha blending for clean transparency.
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Update material UVs for a specific frame. */
export function updateMaterialFrame(
  material: THREE.MeshBasicMaterial,
  meta: SpriteSheetMeta,
  direction: Direction,
  animType: AnimationType,
  frame: number,
): void {
  const animRow = getAnimRow(meta, animType);
  const uvs = getFrameUVs(meta, direction, animRow, frame);

  if (material.map) {
    material.map.offset.set(uvs.u, uvs.v);
    material.map.repeat.set(
      uvs.mirror ? -uvs.uSize : uvs.uSize,
      uvs.vSize,
    );
    // NOTE: Do NOT set needsUpdate here — UV offset/repeat changes are handled
    // by Three.js texture matrix uniforms and do NOT require GPU texture re-upload.
    // Setting needsUpdate triggers a full gl.texImage2D call per billboard per frame,
    // which is a massive GPU bottleneck.
  }
}

/** Get cached sprite URLs for an entity visual key. */
export function getSpriteUrlsForEntity(visualKey: string): SpriteEntry {
  return getSpriteUrls(visualKey);
}

// Preload ALL billboard sprites at module import so assetsReady() gates
// startGame until they're cached for getMetaSync().
if (typeof window !== 'undefined') {
  for (const filename of getAllSpriteFilenames()) {
    const metaUrl = `/models/chars/${filename}.json`;
    const textureUrl = `/models/chars/${filename}.png`;
    preloadBillboardMeta(metaUrl);
    preloadBillboardTexture(textureUrl);
  }
}
