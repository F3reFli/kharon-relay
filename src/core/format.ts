/** Formatage des nombres, durées et coûts pour l'interface. */

import type { Cost, ResourceId } from './types';

export type Notation = 'suffix' | 'scientific';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const;

export const RESOURCE_META: Readonly<
  Record<ResourceId, { glyph: string; label: string; short: string }>
> = {
  energy: { glyph: '⚡', label: 'Énergie', short: 'NRG' },
  alloy: { glyph: '⬡', label: 'Alliage', short: 'ALY' },
  data: { glyph: '◈', label: 'Données', short: 'DAT' },
  cores: { glyph: '✦', label: 'Fragments mémoire', short: 'MEM' },
};

function formatSmall(abs: number, digits: number): string {
  if (Number.isInteger(abs)) return abs.toString();
  const two = Number(abs.toFixed(Math.min(digits, 2)));
  if (two < 10) return abs.toFixed(Math.min(digits, 2));
  const one = Number(abs.toFixed(1));
  if (one < 100) return abs.toFixed(1);
  return Math.round(abs).toString();
}

export function formatNumber(value: number, notation: Notation = 'suffix', digits = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 999.5) return sign + formatSmall(abs, digits);
  let exponent = Math.floor(Math.log10(abs));
  if (notation === 'scientific' || Math.floor(exponent / 3) >= SUFFIXES.length) {
    let mantissa = Number((abs / 10 ** exponent).toFixed(digits));
    if (mantissa >= 10) {
      mantissa /= 10;
      exponent += 1;
    }
    return `${sign}${mantissa.toFixed(digits)}e${exponent}`;
  }
  let tier = Math.floor(exponent / 3);
  let scaled = abs / 10 ** (tier * 3);
  const precisionFor = (x: number) =>
    x >= 100 ? Math.max(0, digits - 2) : x >= 10 ? Math.max(0, digits - 1) : digits;
  // Arrondir d'abord : 999 999 doit s'afficher « 1.00M » et non « 1000K ».
  if (Number(scaled.toFixed(precisionFor(scaled))) >= 1000 && tier + 1 < SUFFIXES.length) {
    tier += 1;
    scaled /= 1000;
  }
  const rounded = Number(scaled.toFixed(precisionFor(scaled)));
  return `${sign}${rounded.toFixed(precisionFor(rounded))}${SUFFIXES[tier]}`;
}

export function formatRate(value: number, notation: Notation = 'suffix'): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value, notation)}/s`;
}

export function formatCost(cost: Cost, notation: Notation = 'suffix'): string {
  return (Object.keys(cost) as ResourceId[])
    .filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${RESOURCE_META[k].glyph}${formatNumber(cost[k] ?? 0, notation)}`)
    .join(' ');
}

/** Durée au format horloge de mission : T+HH:MM:SS (jours si nécessaire). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms = [h, m, s].map((n) => n.toString().padStart(2, '0')).join(':');
  return days > 0 ? `${days}j ${hms}` : hms;
}

/** Durée lisible courte : « 2 h 05 min », « 45 s ». */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  if (m < 60) return `${m} min ${(total % 60).toString().padStart(2, '0')} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${(m % 60).toString().padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

/** Barre de progression ASCII : [█████░░░░░] */
export function asciiBar(ratio: number, width = 10): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function padRight(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

export function padLeft(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : ' '.repeat(width - text.length) + text;
}
