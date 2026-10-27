/** Coloration syntaxique KX-ASM (construction de nœuds DOM, sans innerHTML). */

import { OPCODES, REGISTERS } from '../core/asm/parser';

const OPS = new Set<string>(OPCODES);
const REGS = new Set<string>(REGISTERS);

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function classify(token: string, isFirstWord: boolean): string {
  const upper = token.toUpperCase();
  if (isFirstWord) return OPS.has(upper) ? 'hl-op' : 'hl-bad';
  if (REGS.has(upper)) return 'hl-reg';
  if (upper === 'IN' || upper === 'OUT') return 'hl-io';
  if (/^[+-]?\d+$/.test(token)) return 'hl-num';
  return 'hl-ref';
}

export function highlightLine(text: string): Node[] {
  const commentAt = text.search(/[;#]/);
  const code = commentAt === -1 ? text : text.slice(0, commentAt);
  const comment = commentAt === -1 ? '' : text.slice(commentAt);
  const nodes: Node[] = [];
  let seenWord = false;
  const tokens = code.match(/\s+|,|[^\s,]+/g) ?? [];
  tokens.forEach((tok) => {
    if (/^\s+$/.test(tok) || tok === ',') {
      nodes.push(document.createTextNode(tok));
      return;
    }
    if (!seenWord && tok.endsWith(':')) {
      nodes.push(span('hl-label', tok));
      return;
    }
    const labelInline = tok.indexOf(':');
    if (!seenWord && labelInline > 0) {
      nodes.push(span('hl-label', tok.slice(0, labelInline + 1)));
      const rest = tok.slice(labelInline + 1);
      if (rest) {
        nodes.push(span(classify(rest, true), rest));
        seenWord = true;
      }
      return;
    }
    nodes.push(span(classify(tok, !seenWord), tok));
    seenWord = true;
  });
  if (comment) nodes.push(span('hl-comment', comment));
  return nodes;
}

/** Au-delà, le source est de toute façon refusé par l'analyseur : inutile de tout dessiner. */
export const MAX_RENDERED_LINES = 400;

/** Remplit un conteneur avec une ligne par élément (pour l'éditeur). */
export function renderHighlighted(
  container: HTMLElement,
  source: string,
  activeLine: number | null,
  errorLines: ReadonlySet<number>,
): void {
  const frag = document.createDocumentFragment();
  source
    .split('\n')
    .slice(0, MAX_RENDERED_LINES)
    .forEach((text, i) => {
      const line = document.createElement('div');
      line.className = `code-line${activeLine === i + 1 ? ' active' : ''}${errorLines.has(i + 1) ? ' error' : ''}`;
      line.append(...highlightLine(text));
      line.append(document.createTextNode('​'));
      frag.append(line);
    });
  container.replaceChildren(frag);
}
