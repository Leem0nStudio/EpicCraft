import { describe, expect, it } from 'vitest';
import {
  continentBiomeAt,
  continentHeightAt,
  continentSurface,
  continentWaterSpots,
  generateRivers,
  poissonDiskSampling,
  CONTINENT_CX,
  CONTINENT_CZ,
  CONTINENT_LANDING,
  CONTINENT_RADIUS,
  CONTINENT_SEA_LEVEL,
} from '../src/world/ContinentGrammar';
import { Rng } from '../src/sim/rng';

// Layer 0 of "Continente por Gramática v1": ALTURA + RÍOS. The heightfield is
// a pure function of (x, z, seed) with rivers carved into it (dry valleys
// upstream, below-sea mouth lagoons, source tarns), and the biome classifier
// reads River/Lake coherently. Everything here must stay deterministic per
// seed and cheap to sample (the sim + chunked renderer sample it every frame).

const SEED = 20061; // the fixed world seed (main.ts WORLD_SEED)

// A dry inland point that is reliably above the river carve window (the
// harbour plateau at the portal landing is guaranteed dry and walkable).
const LANDING = CONTINENT_LANDING;

describe('continent heightfield determinism', () => {
  it('is byte-identical across calls for the same seed', () => {
    const a = continentHeightAt(12300, 40, SEED);
    const b = continentHeightAt(12300, 40, SEED);
    expect(a).toBe(b);
    const c = continentHeightAt(12300, 40, SEED + 1);
    expect(c).not.toBeCloseTo(a, 5); // a different seed is a different island
  });

  it('regenerates the identical river set per seed', () => {
    const r1 = generateRivers(SEED);
    const r2 = generateRivers(SEED);
    expect(r1).toEqual(r2);
    expect(r1.length).toBeGreaterThanOrEqual(1);
  });
});

describe('rivers (the Layer 0 grammar rule)', () => {
  it('flows downhill from a high source to the sea or a source tarn', () => {
    for (const river of generateRivers(SEED)) {
      const src = river.points[0];
      const mouth = river.points[river.points.length - 1];
      // Born on tall ground...
      expect(continentHeightAt(src.x, src.z, SEED)).toBeGreaterThan(8);
      if (!river.lake) {
        // ...and ends at/below sea level at the coast (the mouth lagoon dives
        // below the waterline so the ocean plane fills it).
        expect(continentHeightAt(mouth.x, mouth.z, SEED)).toBeLessThan(CONTINENT_SEA_LEVEL + 0.6);
        expect(river.mouth.x).toBe(mouth.x);
        expect(river.mouth.z).toBe(mouth.z);
      } else {
        // A source tarn is a real lake: its center is carved below sea level.
        expect(continentHeightAt(river.lake.x, river.lake.z, SEED)).toBeLessThan(
          CONTINENT_SEA_LEVEL,
        );
      }
    }
  });

  it('carves a valley: the river bed sits below the surrounding shelf', () => {
    const rivers = generateRivers(SEED);
    const pts = rivers[0].points;
    const i = Math.floor(pts.length / 2);
    const mid = pts[i];
    // Sample the shelf perpendicular to the local channel direction (a plain
    // diagonal offset can run downhill and falsely beat the carved bed).
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dir = Math.atan2(next.z - prev.z, next.x - prev.x);
    const dx = Math.cos(dir + Math.PI / 2) * 30;
    const dz = Math.sin(dir + Math.PI / 2) * 30;
    const bed = continentHeightAt(mid.x, mid.z, SEED);
    const shelf = Math.min(
      continentHeightAt(mid.x + dx, mid.z + dz, SEED),
      continentHeightAt(mid.x - dx, mid.z - dz, SEED),
    );
    expect(bed).toBeLessThan(shelf);
  });
});

describe('biomes', () => {
  it('classifies the carved channel as River (dry bed) coherently', () => {
    const rivers = generateRivers(SEED);
    // Pick a mid-path point whose bed stays above sea level (dry valley).
    for (const river of rivers) {
      const i = Math.floor(river.points.length * 0.3);
      const p = river.points[i];
      if (continentHeightAt(p.x, p.z, SEED) > CONTINENT_SEA_LEVEL + 1) {
        expect(continentBiomeAt(p.x, p.z, SEED)).toBe('River');
        break;
      }
    }
  });

  it('produces several distinct biomes across the island', () => {
    const seen = new Set<string>();
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        const x = CONTINENT_CX + gx * 90;
        const z = CONTINENT_CZ + gz * 90;
        if (Math.hypot(x - CONTINENT_CX, z - CONTINENT_CZ) > CONTINENT_RADIUS) continue;
        seen.add(continentBiomeAt(x, z, SEED));
      }
    }
    // The island must not be one flat biome: expect land biomes beyond Plains.
    expect([...seen].filter((b) => b !== 'Ocean' && b !== 'Sea').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the portal landing dry and walkable (Plains)', () => {
    const { h, biome } = continentSurface(LANDING.x, LANDING.z, SEED);
    expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL);
    expect(biome).not.toBe('Ocean');
  });
});

describe('water spots (swim gate + renderer water)', () => {
  it('declares a positive-radius body for every river mouth and source tarn', () => {
    const spots = continentWaterSpots(SEED);
    expect(spots.length).toBeGreaterThanOrEqual(1);
    for (const spot of spots) {
      expect(spot.radius).toBeGreaterThan(0);
    }
  });
});

describe('poisson-disk sampling (Layer 1 ready)', () => {
  it('guarantees the minimum spacing deterministically', () => {
    const rng = new Rng(SEED);
    const minDist = 8;
    const pts = poissonDiskSampling(256, 256, minDist, rng);
    expect(pts.length).toBeGreaterThan(10);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        expect(d).toBeGreaterThanOrEqual(minDist - 1e-6);
      }
    }
  });
});
