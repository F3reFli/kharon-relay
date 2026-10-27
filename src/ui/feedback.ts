/** Traduction des événements de jeu en retours sensoriels : sons, notifications, journal. */

import type { AudioEngine } from '../audio/audio';
import { getPuzzle } from '../core/data/puzzles';
import { formatClock, formatCost, formatNumber } from '../core/format';
import type { GameEvent, GameState } from '../core/types';
import type { ToastTone } from './context';
import type { EventLog, Toasts } from './modal';
import {
  getAchievementName,
  getLogTitle,
  getModuleName,
  getPuzzleTitle,
  getUpgradeName,
} from './names';
import type { TerminalView } from './terminal';

export interface FeedbackTargets {
  readonly audio: AudioEngine;
  readonly toasts: Toasts;
  readonly log: EventLog;
  readonly terminal: TerminalView;
  readonly onEnding: () => void;
}

interface FeedbackContext extends FeedbackTargets {
  /** Inscrit au journal des événements et, par défaut, affiche une notification. */
  readonly note: (text: string, tone?: ToastTone, toast?: boolean) => void;
  readonly clock: string;
}

type Handlers = {
  readonly [K in GameEvent['type']]: (
    event: Extract<GameEvent, { type: K }>,
    ctx: FeedbackContext,
  ) => void;
};

const RESOLVE_LABEL = {
  patch: 'réparation rapide effectuée',
  debug: 'firmware patché — production ×1,5 pendant 10 min',
  deploy: 'firmware redéployé',
  auto: "réparé par l'essaim de drones",
} as const;

const PURCHASE_TEXT = {
  module: (id: string, qty: number) => `Construit : ${getModuleName(id)} ×${qty}`,
  upgrade: (id: string) => `Protocole installé : ${getUpgradeName(id)}`,
  perk: () => 'Perk permanent amélioré.',
} as const;

function puzzleSolved(
  event: Extract<GameEvent, { type: 'puzzleSolved' }>,
  ctx: FeedbackContext,
): void {
  ctx.audio.play('solve');
  const title = getPuzzleTitle(event.puzzleId);
  if (event.firstTime) {
    const reward = getPuzzle(event.puzzleId)?.reward;
    ctx.note(`Firmware « ${title} » enregistré${reward ? ` (+${formatCost(reward)})` : ''}`, 'ok');
  } else if (event.improved) {
    ctx.note(`Nouveau record : ${event.cycles} cycles sur « ${title} »`, 'ok');
  }
}

const HANDLERS: Handlers = {
  click: (e, ctx) => ctx.audio.play(e.crit ? 'crit' : 'click'),
  purchase: (e, ctx) => {
    ctx.audio.play('buy');
    ctx.note(
      PURCHASE_TEXT[e.kind](e.id, e.qty),
      e.kind === 'module' ? 'info' : 'ok',
      e.kind !== 'module',
    );
  },
  incident: ({ incident }, ctx) => {
    ctx.audio.play('incident');
    ctx.note(
      `INCIDENT #${incident.ticket} — ${getModuleName(incident.module)} : ${incident.summary}`,
      'warn',
    );
    ctx.terminal.system(
      `ALERTE ticket #${incident.ticket} ouvert sur ${incident.module}. Commande : repair ${incident.module}`,
      'warn',
    );
  },
  incidentResolved: (e, ctx) => {
    ctx.audio.play('resolve');
    ctx.note(`${getModuleName(e.module)} : ${RESOLVE_LABEL[e.method]}`, 'ok');
  },
  puzzleSolved,
  achievement: (e, ctx) => {
    ctx.audio.play('achievement');
    ctx.note(`◆ SUCCÈS — ${getAchievementName(e.id)}`, 'achievement');
  },
  log: (e, ctx) => {
    ctx.note(`Journal récupéré : ${getLogTitle(e.id)}`, 'log');
    ctx.terminal.system(`nouveau fichier dans /logs : ${getLogTitle(e.id)}`, 'accent');
  },
  discover: (e, ctx) => {
    if (e.kind === 'module') ctx.note(`Nouveau module détecté : ${getModuleName(e.id)}`, 'info');
  },
  anomalySpawned: (_e, ctx) => {
    ctx.audio.play('anomaly');
    ctx.terminal.system('◆ paquet de données dérivant détecté — interception possible !', 'warn');
  },
  anomalyCaught: (e, ctx) => {
    ctx.audio.play('catch');
    ctx.note(e.label, 'ok');
  },
  anomalyLost: (_e, ctx) => ctx.log.push(ctx.clock, 'Paquet dérivant perdu.', 'info'),
  reboot: (e, ctx) => {
    ctx.audio.play('reboot');
    ctx.note(`Redémarrage à froid : +${formatNumber(e.cores)} fragment(s) mémoire.`, 'achievement');
  },
  flag: (e, ctx) => {
    if (e.flag === 'echo-unlocked')
      ctx.note('Décodeur assemblé : un ticket ECHO est apparu dans /signal.', 'log');
    if (e.flag === 'echo-sent') ctx.onEnding();
  },
  error: (e, ctx) => {
    ctx.audio.play('error');
    ctx.toasts.show(e.message, 'err', 2600);
  },
};

export function handleFeedback(event: GameEvent, state: GameState, targets: FeedbackTargets): void {
  const clock = formatClock(state.time);
  const ctx: FeedbackContext = {
    ...targets,
    clock,
    note: (text, tone = 'info', toast = true) => {
      targets.log.push(clock, text, tone);
      if (toast) targets.toasts.show(text, tone);
    },
  };
  (HANDLERS[event.type] as (e: GameEvent, c: FeedbackContext) => void)(event, ctx);
}
