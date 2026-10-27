/** Carte d'alerte des événements de station : texte, compte à rebours, réponses ou objectif. */

import { getStationEvent } from '../core/data/events';
import { formatCost } from '../core/format';
import { activeEventDef, choiceCost, choiceStatus } from '../core/stationEvents';
import type { ActiveEvent, EventChoice, GameState, StationEventDef } from '../core/types';
import type { UiContext } from './context';
import { h, setText, toggleClass } from './dom';

interface ChoiceButton {
  readonly choice: EventChoice;
  readonly button: HTMLButtonElement;
  readonly cost: HTMLElement;
}

const OUTCOME_MS = 4500;
const RESULT_LABEL = {
  choice: 'RÉPONSE',
  goal: 'OBJECTIF ATTEINT',
  expired: 'SANS RÉPONSE',
} as const;

export class EventCard {
  readonly root: HTMLElement;
  private readonly source = h('span', { class: 'ev-source' });
  private readonly timer = h('span', { class: 'ev-timer' });
  private readonly bar = h('div', { class: 'ev-bar-fill' });
  private readonly title = h('h3', { class: 'ev-title' });
  private readonly text = h('p', { class: 'ev-text' });
  private readonly choices = h('div', { class: 'ev-choices' });
  private readonly goalFill = h('div', { class: 'ev-goal-fill' });
  private readonly goalText = h('span', { class: 'ev-goal-text' });
  private readonly goal = h('div', { class: 'ev-goal hidden' }, [
    h('div', { class: 'ev-goal-bar' }, [this.goalFill]),
    this.goalText,
  ]);
  private buttons: ChoiceButton[] = [];
  private serial = -1;
  private outcomeUntil = 0;

  constructor(private readonly ctx: UiContext) {
    this.root = h(
      'section',
      { class: 'event-card hidden', attrs: { role: 'alert', 'aria-live': 'assertive' } },
      [
        h('div', { class: 'ev-head' }, [this.source, this.timer]),
        h('div', { class: 'ev-bar' }, [this.bar]),
        this.title,
        this.text,
        this.choices,
        this.goal,
      ],
    );
  }

  /** Répond au choix n (1, 2, 3…) : raccourci clavier. */
  answerByIndex(index: number): boolean {
    const entry = this.buttons[index];
    if (!entry || this.root.classList.contains('hidden') || entry.button.disabled) return false;
    entry.button.click();
    return true;
  }

  private build(def: StationEventDef, event: ActiveEvent): void {
    this.serial = event.serial;
    this.outcomeUntil = 0;
    this.root.className = `event-card visual-${def.visual} entering`;
    setText(this.source, `◆ ${def.source}`);
    setText(this.title, def.title);
    setText(this.text, def.text);
    this.buttons = def.choices.map((choice, i) => {
      const cost = h('span', { class: 'ev-choice-cost' });
      const button = h(
        'button',
        {
          class: 'ev-choice',
          title: `Touche ${i + 1}`,
          on: {
            click: () => this.ctx.store.dispatch({ type: 'answerEvent', choice: choice.id }),
          },
        },
        [
          h('span', { class: 'ev-key', text: String(i + 1) }),
          h('span', { class: 'ev-choice-label', text: choice.label }),
          h('span', { class: 'ev-choice-detail', text: choice.detail }),
          cost,
        ],
      );
      return { choice, button, cost };
    });
    this.choices.replaceChildren(...this.buttons.map((b) => b.button));
    toggleClass(this.choices, 'hidden', def.choices.length === 0);
    toggleClass(this.goal, 'hidden', !def.clickGoal);
    window.setTimeout(() => this.root.classList.remove('entering'), 600);
  }

  private refresh(state: GameState, def: StationEventDef, event: ActiveEvent): void {
    const left = Math.max(0, event.expiresAt - state.time);
    setText(this.timer, `${Math.ceil(left)} s`);
    this.bar.style.transform = `scaleX(${left / (event.expiresAt - event.startedAt || 1)})`;
    toggleClass(this.root, 'urgent', left < 8);
    const notation = this.ctx.settings().notation;
    this.buttons.forEach(({ choice, button, cost }) => {
      const status = choiceStatus(state, choice);
      button.disabled = !status.ok;
      const price = choice.cost.length > 0 ? formatCost(choiceCost(state, choice), notation) : '';
      setText(cost, status.reason ?? (price ? `coût : ${price}` : ''));
      toggleClass(cost, 'blocked', !status.ok);
    });
    if (def.clickGoal) {
      const ratio = Math.min(1, event.progress / def.clickGoal.count);
      this.goalFill.style.transform = `scaleX(${ratio})`;
      setText(
        this.goalText,
        `${event.progress} / ${def.clickGoal.count} impulsions — FRAPPEZ LE CŒUR (espace)`,
      );
    }
  }

  /** Affiche brièvement l'issue d'un événement dans la carte. */
  showOutcome(id: string, outcome: string, result: keyof typeof RESULT_LABEL): void {
    const def = getStationEvent(id);
    if (!def) return;
    this.serial = -1;
    this.outcomeUntil = performance.now() + OUTCOME_MS;
    this.root.className = `event-card visual-${def.visual} resolved result-${result}`;
    setText(this.source, `◆ ${RESULT_LABEL[result]}`);
    setText(this.timer, '');
    setText(this.title, def.title);
    setText(this.text, outcome);
    this.choices.replaceChildren();
    this.buttons = [];
    toggleClass(this.goal, 'hidden', true);
  }

  update(state: GameState): void {
    const event = state.event;
    const def = activeEventDef(state);
    if (event && def) {
      if (event.serial !== this.serial) this.build(def, event);
      this.refresh(state, def, event);
      return;
    }
    if (performance.now() < this.outcomeUntil) return;
    toggleClass(this.root, 'hidden', true);
  }
}
