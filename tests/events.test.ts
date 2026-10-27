import { describe, expect, it } from 'vitest';
import { EVENT_RETRY_DELAY, FIRST_EVENT_AT } from '../src/core/constants';
import { STATION_EVENTS, getStationEvent } from '../src/core/data/events';
import { clickValue, computeModifiers, productionRates } from '../src/core/modifiers';
import { reduce } from '../src/core/reducer';
import { applyOffline, deserialize, serialize } from '../src/core/save';
import { execute } from '../src/core/shell/shell';
import { tick } from '../src/core/simulation';
import {
  activeEventDef,
  choiceCost,
  choiceStatus,
  scaledAmount,
  startEvent,
} from '../src/core/stationEvents';
import type { ActiveEvent, Buff, GameEvent, GameState } from '../src/core/types';
import { newState, owning, rich } from './helpers';

/** Station de milieu de partie, avec production dans les trois ressources. */
function midGame(): GameState {
  const s = owning(newState(), {
    capacitor: 20,
    solar: 10,
    drone: 8,
    datacore: 5,
    fusion: 3,
    relay: 2,
  });
  return { ...rich(s, 1e9), stats: { ...s.stats, clicks: 500 }, time: 1000 };
}

function withEvent(state: GameState, id: string): GameState {
  const out = startEvent(state, id);
  expect(out.state.event?.id).toBe(id);
  return out.state;
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

describe('event catalogue', () => {
  it('has unique ids and playable content', () => {
    const ids = STATION_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STATION_EVENTS.length).toBeGreaterThanOrEqual(8);
    STATION_EVENTS.forEach((def) => {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.text.length).toBeGreaterThan(20);
      expect(def.duration).toBeGreaterThan(0);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.choices.length > 0 || def.clickGoal !== undefined).toBe(true);
      const choiceIds = def.choices.map((c) => c.id);
      expect(new Set(choiceIds).size).toBe(choiceIds.length);
    });
    expect(getStationEvent('nope')).toBeUndefined();
  });
});

describe('scheduling', () => {
  it('waits for the first event slot', () => {
    const s = { ...midGame(), time: 0, nextEventAt: FIRST_EVENT_AT };
    expect(tick(s, 1).state.event).toBeNull();
  });

  it('spawns an eligible event once due', () => {
    const s = { ...midGame(), nextEventAt: 1000 };
    const out = tick(s, 0.5);
    expect(out.state.event).not.toBeNull();
    expect(types(out.events)).toContain('stationEvent');
    expect(out.state.stats.events).toBe(1);
    const def = activeEventDef(out.state);
    expect(def).toBeDefined();
    expect(out.state.event?.expiresAt).toBeCloseTo(out.state.time + (def?.duration ?? 0));
    expect(out.state.achievements).toContain('event-1');
  });

  it('retries later when nothing is eligible', () => {
    const s = { ...owning(newState(), { capacitor: 1 }), time: 500, nextEventAt: 500 };
    const out = tick(s, 0.1);
    expect(out.state.event).toBeNull();
    expect(out.state.nextEventAt).toBeCloseTo(out.state.time + EVENT_RETRY_DELAY);
  });

  it('never draws the same event twice in a row', () => {
    let s: GameState = { ...midGame(), nextEventAt: 1000 };
    let previous: string | null = null;
    for (let i = 0; i < 12; i++) {
      s = tick({ ...s, nextEventAt: s.time }, 0.1).state;
      const id = s.event?.id ?? null;
      expect(id).not.toBeNull();
      expect(id).not.toBe(previous);
      previous = id;
      s = { ...s, event: null, lastEventId: id };
    }
  });

  it('does not stack events', () => {
    const s = withEvent({ ...midGame(), nextEventAt: 0 }, 'wreck');
    const out = tick(s, 0.1);
    expect(out.state.event?.id).toBe('wreck');
    expect(types(out.events)).not.toContain('stationEvent');
  });

  it('refuses to start unknown events', () => {
    const out = startEvent(midGame(), 'nope');
    expect(out.state.event).toBeNull();
    expect(out.events).toEqual([]);
  });
});

