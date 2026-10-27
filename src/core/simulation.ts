/** Pas de simulation : production, incidents, anomalies, découvertes, journaux et succès. */

import { ANOMALY_LIFETIME, ANOMALY_MEAN_INTERVAL } from './constants';
import { evaluate, evaluateAchievement } from './conditions';
import { ACHIEVEMENTS } from './data/achievements';
import { LOGS } from './data/lore';
import { MODULES } from './data/modules';
import { UPGRADES } from './data/upgrades';
import { maybeSpawnIncident, runAutomation } from './incidents';
import { computeModifiers, productionRates, type Modifiers } from './modifiers';
import { add, scale } from './resources';
import { nextExponential, nextInt } from './rng';
import { ownedModuleCount } from './state';
import { updateStationEvent } from './stationEvents';
import type { GameEvent, GameState, Outcome } from './types';

type Step = (state: GameState, mods: Modifiers) => Outcome;

function produce(state: GameState, mods: Modifiers, dt: number): GameState {
  const gain = scale(productionRates(state, mods), dt);
  return {
    ...state,
    time: state.time + dt,
    resources: add(state.resources, gain),
    lifetime: add(state.lifetime, gain),
    run: add(state.run, gain),
  };
}

const expireBuffs: Step = (state) => {
  const live = state.buffs.filter((b) => b.until > state.time);
  return {
    state: live.length === state.buffs.length ? state : { ...state, buffs: live },
    events: [],
  };
};

const updateAnomaly: Step = (state) => {
  if (state.anomaly && state.time >= state.anomaly.expiresAt) {
    const roll = nextExponential(state.rng, ANOMALY_MEAN_INTERVAL);
    return {
      state: {
        ...state,
        anomaly: null,
        rng: roll.seed,
        nextAnomalyAt: state.time + Math.max(45, roll.value),
      },
      events: [{ type: 'anomalyLost' }],
    };
  }
  if (state.anomaly || state.time < state.nextAnomalyAt || ownedModuleCount(state) === 0) {
    return { state, events: [] };
  }
  const seed = nextInt(state.rng, 1, 2 ** 30);
  const anomaly = {
    id: state.nextTicket,
    spawnedAt: state.time,
    expiresAt: state.time + ANOMALY_LIFETIME,
    seed: seed.value,
  };
  return {
    state: { ...state, anomaly, rng: seed.seed, nextTicket: state.nextTicket + 1 },
    events: [{ type: 'anomalySpawned', anomaly }],
  };
};

const discover: Step = (state) => {
  const modules = MODULES.filter(
    (m) => !state.discovered.includes(m.id) && evaluate(state, m.unlock),
  );
  const upgrades = UPGRADES.filter(
    (u) =>
      !state.discovered.includes(u.id) &&
      !state.upgrades.includes(u.id) &&
      evaluate(state, u.unlock),
  );
  if (modules.length === 0 && upgrades.length === 0) return { state, events: [] };
  const events: GameEvent[] = [
    ...modules.map((m): GameEvent => ({ type: 'discover', kind: 'module', id: m.id })),
    ...upgrades.map((u): GameEvent => ({ type: 'discover', kind: 'upgrade', id: u.id })),
  ];
  const ids = [...modules.map((m) => m.id), ...upgrades.map((u) => u.id)];
  return { state: { ...state, discovered: [...state.discovered, ...ids] }, events };
};

const unlockLogs: Step = (state) => {
  const fresh = LOGS.filter((l) => !state.logsUnlocked.includes(l.id) && evaluate(state, l.unlock));
  if (fresh.length === 0) return { state, events: [] };
  return {
    state: { ...state, logsUnlocked: [...state.logsUnlocked, ...fresh.map((l) => l.id)] },
    events: fresh.map((l): GameEvent => ({ type: 'log', id: l.id })),
  };
};

export const checkAchievements: Step = (state) => {
  const fresh = ACHIEVEMENTS.filter(
    (a) => !state.achievements.includes(a.id) && evaluateAchievement(state, a),
  );
  if (fresh.length === 0) return { state, events: [] };
  return {
    state: { ...state, achievements: [...state.achievements, ...fresh.map((a) => a.id)] },
    events: fresh.map((a): GameEvent => ({ type: 'achievement', id: a.id })),
  };
};

/** Enchaîne des étapes en accumulant les événements. */
export function pipeline(state: GameState, mods: Modifiers, steps: readonly Step[]): Outcome {
  return steps.reduce<Outcome>(
    (acc, stepFn) => {
      const res = stepFn(acc.state, mods);
      return {
        state: res.state,
        events: res.events.length ? [...acc.events, ...res.events] : acc.events,
      };
    },
    { state, events: [] },
  );
}

export function tick(state: GameState, dt: number): Outcome {
  const safeDt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 5) : 0;
  const mods = computeModifiers(state);
  const produced = produce(state, mods, safeDt);
  return pipeline(produced, mods, [
    expireBuffs,
    maybeSpawnIncident,
    runAutomation,
    updateAnomaly,
    updateStationEvent,
    discover,
    unlockLogs,
    checkAchievements,
  ]);
}
