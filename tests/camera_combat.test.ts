import { describe, expect, it } from 'vitest';
import {
  COMBAT_PITCH_BONUS,
  COMBAT_TRANSITION_RATE,
  COMBAT_ZOOM_FACTOR,
  applyCombatCamera,
  createCombatCameraState,
  tickCombatCamera,
} from '../src/game/camera_combat';

describe('camera_combat', () => {
  it('creates initial state with no combat offsets', () => {
    const state = createCombatCameraState();
    expect(state.zoomFactor).toBe(1);
    expect(state.pitchBonus).toBe(0);
  });

  it('transitions toward combat values when in combat', () => {
    const state = createCombatCameraState();
    const next = tickCombatCamera(state, true, 1 / 60);
    expect(next.zoomFactor).toBeLessThan(1);
    expect(next.zoomFactor).toBeGreaterThan(COMBAT_ZOOM_FACTOR);
    expect(next.pitchBonus).toBeGreaterThan(0);
    expect(next.pitchBonus).toBeLessThan(COMBAT_PITCH_BONUS);
  });

  it('transitions toward neutral when out of combat', () => {
    const state = { zoomFactor: COMBAT_ZOOM_FACTOR, pitchBonus: COMBAT_PITCH_BONUS };
    const next = tickCombatCamera(state, false, 1 / 60);
    expect(next.zoomFactor).toBeGreaterThan(COMBAT_ZOOM_FACTOR);
    expect(next.pitchBonus).toBeLessThan(COMBAT_PITCH_BONUS);
  });

  it('reaches combat values after enough time', () => {
    let state = createCombatCameraState();
    // Simulate 2 seconds of combat at 60fps
    for (let i = 0; i < 120; i++) {
      state = tickCombatCamera(state, true, 1 / 60);
    }
    expect(state.zoomFactor).toBeCloseTo(COMBAT_ZOOM_FACTOR, 2);
    expect(state.pitchBonus).toBeCloseTo(COMBAT_PITCH_BONUS, 3);
  });

  it('reaches neutral after leaving combat', () => {
    let state = { zoomFactor: COMBAT_ZOOM_FACTOR, pitchBonus: COMBAT_PITCH_BONUS };
    // Simulate 2 seconds out of combat at 60fps
    for (let i = 0; i < 120; i++) {
      state = tickCombatCamera(state, false, 1 / 60);
    }
    expect(state.zoomFactor).toBeCloseTo(1, 2);
    expect(state.pitchBonus).toBeCloseTo(0, 3);
  });

  it('applyCombatCamera applies offsets correctly', () => {
    const combat = { zoomFactor: 0.82, pitchBonus: 0.087 };
    const result = applyCombatCamera(0.52, 14, combat);
    expect(result.pitch).toBeCloseTo(0.52 + 0.087);
    expect(result.dist).toBeCloseTo(14 * 0.82);
  });

  it('applyCombatCamera with no combat is identity', () => {
    const combat = createCombatCameraState();
    const result = applyCombatCamera(0.52, 14, combat);
    expect(result.pitch).toBe(0.52);
    expect(result.dist).toBe(14);
  });
});
