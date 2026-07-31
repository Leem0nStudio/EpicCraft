import { describe, expect, it } from 'vitest';
import { type CameraOcclusionState, stepCameraOcclusion } from '../src/render/camera_collision';

const PULL_IN = 10;
const PULL_OUT = 6;
const SOFT_WEIGHT = 0.45;
const DT = 1 / 60;

function step(
  state: CameraOcclusionState,
  hard: number,
  soft: number,
  dt = DT,
): CameraOcclusionState {
  return stepCameraOcclusion(
    state,
    hard,
    soft,
    dt,
    PULL_IN,
    PULL_OUT,
    SOFT_WEIGHT,
  );
}

describe('camera collision smoothing (simplified)', () => {
  it('pulls inward when the hard occlusion sweep sees a nearby wall', () => {
    const state: CameraOcclusionState = { pullT: 1 };

    step(state, 0.65, 0.6);

    expect(state.pullT).toBeLessThan(1);
    expect(state.pullT).toBeGreaterThan(0.6);
  });

  it('never moves the physical camera past the hard collision limit', () => {
    const state: CameraOcclusionState = { pullT: 1 };

    step(state, 0.42, 0.35);

    expect(state.pullT).toBeLessThanOrEqual(0.42);
  });

  it('does not keep pulling inward once the hard surface is reached', () => {
    const state: CameraOcclusionState = { pullT: 1 };

    step(state, 0.42, 0.35);
    const firstPull = state.pullT;
    step(state, 0.42, 0.35);

    expect(firstPull).toBe(0.42);
    expect(state.pullT).toBe(0.42);
  });

  it('eases back out instead of snapping when the path clears', () => {
    const state: CameraOcclusionState = { pullT: 0.42 };

    step(state, 1, 1);

    expect(state.pullT).toBeGreaterThan(0.42);
    expect(state.pullT).toBeLessThan(1);
  });

  it('handles large hard limit by pulling toward 1', () => {
    const state: CameraOcclusionState = { pullT: 0.5 };

    step(state, Number.POSITIVE_INFINITY, 1);

    // Exponential ease moves toward 1 but doesn't reach it in one step
    expect(state.pullT).toBeGreaterThan(0.5);
    expect(state.pullT).toBeLessThanOrEqual(1);
  });
});
