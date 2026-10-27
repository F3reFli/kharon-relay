/**
 * Pipeline de génération de modèles 3D via l'API Meshy (text-to-3d).
 * Toutes les dépendances externes (fetch, système de fichiers, horloge) sont injectées
 * pour pouvoir tester la logique sans consommer de crédits.
 */

export const API_BASE = 'https://api.meshy.ai';

/** Coûts en crédits (https://docs.meshy.ai/en/api/pricing). */
export const PREVIEW_COST = {
  latest: 20,
  'meshy-7.1': 20,
  'meshy-6': 20,
  'meshy-6-lite': 5,
  'meshy-t2': 5,
  'meshy-t2.5': 5,
};
export const REFINE_COST = 10;

const ID_RE = /^[a-z0-9_]{1,40}$/;
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED']);

/** Lit un fichier .env simple (CLE=valeur), sans écraser les variables déjà définies. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function validateConfig(config) {
  if (!config || !Array.isArray(config.assets))
    throw new Error('assets.json : tableau "assets" manquant');
  const ids = new Set();
  for (const a of config.assets) {
    if (!ID_RE.test(a.id ?? '')) throw new Error(`id d'asset invalide : ${a.id}`);
    if (ids.has(a.id)) throw new Error(`id d'asset en double : ${a.id}`);
    ids.add(a.id);
    if (typeof a.prompt !== 'string' || a.prompt.length < 3 || a.prompt.length > 800)
      throw new Error(`${a.id} : prompt invalide (3-800 caractères)`);
    if (!(a.aiModel in PREVIEW_COST)) throw new Error(`${a.id} : modèle inconnu ${a.aiModel}`);
    if (
      a.texturePrompt !== undefined &&
      (typeof a.texturePrompt !== 'string' || a.texturePrompt.length > 800)
    )
      throw new Error(`${a.id} : texturePrompt invalide`);
  }
  return config;
}

export function assetCost(asset) {
  return PREVIEW_COST[asset.aiModel] + (asset.texturePrompt ? REFINE_COST : 0);
}

/**
 * Sélectionne les assets à générer et vérifie que le coût estimé reste dans le budget.
 * @param {{ budget: number, assets: Array<{ id: string, aiModel: string, texturePrompt?: string }> }} config
 * @param {{ assets?: Record<string, { done?: boolean, credits?: number }> }} state
 * @param {{ only?: string[] | null, budget?: number }} [options]
 */
export function plan(config, state, { only = null, budget } = {}) {
  const spent = Object.values(state.assets ?? {}).reduce((sum, a) => sum + (a.credits ?? 0), 0);
  const todo = config.assets.filter(
    (a) => (!only || only.includes(a.id)) && !state.assets?.[a.id]?.done,
  );
  const estimate = todo.reduce((sum, a) => sum + assetCost(a), 0);
  const limit = budget ?? config.budget;
  return { todo, estimate, spent, limit, withinBudget: spent + estimate <= limit };
}

const HTTP_HINTS = {
  401: ' (clé invalide)',
  402: ' (crédits insuffisants ou plan gratuit)',
  429: ' (limite de débit)',
};

function makeRequest({ apiKey, fetchImpl, base }) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  return async function request(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      signal: AbortSignal.timeout(60_000),
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const hint = HTTP_HINTS[res.status] ?? '';
      throw new Error(`Meshy ${method} ${path} → HTTP ${res.status}${hint} ${text.slice(0, 200)}`);
    }
    return res.json();
  };
}

function makeWaitFor(request, { sleep, log }) {
  return async function waitFor(taskId, { intervalMs = 5000, timeoutMs = 20 * 60 * 1000 } = {}) {
    const started = Date.now();
    for (;;) {
      const task = await request('GET', `/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`);
      log(`  ${taskId} : ${task.status} ${task.progress ?? 0}%`);
      if (TERMINAL.has(task.status)) {
        if (task.status === 'SUCCEEDED') return task;
        throw new Error(
          `tâche ${taskId} ${task.status} : ${task.task_error?.message ?? 'sans détail'}`,
        );
      }
      if (Date.now() - started > timeoutMs) throw new Error(`tâche ${taskId} : délai dépassé`);
      await sleep(intervalMs);
    }
  };
}

export function createClient({
  apiKey,
  fetchImpl = fetch,
  base = API_BASE,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
}) {
  if (!apiKey) throw new Error('MESHY_API_KEY manquante (voir .env.example)');
  const request = makeRequest({ apiKey, fetchImpl, base });
  const create = (body) => request('POST', '/openapi/v2/text-to-3d', body).then((r) => r.result);
  return {
    createPreview: (asset) =>
      create({
        mode: 'preview',
        prompt: asset.prompt,
        ai_model: asset.aiModel,
        should_remesh: true,
        topology: 'triangle',
        target_polycount: asset.targetPolycount ?? 5000,
        target_formats: ['glb'],
      }),
    createRefine: (previewId, asset) =>
      create({
        mode: 'refine',
        preview_task_id: previewId,
        texture_prompt: asset.texturePrompt,
        enable_pbr: false,
        target_formats: ['glb'],
      }),
    waitFor: makeWaitFor(request, { sleep, log }),
  };
}

/** Vérifie l'en-tête binaire d'un GLB : magie « glTF », version 2, longueur déclarée exacte. */
export function isGlb(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (buffer.subarray(0, 4).toString('ascii') !== 'glTF') return false;
  return buffer.readUInt32LE(4) === 2 && buffer.readUInt32LE(8) === buffer.length;
}

export function glbUrl(task) {
  const url = task?.model_urls?.glb;
  if (typeof url !== 'string' || !url.startsWith('https://'))
    throw new Error('URL GLB absente ou non sécurisée dans la réponse Meshy');
  return url;
}

/**
 * Génère un asset de bout en bout. `persist` est appelé après chaque étape facturée
 * pour qu'une interruption ne provoque jamais une seconde facturation.
 */
export async function generateAsset(asset, entry, { client, download, persist, log = () => {} }) {
  let current = { ...entry };
  if (!current.previewId) {
    current = { ...current, previewId: await client.createPreview(asset) };
    await persist(current);
    log(`${asset.id} : aperçu lancé (${current.previewId})`);
  }
  const preview = await client.waitFor(current.previewId);
  current = { ...current, credits: preview.consumed_credits ?? PREVIEW_COST[asset.aiModel] };
  await persist(current);
  let final = preview;
  if (asset.texturePrompt) {
    if (!current.refineId) {
      current = { ...current, refineId: await client.createRefine(current.previewId, asset) };
      await persist(current);
      log(`${asset.id} : texturage lancé (${current.refineId})`);
    }
    final = await client.waitFor(current.refineId);
    current = { ...current, credits: current.credits + (final.consumed_credits ?? REFINE_COST) };
  }
  await download(glbUrl(final), asset.id);
  current = { ...current, done: true, file: `${asset.id}.glb` };
  await persist(current);
  return current;
}

export function buildManifest(state) {
  const models = Object.fromEntries(
    Object.entries(state.assets ?? {})
      .filter(([, a]) => a.done && a.file)
      .map(([id, a]) => [id, { file: a.file }]),
  );
  return { models };
}
