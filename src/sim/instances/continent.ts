// The procedural continent's portal gates. Unlike dungeons/arena/delves, the
// continent is NOT an instance: it is a persistent parallel landmass in its own
// coordinate band (see src/world/ContinentGrammar.ts). Walking through the gate
// near the starting town teleports you to the continent landing; the return
// gate on the continent brings you back to the overworld gate. Pure teleports
// (no claim, no pool, no lockouts) — the continent is shared open world.
//
// Mirrors the instances/dungeons.ts seam shape: exported functions take the
// SimContext, and Sim keeps thin delegates so foreign spawn/interaction/party
// code reaches them through the seam.

import { CONTINENT_LANDING } from '../../world/ContinentGrammar';
// sim.ts imports the landing point through this seam; re-export it so the
// binding is defined (a missing named export reads as `undefined` at runtime).
export { CONTINENT_LANDING };
import { CONTINENT_X_MIN } from '../data';
import type { SimContext } from '../sim_context';

// Reserved entity ids for the two gate objects, outside the sim's nextId
// sequence so world-gen determinism and the parity goldens' pinned id order
// are untouched (same pattern as VALE_CUP_BRAM_ID / FURY_ENTITY_ID).
export const CONTINENT_GATE_ENTITY_ID = 1_000_000_002;
export const CONTINENT_RETURN_ENTITY_ID = 1_000_000_003;
// The overworld gate's authored position: Eastbrook's east edge (the town hub
// sits at the vale's centre, x=0; the continent lies east, so this reads as
// the eastern gate out of town). findSafePos nudges it to clear ground at Sim
// ctor spawn time, and the spawned entity's position is stamped back here.
export const CONTINENT_OVERWORLD_GATE = { x: 34, z: 14 };


// The overworld gate's position, stamped at Sim ctor spawn time (findSafePos
// nudges it to clear ground, so it is read back from the spawned entity rather
// than assumed). leaveContinent returns the player there.
let overworldGatePos: { x: number; z: number } | null = null;

// Stamped by the Sim ctor after the overworld gate entity is spawned. Pure
// bookkeeping (no rng, no clock), so determinism is untouched.
export function setContinentGatePos(pos: { x: number; z: number } | null): void {
  overworldGatePos = pos;
}

export function continentGatePos(): { x: number; z: number } | null {
  return overworldGatePos;
}

export function enterContinent(ctx: SimContext, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  const p = r.e;
  // A fresh corpse cannot move; a released ghost may still cross (like dungeon
  // re-entry). Ghosts keep their spirit state — the continent is open world,
  // so no instance resurrection rules apply.
  if (p.dead && !p.ghost) return false;
  p.pos = ctx.groundPos(CONTINENT_LANDING.x, CONTINENT_LANDING.z);
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.facing = 0;
  p.targetId = null;
  p.autoAttack = false;
  ctx.emit({
    type: 'log',
    text: 'The shimmering gate pulls you across the sea...',
    color: '#7cf',
    pid: r.meta.entityId,
  });
  return true;
}

export function leaveContinent(ctx: SimContext, pid?: number): boolean {
  const r = ctx.resolve(pid);
  if (!r) return false;
  if (r.e.pos.x < CONTINENT_X_MIN) return false; // not on the continent
  // A fresh corpse cannot move; a released ghost may still cross back.
  if (r.e.dead && !r.e.ghost) return false;
  const gate = overworldGatePos;
  if (!gate) return false;
  const p = r.e;
  p.pos = ctx.groundPos(gate.x, gate.z);
  p.prevPos = { ...p.pos };
  ctx.rebucket(p);
  p.facing = 0;
  p.targetId = null;
  p.autoAttack = false;
  ctx.emit({
    type: 'log',
    text: 'The gate delivers you back to familiar shores.',
    color: '#7cf',
    pid: r.meta.entityId,
  });
  return true;
}
