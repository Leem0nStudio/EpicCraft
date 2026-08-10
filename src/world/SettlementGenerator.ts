// ---------------------------------------------------------------------------
// "Continente por Gramática" v1 — Capa 2 (asentamientos): gramática de ciudades.
//
// Towns are not random: they GROW from a nucleus. Each kingdom placed by Layer
// 0's tail (placeKingdoms) anchors one settlement whose buildings follow a
// grammar — City = castle (chapel) in the centre + 3 rings of houses; Village
// = 1 plaza (well) + houses around a circle; Kingdom = a capital City plus
// satellite Villages. Every house picks one of the 3 variants (Cottage /
// WoodHouse / StoneHouse), and every building is nudged onto dry, non-steep,
// walkable ground away from declared water and the portal landing — all
// deterministic, with no overlap. The renderer (src/render/props.ts
// buildContinentSettlements) and the sim colliders (src/sim/colliders.ts)
// consume the same memoized list, so what you see is what you collide with.
//
// Determinism: each settlement draws from its own salted Rng stream; the layout
// is a pure function of (settlementSeed, center, type). Nudging uses a fixed
// golden-angle spiral (no rng), so a given world seed always regenerates the
// identical towns, and adding future layers never shifts this placement.
// ---------------------------------------------------------------------------

import { Rng } from '../sim/rng';
import {
  continentSurface,
  continentTooSteep,
  continentWaterSpots,
  placeKingdoms,
  CONTINENT_LANDING,
  CONTINENT_SEA_LEVEL,
  type ContinentKingdom,
} from './ContinentGrammar';

export type SettlementType = 'Village' | 'City' | 'Kingdom';
export type HouseVariant = 'Cottage' | 'WoodHouse' | 'StoneHouse';
export type SettlementBuildingKind = 'house' | 'inn' | 'chapel' | 'well';

export interface SettlementBuilding {
  kind: SettlementBuildingKind;
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  /** House variant (houses only; the renderer maps it onto the 3 house models). */
  variant?: HouseVariant;
}

export interface Settlement {
  type: SettlementType;
  name: string;
  seed: number;
  center: { x: number; z: number };
  buildings: SettlementBuilding[];
  /** Kingdom only: the satellite villages orbiting the capital. */
  satellites?: Settlement[];
}

export interface ContinentSettlements {
  kingdoms: ContinentKingdom[];
  settlements: Settlement[];
}

// ---------------------------------------------------------------------------
// Tuning. Footprints mirror the overworld building defs (house ~4.8x4.6 etc.),
// so the rendered model matches the collider box. All constants are private to
// this module: the rules live next to the values that shape them.
// ---------------------------------------------------------------------------

const HOUSE_W = 4.8;
const HOUSE_D = 4.6;
const INN_W = 5.4;
const INN_D = 4.8;
const CASTLE_W = 6.4;
const CASTLE_D = 6.4;
const WELL_W = 3.2;
const WELL_D = 3.2;

// Buildings need flat-ish dry ground (stricter than the prop pass).
const BUILD_MAX_SLOPE = 0.5;
const BUILD_DRY = 0.7; // height must clear sea level by this much
const LANDING_CLEAR_RADIUS = 16; // keep the harbour approach clear (mirrors props)
// Required centre gap between two buildings = half-sizes + street gap.
const STREET_GAP = 1.0;

const VILLAGE_RADIUS = 13;
const VILLAGE_HOUSES = 8;

const CITY_RING_RADII = [12, 19, 26];
const CITY_RING_COUNTS = [6, 10, 14];

const SATELLITE_COUNT_MIN = 2;
const SATELLITE_COUNT_MAX = 3;
const SATELLITE_RADIUS_MIN = 48;
const SATELLITE_RADIUS_MAX = 64;

const HOUSE_VARIANTS: readonly HouseVariant[] = ['Cottage', 'WoodHouse', 'StoneHouse'];

const settlementsCache = new Map<number, ContinentSettlements>();

function maxDim(kind: SettlementBuildingKind): number {
  switch (kind) {
    case 'inn':
      return INN_W;
    case 'chapel':
      return CASTLE_W;
    case 'well':
      return WELL_W;
    default:
      return HOUSE_W;
  }
}

function reqGap(a: SettlementBuildingKind, b: SettlementBuildingKind): number {
  return maxDim(a) / 2 + maxDim(b) / 2 + STREET_GAP;
}

// Wealthy core, humble edge: inner rings lean stone, outer rings lean cottage.
function variantFor(rng: Rng, ring: number, ringCount: number): HouseVariant {
  const t = ringCount <= 1 ? 0 : ring / (ringCount - 1); // 0 = core, 1 = edge
  const roll = rng.next();
  const stoneP = 0.55 - 0.32 * t;
  const woodP = 0.3;
  if (roll < stoneP) return 'StoneHouse';
  if (roll < stoneP + woodP) return 'WoodHouse';
  return 'Cottage';
}

interface SpotGate {
  seed: number;
  waterSpots: { x: number; z: number; radius: number }[];
}

