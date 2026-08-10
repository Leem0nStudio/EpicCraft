// ---------------------------------------------------------------------------
// "Continente por Gramática" v1 — Capa 3 (contenido): mobs, quests y tesoros
// en los reinos generados del continente procedural.
//
// 100% code, 0 assets. Mobs, NPCs y quests son datos estáticos; los camps
// y tesoros se generan del seed (deterministicos, memoizados) usando la
// gramática de la Capa 0 para validar posiciones (terreno seco, no
// empinado, fuera del agua). Cada semilla regenera el mismo continente con
// el mismo contenido.
// ---------------------------------------------------------------------------

import { Rng } from '../rng';
import {
  type ContinentBiome,
  continentSurface,
  continentTooSteep,
  continentWaterSpots,
  CONTINENT_CX,
  CONTINENT_CZ,
  CONTINENT_LANDING,
  CONTINENT_RADIUS,
  CONTINENT_SEA_LEVEL,
  placeKingdoms,
} from '../../world/ContinentGrammar';
import type { CampDef, GroundObjectDef, ItemDef, LootEntry, MobTemplate, NpcDef, QuestDef } from '../types';

// ---------------------------------------------------------------------------
// Mob templates: 6 biome-flavored mobs + 1 rare elite, levels 5-9.
// ---------------------------------------------------------------------------

const COPPER_LOOT: LootEntry = { copper: 12, chance: 1 };
const COPPER_LOOT_SMALL: LootEntry = { copper: 9, chance: 1 };
const COPPER_LOOT_BIG: LootEntry = { copper: 14, chance: 1 };
const COPPER_LOOT_ELITE: LootEntry = { copper: 150, chance: 1 };
const SCALE_CRAB = 0.8;
const SCALE_HOWLER = 0.95;
const SCALE_SERPENT = 1.1;
const SCALE_STALKER = 0.85;
const SCALE_STAG = 1.0;
const SCALE_KRAKEN = 1.5;

export const CONTINENT_MOBS: Record<string, MobTemplate> = {
  coastal_crab: {
    id: 'coastal_crab',
    name: 'Coastal Crab',
    minLevel: 5,
    maxLevel: 7,
    family: 'beast',
    hpBase: 55,
    hpPerLevel: 18,
    dmgBase: 4,
    dmgPerLevel: 1.8,
    attackSpeed: 2.6,
    armorPerLevel: 22,
    moveSpeed: 6,
    aggroRadius: 9,
    loot: [COPPER_LOOT],
    scale: SCALE_CRAB,
    color: 0x2e8b57,
    componentTags: ['hide', 'claw'],
  },
  pine_howler: {
    id: 'pine_howler',
    name: 'Pine Howler',
    minLevel: 5,
    maxLevel: 7,
    family: 'beast',
    hpBase: 52,
    hpPerLevel: 17,
    dmgBase: 4,
    dmgPerLevel: 2.0,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 8.2,
    aggroRadius: 11,
    loot: [COPPER_LOOT],
    scale: SCALE_HOWLER,
    color: 0x5d6d7e,
    componentTags: ['hide', 'fang'],
    packFrenzy: { radius: 12, hasteMult: 1.3, duration: 8 },
  },
  crag_serpent: {
    id: 'crag_serpent',
    name: 'Crag Serpent',
    minLevel: 6,
    maxLevel: 8,
    family: 'reptile',
    hpBase: 70,
    hpPerLevel: 20,
    dmgBase: 5,
    dmgPerLevel: 2.2,
    attackSpeed: 2.2,
    armorPerLevel: 24,
    moveSpeed: 7,
    aggroRadius: 10,
    loot: [COPPER_LOOT_BIG],
    scale: SCALE_SERPENT,
    color: 0x935116,
    componentTags: ['hide', 'fang'],
  },
  dune_stalker: {
    id: 'dune_stalker',
    name: 'Dune Stalker',
    minLevel: 6,
    maxLevel: 8,
    family: 'burrower',
    hpBase: 58,
    hpPerLevel: 18,
    dmgBase: 5,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 16,
    moveSpeed: 8.5,
    aggroRadius: 10,
    loot: [COPPER_LOOT_BIG],
    scale: SCALE_STALKER,
    color: 0xc9a227,
    componentTags: ['hide', 'venomSac'],
  },
  moor_stag: {
    id: 'moor_stag',
    name: 'Moor Stag',
    minLevel: 5,
    maxLevel: 6,
    family: 'beast',
    hpBase: 48,
    hpPerLevel: 16,
    dmgBase: 4,
    dmgPerLevel: 1.9,
    attackSpeed: 2.0,
    armorPerLevel: 14,
    moveSpeed: 9,
    aggroRadius: 8,
    loot: [COPPER_LOOT_SMALL],
    scale: SCALE_STAG,
    color: 0x7b6b4f,
    componentTags: ['hide', 'horn'],
  },
  tide_kraken: {
    id: 'tide_kraken',
    name: 'Tide Kraken',
    minLevel: 9,
    maxLevel: 9,
    family: 'elemental',
    hpBase: 220,
    hpPerLevel: 30,
    dmgBase: 9,
    dmgPerLevel: 3.5,
    attackSpeed: 2.0,
    armorPerLevel: 30,
    moveSpeed: 7.5,
    aggroRadius: 14,
    rare: true,
    loot: [COPPER_LOOT_ELITE, { itemId: 'kraken_pearl', chance: 1, questId: 'q_continent_kraken' }],
    scale: SCALE_KRAKEN,
    color: 0x1b4f72,
  },
};

