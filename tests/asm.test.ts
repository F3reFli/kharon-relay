import { describe, expect, it } from 'vitest';
import { judge, buildTests } from '../src/core/asm/judge';
import { parse, MAX_SOURCE_LINES, VALUE_LIMIT } from '../src/core/asm/parser';
import { createVM, run, step } from '../src/core/asm/vm';
import { PUZZLES, codesToText, getPuzzle, textToCodes } from '../src/core/data/puzzles';
import { REFERENCE_SOLUTIONS } from './solutions';

function exec(source: string, input: number[] = []) {
  const { program, errors } = parse(source);
  if (!program) throw new Error(errors.map((e) => `${e.line}: ${e.message}`).join('\n'));
  return run(program, input);
}

describe('parser', () => {
  it('parses labels, comments and case-insensitive opcodes', () => {
    const { program, errors } = parse('start: mov a, 5 ; commentaire\n# autre\n  jmp START');
    expect(errors).toEqual([]);
    expect(program?.instructions).toHaveLength(2);
    expect(program?.labels).toEqual({ start: 0 });
  });

  it('allows a label alone on its line and at end of program', () => {
    const { program } = parse('JMP fin\nMOV A, 1\nfin:');
    expect(program?.labels.fin).toBe(2);
  });

  it.each([
    ['FOO A', 'instruction inconnue'],
    ['MOV A', 'attend 2 opérandes'],
    ['JMP nulle_part', 'introuvable'],
    ['MOV 3, A', 'destination'],
    ['MOV A, OUT', 'destination de MOV'],
    ['ADD IN, 1', 'source'],
    ['MOV A, 3x', 'opérande invalide'],
    [`MOV A, ${VALUE_LIMIT + 1}`, 'hors limites'],
    ['MOV A,, B', 'opérande vide'],
    ['9bad: NOP', 'étiquette invalide'],
    ['x: NOP\nx: NOP', 'déjà définie'],
  ])('reports error for %j', (source, fragment) => {
    const { program, errors } = parse(source);
    expect(program).toBeNull();
    expect(errors[0]?.message).toContain(fragment);
  });

  it('rejects overly long programs', () => {
    const { errors } = parse(Array.from({ length: MAX_SOURCE_LINES + 1 }, () => 'NOP').join('\n'));
    expect(errors[0]?.message).toContain('trop long');
  });

  it('rejects too many instructions', () => {
    const { errors } = parse(Array.from({ length: 130 }, () => 'NOP').join('\n'));
    expect(errors[0]?.message).toContain("trop d'instructions");
  });

  it('rejects invalid label syntax in jumps', () => {
    expect(parse('JMP 12').errors[0]?.message).toContain('étiquette invalide');
  });
});

