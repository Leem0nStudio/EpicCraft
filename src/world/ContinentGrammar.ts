// ---------------------------------------------------------------------------
// "Continente por Gramática" v1 — Capa 0 (el continente).
//
// 100% code, 0 assets: the far continent is a pure, deterministic function of
// (x, z, seed), exactly like the overworld heightfield, so the sim (ground
// clamping, movement, swimming) and the renderer (mesh, water) always agree on
// where the ground is. Nothing here touches three/DOM/rng-globals: every rule
// is seeded through the same Rng/fbm2 primitives the sim uses, so a given world
// seed always regenerates the identical island.
//
// The continent lives in its own far-east coordinate band (x >= CONTINENT_X_MIN,
// past the Yumi maze band, see src/sim/data.ts) reached through a portal near
// the starting town. Layer 0 produces the landmass: height, biomes, rivers.
// Layer 1 (poisson-populated props) and Layer 2 (settlements) build on this.
//
// ALTURA + RÍOS (this pass): the heightfield is the "skeleton" (island falloff
// + fbm relief + a guaranteed-dry harbour plateau). Rivers then CARVE it:
// "mountain peak -> flows downhill -> ends in the sea", exactly the Layer 0
// grammar rule. Each traced river digs a V-valley into the island (dry bed
// upstream, wet channel reading as the 'River' biome), dives below sea level
// at its mouth (a small lagoon the ocean plane fills), and may be born in a
// mountain tarn (a below-sea bowl the water plane fills as a lake). The carve
// field is a coarse per-seed grid computed once and lazily memoized, so the
// per-sample cost of the heightfield stays O(1) — the sim and the chunked
// terrain renderer can sample it every frame/vertex without a hot-loop blowup.
// ---------------------------------------------------------------------------

import { Rng, fbm2, hash2 } from '../sim/rng';

// The far continent band boundaries, canonical here (the sim band dispatchers in
// data.ts re-export them; the grammar needs them at module scope because the
// content layer (sim/content/continent.ts) also imports this module, so they
// cannot live in data.ts without a module cycle through the content layer).
export const CONTINENT_X_MIN = 12000;
export const CONTINENT_X_MAX = 12800;

// True inside the continent band. Dispatches on this are centralised in the
// grammar so data.ts re-exports this function for sim-level consumers.
export function isContinentPos(x: number): boolean {
  return x >= CONTINENT_X_MIN && x < CONTINENT_X_MAX;
}

export type ContinentBiome =
  | 'Ocean'
  | 'Sea'
  | 'Lake'
  | 'River'
  | 'Mountain'
  | 'Hill'
  | 'Plains'
  | 'Forest'
  | 'Desert';

// ---------------------------------------------------------------------------
// Band + island tuning. Kept here (next to the rules that use them) so the
// world generator is self-contained; data.ts owns the band boundary constants
// (CONTINENT_X_MIN/MAX) that the sim/runtime dispatch on.
// ---------------------------------------------------------------------------

// Island center within the band.
export const CONTINENT_CX = (CONTINENT_X_MIN + CONTINENT_X_MAX) / 2;
export const CONTINENT_CZ = 0;
// Island radius: walkable landmass radius (the sea starts just past this).
export const CONTINENT_RADIUS = 260;
// Sea level matches the built-in world's water surface (world.ts WATER_LEVEL)
// so the ocean ring around the island sits at the same height as overworld
// lakes and the renderer's water plane.
export const CONTINENT_SEA_LEVEL = -4.5;
// Elevation tuning: base shelf + mountain amplitude + peak bonus at the core.
const CONTINENT_BASE = 6;
const CONTINENT_AMP = 18;
const CONTINENT_PEAK = 10;
// Flat harbor plateau at the portal landing (guaranteed dry + walkable).
export const CONTINENT_LANDING = { x: CONTINENT_CX, z: CONTINENT_CZ + 40 };
const CONTINENT_LANDING_HEIGHT = 2.5;
const CONTINENT_LANDING_RADIUS = 18;

