/** Commandes d'exploitation de la station : état, modules, incidents, réparations, achats. */

import { evaluate } from '../conditions';
import { moduleCost, patchCost, rebootFragments } from '../costs';
import {
  RESOURCE_META,
  asciiBar,
  formatClock,
  formatCost,
  formatNumber,
  formatRate,
  padLeft,
  padRight,
} from '../format';
import { getLog } from '../data/lore';
import { MODULES, resolveModule } from '../data/modules';
import { getPuzzle } from '../data/puzzles';
import { UPGRADES, getUpgrade } from '../data/upgrades';
import { computeModifiers, moduleRates, productionRates } from '../modifiers';
import { canAfford } from '../resources';
import { activeIncidents } from '../state';
import type { ResourceId } from '../types';
import { buildFs, logIdForFile, lookup, normalizePath } from './fs';
import {
  line,
  result,
  type Command,
  type ShellContext,
  type ShellResult,
  type TermLine,
} from './types';
import { REBOOT_THRESHOLD } from '../constants';

function moduleArg(
  ctx: ShellContext,
  args: readonly string[],
  cmd: string,
): ReturnType<typeof resolveModule> | ShellResult {
  const query = args[0];
  if (!query) return result(ctx, [line(`usage : ${cmd} <module>`, 'warn')]);
  const def = resolveModule(query);
  if (!def || !ctx.state.discovered.includes(def.id))
    return result(ctx, [line(`${cmd}: module inconnu « ${query} »`, 'err')]);
  return def;
}

const isResult = (v: unknown): v is ShellResult =>
  typeof v === 'object' && v !== null && 'lines' in v;

export const status: Command = {
  name: 'status',
  usage: 'status',
  summary: 'ressources et production',
  run: (_args, ctx) => {
    const rates = productionRates(ctx.state);
    const ids: ResourceId[] = ['energy', 'alloy', 'data', 'cores'];
    const rows = ids.map((r) =>
      line(
        `${RESOURCE_META[r].glyph} ${padRight(RESOURCE_META[r].label, 18)} ${padLeft(formatNumber(ctx.state.resources[r], ctx.notation), 10)}  ${r === 'cores' ? '' : formatRate(rates[r], ctx.notation)}`,
      ),
    );
    const incidents = activeIncidents(ctx.state).length;
    return result(ctx, [
      line(`KHARON — horloge de mission T+${formatClock(ctx.state.time)}`, 'title'),
      ...rows,
      line(
        incidents
          ? `⚠ ${incidents} incident(s) actif(s) — tapez « incidents »`
          : '✓ Tous les sous-systèmes sont nominaux',
        incidents ? 'warn' : 'ok',
      ),
    ]);
  },
};

export const modules: Command = {
  name: 'modules',
  usage: 'modules',
  summary: 'tableau des sous-systèmes',
  run: (_args, ctx) => {
    const mods = computeModifiers(ctx.state);
    const rows = MODULES.filter((m) => ctx.state.discovered.includes(m.id)).map((m): TermLine => {
      const ms = ctx.state.modules[m.id];
      const r = moduleRates(ctx.state, mods, m.id);
      const out = (Object.keys(m.produces) as ResourceId[])
        .map((k) => `${RESOURCE_META[k].glyph}${formatNumber(r[k], ctx.notation)}`)
        .join(' ');
      const state = ms.incident ? `⚠ #${ms.incident.ticket}` : ms.count ? 'OK' : '—';
      return line(
        `${m.code}  ${padRight(m.name, 26)} ${padLeft(String(ms.count), 5)}  ${padRight(out + '/s', 22)} ${state}`,
        ms.incident ? 'warn' : 'normal',
      );
    });
    return result(ctx, [
      line('CODE  MODULE                     UNITÉS  PRODUCTION             ÉTAT', 'title'),
      ...rows,
    ]);
  },
};

