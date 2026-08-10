// ---------------------------------------------------------------------------
// "Continente por Gramática" v1 — Capa 1 (la región): población del terreno.
//
// Layer 0 built the landmass (height + rivers + biomes, src/world/
// ContinentGrammar.ts); this layer populates it. 100% code, 0 assets: every
// prop is a deterministic function of (x, z, seed), placed with Poisson-disk
// sampling (never random spam, so trees never clump) and then filtered to
// walkable land away from lagoons/tarns, the portal landing, and cliff faces.
// The renderer (src/render/foliage.ts buildContinentFoliage) consumes the same
// memoized list; props are walk-through decoration like the overworld's, so
// the sim needs no colliders for them.
//
// Determinism: each pass draws from its own salted Rng stream, so adding a
// future layer (settlements, Capa 2) never shifts prop placements, and the
// fixed world seed always regenerates the identical island AND its identical
// forests. Everything is memoized per seed exactly like the rivers/carve
// fields, so hot-loop sampling never pays generation cost.
// ---------------------------------------------------------------------------

import { Rng } from '../sim/rng';
import {
  continentHeightAt,
  continentSurface,
  continentWaterSpots,
  poissonDiskSampling,
  CONTINENT_CX,
  CONTINENT_CZ,
  CONTINENT_LANDING,
  CONTINENT_RADIUS,
  CONTINENT_SEA_LEVEL,
  type ContinentBiome,
} from './ContinentGrammar';

export type ContinentPropKind =
  | 'pine'
  | 'oak'
  | 'rock'
  | 'bush'
  | 'bushFlowers'
  | 'fern'
  | 'mushroom';

export interface ContinentProp {
  kind: ContinentPropKind;
  x: number;
  z: number;
  scale: number;
  /** Model variant index; the renderer maps it into its per-kind variant arrays. */
  variant: number;
  biome: ContinentBiome;
}

// ---------------------------------------------------------------------------
// Tuning. Poisson min-dists mirror the architecture doc (trees min 8u apart,
// bushes ~3u); the per-biome density gates keep forests dense and deserts
// sparse. All constants are private to this module (the rules live next to
// the values that shape them, like ContinentGrammar).
// ---------------------------------------------------------------------------

const TREE_MIN_DIST = 9;
const BUSH_MIN_DIST = 4.5;
const ROCK_MIN_DIST = 7.5;
// Keep the portal harbour clear: no props inside this disc around the landing.
const LANDING_CLEAR_RADIUS = 16;
// Steep faces get no props (mirrors the overworld DECORATION_MAX_SLOPE gate).
const PROP_MAX_SLOPE = 1.3;
const SLOPE_EPS = 2;

// Per-biome acceptance for each pass (0..1); 0 = never in that biome.
const TREE_DENSITY: Record<ContinentBiome, number> = {
  Ocean: 0,
  Sea: 0,
  Lake: 0,
  River: 0,
  Mountain: 0.3,
  Hill: 0.42,
  Plains: 0.55,
  Forest: 0.8,
  Desert: 0.07,
};
const BUSH_DENSITY: Record<ContinentBiome, number> = {
  Ocean: 0,
  Sea: 0,
  Lake: 0,
  River: 0,
  Mountain: 0.12,
  Hill: 0.24,
  Plains: 0.42,
  Forest: 0.5,
  Desert: 0.09,
};
const ROCK_DENSITY: Record<ContinentBiome, number> = {
  Ocean: 0,
  Sea: 0,
  Lake: 0,
  River: 0,
  Mountain: 0.78,
  Hill: 0.42,
  Plains: 0.16,
  Forest: 0.1,
  Desert: 0.34,
};

// Scale ranges per kind (uniform draw, then per-instance jitter).
const PROP_SCALE: Record<ContinentPropKind, [number, number]> = {
  pine: [0.95, 1.35],
  oak: [0.95, 1.4],
  rock: [0.7, 1.25],
  bush: [0.8, 1.1],
  bushFlowers: [0.8, 1.1],
  fern: [0.7, 0.95],
  mushroom: [0.7, 0.9],
};

const propsCache = new Map<number, ContinentProp[]>();

/**
 * The continent's deterministic prop set for `seed` (memoized). Trees (pine /
 * oak) and bushes come from Poisson-disk passes over the island's bounding
 * box; rocks and dressing from finer passes. Every candidate is filtered to
 * dry, walkable, non-steep ground away from declared water and the harbour.
 */
