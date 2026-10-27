/** Indications contextuelles de didacticiel, dérivées de l'état (aucun état propre). */

import { evaluate } from '../core/conditions';
import { UPGRADES } from '../core/data/upgrades';
import { activeIncidents } from '../core/state';
import type { GameState } from '../core/types';
import { h, setText, toggleClass } from './dom';

interface Hint {
  readonly id: string;
  readonly when: (s: GameState) => boolean;
  readonly text: string;
}

const HINTS: readonly Hint[] = [
  {
    id: 'click',
    when: (s) => s.stats.clicks < 8,
    text: "▸ Cliquez sur le cœur du réacteur (au centre) pour générer de l'énergie. Barre espace : impulsion.",
  },
  {
    id: 'build',
    when: (s) => s.modules.capacitor.count === 0,
    text: '▸ Construisez un banc de condensateurs dans le panneau MODULES (à gauche).',
  },
  {
    id: 'incident',
    when: (s) => activeIncidents(s).length > 0 && Object.keys(s.solutions).length === 0,
    text: '▸ INCIDENT ! Cliquez DÉBOGUER sur le module en panne, ou tapez « repair capacitor » dans le terminal.',
  },
  {
    id: 'anomaly',
    when: (s) => s.anomaly !== null && s.stats.anomalies === 0,
    text: "▸ Un paquet de données dérive près de la station : cliquez dessus pour l'intercepter !",
  },
  {
    id: 'event',
    when: (s) => s.event !== null && s.stats.events <= 2,
    text: '▸ ÉVÉNEMENT DE STATION : répondez avant la fin du compte à rebours (clic ou touches 1-3), ou tapez « event ».',
  },
  {
    id: 'protocols',
    when: (s) => s.upgrades.length === 0 && UPGRADES.some((u) => evaluate(s, u.unlock)),
    text: '▸ Des PROTOCOLES sont disponibles dans le panneau de droite : ils multiplient votre production.',
  },
  {
    id: 'logs',
    when: (s) => s.logsRead.length === 0 && s.logsUnlocked.length > 0 && s.stats.clicks > 30,
    text: '▸ Un journal de bord a été récupéré : onglet ARCHIVES, ou « ls /logs » dans le terminal.',
  },
];

export class HintBox {
  readonly root = h('div', { class: 'hint-box hidden', attrs: { role: 'status' } });
  private readonly text = h('span');
  private readonly dismissed = new Set<string>();
  private current: Hint | null = null;

  constructor() {
    this.root.append(
      this.text,
      h('button', {
        class: 'icon-btn small',
        text: '✕',
        title: 'Masquer',
        on: {
          click: () => {
            if (this.current) this.dismissed.add(this.current.id);
            this.root.classList.add('hidden');
          },
        },
      }),
    );
  }

  update(state: GameState): void {
    const hint = HINTS.find((x) => !this.dismissed.has(x.id) && x.when(state)) ?? null;
    this.current = hint;
    toggleClass(this.root, 'hidden', !hint);
    if (hint) setText(this.text, hint.text);
  }
}
