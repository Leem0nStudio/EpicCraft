// Network-mirror hot-path pins (docs/perf/network-path-audit.md). The mirror
// decodes 20 Hz snapshots and flushes input once per presented frame, so its
// per-entity and per-frame allocations are old-device GC pressure. Two were
// removed in this pass and are pinned here:
//
//   N1 - applyWire re-anchors prevPos by MUTATING the entity's existing
//       prevPos object instead of allocating a fresh {x,y,z} per entity per
//       snapshot. Object identity is the contract: a stable prevPos identity
//       across snapshots means no per-entity-per-snapshot churn, and prevPos
//       must never alias pos (the renderer reads both live).
//   N2 - inputSignature() builds the change-detection string without an
//       array + join. flushInput's unchanged-signature skip is the behavior
//       that depends on it (same comma-separated shape as before).
//
// The ClientWorld fixture uses the repo's bare-client idiom (Object.create
// skips field initializers, so every field applySnapshot/flushInput touches is
// set explicitly), mirroring tests/xp.test.ts and tests/weapon_stow.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientWorld } from '../src/net/online';

afterEach(() => {
  vi.restoreAllMocks();
});

// Minimal full wire record: identity first, then a moving pose. Matches the
// server's wireEntity encoding shape (server/game.ts), terse keys and all.
function wireEntity(id: number, x: number, z: number, facing = 0): any {
  return {
    id,
    k: 'mob',
    tid: 'test_mob',
    nm: 'Test Mob',
    lv: 1,
    x,
    y: 0,
    z,
    f: facing,
    hp: 100,
    mhp: 100,
  };
}

function bareClient(pid: number): ClientWorld {
  const c: any = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 20061, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = pid;
  c.moveInput = {};
  c.inventory = [];
  c.equipment = {};
  c.copper = 0;
  c.xp = 0;
  c.lifetimeXp = 0;
  c.prestigeRank = 0;
  c.unlockedMilestones = [];
  c.known = [];
  c.questLog = new Map();
  c.questsDone = new Set();
  c.pendingQuestCommands = new Map();
  c.partyInfo = null;
  c.tradeInfo = null;
  c.duelInfo = null;
  c.arenaInfo = null;
  c.activeFrostRings = [];
  c.activeTemporalHourglasses = [];
  c.lastSnapAt = 0;
  c.snapInterval = 50;
  c.pendingFacingDelta = 0;
  c.connected = true;
  c.eventQueue = [];
  c.mouselookFacing = null;
  c.missingSince = new Map();
  c.inputEchoSamples = [];
  c.pendingInputSeqSentAt = new Map();
  c.ackedInputSeq = 0;
  c.inputSeq = 0;
  c.lastInputSentAt = 0;
  c.lastInputSig = '';
  return c;
}

describe('applyWire prevPos re-anchor (N1)', () => {
  it('mutates the existing prevPos object: stable identity, no per-snapshot churn', () => {
    // Stub the clock so the re-anchor alpha is deterministic: applySnapshot
    // calls performance.now() exactly once per message, and the real clock can
    // return the same value twice between synchronous calls (alpha == 0).
    const nowSpy = vi.spyOn(performance, 'now');
    const t1 = 1_000_000;
    nowSpy.mockReturnValue(t1);
    const client = bareClient(900);
    // first sight at (10, 0, 10): lastSnapAt == 0, so the continuation alpha
    // is 1 and prevPos converges to the first server pose (10, 0, 10)
    (client as any).applySnapshot({ ents: [wireEntity(1, 10, 10)], keep: [] });
    const e = client.entities.get(1)!;
    const firstPrev = e.prevPos;
    // prevPos is its own object, never an alias of pos (renderer reads both)
    expect(firstPrev).not.toBe(e.pos);
    expect(firstPrev.x).toBe(10);
    expect(firstPrev.z).toBe(10);

    // second snapshot 25 ms later at (20, 0, 20): the re-anchor lerps prevPos
    // toward the CURRENT pose (already on screen), then the new pose lands in
    // pos. With prevPos == pos the lerp is a correct no-op: prevPos stays the
    // old anchor, pos becomes the new segment start.
    nowSpy.mockReturnValue(t1 + 25);
    (client as any).applySnapshot({ ents: [wireEntity(1, 20, 20)], keep: [] });
    expect(e.prevPos).toBe(firstPrev); // identity: no fresh object per snapshot
    expect(e.prevPos.x).toBe(10);
    expect(e.pos.x).toBe(20);

    // third snapshot 25 ms later at (30, 0, 30): the entity is now mid-segment
    // (prevPos 10, pos 20), so the re-anchor ADVANCES prevPos toward pos by the
    // continuation alpha, still on the same object, before pos jumps to 30.
    nowSpy.mockReturnValue(t1 + 50);
    (client as any).applySnapshot({ ents: [wireEntity(1, 30, 30)], keep: [] });
    expect(e.prevPos).toBe(firstPrev);
    expect(e.prevPos.x).toBeGreaterThan(10); // advanced from the old anchor
    expect(e.prevPos.x).toBeLessThan(30); // never snapped to the new pose
    expect(e.pos.x).toBe(30);
  });

  it('teleports snap prevPos to the destination in place', () => {
    const client = bareClient(900);
    (client as any).applySnapshot({ ents: [wireEntity(1, 0, 0)], keep: [] });
    const e = client.entities.get(1)!;
    const firstPrev = e.prevPos;
    // a >40 yd jump is a teleport (arena pit, portal, release): snapped, not
    // interpolated, and still on the same object
    (client as any).applySnapshot({ ents: [wireEntity(1, 100, 100)], keep: [] });
    expect(e.prevPos).toBe(firstPrev);
    expect(e.prevPos.x).toBe(100);
    expect(e.prevPos.z).toBe(100);
    expect(e.pos.x).toBe(100);
    expect(e.prevPos).not.toBe(e.pos);
  });
});

describe('input flush signature (N2)', () => {
  it('skips unchanged input, throttles changes, sends once past the frame gate', () => {
    const sent: string[] = [];
    const client = bareClient(900);
    client.connected = true;
    (client as any).ws = { readyState: 1, send: (p: string) => sent.push(p) };
    const mi: any = {
      forward: false,
      back: false,
      turnLeft: false,
      turnRight: false,
      strafeLeft: false,
      strafeRight: false,
      jump: false,
    };
    client.moveInput = mi;

    const t0 = 1_000_000;
    // first flush: changed vs the empty baseline, past the 16 ms throttle
    expect(client.flushInput(t0)).toBe(true);
    expect(sent.length).toBe(1);
    // unchanged input: the signature skip returns false without sending
    expect(client.flushInput(t0 + 5)).toBe(false);
    expect(sent.length).toBe(1);
    // a real change within the 16 ms throttle window is held back
    mi.forward = true;
    expect(client.flushInput(t0 + 10)).toBe(false);
    expect(sent.length).toBe(1);
    // ...and goes out once the throttle opens
    expect(client.flushInput(t0 + 20)).toBe(true);
    expect(sent.length).toBe(2);
  });
});
