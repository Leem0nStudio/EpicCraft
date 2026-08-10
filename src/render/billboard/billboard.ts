// Billboard sprite class for 2D character rendering.
// Creates a fixed-orientation plane with directional sprite views.
import * as THREE from 'three';
import { createBillboardGeometry, getBillboardMaterial, updateBillboardFrame } from './loader';
import type { AnimationType, BillboardAnimState, Direction, SpriteSheetMeta } from './types';
import { createBillboardAnimState, getAnimFPS, getAnimRow } from './types';

export interface BillboardSpriteOptions {
  /** World-space width. If omitted, derived from frame aspect ratio. */
  width?: number;
  /** World-space height. If omitted, defaults to 2.5. */
  height?: number;
}

/** Billboard sprite that renders a 2D character with directional views. */
export class BillboardSprite {
  readonly mesh: THREE.Mesh;
  // Material is SHARED per sprite sheet (loader's sheetMaterialCache): one
  // material + one un-cloned texture per sheet, never per entity. The
  // frame/direction strip is selected by baked geometry UVs instead of a
  // per-material texture clone + offset/repeat (sprite-billboard audit,
  // finding F5). Per-entity GPU cost is now just this geometry (~64 bytes).
  private geometry: THREE.BufferGeometry;
  private meta: SpriteSheetMeta;
  private state: BillboardAnimState;
  private animTime = 0;
  private currentFrame = 0;

  constructor(textureUrl: string, meta: SpriteSheetMeta, options: BillboardSpriteOptions = {}) {
    this.meta = meta;
    this.state = createBillboardAnimState('idle', 'SE');

    const material = getBillboardMaterial(textureUrl);
    this.geometry = createBillboardGeometry(
      meta,
      this.state.direction,
      getAnimRow(meta, this.state.type),
    );

    const height = options.height ?? 2.5;
    // Derive width from frame aspect ratio so the sprite isn't squished.
    // Add a small padding factor (5%) to prevent the character's outline from
    // being cut off at the billboard edges — the shipped sprite sheets pack
    // art flush to the frame boundary with no gutter (verified against PNGs).
    const FRAME_PADDING = 1.05;
    const frameAspect = (meta.frameWidth / meta.frameHeight) * FRAME_PADDING;
    const width = options.width ?? height * frameAspect;

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.scale.set(width, height, 1);
    this.mesh.renderOrder = 1;
    // Billboard plane faces the camera — always oriented toward the viewer.
    // Directional views are selected via UV offset, not plane rotation.
    // The mesh position is set by the caller (renderer.ts) each frame.
  }

  /** Set the animation type. */
  setAnimation(type: AnimationType): void {
    if (this.state.type !== type) {
      this.state.type = type;
      this.state.frame = 0;
      this.animTime = 0;
      this.updateFrame();
    }
  }

  /** Set the facing direction (changes which sprite frame is shown). */
  setDirection(direction: Direction): void {
    if (this.state.direction !== direction) {
      this.state.direction = direction;
      this.updateFrame();
    }
  }

  /** Orient the plane to face the camera. */
  updateFacing(camera: THREE.Camera): void {
    // Copy the camera's quaternion so the mesh's +Z (front face) points toward
    // the camera. Using lookAt() would make -Z face the camera, causing the
    // plane's front face to face away and horizontally mirroring the UVs.
    this.mesh.quaternion.copy(camera.quaternion);
  }

  /** Tick the animation. Returns true if the frame changed. */
  tick(dt: number): boolean {
    // Currently only 1 frame per animation (idle), so tick is a no-op.
    // When walk/attack animations are added, update this to advance frames.
    if (!this.state.playing) return false;

    const fps = getAnimFPS(this.meta, this.state.type);
    this.animTime += dt;
    const frameDuration = 1 / fps;
    const frameChanged = this.animTime >= frameDuration;

    if (frameChanged) {
      this.animTime -= frameDuration;
      // Single-frame sprites: the frame index never advances, so there is no UV
      // re-bake to do. Skipping updateMaterial() here removes a redundant
      // getFrameUVs() + mirror scan every frameDuration (~250 ms at the idle 4
      // FPS) per billboard — per-NPC/player work that multiplies with the crowd
      // on screen (sprite-billboard audit, finding F3). When multi-frame
      // animations land, advance and re-bake only when the frame differs:
      //   const totalFrames = this.meta.columns ?? 1;
      //   const next = (this.currentFrame + 1) % totalFrames;
      //   if (next !== this.currentFrame) { this.currentFrame = next; this.updateFrame(); }
      this.currentFrame = 0; // Single-frame sprites
    }

    return frameChanged;
  }

  /** Re-bake the geometry UVs for the current state (32-byte attribute copy). */
  private updateFrame(): void {
    updateBillboardFrame(
      this.geometry,
      this.meta,
      this.state.direction,
      getAnimRow(this.meta, this.state.type),
      this.currentFrame,
    );
  }

  /** Dispose of the sprite's resources. */
  dispose(): void {
    // Only the per-entity geometry is ours: the material and its texture are
    // shared per sheet (loader caches) and must NOT be disposed here — doing
    // so would break every other billboard on the same sheet.
    this.geometry.dispose();
  }
}