describe('scaled amounts', () => {
  it('uses production seconds with a floor', () => {
    const rates = { energy: 10, alloy: 0, data: 2, cores: 0 };
    expect(scaledAmount(rates, { resource: 'energy', seconds: 30, min: 50 })).toBe(300);
    expect(scaledAmount(rates, { resource: 'alloy', seconds: 30, min: 50 })).toBe(50);
  });

  it('prices choices from current production', () => {
    const s = midGame();
    const shields = getStationEvent('meteor-shower')?.choices.find((c) => c.id === 'shields');
    expect(shields).toBeDefined();
    if (!shields) return;
    const cost = choiceCost(s, shields);
    const rate = productionRates(s, computeModifiers(s)).energy;
    expect(cost.energy).toBeCloseTo(Math.max(100, rate * 45));
  });
});

describe('answering', () => {
  it('pays the cost, applies effects and closes the event', () => {
    const s = withEvent(midGame(), 'ghost-signal');
    const before = s.resources.data;
    const out = reduce(s, { type: 'answerEvent', choice: 'answer' });
    expect(out.state.event).toBeNull();
    expect(out.state.resources.data).toBeLessThan(before);
    expect(out.state.flags).toContain('ghost-answered');
    expect(out.state.buffs.some((b) => b.id === 'ghost-guidance')).toBe(true);
    expect(tick(out.state, 0.1).state.logsUnlocked).toContain('log-f7');
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: 'stationEventEnded', id: 'ghost-signal', result: 'choice' }),
    );
    expect(out.state.nextEventAt).toBeGreaterThan(out.state.time);
  });

  it('grants scaled rewards', () => {
    const s = withEvent(midGame(), 'wreck');
    const out = reduce(s, { type: 'answerEvent', choice: 'salvage' });
    expect(out.state.resources.alloy).toBeGreaterThan(s.resources.alloy);
    expect(out.state.resources.energy).toBeGreaterThan(s.resources.energy);
  });

  it('rejects invalid answers', () => {
    const none = reduce(midGame(), { type: 'answerEvent', choice: 'answer' });
    expect(types(none.events)).toEqual(['error']);
    const s = withEvent(midGame(), 'ghost-signal');
    expect(types(reduce(s, { type: 'answerEvent', choice: 'dance' }).events)).toEqual(['error']);
    const broke = { ...s, resources: { energy: 0, alloy: 0, data: 0, cores: 0 } };
    expect(choiceStatus(broke, getStationEvent('ghost-signal')!.choices[0]!).ok).toBe(false);
    const res = reduce(broke, { type: 'answerEvent', choice: 'answer' });
    expect(types(res.events)).toEqual(['error']);
    expect(res.state.event).not.toBeNull();
  });

  it('refuses answers once the window has closed', () => {
    const s = withEvent(midGame(), 'wreck');
    const late = { ...s, time: s.event?.expiresAt ?? 0 };
    const out = reduce(late, { type: 'answerEvent', choice: 'salvage' });
    expect(types(out.events)).toEqual(['error']);
    expect(out.state.resources.alloy).toBe(late.resources.alloy);
  });

  it('honours choice requirements', () => {
    const s = withEvent(owning(midGame(), { siphon: 0 }), 'neree-storm');
    const tap = getStationEvent('neree-storm')?.choices.find((c) => c.id === 'tap');
    expect(tap?.requires).toBeDefined();
    if (!tap) return;
    expect(choiceStatus(s, tap)).toMatchObject({ ok: false });
    expect(types(reduce(s, { type: 'answerEvent', choice: 'tap' }).events)).toEqual(['error']);
    const withSiphon = owning(s, { siphon: 1 });
    expect(choiceStatus(withSiphon, tap).ok).toBe(true);
    const out = reduce(withSiphon, { type: 'answerEvent', choice: 'tap' });
    expect(out.state.buffs.find((b) => b.id === 'storm-tap')?.target).toEqual({
      kind: 'module',
      module: 'siphon',
    });
  });

  it('can schedule an incident through risky choices', () => {
    const s = { ...withEvent(midGame(), 'meteor-shower'), nextIncidentAt: 99_999 };
    const results = Array.from({ length: 30 }, (_, i) => {
      const seeded = { ...s, rng: i * 7919 };
      return reduce(seeded, { type: 'answerEvent', choice: 'harvest' }).state.nextIncidentAt;
    });
    const soon = results.filter((t) => t <= s.time + 5).length;
    expect(soon).toBeGreaterThan(0);
    expect(soon).toBeLessThan(30);
  });
});

