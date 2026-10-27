/** Arithmétique immuable sur les ressources et les coûts. */

import type { Cost, ResourceId, Resources } from './types';

export const RESOURCE_IDS: readonly ResourceId[] = ['energy', 'alloy', 'data', 'cores'];

export const EMPTY_RESOURCES: Resources = { energy: 0, alloy: 0, data: 0, cores: 0 };

function costEntries(cost: Cost): Array<[ResourceId, number]> {
  return (Object.keys(cost) as ResourceId[]).map((k) => [k, cost[k] ?? 0]);
}

export function canAfford(resources: Resources, cost: Cost): boolean {
  return costEntries(cost).every(([k, v]) => resources[k] + 1e-9 >= v);
}

export function subtract(resources: Resources, cost: Cost): Resources {
  return costEntries(cost).reduce<Resources>(
    (acc, [k, v]) => ({ ...acc, [k]: Math.max(0, acc[k] - v) }),
    resources,
  );
}

export function add(resources: Resources, gain: Cost): Resources {
  return costEntries(gain).reduce<Resources>(
    (acc, [k, v]) => ({ ...acc, [k]: acc[k] + v }),
    resources,
  );
}

export function scale(cost: Cost, factor: number): Cost {
  return Object.fromEntries(costEntries(cost).map(([k, v]) => [k, v * factor]));
}

export function isEmptyCost(cost: Cost): boolean {
  return costEntries(cost).every(([, v]) => v <= 0);
}

/** Temps (s) avant de pouvoir payer `cost` au rythme `rates`, ou Infinity. */
export function timeToAfford(resources: Resources, rates: Resources, cost: Cost): number {
  return costEntries(cost).reduce((worst, [k, v]) => {
    const missing = v - resources[k];
    if (missing <= 0) return worst;
    const rate = rates[k];
    return Math.max(worst, rate > 0 ? missing / rate : Number.POSITIVE_INFINITY);
  }, 0);
}
