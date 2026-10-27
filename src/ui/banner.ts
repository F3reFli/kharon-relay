/** Grande annonce centrale et éphémère : mise en service, objectif atteint, redémarrage. */

import { h } from './dom';

export type BannerTone = 'ok' | 'gold' | 'warn' | 'violet';

const SHOW_MS = 2600;

export class Banner {
  readonly root = h('div', { class: 'banner hidden', attrs: { role: 'status' } });
  private timer: number | null = null;

  show(kicker: string, title: string, tone: BannerTone = 'ok'): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.root.className = `banner tone-${tone}`;
    this.root.replaceChildren(
      h('span', { class: 'banner-kicker', text: kicker }),
      h('span', { class: 'banner-title', text: title }),
    );
    // Relance l'animation d'entrée même si une annonce est déjà affichée.
    void this.root.offsetWidth;
    this.root.classList.add('playing');
    this.timer = window.setTimeout(() => {
      this.root.classList.add('hidden');
      this.timer = null;
    }, SHOW_MS);
  }
}