describe('expiry', () => {
  it('applies the penalty when nobody answers', () => {
    const s = { ...withEvent(midGame(), 'meteor-shower'), nextIncidentAt: 99_999 };
    const end = s.event?.expiresAt ?? 0;
    const out = tick({ ...s, time: end - 0.05 }, 0.1);
    expect(out.state.event).toBeNull();
    expect(out.state.nextIncidentAt).toBeLessThanOrEqual(out.state.time + 5);
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: 'stationEventEnded', result: 'expired' }),
    );
  });
});

describe('click goals', () => {
  it('amplifies clicks during a resonance and rewards the goal', () => {
    const base = midGame();
    const s = withEvent(base, 'resonance');
    const mods = computeModifiers(s);
    expect(clickValue(s, mods)).toBeCloseTo(clickValue(base, computeModifiers(base)) * 7);
    const goal = getStationEvent('resonance')?.clickGoal?.count ?? 0;
    let state = s;
    const seen: GameEvent[] = [];
    for (let i = 0; i < goal; i++) {
      const out = reduce(state, { type: 'click' });
      state = out.state;
      seen.push(...out.events);
    }
    expect(state.event).toBeNull();
    expect(state.flags).toContain('harmonic');
    expect(state.achievements).toContain('harmonic');
    expect(state.buffs.some((b) => b.id === 'harmonic')).toBe(true);
    expect(seen).toContainEqual(
      expect.objectContaining({ type: 'stationEventEnded', result: 'goal' }),
    );
  });

  it('counts progress without finishing early', () => {
    const s = withEvent(midGame(), 'blackout');
    const out = reduce(s, { type: 'click' });
    expect(out.state.event?.progress).toBe(1);
  });

  it('halves production during a blackout until the core is restarted', () => {
    const base = midGame();
    const s = withEvent(base, 'blackout');
    const before = productionRates(base, computeModifiers(base)).energy;
    expect(productionRates(s, computeModifiers(s)).energy).toBeCloseTo(before * 0.5);
    let state = s;
    for (let i = 0; i < (getStationEvent('blackout')?.clickGoal?.count ?? 0); i++)
      state = reduce(state, { type: 'click' }).state;
    expect(state.buffs.some((b) => b.id === 'blackout')).toBe(false);
    expect(state.buffs.some((b) => b.id === 'hot-restart')).toBe(true);
    expect(state.flags).toContain('restarted');
  });

  it('ignores clicks for events without a goal', () => {
    const s = withEvent(midGame(), 'wreck');
    expect(reduce(s, { type: 'click' }).state.event?.progress).toBe(0);
  });
});

describe('targeted buffs', () => {
  const buff = (target: Buff['target'], mult = 3): Buff => ({
    id: 'test',
    label: 'test',
    mult,
    until: 2000,
    target,
  });

  it('scopes multipliers to modules, resources, clicks or everything', () => {
    const s = midGame();
    const mods = computeModifiers(s);
    const base = productionRates(s, mods);
    const solar = productionRates(
      { ...s, buffs: [buff({ kind: 'module', module: 'solar' })] },
      mods,
    );
    expect(solar.energy).toBeGreaterThan(base.energy);
    expect(solar.alloy).toBeCloseTo(base.alloy);
    const alloy = productionRates(
      { ...s, buffs: [buff({ kind: 'resource', resource: 'alloy' })] },
      mods,
    );
    expect(alloy.alloy).toBeCloseTo(base.alloy * 3);
    expect(alloy.energy).toBeCloseTo(base.energy);
    const click = { ...s, buffs: [buff({ kind: 'click' })] };
    expect(productionRates(click, mods).energy).toBeCloseTo(base.energy);
    expect(clickValue(click, mods)).toBeCloseTo(clickValue(s, mods) * 3);
    const legacy = productionRates({ ...s, buffs: [buff(undefined, 2)] }, mods);
    expect(legacy.data).toBeCloseTo(base.data * 2);
  });
});

