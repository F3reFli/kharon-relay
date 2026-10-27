/** Panneau latéral à onglets : PROTOCOLES, MÉMOIRE, ARCHIVES, SUCCÈS. */

import { evaluate, evaluateAchievement } from '../core/conditions';
import { energyForFragments, rebootFragments } from '../core/costs';
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS } from '../core/data/achievements';
import { LOGS } from '../core/data/lore';
import { PERKS, UPGRADES, perkCost } from '../core/data/upgrades';
import { formatCost, formatNumber } from '../core/format';
import { canAfford } from '../core/resources';
import type { GameState, UpgradeDef } from '../core/types';
import type { UiContext } from './context';
import { clear, h, setText, toggleClass } from './dom';
import { CORE_BONUS } from '../core/constants';

type Tab = 'protocols' | 'memory' | 'archives' | 'achievements';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'protocols', label: 'PROTOCOLES' },
  { id: 'memory', label: 'MÉMOIRE' },
  { id: 'archives', label: 'ARCHIVES' },
  { id: 'achievements', label: 'SUCCÈS' },
];

const CATEGORY_LABEL: Readonly<Record<UpgradeDef['category'], string>> = {
  module: 'MOD',
  click: 'IMP',
  stability: 'STB',
  automation: 'AUT',
  global: 'GLB',
  story: '???',
};

export class SidePanel {
  readonly root: HTMLElement;
  private tab: Tab = 'protocols';
  private readonly body: HTMLElement;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private readonly badges = new Map<Tab, HTMLElement>();
  /** Signature du contenu affiché : on ne reconstruit que si elle change. */
  private signature = '';
  private readonly upgradeButtons = new Map<string, HTMLButtonElement>();

  constructor(private readonly ctx: UiContext) {
    const tabs = TABS.map(({ id, label }) => {
      const badge = h('span', { class: 'tab-badge hidden' });
      const btn = h(
        'button',
        {
          class: `tab-btn${id === this.tab ? ' active' : ''}`,
          on: { click: () => this.select(id) },
        },
        [label, badge],
      );
      this.tabButtons.set(id, btn);
      this.badges.set(id, badge);
      return btn;
    });
    this.body = h('div', { class: 'panel-body scroll' });
    this.root = h(
      'aside',
      { class: 'panel panel-right panel-glass', attrs: { 'aria-label': 'Protocoles et archives' } },
      [h('div', { class: 'tab-row' }, tabs), this.body],
    );
  }

  private select(tab: Tab): void {
    this.tab = tab;
    this.signature = '';
    this.tabButtons.forEach((b, id) => toggleClass(b, 'active', id === tab));
    this.ctx.audio.play('open');
    this.update(this.ctx.store.state);
  }

  update(state: GameState): void {
    this.updateBadges(state);
    switch (this.tab) {
      case 'protocols':
        return this.renderProtocols(state);
      case 'memory':
        return this.renderMemory(state);
      case 'archives':
        return this.renderArchives(state);
      case 'achievements':
        return this.renderAchievements(state);
    }
  }

  private updateBadges(state: GameState): void {
    const affordable = UPGRADES.filter(
      (u) =>
        !state.upgrades.includes(u.id) &&
        evaluate(state, u.unlock) &&
        canAfford(state.resources, u.cost),
    ).length;
    const unread = state.logsUnlocked.filter((id) => !state.logsRead.includes(id)).length;
    const set = (tab: Tab, n: number) => {
      const b = this.badges.get(tab);
      if (!b) return;
      toggleClass(b, 'hidden', n === 0);
      setText(b, String(n));
    };
    set('protocols', affordable);
    set('archives', unread);
    set('memory', rebootFragments(state) > 0 ? rebootFragments(state) : 0);
  }

  private rebuild(signature: string, build: () => Node[]): boolean {
    if (signature === this.signature) return false;
    this.signature = signature;
    clear(this.body);
    this.body.append(...build());
    return true;
  }

  private renderProtocols(state: GameState): void {
    const available = UPGRADES.filter(
      (u) => !state.upgrades.includes(u.id) && evaluate(state, u.unlock),
    ).sort((a, b) => (a.cost.energy ?? 0) - (b.cost.energy ?? 0));
    const sig = `p:${available.map((u) => u.id).join(',')}:${state.upgrades.length}`;
    this.rebuild(sig, () => {
      this.upgradeButtons.clear();
      if (available.length === 0)
        return [
          h('p', {
            class: 'empty',
            text: 'Aucun protocole disponible. Continuez à restaurer la station.',
          }),
        ];
      const cards = available.map((u) => {
        const btn = h(
          'button',
          {
            class: `upgrade-card cat-${u.category}`,
            on: { click: () => this.ctx.store.dispatch({ type: 'buyUpgrade', id: u.id }) },
          },
          [
            h('span', { class: 'up-cat', text: CATEGORY_LABEL[u.category] }),
            h('span', { class: 'up-name', text: u.name }),
            h('span', { class: 'up-desc', text: u.description }),
            h('span', { class: 'up-cost', text: formatCost(u.cost, this.ctx.settings().notation) }),
          ],
        );
        this.upgradeButtons.set(u.id, btn);
        return btn;
      });
      return [
        ...cards,
        h('p', { class: 'dim small', text: `${state.upgrades.length} protocole(s) installé(s).` }),
      ];
    });
    available.forEach((u) => {
      const btn = this.upgradeButtons.get(u.id);
      if (!btn) return;
      const ok = canAfford(state.resources, u.cost);
      btn.disabled = !ok;
      toggleClass(btn, 'ready', ok);
    });
  }

