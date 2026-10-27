/** Conteneur d'état : applique les actions via le réducteur pur et notifie les abonnés. */

import { reduce } from '../core/reducer';
import type { Action, GameEvent, GameState } from '../core/types';

export type Listener = (state: GameState, events: readonly GameEvent[]) => void;

export class GameStore {
  private current: GameState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: GameState) {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  dispatch(action: Action): readonly GameEvent[] {
    const out = reduce(this.current, action);
    if (out.state === this.current && out.events.length === 0) return out.events;
    this.current = out.state;
    this.listeners.forEach((fn) => fn(this.current, out.events));
    return out.events;
  }

  /** Remplace intégralement l'état (chargement, import, réinitialisation). */
  replace(state: GameState): void {
    this.current = state;
    this.listeners.forEach((fn) => fn(this.current, []));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
