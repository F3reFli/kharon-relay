/** Point d'entrée unique du noyau : (état, action) → (nouvel état, événements). */

import * as act from './actions';
import { computeModifiers } from './modifiers';
import { checkAchievements, pipeline, tick } from './simulation';
import { bumpStat } from './state';
import { answerEvent } from './stationEvents';
import type { Action, GameState, Outcome } from './types';

function apply(state: GameState, action: Action): Outcome {
  switch (action.type) {
    case 'tick':
      return tick(state, action.dt);
    case 'click':
      return act.click(state);
    case 'buyModule':
      return act.buyModule(state, action.id, action.qty);
    case 'buyUpgrade':
      return act.buyUpgrade(state, action.id);
    case 'buyPerk':
      return act.buyPerk(state, action.id);
    case 'patch':
      return act.patch(state, action.module);
    case 'deploy':
      return act.deploy(state, action.module);
    case 'submitSolution':
      return act.submitSolution(state, action.puzzleId, action.code, action.module);
    case 'saveDraft':
      return act.saveDraft(state, action.puzzleId, action.code);
    case 'catchAnomaly':
      return act.catchAnomaly(state);
    case 'answerEvent':
      return answerEvent(state, action.choice);
    case 'decrypt':
      return act.decrypt(state, action.logId);
    case 'readLog':
      return act.readLog(state, action.logId);
    case 'reboot':
      return act.reboot(state);
    case 'setFlag':
      return act.setFlag(state, action.flag);
    case 'command':
      return { state: bumpStat(state, 'commands'), events: [] };
  }
}

export function reduce(state: GameState, action: Action): Outcome {
  const out = apply(state, action);
  if (action.type === 'tick' || action.type === 'saveDraft' || out.state === state) return out;
  const extra = pipeline(out.state, computeModifiers(out.state), [checkAchievements]);
  return { state: extra.state, events: [...out.events, ...extra.events] };
}
