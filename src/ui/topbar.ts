/** Barre supérieure : identité, ressources, état de la station, raccourcis. */

import { RESOURCE_META, formatClock, formatNumber, formatRate } from '../core/format';
import { activeIncidents } from '../core/state';
import type { GameState, ResourceId, Resources } from '../core/types';
import type { UiContext } from './context';
import { h, setText, toggleClass } from './dom';
import { CORE_BONUS } from '../core/constants';

interface Chip {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
  readonly rate: HTMLElement;
}

const RESOURCES: readonly ResourceId[] = ['energy', 'alloy', 'data', 'cores'];

export class TopBar {
  readonly root: HTMLElement;
  private readonly chips: Record<ResourceId, Chip>;
  private readonly clock: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly buffs: HTMLElement;

  constructor(
    private readonly ctx: UiContext,
    onToggleTerminal: () => void,
  ) {
    this.chips = Object.fromEntries(RESOURCES.map((r) => [r, this.chip(r)])) as Record<
      ResourceId,
      Chip
    >;
    this.clock = h('span', { class: 'clock', text: 'T+00:00:00' });
    this.alert = h('span', { class: 'alert-pill', text: 'NOMINAL' });
    this.buffs = h('span', { class: 'buffs' });
    this.muteBtn = h('button', {
      class: 'icon-btn',
      title: 'Couper / rétablir le son',
      text: '♪',
      on: { click: () => this.toggleMute() },
    });
    this.root = h('header', { class: 'topbar panel-glass' }, [
      TopBar.brand(),
      h(
        'div',
        { class: 'resources' },
        RESOURCES.map((r) => this.chips[r].root),
      ),
      h('div', { class: 'status' }, [this.buffs, this.alert, this.clock]),
      h('div', { class: 'actions' }, [
        h('button', {
          class: 'icon-btn',
          title: 'Terminal (touche `)',
          text: '>_',
          on: { click: onToggleTerminal },
        }),
        this.muteBtn,
        h('button', {
          class: 'icon-btn',
          title: 'Réglages',
          text: '⚙',
          on: { click: () => ctx.openSettings() },
        }),
      ]),
    ]);
  }

  private static brand(): HTMLElement {
    return h('div', { class: 'brand' }, [
      h('span', {
        class: 'brand-title glitch-text',
        text: 'KHARON//RELAY',
        attrs: { 'data-text': 'KHARON//RELAY' },
      }),
      h('span', {
        class: 'brand-sub',
        text: 'relais de communications profondes · orbite de Nérée',
      }),
    ]);
  }

  private chip(r: ResourceId): Chip {
    const value = h('span', { class: 'res-value', text: '0' });
    const rate = h('span', { class: 'res-rate', text: '' });
    const root = h('div', { class: `res-chip res-${r}`, title: RESOURCE_META[r].label }, [
      h('span', { class: 'res-glyph', text: RESOURCE_META[r].glyph }),
      h('div', { class: 'res-text' }, [value, rate]),
    ]);
    return { root, value, rate };
  }

  private toggleMute(): void {
    const s = this.ctx.settings();
    const muted = s.masterVolume === 0;
    this.ctx.updateSettings({ masterVolume: muted ? 0.7 : 0 });
  }

  update(state: GameState, rates: Resources): void {
    const notation = this.ctx.settings().notation;
    RESOURCES.forEach((r) => {
      const chip = this.chips[r];
      const visible = r === 'energy' || state.lifetime[r] > 0 || state.resources[r] > 0;
      toggleClass(chip.root, 'hidden', !visible);
      setText(chip.value, formatNumber(state.resources[r], notation));
      setText(
        chip.rate,
        r === 'cores'
          ? `+${Math.round(state.resources.cores * CORE_BONUS * 100)}% prod.`
          : formatRate(rates[r], notation),
      );
    });
    setText(this.clock, `T+${formatClock(state.time)}`);
    const incidents = activeIncidents(state).length;
    setText(
      this.alert,
      incidents ? `⚠ ${incidents} INCIDENT${incidents > 1 ? 'S' : ''}` : '● NOMINAL',
    );
    toggleClass(this.alert, 'danger', incidents > 0);
    const live = state.buffs.filter((b) => b.until > state.time);
    setText(
      this.buffs,
      live.map((b) => `${b.label} ${Math.ceil(b.until - state.time)}s`).join(' · '),
    );
    setText(this.muteBtn, this.ctx.settings().masterVolume === 0 ? '♪̸' : '♪');
    toggleClass(this.muteBtn, 'off', this.ctx.settings().masterVolume === 0);
  }
}