// ---------------------------------------------------------------------------
// River-carve tuning. The bed is a V-shaped valley across the channel width;
// its depth grows downstream so the mouth dives below sea level (the ocean
// water plane fills it), while upstream the bed stays dry and reads as the
// 'River' biome. A traced river may also end in a mountain tarn.
// ---------------------------------------------------------------------------
const RIVER_HALF_W = 7; // channel half-width, bank to centerline (u)
const RIVER_CARVE_SOURCE = 2.6; // dry-valley carve depth at the source (u)
const RIVER_CARVE_MOUTH = 5.6; // carve at the mouth — pushes below sea level
const RIVER_LAGOON_R = 8; // below-sea window around the mouth (u)
const RIVER_DECIMATE = 3; // keep every Nth trace point for the carve field
const LAKE_CARVE = 3.2; // tarn bowl floor depth below the surrounding shelf
const FIELD_CELL = 4; // carve-field cell size (u); bilinear-sampled

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));


// The heightfield WITHOUT river carving: island falloff + fbm relief, a
// guaranteed-dry harbor plateau at the portal landing, and a gently deepening
// seabed ring beyond the coast (so the ocean is swimmable, like a real lake).
// Rivers are traced against this skeleton (never against the carved surface,
// or the trace would feed back into its own channel).
function baseContinentHeightAt(x: number, z: number, seed: number): number {
  const dx = x - CONTINENT_CX;
  const dz = z - CONTINENT_CZ;
  const d = Math.hypot(dx, dz);
  // Island falloff: 1 near the core, 0 past the coast (with a soft beach band).
  const falloff = 1 - smoothstep(CONTINENT_RADIUS * 0.6, CONTINENT_RADIUS * 1.05, d);
  // Relief: a coarse skeleton drives mountains/valleys, a fine layer adds crags.
  const core = 1 - smoothstep(0, CONTINENT_RADIUS * 0.5, d); // 1 at the very center
  const skeleton = fbm2(x * 0.015, z * 0.015, seed, 4) - 0.5;
  const detail = fbm2(x * 0.07, z * 0.07, seed + 7, 2) - 0.5;
  let h = falloff * (CONTINENT_BASE + skeleton * CONTINENT_AMP + detail * 2) + core * CONTINENT_PEAK;
  // Seabed: only beyond the coast, clamp down to a deepening ocean floor.
  // The `d > CONTINENT_RADIUS` gate is load-bearing: an ungated min with the
  // below-sea constant clamps the ENTIRE island down to sea level (the coast
  // falloff already carries shoreline heights below the waterline on its own),
  // flattening the landmass into a pancake and starving the river peak hunt.
  const beyond = d - CONTINENT_RADIUS;
  if (beyond > 0) h = Math.min(h, CONTINENT_SEA_LEVEL - 2 - beyond * 0.2);
  // Harbor plateau: flatten the landing into a dry, walkable shelf. The
  // smoothstep runs 6 -> RADIUS (0 at the centre, 1 at the rim): a reversed
  // a/b would leave the landing centre on the raw mountain and only blend the
  // rim, stranding the portal gate on a cliff face.
  const ldx = x - CONTINENT_LANDING.x;
  const ldz = z - CONTINENT_LANDING.z;
  const ld = Math.hypot(ldx, ldz);
  if (ld < CONTINENT_LANDING_RADIUS) {
    const t = smoothstep(6, CONTINENT_LANDING_RADIUS, ld);
    h = h * t + CONTINENT_LANDING_HEIGHT * (1 - t);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Rivers — the grammar rule "mountain peak -> flows downhill -> ends in the
// sea (or a mountain tarn)". Deterministic: seeded peak hunt on the coarse
// relief, then a greedy steepest-descent walk on the (uncarved) heightfield.
// The full river set per seed is memoized: the carve field, the heightfield
// and the biome classifier all draw from the same cached polylines, so a seed
// always regenerates the identical island AND the identical rivers.
// ---------------------------------------------------------------------------

export interface RiverPath {
  points: { x: number; z: number }[];
  /** Mountain tarn the river was born in, or null when it began on a slope. */
  lake: { x: number; z: number; radius: number } | null;
  /** Where the river meets the sea (its last traced point). */
  mouth: { x: number; z: number };
}

const RIVER_COUNT = 4;
const RIVER_STEP = 2.5;
const RIVER_MAX_STEPS = 400;

const riversCache = new Map<number, RiverPath[]>();

function riversFor(seed: number): RiverPath[] {
  let rivers = riversCache.get(seed);
  if (rivers) return rivers;
  const rng = new Rng((seed ^ 0x51d3) >>> 0);
  // Peak hunt on a coarse grid: candidates must sit on tall inland ground.
  const peaks: { x: number; z: number; h: number }[] = [];
  const gridStep = 26;
  for (let gx = CONTINENT_CX - CONTINENT_RADIUS; gx <= CONTINENT_CX + CONTINENT_RADIUS; gx += gridStep) {
    for (let gz = CONTINENT_CZ - CONTINENT_RADIUS; gz <= CONTINENT_CZ + CONTINENT_RADIUS; gz += gridStep) {
      const h = baseContinentHeightAt(gx, gz, seed);
      if (h < 10) continue; // only high peaks can birth rivers
      const n = baseContinentHeightAt(gx + gridStep, gz, seed);
      const s = baseContinentHeightAt(gx - gridStep, gz, seed);
      const e = baseContinentHeightAt(gx, gz + gridStep, seed);
      const w = baseContinentHeightAt(gx, gz - gridStep, seed);
      if (h >= n && h >= s && h >= e && h >= w) peaks.push({ x: gx, z: gz, h });
    }
  }
  peaks.sort((a, b) => b.h - a.h);
  // Pick up to RIVER_COUNT peaks, spaced apart so rivers don't all merge.
  const chosen: { x: number; z: number }[] = [];
  for (const p of peaks) {
    if (chosen.length >= RIVER_COUNT) break;
    if (chosen.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > 90)) chosen.push({ x: p.x, z: p.z });
  }
  // Even with a sparse peak grid, keep deterministic fallback sources so a
  // seed always yields rivers.
  while (chosen.length < RIVER_COUNT) {
    const a = rng.next() * Math.PI * 2;
    const r = CONTINENT_RADIUS * (0.15 + rng.next() * 0.5);
    chosen.push({ x: CONTINENT_CX + Math.cos(a) * r, z: CONTINENT_CZ + Math.sin(a) * r });
  }
  rivers = chosen.map((p) => traceRiver(p.x, p.z, seed));
  riversCache.set(seed, rivers);
  return rivers;
}

function traceRiver(sx: number, sz: number, seed: number): RiverPath {
  const points: { x: number; z: number }[] = [{ x: sx, z: sz }];
  let x = sx;
  let z = sz;
  let lake: { x: number; z: number; radius: number } | null = null;
  for (let i = 0; i < RIVER_MAX_STEPS; i++) {
    const h = baseContinentHeightAt(x, z, seed);
    if (h <= CONTINENT_SEA_LEVEL + 0.4) break; // reached the sea
    // Greedy steepest descent over an 8-direction fan.
    let bestX = x;
    let bestZ = z;
    let bestH = h;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const nx = x + Math.cos(a) * RIVER_STEP;
      const nz = z + Math.sin(a) * RIVER_STEP;
      const nh = baseContinentHeightAt(nx, nz, seed);
      if (nh < bestH) {
        bestH = nh;
        bestX = nx;
        bestZ = nz;
      }
    }
    if (bestH >= h) {
      // Local pit: the river's source is a mountain tarn. Radius is a stable
      // hash of the pit (the peak-hunt rng stream is shared, so a per-river
      // draw would be order-dependent).
      const radius = 7 + Math.floor(hash2(Math.round(x), Math.round(z), seed) * 48) / 10;
      lake = { x, z, radius };
      break;
    }
    x = bestX;
    z = bestZ;
    points.push({ x, z });
  }
  return { points, lake, mouth: points[points.length - 1] };
}

