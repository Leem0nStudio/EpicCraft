import { describe, expect, it } from 'vitest';
import {
  cameraRelativeDirection,
  getAnimFPS,
  getAnimRow,
  getFrameQuadUVs,
  getFrameUVs,
  getSourceDirection,
  type SpriteSheetMeta,
} from '../src/render/billboard/types';

// Pure geometry of the flip-board sprite system (types.ts): the RO-style
// camera-relative direction mapping, the sprite-sheet UV frame selection and
// the SW/W/NE mirror mapping. The renderer feeds sim facing (0 = +Z, radians)
// and camera yaw in the same convention, so these pin the sector table and the
// mirror contract without a browser.

const META_4X1: SpriteSheetMeta = {
  image: 'test.png',
  frameWidth: 115,
  frameHeight: 256,
  columns: 4,
  rows: 1,
  fps: { idle: 4, walk: 8, attack: 10, cast: 6 },
  directions: { SE: 0, E: 1, N: 2, NW: 3 },
  mirrorDirections: { SW: 'SE', W: 'E', NE: 'NW' },
  animations: {
    idle: { row: 0 },
    walk: { row: 0 },
    attack: { row: 0 },
    cast: { row: 0 },
  },
};

describe('cameraRelativeDirection (RO-style camera-relative facing)', () => {
  it('maps the 8 relative sectors to the 7 sprite directions', () => {
    // rel is the angle from the entity's front to the camera (0 = camera in
    // front). With cameraYaw PI the camera sits SOUTH of the entity looking
    // north, so entityToCamera = 0 and rel = entityFacing: the sector anchors
    // read straight off the facing argument.
    expect(cameraRelativeDirection(0, Math.PI)).toBe('SE'); // front
    expect(cameraRelativeDirection(Math.PI / 4, Math.PI)).toBe('SE'); // front-right
    expect(cameraRelativeDirection(Math.PI / 2, Math.PI)).toBe('E'); // right profile
    expect(cameraRelativeDirection(Math.PI * 0.75, Math.PI)).toBe('NE'); // back-right
    expect(cameraRelativeDirection(Math.PI, Math.PI)).toBe('N'); // back
    expect(cameraRelativeDirection(Math.PI * 1.25, Math.PI)).toBe('NW'); // back-left
    expect(cameraRelativeDirection(Math.PI * 1.5, Math.PI)).toBe('W'); // left profile
    expect(cameraRelativeDirection(Math.PI * 1.75, Math.PI)).toBe('SW'); // front-left
  });

  it('shows the back view when the camera sits behind a north-facing entity', () => {
    // cameraYaw PI = the camera looks north (positioned south of the entity);
    // facing PI = the entity also faces north, away from the camera.
    expect(cameraRelativeDirection(Math.PI, Math.PI)).toBe('N');
  });

  it('shows the front view when the camera sits in front of the entity', () => {
    // Camera south of a south-facing entity (yaw PI, facing 0): the camera is
    // on the entity's facing line, so it sees the front (rel = 0).
    expect(cameraRelativeDirection(0, Math.PI)).toBe('SE');
  });

  it('keeps the sector table stable at the PI/4 half-way boundaries', () => {
    // The search is first-min-wins on an exact tie, and IEEE float rounding
    // decides each half-way boundary deterministically (Math.PI and its
    // multiples are identical doubles on every JS engine). These pin the
    // boundary sectors so a future rewrite of the sector search (e.g. the
    // no-allocation table hoist, sprite-billboard audit F1) cannot silently
    // shift a view. The doubles here do NOT land exactly on the boundary:
    // Math.PI * 0.375 rounds just BELOW the SE/E midpoint (SE wins) and
    // Math.PI * 0.625 rounds just ABOVE the E/NE midpoint (NE wins).
    expect(cameraRelativeDirection(Math.PI * 0.375, Math.PI)).toBe('SE');
    expect(cameraRelativeDirection(Math.PI * 0.625, Math.PI)).toBe('NE');
    // rel = 3PI/2 is an exact anchor (W); the mirrored W keeps its own sector.
    expect(cameraRelativeDirection(Math.PI * 1.5, Math.PI)).toBe('W');
  });

  it('is deterministic across repeated calls (no hidden state in the sweep)', () => {
    // A full sweep must agree call-for-call with itself; guards against any
    // future per-call mutation of the hoisted sector table.
    const angles = [0, 0.3, 0.7, 1.2, 1.9, 2.6, 3.4, 4.1, 4.9, 5.6, 6.2];
    const first = angles.map((a) => cameraRelativeDirection(a, Math.PI));
    const second = angles.map((a) => cameraRelativeDirection(a, Math.PI));
    expect(second).toEqual(first);
  });

  it('normalizes negative and out-of-range facing values', () => {
    // -PI/2 wraps to 3PI/2 (east facing): right profile from a south-looking camera.
    expect(cameraRelativeDirection(-Math.PI / 2, 0)).toBe('E');
    // A full extra turn changes nothing.
    expect(cameraRelativeDirection(Math.PI, 0)).toBe(
      cameraRelativeDirection(Math.PI + Math.PI * 2, 0),
    );
  });
});

