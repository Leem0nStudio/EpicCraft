// Billboard sprite system for 2D character rendering.
// Replaces the 3D GLB character visuals with 2D sprites that always face the camera.
//
// This module is the PURE geometry core of the flip-board sprite system (no
// DOM, no renderer, no clock): every function is a deterministic function of
// its inputs, so tests/billboard.test.ts can pin the sector table, the UV
// frame selection and the SW/W/NE mirror contract without a browser.

const TAU = Math.PI * 2;

// Camera-relative sector anchors used by cameraRelativeDirection(), listed
// counter-clockwise from the front view at PI/4 spacing. Hoisted to a module
// constant: the table used to be rebuilt inside the function on EVERY call —
// one 8-entry array + 8 tuple allocations per billboard entity per frame,
// which is the top per-frame allocation of the flip-board path in a crowd of
// NPCs and players (sprite-billboard audit, finding F1). The direction shown
// at each anchor, and the tie rule (the loop keeps the EARLIER anchor on an
// exact boundary — first-min wins), are pinned by the sector tests.
const SPRITE_SECTOR_ANCHORS: readonly [number, Direction][] = [
  [0, 'SE'],
  [Math.PI / 4, 'SE'],
  [Math.PI / 2, 'E'],
  [Math.PI * 0.75, 'NE'],
  [Math.PI, 'N'],
  [Math.PI * 1.25, 'NW'],
  [Math.PI * 1.5, 'W'],
  [Math.PI * 1.75, 'SW'],
];

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
  // Real sheets only list the 3 mirrored directions (SW/W/NE) as keys; the base
  // directions (SE/E/N/NW) are never keys. Partial keeps the type honest with
  // the shipped JSON instead of demanding all 8 keys.
  mirrorDirections: Partial<Record<Direction, Direction>>;
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
  mirrorMap: Partial<Record<Direction, Direction>>,
): { direction: Direction; mirrored: boolean } {
  // Direct property lookup instead of Object.entries(): the entries() call
  // allocated a fresh array on every direction change (each step, each camera
  // pan), sprite-billboard audit finding F2. Only the 3 mirrored directions
  // appear as keys in shipped sheets; an undefined value is never a mirror.
  const source = mirrorMap[dir];
  if (source !== undefined) return { direction: source, mirrored: true };
  return { direction: dir, mirrored: false };
}

/** Get the UV offset and scale for a given frame in the sprite sheet. */
export function getFrameUVs(
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
  _frame: number,
): { u: number; v: number; uSize: number; vSize: number; mirror: boolean } {
  const { mirrored, direction: sourceDir } = getSourceDirection(direction, meta.mirrorDirections);
  const col = meta.directions[sourceDir] ?? 0;
  const row = animRow;

  // Calculate UV coordinates (Three.js uses bottom-left origin). The strip
  // sizes and column base are pure column/row fractions: the old forms
  // `frameWidth / (columns * frameWidth)` etc. reduced to the same values with
  // four extra multiplies per call (sprite-billboard audit, finding F4).
  const uSize = 1 / meta.columns;
  const vSize = 1 / meta.rows;

  // For mirrored directions, offset must point to the RIGHT edge of the frame
  // so the negative repeat reads backwards (right-to-left).
  const uBase = col / meta.columns;
  const u = mirrored ? uBase + uSize : uBase;
  const v = 1 - (row + 1) / meta.rows;

  return { u, v, uSize, vSize, mirror: mirrored };
}

/**
 * The four UV corners of a frame on the unit quad, in THREE.PlaneGeometry
 * vertex order (bottom-left, bottom-right, top-right, top-left), computed from
 * the same strip offsets as getFrameUVs(). This is the baked-geometry
 * equivalent of the texture.offset + (negative) repeat transform: for mirrored
 * directions u runs right-to-left (uMin > uMax) so the strip reads flipped,
 * exactly like the old negative repeat did — but with the transform baked into
 * the mesh UVs there is no per-material texture clone and no per-entity GPU
 * texture upload (sprite-billboard audit, finding F5).
 */
