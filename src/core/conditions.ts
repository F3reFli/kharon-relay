import { getModule } from './data/modules';
import { RESOURCE_META, formatNumber } from './format';
import type { AchievementDef, Condition, GameState } from './types';

export function solvedCount(state: GameState): number {
  return Object.keys(state.solutions).length;
}

export function evaluate(state: GameState, cond: Condition): boolean {
  switch (cond.kind) {
    case 'always':
      return true;
    case 'lifetime':
      return state.lifetime[cond.resource] >= cond.amount;
    case 'owned':
      return state.modules[cond.module].count >= cond.count;
    case 'clicks':
      return state.stats.clicks >= cond.count;
    case 'solved':
      return solvedCount(state) >= cond.count;
    case 'flag':
      return state.flags.includes(cond.flag);
    case 'upgrade':
      return state.upgrades.includes(cond.id);
    case 'all':
      return cond.conditions.every((c) => evaluate(state, c));
  }
}

export function evaluateAchievement(state: GameState, def: AchievementDef): boolean {
  const cond = def.condition;
  if (cond.kind === 'stat') return state.stats[cond.stat] >= cond.value;
  return evaluate(state, cond);
}

/** Description courte d'une condition de déblocage (affichée sur les éléments verrouillés). */
export function describeCondition(cond: Condition): string {
  switch (cond.kind) {
    case 'always':
      return 'disponible';
    case 'lifetime':
      return `${formatNumber(cond.amount)} ${RESOURCE_META[cond.resource].glyph} produits`;
    case 'owned':
      return `${cond.count}× ${getModule(cond.module)?.name ?? cond.module}`;
    case 'clicks':
      return `${cond.count} impulsions`;
    case 'solved':
      return `${cond.count} firmware(s) réparé(s)`;
    case 'flag':
      return 'événement narratif';
    case 'upgrade':
      return `protocole ${cond.id}`;
    case 'all':
      return cond.conditions.map(describeCondition).join(' + ');
  }
}
