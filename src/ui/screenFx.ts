/** Lueur colorée des bords de l'écran, selon l'événement en cours ou les incidents ouverts. */

import { activeIncidents } from '../core/state';
import { activeEventDef } from '../core/stationEvents';
import type { GameState } from '../core/types';
import { h } from './dom';

export class ScreenFx {
  readonly root = h('div', { class: 'screen-fx', attrs: { 'aria-hidden': 'true' } });
  private mood = '';

  update(state: GameState): void {
    const visual = activeEventDef(state)?.visual;
    const mood = visual ?? (activeIncidents(state).length > 0 ? 'incident' : '');
    if (mood === this.mood) return;
    this.mood = mood;
    this.root.className = mood ? `screen-fx on fx-${mood}` : 'screen-fx';
  }
}
