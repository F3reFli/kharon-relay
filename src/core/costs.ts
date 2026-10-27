/** Coûts dynamiques : modules (croissance géométrique), réparations, redémarrage. */

import { PATCH_COST_RATIO, REBOOT_THRESHOLD } from './constants';
import { getModule } from './data/modules';
import type { Modifiers } from './modifiers';
import type { Cost, GameState, ModuleDef, ModuleId, ResourceId } from './types';

/** Coût de `qty` unités à partir de `owned` déjà possédées (somme géométrique). */
export function moduleCost(def: ModuleDef, owned: number, qty: number, costMult = 1): Cost {
  const g = def.growth;
  const series = (g ** qty - 1) / (g - 1);
  return Object.fromEntries(
    (Object.keys(def.baseCost) as ResourceId[]).map((k) => [
      k,
      Math.ceil((def.baseCost[k] ?? 0) * g ** owned * series * costMult),
    ]),
  );
}

/** Nombre maximal d'unités achetables avec les ressources actuelles (forme fermée). */
export function maxAffordable(state: GameState, def: ModuleDef, costMult = 1): number {
  const owned = state.modules[def.id].count;
  const g = def.growth;
  const limits = (Object.keys(def.baseCost) as ResourceId[]).map((k) => {
    const unit = (def.baseCost[k] ?? 0) * g ** owned * costMult;
    if (unit <= 0) return Number.POSITIVE_INFINITY;
    return Math.floor(Math.log(1 + (state.resources[k] * (g - 1)) / unit) / Math.log(g));
  });
  const n = Math.max(0, Math.min(...limits));
  // Corrige les arrondis (ceil par ressource dans moduleCost).
  if (n > 0) {
    const cost = moduleCost(def, owned, n, costMult);
    const ok = (Object.keys(cost) as ResourceId[]).every(
      (k) => state.resources[k] >= (cost[k] ?? 0),
    );
    return ok ? n : n - 1;
  }
  return 0;
}

/** Réparation rapide : une fraction du prix unitaire actuel du module. */
export function patchCost(state: GameState, id: ModuleId, mods: Modifiers): Cost {
  const def = getModule(id);
  if (!def) return {};
  const unit = moduleCost(def, Math.max(0, state.modules[id].count - 1), 1, mods.costMult);
  return Object.fromEntries(
    Object.entries(unit).map(([k, v]) => [
      k,
      Math.ceil((v ?? 0) * PATCH_COST_RATIO * mods.patchCostMult),
    ]),
  );
}

/** Fragments mémoire obtenus en redémarrant maintenant. */
export function rebootFragments(state: GameState): number {
  return Math.floor(Math.sqrt(state.run.energy / REBOOT_THRESHOLD));
}

/** Énergie de cycle nécessaire pour atteindre `fragments` fragments. */
export function energyForFragments(fragments: number): number {
  return fragments ** 2 * REBOOT_THRESHOLD;
}