export interface FrameQuadUVs {
  /** u at the quad's left edge (x = 0). */
  uMin: number;
  /** u at the quad's right edge (x = 1). */
  uMax: number;
  /** v at the quad's bottom edge (y = 0). */
  vMin: number;
  /** v at the quad's top edge (y = 1). */
  vMax: number;
}

/**
 * Compute the four UV corners of a frame for the unit billboard quad.
 *
 * @param meta       - sprite sheet metadata
 * @param direction  - display direction (mirrored views read the strip flipped)
 * @param animRow    - animation row within the sheet
 * @param _frame     - unused: sheets are single-frame for now (idle only)
 */
export function getFrameQuadUVs(
  meta: SpriteSheetMeta,
  direction: Direction,
  animRow: number,
  _frame: number = 0,
  uInset: number = 0,
): FrameQuadUVs {
  const { mirrored, direction: sourceDir } = getSourceDirection(direction, meta.mirrorDirections);
  const col = meta.directions[sourceDir] ?? 0;
  const uSize = 1 / meta.columns;
  const vSize = 1 / meta.rows;
  const uBase = col / meta.columns;
  // Mirrored views read the strip right-to-left: uMin lands on the frame's
  // RIGHT edge (uBase + uSize) and uMax on its left edge (uBase).
  // The uInset (a fraction of the sheet width, passed by the loader) pulls
  // both edges OFF the frame seams. The shipped sheets are packed edge-to-edge
  // with NO gutter, so sampling exactly at the seam with bilinear filtering
  // blends the NEIGHBOR frame's art in on the sprite's right edge — the
  // visible "cut" artifact. A half-texel-ish inset keeps the sampler inside
  // the frame (sprite-billboard audit follow-up: no-gutter packing).
  const uMin = mirrored ? uBase + uSize - uInset : uBase + uInset;
  const uMax = mirrored ? uBase + uInset : uBase + uSize - uInset;
  const vMin = 1 - (animRow + 1) / meta.rows;
  return { uMin, uMax, vMin, vMax: vMin + vSize };
}

/** Get the animation row for a given animation type. */
export function getAnimRow(meta: SpriteSheetMeta, animType: AnimationType): number {
  return meta.animations[animType]?.row ?? 0;
}

/** Get the FPS for a given animation type. */
export function getAnimFPS(meta: SpriteSheetMeta, animType: AnimationType): number {
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
export function cameraRelativeDirection(entityFacing: number, cameraYaw: number): Direction {
  // The camera LOOKS in direction cameraYaw, but is POSITIONED at cameraYaw + PI
  // relative to the entity. So the angle from entity to camera is:
  const entityToCamera = (((cameraYaw + Math.PI) % TAU) + TAU) % TAU;
  const ef = ((entityFacing % TAU) + TAU) % TAU;

  // Relative angle: 0 = camera directly in front of entity (see front),
  // PI = camera directly behind (see back).
  // ef - entityToCamera gives the counter-clockwise angle (from above) from
  // the entity's front direction to the camera position, matching the
  // SPRITE_SECTOR_ANCHORS mapping which arranges views counter-clockwise
  // from front:
  //
  //   rel=0     → SE (front, front-right 3/4)
  //   rel=PI/4  → SE (front-right 3/4, exact match)
  //   rel=PI/2  → E  (right profile)
  //   rel=3PI/4 → NE (back-right 3/4, mirrors NW)
  //   rel=PI    → N  (back)
  //   rel=5PI/4 → NW (back-left 3/4)
  //   rel=3PI/2 → W  (left profile, mirrors E)
  //   rel=7PI/4 → SW (front-left 3/4, mirrors SE)
  let rel = ef - entityToCamera;
  rel = ((rel % TAU) + TAU) % TAU;

  // Nearest sector anchor, first-min wins on an exact tie. No allocation per
  // call: the table is the module-level SPRITE_SECTOR_ANCHORS constant and the
  // search is plain float compares (sprite-billboard audit, finding F1).
  let bestDir: Direction = 'SE';
  let bestDist = Infinity;
  for (const [angle, dir] of SPRITE_SECTOR_ANCHORS) {
    let d = Math.abs(rel - angle);
    if (d > Math.PI) d = TAU - d;
    if (d < bestDist) {
      bestDist = d;
      bestDir = dir;
    }
  }
  return bestDir;
}
