import { describe, expect, it } from 'vitest';
import config from '../scripts/meshy/assets.json';
import {
  assetCost,
  buildManifest,
  createClient,
  generateAsset,
  glbUrl,
  parseEnv,
  plan,
  validateConfig,
} from '../scripts/meshy/lib.mjs';

interface FakeCall {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** Faux serveur Meshy : les tâches réussissent après deux interrogations. */
function fakeMeshy(options: { failTask?: string; status?: number } = {}) {
  const calls: FakeCall[] = [];
  const polls = new Map<string, number>();
  let counter = 0;
  const fetchImpl = async (url: string, init: { method: string; body?: string }) => {
    const body = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method: init.method, url, body });
    if (options.status) return new Response('nope', { status: options.status });
    if (init.method === 'POST') return Response.json({ result: `task-${++counter}` });
    const id = url.split('/').pop() ?? '';
    const n = (polls.get(id) ?? 0) + 1;
    polls.set(id, n);
    if (n < 2) return Response.json({ id, status: 'IN_PROGRESS', progress: 50 });
    if (id === options.failTask)
      return Response.json({ id, status: 'FAILED', task_error: { message: 'boom' } });
    return Response.json({
      id,
      status: 'SUCCEEDED',
      progress: 100,
      consumed_credits: 5,
      model_urls: { glb: `https://assets.meshy.ai/${id}.glb` },
    });
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const noSleep = async () => {};

describe('meshy pipeline', () => {
  it('parses .env files', () => {
    expect(parseEnv('# c\nMESHY_API_KEY="abc"\nEMPTY=\nBAD\nX = 1 \n')).toEqual({
      MESHY_API_KEY: 'abc',
      EMPTY: '',
      X: '1',
    });
  });

  it('validates the shipped asset config and stays within the 100 credit budget', () => {
    validateConfig(config);
    const p = plan(config, { assets: {} }, {});
    expect(p.estimate).toBeLessThanOrEqual(100);
    expect(p.withinBudget).toBe(true);
    expect(assetCost({ aiModel: 'latest', texturePrompt: 'x' })).toBe(30);
  });

  it('rejects invalid configs', () => {
    expect(() => validateConfig({})).toThrow();
    expect(() =>
      validateConfig({ assets: [{ id: 'BAD ID', prompt: 'abc', aiModel: 'latest' }] }),
    ).toThrow('invalide');
    expect(() => validateConfig({ assets: [{ id: 'a', prompt: 'abc', aiModel: 'nope' }] })).toThrow(
      'modèle',
    );
    expect(() => validateConfig({ assets: [{ id: 'a', prompt: 'x', aiModel: 'latest' }] })).toThrow(
      'prompt',
    );
    const dup = { id: 'a', prompt: 'abc', aiModel: 'latest' };
    expect(() => validateConfig({ assets: [dup, dup] })).toThrow('double');
  });

  it('accounts for already spent credits and completed assets', () => {
    const state = { assets: { station_hub: { done: true, credits: 30 } } };
    const p = plan(config, state, { budget: 40 });
    expect(p.todo.map((a: { id: string }) => a.id)).not.toContain('station_hub');
    expect(p.spent).toBe(30);
    expect(p.withinBudget).toBe(false);
    expect(plan(config, state, { only: ['debris'] }).todo).toHaveLength(1);
  });

  it('requires an API key', () => {
    expect(() => createClient({ apiKey: '' })).toThrow('MESHY_API_KEY');
  });

  it('runs preview + refine, persisting after each billable step', async () => {
    const meshy = fakeMeshy();
    const client = createClient({ apiKey: 'k', fetchImpl: meshy.fetchImpl, sleep: noSleep });
    const persisted: Array<Record<string, unknown>> = [];
    const downloads: string[] = [];
    const asset = {
      id: 'drone',
      prompt: 'small drone',
      aiModel: 'meshy-6-lite',
      targetPolycount: 3000,
      texturePrompt: 'yellow paint',
    };
    const entry = await generateAsset(
      asset,
      {},
      {
        client,
        download: async (url: string) => {
          downloads.push(url);
        },
        persist: async (e: Record<string, unknown>) => {
          persisted.push(e);
        },
      },
    );
    expect(entry).toMatchObject({
      done: true,
      file: 'drone.glb',
      previewId: 'task-1',
      refineId: 'task-2',
      credits: 10,
    });
    expect(persisted[0]).toEqual({ previewId: 'task-1' });
    expect(downloads).toEqual(['https://assets.meshy.ai/task-2.glb']);
    const posts = meshy.calls.filter((c) => c.method === 'POST');
    expect(posts[0]?.body).toMatchObject({
      mode: 'preview',
      ai_model: 'meshy-6-lite',
      target_polycount: 3000,
    });
    expect(posts[1]?.body).toMatchObject({
      mode: 'refine',
      preview_task_id: 'task-1',
      texture_prompt: 'yellow paint',
    });
  });

  it('resumes an interrupted task without paying twice', async () => {
    const meshy = fakeMeshy();
    const client = createClient({ apiKey: 'k', fetchImpl: meshy.fetchImpl, sleep: noSleep });
    const asset = { id: 'debris', prompt: 'hull chunk', aiModel: 'meshy-6-lite' };
    await generateAsset(
      asset,
      { previewId: 'old-task' },
      { client, download: async () => {}, persist: async () => {} },
    );
    expect(meshy.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('surfaces failures and HTTP errors', async () => {
    const failing = fakeMeshy({ failTask: 'task-1' });
    const client = createClient({ apiKey: 'k', fetchImpl: failing.fetchImpl, sleep: noSleep });
    const asset = { id: 'debris', prompt: 'hull chunk', aiModel: 'meshy-6-lite' };
    await expect(
      generateAsset(asset, {}, { client, download: async () => {}, persist: async () => {} }),
    ).rejects.toThrow('boom');
    const broke = createClient({
      apiKey: 'k',
      fetchImpl: fakeMeshy({ status: 402 }).fetchImpl,
      sleep: noSleep,
    });
    await expect(broke.createPreview(asset)).rejects.toThrow('crédits insuffisants');
  });

  it('builds the runtime manifest and validates URLs', () => {
    expect(
      buildManifest({ assets: { a: { done: true, file: 'a.glb' }, b: { previewId: 'x' } } }),
    ).toEqual({ models: { a: { file: 'a.glb' } } });
    expect(() => glbUrl({ model_urls: { glb: 'http://insecure' } })).toThrow();
  });
});
