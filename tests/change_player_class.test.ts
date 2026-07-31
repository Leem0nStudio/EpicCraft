import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { type PlayerClass } from '../src/sim/types';

function makeSim(cls: PlayerClass = 'novice', seed = 42) {
  return new Sim({ seed, playerClass: cls });
}

function setLevel(sim: Sim, level: number) {
  sim.setPlayerLevel(level);
}

function getMeta(sim: Sim) {
  return (sim as any).players.get(sim.player.id);
}

describe('changePlayerClass', () => {
  it('changes class from novice to a valid target', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    const hpBefore = sim.player.maxHp;
    sim.changePlayerClass(sim.player.id, 'warrior');
    const meta = getMeta(sim);
    expect(meta.cls).toBe('warrior');
    // Class change should have recalculated stats (warrior has different base stats).
    expect(sim.player.maxHp).not.toBe(hpBefore);
  });

  it('resets talents on class change', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    const meta = getMeta(sim);
    // Manually set a talent allocation to verify reset.
    meta.talents = { spec: 'fury', rows: { 8: 'some_option' } };
    sim.changePlayerClass(sim.player.id, 'warrior');
    const metaAfter = getMeta(sim);
    expect(metaAfter.talents).toEqual({ spec: null, rows: {} });
  });

  it('rejects class change when not novice', () => {
    const sim = makeSim('warrior');
    setLevel(sim, 5);
    const ev = sim.changePlayerClass(sim.player.id, 'mage');
    expect(ev).toBe(false);
    expect(getMeta(sim).cls).toBe('warrior');
  });

  it('rejects class change below level 5', () => {
    const sim = makeSim('novice');
    setLevel(sim, 4);
    const ev = sim.changePlayerClass(sim.player.id, 'warrior');
    expect(ev).toBe(false);
    expect(getMeta(sim).cls).toBe('novice');
  });

  it('allows class change at exactly level 5', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    const ev = sim.changePlayerClass(sim.player.id, 'mage');
    expect(ev).toBe(true);
    expect(getMeta(sim).cls).toBe('mage');
  });

  it('rejects invalid target class', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    const ev = sim.changePlayerClass(sim.player.id, 'invalid' as PlayerClass);
    expect(ev).toBe(false);
    expect(getMeta(sim).cls).toBe('novice');
  });

  it('rejects novice as target class', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    // novice is NOT in the valid job change targets.
    const ev = sim.changePlayerClass(sim.player.id, 'novice');
    expect(ev).toBe(false);
    expect(getMeta(sim).cls).toBe('novice');
  });

  it('preserves level after class change', () => {
    const sim = makeSim('novice');
    setLevel(sim, 10);
    sim.changePlayerClass(sim.player.id, 'rogue');
    expect(sim.player.level).toBe(10);
  });

  it('preserves position after class change', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    sim.player.pos.x = 100;
    sim.player.pos.z = 200;
    sim.changePlayerClass(sim.player.id, 'priest');
    expect(sim.player.pos.x).toBe(100);
    expect(sim.player.pos.z).toBe(200);
  });

  it('refreshes known abilities for new class', () => {
    const sim = makeSim('novice');
    setLevel(sim, 5);
    sim.changePlayerClass(sim.player.id, 'warrior');
    const meta = getMeta(sim);
    const knownIds = meta.known.map((a: { def: { id: string } }) => a.def.id);
    // Warrior should know warrior abilities, not novice ones.
    expect(knownIds).not.toContain('novice_smite');
  });

  it('all 9 non-novel classes are valid targets', () => {
    const targets: PlayerClass[] = [
      'warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid',
    ];
    for (const target of targets) {
      const sim = makeSim('novice');
      setLevel(sim, 5);
      const ev = sim.changePlayerClass(sim.player.id, target);
      expect(ev).toBe(true);
      expect(getMeta(sim).cls).toBe(target);
    }
  });
});
