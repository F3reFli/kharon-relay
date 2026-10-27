import { createInitialState, withModule } from '../src/core/state';
import type { GameState, ModuleId, Resources } from '../src/core/types';

export function newState(): GameState {
  return createInitialState(1_000_000, 12345);
}

export function rich(state: GameState, amount = 1e15): GameState {
  const res: Resources = {
    energy: amount,
    alloy: amount,
    data: amount,
    cores: state.resources.cores,
  };
  return { ...state, resources: res, lifetime: res };
}

export function owning(state: GameState, counts: Partial<Record<ModuleId, number>>): GameState {
  return Object.entries(counts).reduce<GameState>(
    (s, [id, count]) => withModule(s, id as ModuleId, { count: count ?? 0 }),
    state,
  );
}