export function generateContinentProps(seed: number): ContinentProp[] {
  const cached = propsCache.get(seed);
  if (cached) return cached;

  const islandHalf = CONTINENT_RADIUS + 8;
  const box = islandHalf * 2;
  const props: ContinentProp[] = [];

  const waterSpots = continentWaterSpots(seed);
  const inWaterSpot = (x: number, z: number): boolean =>
    waterSpots.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.radius * s.radius);
  const onLanding = (x: number, z: number): boolean =>
    (x - CONTINENT_LANDING.x) ** 2 + (z - CONTINENT_LANDING.z) ** 2 <
    LANDING_CLEAR_RADIUS ** 2;
  const tooSteep = (x: number, z: number): boolean => {
    const hx = continentHeightAt(x + SLOPE_EPS, z, seed) - continentHeightAt(x - SLOPE_EPS, z, seed);
    const hz = continentHeightAt(x, z + SLOPE_EPS, seed) - continentHeightAt(x, z - SLOPE_EPS, seed);
    return Math.hypot(hx, hz) / (2 * SLOPE_EPS) > PROP_MAX_SLOPE;
  };
  const accepted = (x: number, z: number, biome: ContinentBiome, h: number): boolean => {
    if (h < CONTINENT_SEA_LEVEL + 0.7) return false;
    if (biome === 'Ocean' || biome === 'Sea' || biome === 'Lake' || biome === 'River') return false;
    if (inWaterSpot(x, z)) return false;
    if (onLanding(x, z)) return false;
    if (tooSteep(x, z)) return false;
    return true;
  };
  const push = (
    kind: ContinentPropKind,
    x: number,
    z: number,
    biome: ContinentBiome,
    variant: number,
    scale: number,
  ): void => {
    props.push({ kind, x, z, scale, variant, biome });
  };

  // Trees (Oak / Pine; mountain & desert carry hardy pines only).
  const treeRng = new Rng((seed ^ 0x51a1) >>> 0);
  for (const p of poissonDiskSampling(box, box, TREE_MIN_DIST, treeRng)) {
    const x = CONTINENT_CX - islandHalf + p.x;
    const z = CONTINENT_CZ - islandHalf + p.z;
    const { h, biome } = continentSurface(x, z, seed);
    if (!accepted(x, z, biome, h)) continue;
    if (treeRng.next() > TREE_DENSITY[biome]) continue;
    const pineBiome = biome === 'Mountain' || biome === 'Hill' || biome === 'Desert';
    const kind = pineBiome || treeRng.next() < 0.45 ? 'pine' : 'oak';
    const variantCount = kind === 'pine' ? 4 : 5;
    const [sMin, sRange] = PROP_SCALE[kind];
    push(
      kind,
      x,
      z,
      biome,
      Math.floor(treeRng.next() * variantCount),
      sMin + treeRng.next() * sRange,
    );
  }

  // Bushes + ground dressing (flowers, ferns, mushrooms) per biome mix.
  const bushRng = new Rng((seed ^ 0x51a2) >>> 0);
  for (const p of poissonDiskSampling(box, box, BUSH_MIN_DIST, bushRng)) {
    const x = CONTINENT_CX - islandHalf + p.x;
    const z = CONTINENT_CZ - islandHalf + p.z;
    const { h, biome } = continentSurface(x, z, seed);
    if (!accepted(x, z, biome, h)) continue;
    if (bushRng.next() > BUSH_DENSITY[biome]) continue;
    const r = bushRng.next();
    let kind: ContinentPropKind;
    if (biome === 'Forest') {
      kind = r < 0.45 ? 'bush' : r < 0.65 ? 'bushFlowers' : r < 0.85 ? 'fern' : 'mushroom';
    } else if (biome === 'Plains') {
      kind = r < 0.55 ? 'bush' : 'bushFlowers';
    } else {
      kind = 'bush';
    }
    const [sMin, sRange] = PROP_SCALE[kind];
    push(kind, x, z, biome, 0, sMin + bushRng.next() * sRange);
  }

  // Rocks (boulders, single variant index).
  const rockRng = new Rng((seed ^ 0x51a3) >>> 0);
  for (const p of poissonDiskSampling(box, box, ROCK_MIN_DIST, rockRng)) {
    const x = CONTINENT_CX - islandHalf + p.x;
    const z = CONTINENT_CZ - islandHalf + p.z;
    const { h, biome } = continentSurface(x, z, seed);
    if (!accepted(x, z, biome, h)) continue;
    if (rockRng.next() > ROCK_DENSITY[biome]) continue;
    const [sMin, sRange] = PROP_SCALE.rock;
    push('rock', x, z, biome, Math.floor(rockRng.next() * 3), sMin + rockRng.next() * sRange);
  }

  // Stable render order: by kind, then by x (the renderer buckets anyway, but
  // a fixed list keeps build output byte-identical across runs).
  props.sort((a, b) => (a.kind === b.kind ? a.x - b.x : a.kind < b.kind ? -1 : 1));
  propsCache.set(seed, props);
  return props;
}

/** Count of props per kind for a seed (cheap diagnostics / tests). */
export function continentPropCounts(seed: number): Record<ContinentPropKind, number> {
  const counts: Record<ContinentPropKind, number> = {
    pine: 0,
    oak: 0,
    rock: 0,
    bush: 0,
    bushFlowers: 0,
    fern: 0,
    mushroom: 0,
  };
  for (const p of generateContinentProps(seed)) counts[p.kind]++;
  return counts;
}