describe('persistence & lifecycle', () => {
  it('round-trips events and targeted buffs', () => {
    const s = withEvent(midGame(), 'neree-storm');
    const answered = reduce(s, { type: 'answerEvent', choice: 'listen' }).state;
    const again = withEvent(answered, 'blackout');
    const res = deserialize(serialize(again, 5_000_000));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.event?.id).toBe('blackout');
    expect(res.state.buffs.find((b) => b.id === 'storm-listen')?.target).toEqual({
      kind: 'resource',
      resource: 'data',
    });
  });

  it('rejects forged events', () => {
    const s = withEvent(midGame(), 'wreck');
    const forged = { ...s, event: { ...(s.event as ActiveEvent), progress: -4 } };
    expect(deserialize(serialize(forged, 1)).ok).toBe(false);
  });

  it('rejects events with an impossible duration', () => {
    const s = withEvent(midGame(), 'wreck');
    const event = s.event as ActiveEvent;
    const forever = { ...s, event: { ...event, expiresAt: event.startedAt + 1e12 } };
    expect(deserialize(serialize(forever, 1)).ok).toBe(false);
    const backwards = { ...s, event: { ...event, expiresAt: event.startedAt - 5 } };
    expect(deserialize(serialize(backwards, 1)).ok).toBe(false);
  });

  it('applies an ignored alert penalty when the player leaves', () => {
    const risky = { ...withEvent(midGame(), 'meteor-shower'), nextIncidentAt: 99_999 };
    const away = applyOffline({ ...risky, lastSavedAt: 0 }, 3_600_000).state;
    expect(away.event).toBeNull();
    expect(away.nextIncidentAt).toBeCloseTo(away.time + 30);
    const calm = { ...withEvent(midGame(), 'convoy'), nextIncidentAt: 99_999 };
    expect(applyOffline({ ...calm, lastSavedAt: 0 }, 3_600_000).state.nextIncidentAt).toBe(99_999);
  });

  it('drops the event while offline and only counts global buffs', () => {
    const s = withEvent(midGame(), 'resonance');
    const { state } = applyOffline({ ...s, lastSavedAt: 0 }, 3_600_000);
    expect(state.event).toBeNull();
    expect(state.nextEventAt).toBeGreaterThan(state.time);
  });

  it('clears the event on reboot', () => {
    const s = withEvent(
      { ...midGame(), run: { energy: 1e9, alloy: 0, data: 0, cores: 0 } },
      'wreck',
    );
    const out = reduce(s, { type: 'reboot' });
    expect(out.state.event).toBeNull();
    expect(out.state.nextEventAt).toBeGreaterThan(out.state.time);
  });
});

describe('terminal', () => {
  const ctx = (state: GameState) => ({
    state,
    cwd: '/home/warden',
    history: [],
    now: new Date('2026-10-27T10:00:00Z'),
    notation: 'suffix' as const,
  });
  const text = (lines: readonly { text: string }[]) => lines.map((l) => l.text).join('\n');

  it('describes the current event', () => {
    expect(text(execute('event', ctx(midGame())).lines)).toContain('Aucun événement');
    const s = withEvent(midGame(), 'convoy');
    const out = execute('event', ctx(s));
    expect(text(out.lines)).toContain('CONVOI');
    expect(text(out.lines)).toContain('1.');
  });

  it('answers by number or id', () => {
    const s = withEvent(midGame(), 'convoy');
    const byNumber = execute('event 3', ctx(s));
    expect(byNumber.actions).toContainEqual({
      type: 'dispatch',
      action: { type: 'answerEvent', choice: 'ignore' },
    });
    const byId = execute('event sell-energy', ctx(s));
    expect(byId.actions).toContainEqual({
      type: 'dispatch',
      action: { type: 'answerEvent', choice: 'sell-energy' },
    });
    expect(execute('event 9', ctx(s)).lines[0]?.tone).toBe('err');
  });

  it('explains click goals', () => {
    const s = withEvent(midGame(), 'blackout');
    expect(text(execute('event', ctx(s)).lines)).toContain('impulsions');
    expect(execute('event 1', ctx(s)).lines[0]?.tone).toBe('err');
  });
});
