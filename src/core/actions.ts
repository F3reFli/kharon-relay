/** Actions du joueur : achats, impulsions, réparations, journaux, redémarrage. */

import { CRIT_MULTIPLIER, PRACTICE_SEED } from './constants';
import { evaluate } from './conditions';
import { moduleCost, maxAffordable, patchCost, rebootFragments } from './costs';
import { judge } from './asm/judge';
import { MAX_CODE_LENGTH } from './asm/parser';
import { getLog } from './data/lore';
import { getModule } from './data/modules';
import { getPuzzle } from './data/puzzles';
import { PERKS, getPerk, getUpgrade, perkCost } from './data/upgrades';
import { resolveIncident, savedSolutionPasses } from './incidents';
import { clickValue, computeModifiers, productionRates } from './modifiers';
import { add, canAfford, scale, subtract } from './resources';
import { nextRandom } from './rng';
import { bumpStat, emptyModules, withFlag, withModule } from './state';
import type { Cost, GameEvent, GameState, ModuleId, Outcome, Resources } from './types';

const nothing = (state: GameState): Outcome => ({ state, events: [] });
const fail = (state: GameState, message: string): Outcome => ({
  state,
  events: [{ type: 'error', message }],
});

function earn(state: GameState, gain: Cost): GameState {
  return {
    ...state,
    resources: add(state.resources, gain),
    lifetime: add(state.lifetime, gain),
    run: add(state.run, gain),
  };
}

export function click(state: GameState): Outcome {
  const mods = computeModifiers(state);
  const roll = nextRandom(state.rng);
  const crit = roll.value < mods.critChance;
  const amount = clickValue(state, mods) * (crit ? CRIT_MULTIPLIER : 1);
  const counted = bumpStat(
    bumpStat({ ...earn(state, { energy: amount }), rng: roll.seed }, 'clicks'),
    'crits',
    crit ? 1 : 0,
  );
  return { state: counted, events: [{ type: 'click', amount, crit }] };
}

export function buyModule(state: GameState, id: ModuleId, qty: number | 'max'): Outcome {
  const def = getModule(id);
  if (!def || !evaluate(state, def.unlock)) return fail(state, 'Module indisponible.');
  const mods = computeModifiers(state);
  const n = qty === 'max' ? maxAffordable(state, def, mods.costMult) : Math.floor(qty);
  if (n <= 0) return fail(state, 'Ressources insuffisantes.');
  const cost = moduleCost(def, state.modules[id].count, n, mods.costMult);
  if (!canAfford(state.resources, cost)) return fail(state, 'Ressources insuffisantes.');
  const paid = { ...state, resources: subtract(state.resources, cost) };
  return {
    state: withModule(paid, id, { count: state.modules[id].count + n }),
    events: [{ type: 'purchase', kind: 'module', id, qty: n }],
  };
}

export function buyUpgrade(state: GameState, id: string): Outcome {
  const def = getUpgrade(id);
  if (!def || state.upgrades.includes(id) || !evaluate(state, def.unlock))
    return fail(state, 'Protocole indisponible.');
  if (!canAfford(state.resources, def.cost)) return fail(state, 'Ressources insuffisantes.');
  const flags = def.effects.flatMap((e) => (e.kind === 'flag' ? [e.flag] : []));
  const paid: GameState = {
    ...state,
    resources: subtract(state.resources, def.cost),
    upgrades: [...state.upgrades, id],
  };
  const flagged = flags.reduce(withFlag, paid);
  const events: GameEvent[] = [
    { type: 'purchase', kind: 'upgrade', id, qty: 1 },
    ...flags.map((flag): GameEvent => ({ type: 'flag', flag })),
  ];
  return { state: flagged, events };
}

export function buyPerk(state: GameState, id: string): Outcome {
  const def = getPerk(id);
  if (!def) return fail(state, 'Perk inconnu.');
  const level = state.perks[id] ?? 0;
  if (level >= def.maxLevel) return fail(state, 'Niveau maximal atteint.');
  const cost = perkCost(def, level);
  if (state.resources.cores < cost) return fail(state, 'Fragments insuffisants.');
  return {
    state: {
      ...state,
      resources: subtract(state.resources, { cores: cost }),
      perks: { ...state.perks, [id]: level + 1 },
    },
    events: [{ type: 'purchase', kind: 'perk', id, qty: 1 }],
  };
}

