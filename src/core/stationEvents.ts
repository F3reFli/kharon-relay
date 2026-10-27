/** Événements de station : apparition, réponses, objectifs d'impulsions et expiration. */

import { describeCondition, evaluate } from './conditions';
import {
  EVENT_INCIDENT_DELAY,
  EVENT_MEAN_INTERVAL,
  EVENT_MIN_INTERVAL,
  EVENT_RETRY_DELAY,
} from './constants';
import { STATION_EVENTS, getStationEvent } from './data/events';
import { computeModifiers, productionRates } from './modifiers';
import { canAfford, subtract } from './resources';
import { nextExponential, nextInt, nextRandom, nextWeighted } from './rng';
import { bumpStat, earn, ownedModuleCount, withFlag } from './state';
import type {
  ActiveEvent,
  Buff,
  Cost,
  EventChoice,
  EventEffect,
  GameEvent,
  GameState,
  Outcome,
  Resources,
  ScaledAmount,
  StationEventDef,
} from './types';

export interface ChoiceStatus {
  readonly ok: boolean;
  readonly reason: string | null;
}

const idle = (state: GameState): Outcome => ({ state, events: [] });
const fail = (state: GameState, message: string): Outcome => ({
  state,
  events: [{ type: 'error', message }],
});

function currentRates(state: GameState): Resources {
  return productionRates(state, computeModifiers(state));
}

/** Montant indexé sur la production : `secondes × taux`, jamais sous le plancher. */
export function scaledAmount(rates: Resources, amount: ScaledAmount): number {
  return Math.max(amount.min, rates[amount.resource] * amount.seconds);
}

export function choiceCost(
  state: GameState,
  choice: EventChoice,
  rates: Resources = currentRates(state),
): Cost {
  return choice.cost.reduce<Cost>(
    (acc, c) => ({ ...acc, [c.resource]: (acc[c.resource] ?? 0) + scaledAmount(rates, c) }),
    {},
  );
}

/** Une réponse est-elle possible maintenant ? Sinon, pourquoi. */
export function choiceStatus(state: GameState, choice: EventChoice): ChoiceStatus {
  if (choice.requires && !evaluate(state, choice.requires))
    return { ok: false, reason: `requis : ${describeCondition(choice.requires)}` };
  if (!canAfford(state.resources, choiceCost(state, choice)))
    return { ok: false, reason: 'Ressources insuffisantes.' };
  return { ok: true, reason: null };
}

export function activeEventDef(state: GameState): StationEventDef | undefined {
  return state.event ? getStationEvent(state.event.id) : undefined;
}

function applyEffect(state: GameState, effect: EventEffect, rates: Resources): GameState {
  switch (effect.kind) {
    case 'buff': {
      const buff: Buff = {
        id: effect.id,
        label: effect.label,
        mult: effect.mult,
        until: state.time + effect.seconds,
        target: effect.target,
      };
      return { ...state, buffs: [...state.buffs.filter((b) => b.id !== effect.id), buff] };
    }
    case 'clearBuff':
      return { ...state, buffs: state.buffs.filter((b) => b.id !== effect.id) };
    case 'grant':
      return earn(state, { [effect.amount.resource]: scaledAmount(rates, effect.amount) });
    case 'incident': {
      const roll = nextRandom(state.rng);
      const soon = state.time + EVENT_INCIDENT_DELAY;
      return {
        ...state,
        rng: roll.seed,
        nextIncidentAt:
          roll.value < effect.chance ? Math.min(state.nextIncidentAt, soon) : state.nextIncidentAt,
      };
    }
    case 'flag':
      return withFlag(state, effect.flag);
  }
}

/** Applique des effets avec les taux de production d'avant leur application. */
function applyEffects(
  state: GameState,
  effects: readonly EventEffect[],
  rates: Resources = currentRates(state),
): Outcome {
  if (effects.length === 0) return idle(state);
  const next = effects.reduce((s, e) => applyEffect(s, e, rates), state);
  const events = effects.flatMap((e): GameEvent[] =>
    e.kind === 'flag' && !state.flags.includes(e.flag) ? [{ type: 'flag', flag: e.flag }] : [],
  );
  return { state: next, events };
}