function spotOk(g: SpotGate, x: number, z: number): boolean {
  const { h, biome } = continentSurface(x, z, g.seed);
  if (h < CONTINENT_SEA_LEVEL + BUILD_DRY) return false;
  if (biome === 'Ocean' || biome === 'Sea' || biome === 'Lake' || biome === 'River') return false;
  if (g.waterSpots.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.radius * s.radius)) return false;
  if ((x - CONTINENT_LANDING.x) ** 2 + (z - CONTINENT_LANDING.z) ** 2 < LANDING_CLEAR_RADIUS ** 2)
    return false;
  return !continentTooSteep(x, z, g.seed, BUILD_MAX_SLOPE);
}

function overlapsPlaced(
  placed: SettlementBuilding[],
  x: number,
  z: number,
  kind: SettlementBuildingKind,
): boolean {
  for (const b of placed) {
    const dx = b.x - x;
    const dz = b.z - z;
    const d2 = dx * dx + dz * dz;
    const gap = reqGap(b.kind, kind);
    if (d2 < gap * gap) return true;
  }
  return false;
}

// Find the first valid spot for a building: the ideal one, else a fixed
// golden-angle spiral (deterministic — no rng) out to ~25u. Null = drop.
function nudge(
  g: SpotGate,
  placed: SettlementBuilding[],
  x: number,
  z: number,
  kind: SettlementBuildingKind,
): { x: number; z: number } | null {
  if (spotOk(g, x, z) && !overlapsPlaced(placed, x, z, kind)) return { x, z };
  const GOLDEN = 2.399963229728653;
  for (let k = 1; k <= 14; k++) {
    const r = 1.8 * k;
    const a = GOLDEN * k;
    const nx = x + Math.cos(a) * r;
    const nz = z + Math.sin(a) * r;
    if (!spotOk(g, nx, nz)) continue;
    if (overlapsPlaced(placed, nx, nz, kind)) continue;
    return { x: nx, z: nz };
  }
  return null;
}

// Door on local +z (matches the glTF assets); face the settlement core.
function doorRot(cx: number, cz: number, x: number, z: number, jitter: number): number {
  return Math.atan2(cx - x, cz - z) + jitter;
}

function pushHouse(
  out: SettlementBuilding[],
  g: SpotGate,
  placed: SettlementBuilding[],
  center: { x: number; z: number },
  angle: number,
  radius: number,
  variant: HouseVariant,
  jitter: number,
): void {
  const x = center.x + Math.cos(angle) * radius;
  const z = center.z + Math.sin(angle) * radius;
  const spot = nudge(g, placed, x, z, 'house');
  if (!spot) return;
  out.push({
    kind: 'house',
    x: spot.x,
    z: spot.z,
    rot: doorRot(center.x, center.z, spot.x, spot.z, jitter),
    w: HOUSE_W,
    d: HOUSE_D,
    variant,
  });
  placed.push(out[out.length - 1]);
}

function pushFixed(
  out: SettlementBuilding[],
  g: SpotGate,
  placed: SettlementBuilding[],
  center: { x: number; z: number },
  kind: SettlementBuildingKind,
  x: number,
  z: number,
  rot: number,
  variant?: HouseVariant,
): void {
  const spot = nudge(g, placed, x, z, kind);
  if (!spot) return;
  const w = kind === 'inn' ? INN_W : kind === 'chapel' ? CASTLE_W : WELL_W;
  const d = kind === 'inn' ? INN_D : kind === 'chapel' ? CASTLE_D : WELL_D;
  const b: SettlementBuilding = {
    kind,
    x: spot.x,
    z: spot.z,
    rot: kind === 'well' ? rot : doorRot(center.x, center.z, spot.x, spot.z, rot),
    w,
    d,
    ...(kind === 'house' ? { variant } : {}),
  };
  out.push(b);
  placed.push(b);
}

function buildVillage(
  settlementSeed: number,
  center: { x: number; z: number },
  name: string,
  rng: Rng,
  g: SpotGate,
): Settlement {
  const buildings: SettlementBuilding[] = [];
  const placed: SettlementBuilding[] = [];
  // 1 plaza: the village well at the heart.
  pushFixed(buildings, g, placed, center, 'well', center.x, center.z, 0);
  // Houses around the circle, doors facing the plaza.
  for (let i = 0; i < VILLAGE_HOUSES; i++) {
    const angle = (i / VILLAGE_HOUSES) * Math.PI * 2 + (rng.next() - 0.5) * 0.16;
    const radius = VILLAGE_RADIUS + (rng.next() - 0.5) * 3;
    const variant = rng.next() < 0.5 ? 'Cottage' : HOUSE_VARIANTS[Math.floor(rng.next() * 2) + 1];
    pushHouse(buildings, g, placed, center, angle, radius, variant, (rng.next() - 0.5) * 0.3);
  }
  return { type: 'Village', name, seed: settlementSeed, center, buildings };
}