export const incidents: Command = {
  name: 'incidents',
  usage: 'incidents',
  summary: 'liste des incidents actifs',
  run: (_args, ctx) => {
    const ids = activeIncidents(ctx.state);
    if (ids.length === 0) return result(ctx, [line('Aucun incident actif.', 'ok')]);
    const mods = computeModifiers(ctx.state);
    const rows = ids.flatMap((id) => {
      const inc = ctx.state.modules[id].incident;
      if (!inc) return [];
      const def = MODULES.find((m) => m.id === id);
      const saved = ctx.state.solutions[inc.puzzleId] ? '  [firmware enregistré : deploy]' : '';
      return [
        line(`#${inc.ticket}  ${def?.name ?? id} — ${inc.summary}`, 'warn'),
        line(
          `       perte ${Math.round(inc.severity * 100)} % · depuis ${formatClock(ctx.state.time - inc.startedAt)} · patch ${formatCost(patchCost(ctx.state, id, mods), ctx.notation)}${saved}`,
          'dim',
        ),
      ];
    });
    return result(ctx, [
      ...rows,
      line('repair <module> : déboguer en KX-ASM (gratuit, bonus ×1,5 pendant 10 min)', 'accent'),
    ]);
  },
};

export const repair: Command = {
  name: 'repair',
  usage: 'repair <module>',
  summary: "ouvre l'éditeur KX-ASM sur l'incident",
  complete: 'module',
  run: (args, ctx) => {
    const def = moduleArg(ctx, args, 'repair');
    if (isResult(def) || !def) return def ?? result(ctx, []);
    const inc = ctx.state.modules[def.id].incident;
    if (!inc)
      return result(ctx, [
        line(`${def.name} : aucun incident. (edit ${def.puzzleId} pour s'entraîner)`, 'dim'),
      ]);
    return result(
      ctx,
      [line(`Ouverture du ticket #${inc.ticket}…`, 'accent')],
      [{ type: 'openEditor', puzzleId: inc.puzzleId, module: def.id }],
    );
  },
};

export const patch: Command = {
  name: 'patch',
  usage: 'patch <module>',
  summary: 'réparation rapide contre des ressources',
  complete: 'module',
  run: (args, ctx) => {
    const def = moduleArg(ctx, args, 'patch');
    if (isResult(def) || !def) return def ?? result(ctx, []);
    if (!ctx.state.modules[def.id].incident)
      return result(ctx, [line(`${def.name} : aucun incident.`, 'dim')]);
    const cost = patchCost(ctx.state, def.id, computeModifiers(ctx.state));
    if (!canAfford(ctx.state.resources, cost))
      return result(ctx, [
        line(`Ressources insuffisantes (${formatCost(cost, ctx.notation)}).`, 'err'),
      ]);
    return result(
      ctx,
      [line(`Soudure en cours… ${formatCost(cost, ctx.notation)} consommés.`, 'ok')],
      [{ type: 'dispatch', action: { type: 'patch', module: def.id } }],
    );
  },
};

export const deploy: Command = {
  name: 'deploy',
  usage: 'deploy <module>',
  summary: 'redéploie le firmware enregistré',
  complete: 'module',
  run: (args, ctx) => {
    const def = moduleArg(ctx, args, 'deploy');
    if (isResult(def) || !def) return def ?? result(ctx, []);
    const inc = ctx.state.modules[def.id].incident;
    if (!inc) return result(ctx, [line(`${def.name} : aucun incident.`, 'dim')]);
    if (!ctx.state.solutions[inc.puzzleId])
      return result(ctx, [
        line(`Aucun firmware enregistré pour ${inc.puzzleId}. Utilisez repair.`, 'err'),
      ]);
    return result(
      ctx,
      [line(`Déploiement de /firmware/${inc.puzzleId}.kx…`, 'accent')],
      [{ type: 'dispatch', action: { type: 'deploy', module: def.id } }],
    );
  },
};

