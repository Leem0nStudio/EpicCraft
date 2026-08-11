// Regression + unit tests for the procedural-continent portal gates
// (src/sim/instances/continent.ts). Reproduces the arrival/return bounce: the
// crossing teleports landed the player EXACTLY on the destination gate, so the
// next updateDoorTriggers sweep (DOOR_TRIGGER_RADIUS 2.0) instantly fired the
// return trip (and vice versa), pinning the player at the portal.

import { describe, expect, it } from 'vitest';
import { enterContinent, leaveContinent } from '../src/sim/instances/continent';
import { updateDoorTriggers } from '../src/sim/instances/dungeons';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { CONTINENT_X_MIN } from '../src/world/ContinentGrammar';

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

function makeSim(seed = 99): AnySim {
  return new Sim({ seed, playerClass: 'warrior', noPlayer: true }) as AnySim;
}

function teleport(sim: AnySim, e: AnyEntity, x: number, z: number): void {
  e.pos = { x, y: e.pos.y, z };
  e.prevPos = { ...e.pos };
  sim.rebucket(e);
}

function gateAt(sim: AnySim, templateId: string): AnyEntity {
  for (const e of sim.entities.values()) {
    if (e.templateId === templateId) return e as AnyEntity;
  }
  throw new Error(`no ${templateId} entity in the world`);
}

describe('continent gates', () => {
  it('entering the continent does not instantly bounce back off the return gate', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Solo');
    const p = sim.entities.get(pid) as AnyEntity;
    const gate = gateAt(sim, 'continent_gate');
    teleport(sim, p, gate.pos.x, gate.pos.z);

    updateDoorTriggers(sim.ctx, p);
    expect(p.pos.x).toBeGreaterThanOrEqual(CONTINENT_X_MIN);

    for (let i = 0; i < 5; i++) updateDoorTriggers(sim.ctx, p);
    expect(p.pos.x).toBeGreaterThanOrEqual(CONTINENT_X_MIN);
  });

  it('leaving the continent does not instantly re-enter off the overworld gate', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Solo');
    const p = sim.entities.get(pid) as AnyEntity;
    const ret = gateAt(sim, 'continent_return');
    teleport(sim, p, ret.pos.x, ret.pos.z);
    expect(p.pos.x).toBeGreaterThanOrEqual(CONTINENT_X_MIN);

    updateDoorTriggers(sim.ctx, p);
    expect(p.pos.x).toBeLessThan(CONTINENT_X_MIN);

    for (let i = 0; i < 5; i++) updateDoorTriggers(sim.ctx, p);
    expect(p.pos.x).toBeLessThan(CONTINENT_X_MIN);
  });

  it('a crossing is inert for a short window so the player can step off the portal', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Solo');
    const p = sim.entities.get(pid) as AnyEntity;

    expect(enterContinent(sim.ctx, pid)).toBe(true);
    expect(p.pos.x).toBeGreaterThanOrEqual(CONTINENT_X_MIN);

    expect(leaveContinent(sim.ctx, pid)).toBe(false);
    expect(p.pos.x).toBeGreaterThanOrEqual(CONTINENT_X_MIN);
  });
});
