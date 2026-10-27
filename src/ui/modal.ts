/** Fenêtre modale générique + notifications et nombres flottants. */

import type { ToastTone } from './context';
import { h } from './dom';

export class Modal {
  readonly root: HTMLElement;
  private readonly box: HTMLElement;
  private onClose: (() => void) | null = null;

  constructor() {
    this.box = h('div', { class: 'modal panel-glass' });
    this.root = h(
      'div',
      { class: 'modal-overlay hidden', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      [this.box],
    );
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
  }

  open(
    title: string,
    content: readonly Node[],
    options: { wide?: boolean; onClose?: () => void } = {},
  ): void {
    this.onClose = options.onClose ?? null;
    this.box.className = `modal panel-glass${options.wide ? ' wide' : ''}`;
    this.box.replaceChildren(
      h('div', { class: 'modal-head' }, [
        h('h2', { text: title }),
        h('button', {
          class: 'icon-btn',
          text: '✕',
          title: 'Fermer',
          on: { click: () => this.close() },
        }),
      ]),
      h('div', { class: 'modal-body scroll' }, content),
    );
    this.root.classList.remove('hidden');
    const focusable = this.box.querySelector<HTMLElement>('input, button, select, textarea');
    focusable?.focus();
  }

  close(): void {
    if (this.root.classList.contains('hidden')) return;
    this.root.classList.add('hidden');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }
}

export class Toasts {
  readonly root = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });

  show(message: string, tone: ToastTone = 'info', duration = 4200): void {
    const el = h('div', { class: `toast tone-${tone}` }, [
      h('span', { class: 'toast-text', text: message }),
    ]);
    this.root.prepend(el);
    while (this.root.childElementCount > 4) this.root.lastElementChild?.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 400);
    }, duration);
  }
}

export class Floaters {
  readonly root = h('div', { class: 'floaters', attrs: { 'aria-hidden': 'true' } });

  spawn(x: number, y: number, text: string, crit: boolean): void {
    if (this.root.childElementCount > 40) this.root.firstElementChild?.remove();
    const el = h('div', { class: `floater${crit ? ' crit' : ''}`, text });
    el.style.left = `${x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${y - 10}px`;
    this.root.append(el);
    setTimeout(() => el.remove(), 1200);
  }
}

export class EventLog {
  readonly root = h('div', {
    class: 'event-log panel-glass',
    attrs: { 'aria-label': 'Journal des événements' },
  });
  private readonly list = h('div', { class: 'event-list' });

  constructor() {
    this.root.append(h('div', { class: 'event-head', text: 'ÉVÉNEMENTS' }), this.list);
  }

  push(clock: string, text: string, tone: ToastTone = 'info'): void {
    this.list.prepend(
      h('div', { class: `event tone-${tone}` }, [
        h('span', { class: 'event-time', text: clock }),
        h('span', { text }),
      ]),
    );
    while (this.list.childElementCount > 30) this.list.lastElementChild?.remove();
  }
}
