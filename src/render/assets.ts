/**
 * Chargement des modèles 3D générés par Meshy AI (optionnels).
 * `models/manifest.json` liste les fichiers disponibles ; en son absence,
 * la station utilise uniquement sa géométrie procédurale.
 */

import { type BufferGeometry, Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { z } from 'zod';

const manifestSchema = z.object({
  models: z.record(
    z.string().regex(/^[a-z0-9_]{1,40}$/),
    z.object({ file: z.string().regex(/^[a-z0-9_.-]{1,80}\.glb$/) }),
  ),
});

const MODEL_BASE = `${import.meta.env.BASE_URL}models/`;

async function fetchManifest(): Promise<z.infer<typeof manifestSchema> | null> {
  try {
    const res = await fetch(`${MODEL_BASE}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const parsed = manifestSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn('[assets] manifest des modèles invalide, ignoré.');
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    console.warn(
      '[assets] manifest indisponible :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function loadModels(): Promise<Map<string, Object3D>> {
  const manifest = await fetchManifest();
  const models = new Map<string, Object3D>();
  if (!manifest) return models;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const entries = Object.entries(manifest.models);
  const results = await Promise.allSettled(
    entries.map(([, def]) => loader.loadAsync(`${MODEL_BASE}${def.file}`)),
  );
  results.forEach((res, i) => {
    const name = entries[i]?.[0];
    if (!name) return;
    if (res.status === 'fulfilled') models.set(name, res.value.scene);
    else console.warn(`[assets] échec du chargement de ${name} :`, res.reason);
  });
  return models;
}

/** Fusionne tous les maillages d'un modèle en une géométrie unique (pour l'instanciation). */
export function mergedGeometry(model: Object3D): BufferGeometry | null {
  const geos: BufferGeometry[] = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o instanceof Mesh) {
      const g = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      ['uv1', 'uv2', 'color', 'tangent', 'skinIndex', 'skinWeight'].forEach((attr) =>
        g.deleteAttribute(attr),
      );
      geos.push(g.index ? g.toNonIndexed() : g);
    }
  });
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  if (box) {
    const size = Math.max(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z,
      1e-6,
    );
    merged.translate(
      -(box.min.x + box.max.x) / 2,
      -(box.min.y + box.max.y) / 2,
      -(box.min.z + box.max.z) / 2,
    );
    merged.scale(2 / size, 2 / size, 2 / size);
  }
  return merged;
}
