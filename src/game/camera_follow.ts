// RO/L2-style free orbit camera: no auto-follow.
// The camera stays where the player puts it. This module is now a passthrough.
// wrapAngle is kept as a shared utility for angle math across the codebase.

export interface CameraFollowInput {
  camYaw: number;
  interpFacing: number;
  frameDt: number;
  lastInterpFacing: number | null;
  mouselook: boolean;
  moving: boolean;
  clickMoving?: boolean;
  orbiting: boolean;
  cameraDriven?: boolean;
}

export interface CameraFollowResult {
  camYaw: number;
  lastInterpFacing: number;
}

export interface CameraFollowMoveInput {
  forward: boolean;
  back: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
}

export function cameraFollowShouldSettle(mi: CameraFollowMoveInput, clickMoving: boolean): boolean {
  return (
    clickMoving ||
    mi.forward ||
    mi.back ||
    mi.turnLeft ||
    mi.turnRight ||
    mi.strafeLeft ||
    mi.strafeRight
  );
}

/** Wrap an angle to the range (-PI, PI]. */
export function wrapAngle(d: number): number {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Free-orbit passthrough: the camera yaw is entirely player-controlled.
 * No auto-follow, no settle, no tracking. Returns camYaw unchanged.
 */
export function updateFollowCameraYaw(input: CameraFollowInput): CameraFollowResult {
  return { camYaw: input.camYaw, lastInterpFacing: input.interpFacing };
}
