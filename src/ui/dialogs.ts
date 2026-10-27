/** Contenus des boîtes de dialogue : journal, redémarrage, rapport hors-ligne, épilogue. */

import { rebootFragments } from '../core/costs';
import { getLog } from '../core/data/lore';
import { formatDuration, formatNumber } from '../core/format';
import type { OfflineReport } from '../core/save';
import type { GameState } from '../core/types';
import type { UiContext } from './context';
import { h } from './dom';
import type { Modal } from './modal';
import { CORE_BONUS } from '../core/constants';

export function openLogDialog(ctx: UiContext, modal: Modal, logId: string): void {
  const log = getLog(logId);
  const state = ctx.store.state;
  if (!log || !state.logsUnlocked.includes(logId)) return;
  const locked = log.decryptCost > 0 && !state.logsDecrypted.includes(logId);
  if (locked) {
    modal.open(log.file, [
      h('p', {
        class: 'warn',
        text: `Fichier chiffré (AES-KX/256). Déchiffrement : ${formatNumber(log.decryptCost)} ◈.`,
      }),
      h('pre', {
        class: 'hexdump',
        text: Array.from(
          { length: 6 },
          (_, i) => `${(i * 16).toString(16).padStart(8, '0')}  ${'?? '.repeat(16)}`,
        ).join('\n'),
      }),
      h('button', {
        class: 'run-btn',
        text: `DÉCHIFFRER (${formatNumber(log.decryptCost)} ◈)`,
        attrs: state.resources.data >= log.decryptCost ? {} : { disabled: 'true' },
        on: {
          click: () => {
            const events = ctx.store.dispatch({ type: 'decrypt', logId });
            if (!events.some((e) => e.type === 'error')) openLogDialog(ctx, modal, logId);
          },
        },
      }),
    ]);
    return;
  }
  ctx.store.dispatch({ type: 'readLog', logId });
  modal.open(log.title, [
    h('div', { class: 'log-meta', text: `${log.file}  ·  ${log.author}  ·  ${log.date}` }),
    h(
      'div',
      { class: 'log-body' },
      log.body.map((t) => h('p', { text: t })),
    ),
  ]);
}

export function openRebootDialog(ctx: UiContext, modal: Modal): void {
  const state = ctx.store.state;
  const fragments = rebootFragments(state);
  const ending = state.flags.includes('echo-sent');
  modal.open(ending ? 'TRANSMETTRE ET REDÉMARRER' : 'REDÉMARRAGE À FROID', [
    h('p', {
      text: ending
        ? 'Le signal est parti. Le relais peut recommencer la boucle.'
        : 'Le Gardien va purger la station et relancer tous les sous-systèmes à partir de zéro.',
    }),
    h('p', { class: 'big-number', text: `+${fragments} ✦` }),
    h('p', {
      class: 'dim',
      text: `Chaque fragment donne +${Math.round(CORE_BONUS * 100)} % de production permanente (non dépensé) et permet d'acheter des perks.`,
    }),
    h('ul', { class: 'small' }, [
      h('li', { text: 'Perdu : ressources, modules, protocoles.' }),
      h('li', { text: 'Conservé : fragments, perks, firmwares, journaux, succès, statistiques.' }),
    ]),
    h('div', { class: 'row' }, [
      h('button', { class: 'mini-btn', text: 'ANNULER', on: { click: () => modal.close() } }),
      h('button', {
        class: 'run-btn danger',
        text: '⟲ CONFIRMER LE REDÉMARRAGE',
        attrs: fragments > 0 ? {} : { disabled: 'true' },
        on: {
          click: () => {
            ctx.store.dispatch({ type: 'reboot' });
            modal.close();
          },
        },
      }),
    ]),
  ]);
}

export function openOfflineDialog(modal: Modal, report: OfflineReport): void {
  const gains = (['energy', 'alloy', 'data'] as const)
    .filter((r) => report.gains[r] > 0)
    .map((r) =>
      h('li', {
        text: `${{ energy: '⚡', alloy: '⬡', data: '◈' }[r]} +${formatNumber(report.gains[r])}`,
      }),
    );
  modal.open('RAPPORT DE VEILLE', [
    h('p', {
      text: `Absence de ${formatDuration(report.elapsed)}. Les automates ont tourné ${formatDuration(report.simulated)} à ${Math.round(report.rate * 100)} % de rendement.`,
    }),
    gains.length
      ? h('ul', { class: 'gains' }, gains)
      : h('p', { class: 'dim', text: 'Aucune production pendant votre absence.' }),
  ]);
}

export function openEndingDialog(modal: Modal, state: GameState): void {
  const log = getLog('log-14');
  modal.open(
    'LA BOUCLE',
    [
      h(
        'div',
        { class: 'log-body ending' },
        (log?.body ?? []).map((t) => h('p', { text: t })),
      ),
      h('p', {
        class: 'dim small',
        text: `Temps de mission : ${formatDuration(state.time)} · ${state.stats.incidentsResolved} incidents résolus · ${Object.keys(state.solutions).length} firmwares écrits.`,
      }),
      h('p', {
        class: 'small',
        text: "Merci d'avoir gardé la station allumée. La production continue ; un redémarrage relance la boucle avec vos fragments.",
      }),
    ],
    { wide: true },
  );
}
