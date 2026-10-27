/** Interpréteur de commandes : découpage, exécution et autocomplétion. */

import { MODULES } from '../data/modules';
import { PUZZLES } from '../data/puzzles';
import { UPGRADES } from '../data/upgrades';
import { eventCommand } from './cmd-event';
import { FS_COMMANDS } from './cmd-fs';
import { MISC_COMMANDS } from './cmd-misc';
import { STATION_COMMANDS } from './cmd-station';
import { buildFs, lookup, normalizePath } from './fs';
import { line, result, type Command, type ShellContext, type ShellResult } from './types';

const help: Command = {
  name: 'help',
  usage: 'help [commande]',
  summary: 'liste des commandes',
  complete: 'command',
  run: (args, ctx) => {
    const name = args[0];
    if (name) {
      const cmd = REGISTRY.get(name);
      if (!cmd) return result(ctx, [line(`help: commande inconnue « ${name} »`, 'err')]);
      return result(ctx, [line(cmd.usage, 'accent'), line(`  ${cmd.summary}`)]);
    }
    const visible = COMMANDS.filter((c) => !c.hidden);
    return result(ctx, [
      line('Commandes disponibles :', 'title'),
      ...visible.map((c) => line(`  ${c.name.padEnd(10)} ${c.summary}`)),
      line("Astuces : Tab complète, ↑/↓ parcourt l'historique, Ctrl+L efface.", 'dim'),
    ]);
  },
};

export const COMMANDS: readonly Command[] = [
  help,
  ...STATION_COMMANDS,
  eventCommand,
  ...FS_COMMANDS,
  ...MISC_COMMANDS,
];
const REGISTRY: ReadonlyMap<string, Command> = new Map(COMMANDS.map((c) => [c.name, c]));

export const MAX_INPUT_LENGTH = 300;

/** Découpe une ligne en jetons, avec prise en charge des guillemets. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) tokens.push(m[1] ?? m[2] ?? m[3] ?? '');
  return tokens;
}

export function execute(input: string, ctx: ShellContext): ShellResult {
  const trimmed = input.trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmed) return result(ctx, []);
  const [name = '', ...args] = tokenize(trimmed);
  const cmd = REGISTRY.get(name.toLowerCase());
  if (!cmd) {
    return result(ctx, [line(`${name}: commande introuvable. Tapez « help ».`, 'err')]);
  }
  try {
    const res = cmd.run(args, ctx);
    return { ...res, actions: [{ type: 'dispatch', action: { type: 'command' } }, ...res.actions] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'erreur inconnue';
    return result(ctx, [line(`${name}: erreur interne (${message})`, 'err')]);
  }
}

function pathCandidates(partial: string, ctx: ShellContext): string[] {
  const slash = partial.lastIndexOf('/');
  const dirPart = slash === -1 ? '' : partial.slice(0, slash + 1);
  const prefix = slash === -1 ? partial : partial.slice(slash + 1);
  const node = lookup(buildFs(ctx.state), normalizePath(ctx.cwd, dirPart || '.'));
  if (node?.kind !== 'dir') return [];
  return Object.entries(node.children)
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, child]) => `${dirPart}${name}${child.kind === 'dir' ? '/' : ''}`);
}

function argCandidates(cmd: Command, partial: string, ctx: ShellContext): string[] {
  switch (cmd.complete) {
    case 'path':
      return pathCandidates(partial, ctx);
    case 'module':
      return MODULES.filter((m) => ctx.state.discovered.includes(m.id))
        .map((m) => m.id)
        .filter((id) => id.startsWith(partial));
    case 'puzzle':
      return PUZZLES.map((p) => p.id).filter((id) => id.startsWith(partial));
    case 'upgrade':
      return UPGRADES.filter(
        (u) => ctx.state.discovered.includes(u.id) && !ctx.state.upgrades.includes(u.id),
      )
        .map((u) => u.id)
        .filter((id) => id.startsWith(partial));
    case 'command':
      return COMMANDS.filter((c) => !c.hidden)
        .map((c) => c.name)
        .filter((n) => n.startsWith(partial));
    default:
      return [];
  }
}

function commonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  return values.reduce((prefix, v) => {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    return prefix.slice(0, i);
  });
}

export interface Completion {
  readonly value: string;
  readonly options: readonly string[];
}

/** Autocomplétion façon shell : complète le dernier jeton et renvoie les options. */
export function complete(input: string, ctx: ShellContext): Completion {
  const endsWithSpace = /\s$/.test(input);
  const tokens = tokenize(input);
  if (tokens.length === 0 || (tokens.length === 1 && !endsWithSpace)) {
    const partial = tokens[0] ?? '';
    const options = COMMANDS.filter((c) => !c.hidden && c.name.startsWith(partial)).map(
      (c) => c.name,
    );
    const value = options.length === 1 ? `${options[0]} ` : commonPrefix(options) || partial;
    return { value, options };
  }
  const cmd = REGISTRY.get((tokens[0] ?? '').toLowerCase());
  if (!cmd) return { value: input, options: [] };
  const partial = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
  const head = endsWithSpace ? input : input.slice(0, input.length - partial.length);
  const options = argCandidates(cmd, partial, ctx);
  if (options.length === 1) {
    const only = options[0] ?? '';
    return { value: head + only + (only.endsWith('/') ? '' : ' '), options };
  }
  return { value: head + (commonPrefix(options) || partial), options };
}

export function prompt(cwd: string): string {
  const short = cwd.startsWith('/home/warden') ? `~${cwd.slice('/home/warden'.length)}` : cwd;
  return `warden@kharon:${short}$`;
}
