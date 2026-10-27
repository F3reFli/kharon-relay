/** Panneau MODULES : construction, état et gestion des incidents par sous-système. */

import { describeCondition, evaluate } from '../core/conditions';
import { maxAffordable, moduleCost, patchCost } from '../core/costs';
import { MODULES } from '../core/data/modules';
import { formatCost, formatDuration, formatNumber, RESOURCE_META } from '../core/format';
import { computeModifiers, moduleRates, type Modifiers } from '../core/modifiers';
import { canAfford, timeToAfford } from '../core/resources';
import type { Cost, GameState, ModuleDef, ModuleId, ResourceId, Resources } from '../core/types';
import type { UiContext } from './context';
import { h, setText, toggleClass } from './dom';

type Qty = 1 | 10 | 100 | 'max';

interface Row {
  readonly root: HTMLElement;
  readonly count: HTMLElement;
  readonly output: HTMLElement;
  readonly buy: HTMLButtonElement;
  readonly buyLabel: HTMLElement;
  readonly eta: HTMLElement;
  readonly incident: HTMLElement;
  readonly incidentText: HTMLElement;
  readonly patchBtn: HTMLButtonElement;
  readonly deployBtn: HTMLButtonElement;
  readonly boost: HTMLElement;
}

/** Explique pourquoi un achat est impossible quand aucune production ne le rendra possible. */
function missingHint(state: GameState, rates: Resources, cost: Cost): string {
  const blocked = (Object.keys(cost) as ResourceId[]).filter(
    (k) => (cost[k] ?? 0) > state.resources[k] && rates[k] <= 0,
  );
  if (blocked.length === 1 && blocked[0] === 'energy') return 'cliquez le cœur pour produire ⚡';
  return `production de ${blocked.map((k) => RESOURCE_META[k].glyph).join(' ')} requise`;
}