function buildCity(
  settlementSeed: number,
  center: { x: number; z: number },
  name: string,
  rng: Rng,
  g: SpotGate,
): Settlement {
  const buildings: SettlementBuilding[] = [];
  const placed: SettlementBuilding[] = [];
  // The castle nucleus.
  pushFixed(buildings, g, placed, center, 'chapel', center.x, center.z, 0);
  // 3 rings of houses; ring 1 also hosts the inn + a well (instead of houses).
  for (let ring = 0; ring < CITY_RING_RADII.length; ring++) {
    const radius = CITY_RING_RADII[ring];
    const count = CITY_RING_COUNTS[ring];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (rng.next() - 0.5) * 0.14;
      const r = radius + (rng.next() - 0.5) * 2.2;
      if (ring === 0 && i === 0) {
        pushFixed(buildings, g, placed, center, 'inn', center.x + Math.cos(angle) * r, center.z + Math.sin(angle) * r, 0);
        continue;
      }
      if (ring === 0 && i === 1) {
        pushFixed(buildings, g, placed, center, 'well', center.x + Math.cos(angle) * r, center.z + Math.sin(angle) * r, 0);
        continue;
      }
      const variant = variantFor(rng, ring, CITY_RING_RADII.length);
      pushHouse(buildings, g, placed, center, angle, r, variant, (rng.next() - 0.5) * 0.24);
    }
  }
  return { type: 'City', name, seed: settlementSeed, center, buildings };
}

/**
 * One settlement grown from a kingdom nucleus (grammar per type).
 * `terrainSeed` is the WORLD seed (the island's height/biomes are a function of
 * it); `settlementSeed` only drives this town's layout rng. Defaults to
 * `settlementSeed` for standalone layout-grammar tests.
 */
export function generateSettlement(
  settlementSeed: number,
  center: { x: number; z: number },
  type: SettlementType,
  name: string,
  terrainSeed: number = settlementSeed,
): Settlement {
  const rng = new Rng(settlementSeed >>> 0);
  const g: SpotGate = { seed: terrainSeed, waterSpots: continentWaterSpots(terrainSeed) };
  if (type === 'Village') return buildVillage(settlementSeed, center, name, rng, g);
  if (type === 'City') return buildCity(settlementSeed, center, name, rng, g);
  // Kingdom: a capital City + satellite Villages on an evenly-spaced orbit.
  const capital = buildCity(settlementSeed, center, name, rng, g);
  const satCount = SATELLITE_COUNT_MIN + Math.floor(rng.next() * (SATELLITE_COUNT_MAX - SATELLITE_COUNT_MIN + 1));
  const satellites: Settlement[] = [];
  for (let i = 0; i < satCount; i++) {
    const angle = (i / satCount) * Math.PI * 2 + (rng.next() - 0.5) * 0.5;
    const radius = SATELLITE_RADIUS_MIN + rng.next() * (SATELLITE_RADIUS_MAX - SATELLITE_RADIUS_MIN);
    let cx = center.x + Math.cos(angle) * radius;
    let cz = center.z + Math.sin(angle) * radius;
    const spot = nudge(g, [], cx, cz, 'house');
    if (!spot) continue;
    cx = spot.x;
    cz = spot.z;
    const satRng = new Rng((settlementSeed ^ (0x7a7a + i * 131)) >>> 0);
    satellites.push(buildVillage((settlementSeed ^ (0x7a7a + i * 131)) >>> 0, { x: cx, z: cz }, `${name} Hamlet`, satRng, g));
  }
  return { type: 'Kingdom', name, seed: settlementSeed, center, buildings: capital.buildings, satellites };
}

/**
 * Every settlement on the continent for `seed` (memoized): one per kingdom,
 * with its satellite villages expanded. Deterministic per seed.
 */
export function generateContinentSettlements(seed: number): ContinentSettlements {
  const cached = settlementsCache.get(seed);
  if (cached) return cached;
  const kingdoms = placeKingdoms(seed);
  const settlements: Settlement[] = [];
  for (const k of kingdoms) {
    // terrain seed = the WORLD seed; layout seed = the kingdom's salted seed.
    settlements.push(generateSettlement(k.seed, k.center, 'Kingdom', k.name, seed));
  }
  const out: ContinentSettlements = { kingdoms, settlements };
  settlementsCache.set(seed, out);
  return out;
}

/** Flat diagnostics (tests / debugging): counts by settlement + building kind. */
export function settlementStats(seed: number): {
  kingdoms: number;
  capitals: number;
  villages: number;
  houses: number;
  inns: number;
  chapels: number;
  wells: number;
} {
  const { settlements } = generateContinentSettlements(seed);
  let kingdoms = 0;
  let capitals = 0;
  let villages = 0;
  let houses = 0;
  let inns = 0;
  let chapels = 0;
  let wells = 0;
  const countSettlement = (s: Settlement): void => {
    if (s.type === 'Kingdom') kingdoms++;
    else if (s.type === 'City') capitals++;
    else villages++;
    for (const b of s.buildings) {
      if (b.kind === 'house') houses++;
      else if (b.kind === 'inn') inns++;
      else if (b.kind === 'chapel') chapels++;
      else wells++;
    }
    for (const sat of s.satellites ?? []) countSettlement(sat);
  };
  for (const s of settlements) countSettlement(s);
  return { kingdoms, capitals, villages, houses, inns, chapels, wells };
}
