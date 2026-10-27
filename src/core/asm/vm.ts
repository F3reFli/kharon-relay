/** Machine virtuelle KX-ASM : exécution pas à pas, sans mutation. */

import { VALUE_LIMIT, type Instruction, type Operand, type Program, type Reg } from './parser';

export type Registers = Readonly<Record<Reg, number>>;

export interface VMState {
  readonly pc: number;
  readonly regs: Registers;
  readonly inPtr: number;
  readonly output: readonly number[];
  readonly cycles: number;
  readonly halted: boolean;
  readonly fault: string | null;
}

export const DEFAULT_MAX_CYCLES = 20_000;

export function createVM(): VMState {
  return {
    pc: 0,
    regs: { A: 0, B: 0, C: 0, D: 0 },
    inPtr: 0,
    output: [],
    cycles: 0,
    halted: false,
    fault: null,
  };
}

function clamp(value: number): number {
  return Math.max(-VALUE_LIMIT, Math.min(VALUE_LIMIT, Math.trunc(value)));
}

function fault(vm: VMState, message: string): VMState {
  return { ...vm, halted: true, fault: message };
}

interface Read {
  readonly value: number;
  readonly inPtr: number;
}

function readSource(op: Operand, vm: VMState, input: readonly number[]): Read | string {
  switch (op.kind) {
    case 'reg':
      return { value: vm.regs[op.reg], inPtr: vm.inPtr };
    case 'imm':
      return { value: op.value, inPtr: vm.inPtr };
    case 'in': {
      const v = input[vm.inPtr];
      if (v === undefined) return 'lecture sur un flux IN vide (utilisez JEOF)';
      return { value: v, inPtr: vm.inPtr + 1 };
    }
    default:
      return 'opérande source invalide';
  }
}

function regOf(op: Operand | undefined): Reg {
  if (op?.kind !== 'reg') throw new Error('registre attendu');
  return op.reg;
}

function jumpTarget(op: Operand | undefined): number {
  if (op?.kind !== 'label') throw new Error('étiquette attendue');
  return op.target;
}

function arithmetic(ins: Instruction, vm: VMState, input: readonly number[]): VMState {
  const reg = regOf(ins.args[0]);
  const src = readSource(ins.args[1] as Operand, vm, input);
  if (typeof src === 'string') return fault(vm, src);
  const a = vm.regs[reg];
  const b = src.value;
  let result: number;
  switch (ins.op) {
    case 'ADD':
      result = a + b;
      break;
    case 'SUB':
      result = a - b;
      break;
    case 'MUL':
      result = a * b;
      break;
    case 'DIV':
      if (b === 0) return fault(vm, 'division par zéro');
      result = a / b;
      break;
    default:
      if (b === 0) return fault(vm, 'modulo par zéro');
      result = ((a % b) + Math.abs(b)) % Math.abs(b);
  }
  return { ...vm, regs: { ...vm.regs, [reg]: clamp(result) }, inPtr: src.inPtr, pc: vm.pc + 1 };
}

function conditional(ins: Instruction, vm: VMState): VMState {
  const v = vm.regs[regOf(ins.args[0])];
  const taken =
    (ins.op === 'JZ' && v === 0) ||
    (ins.op === 'JNZ' && v !== 0) ||
    (ins.op === 'JGZ' && v > 0) ||
    (ins.op === 'JLZ' && v < 0);
  return { ...vm, pc: taken ? jumpTarget(ins.args[1]) : vm.pc + 1 };
}

function execute(ins: Instruction, vm: VMState, input: readonly number[]): VMState {
  switch (ins.op) {
    case 'MOV': {
      const src = readSource(ins.args[1] as Operand, vm, input);
      if (typeof src === 'string') return fault(vm, src);
      const dst = ins.args[0] as Operand;
      if (dst.kind === 'out') {
        return { ...vm, output: [...vm.output, clamp(src.value)], inPtr: src.inPtr, pc: vm.pc + 1 };
      }
      return {
        ...vm,
        regs: { ...vm.regs, [regOf(dst)]: clamp(src.value) },
        inPtr: src.inPtr,
        pc: vm.pc + 1,
      };
    }
    case 'ADD':
    case 'SUB':
    case 'MUL':
    case 'DIV':
    case 'MOD':
      return arithmetic(ins, vm, input);
    case 'INC':
    case 'DEC':
    case 'NEG': {
      const reg = regOf(ins.args[0]);
      const v = vm.regs[reg];
      const next = ins.op === 'INC' ? v + 1 : ins.op === 'DEC' ? v - 1 : -v;
      return { ...vm, regs: { ...vm.regs, [reg]: clamp(next) }, pc: vm.pc + 1 };
    }
    case 'SWP': {
      const a = regOf(ins.args[0]);
      const b = regOf(ins.args[1]);
      return { ...vm, regs: { ...vm.regs, [a]: vm.regs[b], [b]: vm.regs[a] }, pc: vm.pc + 1 };
    }
    case 'JMP':
      return { ...vm, pc: jumpTarget(ins.args[0]) };
    case 'JZ':
    case 'JNZ':
    case 'JGZ':
    case 'JLZ':
      return conditional(ins, vm);
    case 'JEOF':
      return { ...vm, pc: vm.inPtr >= input.length ? jumpTarget(ins.args[0]) : vm.pc + 1 };
    case 'NOP':
      return { ...vm, pc: vm.pc + 1 };
    case 'HLT':
      return { ...vm, halted: true };
  }
}

/** Exécute une instruction. Un programme qui dépasse sa dernière ligne s'arrête proprement. */
export function step(program: Program, vm: VMState, input: readonly number[]): VMState {
  if (vm.halted) return vm;
  const ins = program.instructions[vm.pc];
  if (!ins) return { ...vm, halted: true };
  const next = execute(ins, vm, input);
  return { ...next, cycles: vm.cycles + 1 };
}

export interface RunOptions {
  readonly maxCycles?: number;
  /** Arrête l'exécution si la sortie dépasse cette longueur. */
  readonly maxOutput?: number;
}

export function run(program: Program, input: readonly number[], options: RunOptions = {}): VMState {
  const maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES;
  const maxOutput = options.maxOutput ?? Number.POSITIVE_INFINITY;
  let vm = createVM();
  while (!vm.halted) {
    if (vm.cycles >= maxCycles)
      return fault(vm, `délai dépassé (${maxCycles} cycles) — boucle infinie ?`);
    if (vm.output.length > maxOutput) return fault(vm, 'sortie trop longue');
    vm = step(program, vm, input);
  }
  return vm;
}