  private renderMemory(state: GameState): void {
    const fragments = rebootFragments(state);
    const next = energyForFragments(fragments + 1);
    const notation = this.ctx.settings().notation;
    const sig = `m:${fragments}:${state.resources.cores}:${JSON.stringify(state.perks)}:${formatNumber(state.run.energy, notation)}:${notation}:${state.flags.includes('echo-sent')}`;
    this.rebuild(sig, () => [
      h('div', { class: 'memory-box' }, [
        h('div', { class: 'big-number', text: `✦ ${formatNumber(state.resources.cores)}` }),
        h('div', {
          class: 'dim',
          text: `fragments mémoire — bonus passif +${Math.round(state.resources.cores * CORE_BONUS * 100)} % de production`,
        }),
        h('div', {
          class: 'reboot-info',
          text: `Redémarrage : +${fragments} fragment(s). Prochain à ${formatNumber(next, notation)} ⚡ de cycle (actuel : ${formatNumber(state.run.energy, notation)}).`,
        }),
        h('button', {
          class: `reboot-btn${fragments > 0 ? ' ready' : ''}`,
          text: state.flags.includes('echo-sent')
            ? '⟲ TRANSMETTRE ET REDÉMARRER'
            : '⟲ REDÉMARRAGE À FROID',
          attrs: fragments > 0 ? {} : { disabled: 'true' },
          on: { click: () => this.ctx.openReboot() },
        }),
        h('p', {
          class: 'dim small',
          text: 'Un redémarrage remet les modules et protocoles à zéro. Fragments, firmwares, journaux, perks et succès sont conservés.',
        }),
      ]),
      h('h3', { text: 'PERKS PERMANENTS' }),
      ...PERKS.map((p) => {
        const level = state.perks[p.id] ?? 0;
        const maxed = level >= p.maxLevel;
        const cost = perkCost(p, level);
        return h(
          'button',
          {
            class: `perk-card${!maxed && state.resources.cores >= cost ? ' ready' : ''}`,
            attrs: maxed || state.resources.cores < cost ? { disabled: 'true' } : {},
            on: { click: () => this.ctx.store.dispatch({ type: 'buyPerk', id: p.id }) },
          },
          [
            h('span', { class: 'up-name', text: `${p.name}  [${level}/${p.maxLevel}]` }),
            h('span', { class: 'up-desc', text: p.description }),
            h('span', { class: 'up-cost', text: maxed ? 'MAXIMUM' : `✦ ${cost}` }),
          ],
        );
      }),
    ]);
  }

  private renderArchives(state: GameState): void {
    const sig = `a:${state.logsUnlocked.join(',')}:${state.logsRead.join(',')}:${state.logsDecrypted.join(',')}`;
    this.rebuild(sig, () => {
      const unlocked = LOGS.filter((l) => state.logsUnlocked.includes(l.id));
      const items = unlocked.map((l) => {
        const locked = l.decryptCost > 0 && !state.logsDecrypted.includes(l.id);
        const unread = !state.logsRead.includes(l.id);
        return h(
          'button',
          {
            class: `log-item${locked ? ' locked' : ''}${unread ? ' unread' : ''}`,
            on: { click: () => this.ctx.openLog(l.id) },
          },
          [
            h('span', { class: 'log-file', text: l.file }),
            h('span', {
              class: 'log-title',
              text: locked
                ? `[CHIFFRÉ — ${formatNumber(l.decryptCost)} ◈]`
                : `${l.title} — ${l.author}`,
            }),
            unread && !locked ? h('span', { class: 'log-new', text: 'NOUVEAU' }) : null,
          ],
        );
      });
      return [
        h('p', {
          class: 'dim small',
          text: `${unlocked.length}/${LOGS.length} journaux récupérés. Aussi accessibles via le terminal : ls /logs`,
        }),
        ...(items.length ? items : [h('p', { class: 'empty', text: 'Aucune archive récupérée.' })]),
      ];
    });
  }

  private renderAchievements(state: GameState): void {
    const sig = `s:${state.achievements.join(',')}`;
    this.rebuild(sig, () => [
      h('p', {
        class: 'dim small',
        text: `${state.achievements.length}/${ACHIEVEMENTS.length} succès — bonus +${Math.round(state.achievements.length * ACHIEVEMENT_BONUS * 100)} % de production`,
      }),
      h(
        'div',
        { class: 'ach-grid' },
        ACHIEVEMENTS.map((a) => {
          const done = state.achievements.includes(a.id) || evaluateAchievement(state, a);
          const secret = a.hidden && !done;
          return h(
            'div',
            { class: `ach${done ? ' done' : ''}`, title: secret ? 'Succès secret' : a.description },
            [
              h('span', { class: 'ach-icon', text: done ? '◆' : '◇' }),
              h('span', { class: 'ach-name', text: secret ? '??????' : a.name }),
              h('span', { class: 'ach-desc', text: secret ? 'Succès secret' : a.description }),
            ],
          );
        }),
      ),
    ]);
  }
}
