#!/usr/bin/env node
/**
 * Génère les modèles 3D de la station avec Meshy AI, les optimise (gltf-transform)
 * et met à jour public/models/manifest.json.
 *
 *   npm run assets:meshy:plan          # estimation, aucun appel réseau
 *   npm run assets:meshy               # génération (lit MESHY_API_KEY depuis l'env ou .env)
 *   npm run assets:meshy -- --only=drone,debris
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  assetCost,
  buildManifest,
  createClient,
  generateAsset,
  isGlb,
  parseEnv,
  plan,
  validateConfig,
} from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = join(ROOT, 'scripts/meshy/assets.json');
const STATE = join(ROOT, 'scripts/meshy/state.json');
const CACHE = join(ROOT, 'scripts/meshy/.cache');
const OUT = join(ROOT, 'public/models');
const MAX_DOWNLOAD = 60 * 1024 * 1024;

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => flag(name)?.split('=')[1];

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Seules ces variables sont lues depuis .env (jamais PATH, NODE_OPTIONS…). */
const ENV_ALLOWLIST = new Set(['MESHY_API_KEY', 'MESHY_BUDGET']);
const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1';
const DOWNLOAD_TIMEOUT_MS = 120_000;

async function loadEnvFile() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  const parsed = parseEnv(await readFile(path, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (ENV_ALLOWLIST.has(k) && process.env[k] === undefined) process.env[k] = v;
  }
}

/** Environnement des sous-processus, purgé de la clé API. */
function childEnv() {
  const env = { ...process.env };
  delete env.MESHY_API_KEY;
  return env;
}

/** Lit le corps de la réponse en flux, en s'arrêtant au-delà de la taille maximale. */
async function readCapped(res, id) {
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_DOWNLOAD) throw new Error(`téléchargement ${id} : fichier trop volumineux`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function download(url, id) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`téléchargement ${id} : HTTP ${res.status}`);
  if (!res.url.startsWith('https://'))
    throw new Error(`téléchargement ${id} : redirection non sécurisée`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_DOWNLOAD)
    throw new Error(`téléchargement ${id} : fichier trop volumineux (${size} o)`);
  const buffer = await readCapped(res, id);
  if (!isGlb(buffer))
    throw new Error(`téléchargement ${id} : ce n'est pas un fichier GLB 2.0 valide`);
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const raw = join(CACHE, `${id}.raw.glb`);
  await writeFile(raw, buffer);
  const target = join(OUT, `${id}.glb`);
  try {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const cli = [
      '--yes',
      GLTF_TRANSFORM,
      'optimize',
      raw,
      target,
      '--compress',
      'meshopt',
      '--texture-compress',
      'webp',
      '--texture-size',
      '1024',
    ];
    await promisify(execFile)(npx, cli, {
      timeout: 300_000,
      env: childEnv(),
    });
    console.log(`  ${id} : optimisé → public/models/${id}.glb`);
  } catch (error) {
    console.warn(
      `  ${id} : optimisation impossible (${error.message.split('\n')[0]}), copie brute non optimisée.`,
    );
    await copyFile(raw, target);
  }
}

async function main() {
  const config = validateConfig(await loadJson(CONFIG, null));
  let state = await loadJson(STATE, { assets: {} });
  const only = value('only')?.split(',').filter(Boolean) ?? null;
  const budgetArg = value('budget');
  await loadEnvFile();
  const budget = Number(budgetArg ?? process.env.MESHY_BUDGET ?? config.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw new Error('budget invalide');

  const p = plan(config, state, { only, budget });
  console.log(
    `Meshy — ${p.todo.length} asset(s) à générer, estimation ${p.estimate} crédits (déjà dépensés : ${p.spent}, plafond : ${p.limit}).`,
  );
  for (const a of p.todo)
    console.log(
      `  · ${a.id.padEnd(16)} ${a.aiModel.padEnd(13)} ${assetCost(a)} cr${a.texturePrompt ? ' (texturé)' : ''}`,
    );
  if (flag('dry-run')) return;
  if (!p.withinBudget)
    throw new Error(
      `estimation hors budget (${p.spent + p.estimate} > ${p.limit}). Utilisez --only=… ou --budget=…`,
    );
  if (p.todo.length === 0) console.log('Rien à faire.');

  const client = createClient({ apiKey: process.env.MESHY_API_KEY, log: (m) => console.log(m) });
  const persist = async (id, entry) => {
    state = { ...state, assets: { ...state.assets, [id]: entry } };
    await writeFile(STATE, `${JSON.stringify(state, null, 2)}\n`);
  };
  for (const asset of p.todo) {
    try {
      const entry = await generateAsset(asset, state.assets[asset.id] ?? {}, {
        client,
        download,
        persist: (e) => persist(asset.id, e),
        log: (m) => console.log(m),
      });
      console.log(`✓ ${asset.id} terminé (${entry.credits} crédits).`);
    } catch (error) {
      console.error(`✗ ${asset.id} : ${error.message}`);
    }
  }
  await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(buildManifest(state), null, 2)}\n`);
  const total = Object.values(state.assets).reduce((s, a) => s + (a.credits ?? 0), 0);
  console.log(`Manifest mis à jour. Crédits consommés au total : ${total}.`);
}

main().catch((error) => {
  console.error(`Erreur : ${error.message}`);
  process.exitCode = 1;
});
