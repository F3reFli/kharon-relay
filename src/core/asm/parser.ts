/**
 * Analyseur du langage KX-ASM (Kharon eXecutive Assembly).
 *
 * Grammaire (une instruction par ligne, insensible à la casse) :
 *   ligne     := [etiquette ':'] [opcode [operande (',' operande)*]] [commentaire]
 *   operande  := A | B | C | D | entier | IN | OUT | etiquette
 *   commentaire commence par ';' ou '#'
 */

export type Reg = 'A' | 'B' | 'C' | 'D';
export const REGISTERS: readonly Reg[] = ['A', 'B', 'C', 'D'];

export type Opcode =
  | 'MOV'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'INC'
  | 'DEC'
  | 'NEG'
  | 'SWP'
  | 'JMP'
  | 'JZ'
  | 'JNZ'
  | 'JGZ'
  | 'JLZ'
  | 'JEOF'
  | 'NOP'
  | 'HLT';

export type Operand =
  | { readonly kind: 'reg'; readonly reg: Reg }
  | { readonly kind: 'imm'; readonly value: number }
  | { readonly kind: 'in' }
  | { readonly kind: 'out' }
  | { readonly kind: 'label'; readonly name: string; readonly target: number };

export interface Instruction {
  readonly op: Opcode;
  readonly args: readonly Operand[];
  /** Ligne source (1-indexée). */
  readonly line: number;
}

export interface Program {
  readonly instructions: readonly Instruction[];
  readonly labels: Readonly<Record<string, number>>;
}

export interface ParseError {
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly program: Program | null;
  readonly errors: readonly ParseError[];
}

/** Types d'opérandes acceptés par position. */
type Slot = 'dst' | 'reg' | 'src' | 'label';

export const SIGNATURES: Readonly<Record<Opcode, readonly Slot[]>> = {
  MOV: ['dst', 'src'],
  ADD: ['reg', 'src'],
  SUB: ['reg', 'src'],
  MUL: ['reg', 'src'],
  DIV: ['reg', 'src'],
  MOD: ['reg', 'src'],
  INC: ['reg'],
  DEC: ['reg'],
  NEG: ['reg'],
  SWP: ['reg', 'reg'],
  JMP: ['label'],
  JZ: ['reg', 'label'],
  JNZ: ['reg', 'label'],
  JGZ: ['reg', 'label'],
  JLZ: ['reg', 'label'],
  JEOF: ['label'],
  NOP: [],
  HLT: [],
};

export const OPCODES = Object.keys(SIGNATURES) as Opcode[];

export const MAX_SOURCE_LINES = 160;
/** Taille maximale d'un source (caractères) : bornée pour la sauvegarde et le rendu. */
export const MAX_CODE_LENGTH = 20_000;
export const MAX_INSTRUCTIONS = 120;
export const VALUE_LIMIT = 99_999;

const LABEL_RE = /^[a-z_][a-z0-9_]*$/;
const INT_RE = /^[+-]?\d+$/;

interface RawLine {
  readonly line: number;
  readonly label: string | null;
  readonly op: string | null;
  readonly args: readonly string[];
}