describe('vm', () => {
  it('performs arithmetic', () => {
    const vm = exec(
      'MOV A, 7\nADD A, 3\nMUL A, 4\nSUB A, 5\nDIV A, 2\nMOV OUT, A\nMOD A, 4\nMOV OUT, A',
    );
    expect(vm.output).toEqual([17, 1]);
    expect(vm.fault).toBeNull();
  });

  it('MOD is always positive and DIV truncates', () => {
    expect(exec('MOV A, -7\nMOD A, 3\nMOV OUT, A\nMOV B, -7\nDIV B, 2\nMOV OUT, B').output).toEqual(
      [2, -3],
    );
  });

  it('supports INC, DEC, NEG, SWP and NOP', () => {
    expect(
      exec('INC A\nINC A\nDEC B\nNEG A\nNOP\nSWP A, B\nMOV OUT, A\nMOV OUT, B').output,
    ).toEqual([-1, -2]);
  });

  it('handles every conditional jump', () => {
    const src = `
      MOV A, 0
      JZ A, z
      MOV OUT, 99
    z: MOV OUT, 1
      MOV B, 5
      JNZ B, nz
      MOV OUT, 99
    nz: MOV OUT, 2
      JGZ B, gz
      MOV OUT, 99
    gz: NEG B
      JLZ B, lz
      MOV OUT, 99
    lz: MOV OUT, 3
      JGZ B, bad
      JLZ A, bad
      JNZ A, bad
      JZ B, bad
      HLT
    bad: MOV OUT, 99`;
    expect(exec(src).output).toEqual([1, 2, 3]);
  });

  it('reads input and detects end of stream', () => {
    expect(exec('l: JEOF f\nMOV OUT, IN\nJMP l\nf:', [4, 5]).output).toEqual([4, 5]);
  });

  it('faults on empty input read', () => {
    expect(exec('MOV A, IN').fault).toContain('flux IN vide');
  });

  it('faults on division and modulo by zero', () => {
    expect(exec('DIV A, 0').fault).toContain('division');
    expect(exec('MOD A, 0').fault).toContain('modulo');
  });

  it('faults on reading IN in arithmetic when empty', () => {
    expect(exec('ADD A, IN').fault).toContain('vide');
  });

  it('times out on infinite loops', () => {
    expect(exec('l: JMP l').fault).toContain('délai dépassé');
  });

  it('clamps values', () => {
    expect(exec(`MOV A, ${VALUE_LIMIT}\nMUL A, 10\nMOV OUT, A`).output).toEqual([VALUE_LIMIT]);
  });

  it('step is pure and stops when halted', () => {
    const { program } = parse('MOV A, 1\nHLT');
    if (!program) throw new Error('parse');
    const vm0 = createVM();
    const vm1 = step(program, vm0, []);
    expect(vm0.regs.A).toBe(0);
    expect(vm1.regs.A).toBe(1);
    const vm2 = step(program, vm1, []);
    expect(vm2.halted).toBe(true);
    expect(step(program, vm2, [])).toBe(vm2);
  });

  it('stops when output grows too long', () => {
    const { program } = parse('l: MOV OUT, 1\nJMP l');
    if (!program) throw new Error('parse');
    expect(run(program, [], { maxOutput: 3 }).fault).toContain('sortie trop longue');
  });
});

describe('puzzles', () => {
  it('every puzzle has a reference solution', () => {
    expect(Object.keys(REFERENCE_SOLUTIONS).sort()).toEqual(PUZZLES.map((p) => p.id).sort());
  });

  it.each(PUZZLES.map((p) => [p.id, p] as const))(
    '%s: reference solution passes on many seeds',
    (_id, puzzle) => {
      for (const seed of [1, 42, 1337, 9001, 123456]) {
        const report = judge(puzzle, REFERENCE_SOLUTIONS[puzzle.id] ?? '', seed);
        expect(report.errors).toEqual([]);
        expect(
          report.passed,
          `seed ${seed}: ${JSON.stringify(report.cases.find((c) => !c.passed))}`,
        ).toBe(true);
      }
    },
  );

  it.each(PUZZLES.map((p) => [p.id, p] as const))(
    '%s: corrupted starter firmware fails',
    (_id, puzzle) => {
      expect(judge(puzzle, puzzle.starter, 7).passed).toBe(false);
    },
  );

  it.each(PUZZLES.map((p) => [p.id, p] as const))(
    '%s: reference meets par cycles',
    (_id, puzzle) => {
      const report = judge(puzzle, REFERENCE_SOLUTIONS[puzzle.id] ?? '', 3);
      expect(report.exampleCycles).toBeLessThanOrEqual(puzzle.parCycles);
    },
  );

  it('builds deterministic tests from a seed', () => {
    const p = getPuzzle('checksum');
    if (!p) throw new Error('missing');
    expect(buildTests(p, 5)).toEqual(buildTests(p, 5));
    expect(buildTests(p, 5)).toHaveLength(p.examples.length + p.randomCases);
  });

  it('judge reports parse errors', () => {
    const p = getPuzzle('echo-bus');
    if (!p) throw new Error('missing');
    const report = judge(p, 'BOGUS', 1);
    expect(report.passed).toBe(false);
    expect(report.errors).toHaveLength(1);
  });

  it('echo text codec round-trips', () => {
    expect(codesToText(textToCodes('Nous sommes le relais'))).toBe('NOUS SOMMES LE RELAIS');
    expect(codesToText([99])).toBe('?');
  });
});
