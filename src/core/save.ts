/**
 * Persistance : sérialisation, validation stricte (zod) des données externes
 * (localStorage, import manuel) et calcul de la progression hors-ligne.
 */

import { z } from 'zod';
import { MAX_CODE_LENGTH } from './asm/parser';
import { DEBUG_BOOST_MULT, SAVE_VERSION } from './constants';
import { MODULE_IDS } from './data/modules';
import { computeModifiers, moduleRates, productionRates, type Modifiers } from './modifiers';
import { add, EMPTY_RESOURCES, scale } from './resources';
import { EMPTY_MODULE, EMPTY_STATS, createInitialState } from './state';
import type { GameState, ModuleId, Resources } from './types';

const EXPORT_PREFIX = 'KHARON1:';
const MAX_EXPORT_LENGTH = 2_000_000;

/** Borne haute : au-delà, les valeurs risquent de déborder vers Infinity (non sérialisable). */
const MAX_VALUE = 1e300;
const MAX_RECORD_KEYS = 64;
const nonNeg = z.number().min(0).max(MAX_VALUE);
const id = z.string().min(1).max(64);
const idList = z.array(id).max(1000);

/** Dictionnaire indexé par identifiant, au nombre de clés borné (contre les sauvegardes forgées). */
function boundedRecord<T extends z.ZodType>(value: T) {
  return z
    .record(id, value)
    .refine((r) => Object.keys(r).length <= MAX_RECORD_KEYS, "trop d'entrées");
}

const resourcesSchema = z.object({ energy: nonNeg, alloy: nonNeg, data: nonNeg, cores: nonNeg });

const moduleIdSchema = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);

const incidentSchema = z.object({
  ticket: z.number().int(),
  module: moduleIdSchema,
  puzzleId: id,
  severity: z.number().min(0).max(1),
  startedAt: z.number(),
  testSeed: z.number().int(),
  summary: z.string().max(200),
  autoTried: z.boolean().default(false),
});

const moduleStateSchema = z.object({
  count: z.number().int().min(0).max(1_000_000),
  incident: incidentSchema.nullable().default(null),
  boostUntil: z.number().default(0),
});

const modulesSchema = z.object(
  Object.fromEntries(MODULE_IDS.map((m) => [m, moduleStateSchema.default(EMPTY_MODULE)])) as Record<
    ModuleId,
    z.ZodDefault<typeof moduleStateSchema>
  >,
);

const statsSchema = z.object(
  Object.fromEntries(
    Object.keys(EMPTY_STATS).map((k) => [k, z.number().int().min(0).default(0)]),
  ) as Record<keyof typeof EMPTY_STATS, z.ZodDefault<z.ZodNumber>>,
);

const solutionSchema = z.object({
  code: z.string().max(MAX_CODE_LENGTH),
  cycles: z.number().int().min(0),
  size: z.number().int().min(0),
  solvedAt: z.number(),
});

export const saveSchema = z.object({
  version: z.number().int().min(1).max(SAVE_VERSION),
  time: nonNeg,
  createdAt: nonNeg,
  lastSavedAt: nonNeg,
  resources: resourcesSchema,
  lifetime: resourcesSchema,
  run: resourcesSchema,
  stats: statsSchema.default(EMPTY_STATS),
  modules: modulesSchema,
  upgrades: idList.default([]),
  perks: boundedRecord(z.number().int().min(0).max(100)).default({}),
  solutions: boundedRecord(solutionSchema).default({}),
  drafts: boundedRecord(z.string().max(MAX_CODE_LENGTH)).default({}),
  logsUnlocked: idList.default([]),
  logsDecrypted: idList.default([]),
  logsRead: idList.default([]),
  achievements: idList.default([]),
  discovered: idList.default(['capacitor']),
  flags: idList.default([]),
  buffs: z
    .array(
      z.object({
        id,
        label: z.string().max(80),
        mult: z.number().min(0).max(1000),
        until: z.number(),
      }),
    )
    .max(20)
    .default([]),
  anomaly: z
    .object({
      id: z.number().int(),
      spawnedAt: z.number(),
      expiresAt: z.number(),
      seed: z.number().int(),
    })
    .nullable()
    .default(null),
  nextAnomalyAt: z.number().default(100),
  nextIncidentAt: z.number().default(75),
  nextTicket: z.number().int().default(4471),
  rng: z.number().int(),
});

export type LoadResult =
  { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly error: string };

export function serialize(state: GameState, now: number): string {
  return JSON.stringify({ ...state, lastSavedAt: now });
}

