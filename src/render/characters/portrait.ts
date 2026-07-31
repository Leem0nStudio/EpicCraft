import * as THREE from 'three';
import type { PlayerClass } from '../../sim/types';
import { assetsReady } from '../assets/preload';
import { trackWebGLContext } from '../context_release';
import { getSpriteFilename } from '../billboard/sprite_registry';
import { VISUALS } from './manifest';
import { type PortraitFraming, portraitFrameParams } from './portrait_framing';
import { CharacterVisual } from './visual';
import { captureSpriteHeadshot } from './sprite_preview';

export type { PortraitFraming } from './portrait_framing';

// ---------------------------------------------------------------------------
// Portrait factory — a 2D "profile photo" rendered from the real 3D character
// model. One tiny offscreen WebGL context renders a head-and-shoulders headshot
// of a (class, skin) pair, captures it as a transparent PNG, and caches the
// data URL. The exact same model/skin data is available client-side for every
// player (entity.templateId + entity.skin), so the same portraits render for
// other players' profiles with no server round-trip.
// ---------------------------------------------------------------------------

// Square render resolution. Crisp at the ~44px list thumbnails and the larger
// profile-window portrait on 2x displays; downscaled by CSS at each call site.
const PORTRAIT_SIZE = 256;

// Idle pose to settle the rig into before the single capture frame (mirrors the
// preview turntable's neutral stance, but with no movement).
const PORTRAIT_ANIM_STATE = {
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  sitting: false,
};

// Models stand at the origin facing +Z, but their rigs differ in
// height/proportion, so the camera is fit to each model's own bounding box
// (rather than fixed coords), per the fov/target/extent fractions from
// portraitFrameParams (see portrait_framing.ts for the per-framing values).
const scratchBox = new THREE.Box3();
const scratchCenter = new THREE.Vector3();
const scratchSize = new THREE.Vector3();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let mount: THREE.Group | null = null;

const cache = new Map<string, string>();
const readyListeners = new Set<() => void>();
let assetsAreReady = false;
void assetsReady()
  .then(() => {
    assetsAreReady = true;
    for (const cb of readyListeners) cb();
    readyListeners.clear();
  })
  .catch(() => {
    /* asset failure surfaces through the main loading screen; portraits just
       keep falling back to the class crest. */
  });

function ensureRig(): void {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE, false);
  renderer.shadowMap.enabled = false;
  // Hand this offscreen context back on page teardown (see context_release.ts).
  trackWebGLContext(renderer);

  scene = new THREE.Scene();
  // fov/position/aim are recomputed per-model per-framing from its bounding
  // box in the capture (see portraitFrameParams); the constructor fov is a
  // placeholder, always overwritten before the first render.
  camera = new THREE.PerspectiveCamera(portraitFrameParams('headshot').fov, 1, 0.1, 100);

  mount = new THREE.Group();
  scene.add(mount);

  // Soft, even key/fill so faces read clearly at thumbnail size.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2.5, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
}

/**
 * A transparent-PNG headshot for a (class, skin), or null if the character
 * assets are not preloaded yet. Cached after the first render. Callers should
 * fall back to a class crest while null and upgrade via {@link onPortraitsReady}.
 *
 * For sprite-based classes (all except mech), the headshot is extracted directly
 * from the sprite sheet — matching the game's 2D art style. The mech class keeps
 * its 3D GLB rendering.
 */
export function playerPortraitDataUrl(
  cls: PlayerClass,
  skin = 0,
  framing: PortraitFraming = 'headshot',
): string | null {
  return visualPortraitDataUrl(`player_${cls}`, skin, framing);
}

/**
 * As {@link playerPortraitDataUrl} but for any visual key (e.g. `player_mech`),
 * so cosmetic-only bodies can be previewed as swatch thumbnails. The asset must
 * already be loaded (callers preload first); returns null until then.
 *
 * For classes with sprite sheets, extracts a headshot from the sprite rather
 * than rendering a 3D model. The mech class (no sprite) keeps 3D rendering.
 */
export function visualPortraitDataUrl(
  visualKey: string,
  skin = 0,
  framing: PortraitFraming = 'headshot',
): string | null {
  const key = `${visualKey}:${skin}:${framing}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!assetsAreReady) return null;

  // Mech has no sprite sheet — use 3D GLB rendering
  if (visualKey === 'player_mech') {
    return render3DPortrait(visualKey, skin, framing);
  }

  // All other classes: extract headshot from sprite sheet
  const spriteKey = getSpriteFilename(visualKey);
  if (!spriteKey) {
    // Fallback to 3D if no sprite mapping found
    return render3DPortrait(visualKey, skin, framing);
  }

  // Async headshot extraction — return null initially, then notify listeners
  captureSpriteHeadshot(spriteKey).then((url) => {
    if (url) {
      cache.set(key, url);
      // Notify any waiting listeners that portraits are ready
      for (const cb of readyListeners) cb();
      readyListeners.clear();
    }
  });

  return null;
}

/**
 * 3D GLB portrait renderer — kept only for the mech class which has no sprite.
 */
function render3DPortrait(
  visualKey: string,
  skin: number,
  framing: PortraitFraming,
): string | null {
  const key = `${visualKey}:${skin}:${framing}`;
  let visual: CharacterVisual | null = null;
  try {
    ensureRig();
    visual = new CharacterVisual(visualKey, 0xffffff, skin);
    mount!.add(visual.root);
    mount!.rotation.y = 0;
    visual.update(0.4, PORTRAIT_ANIM_STATE, true);

    scratchBox.setFromObject(visual.root);
    scratchBox.getCenter(scratchCenter);
    scratchBox.getSize(scratchSize);
    const defH = VISUALS[visualKey]?.height ?? 1.8;
    const implausible =
      !Number.isFinite(scratchSize.y) ||
      scratchSize.y < 0.3 * defH ||
      scratchSize.y > 3 * defH ||
      Math.abs(scratchCenter.x) > defH ||
      Math.abs(scratchCenter.z) > defH;
    if (implausible) {
      scratchBox.min.set(-0.5 * defH, 0, -0.9 * defH);
      scratchBox.max.set(0.5 * defH, defH, 0.9 * defH);
      scratchBox.getCenter(scratchCenter);
      scratchBox.getSize(scratchSize);
    }
    const h = scratchSize.y || 1.8;
    const { fov, targetYFromFeetFrac, extentFrac } = portraitFrameParams(framing);
    camera!.fov = fov;
    const targetY = scratchBox.min.y + targetYFromFeetFrac * h;
    const extent = extentFrac * h;
    const dist = extent / 2 / Math.tan((fov * Math.PI) / 180 / 2);
    camera!.position.set(scratchCenter.x + 0.04 * h, targetY + 0.02 * h, scratchBox.max.z + dist);
    camera!.lookAt(scratchCenter.x, targetY, scratchCenter.z);
    camera!.updateProjectionMatrix();

    renderer!.render(scene!, camera!);
    const url = renderer!.domElement.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } catch (err) {
    if (import.meta.env?.DEV) console.warn(`[portrait] failed for ${key}`, err);
    return null;
  } finally {
    if (visual) {
      mount!.remove(visual.root);
      visual.dispose();
    }
  }
}

/** Run `cb` once character assets finish preloading (immediately if already
 *  ready), so a fallback crest can be swapped for the real portrait. */
export function onPortraitsReady(cb: () => void): void {
  if (assetsAreReady) cb();
  else readyListeners.add(cb);
}

/** True once portraits can be generated synchronously. */
export function portraitsReady(): boolean {
  return assetsAreReady;
}