export const edit: Command = {
  name: 'edit',
  usage: 'edit <ticket>',
  summary: 'ouvre un firmware en mode entraînement',
  complete: 'puzzle',
  run: (args, ctx) => {
    const id = args[0]?.replace(/\.kx$/, '');
    const puzzle = id ? getPuzzle(id) : undefined;
    if (!puzzle)
      return result(ctx, [
        line('usage : edit <ticket>   (voir /firmware ou /sys/modules/*)', 'warn'),
      ]);
    const unlocked =
      puzzle.id === 'echo'
        ? ctx.state.flags.includes('echo-unlocked')
        : !puzzle.module || ctx.state.discovered.includes(puzzle.module);
    if (!unlocked)
      return result(ctx, [line(`edit: ticket « ${puzzle.id} » encore inaccessible`, 'err')]);
    const module =
      puzzle.module && ctx.state.modules[puzzle.module].incident?.puzzleId === puzzle.id
        ? puzzle.module
        : null;
    return result(
      ctx,
      [line(`Ouverture de ${puzzle.id}…`, 'accent')],
      [{ type: 'openEditor', puzzleId: puzzle.id, module }],
    );
  },
};

export const build: Command = {
  name: 'build',
  usage: 'build <module> [n|max]',
  summary: "construit des unités d'un module",
  complete: 'module',
  run: (args, ctx) => {
    const def = moduleArg(ctx, args, 'build');
    if (isResult(def) || !def) return def ?? result(ctx, []);
    const qtyArg = args[1] ?? '1';
    const qty = qtyArg === 'max' ? 'max' : Number.parseInt(qtyArg, 10);
    if (qty !== 'max' && (!Number.isFinite(qty) || qty < 1 || qty > 10_000))
      return result(ctx, [line('build: quantité invalide', 'err')]);
    if (!evaluate(ctx.state, def.unlock))
      return result(ctx, [line('build: module verrouillé', 'err')]);
    const mods = computeModifiers(ctx.state);
    const cost =
      qty === 'max' ? null : moduleCost(def, ctx.state.modules[def.id].count, qty, mods.costMult);
    if (cost && !canAfford(ctx.state.resources, cost))
      return result(ctx, [
        line(`Ressources insuffisantes (${formatCost(cost, ctx.notation)}).`, 'err'),
      ]);
    return result(
      ctx,
      [line(`Assemblage : ${def.name} ×${qty}`, 'ok')],
      [{ type: 'dispatch', action: { type: 'buyModule', id: def.id, qty } }],
    );
  },
};

export const install: Command = {
  name: 'install',
  usage: 'install [protocole]',
  summary: 'liste ou installe un protocole',
  complete: 'upgrade',
  run: (args, ctx) => {
    const available = UPGRADES.filter(
      (u) => !ctx.state.upgrades.includes(u.id) && evaluate(ctx.state, u.unlock),
    );
    const id = args[0];
    if (!id) {
      if (available.length === 0) return result(ctx, [line('Aucun protocole disponible.', 'dim')]);
      return result(
        ctx,
        available.map((u) =>
          line(
            `${padRight(u.id, 16)} ${padRight(u.name, 28)} ${formatCost(u.cost, ctx.notation)}`,
            canAfford(ctx.state.resources, u.cost) ? 'ok' : 'dim',
          ),
        ),
      );
    }
    const def = getUpgrade(id);
    if (!def || !available.includes(def))
      return result(ctx, [line(`install: protocole « ${id} » indisponible`, 'err')]);
    if (!canAfford(ctx.state.resources, def.cost))
      return result(ctx, [
        line(`Ressources insuffisantes (${formatCost(def.cost, ctx.notation)}).`, 'err'),
      ]);
    return result(
      ctx,
      [line(`Installation de ${def.name}… OK`, 'ok')],
      [{ type: 'dispatch', action: { type: 'buyUpgrade', id: def.id } }],
    );
  },
};