export function deserialize(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Sauvegarde illisible (JSON invalide).' };
  }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Sauvegarde invalide : ${issue?.path.join('.') || 'racine'} — ${issue?.message ?? 'inconnu'}`,
    };
  }
  const state: GameState = parsed.data;
  return { ok: true, state };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportSave(state: GameState, now: number): string {
  return EXPORT_PREFIX + toBase64(serialize(state, now));
}

export function importSave(text: string): LoadResult {
  const trimmed = text.trim();
  if (trimmed.length > MAX_EXPORT_LENGTH)
    return { ok: false, error: 'Code de sauvegarde trop long.' };
  if (!trimmed.startsWith(EXPORT_PREFIX))
    return { ok: false, error: 'Code de sauvegarde non reconnu.' };
  try {
    return deserialize(fromBase64(trimmed.slice(EXPORT_PREFIX.length)));
  } catch {
    return { ok: false, error: 'Code de sauvegarde corrompu.' };
  }
}

export interface OfflineReport {
  readonly elapsed: number;
  readonly simulated: number;
  readonly rate: number;
  readonly gains: Resources;
}

/**
 * État de référence pour la production hors-ligne : sans bonus temporaires. Les incidents
 * ouverts continuent de coûter, sauf si l'essaim réparateur est installé (il les répare).
 */
function offlineBaseline(state: GameState, mods: Modifiers): GameState {
  const repair = mods.autoRepair !== null;
  const modules = Object.fromEntries(
    MODULE_IDS.map((m) => {
      const ms = state.modules[m];
      return [m, { ...ms, boostUntil: 0, incident: repair ? null : ms.incident }];
    }),
  ) as GameState['modules'];
  return { ...state, buffs: [], modules };
}

/** Gains dus aux bonus temporaires, limités à leur durée restante. */
function temporaryGains(
  state: GameState,
  baseline: GameState,
  mods: Modifiers,
  seconds: number,
): Resources {
  const base = productionRates(baseline, mods);
  const fromBuffs = state.buffs.reduce<Resources>((acc, b) => {
    const span = Math.min(seconds, Math.max(0, b.until - state.time));
    return add(acc, scale(base, (b.mult - 1) * span));
  }, EMPTY_RESOURCES);
  return MODULE_IDS.reduce<Resources>((acc, m) => {
    const span = Math.min(seconds, Math.max(0, state.modules[m].boostUntil - state.time));
    if (span <= 0) return acc;
    return add(acc, scale(moduleRates(baseline, mods, m), (DEBUG_BOOST_MULT - 1) * span));
  }, fromBuffs);
}

/** Applique la production accumulée pendant l'absence (sans nouveaux incidents ni anomalies). */
export function applyOffline(
  state: GameState,
  now: number,
): { state: GameState; report: OfflineReport | null } {
  const elapsed = (now - state.lastSavedAt) / 1000;
  if (!Number.isFinite(elapsed) || elapsed < 10) return { state, report: null };
  const mods = computeModifiers(state);
  const simulated = Math.min(elapsed, mods.offlineHours * 3600);
  const baseline = offlineBaseline(state, mods);
  const raw = add(
    temporaryGains(state, baseline, mods, simulated),
    scale(productionRates(baseline, mods), simulated),
  );
  const gains: Resources = { ...(scale(raw, mods.offlineRate) as Resources), cores: 0 };
  const time = state.time + simulated;
  const repaired = MODULE_IDS.filter(
    (m) => state.modules[m].incident && !baseline.modules[m].incident,
  );
  const modules = Object.fromEntries(
    MODULE_IDS.map((m) => [m, { ...state.modules[m], incident: baseline.modules[m].incident }]),
  ) as GameState['modules'];
  const next: GameState = {
    ...state,
    time,
    lastSavedAt: now,
    modules,
    stats: { ...state.stats, incidentsResolved: state.stats.incidentsResolved + repaired.length },
    resources: add(state.resources, gains),
    lifetime: add(state.lifetime, gains),
    run: add(state.run, gains),
    buffs: state.buffs.filter((b) => b.until > time),
    anomaly: null,
    nextIncidentAt: Math.max(state.nextIncidentAt, time + 30),
    nextAnomalyAt: Math.max(state.nextAnomalyAt, time + 30),
  };
  return { state: next, report: { elapsed, simulated, rate: mods.offlineRate, gains } };
}

export function freshState(now: number): GameState {
  return createInitialState(now, Math.floor(Math.random() * 2 ** 31));
}