// ---------------------------------------------------------------------------
// NPC: Mariner Voss at the landing harbour.
// ---------------------------------------------------------------------------

export const CONTINENT_NPCS: Record<string, NpcDef> = {
  mariner_voss: {
    id: 'mariner_voss',
    name: 'Mariner Voss',
    title: 'Harbor Master',
    pos: { x: CONTINENT_LANDING.x + 10, z: CONTINENT_LANDING.z + 6 },
    facing: Math.PI * 0.5,
    color: 0x2471a3,
    questIds: [
      'q_continent_arrival',
      'q_continent_vermin',
      'q_continent_caches',
      'q_continent_wyrm',
      'q_continent_kraken',
    ],
    greeting: 'Welcome ashore, $C. This land is old and restless — keep your wits about you.',
  },
};

// ---------------------------------------------------------------------------
// Quests: a 5-quest chain from arrival through the rare elite.
// ---------------------------------------------------------------------------

export const CONTINENT_QUESTS: Record<string, QuestDef> = {
  q_continent_arrival: {
    id: 'q_continent_arrival',
    name: 'A New Shore',
    giverNpcId: 'mariner_voss',
    turnInNpcId: 'mariner_voss',
    text: 'The seas have carried you to a land few have set foot on. Speak with me again when you are ready — I will mark your map with what I know of these shores.',
    completionText: 'Good. The landing is safe, but the wilds beyond are not. Keep your blade close.',
    objectives: [{ type: 'interact', targetNpcId: 'mariner_voss', count: 1, label: 'Report to Voss' }],
    xpReward: 300,
    copperReward: 100,
    itemRewards: {},
  },
  q_continent_vermin: {
    id: 'q_continent_vermin',
    name: 'Nuisances of the New World',
    giverNpcId: 'mariner_voss',
    turnInNpcId: 'mariner_voss',
    text: 'The local wildlife is not shy. Crabs the size of shields skitter along the southern beaches, and howling packs harry the treeline. Thin their numbers — 6 coastal crabs and 5 pine howlers — and the landing will breathe easier.',
    completionText: 'That is a fine start. The land is learning to fear us.',
    objectives: [
      { type: 'kill', targetMobId: 'coastal_crab', count: 6, label: 'Coastal Crab slain' },
      { type: 'kill', targetMobId: 'pine_howler', count: 5, label: 'Pine Howler slain' },
    ],
    xpReward: 600,
    copperReward: 200,
    itemRewards: {},
    requiresQuest: 'q_continent_arrival',
    minLevel: 5,
  },
  q_continent_caches: {
    id: 'q_continent_caches',
    name: "Explorer's Caches",
    giverNpcId: 'mariner_voss',
    turnInNpcId: 'mariner_voss',
    text: 'The first explorers left behind supply caches scattered across the island — iron rations, survey tools, sealed journals. The salt and the beasts have scattered them. Find 3 caches and bring their contents back.',
    completionText: 'Journals, maps, and a half-bottle of fine Eastbrook brandy. You have earned your share.',
    objectives: [
      { type: 'collect', itemId: 'sunken_cache', count: 3, label: 'Explorer Cache found' },
    ],
    xpReward: 500,
    copperReward: 175,
    itemRewards: {},
    requiresQuest: 'q_continent_arrival',
    minLevel: 5,
  },
  q_continent_wyrm: {
    id: 'q_continent_wyrm',
    name: 'The Crag Serpents',
    giverNpcId: 'mariner_voss',
    turnInNpcId: 'mariner_voss',
    text: 'The crags above the north ridge are crawling with rock serpents — mean-tempered, poison-breathed, and bold enough to slither into the landing at night. Kill 5 of them and the ridge road will be passable again.',
    completionText: 'The ridge road is clear. The serpents will think twice before coming down again.',
    objectives: [
      { type: 'kill', targetMobId: 'crag_serpent', count: 5, label: 'Crag Serpent slain' },
    ],
    xpReward: 700,
    copperReward: 250,
    itemRewards: {},
    requiresQuest: 'q_continent_vermin',
    minLevel: 6,
  },
  q_continent_kraken: {
    id: 'q_continent_kraken',
    name: 'Tide Devil',
    giverNpcId: 'mariner_voss',
    turnInNpcId: 'mariner_voss',
    text: 'The old sailors speak of a kraken that nests in the shallows of the eastern lagoon. It has dragged two fishing skiffs to the depths this moon alone. Find it, kill it, and bring me a pearl from its mantle as proof.',
    completionText: 'By the tides, you did it. That pearl will hang over the harbour gate — a warning to anything that hunts these waters.',
    objectives: [
      { type: 'collect', itemId: 'kraken_pearl', count: 1, label: 'Kraken Pearl' },
    ],
    xpReward: 1000,
    copperReward: 400,
    itemRewards: {},
    requiresQuest: 'q_continent_wyrm',
    minLevel: 7,
    suggestedPlayers: 2,
  },
};

