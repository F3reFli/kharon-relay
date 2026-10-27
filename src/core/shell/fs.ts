/** Système de fichiers virtuel de la station, reconstruit à partir de l'état du jeu. */

import { formatNumber } from '../format';
import { LOGS, STATION_EMBLEM, getLog, type LogDef } from '../data/lore';
import { MODULES } from '../data/modules';
import { PUZZLES, getPuzzle } from '../data/puzzles';
import { KXASM_MANUAL, README, STATION_CFG } from './docs';
import type { GameState } from '../types';

export type FsNode =
  | { readonly kind: 'dir'; readonly children: Readonly<Record<string, FsNode>> }
  | {
      readonly kind: 'file';
      readonly read: () => readonly string[];
      readonly logId?: string;
      readonly encrypted?: boolean;
    };

const file = (
  read: () => readonly string[],
  extra: { logId?: string; encrypted?: boolean } = {},
): FsNode => ({
  kind: 'file',
  read,
  ...extra,
});
const dir = (children: Record<string, FsNode>): FsNode => ({ kind: 'dir', children });

/** Bruit hexadécimal déterministe pour les fichiers chiffrés ou les fragments de signal. */
export function hexNoise(seed: string, lines: number, plain = ''): string[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: lines }, (_, row) => {
    const bytes = Array.from({ length: 16 }, (_, col) => {
      h = Math.imul(h ^ (row * 31 + col), 16777619) >>> 0;
      const embedded = plain.charCodeAt(row * 16 + col);
      return Number.isNaN(embedded) || row % 3 !== 1 ? h & 0xff : embedded;
    });
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    return `${(row * 16).toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`;
  });
}

function logContent(log: LogDef, state: GameState): readonly string[] {
  const locked = log.decryptCost > 0 && !state.logsDecrypted.includes(log.id);
  if (locked) {
    return [
      `── FICHIER CHIFFRÉ (AES-KX/256) ── coût de déchiffrement : ${formatNumber(log.decryptCost)} ◈`,
      ...hexNoise(log.id, 6),
      `Utilisez : decrypt ${log.file}`,
    ];
  }
  return [`# ${log.title}`, `# auteur : ${log.author} — date : ${log.date}`, '', ...log.body];
}

function logsDir(state: GameState): FsNode {
  const entries = LOGS.filter((l) => state.logsUnlocked.includes(l.id)).map(
    (l) =>
      [
        l.file,
        file(() => logContent(l, state), {
          logId: l.id,
          encrypted: l.decryptCost > 0 && !state.logsDecrypted.includes(l.id),
        }),
      ] as const,
  );
  return dir(Object.fromEntries(entries));
}

function sysDir(state: GameState): FsNode {
  const modules = Object.fromEntries(
    MODULES.filter((m) => state.discovered.includes(m.id)).map((m) => {
      const ms = state.modules[m.id];
      return [
        m.id,
        file(() => [
          `module=${m.id}`,
          `code=${m.code}`,
          `unites=${ms.count}`,
          `etat=${ms.incident ? `INCIDENT #${ms.incident.ticket} (${Math.round(ms.incident.severity * 100)}% perte)` : 'NOMINAL'}`,
          `firmware=${m.puzzleId}${state.solutions[m.puzzleId] ? ' (patch enregistré)' : ''}`,
          `# ${m.flavor}`,
        ]),
      ] as const;
    }),
  );
  return dir({
    'station.cfg': file(() => STATION_CFG),
    modules: dir(modules),
  });
}

function firmwareDir(state: GameState): FsNode {
  const entries = Object.entries(state.solutions).map(
    ([pid, sol]) =>
      [
        `${pid}.kx`,
        file(() => [
          `; ${getPuzzle(pid)?.title ?? pid} — ${sol.cycles} cycles, ${sol.size} instructions`,
          ...sol.code.split('\n'),
        ]),
      ] as const,
  );
  return dir(Object.fromEntries(entries));
}

function ticketsDir(state: GameState): FsNode {
  const entries = MODULES.flatMap((m) => {
    const inc = state.modules[m.id].incident;
    if (!inc) return [];
    const puzzle = getPuzzle(inc.puzzleId);
    return [
      [
        `${inc.ticket}.tkt`,
        file(() => [
          `TICKET #${inc.ticket} — ${m.name}`,
          `Symptôme : ${inc.summary}`,
          `Perte de production : ${Math.round(inc.severity * 100)} %`,
          '',
          ...(puzzle?.brief ?? []),
          '',
          `Réparer : repair ${m.id}   |   Réparation rapide : patch ${m.id}`,
        ]),
      ] as const,
    ];
  });
  return dir(Object.fromEntries(entries));
}

function signalDir(state: GameState): FsNode {
  const fragments = Math.min(6, state.modules.relay.count);
  const entries: Array<[string, FsNode]> = Array.from({ length: fragments }, (_, i) => [
    `fragment_${(i + 1).toString().padStart(2, '0')}.dat`,
    file(() =>
      hexNoise(`frag${i}`, 8, i === 2 ? 'NOUS SOMMES LE RELAIS ' : 'KHARON RELAY ECHO 41:12 '),
    ),
  ]);
  if (state.flags.includes('echo-unlocked')) {
    const echo = PUZZLES.find((p) => p.id === 'echo');
    entries.push([
      'echo.tkt',
      file(() => [
        'TICKET ECHO — décodage du signal',
        ...(echo?.brief ?? []),
        '',
        'Ouvrir : edit echo',
      ]),
    ]);
  }
  return dir(Object.fromEntries(entries));
}

export function buildFs(state: GameState): FsNode {
  return dir({
    home: dir({
      warden: dir({
        'readme.txt': file(() => README),
        'notes.txt': file(() => [
          'Notes du Gardien :',
          '- les incidents se réparent gratuitement en KX-ASM (repair <module>)',
          '- un firmware enregistré peut être redéployé (deploy <module>)',
          "- les paquets de données dérivants peuvent être interceptés d'un clic",
          '- les fichiers .enc se déchiffrent avec des données (decrypt <fichier>)',
        ]),
      }),
    }),
    docs: dir({ 'kxasm.man': file(() => KXASM_MANUAL) }),
    logs: logsDir(state),
    sys: sysDir(state),
    firmware: firmwareDir(state),
    tickets: ticketsDir(state),
    ...(state.modules.relay.count > 0 || state.flags.includes('echo-unlocked')
      ? { signal: signalDir(state) }
      : {}),
    media: dir({ 'equipage.img': file(() => STATION_EMBLEM) }),
  });
}

export function normalizePath(cwd: string, path: string): string {
  const base = path.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  const expanded = path.replace(/^~(?=\/|$)/, '/home/warden');
  const parts = (expanded.startsWith('/') ? [] : base).concat(expanded.split('/').filter(Boolean));
  const stack = parts.reduce<string[]>((acc, p) => {
    if (p === '.') return acc;
    if (p === '..') return acc.slice(0, -1);
    return [...acc, p];
  }, []);
  return `/${stack.join('/')}`;
}

export function lookup(root: FsNode, absPath: string): FsNode | null {
  return absPath
    .split('/')
    .filter(Boolean)
    .reduce<FsNode | null>(
      (node, part) =>
        node?.kind === 'dir' && Object.hasOwn(node.children, part)
          ? (node.children[part] ?? null)
          : null,
      root,
    );
}

export function logIdForFile(name: string): string | undefined {
  return LOGS.find((l) => l.file === name)?.id ?? getLog(name)?.id;
}
