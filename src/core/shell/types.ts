import type { Notation } from '../format';
import type { Action, GameState, ModuleId } from '../types';

export type Tone = 'normal' | 'dim' | 'ok' | 'warn' | 'err' | 'accent' | 'title';

export interface TermLine {
  readonly text: string;
  readonly tone: Tone;
}

export type ShellAction =
  | { readonly type: 'dispatch'; readonly action: Action }
  | { readonly type: 'openEditor'; readonly puzzleId: string; readonly module: ModuleId | null }
  | { readonly type: 'clear' }
  | { readonly type: 'openSettings' }
  | { readonly type: 'openReboot' };

export interface ShellContext {
  readonly state: GameState;
  readonly cwd: string;
  readonly history: readonly string[];
  readonly now: Date;
  readonly notation: Notation;
}

export interface ShellResult {
  readonly lines: readonly TermLine[];
  readonly cwd: string;
  readonly actions: readonly ShellAction[];
}

export interface Command {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  readonly hidden?: boolean;
  /** Type d'argument pour l'autocomplétion. */
  readonly complete?: 'path' | 'module' | 'puzzle' | 'command' | 'upgrade';
  readonly run: (args: readonly string[], ctx: ShellContext) => ShellResult;
}

export const line = (text: string, tone: Tone = 'normal'): TermLine => ({ text, tone });

export function result(
  ctx: ShellContext,
  lines: readonly TermLine[],
  actions: readonly ShellAction[] = [],
  cwd = ctx.cwd,
): ShellResult {
  return { lines, actions, cwd };
}