export const decrypt: Command = {
  name: 'decrypt',
  usage: 'decrypt <fichier.enc>',
  summary: 'déchiffre un journal avec des données',
  complete: 'path',
  run: (args, ctx) => {
    const target = args[0];
    if (!target) return result(ctx, [line('usage : decrypt <fichier.enc>', 'warn')]);
    const abs = normalizePath(ctx.cwd, target);
    const node = lookup(buildFs(ctx.state), abs);
    const logId =
      node?.kind === 'file' ? (node.logId ?? logIdForFile(abs.split('/').pop() ?? '')) : undefined;
    const log = logId ? getLog(logId) : undefined;
    if (!log) return result(ctx, [line(`decrypt: ${target}: introuvable`, 'err')]);
    if (log.decryptCost <= 0 || ctx.state.logsDecrypted.includes(log.id))
      return result(ctx, [line('decrypt: fichier déjà en clair', 'dim')]);
    if (ctx.state.resources.data < log.decryptCost)
      return result(ctx, [line(`decrypt: ${formatNumber(log.decryptCost)} ◈ requis`, 'err')]);
    return result(
      ctx,
      [
        line(
          `Attaque par force brute… clé trouvée. ${formatNumber(log.decryptCost)} ◈ consommés.`,
          'ok',
        ),
        line(`cat ${target} pour lire.`, 'dim'),
      ],
      [{ type: 'dispatch', action: { type: 'decrypt', logId: log.id } }],
    );
  },
};

export const scan: Command = {
  name: 'scan',
  usage: 'scan',
  summary: 'balayage des environs de la station',
  run: (_args, ctx) => {
    const s = ctx.state;
    const anomaly = s.anomaly
      ? line(
          `◆ PAQUET DÉRIVANT DÉTECTÉ — interception possible pendant ${Math.ceil(s.anomaly.expiresAt - s.time)} s !`,
          'warn',
        )
      : line(
          `Prochain passage de débris estimé dans ~${Math.max(0, Math.round(s.nextAnomalyAt - s.time))} s`,
          'dim',
        );
    return result(ctx, [
      line('Balayage radar… [██████████] 100 %', 'accent'),
      line(`Débris en orbite : ${1400 + (s.rng & 255)} objets catalogués`),
      line(`Nérée : tempête australe active · période d'écho 41 min 12 s`),
      anomaly,
    ]);
  },
};

export const top: Command = {
  name: 'top',
  usage: 'top',
  summary: 'processus actifs',
  run: (_args, ctx) => {
    const procs = MODULES.filter((m) => ctx.state.modules[m.id].count > 0).map((m, i) => {
      const ms = ctx.state.modules[m.id];
      const cpu = Math.min(99, 3 + ms.count * (m.tier + 1) * 0.7);
      return line(
        `${padLeft(String(1000 + i * 7), 5)}  ${padRight(m.code.toLowerCase() + 'd', 8)} ${padLeft(cpu.toFixed(1), 5)}%  ${asciiBar(cpu / 100, 12)}  ${ms.incident ? 'ZOMBIE' : 'R'}`,
        ms.incident ? 'warn' : 'normal',
      );
    });
    return result(ctx, [
      line('  PID  NOM       CPU   CHARGE        ÉTAT', 'title'),
      line('    1  warden     2.1%  ░░░░░░░░░░░░  S'),
      ...procs,
    ]);
  },
};

export const reboot: Command = {
  name: 'reboot',
  usage: 'reboot',
  summary: 'redémarrage à froid (prestige)',
  run: (_args, ctx) => {
    const fragments = rebootFragments(ctx.state);
    if (fragments < 1) {
      return result(ctx, [
        line(
          `reboot: énergie de cycle insuffisante — il faut au moins ${formatNumber(REBOOT_THRESHOLD)} ⚡ produits depuis le dernier redémarrage.`,
          'err',
        ),
      ]);
    }
    return result(
      ctx,
      [line(`Redémarrage possible : +${fragments} fragment(s) mémoire.`, 'accent')],
      [{ type: 'openReboot' }],
    );
  },
};

export const STATION_COMMANDS: readonly Command[] = [
  status,
  modules,
  incidents,
  repair,
  patch,
  deploy,
  edit,
  build,
  install,
  decrypt,
  scan,
  top,
  reboot,
];