/** Every river's deterministically carved water: mouth lagoons + source tarns. */
export function continentWaterSpots(seed: number): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = [];
  for (const r of riversFor(seed)) {
    out.push({ x: r.mouth.x, z: r.mouth.z, radius: RIVER_LAGOON_R + 2 });
    if (r.lake) out.push({ x: r.lake.x, z: r.lake.z, radius: r.lake.radius });
  }
  return out;
}

/** Public access to the memoized river set (deterministic per seed). */
export function generateRivers(seed: number): RiverPath[] {
  return riversFor(seed);
}

// ---------------------------------------------------------------------------
// The carve field: a coarse grid over the band carrying, per cell, the squared
// distance to the nearest (decimated) river polyline with the along-path t of
// the nearest point, plus distances to river mouths and tarn centers. Built
// once per seed and bilinear-sampled, so the heightfield/biome stay O(1) per
// sample no matter how many rivers exist.
// ---------------------------------------------------------------------------

interface CarveField {
  w: number;
  h: number;
  ox: number;
  oz: number;
  d2: Float32Array; // min squared distance to a river polyline
  t: Float32Array; // along-path t of the nearest river point (0 source, 1 mouth)
  mouthD2: Float32Array; // min squared distance to a river mouth
  lakeD2: Float32Array; // min squared distance to a tarn center
  lakeR2: Float32Array; // the nearest tarn's squared radius
}

