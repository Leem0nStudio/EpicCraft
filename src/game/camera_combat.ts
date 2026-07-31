// Combat camera: subtle dynamic zoom when entering/exiting combat.
// When in combat, the camera pulls ~18% closer and pitches up ~5 degrees.
// Transitions are smooth exponential lerps. The player's manual zoom is
// preserved as the base distance; combat applies an offset on top.

/** How much closer the camera gets in combat (0.82 = 18% reduction). */
export const COMBAT_ZOOM_FACTOR = 0.82;

/** Extra pitch in combat (radians, ~5 degrees). */
export const COMBAT_PITCH_BONUS = 0.087;

/** Speed of the transition into/out of combat (higher = faster). */
export const COMBAT_TRANSITION_RATE = 3;

/** How long after the last combat event before considered out of combat (seconds). */
export const COMBAT_LINGER_SECONDS = 5;

export interface CombatCameraState {
  /** Current interpolated zoom factor (1 = no combat, COMBAT_ZOOM_FACTOR = in combat). */
  zoomFactor: number;
  /** Current interpolated pitch bonus (0 = no combat, COMBAT_PITCH_BONUS = in combat). */
  pitchBonus: number;
}

/** Create initial combat camera state. */
export function createCombatCameraState(): CombatCameraState {
  return { zoomFactor: 1, pitchBonus: 0 };
}

/**
 * Tick the combat camera state toward the target based on combat status.
 * Call once per frame. Returns the updated state.
 */
export function tickCombatCamera(
  state: CombatCameraState,
  inCombat: boolean,
  dt: number,
): CombatCameraState {
  const targetZoom = inCombat ? COMBAT_ZOOM_FACTOR : 1;
  const targetPitch = inCombat ? COMBAT_PITCH_BONUS : 0;
  const rate = COMBAT_TRANSITION_RATE;
  const factor = 1 - Math.exp(-rate * dt);
  return {
    zoomFactor: state.zoomFactor + (targetZoom - state.zoomFactor) * factor,
    pitchBonus: state.pitchBonus + (targetPitch - state.pitchBonus) * factor,
  };
}

/**
 * Apply combat camera offsets to base camera parameters.
 * Returns the final pitch and distance to use.
 */
export function applyCombatCamera(
  basePitch: number,
  baseDist: number,
  combat: CombatCameraState,
): { pitch: number; dist: number } {
  return {
    pitch: basePitch + combat.pitchBonus,
    dist: baseDist * combat.zoomFactor,
  };
}
