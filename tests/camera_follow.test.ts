import { describe, expect, it } from 'vitest';
import {
  cameraFollowShouldSettle,
  updateFollowCameraYaw,
  wrapAngle,
} from '../src/game/camera_follow';

describe('camera follow (RO/L2 free orbit)', () => {
  it('wraps angles to the shortest signed turn', () => {
    expect(wrapAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });

  it('is a passthrough: returns camYaw unchanged', () => {
    const next = updateFollowCameraYaw({
      camYaw: 1.0,
      interpFacing: 0.4,
      lastInterpFacing: 0.2,
      frameDt: 1 / 60,
      mouselook: false,
      moving: false,
      orbiting: false,
    });
    expect(next.camYaw).toBe(1.0);
    expect(next.lastInterpFacing).toBe(0.4);
  });

  it('does not change camYaw even when moving', () => {
    const next = updateFollowCameraYaw({
      camYaw: Math.PI,
      interpFacing: 0,
      lastInterpFacing: 0,
      frameDt: 1 / 60,
      mouselook: false,
      moving: true,
      orbiting: false,
    });
    expect(next.camYaw).toBe(Math.PI);
  });

  it('does not change camYaw when orbiting', () => {
    const next = updateFollowCameraYaw({
      camYaw: 1,
      interpFacing: 0.4,
      lastInterpFacing: 0.1,
      frameDt: 1 / 60,
      mouselook: false,
      moving: true,
      orbiting: true,
    });
    expect(next.camYaw).toBe(1);
  });

  it('treats keyboard turning as active follow movement', () => {
    expect(
      cameraFollowShouldSettle(
        {
          forward: false,
          back: false,
          strafeLeft: false,
          strafeRight: false,
          turnLeft: true,
          turnRight: false,
        },
        false,
      ),
    ).toBe(true);
  });

  it('returns camYaw unchanged regardless of cameraDriven flag', () => {
    const next = updateFollowCameraYaw({
      camYaw: 1.0,
      interpFacing: 0.2,
      lastInterpFacing: 0.9,
      frameDt: 1 / 60,
      mouselook: false,
      moving: true,
      cameraDriven: true,
      orbiting: false,
    });
    expect(next.camYaw).toBe(1.0);
    expect(next.lastInterpFacing).toBe(0.2);
  });

  it('returns camYaw unchanged for click-to-move', () => {
    const next = updateFollowCameraYaw({
      camYaw: Math.PI,
      interpFacing: 0,
      lastInterpFacing: Math.PI - 0.5,
      frameDt: 1 / 60,
      mouselook: false,
      moving: true,
      clickMoving: true,
      orbiting: false,
    });
    expect(next.camYaw).toBe(Math.PI);
  });
});
