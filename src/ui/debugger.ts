/** Débogueur pas à pas : registres, pointeur d'instruction, flux IN/OUT comparés à l'attendu. */

import { parse, REGISTERS, type Program } from '../core/asm/parser';
import { createVM, DEFAULT_MAX_CYCLES, step, type VMState } from '../core/asm/vm';
import { codesToText, type PuzzleDef, type TestCase } from '../core/data/puzzles';
import { h, setText, toggleClass } from './dom';

const SPEEDS = [4, 15, 60, 240] as const;
const MAX_SHOWN_OUTPUT = 64;

export class Debugger {
  readonly root: HTMLElement;
  private readonly regs: Record<string, HTMLElement>;
  private readonly pcEl: HTMLElement;
  private readonly inEl: HTMLElement;
  private readonly outEl: HTMLElement;
  private readonly expEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly caseRow: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private program: Program | null = null;
  private vm: VMState = createVM();
  private cases: readonly TestCase[] = [];
  private caseIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private speed: number = SPEEDS[1];
  private puzzle: PuzzleDef | null = null;

  constructor(
    private readonly getSource: () => string,
    private readonly onLine: (line: number | null) => void,
  ) {
    this.regs = Object.fromEntries(
      REGISTERS.map((r) => [r, h('span', { class: 'reg-val', text: '0' })]),
    );
    this.pcEl = h('span', { class: 'dbg-pc' });
    this.inEl = h('div', { class: 'stream' });
    this.outEl = h('div', { class: 'stream' });
    this.expEl = h('div', { class: 'stream dim' });
    this.textEl = h('div', { class: 'stream-text hidden' });
    this.statusEl = h('div', { class: 'dbg-status' });
    this.caseRow = h('div', { class: 'case-row' });
    this.playBtn = h('button', {
      class: 'dbg-btn',
      text: '▶ LECTURE',
      on: { click: () => this.togglePlay() },
    });
    const label = (text: string) => h('div', { class: 'stream-label', text });
    this.root = h('div', { class: 'debugger' }, [
      h('h3', { text: 'DÉBOGUEUR' }),
      this.caseRow,
      this.buildRegisters(),
      this.pcEl,
      label('IN'),
      this.inEl,
      label('OUT'),
      this.outEl,
      this.textEl,
      label('ATTENDU'),
      this.expEl,
      this.buildControls(),
      this.statusEl,
    ]);
  }

  private buildRegisters(): HTMLElement {
    return h(
      'div',
      { class: 'reg-grid' },
      REGISTERS.map((r) =>
        h('div', { class: 'reg' }, [
          h('span', { class: 'reg-name', text: r }),
          this.regs[r] ?? null,
        ]),
      ),
    );
  }

  private buildControls(): HTMLElement {
    const speedSelect = h(
      'select',
      {
        class: 'dbg-speed',
        attrs: { 'aria-label': 'Vitesse' },
        on: { change: (e) => (this.speed = Number((e.target as HTMLSelectElement).value)) },
      },
      SPEEDS.map((s) =>
        h('option', {
          text: `${s} instr/s`,
          attrs: s === this.speed ? { value: String(s), selected: 'true' } : { value: String(s) },
        }),
      ),
    );
    const button = (text: string, title: string, onClick: () => void) =>
      h('button', { class: 'dbg-btn', text, title, on: { click: onClick } });
    return h('div', { class: 'dbg-controls' }, [
      button('⏮ RAZ', 'Réinitialiser', () => this.reset()),
      button('⏯ PAS', 'Pas à pas (F10)', () => this.stepOnce()),
      this.playBtn,
      speedSelect,
    ]);
  }

  load(puzzle: PuzzleDef): void {
    this.puzzle = puzzle;
    this.cases = puzzle.examples;
    this.caseIndex = 0;
    this.caseRow.replaceChildren(
      ...this.cases.map((_, i) =>
        h('button', {
          class: `case-btn${i === 0 ? ' active' : ''}`,
          text: `CAS ${i + 1}`,
          on: { click: () => this.selectCase(i) },
        }),
      ),
    );
    toggleClass(this.textEl, 'hidden', !puzzle.decodeAsText);
    this.reset();
  }