export function patch(state: GameState, module: ModuleId): Outcome {
  if (!state.modules[module].incident) return fail(state, 'Aucun incident sur ce module.');
  const cost = patchCost(state, module, computeModifiers(state));
  if (!canAfford(state.resources, cost))
    return fail(state, 'Ressources insuffisantes pour la réparation.');
  return resolveIncident(
    bumpStat({ ...state, resources: subtract(state.resources, cost) }, 'patches'),
    module,
    'patch',
  );
}

export function deploy(state: GameState, module: ModuleId): Outcome {
  const incident = state.modules[module].incident;
  if (!incident) return fail(state, 'Aucun incident sur ce module.');
  if (!state.solutions[incident.puzzleId])
    return fail(state, 'Aucun firmware enregistré pour ce ticket.');
  if (!savedSolutionPasses(state, incident)) {
    return fail(
      state,
      `Le firmware enregistré échoue sur le ticket #${incident.ticket}. Ouvrez l'éditeur.`,
    );
  }
  return resolveIncident(bumpStat(state, 'deploys'), module, 'deploy');
}

/** Graines de contrôle : un firmware plus rapide ne remplace l'ancien que s'il reste correct en général. */
const GENERALITY_SEEDS = [0x51a7e, 0xc0ffee, 0x4471];

function isGeneral(puzzleId: string, code: string): boolean {
  const puzzle = getPuzzle(puzzleId);
  return puzzle !== undefined && GENERALITY_SEEDS.every((seed) => judge(puzzle, code, seed).passed);
}

function recordSolution(
  state: GameState,
  puzzleId: string,
  code: string,
  cycles: number,
  size: number,
): Outcome {
  const puzzle = getPuzzle(puzzleId);
  const previous = state.solutions[puzzleId];
  const firstTime = !previous;
  const improved = !previous || (cycles < previous.cycles && isGeneral(puzzleId, code));
  const solution = improved ? { code, cycles, size, solvedAt: state.time } : previous;
  let next: GameState = { ...state, solutions: { ...state.solutions, [puzzleId]: solution } };
  next = bumpStat(next, 'puzzlesSolved');
  if (firstTime && puzzle) next = earn(next, puzzle.reward);
  if (puzzle && cycles <= puzzle.parCycles) next = withFlag(next, 'optimized');
  if (puzzleId === 'echo') next = withFlag(next, 'echo-decoded');
  return { state: next, events: [{ type: 'puzzleSolved', puzzleId, firstTime, cycles, improved }] };
}

export function submitSolution(
  state: GameState,
  puzzleId: string,
  code: string,
  module: ModuleId | null,
): Outcome {
  const puzzle = getPuzzle(puzzleId);
  if (!puzzle) return fail(state, 'Ticket inconnu.');
  if (code.length > MAX_CODE_LENGTH)
    return fail(state, `Firmware trop long (max ${MAX_CODE_LENGTH} caractères).`);
  if (puzzleId === 'echo' && !state.flags.includes('echo-unlocked'))
    return fail(state, 'Signal encore illisible.');
  const incident = module ? state.modules[module].incident : null;
  const seed = incident && incident.puzzleId === puzzleId ? incident.testSeed : PRACTICE_SEED;
  const report = judge(puzzle, code, seed);
  if (!report.passed) return fail(state, 'Le firmware ne passe pas tous les tests.');
  const recorded = recordSolution(state, puzzleId, code, report.exampleCycles, report.size);
  if (!module || !incident || incident.puzzleId !== puzzleId) return recorded;
  const resolved = resolveIncident(recorded.state, module, 'debug');
  return { state: resolved.state, events: [...recorded.events, ...resolved.events] };
}

export function saveDraft(state: GameState, puzzleId: string, code: string): Outcome {
  if (!getPuzzle(puzzleId) || code.length > MAX_CODE_LENGTH) return nothing(state);
  return nothing({ ...state, drafts: { ...state.drafts, [puzzleId]: code } });
}