function stripComment(text: string): string {
  const idx = text.search(/[;#]/);
  return idx === -1 ? text : text.slice(0, idx);
}

function splitLine(text: string, line: number): RawLine | ParseError {
  let rest = stripComment(text).trim();
  let label: string | null = null;
  const colon = rest.indexOf(':');
  if (colon !== -1) {
    label = rest.slice(0, colon).trim().toLowerCase();
    rest = rest.slice(colon + 1).trim();
    if (!LABEL_RE.test(label)) return { line, message: `étiquette invalide « ${label} »` };
  }
  if (!rest) return { line, label, op: null, args: [] };
  const space = rest.search(/\s/);
  const op = (space === -1 ? rest : rest.slice(0, space)).toUpperCase();
  const argText = space === -1 ? '' : rest.slice(space).trim();
  const args = argText ? argText.split(',').map((a) => a.trim()) : [];
  if (args.some((a) => a === '')) return { line, message: 'opérande vide (virgule en trop ?)' };
  return { line, label, op, args };
}

function parseOperand(
  raw: string,
  slot: Slot,
  labels: Readonly<Record<string, number>>,
): Operand | string {
  const upper = raw.toUpperCase();
  if (slot === 'label') {
    const name = raw.toLowerCase();
    if (!LABEL_RE.test(name)) return `étiquette invalide « ${raw} »`;
    const target = Object.hasOwn(labels, name) ? labels[name] : undefined;
    if (target === undefined) return `étiquette « ${raw} » introuvable`;
    return { kind: 'label', name, target };
  }
  if ((REGISTERS as readonly string[]).includes(upper)) return { kind: 'reg', reg: upper as Reg };
  if (upper === 'IN') return slot === 'src' ? { kind: 'in' } : "IN ne peut être lu qu'en source";
  if (upper === 'OUT')
    return slot === 'dst' ? { kind: 'out' } : "OUT ne peut être qu'une destination de MOV";
  if (INT_RE.test(raw)) {
    if (slot !== 'src') return `une valeur immédiate (${raw}) ne peut pas être une destination`;
    const value = Number.parseInt(raw, 10);
    if (Math.abs(value) > VALUE_LIMIT) return `valeur hors limites (±${VALUE_LIMIT})`;
    return { kind: 'imm', value };
  }
  return `opérande invalide « ${raw} »`;
}

function collectLabels(lines: readonly RawLine[]): {
  labels: Record<string, number>;
  errors: ParseError[];
} {
  const labels: Record<string, number> = Object.create(null) as Record<string, number>;
  const errors: ParseError[] = [];
  let index = 0;
  for (const l of lines) {
    if (l.label !== null) {
      if (Object.hasOwn(labels, l.label))
        errors.push({ line: l.line, message: `étiquette « ${l.label} » déjà définie` });
      else labels[l.label] = index;
    }
    if (l.op !== null) index++;
  }
  return { labels, errors };
}

function buildInstruction(
  l: RawLine & { op: string },
  labels: Readonly<Record<string, number>>,
): Instruction | ParseError {
  if (!(l.op in SIGNATURES)) return { line: l.line, message: `instruction inconnue « ${l.op} »` };
  const op = l.op as Opcode;
  const sig = SIGNATURES[op];
  if (l.args.length !== sig.length) {
    const plural = sig.length > 1 ? 's' : '';
    return {
      line: l.line,
      message: `${op} attend ${sig.length} opérande${plural}, reçu ${l.args.length}`,
    };
  }
  const args: Operand[] = [];
  for (let i = 0; i < sig.length; i++) {
    const parsed = parseOperand(l.args[i] ?? '', sig[i] as Slot, labels);
    if (typeof parsed === 'string') return { line: l.line, message: `${op} : ${parsed}` };
    args.push(parsed);
  }
  return { op, args, line: l.line };
}

export function parse(source: string): ParseResult {
  const sourceLines = source.replace(/\r\n?/g, '\n').split('\n');
  if (sourceLines.length > MAX_SOURCE_LINES) {
    return {
      program: null,
      errors: [
        { line: MAX_SOURCE_LINES, message: `programme trop long (max ${MAX_SOURCE_LINES} lignes)` },
      ],
    };
  }
  const raw: RawLine[] = [];
  const errors: ParseError[] = [];
  sourceLines.forEach((text, i) => {
    const res = splitLine(text, i + 1);
    if ('message' in res) errors.push(res);
    else raw.push(res);
  });
  const { labels, errors: labelErrors } = collectLabels(raw);
  errors.push(...labelErrors);
  const instructions: Instruction[] = [];
  for (const l of raw) {
    if (l.op === null) continue;
    const res = buildInstruction({ ...l, op: l.op }, labels);
    if ('message' in res) errors.push(res);
    else instructions.push(res);
  }
  if (instructions.length > MAX_INSTRUCTIONS) {
    errors.push({
      line: 1,
      message: `trop d'instructions (${instructions.length}/${MAX_INSTRUCTIONS})`,
    });
  }
  if (errors.length > 0)
    return { program: null, errors: [...errors].sort((a, b) => a.line - b.line) };
  return { program: { instructions, labels }, errors: [] };
}

/** Nombre d'instructions effectives (métrique « taille » des solutions). */
export function programSize(program: Program): number {
  return program.instructions.length;
}