  private selectCase(i: number): void {
    this.caseIndex = i;
    [...this.caseRow.children].forEach((c, k) => toggleClass(c, 'active', k === i));
    this.reset();
  }

  private current(): TestCase {
    return this.cases[this.caseIndex] ?? { input: [], expected: [] };
  }

  reset(): void {
    this.stop();
    this.vm = createVM();
    const parsed = parse(this.getSource());
    this.program = parsed.program;
    setText(
      this.statusEl,
      parsed.program ? 'Prêt.' : `Erreur de compilation ligne ${parsed.errors[0]?.line ?? '?'}.`,
    );
    toggleClass(this.statusEl, 'err', !parsed.program);
    this.render();
  }

  stepOnce(): void {
    if (!this.program) this.reset();
    if (!this.program || this.vm.halted) return;
    const test = this.current();
    this.vm = step(this.program, this.vm, test.input);
    if (this.vm.cycles > DEFAULT_MAX_CYCLES) {
      this.vm = { ...this.vm, halted: true, fault: 'délai dépassé' };
    } else if (this.vm.output.length > test.expected.length + 16) {
      this.vm = { ...this.vm, halted: true, fault: 'sortie trop longue' };
    }
    this.render();
    if (this.vm.halted) this.stop();
  }

  private togglePlay(): void {
    if (this.timer) {
      this.stop();
      return;
    }
    if (!this.program || this.vm.halted) this.reset();
    if (!this.program) return;
    setText(this.playBtn, '⏸ PAUSE');
    const tick = Math.max(4, Math.floor(1000 / this.speed));
    const perTick = Math.max(1, Math.round(this.speed / (1000 / tick)));
    this.timer = setInterval(() => {
      for (let i = 0; i < perTick && !this.vm.halted; i++) this.stepOnce();
    }, tick);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setText(this.playBtn, '▶ LECTURE');
  }

  private render(): void {
    const test = this.current();
    REGISTERS.forEach((r) => {
      const el = this.regs[r];
      if (el) setText(el, String(this.vm.regs[r]));
    });
    const ins = this.program?.instructions[this.vm.pc];
    setText(
      this.pcEl,
      `PC ${this.vm.pc.toString().padStart(3, '0')}  ·  cycles ${this.vm.cycles}${ins ? `  ·  ligne ${ins.line}` : ''}`,
    );
    this.onLine(this.vm.halted || !ins ? null : ins.line);
    this.inEl.replaceChildren(
      ...test.input.map((v, i) =>
        h('span', { class: `cell${i < this.vm.inPtr ? ' used' : ''}`, text: String(v) }),
      ),
    );
    // Seules les dernières valeurs sont dessinées : la sortie peut grandir à chaque pas.
    const shownFrom = Math.max(0, this.vm.output.length - MAX_SHOWN_OUTPUT);
    this.outEl.replaceChildren(
      ...this.vm.output.slice(shownFrom).map((v, k) => {
        const i = shownFrom + k;
        return h('span', {
          class: `cell ${test.expected[i] === v ? 'ok' : 'bad'}`,
          text: String(v),
        });
      }),
    );
    this.expEl.replaceChildren(
      ...test.expected.map((v) => h('span', { class: 'cell', text: String(v) })),
    );
    if (this.puzzle?.decodeAsText) setText(this.textEl, `« ${codesToText(this.vm.output)} »`);
    if (this.vm.halted) {
      const ok =
        !this.vm.fault &&
        this.vm.output.length === test.expected.length &&
        this.vm.output.every((v, i) => v === test.expected[i]);
      setText(
        this.statusEl,
        this.vm.fault
          ? `FAUTE : ${this.vm.fault}`
          : ok
            ? `✓ Cas réussi en ${this.vm.cycles} cycles.`
            : "✗ Arrêt : sortie différente de l'attendu.",
      );
      toggleClass(this.statusEl, 'err', !ok);
      toggleClass(this.statusEl, 'ok', ok);
    }
  }
}
