/**
 * Générateur pseudo-aléatoire déterministe (mulberry32) en style fonctionnel :
 * chaque tirage renvoie la valeur et le nouvel état, sans effet de bord.
 */

export interface Roll {
  readonly value: number;
  readonly seed: number;
}

export function nextRandom(seed: number): Roll {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: s };
}

/** Entier uniforme dans [min, max] (bornes incluses). */
export function nextInt(seed: number, min: number, max: number): Roll {
  const r = nextRandom(seed);
  return { value: min + Math.floor(r.value * (max - min + 1)), seed: r.seed };
}

/** Tirage exponentiel de moyenne `mean` (intervalle entre événements poissonniens). */
export function nextExponential(seed: number, mean: number): Roll {
  const r = nextRandom(seed);
  return { value: -Math.log(1 - r.value) * mean, seed: r.seed };
}

/** Choix pondéré : renvoie l'index choisi. */
export function nextWeighted(seed: number, weights: readonly number[]): Roll {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  const r = nextRandom(seed);
  if (total <= 0) return { value: -1, seed: r.seed };
  let pick = r.value * total;
  for (let i = 0; i < weights.length; i++) {
    pick -= Math.max(0, weights[i] ?? 0);
    if (pick < 0) return { value: i, seed: r.seed };
  }
  return { value: weights.length - 1, seed: r.seed };
}

/** Itérateur de commodité pour les générateurs de tests (usage local, état encapsulé). */
export function createRandomStream(seed: number): () => number {
  let state = seed;
  return () => {
    const r = nextRandom(state);
    state = r.seed;
    return r.value;
  };
}
