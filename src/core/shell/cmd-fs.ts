/** Commandes de navigation dans le système de fichiers. */

import { buildFs, hexNoise, lookup, normalizePath, type FsNode } from './fs';
import {
  line,
  result,
  type Command,
  type ShellContext,
  type ShellResult,
  type TermLine,
} from './types';

function resolve(
  ctx: ShellContext,
  path: string | undefined,
): { abs: string; node: FsNode | null } {
  const abs = normalizePath(ctx.cwd, path ?? '.');
  return { abs, node: lookup(buildFs(ctx.state), abs) };
}

function notFound(ctx: ShellContext, cmd: string, path: string): ShellResult {
  return result(ctx, [line(`${cmd}: ${path}: aucun fichier ou dossier de ce type`, 'err')]);
}

function listing(node: FsNode & { kind: 'dir' }, long: boolean): TermLine[] {
  const names = Object.keys(node.children).sort();
  if (names.length === 0) return [line('(vide)', 'dim')];
  if (!long) {
    return [
      line(
        names.map((n) => (node.children[n]?.kind === 'dir' ? `${n}/` : n)).join('   '),
        'accent',
      ),
    ];
  }
  return names.map((n) => {
    const child = node.children[n];
    if (child?.kind === 'dir') return line(`drwxr-x---  warden  ${n}/`, 'accent');
    const size = child?.read().join('\n').length ?? 0;
    const flag = child?.encrypted ? '  [CHIFFRÉ]' : '';
    return line(
      `-rw-r-----  warden  ${size.toString().padStart(6)}  ${n}${flag}`,
      child?.encrypted ? 'warn' : 'normal',
    );
  });
}

export const ls: Command = {
  name: 'ls',
  usage: 'ls [-l] [chemin]',
  summary: "liste le contenu d'un dossier",
  complete: 'path',
  run: (args, ctx) => {
    const long = args.includes('-l');
    const target = args.find((a) => !a.startsWith('-'));
    const { node } = resolve(ctx, target);
    if (!node) return notFound(ctx, 'ls', target ?? '.');
    if (node.kind === 'file') return result(ctx, [line(target ?? '.')]);
    return result(ctx, listing(node, long));
  },
};

export const cd: Command = {
  name: 'cd',
  usage: 'cd [chemin]',
  summary: 'change de dossier courant',
  complete: 'path',
  run: (args, ctx) => {
    const target = args[0] ?? '/home/warden';
    const { abs, node } = resolve(ctx, target);
    if (!node) return notFound(ctx, 'cd', target);
    if (node.kind !== 'dir')
      return result(ctx, [line(`cd: ${target}: n'est pas un dossier`, 'err')]);
    return result(ctx, [], [], abs);
  },
};

export const pwd: Command = {
  name: 'pwd',
  usage: 'pwd',
  summary: 'affiche le dossier courant',
  run: (_args, ctx) => result(ctx, [line(ctx.cwd)]),
};

export const cat: Command = {
  name: 'cat',
  usage: 'cat <fichier>',
  summary: "affiche le contenu d'un fichier",
  complete: 'path',
  run: (args, ctx) => {
    const target = args[0];
    if (!target) return result(ctx, [line('usage : cat <fichier>', 'warn')]);
    const { node } = resolve(ctx, target);
    if (!node) return notFound(ctx, 'cat', target);
    if (node.kind === 'dir') return result(ctx, [line(`cat: ${target}: est un dossier`, 'err')]);
    const lines = node.read().map((t) => line(t, t.startsWith('#') ? 'dim' : 'normal'));
    const actions =
      node.logId && !node.encrypted
        ? [{ type: 'dispatch' as const, action: { type: 'readLog' as const, logId: node.logId } }]
        : [];
    return result(ctx, lines, actions);
  },
};

function treeLines(node: FsNode, prefix: string, depth: number): TermLine[] {
  if (node.kind !== 'dir' || depth > 4) return [];
  const names = Object.keys(node.children).sort();
  return names.flatMap((name, i) => {
    const last = i === names.length - 1;
    const child = node.children[name] as FsNode;
    const label = child.kind === 'dir' ? `${name}/` : name;
    return [
      line(
        `${prefix}${last ? '└── ' : '├── '}${label}`,
        child.kind === 'dir' ? 'accent' : 'normal',
      ),
      ...treeLines(child, `${prefix}${last ? '    ' : '│   '}`, depth + 1),
    ];
  });
}

export const tree: Command = {
  name: 'tree',
  usage: 'tree [chemin]',
  summary: 'arborescence des fichiers',
  complete: 'path',
  run: (args, ctx) => {
    const { abs, node } = resolve(ctx, args[0]);
    if (!node) return notFound(ctx, 'tree', args[0] ?? '.');
    return result(ctx, [line(abs, 'accent'), ...treeLines(node, '', 0)]);
  },
};

export const hexdump: Command = {
  name: 'hexdump',
  usage: 'hexdump <fichier>',
  summary: "vue hexadécimale d'un fichier",
  complete: 'path',
  run: (args, ctx) => {
    const target = args[0];
    if (!target) return result(ctx, [line('usage : hexdump <fichier>', 'warn')]);
    const { node } = resolve(ctx, target);
    if (!node || node.kind !== 'file') return notFound(ctx, 'hexdump', target);
    const text = node.read().join('\n');
    const rows = Math.min(16, Math.ceil(text.length / 16));
    return result(
      ctx,
      hexNoise(target, rows, text.replace(/[^\x20-\x7e]/g, '.')).map((t) => line(t, 'dim')),
    );
  },
};

export const grep: Command = {
  name: 'grep',
  usage: 'grep <motif> <fichier>',
  summary: 'recherche un motif dans un fichier',
  complete: 'path',
  run: (args, ctx) => {
    const [pattern, target] = args;
    if (!pattern || !target) return result(ctx, [line('usage : grep <motif> <fichier>', 'warn')]);
    const { node } = resolve(ctx, target);
    if (!node || node.kind !== 'file') return notFound(ctx, 'grep', target);
    const needle = pattern.toLowerCase();
    const hits = node.read().filter((t) => t.toLowerCase().includes(needle));
    return result(
      ctx,
      hits.length ? hits.map((t) => line(t, 'accent')) : [line('(aucune correspondance)', 'dim')],
    );
  },
};

export const FS_COMMANDS: readonly Command[] = [ls, cd, pwd, cat, tree, hexdump, grep];
