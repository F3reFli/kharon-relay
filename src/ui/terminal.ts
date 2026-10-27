/** Vue du terminal : sortie défilante, invite, historique, autocomplétion. */

import { complete, execute, MAX_INPUT_LENGTH, prompt } from '../core/shell/shell';
import type { ShellAction, TermLine, Tone } from '../core/shell/types';
import type { UiContext } from './context';
import { clear, h, setText, toggleClass } from './dom';

const MAX_LINES = 500;
const HISTORY_LIMIT = 100;

export class TerminalView {
  readonly root: HTMLElement;
  private readonly output: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly promptEl: HTMLElement;
  private cwd = '/home/warden';
  private history: string[] = [];
  private historyIndex = -1;
  private collapsed = false;

  constructor(
    private readonly ctx: UiContext,
    private readonly onAction: (action: ShellAction) => void,
  ) {
    this.output = h('div', { class: 'term-output', attrs: { role: 'log', 'aria-live': 'polite' } });
    this.promptEl = h('span', { class: 'term-prompt', text: `${prompt(this.cwd)} ` });
    this.input = h('input', {
      class: 'term-input',
      attrs: {
        type: 'text',
        spellcheck: 'false',
        autocomplete: 'off',
        autocapitalize: 'off',
        maxlength: String(MAX_INPUT_LENGTH),
        'aria-label': 'Commande',
      },
      on: { keydown: (e) => this.onKey(e) },
    });
    const head = h('div', { class: 'term-head' }, [
      h('span', { class: 'term-title', text: '▣ KX-OS TERMINAL — tty0' }),
      h('span', { class: 'term-hint', text: 'help · Tab · ↑↓ · `' }),
      h('button', {
        class: 'icon-btn small',
        text: '▾',
        title: 'Réduire / agrandir',
        on: { click: () => this.toggle() },
      }),
    ]);
    this.root = h(
      'section',
      { class: 'terminal panel-glass', attrs: { 'aria-label': 'Terminal' } },
      [head, this.output, h('label', { class: 'term-line' }, [this.promptEl, this.input])],
    );
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.output || e.target === this.root) setTimeout(() => this.focus(), 0);
    });
    this.printBanner();
  }

  private printBanner(): void {
    this.print([
      { text: 'KX-OS 0.9.14-rc (tty0) — station KHARON', tone: 'title' },
      {
        text: 'Gardien réactivé après 1 097 jours de veille. Intégrité de la station : 3 %.',
        tone: 'warn',
      },
      {
        text: 'Tapez « help » pour la liste des commandes, « cat readme.txt » pour commencer.',
        tone: 'dim',
      },
    ]);
  }

  print(lines: readonly TermLine[]): void {
    const frag = document.createDocumentFragment();
    lines.forEach((l) =>
      frag.append(h('div', { class: `tl tone-${l.tone}`, text: l.text || ' ' })),
    );
    this.output.append(frag);
    while (this.output.childElementCount > MAX_LINES) this.output.firstElementChild?.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }

  /** Message système (événements de jeu) dans le flux du terminal. */
  system(text: string, tone: Tone = 'dim'): void {
    this.print([{ text: `[sys] ${text}`, tone }]);
  }

  run(command: string, echo = true): void {
    const trimmed = command.trim();
    if (echo) this.print([{ text: `${prompt(this.cwd)} ${command}`, tone: 'accent' }]);
    if (!trimmed) return;
    if (this.history[this.history.length - 1] !== trimmed)
      this.history = [...this.history, trimmed].slice(-HISTORY_LIMIT);
    this.historyIndex = -1;
    const res = execute(trimmed, {
      state: this.ctx.store.state,
      cwd: this.cwd,
      history: this.history,
      now: new Date(),
      notation: this.ctx.settings().notation,
    });
    this.cwd = res.cwd;
    setText(this.promptEl, `${prompt(this.cwd)} `);
    if (res.actions.some((a) => a.type === 'clear')) clear(this.output);
    this.print(res.lines);
    res.actions.forEach((a) => {
      if (a.type !== 'clear') this.onAction(a);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key.length === 1) this.ctx.audio.play('type');
    switch (e.key) {
      case 'Enter': {
        const value = this.input.value;
        this.input.value = '';
        this.run(value);
        break;
      }
      case 'Tab': {
        e.preventDefault();
        const res = complete(this.input.value, {
          state: this.ctx.store.state,
          cwd: this.cwd,
          history: this.history,
          now: new Date(),
          notation: this.ctx.settings().notation,
        });
        this.input.value = res.value;
        if (res.options.length > 1) this.print([{ text: res.options.join('   '), tone: 'dim' }]);
        break;
      }
      case 'ArrowUp':
        e.preventDefault();
        this.browse(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.browse(-1);
        break;
      case 'Escape':
        this.input.blur();
        break;
      default:
        if (e.key === 'l' && e.ctrlKey) {
          e.preventDefault();
          clear(this.output);
        }
    }
    e.stopPropagation();
  }

  private browse(direction: 1 | -1): void {
    if (this.history.length === 0) return;
    this.historyIndex = Math.max(
      -1,
      Math.min(this.history.length - 1, this.historyIndex + direction),
    );
    this.input.value =
      this.historyIndex === -1
        ? ''
        : (this.history[this.history.length - 1 - this.historyIndex] ?? '');
  }

  focus(): void {
    if (this.collapsed) this.toggle();
    this.input.focus();
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    toggleClass(this.root, 'collapsed', this.collapsed);
    if (!this.collapsed) this.input.focus();
  }

  isFocused(): boolean {
    return document.activeElement === this.input;
  }
}