describe('getSourceDirection / getFrameUVs (sheet columns + mirroring)', () => {
  it('maps mirrored directions back to their source column', () => {
    expect(getSourceDirection('SW', META_4X1.mirrorDirections)).toEqual({
      direction: 'SE',
      mirrored: true,
    });
    expect(getSourceDirection('W', META_4X1.mirrorDirections)).toEqual({
      direction: 'E',
      mirrored: true,
    });
    expect(getSourceDirection('NE', META_4X1.mirrorDirections)).toEqual({
      direction: 'NW',
      mirrored: true,
    });
    // Base directions are never mirrors of themselves.
    for (const dir of ['SE', 'E', 'N', 'NW'] as const) {
      expect(getSourceDirection(dir, META_4X1.mirrorDirections)).toEqual({
        direction: dir,
        mirrored: false,
      });
    }
  });

  it('selects the source column with a positive strip for the 4 base directions', () => {
    const se = getFrameUVs(META_4X1, 'SE', 0, 0);
    expect(se.u).toBe(0);
    expect(se.uSize).toBe(0.25);
    expect(se.mirror).toBe(false);

    expect(getFrameUVs(META_4X1, 'E', 0, 0).u).toBe(0.25);
    expect(getFrameUVs(META_4X1, 'N', 0, 0).u).toBe(0.5);
    expect(getFrameUVs(META_4X1, 'NW', 0, 0).u).toBe(0.75);
  });

  it('mirrored views point the strip at the RIGHT edge of the source frame', () => {
    // SW mirrors SE (col 0): the offset lands on the frame's right edge so the
    // negative repeat reads the strip right-to-left (a horizontal flip).
    const sw = getFrameUVs(META_4X1, 'SW', 0, 0);
    expect(sw.u).toBeCloseTo(0.25);
    expect(sw.uSize).toBeCloseTo(0.25);
    expect(sw.mirror).toBe(true);

    // NE mirrors NW (col 3): offset at the right edge of the LAST frame.
    const ne = getFrameUVs(META_4X1, 'NE', 0, 0);
    expect(ne.u).toBeCloseTo(1);
    expect(ne.mirror).toBe(true);
  });

  it('places rows from the top of the sheet (Three bottom-left UV origin)', () => {
    const rows4 = { ...META_4X1, rows: 4 };
    const idle = getFrameUVs(rows4, 'SE', 0, 0);
    expect(idle.v).toBe(0.75); // row 0 (idle) sits at the TOP of the sheet
    expect(idle.vSize).toBe(0.25);
    const cast = getFrameUVs(rows4, 'SE', 3, 0);
    expect(cast.v).toBe(0); // row 3 (cast) at the bottom
  });
});