export const CONTINENT_QUEST_ORDER: string[] = [
  'q_continent_arrival',
  'q_continent_vermin',
  'q_continent_caches',
  'q_continent_wyrm',
  'q_continent_kraken',
];

// ---------------------------------------------------------------------------
// Items: two quest items for the continent.
// ---------------------------------------------------------------------------

export const CONTINENT_ITEMS: Record<string, ItemDef> = {
  sunken_cache: {
    id: 'sunken_cache',
    name: "Explorer's Cache",
    kind: 'quest',
    sellValue: 0,
    questId: 'q_continent_caches',
  },
  kraken_pearl: {
    id: 'kraken_pearl',
    name: 'Kraken Pearl',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_continent_kraken',
  },
};

// ---------------------------------------------------------------------------
// Biome -> mobId mapping for camp placement.
// ---------------------------------------------------------------------------

function mobForBiome(biome: ContinentBiome): string {
  switch (biome) {
    case 'Ocean':
    case 'Sea':
      return 'coastal_crab';
    case 'Mountain':
      return 'crag_serpent';
    case 'Hill':
      return 'pine_howler';
    case 'Plains':
      return 'moor_stag';
    case 'Forest':
      return 'pine_howler';
    case 'Desert':
      return 'dune_stalker';
    default:
      return 'coastal_crab';
  }
}

// ---------------------------------------------------------------------------
// Placement validation: same gates as placeKingdoms (dry, non-water, not
// too steep, away from landing and declared water spots).
// ---------------------------------------------------------------------------

interface PlacementGate {
  waterSpots: { x: number; z: number; radius: number }[];
  seed: number;
}

const VALID_MAX_SLOPE = 0.55;
const LANDING_CLEAR = 20;
const SEABED_MIN = CONTINENT_SEA_LEVEL + 0.9;

function spotOk(g: PlacementGate, x: number, z: number): boolean {
  const { h, biome } = continentSurface(x, z, g.seed);
  if (h < SEABED_MIN) return false;
  if (biome === 'Ocean' || biome === 'Sea' || biome === 'Lake' || biome === 'River') return false;
  if (g.waterSpots.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.radius * s.radius)) return false;
  if ((x - CONTINENT_LANDING.x) ** 2 + (z - CONTINENT_LANDING.z) ** 2 < LANDING_CLEAR ** 2) return false;
  return !continentTooSteep(x, z, g.seed, VALID_MAX_SLOPE);
}