const carveFields = new Map<number, CarveField>();

function carveFieldFor(seed: number): CarveField {
  const cached = carveFields.get(seed);
  if (cached) return cached;
  const rivers = riversFor(seed);
  // Decimate each polyline (the carve blends across the channel width, so a
  // 7.5u chord captures the valley shape with a fraction of the segment count).
  const segs: { ax: number; az: number; bx: number; bz: number; t0: number; t1: number }[] = [];
  const mouths: { x: number; z: number }[] = [];
  const lakes: { x: number; z: number; radius: number }[] = [];
  for (const r of rivers) {
    const pts = r.points;
    const n = pts.length - 1;
    for (let i = 0; i < n; i += RIVER_DECIMATE) {
      const a = pts[i];
      const b = pts[Math.min(i + RIVER_DECIMATE, n)];
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, t0: i / n, t1: Math.min(i + RIVER_DECIMATE, n) / n });
    }
    mouths.push(r.mouth);
    if (r.lake) lakes.push(r.lake);
  }
  const pad = RIVER_HALF_W + 8;
  const ox = CONTINENT_X_MIN - pad;
  const oz = -(CONTINENT_RADIUS + pad);
  const w = Math.ceil((CONTINENT_X_MAX - CONTINENT_X_MIN + pad * 2) / FIELD_CELL) + 1;
  const h = Math.ceil((CONTINENT_RADIUS + pad) * 2 / FIELD_CELL) + 1;
  const d2 = new Float32Array(w * h);
  const t = new Float32Array(w * h);
  const mouthD2 = new Float32Array(w * h);
  const lakeD2 = new Float32Array(w * h);
  const lakeR2 = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ox + i * FIELD_CELL;
      const z = oz + j * FIELD_CELL;
      let best = Infinity;
      let bestT = 0;
      for (const s of segs) {
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz || 1e-9;
        const u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
        const qx = x - (s.ax + u * dx);
        const qz = z - (s.az + u * dz);
        const q2 = qx * qx + qz * qz;
        if (q2 < best) {
          best = q2;
          bestT = s.t0 + u * (s.t1 - s.t0);
        }
      }
      const k = j * w + i;
      d2[k] = best;
      t[k] = bestT;
      let md = Infinity;
      let ld = Infinity;
      let lr2 = Infinity;
      for (const m of mouths) {
        const qx = x - m.x;
        const qz = z - m.z;
        const q2 = qx * qx + qz * qz;
        if (q2 < md) md = q2;
      }
      for (const l of lakes) {
        const qx = x - l.x;
        const qz = z - l.z;
        const q2 = qx * qx + qz * qz;
        if (q2 < ld) {
          ld = q2;
          lr2 = l.radius * l.radius;
        }
      }
      mouthD2[k] = md;
      lakeD2[k] = ld;
      lakeR2[k] = lr2;
    }
  }
  const field: CarveField = { w, h, ox, oz, d2, t, mouthD2, lakeD2, lakeR2 };
  carveFields.set(seed, field);
  return field;
}

interface FieldSample {
  d2: number;
  t: number;
  mouthD2: number;
  lakeD2: number;
  lakeR2: number;
}