export class ModulesPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly teaser: HTMLElement;
  private readonly rows = new Map<ModuleId, Row>();
  private qty: Qty = 1;
  private readonly qtyButtons: HTMLButtonElement[];

  constructor(private readonly ctx: UiContext) {
    this.qtyButtons = ([1, 10, 100, 'max'] as const).map((q) =>
      h('button', {
        class: `qty-btn${q === 1 ? ' active' : ''}`,
        text: q === 'max' ? 'MAX' : `×${q}`,
        on: { click: () => this.setQty(q) },
      }),
    );
    this.list = h('div', { class: 'module-list' });
    this.teaser = h('div', { class: 'module-teaser' });
    this.root = h(
      'aside',
      { class: 'panel panel-left panel-glass', attrs: { 'aria-label': 'Modules' } },
      [
        h('div', { class: 'panel-head' }, [
          h('h2', { text: 'MODULES' }),
          h('div', { class: 'qty-group' }, this.qtyButtons),
        ]),
        h('div', { class: 'panel-body scroll' }, [this.list, this.teaser]),
      ],
    );
  }

  private setQty(q: Qty): void {
    this.qty = q;
    this.qtyButtons.forEach((b, i) => toggleClass(b, 'active', [1, 10, 100, 'max'][i] === q));
    this.ctx.audio.play('open');
  }

  private buildBuy(def: ModuleDef): Pick<Row, 'buy' | 'buyLabel' | 'eta'> {
    const buyLabel = h('span', { class: 'buy-cost' });
    const eta = h('span', { class: 'buy-eta' });
    const buy = h(
      'button',
      {
        class: 'buy-btn',
        on: {
          click: () => this.ctx.store.dispatch({ type: 'buyModule', id: def.id, qty: this.qty }),
        },
      },
      [h('span', { class: 'buy-label', text: 'CONSTRUIRE' }), buyLabel, eta],
    );
    return { buy, buyLabel, eta };
  }

  private buildIncident(
    def: ModuleDef,
  ): Pick<Row, 'incident' | 'incidentText' | 'patchBtn' | 'deployBtn'> {
    const dispatch = (type: 'patch' | 'deploy') => () =>
      this.ctx.store.dispatch({ type, module: def.id });
    const incidentText = h('span', { class: 'incident-text' });
    const patchBtn = h('button', { class: 'mini-btn warn', on: { click: dispatch('patch') } });
    const deployBtn = h('button', {
      class: 'mini-btn',
      text: 'DÉPLOYER',
      on: { click: dispatch('deploy') },
    });
    const debugBtn = h('button', {
      class: 'mini-btn accent',
      text: 'DÉBOGUER',
      title: 'Réparer en KX-ASM : gratuit, bonus de production ×1,5 pendant 10 min',
      on: {
        click: () => {
          const inc = this.ctx.store.state.modules[def.id].incident;
          if (inc) this.ctx.openEditor(inc.puzzleId, def.id);
        },
      },
    });
    const incident = h('div', { class: 'mod-incident hidden' }, [
      incidentText,
      h('div', { class: 'incident-actions' }, [debugBtn, patchBtn, deployBtn]),
    ]);
    return { incident, incidentText, patchBtn, deployBtn };
  }

  private createRow(def: ModuleDef): Row {
    const count = h('span', { class: 'mod-count', text: '0' });
    const output = h('span', { class: 'mod-output' });
    const boost = h('span', { class: 'mod-boost hidden', text: '▲ PATCH OPTIMISÉ' });
    const buy = this.buildBuy(def);
    const incident = this.buildIncident(def);
    const root = h('div', { class: 'mod-row', attrs: { 'data-module': def.id } }, [
      h('div', { class: 'mod-head' }, [
        h('span', { class: 'mod-code', text: def.code }),
        h('span', { class: 'mod-name', text: def.name }),
        count,
      ]),
      h('div', { class: 'mod-desc', text: def.description }),
      h('div', { class: 'mod-flavor', text: `« ${def.flavor} »` }),
      h('div', { class: 'mod-stats' }, [output, boost]),
      buy.buy,
      incident.incident,
    ]);
    return { root, count, output, boost, ...buy, ...incident };
  }

  private syncRows(state: GameState): void {
    MODULES.forEach((def) => {
      if (!state.discovered.includes(def.id) || this.rows.has(def.id)) return;
      const row = this.createRow(def);
      this.rows.set(def.id, row);
      this.list.append(row.root);
      row.root.classList.add('appear');
    });
  }

  private updateOutput(row: Row, def: ModuleDef, state: GameState, mods: Modifiers): void {
    const notation = this.ctx.settings().notation;
    const count = state.modules[def.id].count;
    const r = moduleRates(state, mods, def.id);
    const keys = Object.keys(def.produces) as ResourceId[];
    const text =
      count > 0
        ? keys.map((k) => `${RESOURCE_META[k].glyph} ${formatNumber(r[k], notation)}/s`).join('  ')
        : `${keys.map((k) => `${RESOURCE_META[k].glyph}${formatNumber(def.produces[k] ?? 0, notation)}`).join(' ')}/s par unité`;
    setText(row.count, `×${count}`);
    setText(row.output, text);
  }

  private updateBuy(
    row: Row,
    def: ModuleDef,
    state: GameState,
    mods: Modifiers,
    rates: Resources,
  ): void {
    const owned = state.modules[def.id].count;
    const n = this.qty === 'max' ? Math.max(1, maxAffordable(state, def, mods.costMult)) : this.qty;
    const cost = moduleCost(def, owned, n, mods.costMult);
    const unlocked = evaluate(state, def.unlock);
    const affordable = unlocked && canAfford(state.resources, cost);
    const wait = timeToAfford(state.resources, rates, cost);
    setText(row.buyLabel, `×${n}  ${formatCost(cost, this.ctx.settings().notation)}`);
    let eta = '';
    if (!unlocked) eta = `🔒 requis : ${describeCondition(def.unlock)}`;
    else if (!affordable)
      eta = Number.isFinite(wait)
        ? `dans ${formatDuration(wait)}`
        : missingHint(state, rates, cost);
    setText(row.eta, eta);
    row.buy.disabled = !affordable;
    toggleClass(row.buy, 'ready', affordable);
  }

  private updateIncident(row: Row, def: ModuleDef, state: GameState, mods: Modifiers): void {
    const ms = state.modules[def.id];
    const inc = ms.incident;
    toggleClass(row.incident, 'hidden', !inc);
    toggleClass(row.root, 'has-incident', Boolean(inc));
    toggleClass(row.boost, 'hidden', ms.boostUntil <= state.time);
    if (!inc) return;
    setText(
      row.incidentText,
      `⚠ #${inc.ticket} — ${inc.summary} (−${Math.round(inc.severity * 100)} %)`,
    );
    const pc = patchCost(state, def.id, mods);
    setText(row.patchBtn, `PATCH ${formatCost(pc, this.ctx.settings().notation)}`);
    row.patchBtn.disabled = !canAfford(state.resources, pc);
    toggleClass(row.deployBtn, 'hidden', !state.solutions[inc.puzzleId]);
  }

  private updateTeaser(state: GameState): void {
    const next = MODULES.find((m) => !state.discovered.includes(m.id));
    toggleClass(this.teaser, 'hidden', !next);
    if (next)
      setText(
        this.teaser,
        `▒▒ SIGNAL NON IDENTIFIÉ ▒▒  —  requis : ${describeCondition(next.unlock)}`,
      );
  }

  update(state: GameState, rates: Resources): void {
    this.syncRows(state);
    const mods = computeModifiers(state);
    this.rows.forEach((row, id) => {
      const def = MODULES.find((m) => m.id === id);
      if (!def) return;
      this.updateOutput(row, def, state, mods);
      this.updateBuy(row, def, state, mods, rates);
      this.updateIncident(row, def, state, mods);
    });
    this.updateTeaser(state);
  }

  /** Après un redémarrage, les modules découverts restent mais leurs compteurs repartent à zéro. */
  reset(): void {
    this.rows.forEach((r) => r.root.remove());
    this.rows.clear();
  }
}
