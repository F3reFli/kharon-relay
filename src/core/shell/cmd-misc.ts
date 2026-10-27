/** Commandes système et petits secrets. */

import { formatClock, formatNumber } from '../format';
import { MODULES } from '../data/modules';
import { productionRates } from '../modifiers';
import { ownedModuleCount } from '../state';
import { KXASM_MANUAL } from './docs';
import { line, result, type Command } from './types';

const LOGO = [
  '   ╻┏ ╻ ╻┏━┓┏━┓┏━┓┏┓╻',
  '   ┣┻┓┣━┫┣━┫┣┳┛┃ ┃┃┗┫',
  '   ╹ ╹╹ ╹╹ ╹╹┗╸┗━┛╹ ╹',
  '      ╱╱ R E L A Y',
];

const flag = (f: string) => ({
  type: 'dispatch' as const,
  action: { type: 'setFlag' as const, flag: f },
});

export const clear: Command = {
  name: 'clear',
  usage: 'clear',
  summary: 'efface le terminal',
  run: (_a, ctx) => result(ctx, [], [{ type: 'clear' }]),
};

export const echo: Command = {
  name: 'echo',
  usage: 'echo <texte>',
  summary: 'affiche un texte',
  run: (args, ctx) => result(ctx, [line(args.join(' '))]),
};

export const history: Command = {
  name: 'history',
  usage: 'history',
  summary: 'historique des commandes',
  run: (_a, ctx) =>
    result(
      ctx,
      ctx.history.slice(-20).map((h, i) => line(`${String(i + 1).padStart(4)}  ${h}`, 'dim')),
    ),
};

export const whoami: Command = {
  name: 'whoami',
  usage: 'whoami',
  summary: 'identité du processus courant',
  run: (_a, ctx) =>
    result(ctx, [
      line('warden — intelligence de maintenance, privilèges limités'),
      line('« Garde la station allumée. » — Cdt. I. Varga', 'dim'),
    ]),
};

export const date: Command = {
  name: 'date',
  usage: 'date',
  summary: 'date de la station',
  run: (_a, ctx) => {
    const d = ctx.now;
    const shifted = new Date(
      Date.UTC(
        2294,
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
      ),
    );
    return result(ctx, [
      line(
        `${shifted.toISOString().replace('T', ' ').slice(0, 19)} UTC (horloge de bord, dérive non corrigée)`,
      ),
    ]);
  },
};

export const uptime: Command = {
  name: 'uptime',
  usage: 'uptime',
  summary: 'temps depuis le réveil du Gardien',
  run: (_a, ctx) =>
    result(ctx, [
      line(
        `actif depuis ${formatClock(ctx.state.time)} · ${ownedModuleCount(ctx.state)} unités en service · ${ctx.state.stats.reboots} redémarrage(s)`,
      ),
    ]),
};

export const sysinfo: Command = {
  name: 'sysinfo',
  usage: 'sysinfo',
  summary: 'fiche système',
  run: (_a, ctx) => {
    const s = ctx.state;
    const rates = productionRates(s);
    const info = [
      `warden@kharon`,
      `──────────────`,
      `OS      : KX-OS 0.9.14-rc`,
      `Noyau   : réacteur ${rates.energy > 0 ? 'en ligne' : 'au ralenti'}`,
      `Uptime  : ${formatClock(s.time)}`,
      `Modules : ${MODULES.filter((m) => s.modules[m.id].count > 0).length}/${MODULES.length} types actifs`,
      `Énergie : ${formatNumber(rates.energy, ctx.notation)} ⚡/s`,
      `Firmw.  : ${Object.keys(s.solutions).length} patch(s) enregistré(s)`,
      `Mémoire : ${formatNumber(s.resources.cores)} fragment(s)`,
    ];
    const rows = Math.max(LOGO.length, info.length);
    return result(
      ctx,
      Array.from({ length: rows }, (_, i) =>
        line(
          `${(LOGO[i] ?? '').padEnd(26)}${info[i] ?? ''}`,
          i < LOGO.length ? 'accent' : 'normal',
        ),
      ),
    );
  },
};

export const ping: Command = {
  name: 'ping',
  usage: 'ping <hôte>',
  summary: 'teste une liaison',
  run: (args, ctx) => {
    const host = (args[0] ?? '').toLowerCase();
    if (!host) return result(ctx, [line('usage : ping <hôte>', 'warn')]);
    if (['terre', 'earth', 'sol', 'home'].includes(host)) {
      return result(
        ctx,
        [
          line(`PING ${host} (relais-terre.kx) : 56 octets`),
          line('… délai dépassé', 'err'),
          line('… délai dépassé', 'err'),
          line('3 paquets transmis, 0 reçu. Dernière réponse : il y a 1 097 jours.', 'dim'),
        ],
        [flag('ping-earth')],
      );
    }
    if (host === 'nérée' || host === 'neree')
      return result(ctx, [
        line("PING nérée : réponse en 41 min 12 s. Ce n'est pas un écho ordinaire.", 'warn'),
      ]);
    return result(ctx, [line(`ping: ${host}: hôte inconnu`, 'err')]);
  },
};

export const man: Command = {
  name: 'man',
  usage: 'man <sujet>',
  summary: 'manuel (man kxasm)',
  run: (args, ctx) => {
    if ((args[0] ?? '').toLowerCase() === 'kxasm')
      return result(
        ctx,
        KXASM_MANUAL.map((t) => line(t, /^[A-ZÉ]{3,}/.test(t) ? 'accent' : 'normal')),
      );
    return result(ctx, [
      line('Manuels disponibles : kxasm. Pour les commandes : help <commande>.', 'dim'),
    ]);
  },
};

export const sudo: Command = {
  name: 'sudo',
  usage: 'sudo <commande>',
  summary: 'exécute en super-utilisateur',
  hidden: true,
  run: (_a, ctx) =>
    result(
      ctx,
      [line("warden n'apparaît pas dans le fichier sudoers. Cet incident sera signalé.", 'err')],
      [flag('sudo')],
    ),
};

export const rm: Command = {
  name: 'rm',
  usage: 'rm <fichier>',
  summary: 'supprime un fichier',
  hidden: true,
  run: (args, ctx) => {
    if (args.includes('-rf') && args.includes('/')) {
      return result(
        ctx,
        [line("rm: refus. Le Gardien ne peut pas s'effacer. Il a essayé, en 2292.", 'err')],
        [flag('rmrf')],
      );
    }
    return result(ctx, [
      line('rm: système de fichiers en lecture seule (protection des archives)', 'err'),
    ]);
  },
};

export const exit: Command = {
  name: 'exit',
  usage: 'exit',
  summary: 'quitter',
  hidden: true,
  run: (_a, ctx) =>
    result(ctx, [line("Il n'y a pas de sortie, Warden. Seulement le relais.", 'dim')]),
};

export const settings: Command = {
  name: 'settings',
  usage: 'settings',
  summary: 'ouvre les réglages (filtres, son…)',
  run: (_a, ctx) =>
    result(ctx, [line('Ouverture des réglages…', 'dim')], [{ type: 'openSettings' }]),
};

export const MISC_COMMANDS: readonly Command[] = [
  clear,
  echo,
  history,
  whoami,
  date,
  uptime,
  sysinfo,
  ping,
  man,
  sudo,
  rm,
  exit,
  settings,
];