function fieldSample(x: number, z: number, seed: number): FieldSample {
  const f = carveFieldFor(seed);
  const gx = (x - f.ox) / FIELD_CELL;
  const gz = (z - f.oz) / FIELD_CELL;
  const i0 = Math.max(0, Math.min(f.w - 1, Math.floor(gx)));
  const j0 = Math.max(0, Math.min(f.h - 1, Math.floor(gz)));
  const i1 = Math.min(f.w - 1, i0 + 1);
  const j1 = Math.min(f.h - 1, j0 + 1);
  const fx = gx - i0;
  const fz = gz - j0;
  const sample = (arr: Float32Array): number => {
    const a = arr[j0 * f.w + i0];
    const b = arr[j0 * f.w + i1];
    const c = arr[j1 * f.w + i0];
    const d = arr[j1 * f.w + i1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  return { d2: sample(f.d2), t: sample(f.t), mouthD2: sample(f.mouthD2), lakeD2: sample(f.lakeD2), lakeR2: sample(f.lakeR2) };
}

// Carve the base height along the river channel / tarn bowl of the field
// sample. Returns the final surface height.
function carveHeight(base: number, x: number, z: number, s: FieldSample): number {
  const riverDist = Math.sqrt(s.d2);
  let carve = 0;
  if (riverDist < RIVER_HALF_W) {
    const shape = smoothstep(RIVER_HALF_W, 1.2, riverDist); // 1 at centerline, 0 at banks
    const depth = RIVER_CARVE_SOURCE + (RIVER_CARVE_MOUTH - RIVER_CARVE_SOURCE) * clamp01(s.t);
    carve = shape * depth;
  }
  const lakeDist = Math.sqrt(s.lakeD2);
  const lakeR = Math.sqrt(s.lakeR2);
  const inTarn = lakeDist < lakeR;
  if (inTarn) {
    // Dig a bowl down to just below sea level so the ocean water plane fills
    // the tarn as a mountain lake.
    const bowl = 1 - smoothstep(lakeR * 0.55, lakeR, lakeDist);
    carve = Math.max(carve, bowl * Math.max(0, base - (CONTINENT_SEA_LEVEL - 1.2)));
  }
  let h = base - carve;
  // The mouth lagoon and tarns may dip below sea level (real water); anywhere
  // else the bed stays dry so the sim never reads "swim water" off the island.
  const lagoon = Math.sqrt(s.mouthD2) < RIVER_LAGOON_R;
  if (!lagoon && !inTarn) h = Math.max(h, CONTINENT_SEA_LEVEL + 0.3);
  // The harbor plateau must stay pristine (a dry, walkable arrival shelf), so
  // re-blend the carved surface back toward the base inside the landing disc.
  const ldx = x - CONTINENT_LANDING.x;
  const ldz = z - CONTINENT_LANDING.z;
  const ld = Math.hypot(ldx, ldz);
  if (ld < CONTINENT_LANDING_RADIUS) {
    const t = smoothstep(6, CONTINENT_LANDING_RADIUS, ld);
    h = h * t + base * (1 - t);
  }
  return h;
}

// Biome from the carved height + the field sample. Coherent by construction:
// water first (below sea level is Ocean; tarn shores read Lake), the river
// channel reads River, then height + moisture drive Mountain/Hill/Forest/
// Desert/Plains, and the landing harbor stays Plains.
function classifyBiome(h: number, s: FieldSample, seed: number, x: number, z: number): ContinentBiome {
  if (h < CONTINENT_SEA_LEVEL + 0.5) return 'Ocean';
  if (s.lakeD2 < s.lakeR2) return 'Lake';
  // The carved channel reads River along its whole course — the dry bed
  // upstream included, so the watercourse is visible (and prop-free) from the
  // source tarn to the sea. No height cap: a high-altitude mountain river is
  // still a river, and only the below-sea mouth/lagoons fall out to Ocean
  // above. (The bed is dry by construction everywhere the sim would read it
  // as walkable; the renderer's water planes key off continentWaterSpots.)
  if (s.d2 < RIVER_HALF_W * RIVER_HALF_W) return 'River';
  const moisture = fbm2(x * 0.03, z * 0.03, seed + 31, 3);
  if (h > 14) return 'Mountain';
  if (h > 9) return 'Hill';
  if (moisture > 0.65 && h > 4) return 'Forest';
  if (moisture < 0.3) return 'Desert';
  return 'Plains';
}

// The heightfield. Pure function of (x, z, seed): the base skeleton carved by
// the (memoized) river set — valleys upstream, water-filled lagoons at the
// mouths, tarns at the sources — plus the guaranteed-dry landing plateau.
export function continentHeightAt(x: number, z: number, seed: number): number {
  return carveHeight(baseContinentHeightAt(x, z, seed), x, z, fieldSample(x, z, seed));
}

// Biome at a point, derived from the carved height + moisture noise.
export function continentBiomeAt(x: number, z: number, seed: number): ContinentBiome {
  const s = fieldSample(x, z, seed);
  return classifyBiome(carveHeight(baseContinentHeightAt(x, z, seed), x, z, s), s, seed, x, z);
}

// One combined surface sample (height + biome) for hot loops like the chunked
// terrain builder: a single field sample feeds both, so the river scan never
// runs twice for one vertex.
export function continentSurface(
  x: number,
  z: number,
  seed: number,
): { h: number; biome: ContinentBiome } {
  const s = fieldSample(x, z, seed);
  const h = carveHeight(baseContinentHeightAt(x, z, seed), x, z, s);
  return { h, biome: classifyBiome(h, s, seed, x, z) };
}

// Slope magnitude (rise over run) of the carved heightfield at (x, z). Used by
// the foliage pass (grass + props refuse cliff faces) and by settlement
// placement (buildings need flat-ish ground; Capa 2 passes a stricter gate).
export function continentTooSteep(x: number, z: number, seed: number, maxSlope = 0.62): boolean {
  const eps = 1.2;
  const hx = continentHeightAt(x + eps, z, seed) - continentHeightAt(x - eps, z, seed);
  const hz = continentHeightAt(x, z + eps, seed) - continentHeightAt(x, z - eps, seed);
  return Math.hypot(hx, hz) / (2 * eps) > maxSlope;
}

// ---------------------------------------------------------------------------
// Layer 1 ready: Poisson-disk sampling. Deterministic given a seeded Rng (the
// region populator draws from it), guarantees a minimum spacing between placed
// props so trees never clump — O(n) and lightweight, per the architecture doc.
// ---------------------------------------------------------------------------

export function poissonDiskSampling(
  width: number,
  height: number,
  minDist: number,
  rng: Rng,
): { x: number; z: number }[] {
  const cell = minDist / Math.SQRT2;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const grid = new Array<number>(cols * rows).fill(-1);
  const points: { x: number; z: number }[] = [];
  const active: number[] = [];

  const put = (x: number, z: number): number => {
    const idx = points.length;
    points.push({ x, z });
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
    const cz = Math.min(rows - 1, Math.max(0, Math.floor(z / cell)));
    grid[cz * cols + cx] = idx;
    active.push(idx);
    return idx;
  };

  const farEnough = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let gz = cz - 2; gz <= cz + 2; gz++) {
      for (let gx = cx - 2; gx <= cx + 2; gx++) {
        if (gx < 0 || gx >= cols || gz < 0 || gz >= rows) continue;
        const j = grid[gz * cols + gx];
        if (j < 0) continue;
        const p = points[j];
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < minDist * minDist) return false;
      }
    }
    return true;
  };

  // Seed point (clamped so the disk stays in-bounds).
  put((rng.next() * width) / 2 + width / 4, (rng.next() * height) / 2 + height / 4);

  while (active.length > 0) {
    const i = active[Math.floor(rng.next() * active.length)];
    const p = points[i];
    let placed = false;
    for (let k = 0; k < 30; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = minDist * (1 + rng.next());
      const nx = p.x + Math.cos(a) * r;
      const nz = p.z + Math.sin(a) * r;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
      if (!farEnough(nx, nz)) continue;
      put(nx, nz);
      placed = true;
      break;
    }
    if (!placed) {
      // Remove by VALUE, not by index: `active` holds point indices, so once a
      // middle point has been removed the array is no longer [0,1,2,...] and
      // splicing at the index `i` would either delete the wrong entry or (when
      // i >= active.length) silently nothing — leaving the point active
      // forever and hanging the loop. Swap-pop keeps removal O(1).
      const pos = active.indexOf(i);
      if (pos >= 0) {
        active[pos] = active[active.length - 1];
        active.pop();
      }
    }
  }
  return points;
}

