/** Banc de test des firmwares : compile, exécute chaque cas et compare les sorties. */

import { createRandomStream } from '../rng';
import type { PuzzleDef, TestCase } from '../data/puzzles';
import { parse, programSize, type ParseError } from './parser';
import { run } from './vm';

export interface CaseReport {
  readonly input: readonly number[];
  readonly expected: readonly number[];
  readonly output: readonly number[];
  readonly passed: boolean;
  readonly cycles: number;
  readonly fault: string | null;
}

export interface JudgeReport {
  readonly passed: boolean;
  readonly errors: readonly ParseError[];
  readonly cases: readonly CaseReport[];
  /** Cycles cumulés sur les exemples publics (métrique d'optimisation). */
  readonly exampleCycles: number;
  readonly size: number;
}

/** Jeu de tests complet : exemples publics + cas générés depuis la graine. */
export function buildTests(puzzle: PuzzleDef, seed: number): readonly TestCase[] {
  const rand = createRandomStream(seed);
  const generated = Array.from({ length: puzzle.randomCases }, () => puzzle.generate(rand));
  return [...puzzle.examples, ...generated];
}

function sameOutput(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function judge(puzzle: PuzzleDef, source: string, seed: number): JudgeReport {
  const parsed = parse(source);
  if (!parsed.program) {
    return { passed: false, errors: parsed.errors, cases: [], exampleCycles: 0, size: 0 };
  }
  const program = parsed.program;
  const cases = buildTests(puzzle, seed).map((test): CaseReport => {
    const vm = run(program, test.input, { maxOutput: test.expected.length + 16 });
    const passed = vm.fault === null && sameOutput(vm.output, test.expected);
    return {
      input: test.input,
      expected: test.expected,
      output: vm.output,
      passed,
      cycles: vm.cycles,
      fault: vm.fault,
    };
  });
  const exampleCycles = cases
    .slice(0, puzzle.examples.length)
    .reduce((sum, c) => sum + c.cycles, 0);
  return {
    passed: cases.every((c) => c.passed),
    errors: [],
    cases,
    exampleCycles,
    size: programSize(program),
  };
}
