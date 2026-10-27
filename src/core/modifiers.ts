/**
 * Agrégation des effets (protocoles, perks, succès, buffs) en multiplicateurs,
 * puis calcul des taux de production et de la valeur d'une impulsion.
 */

import {
  BASE_CLICK,
  BASE_CRIT_CHANCE,
  BASE_OFFLINE_HOURS,
  BASE_OFFLINE_RATE,
  CORE_BONUS,
  DEBUG_BOOST_MULT,
} from './constants';
import { ACHIEVEMENT_BONUS } from './data/achievements';
import { MODULES } from './data/modules';
import { getPerk, getUpgrade } from './data/upgrades';
import { EMPTY_RESOURCES } from './resources';
import type { BuffTarget, Effect, GameState, ModuleId, ResourceId, Resources } from './types';

export interface Modifiers {
  readonly clickMult: number;
  readonly clickFromRate: number;
  readonly moduleMult: Readonly<Record<ModuleId, number>>;
  readonly resourceMult: Readonly<Record<ResourceId, number>>;
  readonly globalMult: number;
  readonly stability: number;
  readonly critChance: number;
  readonly autoDeploy: boolean;
  /** Délai d'auto-réparation en secondes, ou null. */
  readonly autoRepair: number | null;
  readonly offlineHours: number;
  readonly offlineRate: number;
  readonly patchCostMult: number;
  readonly costMult: number;
}

function activeEffects(state: GameState): Effect[] {
  const fromUpgrades = state.upgrades.flatMap((id) => getUpgrade(id)?.effects ?? []);
  const fromPerks = Object.entries(state.perks).flatMap(([id, level]) => {
    const perk = getPerk(id);
    if (!perk || level <= 0) return [];
    return Array.from({ length: level }, () => perk.effects).flat();
  });
  return [...fromUpgrades, ...fromPerks];
}

const BASE_MODULE_MULT = Object.fromEntries(MODULES.map((m) => [m.id, 1])) as Record<
  ModuleId,
  number
>;

const BASE_MODIFIERS: Modifiers = {
  clickMult: 1,
  clickFromRate: 0,
  moduleMult: BASE_MODULE_MULT,
  resourceMult: { energy: 1, alloy: 1, data: 1, cores: 1 },
  globalMult: 1,
  stability: 1,
  critChance: BASE_CRIT_CHANCE,
  autoDeploy: false,
  autoRepair: null,
  offlineHours: BASE_OFFLINE_HOURS,
  offlineRate: BASE_OFFLINE_RATE,
  patchCostMult: 1,
  costMult: 1,
};

/** Effets portant sur un multiplicateur ou un compteur scalaire. */
function applyScalar(m: Modifiers, e: Effect): Modifiers | null {
  switch (e.kind) {
    case 'clickMult':
      return { ...m, clickMult: m.clickMult * e.value };
    case 'clickFromRate':
      return { ...m, clickFromRate: m.clickFromRate + e.value };
    case 'globalMult':
      return { ...m, globalMult: m.globalMult * e.value };
    case 'stability':
      return { ...m, stability: m.stability * e.value };
    case 'critChance':
      return { ...m, critChance: m.critChance + e.value };
    case 'offlineHours':
      return { ...m, offlineHours: m.offlineHours + e.value };
    case 'offlineRate':
      return { ...m, offlineRate: Math.min(1, m.offlineRate + e.value) };
    case 'patchCostMult':
      return { ...m, patchCostMult: m.patchCostMult * e.value };
    case 'costMult':
      return { ...m, costMult: m.costMult * e.value };
    default:
      return null;
  }
}

function applyEffect(m: Modifiers, e: Effect): Modifiers {
  const scalar = applyScalar(m, e);
  if (scalar) return scalar;
  switch (e.kind) {
    case 'moduleMult':
      return {
        ...m,
        moduleMult: { ...m.moduleMult, [e.module]: m.moduleMult[e.module] * e.value },
      };
    case 'resourceMult':
      return {
        ...m,
        resourceMult: { ...m.resourceMult, [e.resource]: m.resourceMult[e.resource] * e.value },
      };
    case 'autoDeploy':
      return { ...m, autoDeploy: true };
    case 'autoRepair':
      return {
        ...m,
        autoRepair: m.autoRepair === null ? e.seconds : Math.min(m.autoRepair, e.seconds),
      };
    default:
      return m;
  }
}

export function computeModifiers(state: GameState): Modifiers {
  return activeEffects(state).reduce<Modifiers>(applyEffect, BASE_MODIFIERS);
}

const GLOBAL_TARGET: BuffTarget = { kind: 'global' };

/** Produit des bonus temporaires actifs dont la portée satisfait `matches`. */
export function buffMultiplier(state: GameState, matches: (target: BuffTarget) => boolean): number {
  return state.buffs.reduce(
    (acc, b) => (b.until > state.time && matches(b.target ?? GLOBAL_TARGET) ? acc * b.mult : acc),
    1,
  );
}

/** Multiplicateur commun à toute la production : global × fragments × succès × buffs globaux. */
export function sharedMultiplier(state: GameState, mods: Modifiers): number {
  const cores = 1 + CORE_BONUS * state.resources.cores;
  const achievements = 1 + ACHIEVEMENT_BONUS * state.achievements.length;
  const buffs = buffMultiplier(state, (t) => t.kind === 'global');
  return mods.globalMult * cores * achievements * buffs;
}

/** Facteur de fonctionnement d'un module : incident (perte) et bonus de patch optimisé. */
export function moduleHealthFactor(state: GameState, id: ModuleId): number {
  const ms = state.modules[id];
  const incident = ms.incident ? 1 - ms.incident.severity : 1;
  const boost = ms.boostUntil > state.time ? DEBUG_BOOST_MULT : 1;
  return incident * boost;
}

/** Production par seconde d'un type de module, ressource par ressource. */
export function moduleRates(state: GameState, mods: Modifiers, id: ModuleId): Resources {
  const def = MODULES.find((m) => m.id === id);
  const count = state.modules[id].count;
  if (!def || count === 0) return EMPTY_RESOURCES;
  const moduleBuff = buffMultiplier(state, (t) => t.kind === 'module' && t.module === id);
  const factor =
    count *
    mods.moduleMult[id] *
    moduleHealthFactor(state, id) *
    sharedMultiplier(state, mods) *
    moduleBuff;
  return (Object.keys(def.produces) as ResourceId[]).reduce<Resources>((acc, r) => {
    const resourceBuff = buffMultiplier(state, (t) => t.kind === 'resource' && t.resource === r);
    const gain = (def.produces[r] ?? 0) * factor * mods.resourceMult[r] * resourceBuff;
    return { ...acc, [r]: acc[r] + gain };
  }, EMPTY_RESOURCES);
}

export function productionRates(
  state: GameState,
  mods: Modifiers = computeModifiers(state),
): Resources {
  return MODULES.reduce<Resources>((acc, def) => {
    const r = moduleRates(state, mods, def.id);
    return {
      energy: acc.energy + r.energy,
      alloy: acc.alloy + r.alloy,
      data: acc.data + r.data,
      cores: 0,
    };
  }, EMPTY_RESOURCES);
}

export function clickValue(
  state: GameState,
  mods: Modifiers = computeModifiers(state),
  rates?: Resources,
): number {
  const energyRate = (rates ?? productionRates(state, mods)).energy;
  const base = BASE_CLICK * mods.clickMult * sharedMultiplier(state, mods);
  const clickBuff = buffMultiplier(state, (t) => t.kind === 'click');
  return (base + energyRate * mods.clickFromRate) * clickBuff;
}