describe('getFrameQuadUVs (baked-geometry frame corners)', () => {
  it('maps the 4 base directions to their column strips left-to-right', () => {
    const se = getFrameQuadUVs(META_4X1, 'SE', 0);
    expect(se.uMin).toBe(0);
    expect(se.uMax).toBeCloseTo(0.25);
    expect(se.vMin).toBe(0);
    expect(se.vMax).toBe(1);

    const e = getFrameQuadUVs(META_4X1, 'E', 0);
    expect(e.uMin).toBeCloseTo(0.25);
    expect(e.uMax).toBeCloseTo(0.5);

    const n = getFrameQuadUVs(META_4X1, 'N', 0);
    expect(n.uMin).toBeCloseTo(0.5);
    expect(n.uMax).toBeCloseTo(0.75);

    const nw = getFrameQuadUVs(META_4X1, 'NW', 0);
    expect(nw.uMin).toBeCloseTo(0.75);
    expect(nw.uMax).toBeCloseTo(1);
  });

  it('mirrored views bake the strip right-to-left (uMin > uMax)', () => {
    // SW mirrors SE (col 0): the quad reads the frame from its right edge back
    // to its left — the baked equivalent of the old negative repeat.
    const sw = getFrameQuadUVs(META_4X1, 'SW', 0);
    expect(sw.uMin).toBeCloseTo(0.25);
    expect(sw.uMax).toBe(0);
    expect(sw.uMin).toBeGreaterThan(sw.uMax);

    // NE mirrors NW (col 3, the last frame).
    const ne = getFrameQuadUVs(META_4X1, 'NE', 0);
    expect(ne.uMin).toBeCloseTo(1);
    expect(ne.uMax).toBeCloseTo(0.75);
  });

  it('is consistent with getFrameUVs strip offsets', () => {
    // The baked corners must agree with the texture-matrix strip the old
    // material path used: base views start at offset u, mirrored at u + uSize.
    for (const dir of ['SE', 'E', 'N', 'NW', 'SW', 'W', 'NE'] as const) {
      const quad = getFrameQuadUVs(META_4X1, dir, 0);
      const uvs = getFrameUVs(META_4X1, dir, 0, 0);
      if (uvs.mirror) {
        expect(quad.uMin).toBeCloseTo(uvs.u);
        expect(quad.uMax).toBeCloseTo(uvs.u - uvs.uSize);
      } else {
        expect(quad.uMin).toBeCloseTo(uvs.u);
        expect(quad.uMax).toBeCloseTo(uvs.u + uvs.uSize);
      }
      expect(quad.vMin).toBeCloseTo(uvs.v);
      expect(quad.vMax).toBeCloseTo(uvs.v + uvs.vSize);
    }
  });

  it('places rows from the top of the sheet (Three bottom-left UV origin)', () => {
    const rows4 = { ...META_4X1, rows: 4 };
    const idle = getFrameQuadUVs(rows4, 'SE', 0);
    expect(idle.vMin).toBe(0.75); // row 0 (idle) sits at the TOP of the sheet
    expect(idle.vMax).toBe(1);
    const cast = getFrameQuadUVs(rows4, 'SE', 3);
    expect(cast.vMin).toBe(0); // row 3 (cast) at the bottom
    expect(cast.vMax).toBeCloseTo(0.25);
  });
});

describe('getAnimRow / getAnimFPS', () => {
  it('resolves the animation row and playback rate from the sheet meta', () => {
    expect(getAnimRow(META_4X1, 'idle')).toBe(0);
    expect(getAnimFPS(META_4X1, 'idle')).toBe(4);
    expect(getAnimFPS(META_4X1, 'walk')).toBe(8);
    expect(getAnimFPS(META_4X1, 'attack')).toBe(10);
    expect(getAnimFPS(META_4X1, 'cast')).toBe(6);
  });
});
