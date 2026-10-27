import { describe, expect, it } from 'vitest';
import { energyForFragments } from '../src/core/costs';
import { reduce } from '../src/core/reducer';
import { withModule } from '../src/core/state';
import type { Action, GameState, Incident, ModuleId } from '../src/core/types';
import { newState, owning, rich } from './helpers';
import { REFERENCE_SOLUTIONS } from './solutions';

const run = (s: GameState, ...actions: Action[]) =>
  actions.reduce<{ state: GameState; events: unknown[] }>(
    (acc, a) => {
      const out = reduce(acc.state, a);
      return { state: out.state, events: [...acc.events, ...out.events] };
    },
    { state: s, events: [] },
  );

function withIncident(s: GameState, module: ModuleId, puzzleId: string, seed = 99): GameState {
  const incident: Incident = {
    ticket: 1,
    module,
    puzzleId,
    severity: 0.5,
    startedAt: s.time,
    testSeed: seed,
    summary: 'x',
    autoTried: false,
  };
  return withModule(s, module, { incident });
}

describe('click', () => {
  it('earns energy and counts clicks', () => {
    const { state, events } = run(newState(), { type: 'click' });
    expect(state.resources.energy).toBeGreaterThanOrEqual(1);
    expect(state.stats.clicks).toBe(1);
    expect(state.achievements).toContain('first-pulse');
    expect(events[0]).toMatchObject({ type: 'click' });
  });

  it('crits sometimes', () => {
    const many = Array.from({ length: 400 }, () => ({ type: 'click' }) as const);
    const { state } = run(newState(), ...many);
    expect(state.stats.crits).toBeGreaterThan(0);
    expect(state.stats.crits).toBeLessThan(60);
  });
});

describe('buying', () => {
  it('buys modules and spends resources', () => {
    const s = { ...newState(), resources: { energy: 100, alloy: 0, data: 0, cores: 0 } };
    const { state } = run(s, { type: 'buyModule', id: 'capacitor', qty: 2 });
    expect(state.modules.capacitor.count).toBe(2);
    expect(state.resources.energy).toBeCloseTo(100 - 15 - 18);
  });

  it('buys max and refuses when broke or locked', () => {
    const s = { ...newState(), resources: { energy: 1000, alloy: 0, data: 0, cores: 0 } };
    expect(
      run(s, { type: 'buyModule', id: 'capacitor', qty: 'max' }).state.modules.capacitor.count,
    ).toBeGreaterThan(10);
    expect(run(newState(), { type: 'buyModule', id: 'capacitor', qty: 1 }).events[0]).toMatchObject(
      { type: 'error' },
    );
    expect(
      run(rich(newState()), { type: 'buyModule', id: 'antimatter', qty: 1 }).events[0],
    ).toMatchObject({ type: 'error' });
    expect(
      run(newState(), { type: 'buyModule', id: 'capacitor', qty: 'max' }).events[0],
    ).toMatchObject({ type: 'error' });
  });

  it('buys upgrades once and applies flags', () => {
    let s = { ...rich(newState()), stats: { ...newState().stats, clicks: 20 } };
    s = run(s, { type: 'buyUpgrade', id: 'click-1' }).state;
    expect(s.upgrades).toContain('click-1');
    expect(run(s, { type: 'buyUpgrade', id: 'click-1' }).events[0]).toMatchObject({
      type: 'error',
    });
    const story = { ...rich(owning(newState(), { lattice: 5 })), flags: ['signal-seen'] };
    const out = run(story, { type: 'buyUpgrade', id: 'echo-decoder' });
    expect(out.state.flags).toContain('echo-unlocked');
    expect(
      run(
        { ...newState(), stats: { ...newState().stats, clicks: 20 } },
        { type: 'buyUpgrade', id: 'click-1' },
      ).events[0],
    ).toMatchObject({ type: 'error' });
  });

  it('buys perks with cores', () => {
    const s = { ...newState(), resources: { ...newState().resources, cores: 3 } };
    const out = run(s, { type: 'buyPerk', id: 'overclock' }, { type: 'buyPerk', id: 'overclock' });
    expect(out.state.perks.overclock).toBe(2);
    expect(out.state.resources.cores).toBe(0);
    expect(run(out.state, { type: 'buyPerk', id: 'overclock' }).events[0]).toMatchObject({
      type: 'error',
    });
    expect(run(s, { type: 'buyPerk', id: 'nope' }).events[0]).toMatchObject({ type: 'error' });
    const maxed = {
      ...s,
      perks: { 'persistent-daemon': 1 },
      resources: { ...s.resources, cores: 99 },
    };
    expect(run(maxed, { type: 'buyPerk', id: 'persistent-daemon' }).events[0]).toMatchObject({
      message: 'Niveau maximal atteint.',
    });
  });
});

