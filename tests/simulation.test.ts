import { describe, expect, it } from 'vitest';
import { FIRST_INCIDENT_AT } from '../src/core/constants';
import { maybeSpawnIncident, resolveIncident, runAutomation } from '../src/core/incidents';
import { computeModifiers } from '../src/core/modifiers';
import { reduce } from '../src/core/reducer';
import { tick } from '../src/core/simulation';
import { activeIncidents, withModule } from '../src/core/state';
import type { GameState } from '../src/core/types';
import { newState, owning, rich } from './helpers';
import { REFERENCE_SOLUTIONS } from './solutions';

function advance(s: GameState, seconds: number, dt = 0.5): { state: GameState; events: string[] } {
  let state = s;
  const events: string[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const out = tick(state, dt);
    state = out.state;
    events.push(...out.events.map((e) => e.type));
  }
  return { state, events };
}

describe('tick', () => {
  it('produces resources over time', () => {
    const s = owning(newState(), { capacitor: 10 });
    const out = tick(s, 1);
    expect(out.state.resources.energy).toBeCloseTo(4);
    expect(out.state.lifetime.energy).toBeCloseTo(4);
    expect(out.state.time).toBe(1);
  });

  it('clamps invalid dt', () => {
    const s = owning(newState(), { capacitor: 10 });
    expect(tick(s, Number.NaN).state.time).toBe(0);
    expect(tick(s, 999).state.time).toBe(5);
  });

  it('discovers modules, unlocks logs and achievements', () => {
    const s = { ...newState(), lifetime: { energy: 1000, alloy: 0, data: 0, cores: 0 } };
    const out = tick(s, 0.1);
    expect(out.state.discovered).toContain('solar');
    expect(out.state.logsUnlocked).toEqual(expect.arrayContaining(['log-01', 'log-02']));
    expect(out.state.achievements).toContain('energy-1k');
    const types = out.events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['discover', 'log', 'achievement']));
  });

  it('expires buffs', () => {
    const s = { ...newState(), buffs: [{ id: 'b', label: 'b', mult: 2, until: 0.05 }] };
    expect(tick(s, 0.1).state.buffs).toEqual([]);
  });
});

describe('incidents', () => {
  it('first incident hits the capacitor bank', () => {
    const s = { ...owning(newState(), { capacitor: 3, solar: 2 }), time: FIRST_INCIDENT_AT };
    const out = maybeSpawnIncident(s, computeModifiers(s));
    expect(out.state.modules.capacitor.incident?.puzzleId).toBe('echo-bus');
    expect(out.state.modules.capacitor.incident?.severity).toBe(0.75);
    expect(out.state.nextIncidentAt).toBeGreaterThan(s.time);
    expect(out.events[0]).toMatchObject({ type: 'incident' });
  });

  it('retries later when nothing is eligible', () => {
    const s = { ...newState(), time: FIRST_INCIDENT_AT };
    const out = maybeSpawnIncident(s, computeModifiers(s));
    expect(out.events).toEqual([]);
    expect(out.state.nextIncidentAt).toBeGreaterThan(s.time);
  });

  it('caps simultaneous incidents', () => {
    const s = owning(newState(), { capacitor: 5, solar: 5, drone: 5, datacore: 5, fusion: 5 });
    const { state } = advance(s, 4000, 1);
    expect(activeIncidents(state).length).toBeLessThanOrEqual(3);
    expect(state.stats.incidents).toBeGreaterThan(1);
  });

  it('resolveIncident is a no-op without incident', () => {
    const s = newState();
    expect(resolveIncident(s, 'capacitor', 'patch').state).toBe(s);
  });

  it('auto-repairs after the swarm delay', () => {
    const s0 = { ...owning(newState(), { capacitor: 5 }), upgrades: ['swarm-1'], time: 500 };
    const s = withModule(s0, 'capacitor', {
      incident: {
        ticket: 1,
        module: 'capacitor',
        puzzleId: 'echo-bus',
        severity: 0.5,
        startedAt: 300,
        testSeed: 1,
        summary: '',
        autoTried: false,
      },
    });
    const out = runAutomation(s, computeModifiers(s));
    expect(out.state.modules.capacitor.incident).toBeNull();
    expect(out.events[0]).toMatchObject({ type: 'incidentResolved', method: 'auto' });
  });

  it('daemon auto-deploys valid firmware and flags failures', () => {
    const base = { ...owning(newState(), { capacitor: 5 }), upgrades: ['daemon'], time: 100 };
    const incident = {
      ticket: 1,
      module: 'capacitor' as const,
      puzzleId: 'echo-bus',
      severity: 0.5,
      startedAt: 90,
      testSeed: 1,
      summary: '',
      autoTried: false,
    };
    const good = withModule(
      {
        ...base,
        solutions: {
          'echo-bus': {
            code: REFERENCE_SOLUTIONS['echo-bus'] ?? '',
            cycles: 1,
            size: 1,
            solvedAt: 0,
          },
        },
      },
      'capacitor',
      { incident },
    );
    expect(runAutomation(good, computeModifiers(good)).state.modules.capacitor.incident).toBeNull();
    const bad = withModule(
      { ...base, solutions: { 'echo-bus': { code: 'HLT', cycles: 1, size: 1, solvedAt: 0 } } },
      'capacitor',
      { incident },
    );
    const out = runAutomation(bad, computeModifiers(bad));
    expect(out.state.modules.capacitor.incident?.autoTried).toBe(true);
    expect(out.events[0]).toMatchObject({ type: 'error' });
  });
});

describe('anomalies', () => {
  it('spawns and expires drifting packets', () => {
    const s = owning(newState(), { capacitor: 1 });
    const { state, events } = advance(s, 400);
    expect(events).toContain('anomalySpawned');
    expect(events).toContain('anomalyLost');
    expect(state.stats.anomalies).toBe(0);
  });

  it('does not spawn without modules', () => {
    const { events } = advance(newState(), 300);
    expect(events).not.toContain('anomalySpawned');
  });
});

describe('long run', () => {
  it('a scripted player progresses through the early game', () => {
    let s = newState();
    for (let i = 0; i < 1200; i++) {
      s = reduce(s, { type: 'click' }).state;
      if (i % 10 === 0) {
        s = reduce(s, { type: 'buyModule', id: 'capacitor', qty: 'max' }).state;
        s = reduce(s, { type: 'buyModule', id: 'solar', qty: 'max' }).state;
      }
      s = reduce(s, { type: 'tick', dt: 0.5 }).state;
    }
    expect(s.modules.capacitor.count).toBeGreaterThan(5);
    expect(s.modules.solar.count).toBeGreaterThan(0);
    expect(s.stats.incidents).toBeGreaterThan(0);
    expect(rich(s).resources.energy).toBe(1e15);
  });
});
