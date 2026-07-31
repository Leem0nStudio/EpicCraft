// NPC combat system: defensive AI for friendly NPCs.
// When a mob attacks an NPC, the NPC fights back with basic melee.
// Guards also help players by attacking mobs that chase them.
import { DT, dist2d, steadyAngleTo, type Entity } from './types';
import type { SimContext } from './sim_context';

// Melee range for NPCs (yards)
const NPC_MELEE_RANGE = 2.5;

// How often NPCs scan for nearby hostile mobs (seconds)
const NPC_AGGRO_SCAN_INTERVAL = 2;

// Guard-specific: how far guards will chase mobs to help players
const GUARD_HELP_RADIUS = 15;

// Guard-specific: how close mobs need to be to a player for guards to notice
const GUARD_DETECTION_RADIUS = 10;

// NPC AI states
type NpcAiState = 'idle' | 'chase' | 'attack' | 'return';

/**
 * Update NPC combat behavior. Called from the per-entity tick loop.
 * NPCs are defensive: they only fight back if attacked first.
 * Guards additionally help players by attacking mobs that chase them.
 */
export function updateNpcCombat(ctx: SimContext, npc: Entity): void {
  if (npc.dead) return;
  if (!npc.weapon) return; // No weapon = can't fight

  // Initialize combat state if needed
  if (npc.aiState === 'idle' && npc.aggroTargetId === null) {
    // Scan for nearby hostile mobs that might attack us
    npc.pulseTimer -= DT;
    if (npc.pulseTimer <= 0) {
      npc.pulseTimer = NPC_AGGRO_SCAN_INTERVAL;
      scanForHostiles(ctx, npc);
      // Guards also scan for players being chased
      if (isGuard(npc)) {
        scanForPlayersInDanger(ctx, npc);
      }
    }
  }

  // Handle combat states
  if (npc.aggroTargetId !== null) {
    const target = ctx.entities.get(npc.aggroTargetId);
    if (!target || target.dead) {
      // Target is dead or gone, return to idle
      npc.aggroTargetId = null;
      npc.aiState = 'idle';
      npc.inCombat = false;
      return;
    }

    // Check leash range (don't chase too far from spawn)
    const distFromSpawn = dist2d(npc.pos, npc.spawnPos);
    if (distFromSpawn > (isGuard(npc) ? 25 : 15)) {
      // Too far from spawn, disengage
      npc.aggroTargetId = null;
      npc.aiState = 'idle';
      npc.inCombat = false;
      return;
    }

    // Chase and attack
    const distToTarget = dist2d(npc.pos, target.pos);
    
    if (distToTarget <= NPC_MELEE_RANGE) {
      // In melee range - attack
      npc.aiState = 'attack';
      npc.facing = steadyAngleTo(npc.pos, target.pos, npc.facing);
      
      // Swing timer
      npc.swingTimer -= DT;
      if (npc.swingTimer <= 0) {
        ctx.mobSwing(npc, target);
        npc.swingTimer = npc.weapon.speed;
      }
    } else {
      // Chase target
      npc.aiState = 'chase';
      npc.facing = steadyAngleTo(npc.pos, target.pos, npc.facing);
      ctx.moveToward(npc, target.pos, npc.moveSpeed * 0.8);
    }
  }
}

/**
 * Scan for nearby hostile mobs that might attack this NPC.
 */
function scanForHostiles(ctx: SimContext, npc: Entity): void {
  // Only scan if NPC has combat stats
  if (!npc.weapon) return;

  let closest: Entity | null = null;
  let closestDist = Infinity;

  // Scan the grid for nearby hostile mobs
  ctx.grid.forEachInRadius(npc.pos.x, npc.pos.z, 10, (e, d2) => {
    if (e.kind !== 'mob') return;
    if (e.dead) return;
    if (!e.hostile) return;
    // Don't aggro mobs that are already targeting something else
    if (e.aggroTargetId !== null && e.aggroTargetId !== npc.id) return;
    
    const d = Math.sqrt(d2);
    if (d < closestDist) {
      closest = e;
      closestDist = d;
    }
  });

  if (closest && closestDist < 8) {
    // Aggro the mob onto this NPC (defensive response)
    const mobTarget = closest as Entity;
    npc.aggroTargetId = mobTarget.id;
    npc.aiState = 'chase';
    npc.inCombat = true;
    // Make the mob target us back
    ctx.aggroMob(mobTarget, npc, false);
  }
}

/**
 * Scan for players being chased by mobs (guard-specific behavior).
 * Guards will aggro mobs that are chasing players near the town.
 */
function scanForPlayersInDanger(ctx: SimContext, guard: Entity): void {
  if (!guard.weapon) return;

  // Scan for players being chased by mobs
  ctx.playerGrid.forEachInRadius(guard.pos.x, guard.pos.z, GUARD_DETECTION_RADIUS, (player, d2) => {
    if (player.dead) return;
    if (player.kind !== 'player') return;
    
    // Check if this player is being chased by a mob
    ctx.grid.forEachInRadius(player.pos.x, player.pos.z, 8, (e, d2) => {
      if (e.kind !== 'mob') return;
      if (e.dead) return;
      if (!e.hostile) return;
      // Check if the mob is targeting this player
      if (e.aggroTargetId !== player.id) return;
      
      const distToMob = Math.sqrt(d2);
      if (distToMob < 10 && guard.aggroTargetId === null) {
        // Found a mob chasing a player - guard will help!
        guard.aggroTargetId = e.id;
        guard.aiState = 'chase';
        guard.inCombat = true;
        // Make the mob target us instead (guards taunt the mob)
        ctx.aggroMob(e, guard, false);
      }
    });
  });
}

/**
 * Check if an NPC is a guard (has high combat stats).
 * Guards are defined by having more than 200 base HP.
 */
function isGuard(npc: Entity): boolean {
  // Guards are identified by having high combat stats
  // This is a simple heuristic - in a real game you might use a dedicated flag
  return (npc.maxHp ?? 0) > 200 && npc.weapon !== undefined;
}

/**
 * Initialize NPC combat state when damaged.
 * Called from dealDamage when an NPC takes damage.
 */
export function onNpcDamaged(ctx: SimContext, npc: Entity, attacker: Entity): void {
  if (npc.dead) return;
  if (!npc.weapon) return; // Passive NPC, can't fight back
  
  // If we don't have a target, target the attacker
  if (npc.aggroTargetId === null) {
    npc.aggroTargetId = attacker.id;
    npc.aiState = 'chase';
    npc.inCombat = true;
  }
}