// A seeded Rng for one continent's deterministic rule chain (rivers already
// use their own offset; this is the shared "world grammar" stream future layers
// draw from, e.g. kingdom placement in Layer 0's tail).
export function continentRng(seed: number): Rng {
  return new Rng((seed ^ 0xc0ffee) >>> 0);
}

// ---------------------------------------------------------------------------
// Layer 0's tail: REINOS. 3-7 kingdom seeds, far apart, on dry walkable land
// (Plains preferred). Each kingdom anchors one settlement (Capa 2, see
// src/world/SettlementGenerator.ts) that grows outward from this nucleus.
// ---------------------------------------------------------------------------

export interface ContinentKingdom {
  id: number;
  /** Settlement seed for this kingdom's town grammar (salted from world seed). */
  seed: number;
  center: { x: number; z: number };
  name: string;
}

const KINGDOM_COUNT_MIN = 3;
const KINGDOM_COUNT_MAX = 7;
const KINGDOM_MIN_SEP = 70; // keep kingdoms well apart on the island
const KINGDOM_LANDING_CLEAR = 46; // keep the portal harbour approach clear
const KINGDOM_MAX_SLOPE = 0.5; // buildings need flat-ish ground
const KINGDOM_NAMES = [
  'Aldervale',
  'Brackmoor',
  'Cinderholt',
  'Dunmere',
  'Fenwick',
  'Greyhaven',
  'Hollowford',
  'Ironcrown',
  'Kestrel Rock',
  'Larkspur',
  'Moonreach',
  'Northgrove',
  'Oakrest',
  'Pinebrook',
  'Quailrun',
  'Ravenmoor',
  'Silverbrook',
  'Thornfield',
  'Umbrage',
  'Westmarch',
];

