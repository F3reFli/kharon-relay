/** Génération et résolution des incidents (pannes de modules). */

import {
  AUTO_DEPLOY_DELAY,
  DEBUG_BOOST_SECONDS,
  INCIDENT_MEAN_INTERVAL,
  INCIDENT_RETRY_DELAY,
  MAX_ACTIVE_INCIDENTS,
} from './constants';
import { judge } from './asm/judge';
import { MODULES, getModule } from './data/modules';
import { getPuzzle } from './data/puzzles';
import type { Modifiers } from './modifiers';
import { nextExponential, nextInt, nextRandom, nextWeighted } from './rng';
import { activeIncidents, bumpStat, withModule } from './state';
import type { GameEvent, GameState, Incident, ModuleId, Outcome } from './types';

const SUMMARIES: Readonly<Record<ModuleId, readonly string[]>> = {
  capacitor: ["Bus d'écho muet : impulsions perdues", 'Fuite diélectrique sur le banc 3'],
  solar: ['Onduleur saturé par des cellules mortes', "Relevés négatifs sur l'aile bâbord"],
  drone: ['Télémétrie des drones incohérente', 'Masse de fret mal calculée'],
  datacore: ['Somme de contrôle invalide', "Blocs corrompus dans l'archive 7"],
  fusion: ['Sondes thermiques muettes', 'Alerte de surchauffe du tokamak'],
  relay: ['Perte du verrouillage de fréquence', 'Pic de signal non détecté'],
  foundry: ['Séquence de coulée bloquée', 'Four 2 en boucle infinie'],
  siphon: ['Ancres de marée désordonnées', 'Tension du faisceau instable'],
  lattice: ['Index mémoire désynchronisé', 'Décohérence du treillis'],
  antimatter: ['Déséquilibre des bobines', 'Fluctuation du confinement magnétique'],
};

function scheduleNext(state: GameState, mods: Modifiers): GameState {
  const roll = nextExponential(state.rng, INCIDENT_MEAN_INTERVAL * mods.stability);
  return { ...state, rng: roll.seed, nextIncidentAt: state.time + Math.max(30, roll.value) };
}

function eligibleModules(state: GameState): ModuleId[] {
  return MODULES.filter(
    (m) => state.modules[m.id].count > 0 && state.modules[m.id].incident === null,
  ).map((m) => m.id);
}

/** Crée un incident si l'horloge le permet. Le premier incident cible toujours le banc de condensateurs. */
export function maybeSpawnIncident(state: GameState, mods: Modifiers): Outcome {
  if (state.time < state.nextIncidentAt) return { state, events: [] };
  const candidates = eligibleModules(state);
  if (candidates.length === 0 || activeIncidents(state).length >= MAX_ACTIVE_INCIDENTS) {
    return { state: { ...state, nextIncidentAt: state.time + INCIDENT_RETRY_DELAY }, events: [] };
  }
  const isTutorial = state.stats.incidents === 0 && candidates.includes('capacitor');
  const weights = candidates.map(
    (id) => (getModule(id)?.risk ?? 1) * Math.sqrt(state.modules[id].count),
  );
  const pick = isTutorial
    ? { value: candidates.indexOf('capacitor'), seed: state.rng }
    : nextWeighted(state.rng, weights);
  const module = candidates[pick.value] ?? candidates[0] ?? 'capacitor';
  const sev = nextRandom(pick.seed);
  const seedRoll = nextInt(sev.seed, 1, 2 ** 30);
  const textRoll = nextInt(seedRoll.seed, 0, (SUMMARIES[module].length ?? 1) - 1);
  const incident: Incident = {
    ticket: state.nextTicket,
    module,
    puzzleId: getModule(module)?.puzzleId ?? 'echo-bus',
    severity: isTutorial ? 0.75 : Math.round((0.5 + sev.value * 0.5) * 20) / 20,
    startedAt: state.time,
    testSeed: seedRoll.value,
    summary: SUMMARIES[module][textRoll.value] ?? 'Défaillance inconnue',
    autoTried: false,
  };
  const withIncident = withModule(
    { ...state, rng: textRoll.seed, nextTicket: state.nextTicket + 1 },
    module,
    { incident },
  );
  return {
    state: scheduleNext(bumpStat(withIncident, 'incidents'), mods),
    events: [{ type: 'incident', incident }],
  };
}

export function resolveIncident(
  state: GameState,
  module: ModuleId,
  method: 'patch' | 'debug' | 'deploy' | 'auto',
): Outcome {
  if (!state.modules[module].incident) return { state, events: [] };
  const boostUntil =
    method === 'debug' ? state.time + DEBUG_BOOST_SECONDS : state.modules[module].boostUntil;
  const next = bumpStat(
    withModule(state, module, { incident: null, boostUntil }),
    'incidentsResolved',
  );
  return { state: next, events: [{ type: 'incidentResolved', module, method }] };
}

/** Vérifie si le firmware enregistré pour ce ticket passe les tests de l'incident. */
export function savedSolutionPasses(state: GameState, incident: Incident): boolean {
  const solution = state.solutions[incident.puzzleId];
  const puzzle = getPuzzle(incident.puzzleId);
  if (!solution || !puzzle) return false;
  return judge(puzzle, solution.code, incident.testSeed).passed;
}

/** Démon de maintenance et essaim réparateur : résolutions automatiques. */
export function runAutomation(state: GameState, mods: Modifiers): Outcome {
  return activeIncidents(state).reduce<Outcome>(
    (acc, id) => {
      const incident = acc.state.modules[id].incident;
      if (!incident) return acc;
      const age = acc.state.time - incident.startedAt;
      if (mods.autoRepair !== null && age >= mods.autoRepair) {
        const res = resolveIncident(acc.state, id, 'auto');
        return { state: res.state, events: [...acc.events, ...res.events] };
      }
      if (
        mods.autoDeploy &&
        !incident.autoTried &&
        age >= AUTO_DEPLOY_DELAY &&
        acc.state.solutions[incident.puzzleId]
      ) {
        if (savedSolutionPasses(acc.state, incident)) {
          const res = resolveIncident(bumpStat(acc.state, 'deploys'), id, 'deploy');
          return { state: res.state, events: [...acc.events, ...res.events] };
        }
        const failed: GameEvent = {
          type: 'error',
          message: `Démon : le firmware ${incident.puzzleId} échoue sur le ticket #${incident.ticket}.`,
        };
        return {
          state: withModule(acc.state, id, { incident: { ...incident, autoTried: true } }),
          events: [...acc.events, failed],
        };
      }
      return acc;
    },
    { state, events: [] },
  );
}