describe('repairs', () => {
  it('patches an incident for resources', () => {
    const s = withIncident(rich(owning(newState(), { capacitor: 3 })), 'capacitor', 'echo-bus');
    const out = run(s, { type: 'patch', module: 'capacitor' });
    expect(out.state.modules.capacitor.incident).toBeNull();
    expect(out.state.stats.patches).toBe(1);
    expect(run(out.state, { type: 'patch', module: 'capacitor' }).events[0]).toMatchObject({
      type: 'error',
    });
    const broke = withIncident(owning(newState(), { capacitor: 3 }), 'capacitor', 'echo-bus');
    expect(run(broke, { type: 'patch', module: 'capacitor' }).events[0]).toMatchObject({
      type: 'error',
    });
  });

  it('resolves incidents with a valid solution and boosts the module', () => {
    const s = withIncident(owning(newState(), { capacitor: 3 }), 'capacitor', 'echo-bus');
    const out = run(s, {
      type: 'submitSolution',
      puzzleId: 'echo-bus',
      code: REFERENCE_SOLUTIONS['echo-bus'] ?? '',
      module: 'capacitor',
    });
    expect(out.state.modules.capacitor.incident).toBeNull();
    expect(out.state.modules.capacitor.boostUntil).toBeGreaterThan(s.time);
    expect(out.state.solutions['echo-bus']).toBeDefined();
    expect(out.state.resources.data).toBe(15);
    expect(out.state.flags).toContain('optimized');
    expect(out.state.achievements).toContain('debug-1');
  });

  it('rejects wrong solutions and unknown tickets', () => {
    const s = withIncident(owning(newState(), { capacitor: 3 }), 'capacitor', 'echo-bus');
    expect(
      run(s, { type: 'submitSolution', puzzleId: 'echo-bus', code: 'HLT', module: 'capacitor' })
        .events[0],
    ).toMatchObject({ type: 'error' });
    expect(
      run(s, { type: 'submitSolution', puzzleId: 'zzz', code: '', module: null }).events[0],
    ).toMatchObject({ type: 'error' });
    expect(
      run(s, {
        type: 'submitSolution',
        puzzleId: 'echo',
        code: REFERENCE_SOLUTIONS.echo ?? '',
        module: null,
      }).events[0],
    ).toMatchObject({ type: 'error' });
  });

  it('practice solutions keep the best cycles and decode the echo', () => {
    const s = { ...newState(), flags: ['echo-unlocked'] };
    const out = run(s, {
      type: 'submitSolution',
      puzzleId: 'echo',
      code: REFERENCE_SOLUTIONS.echo ?? '',
      module: null,
    });
    expect(out.state.flags).toContain('echo-decoded');
    const slower = `NOP\n${REFERENCE_SOLUTIONS.echo}`;
    const again = run(out.state, {
      type: 'submitSolution',
      puzzleId: 'echo',
      code: slower,
      module: null,
    });
    expect(again.state.solutions.echo?.code).toBe(REFERENCE_SOLUTIONS.echo);
  });

  it('deploys saved firmware', () => {
    let s = withIncident(owning(newState(), { capacitor: 3 }), 'capacitor', 'echo-bus');
    expect(run(s, { type: 'deploy', module: 'capacitor' }).events[0]).toMatchObject({
      type: 'error',
    });
    s = {
      ...s,
      solutions: {
        'echo-bus': {
          code: REFERENCE_SOLUTIONS['echo-bus'] ?? '',
          cycles: 1,
          size: 1,
          solvedAt: 0,
        },
      },
    };
    expect(
      run(s, { type: 'deploy', module: 'capacitor' }).state.modules.capacitor.incident,
    ).toBeNull();
    const bad = {
      ...s,
      solutions: { 'echo-bus': { code: 'HLT', cycles: 1, size: 1, solvedAt: 0 } },
    };
    expect(run(bad, { type: 'deploy', module: 'capacitor' }).events[0]).toMatchObject({
      type: 'error',
    });
    expect(run(newState(), { type: 'deploy', module: 'capacitor' }).events[0]).toMatchObject({
      type: 'error',
    });
  });

  it('saves drafts with limits', () => {
    expect(
      run(newState(), { type: 'saveDraft', puzzleId: 'echo-bus', code: 'NOP' }).state.drafts[
        'echo-bus'
      ],
    ).toBe('NOP');
    expect(
      run(newState(), { type: 'saveDraft', puzzleId: 'nope', code: 'NOP' }).state.drafts,
    ).toEqual({});
  });
});

