import { describe, expect, it } from 'vitest';
import {
  continentSurface,
  continentWaterSpots,
  placeKingdoms,
  CONTINENT_LANDING,
  CONTINENT_SEA_LEVEL,
} from '../src/world/ContinentGrammar';
import {
  generateContinentSettlements,
  generateSettlement,
  settlementStats,
  type Settlement,
  type SettlementBuilding,
} from '../src/world/SettlementGenerator';

// Layer 2 of "Continente por Gramática v1": ASENTAMIENTOS. Towns grow from a
// nucleus — City = castle + 3 rings of houses, Village = plaza + circle of
// houses, Kingdom = capital + satellite villages — with 3 house variants, all
// deterministically nudged onto dry, non-steep, non-overlapping ground.

const SEED = 20061; // the fixed world seed (main.ts WORLD_SEED)

function allBuildings(settlements: Settlement[]): SettlementBuilding[] {
  const out: SettlementBuilding[] = [];
  for (const s of settlements) {
    out.push(...s.buildings);
    for (const sat of s.satellites ?? []) out.push(...sat.buildings);
  }
  return out;
}

const dryWaterBiomes = ['Ocean', 'Sea', 'Lake', 'River'];

describe('kingdom placement (Layer 0 tail)', () => {
  it('places 3-7 kingdoms deterministically', () => {
    const a = placeKingdoms(SEED);
    const b = placeKingdoms(SEED);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(7);
  });

  it('keeps kingdoms far apart and on dry walkable ground', () => {
    const kingdoms = placeKingdoms(SEED);
    const waterSpots = continentWaterSpots(SEED);
    for (let i = 0; i < kingdoms.length; i++) {
      for (let j = i + 1; j < kingdoms.length; j++) {
        const d = Math.hypot(
          kingdoms[i].center.x - kingdoms[j].center.x,
          kingdoms[i].center.z - kingdoms[j].center.z,
        );
        expect(d).toBeGreaterThanOrEqual(60);
      }
      const { h, biome } = continentSurface(kingdoms[i].center.x, kingdoms[i].center.z, SEED);
      expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL + 0.7);
      expect(dryWaterBiomes).not.toContain(biome);
      const k = kingdoms[i].center;
      expect(
        waterSpots.some((s) => (k.x - s.x) ** 2 + (k.z - s.z) ** 2 < s.radius * s.radius),
      ).toBe(false);
      // Keep the portal harbour approach clear.
      expect(Math.hypot(k.x - CONTINENT_LANDING.x, k.z - CONTINENT_LANDING.z)).toBeGreaterThan(40);
    }
  });

  it('gives every kingdom a unique salted settlement seed and a name', () => {
    const kingdoms = placeKingdoms(SEED);
    const seeds = new Set(kingdoms.map((k) => k.seed));
    expect(seeds.size).toBe(kingdoms.length);
    for (const k of kingdoms) expect(k.name.length).toBeGreaterThan(0);
  });
});

describe('settlement determinism + counts', () => {
  it('is byte-identical across calls for the same seed', () => {
    expect(generateContinentSettlements(SEED)).toEqual(generateContinentSettlements(SEED));
  });

  it('grows one Kingdom settlement per kingdom, each with a capital + villages', () => {
    const { kingdoms, settlements } = generateContinentSettlements(SEED);
    expect(settlements.length).toBe(kingdoms.length);
    const stats = settlementStats(SEED);
    expect(stats.kingdoms).toBe(kingdoms.length);
    // each kingdom has 2-3 satellite villages
    for (const s of settlements) {
      expect(s.type).toBe('Kingdom');
      expect(s.satellites!.length).toBeGreaterThanOrEqual(2);
      expect(s.satellites!.length).toBeLessThanOrEqual(3);
    }
    expect(stats.villages).toBeGreaterThanOrEqual(stats.kingdoms * 2);
    // every settlement has at least a castle/plaza and houses
    expect(stats.chapels).toBe(stats.kingdoms); // one castle per capital
    expect(stats.houses).toBeGreaterThan(0);
  });
});

