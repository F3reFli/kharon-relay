/** Construction de l'état initial et petits utilitaires immuables sur l'état. */

import { FIRST_ANOMALY_AT, FIRST_EVENT_AT, FIRST_INCIDENT_AT, SAVE_VERSION } from './constants';
import { MODULE_IDS } from './data/modules';
import { EMPTY_RESOURCES, add } from './resources';
import type { Cost, GameState, ModuleId, ModuleState, StatId, Stats } from './types';

export const EMPTY_STATS: Stats = {
  clicks: 0,
  crits: 0,
  incidents: 0,
  incidentsResolved: 0,
  puzzlesSolved: 0,
  reboots: 0,
  anomalies: 0,
  patches: 0,
  deploys: 0,
  commands: 0,
  logsRead: 0,
  events: 0,
};

export const EMPTY_MODULE: ModuleState = { count: 0, incident: null, boostUntil: 0 };

export function emptyModules(): Readonly<Record<ModuleId, ModuleState>> {
  return Object.fromEntries(MODULE_IDS.map((id) => [id, EMPTY_MODULE])) as Record<
    ModuleId,
    ModuleState
  >;
}

export function createInitialState(now: number, seed: number): GameState {
  return {
    version: SAVE_VERSION,
    time: 0,
    createdAt: now,
    lastSavedAt: now,
    resources: EMPTY_RESOURCES,
    lifetime: EMPTY_RESOURCES,
    run: EMPTY_RESOURCES,
    stats: EMPTY_STATS,
    modules: emptyModules(),
    upgrades: [],
    perks: {},
    solutions: {},
    drafts: {},
    logsUnlocked: [],
    logsDecrypted: [],
    logsRead: [],
    achievements: [],
    discovered: ['capacitor'],
    flags: [],
    buffs: [],
    anomaly: null,
    nextAnomalyAt: FIRST_ANOMALY_AT,
    nextIncidentAt: FIRST_INCIDENT_AT,
    event: null,
    nextEventAt: FIRST_EVENT_AT,
    lastEventId: null,
    nextTicket: 4471,
    rng: seed | 0,
  };
}

export function bumpStat(state: GameState, stat: StatId, by = 1): GameState {
  return { ...state, stats: { ...state.stats, [stat]: state.stats[stat] + by } };
}

/** Crédite un gain sur les ressources courantes et les totaux (cycle et toujours). */
export function earn(state: GameState, gain: Cost): GameState {
  return {
    ...state,
    resources: add(state.resources, gain),
    lifetime: add(state.lifetime, gain),
    run: add(state.run, gain),
  };
}

export function withModule(state: GameState, id: ModuleId, patch: Partial<ModuleState>): GameState {
  return { ...state, modules: { ...state.modules, [id]: { ...state.modules[id], ...patch } } };
}

export function withFlag(state: GameState, flag: string): GameState {
  return state.flags.includes(flag) ? state : { ...state, flags: [...state.flags, flag] };
}

export function activeIncidents(state: GameState): ModuleId[] {
  return MODULE_IDS.filter((id) => state.modules[id].incident !== null);
}

export function ownedModuleCount(state: GameState): number {
  return MODULE_IDS.reduce((sum, id) => sum + state.modules[id].count, 0);
}