/** Try a golden-angle spiral for a given radius range to find a valid spot. */
function nudgeToDry(
  g: PlacementGate,
  cx: number,
  cz: number,
  minR: number,
  maxR: number,
  maxSteps: number,
): { x: number; z: number } | null {
  const GOLDEN = 2.399963229728653;
  for (let k = 0; k < maxSteps; k++) {
    const r = minR + (maxR - minR) * (k / maxSteps);
    const a = GOLDEN * k;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (spotOk(g, x, z)) return { x, z };
  }
  return null;
}

/** Try random points on the island using a seeded rng. */
function randomSpotOnIsland(rng: Rng, g: PlacementGate): { x: number; z: number } | null {
  for (let k = 0; k < 120; k++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = 42 + rng.next() * (CONTINENT_RADIUS - 60);
    const x = CONTINENT_CX + Math.cos(ang) * rad;
    const z = CONTINENT_CZ + Math.sin(ang) * rad;
    if (spotOk(g, x, z)) return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------------------
// continentCamps: seed-derived camps around each kingdom + wild + rare.
// ---------------------------------------------------------------------------

const campsCache = new Map<number, CampDef[]>();

export function continentCamps(seed: number): CampDef[] {
  const cached = campsCache.get(seed);
  if (cached) return cached;

  const rng = new Rng((seed ^ 0xc4a7) >>> 0);
  const g: PlacementGate = { seed, waterSpots: continentWaterSpots(seed) };
  const kingdoms = placeKingdoms(seed);
  const out: CampDef[] = [];

  // Per-kingdom guardian camp: one pack of the kingdom's biome-matched mob
  for (const k of kingdoms) {
    const { biome } = continentSurface(k.center.x, k.center.z, seed);
    const mobId = mobForBiome(biome);
    const spot = nudgeToDry(g, k.center.x, k.center.z, 14, 22, 16);
    if (!spot) continue;
    const count = 2 + Math.floor(rng.next() * 2); // 2-3
    out.push({ mobId, center: spot, radius: 10, count });
  }

  // Wild camps: 3 biome-typed camps scattered across the island
  for (let i = 0; i < 3; i++) {
    const spot = randomSpotOnIsland(rng, g);
    if (!spot) continue;
    const { biome } = continentSurface(spot.x, spot.z, seed);
    const mobId = mobForBiome(biome);
    const count = 3 + Math.floor(rng.next() * 2); // 3-4
    out.push({ mobId, center: spot, radius: 8, count });
  }

  // Rare camp: Tide Kraken near the first river mouth or a lagoon
  const waterSpots = continentWaterSpots(seed);
  if (waterSpots.length > 0) {
    const mouth = waterSpots[0]; // first river mouth / lagoon
    const spot = nudgeToDry(g, mouth.x, mouth.z, 8, 28, 20);
    if (spot) {
      out.push({ mobId: 'tide_kraken', center: spot, radius: 4, count: 1 });
    }
  }

  campsCache.set(seed, out);
  return out;
}

// ---------------------------------------------------------------------------
// continentTreasures: seed-derived cache ground objects.
// ---------------------------------------------------------------------------

const treasuresCache = new Map<number, GroundObjectDef[]>();

export function continentTreasures(seed: number): GroundObjectDef[] {
  const cached = treasuresCache.get(seed);
  if (cached) return cached;

  const rng = new Rng((seed ^ 0xc4a8) >>> 0);
  const g: PlacementGate = { seed, waterSpots: continentWaterSpots(seed) };
  const kingdoms = placeKingdoms(seed);
  const positions: { x: number; z: number }[] = [];

  // Per-kingdom cache cluster: 3 caches in a ring around the kingdom
  for (const k of kingdoms) {
    let placed = 0;
    for (let attempt = 0; attempt < 12 && placed < 3; attempt++) {
      const ang = rng.next() * Math.PI * 2;
      const r = 14 + rng.next() * 12;
      const x = k.center.x + Math.cos(ang) * r;
      const z = k.center.z + Math.sin(ang) * r;
      if (!spotOk(g, x, z)) continue;
      positions.push({ x, z });
      placed++;
    }
  }

  // Wild caches: 3 scattered across the island
  for (let i = 0; i < 3; i++) {
    const spot = randomSpotOnIsland(rng, g);
    if (!spot) continue;
    positions.push({ x: spot.x, z: spot.z });
  }

  const out: GroundObjectDef[] = [
    {
      itemId: 'sunken_cache',
      name: "Explorer's Cache",
      positions,
    },
  ];

  treasuresCache.set(seed, out);
  return out;
}