/** Éditeur KX-ASM plein écran : fiche du ticket, code coloré, débogueur et banc de test. */

import { judge, type JudgeReport } from '../core/asm/judge';
import { MAX_CODE_LENGTH, parse } from '../core/asm/parser';
import { PRACTICE_SEED } from '../core/constants';
import { getModule } from '../core/data/modules';
import { getPuzzle, type PuzzleDef } from '../core/data/puzzles';
import { KXASM_MANUAL } from '../core/shell/docs';
import type { ModuleId } from '../core/types';
import type { UiContext } from './context';
import { Debugger } from './debugger';
import { h, setText, toggleClass } from './dom';
import { MAX_RENDERED_LINES, renderHighlighted } from './highlight';

export class EditorModal {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly highlight: HTMLElement;
  private readonly gutter: HTMLElement;
  private readonly errors: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly results: HTMLElement;
  private readonly manual: HTMLElement;
  private readonly runBtn: HTMLButtonElement;
  private readonly debugger: Debugger;
  private puzzle: PuzzleDef | null = null;
  private module: ModuleId | null = null;
  private activeLine: number | null = null;
  private errorLines = new Set<number>();
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private hintsShown = 0;
  private closing: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: UiContext) {
    this.title = h('h2', { class: 'editor-title' });
    this.brief = h('div', { class: 'editor-brief scroll' });
    this.gutter = h('div', { class: 'code-gutter', attrs: { 'aria-hidden': 'true' } });
    this.highlight = h('div', { class: 'code-highlight', attrs: { 'aria-hidden': 'true' } });
    this.textarea = this.buildTextarea();
    this.errors = h('div', { class: 'code-errors' });
    this.stats = h('div', { class: 'code-stats' });
    this.results = h('div', { class: 'test-results scroll' });
    this.manual = h('pre', { class: 'manual hidden', text: KXASM_MANUAL.join('\n') });
    this.runBtn = h('button', {
      class: 'run-btn',
      text: '▶ EXÉCUTER LES TESTS  (Ctrl+Entrée)',
      on: { click: () => this.runTests() },
    });
    this.debugger = new Debugger(
      () => this.textarea.value,
      (line) => this.setActiveLine(line),
    );
    this.root = this.buildLayout();
    this.root.addEventListener('keydown', (e) => this.onOverlayKey(e));
  }

  private buildTextarea(): HTMLTextAreaElement {
    return h('textarea', {
      class: 'code-input',
      attrs: {
        spellcheck: 'false',
        autocomplete: 'off',
        autocapitalize: 'off',
        wrap: 'off',
        maxlength: String(MAX_CODE_LENGTH),
        'aria-label': 'Code KX-ASM',
      },
      on: {
        input: () => this.onInput(),
        scroll: () => this.syncScroll(),
        keydown: (e) => this.onKey(e),
      },
    });
  }

  private buildHeader(): HTMLElement {
    const button = (cls: string, text: string, onClick: () => void, title?: string) =>
      h('button', { class: cls, text, ...(title ? { title } : {}), on: { click: onClick } });
    return h('div', { class: 'editor-head' }, [
      this.title,
      h('div', { class: 'editor-head-actions' }, [
        button('mini-btn', 'MANUEL', () => this.manual.classList.toggle('hidden')),
        button(
          'mini-btn',
          'RESTAURER',
          () => this.restore(),
          "Recharger le firmware corrompu d'origine",
        ),
        button('icon-btn', '✕', () => this.close(), 'Fermer (Échap)'),
      ]),
    ]);
  }

  private buildLayout(): HTMLElement {
    const editorBox = h('div', { class: 'code-box' }, [
      this.gutter,
      h('div', { class: 'code-scroll' }, [this.highlight, this.textarea]),
    ]);
    const center = h('div', { class: 'editor-center' }, [
      editorBox,
      this.errors,
      this.stats,
      this.runBtn,
      this.results,
    ]);
    return h(
      'div',
      {
        class: 'modal-overlay editor-overlay hidden',
        attrs: { role: 'dialog', 'aria-modal': 'true' },
      },
      [
        h('div', { class: 'editor panel-glass' }, [
          this.buildHeader(),
          h('div', { class: 'editor-grid' }, [this.brief, center, this.debugger.root]),
          this.manual,
        ]),
      ],
    );
  }

  private onOverlayKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.close();
    if (e.key === 'F10') {
      e.preventDefault();
      this.debugger.stepOnce();
    }
    e.stopPropagation();
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(puzzleId: string, module: ModuleId | null): void {
    const puzzle = getPuzzle(puzzleId);
    if (!puzzle) return;
    if (this.closing) clearTimeout(this.closing);
    this.puzzle = puzzle;
    this.module = module;
    this.hintsShown = 0;
    const state = this.ctx.store.state;
    const incident = module ? state.modules[module].incident : null;
    setText(
      this.title,
      incident
        ? `KX-ASM // TICKET #${incident.ticket} — ${getModule(module ?? '')?.name ?? ''}`
        : `KX-ASM // ENTRAÎNEMENT — ${puzzle.title}`,
    );
    this.textarea.value =
      state.drafts[puzzle.id] ?? state.solutions[puzzle.id]?.code ?? puzzle.starter;
    this.renderBrief();
    this.results.replaceChildren(
      h('p', {
        class: 'dim',
        text: 'Corrigez le firmware puis lancez les tests. Les cas aléatoires sont régénérés pour chaque ticket.',
      }),
    );
    this.root.classList.remove('hidden');
    this.root.classList.remove('success');
    this.onInput(false);
    this.debugger.load(puzzle);
    this.ctx.audio.play('open');
    setTimeout(() => this.textarea.focus(), 30);
  }

  close(): void {
    this.debugger.stop();
    this.flushDraft();
    this.root.classList.add('hidden');
  }

  private renderBrief(): void {
    const p = this.puzzle;
    if (!p) return;
    const best = this.ctx.store.state.solutions[p.id];
    const hints = h('div', { class: 'hints' });
    const hintBtn = h('button', {
      class: 'mini-btn',
      text: `AFFICHER UN INDICE (0/${p.hints.length})`,
      on: {
        click: () => {
          if (this.hintsShown >= p.hints.length) return;
          hints.append(h('p', { class: 'hint', text: `» ${p.hints[this.hintsShown] ?? ''}` }));
          this.hintsShown++;
          setText(hintBtn, `AFFICHER UN INDICE (${this.hintsShown}/${p.hints.length})`);
        },
      },
    });
    this.brief.replaceChildren(
      h('h3', { text: p.title.toUpperCase() }),
      ...p.brief.map((t) => h('p', { text: t })),
      h('h4', { text: 'EXEMPLES' }),
      ...p.examples.map((ex, i) =>
        h('div', { class: 'example' }, [
          h('span', { class: 'ex-label', text: `CAS ${i + 1}` }),
          h('code', { text: `IN  [${ex.input.join(', ')}]` }),
          h('code', { text: `OUT [${ex.expected.join(', ')}]` }),
        ]),
      ),
      h('p', {
        class: 'dim small',
        text: `+ ${p.randomCases} cas aléatoires cachés. Référence d'optimisation : ${p.parCycles} cycles sur les exemples.`,
      }),
      ...(best
        ? [
            h('p', {
              class: 'ok small',
              text: `Record enregistré : ${best.cycles} cycles, ${best.size} instructions.`,
            }),
          ]
        : []),
      hintBtn,
      hints,
    );
  }

  private onInput(saveDraft = true): void {
    const source = this.textarea.value;
    const parsed = parse(source);
    this.errorLines = new Set(parsed.errors.map((e) => e.line));
    this.errors.replaceChildren(
      ...parsed.errors
        .slice(0, 4)
        .map((e) => h('div', { class: 'err', text: `ligne ${e.line} : ${e.message}` })),
    );
    const lines = source.split('\n').length;
    setText(
      this.stats,
      parsed.program
        ? `${parsed.program.instructions.length} instructions · ${lines} lignes · compilation OK`
        : `${lines} lignes · ${parsed.errors.length} erreur(s)`,
    );
    toggleClass(this.stats, 'err', !parsed.program);
    this.gutter.replaceChildren(
      ...Array.from({ length: Math.min(lines, MAX_RENDERED_LINES) }, (_, i) =>
        h('div', { class: `gl${this.errorLines.has(i + 1) ? ' error' : ''}`, text: String(i + 1) }),
      ),
    );
    renderHighlighted(this.highlight, source, this.activeLine, this.errorLines);
    this.syncScroll();
    if (saveDraft) {
      this.debugger.reset();
      this.scheduleDraft();
    }
  }

  /** Déplace le surlignage de ligne sans redessiner tout le code (appelé à chaque pas). */
  private setActiveLine(line: number | null): void {
    if (line === this.activeLine) return;
    const rows = this.highlight.children;
    if (this.activeLine !== null) rows[this.activeLine - 1]?.classList.remove('active');
    if (line !== null) rows[line - 1]?.classList.add('active');
    this.activeLine = line;
  }

  private syncScroll(): void {
    this.highlight.style.transform = `translate(${-this.textarea.scrollLeft}px, ${-this.textarea.scrollTop}px)`;
    this.gutter.scrollTop = this.textarea.scrollTop;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end, value } = this.textarea;
      this.textarea.value = `${value.slice(0, s)}  ${value.slice(end)}`;
      this.textarea.selectionStart = this.textarea.selectionEnd = s + 2;
      this.onInput();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.runTests();
    } else if (e.key.length === 1) {
      this.ctx.audio.play('type');
    }
  }

  private scheduleDraft(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.flushDraft(), 600);
  }

  private flushDraft(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    if (this.puzzle)
      this.ctx.store.dispatch({
        type: 'saveDraft',
        puzzleId: this.puzzle.id,
        code: this.textarea.value,
      });
  }

  private restore(): void {
    if (!this.puzzle) return;
    this.textarea.value = this.puzzle.starter;
    this.onInput();
    this.debugger.reset();
  }

  private runTests(): void {
    const p = this.puzzle;
    if (!p) return;
    this.debugger.stop();
    const state = this.ctx.store.state;
    const incident = this.module ? state.modules[this.module].incident : null;
    const seed = incident && incident.puzzleId === p.id ? incident.testSeed : PRACTICE_SEED;
    const report = judge(p, this.textarea.value, seed);
    this.renderReport(report, p);
    if (!report.passed) {
      this.ctx.audio.play('error');
      return;
    }
    this.flushDraft();
    this.ctx.store.dispatch({
      type: 'submitSolution',
      puzzleId: p.id,
      code: this.textarea.value,
      module: incident ? this.module : null,
    });
    this.root.classList.add('success');
    this.closing = setTimeout(() => this.close(), 2200);
  }

  private renderReport(report: JudgeReport, p: PuzzleDef): void {
    if (report.errors.length > 0) {
      this.results.replaceChildren(
        h('p', {
          class: 'err',
          text: `Compilation impossible : ${report.errors.length} erreur(s).`,
        }),
      );
      return;
    }
    const rows = report.cases.map((c, i) =>
      h('div', { class: `case-result ${c.passed ? 'ok' : 'bad'}` }, [
        h('span', {
          text: `${c.passed ? '✓' : '✗'} ${i < p.examples.length ? `exemple ${i + 1}` : `aléatoire ${i - p.examples.length + 1}`}`,
        }),
        h('span', { class: 'dim', text: `${c.cycles} cycles` }),
        c.passed
          ? null
          : h('div', {
              class: 'case-detail',
              text: `IN [${c.input.join(', ')}] → attendu [${c.expected.join(', ')}], obtenu [${c.output.join(', ')}]${c.fault ? ` — ${c.fault}` : ''}`,
            }),
      ]),
    );
    const passed = report.cases.filter((c) => c.passed).length;
    const summary = report.passed
      ? h('div', { class: 'success-banner' }, [
          h('div', { class: 'success-title', text: '▓▒░ PATCH VALIDÉ ░▒▓' }),
          h('div', {
            text: `${report.exampleCycles} cycles (référence ${p.parCycles}) · ${report.size} instructions${report.exampleCycles <= p.parCycles ? ' · OPTIMISÉ' : ''}`,
          }),
        ])
      : h('p', { class: 'err', text: `${passed}/${report.cases.length} cas réussis.` });
    this.results.replaceChildren(summary, ...rows);
  }
}
