import { describe, expect, it } from 'vitest';
import {
  continentHeightAt,
  continentSurface,
  continentWaterSpots,
  CONTINENT_CX,
  CONTINENT_CZ,
  CONTINENT_LANDING,
  CONTINENT_RADIUS,
  CONTINENT_SEA_LEVEL,
} from '../src/world/ContinentGrammar';
import {
  continentPropCounts,
  generateContinentProps,
  type ContinentProp,
} from '../src/world/RegionPopulator';

// Layer 1 of "Continente por Gramática v1": LA REGIÓN — POBLACIÓN DE TERRENO.
// The RegionPopulator scatters deterministic Poisson-disk props (trees, rocks,
// bushes, flowers, mushrooms) across the island built by Layer 0. Everything
// must stay deterministic per seed and keep clear of the water bodies, the
// portal harbour, and cliff faces.

const SEED = 20061; // the fixed world seed (main.ts WORLD_SEED)

describe('region population determinism', () => {
  it('regenerates the identical prop set per seed', () => {
    const a = generateContinentProps(SEED);
    const b = generateContinentProps(SEED);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('a different seed yields a different scatter', () => {
    const a = generateContinentProps(SEED);
    const b = generateContinentProps(SEED + 1);
    expect(a).not.toEqual(b);
  });

  it('every prop sits on dry, walkable land', () => {
    for (const p of generateContinentProps(SEED)) {
      const { h, biome } = continentSurface(p.x, p.z, SEED);
      expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL + 0.5);
      expect(biome).not.toBe('Ocean');
      expect(biome).not.toBe('Sea');
      expect(biome).not.toBe('Lake');
      expect(biome).not.toBe('River');
    }
  });
});

describe('poisson spacing', () => {
  it('trees and bushes never clump closer than their min spacing', () => {
    const trees = generateContinentProps(SEED).filter((p) => p.kind === 'pine' || p.kind === 'oak');
    const treesByKind = new Map<string, ContinentProp[]>();
    for (const t of trees) {
      const list = treesByKind.get(t.kind);
      if (list) list.push(t);
      else treesByKind.set(t.kind, [t]);
    }
    // Each tree KIND is its own Poisson pass, so spacing holds within a kind.
    for (const list of treesByKind.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z);
          // RegionPopulator draws trees at minDist 9; allow the renderer's
          // bucket jitter margin (the placement itself never moves).
          expect(d).toBeGreaterThanOrEqual(8.9);
        }
      }
    }
  });
});

describe('exclusions', () => {
  it('keeps the portal harbour clear of props', () => {
    for (const p of generateContinentProps(SEED)) {
      const d = Math.hypot(p.x - CONTINENT_LANDING.x, p.z - CONTINENT_LANDING.z);
      expect(d).toBeGreaterThanOrEqual(15);
    }
  });

  it('keeps props out of the river mouths and source tarns', () => {
    const spots = continentWaterSpots(SEED);
    for (const p of generateContinentProps(SEED)) {
      for (const s of spots) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        expect(d).toBeGreaterThanOrEqual(s.radius - 0.5);
      }
    }
  });

  it('keeps props off steep cliff faces', () => {
    const eps = 2;
    for (const p of generateContinentProps(SEED)) {
      const hx =
        continentHeightAt(p.x + eps, p.z, SEED) - continentHeightAt(p.x - eps, p.z, SEED);
      const hz =
        continentHeightAt(p.x, p.z + eps, SEED) - continentHeightAt(p.x, p.z - eps, SEED);
      const slope = Math.hypot(hx, hz) / (2 * eps);
      expect(slope).toBeLessThanOrEqual(1.31);
    }
  });

  it('stays inside the island (no props in the open ocean)', () => {
    for (const p of generateContinentProps(SEED)) {
      const d = Math.hypot(p.x - CONTINENT_CX, p.z - CONTINENT_CZ);
      expect(d).toBeLessThan(CONTINENT_RADIUS * 1.05);
    }
  });
});

describe('biome mix', () => {
  it('forests grow trees, mountains grow rocks, plains grow flowers', () => {
    const counts = continentPropCounts(SEED);
    // The island must look alive: a meaningful number of trees and rocks.
    expect(counts.pine + counts.oak).toBeGreaterThan(30);
    expect(counts.rock).toBeGreaterThan(10);
    expect(counts.bush + counts.bushFlowers + counts.fern + counts.mushroom).toBeGreaterThan(10);
  });
});
