// Billboard sprite system for 2D character rendering.
// Replaces the 3D GLB character visuals with 2D sprites that always face the camera.
import * as THREE from 'three';

/** Direction indices matching the sprite sheet columns. */
export type Direction = 'SE' | 'E' | 'N' | 'NW' | 'SW' | 'W' | 'NE';

/** Animation types supported by the billboard system. */
export type AnimationType = 'idle' | 'walk' | 'attack' | 'cast';

/** Sprite sheet metadata. */
export interface SpriteSheetMeta {
  image: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  fps: Record<AnimationType, number>;
  directions: Record<string, number>;
  mirrorDirections: Record<Direction, Direction>;
  animations: Record<AnimationType, { row: number; note?: string }>;
}

/** Animation state for a billboard sprite. */
export interface BillboardAnimState {
  type: AnimationType;
  direction: Direction;
  frame: number;
  time: number;
  playing: boolean;
}

/** Create a new billboard animation state. */
export function createBillboardAnimState(
  type: AnimationType = 'idle',
  direction: Direction = 'SE',
): BillboardAnimState {
  return { type, direction, frame: 0, time: 0, playing: true };
}

/** Get the source direction for a mirrored direction. */
export function getSourceDirection(
  dir: Direction,
  mirrorMap: Record<Direction, Direction>,
): { direction: Direction; mirrored: boolean } {
  // Check if this direction is a mirror target
  for (const [mirrorDir, sourceDir] of Object.entries(mirrorMap)) {
    if (mirrorDir === dir) {
      return { direction: sourceDir, mirrored: true };
    }
  }
  return { direction: dir, mirrored: false };
}

/** Get the UV offset and scale for a given frame in the sprite sheet. */
export function getFrameUVs(
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
  frame: number,
): { u: number; v: number; uSize: number; vSize: number; mirror: boolean } {
  const { mirrored, direction: sourceDir } = getSourceDirection(
    direction,
    meta.mirrorDirections,
  );
  const col = meta.directions[sourceDir] ?? 0;
  const row = animRow;
  
  // Calculate UV coordinates (Three.js uses bottom-left origin)
  const uSize = meta.frameWidth / (meta.columns * meta.frameWidth);
  const vSize = meta.frameHeight / (meta.rows * meta.frameHeight);
  
  // For mirrored directions, offset must point to the RIGHT edge of the frame
  // so the negative repeat reads backwards (right-to-left).
  const uBase = (col * meta.frameWidth) / (meta.columns * meta.frameWidth);
  const u = mirrored ? uBase + uSize : uBase;
  const v = 1 - ((row + 1) * meta.frameHeight) / (meta.rows * meta.frameHeight);
  
  return { u, v, uSize, vSize, mirror: mirrored };
}

/** Get the animation row for a given animation type. */
export function getAnimRow(
  meta: SpriteSheetMeta,
  animType: AnimationType,
): number {
  return meta.animations[animType]?.row ?? 0;
}

/** Get the FPS for a given animation type. */
export function getAnimFPS(
  meta: SpriteSheetMeta,
  animType: AnimationType,
): number {
  return meta.fps[animType] ?? 4;
}

/**
 * Compute the billboard sprite direction based on the camera-relative facing.
 *
 * In Ragnarok Online the sprite view depends on which side of the character
 * the camera sees — NOT the character's world-space facing. This function
 * maps the entity's facing angle relative to the camera yaw to one of the
 * 4 source sprite directions (+ 3 mirrors).
 *
 * Convention: 0 = +Z (south), PI/2 = -X (west), PI = -Z (north),
 * 3*PI/2 = +X (east).  Clockwise positive (RO standard).
 *
 * @param entityFacing - world-space facing in RO convention (0 = +Z)
 * @param cameraYaw    - camera yaw in the same convention
 * @returns the Direction to display on the billboard
 */
export function cameraRelativeDirection(
  entityFacing: number,
  cameraYaw: number,
): Direction {
  // The camera LOOKS in direction cameraYaw, but is POSITIONED at cameraYaw + PI
  // relative to the entity. So the angle from entity to camera is:
  const entityToCamera = ((cameraYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const ef = ((entityFacing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Relative angle: 0 = camera directly in front of entity (see front),
  // PI = camera directly behind (see back).
  // ef - entityToCamera gives the counter-clockwise angle (from above) from
  // the entity's front direction to the camera position, matching the
  // spriteAngles mapping which arranges views counter-clockwise from front.
  let rel = ef - entityToCamera;
  rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Map relative angle to sprite direction. The 7 directions are spaced at
  // PI/2 intervals for the cardinal views (front/right/back/left) and at
  // PI/4 offsets for the 3/4 views. Each direction's angle is the relative
  // angle at which that view is centered.
  //
  //   rel=0     → SE (front, front-right 3/4)
  //   rel=PI/4  → SE (front-right 3/4, exact match)
  //   rel=PI/2  → E  (right profile)
  //   rel=3PI/4 → NE (back-right 3/4, mirrors NW)
  //   rel=PI    → N  (back)
  //   rel=5PI/4 → NW (back-left 3/4)
  //   rel=3PI/2 → W  (left profile, mirrors E)
  //   rel=7PI/4 → SW (front-left 3/4, mirrors SE)
  const spriteAngles: [number, Direction][] = [
    [0, 'SE'],
    [Math.PI / 4, 'SE'],
    [Math.PI / 2, 'E'],
    [Math.PI * 0.75, 'NE'],
    [Math.PI, 'N'],
    [Math.PI * 1.25, 'NW'],
    [Math.PI * 1.5, 'W'],
    [Math.PI * 1.75, 'SW'],
  ];
  let bestDir: Direction = 'SE';
  let bestDist = Infinity;
  for (const [angle, dir] of spriteAngles) {
    let d = Math.abs(rel - angle);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestDist) {
      bestDist = d;
      bestDir = dir;
    }
  }
  return bestDir;
}