export function catchAnomaly(state: GameState): Outcome {
  if (!state.anomaly) return nothing(state);
  const mods = computeModifiers(state);
  const rates = productionRates(state, mods);
  const roll = nextRandom(state.rng);
  const delay = nextRandom(roll.seed);
  const base: GameState = bumpStat(
    {
      ...state,
      anomaly: null,
      rng: delay.seed,
      nextAnomalyAt: state.time + 90 + delay.value * 120,
    },
    'anomalies',
  );
  const r = roll.value;
  if (r < 0.25) {
    const buffs = [
      ...base.buffs.filter((b) => b.id !== 'surge'),
      { id: 'surge', label: 'Surcharge du flux ×3', mult: 3, until: base.time + 30 },
    ];
    return {
      state: { ...base, buffs },
      events: [{ type: 'anomalyCaught', label: 'Surcharge du flux : production ×3 pendant 30 s' }],
    };
  }
  const reward = anomalyReward(r, rates, clickValue(state, mods, rates));
  return {
    state: earn(base, reward.gain),
    events: [{ type: 'anomalyCaught', label: reward.label }],
  };
}

function anomalyReward(r: number, rates: Resources, click: number): { gain: Cost; label: string } {
  if (r < 0.4 && rates.data > 0) {
    const data = Math.max(5, rates.data * 120);
    return { gain: { data }, label: `Archive récupérée : +${Math.round(data)} ◈` };
  }
  if (r < 0.55 && rates.alloy > 0) {
    const alloy = Math.max(10, rates.alloy * 120);
    return { gain: { alloy }, label: `Épave précieuse : +${Math.round(alloy)} ⬡` };
  }
  const energy = Math.max(25, rates.energy * 90 + click * 10);
  return { gain: { energy }, label: `Paquet d'énergie : +${Math.round(energy)} ⚡` };
}

export function decrypt(state: GameState, logId: string): Outcome {
  const log = getLog(logId);
  if (!log || !state.logsUnlocked.includes(logId)) return fail(state, 'Fichier introuvable.');
  if (log.decryptCost <= 0 || state.logsDecrypted.includes(logId))
    return fail(state, "Ce fichier n'est pas chiffré.");
  if (state.resources.data < log.decryptCost)
    return fail(state, `Déchiffrement : ${log.decryptCost} ◈ requis.`);
  return nothing({
    ...state,
    resources: subtract(state.resources, { data: log.decryptCost }),
    logsDecrypted: [...state.logsDecrypted, logId],
  });
}

export function readLog(state: GameState, logId: string): Outcome {
  const log = getLog(logId);
  if (!log || !state.logsUnlocked.includes(logId) || state.logsRead.includes(logId))
    return nothing(state);
  if (log.decryptCost > 0 && !state.logsDecrypted.includes(logId)) return nothing(state);
  const read = bumpStat({ ...state, logsRead: [...state.logsRead, logId] }, 'logsRead');
  if (!log.setsFlag) return nothing(read);
  return { state: withFlag(read, log.setsFlag), events: [{ type: 'flag', flag: log.setsFlag }] };
}

export function reboot(state: GameState): Outcome {
  const fragments = rebootFragments(state);
  if (fragments < 1) return fail(state, 'Énergie de cycle insuffisante pour un redémarrage.');
  const resources = PERKS.reduce<Resources>(
    (acc, perk) => {
      const level = state.perks[perk.id] ?? 0;
      return perk.startBonus && level > 0 ? add(acc, scale(perk.startBonus, level)) : acc;
    },
    { energy: 0, alloy: 0, data: 0, cores: state.resources.cores + fragments },
  );
  const keepDaemon =
    (state.perks['persistent-daemon'] ?? 0) > 0 && state.upgrades.includes('daemon');
  const next: GameState = {
    ...state,
    resources,
    run: { energy: 0, alloy: 0, data: 0, cores: 0 },
    modules: emptyModules(),
    upgrades: keepDaemon ? ['daemon'] : [],
    discovered: state.discovered.filter((id) => getModule(id) !== undefined),
    buffs: [],
    anomaly: null,
    nextIncidentAt: state.time + 120,
    nextAnomalyAt: state.time + 90,
  };
  return { state: bumpStat(next, 'reboots'), events: [{ type: 'reboot', cores: fragments }] };
}

export function setFlag(state: GameState, flag: string): Outcome {
  if (state.flags.includes(flag) || !/^[a-z0-9-]{1,32}$/.test(flag)) return nothing(state);
  return { state: withFlag(state, flag), events: [{ type: 'flag', flag }] };
}
