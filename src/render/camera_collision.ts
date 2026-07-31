// Simplified third-person camera collision for RO/L2-style free orbit.
// Pulls the camera forward when geometry blocks it. No FOV compensation.

export interface CameraOcclusionState {
  /** Physical camera fraction along the player-eye -> desired-camera segment. */
  pullT: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}

function expEase(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0 || rate <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Smooths third-person camera collision while preserving a hard safety limit.
 * `hardLimit` is the closest legal camera fraction from the real collider sweep;
 * the returned physical `pullT` never exceeds it.
 */
export function stepCameraOcclusion(
  state: CameraOcclusionState,
  hardLimit: number,
  _softLimit: number,
  dt: number,
  pullInRate: number,
  pullOutRate: number,
  _softWeight: number,
): CameraOcclusionState {
  const hard = clamp01(hardLimit);
  const rate = hard < state.pullT ? pullInRate : pullOutRate;
  const easedPull = expEase(clamp01(state.pullT), hard, rate, dt);
  state.pullT = Math.min(easedPull, hard);
  return state;
}