describe('anomalies', () => {
  it('catches an anomaly for a reward', () => {
    const base = owning(newState(), { capacitor: 5, drone: 1, datacore: 1 });
    const outcomes = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const s = {
        ...base,
        rng: seed * 7919,
        anomaly: { id: 1, spawnedAt: 0, expiresAt: 10, seed: 1 },
      };
      return run(s, { type: 'catchAnomaly' });
    });
    outcomes.forEach((o) => {
      expect(o.state.anomaly).toBeNull();
      expect(o.state.stats.anomalies).toBe(1);
    });
    expect(run(newState(), { type: 'catchAnomaly' }).events).toEqual([]);
  });
});

describe('logs', () => {
  it('decrypts and reads logs, setting flags', () => {
    let s: GameState = {
      ...newState(),
      logsUnlocked: ['log-01', 'log-06', 'log-11'],
      resources: { energy: 0, alloy: 0, data: 100, cores: 0 },
    };
    expect(run(s, { type: 'readLog', logId: 'log-06' }).state.logsRead).toEqual([]);
    s = run(s, { type: 'decrypt', logId: 'log-06' }).state;
    expect(s.resources.data).toBe(60);
    expect(run(s, { type: 'decrypt', logId: 'log-06' }).events[0]).toMatchObject({ type: 'error' });
    s = run(s, { type: 'readLog', logId: 'log-06' }, { type: 'readLog', logId: 'log-06' }).state;
    expect(s.stats.logsRead).toBe(1);
    s = run(s, { type: 'readLog', logId: 'log-11' }).state;
    expect(s.flags).toContain('signal-seen');
    expect(run(s, { type: 'decrypt', logId: 'log-99' }).events[0]).toMatchObject({ type: 'error' });
    const poor = { ...newState(), logsUnlocked: ['log-08'] };
    expect(run(poor, { type: 'decrypt', logId: 'log-08' }).events[0]).toMatchObject({
      type: 'error',
    });
  });
});

describe('reboot', () => {
  it('requires enough energy', () => {
    expect(run(newState(), { type: 'reboot' }).events[0]).toMatchObject({ type: 'error' });
  });

  it('resets the run and grants fragments and start bonuses', () => {
    const base = owning(rich(newState()), { capacitor: 50 });
    const s: GameState = {
      ...base,
      run: { ...base.run, energy: energyForFragments(4) },
      upgrades: ['daemon', 'click-1'],
      perks: { residual: 2, 'persistent-daemon': 1 },
      resources: { ...base.resources, cores: 1 },
      solutions: { 'echo-bus': { code: 'x', cycles: 1, size: 1, solvedAt: 0 } },
    };
    const out = run(s, { type: 'reboot' });
    expect(out.state.resources.cores).toBe(5);
    expect(out.state.resources.energy).toBe(10_000);
    expect(out.state.modules.capacitor.count).toBe(0);
    expect(out.state.upgrades).toEqual(['daemon']);
    expect(out.state.solutions['echo-bus']).toBeDefined();
    expect(out.state.stats.reboots).toBe(1);
    expect(out.state.achievements).toContain('reboot-1');
  });
});

describe('flags & commands', () => {
  it('sets valid flags only once', () => {
    const s = run(newState(), { type: 'setFlag', flag: 'sudo' }).state;
    expect(s.flags).toEqual(['sudo']);
    expect(s.achievements).toContain('sudo');
    expect(run(s, { type: 'setFlag', flag: 'sudo' }).events).toEqual([]);
    expect(run(s, { type: 'setFlag', flag: 'BAD FLAG!' }).events).toEqual([]);
    expect(run(s, { type: 'command' }).state.stats.commands).toBe(1);
  });
});