function scheduleNext(state: GameState): GameState {
  const roll = nextExponential(state.rng, EVENT_MEAN_INTERVAL);
  return {
    ...state,
    rng: roll.seed,
    nextEventAt: state.time + Math.max(EVENT_MIN_INTERVAL, roll.value),
  };
}

/** Enchaîne des effets puis clôt l'événement en cours. */
function finish(
  state: GameState,
  id: string,
  effects: readonly EventEffect[],
  outcome: string,
  result: 'choice' | 'goal' | 'expired',
  rates?: Resources,
): Outcome {
  const applied = applyEffects(state, effects, rates);
  const closed = scheduleNext({ ...applied.state, event: null, lastEventId: id });
  const ended: GameEvent = { type: 'stationEventEnded', id, outcome, result };
  return { state: closed, events: [...applied.events, ended] };
}

/** Ouvre un événement précis (tirage, tests, commandes de débogage). */
export function startEvent(state: GameState, id: string): Outcome {
  const def = getStationEvent(id);
  if (!def || state.event) return idle(state);
  const seed = nextInt(state.rng, 1, 2 ** 30);
  const event: ActiveEvent = {
    id,
    serial: state.nextTicket,
    startedAt: state.time,
    expiresAt: state.time + def.duration,
    progress: 0,
    seed: seed.value,
  };
  const opened = bumpStat(
    { ...state, event, rng: seed.seed, nextTicket: state.nextTicket + 1 },
    'events',
  );
  const applied = applyEffects(opened, def.onStart);
  return { state: applied.state, events: [{ type: 'stationEvent', event }, ...applied.events] };
}

/** Tirage pondéré parmi les événements débloqués, sans répéter le précédent si possible. */
function drawEvent(state: GameState): Outcome {
  const eligible = STATION_EVENTS.filter((d) => evaluate(state, d.unlock));
  const pool = eligible.length > 1 ? eligible.filter((d) => d.id !== state.lastEventId) : eligible;
  if (pool.length === 0) return idle({ ...state, nextEventAt: state.time + EVENT_RETRY_DELAY });
  const pick = nextWeighted(
    state.rng,
    pool.map((d) => d.weight),
  );
  const def = pool[pick.value] ?? pool[0];
  return def ? startEvent({ ...state, rng: pick.seed }, def.id) : idle(state);
}

/** Étape de simulation : expiration de l'événement en cours, ou apparition du suivant. */
export function updateStationEvent(state: GameState): Outcome {
  const event = state.event;
  if (event) {
    const def = getStationEvent(event.id);
    if (!def) return finish(state, event.id, [], '', 'expired');
    if (state.time < event.expiresAt) return idle(state);
    return finish(state, event.id, def.onExpire, def.expireText, 'expired');
  }
  if (state.time < state.nextEventAt || ownedModuleCount(state) === 0) return idle(state);
  return drawEvent(state);
}

export function answerEvent(state: GameState, choiceId: string): Outcome {
  const def = activeEventDef(state);
  if (!def || !state.event) return fail(state, 'Aucun événement en cours.');
  if (state.time >= state.event.expiresAt) return fail(state, 'Trop tard : la fenêtre est close.');
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return fail(state, 'Réponse impossible pour cet événement.');
  const status = choiceStatus(state, choice);
  if (!status.ok) return fail(state, status.reason ?? 'Réponse impossible.');
  const rates = currentRates(state);
  const paid = { ...state, resources: subtract(state.resources, choiceCost(state, choice, rates)) };
  return finish(paid, def.id, choice.effects, choice.outcome, 'choice', rates);
}

/** Clôt l'événement ouvert comme s'il avait expiré (départ du joueur, progression hors-ligne). */
export function expireOpenEvent(state: GameState): GameState {
  const event = state.event;
  if (!event) return state;
  const def = getStationEvent(event.id);
  return finish(state, event.id, def?.onExpire ?? [], def?.expireText ?? '', 'expired').state;
}

/** Une impulsion manuelle fait progresser l'objectif de l'événement en cours. */
export function eventClick(state: GameState): Outcome {
  const event = state.event;
  const goal = event ? getStationEvent(event.id)?.clickGoal : undefined;
  if (!event || !goal) return idle(state);
  const progress = event.progress + 1;
  if (progress < goal.count) return idle({ ...state, event: { ...event, progress } });
  return finish(state, event.id, goal.effects, goal.outcome, 'goal');
}
