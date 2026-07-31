// Billboard sprite class for 2D character rendering.
// Creates a fixed-orientation plane with directional sprite views.
import * as THREE from 'three';
import type { SpriteSheetMeta, AnimationType, Direction, BillboardAnimState } from './types';
import { createBillboardAnimState, getAnimFPS } from './types';
import { createBillboardMaterial, updateMaterialFrame, loadSpriteSheetTexture } from './loader';

export interface BillboardSpriteOptions {
  /** World-space width. If omitted, derived from frame aspect ratio. */
  width?: number;
  /** World-space height. If omitted, defaults to 2.5. */
  height?: number;
}

// Shared geometry for all billboard planes (scaled per-entity via mesh.scale)
const sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1);

/** Billboard sprite that renders a 2D character with directional views. */
export class BillboardSprite {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private meta: SpriteSheetMeta;
  private texture: THREE.Texture;
  private state: BillboardAnimState;
  private animTime = 0;
  private currentFrame = 0;

  constructor(
    textureUrl: string,
    meta: SpriteSheetMeta,
    options: BillboardSpriteOptions = {},
  ) {
    this.meta = meta;
    this.texture = loadSpriteSheetTexture(textureUrl);
    this.state = createBillboardAnimState('idle', 'SE');
    this.material = createBillboardMaterial(
      this.texture,
      this.meta,
      this.state.direction,
      this.state.type,
    );

    const height = options.height ?? 2.5;
    // Derive width from frame aspect ratio so the sprite isn't squished
    const frameAspect = meta.frameWidth / meta.frameHeight;
    const width = options.width ?? height * frameAspect;

    // Use shared geometry and scale per-entity
    this.mesh = new THREE.Mesh(sharedPlaneGeometry, this.material);
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
      this.updateMaterial();
    }
  }

  /** Set the facing direction (changes which sprite frame is shown). */
  setDirection(direction: Direction): void {
    if (this.state.direction !== direction) {
      this.state.direction = direction;
      this.updateMaterial();
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
      // TODO: When multi-frame animations exist, use actual frame count:
      // const totalFrames = this.meta.columns ?? 1;
      // this.currentFrame = (this.currentFrame + 1) % totalFrames;
      this.currentFrame = 0; // Single-frame sprites
      this.updateMaterial();
    }

    return frameChanged;
  }

  /** Update the material with current state. */
  private updateMaterial(): void {
    updateMaterialFrame(
      this.material,
      this.meta,
      this.state.direction,
      this.state.type,
      this.currentFrame,
    );
  }

  /** Dispose of the sprite's resources. */
  dispose(): void {
    // Do NOT dispose sharedPlaneGeometry — it's shared across all billboards
    this.material.map?.dispose(); // Free the cloned texture
    this.material.dispose();
  }
}