describe('village grammar', () => {
  it('places a well plaza at the centre with houses around a circle', () => {
    // Anchor on a real kingdom nucleus (guaranteed valid ground).
    const k = placeKingdoms(SEED)[0];
    const v = generateSettlement(k.seed, k.center, 'Village', 'Test Hamlet', SEED);
    const well = v.buildings.find((b) => b.kind === 'well')!;
    expect(well).toBeDefined();
    // plaza is at the centre
    expect(Math.hypot(well.x - k.center.x, well.z - k.center.z)).toBeLessThan(4);
    const houses = v.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeGreaterThanOrEqual(7);
    for (const h of houses) {
      const d = Math.hypot(h.x - k.center.x, h.z - k.center.z);
      expect(d).toBeGreaterThan(6); // around the plaza, not on it
      expect(d).toBeLessThan(20);
    }
  });

  it('keeps every building on dry, non-steep, non-overlapping ground', () => {
    const k = placeKingdoms(SEED)[0];
    const v = generateSettlement(k.seed, k.center, 'Village', 'Test', SEED);
    const waterSpots = continentWaterSpots(SEED);
    for (const b of v.buildings) {
      const { h, biome } = continentSurface(b.x, b.z, SEED);
      expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL + 0.5);
      expect(dryWaterBiomes).not.toContain(biome);
      expect(
        waterSpots.some((s) => (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < s.radius * s.radius),
      ).toBe(false);
    }
    for (let i = 0; i < v.buildings.length; i++) {
      for (let j = i + 1; j < v.buildings.length; j++) {
        const d = Math.hypot(
          v.buildings[i].x - v.buildings[j].x,
          v.buildings[i].z - v.buildings[j].z,
        );
        expect(d).toBeGreaterThan(4.5);
      }
    }
  });
});

describe('city grammar', () => {
  it('has a castle at the centre, 3 house rings, an inn and a well', () => {
    const k = placeKingdoms(SEED)[0];
    const c = generateSettlement(k.seed, k.center, 'City', 'Test City', SEED);
    const castle = c.buildings.find((b) => b.kind === 'chapel')!;
    expect(castle).toBeDefined();
    expect(Math.hypot(castle.x - k.center.x, castle.z - k.center.z)).toBeLessThan(3);
    expect(c.buildings.some((b) => b.kind === 'inn')).toBe(true);
    expect(c.buildings.some((b) => b.kind === 'well')).toBe(true);
    const houses = c.buildings.filter((b) => b.kind === 'house');
    expect(houses.length).toBeGreaterThanOrEqual(24); // 6 + 10 + 14 minus inn/well slots
    // houses occupy three radial bands away from the castle
    const rings = houses
      .map((h) => Math.hypot(h.x - k.center.x, h.z - k.center.z))
      .sort((a, b) => a - b);
    const outer = rings[rings.length - 1];
    expect(outer).toBeGreaterThan(20); // third ring reaches out
    expect(rings[0]).toBeGreaterThan(8); // inner ring stays off the castle
    // house variants stay within the 3-family set
    for (const h of houses) {
      expect(['Cottage', 'WoodHouse', 'StoneHouse']).toContain(h.variant);
    }
  });
});

describe('whole-continent settlements', () => {
  it('places every building on valid ground away from the landing', () => {
    const { settlements } = generateContinentSettlements(SEED);
    const buildings = allBuildings(settlements);
    expect(buildings.length).toBeGreaterThan(40);
    for (const b of buildings) {
      // dry + not a declared water biome
      const { h, biome } = continentSurface(b.x, b.z, SEED);
      expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL + 0.5);
      expect(dryWaterBiomes).not.toContain(biome);
      // away from the portal landing
      expect(Math.hypot(b.x - CONTINENT_LANDING.x, b.z - CONTINENT_LANDING.z)).toBeGreaterThan(12);
    }
  });

  it('never overlaps buildings anywhere on the island', () => {
    const { settlements } = generateContinentSettlements(SEED);
    const buildings = allBuildings(settlements);
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const d = Math.hypot(
          buildings[i].x - buildings[j].x,
          buildings[i].z - buildings[j].z,
        );
        expect(d).toBeGreaterThan(4.5);
      }
    }
  });
});
