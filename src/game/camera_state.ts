// Shared camera state — single source of truth for orbit camera parameters.
// RO/L2-style free orbit: the camera stays where the player puts it.
// No auto-follow; the player controls orbit manually.

/** Camera orbit state (shared between Input and Renderer). */
export interface CameraState {
  /** Horizontal orbit angle (radians). 0 = looking north (+Z), PI = south. */
  camYaw: number;
  /** Vertical orbit angle (radians). MIN_PITCH..MAX_PITCH. */
  camPitch: number;
  /** Distance from player eye to camera (world units). */
  camDist: number;
  /** Target distance for smooth zoom interpolation. */
  camTargetDist: number;
  /** Combat zoom multiplier (1 = no combat, 0.82 = in combat). Applied by renderer. */
  combatZoom: number;
  /** Combat pitch bonus in radians (0 = no combat, 0.087 = in combat). Applied by renderer. */
  combatPitch: number;
}

/** Default initial camera state (RO-style: ~30 degrees elevation, moderate distance). */
export function createInitialCameraState(): CameraState {
  return {
    camYaw: Math.PI,
    camPitch: 0.52, // ~30 degrees, classic RO elevation
    camDist: 14,
    camTargetDist: 14,
    combatZoom: 1,
    combatPitch: 0,
  };
}

/** Pitch limits (RO-style). */
export const MIN_PITCH = 0.26; // ~15 degrees
export const MAX_PITCH = 1.05; // ~60 degrees

/** Zoom limits. */
export const ZOOM_DESKTOP_MIN = 6;
export const ZOOM_DESKTOP_MAX = 20;
export const ZOOM_MOBILE_MIN = 8;
export const ZOOM_MOBILE_MAX = 16;

/** Zoom smoothing factor (higher = faster convergence). Used by Input.updateCameraSmoothing. */
export const ZOOM_SMOOTHING = 8;

/** Clamp pitch to valid range. */
