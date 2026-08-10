import { describe, expect, it } from 'vitest';
import { continentSurface, continentWaterSpots, CONTINENT_LANDING, CONTINENT_SEA_LEVEL, placeKingdoms } from '../src/world/ContinentGrammar';
import { continentCamps, continentTreasures, CONTINENT_MOBS, CONTINENT_NPCS, CONTINENT_QUESTS, CONTINENT_QUEST_ORDER } from '../src/sim/content/continent';
import { MOBS, NPCS, QUESTS } from '../src/sim/data';

const SEED = 20061; // fixed world seed

const dryWaterBiomes = ['Ocean', 'Sea', 'Lake', 'River'];

describe('continent content data integrity', () => {
  it('registers continent mobs in the global MOBS table', () => {
    for (const id of Object.keys(CONTINENT_MOBS)) {
      expect(MOBS[id]).toBeDefined();
      expect(MOBS[id].id).toBe(id);
    }
  });

  it('registers continent NPCs in the global NPCS table', () => {
    for (const id of Object.keys(CONTINENT_NPCS)) {
      expect(NPCS[id]).toBeDefined();
      expect(NPCS[id].id).toBe(id);
    }
  });

  it('registers continent quests in the global QUESTS table', () => {
    for (const id of Object.keys(CONTINENT_QUESTS)) {
      expect(QUESTS[id]).toBeDefined();
      expect(QUESTS[id].id).toBe(id);
    }
  });

  it('every continent mob has valid stats', () => {
    for (const [id, mob] of Object.entries(CONTINENT_MOBS)) {
      expect(mob.id).toBe(id);
      expect(mob.minLevel).toBeGreaterThan(0);
      expect(mob.maxLevel).toBeGreaterThanOrEqual(mob.minLevel);
      expect(mob.hpBase).toBeGreaterThan(0);
      expect(mob.hpPerLevel).toBeGreaterThan(0);
      expect(mob.dmgBase).toBeGreaterThan(0);
      expect(mob.attackSpeed).toBeGreaterThan(0);
      expect(mob.moveSpeed).toBeGreaterThan(0);
      expect(mob.scale).toBeGreaterThan(0);
      if (mob.rare) expect(mob.minLevel).toBe(mob.maxLevel);
    }
  });

  it('every continent quest has valid references', () => {
    for (const [id, quest] of Object.entries(CONTINENT_QUESTS)) {
      expect(quest.id).toBe(id);
      // giver and turn-in NPCs exist in NPCS (merged globally)
      expect(NPCS[quest.giverNpcId]).toBeDefined();
      expect(NPCS[quest.turnInNpcId]).toBeDefined();
      for (const obj of quest.objectives) {
        if (obj.type === 'kill') {
          expect(MOBS[obj.targetMobId]).toBeDefined();
        }
        if (obj.type === 'collect' && obj.itemId) {
          // The item may be sourced from mob drops (common) or ground objects (caches)
          const hasMobDrop = Object.values(CONTINENT_MOBS).some((m) =>
            m.loot.some((l) => l.itemId === obj.itemId && l.questId === id),
          );
          const hasGroundObject = obj.itemId === 'sunken_cache'; // placed as continent treasure caches
          expect(hasMobDrop || hasGroundObject).toBe(true);
        }
        if (obj.type === 'interact' && obj.targetNpcId) {
          expect(NPCS[obj.targetNpcId]).toBeDefined();
        }
      }
      if (quest.requiresQuest) {
        expect(CONTINENT_QUESTS[quest.requiresQuest]).toBeDefined();
      }
    }
  });

  it('continent quest order includes all continent quests', () => {
    const expected = new Set(Object.keys(CONTINENT_QUESTS));
    for (const qid of CONTINENT_QUEST_ORDER) {
      expected.delete(qid);
    }
    expect(expected.size).toBe(0);
  });
});

describe('continent camps (seed-derived)', () => {
  it('is deterministic per seed', () => {
    const a = continentCamps(SEED);
    const b = continentCamps(SEED);
    expect(a).toEqual(b);
  });

  it('produces at least 3 camps (one per kingdom + wild)', () => {
    const camps = continentCamps(SEED);
    expect(camps.length).toBeGreaterThanOrEqual(3);
  });

  it('every camp center is on dry walkable land', () => {
    const camps = continentCamps(SEED);
    const waterSpots = continentWaterSpots(SEED);
    for (const camp of camps) {
      const { h, biome } = continentSurface(camp.center.x, camp.center.z, SEED);
      expect(h).toBeGreaterThan(CONTINENT_SEA_LEVEL + 0.7);
      expect(dryWaterBiomes).not.toContain(biome);
      // Not inside declared water spots
      for (const ws of waterSpots) {
        const d2 = (camp.center.x - ws.x) ** 2 + (camp.center.z - ws.z) ** 2;
        expect(d2).toBeGreaterThanOrEqual(ws.radius * ws.radius);
      }
      expect(camp.radius).toBeGreaterThan(0);
      expect(camp.count).toBeGreaterThan(0);
      // Every camp references a valid mob
      expect(MOBS[camp.mobId]).toBeDefined();
    }
  });
});

describe('continent treasures (seed-derived)', () => {
  it('is deterministic per seed', () => {
    const a = continentTreasures(SEED);
    const b = continentTreasures(SEED);
    expect(a).toEqual(b);
  });

  it('produces at least 6 cache positions', () => {
    const treasures = continentTreasures(SEED);
    const totalPositions = treasures.reduce((sum, t) => sum + t.positions.length, 0);
    expect(totalPositions).toBeGreaterThanOrEqual(6);
  });

  it('every cache treasure has the correct itemId', () => {
    for (const t of continentTreasures(SEED)) {
      expect(t.itemId).toBe('sunken_cache');
      expect(t.positions.length).toBeGreaterThan(0);
    }
  });
});