const kingdomsCache = new Map<number, ContinentKingdom[]>();

/**
 * The continent's deterministic kingdoms (memoized): 3-7 seeds, min 70u apart,
 * each on dry, non-steep ground away from the landing and declared water.
 */
export function placeKingdoms(seed: number): ContinentKingdom[] {
  const cached = kingdomsCache.get(seed);
  if (cached) return cached;
  const rng = new Rng((seed ^ 0x51b0) >>> 0);
  const waterSpots = continentWaterSpots(seed);
  const count =
    KINGDOM_COUNT_MIN +
    Math.floor(rng.next() * (KINGDOM_COUNT_MAX - KINGDOM_COUNT_MIN + 1));
  const out: ContinentKingdom[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 4000) {
    const ang = rng.next() * Math.PI * 2;
    const rad = 42 + rng.next() * (CONTINENT_RADIUS - 78);
    const x = CONTINENT_CX + Math.cos(ang) * rad;
    const z = CONTINENT_CZ + Math.sin(ang) * rad;
    const { h, biome } = continentSurface(x, z, seed);
    if (h < CONTINENT_SEA_LEVEL + 0.9) continue;
    if (biome === 'Ocean' || biome === 'Sea' || biome === 'Lake' || biome === 'River') continue;
    if (waterSpots.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.radius * s.radius)) continue;
    if ((x - CONTINENT_LANDING.x) ** 2 + (z - CONTINENT_LANDING.z) ** 2 < KINGDOM_LANDING_CLEAR ** 2)
      continue;
    if (continentTooSteep(x, z, seed, KINGDOM_MAX_SLOPE)) continue;
    if (out.some((k) => Math.hypot(k.center.x - x, k.center.z - z) < KINGDOM_MIN_SEP)) continue;
    out.push({
      id: out.length,
      seed: ((seed ^ 0x51b1) + out.length * 7919) >>> 0,
      center: { x, z },
      name: KINGDOM_NAMES[Math.floor(rng.next() * KINGDOM_NAMES.length)],
    });
  }
  kingdomsCache.set(seed, out);
  return out;
}
