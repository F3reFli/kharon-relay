import type { ModuleDef, ModuleId } from '../types';

/**
 * Sous-systèmes de la station. Chaque palier coûte ~8× le précédent et produit ~7× plus.
 * Les modules avancés exigent de l'alliage et des données pour forcer la diversification.
 */
export const MODULES: readonly ModuleDef[] = [
  {
    id: 'capacitor',
    name: 'Banc de condensateurs',
    code: 'CAPA',
    description: 'Stocke et relâche les impulsions du cœur. Production lente mais fiable.',
    flavor: 'Diélectrique fissuré. Fonctionne quand même, la plupart du temps.',
    produces: { energy: 0.4 },
    baseCost: { energy: 15 },
    growth: 1.15,
    unlock: { kind: 'always' },
    risk: 1,
    puzzleId: 'echo-bus',
    tier: 1,
  },
  {
    id: 'solar',
    name: 'Panneaux solaires',
    code: 'SOLR',
    description: "Ailes photovoltaïques orientées vers l'étoile lointaine.",
    flavor: '37 % des cellules sont criblées de micrométéorites.',
    produces: { energy: 3 },
    baseCost: { energy: 110 },
    growth: 1.15,
    unlock: { kind: 'lifetime', resource: 'energy', amount: 60 },
    risk: 1.1,
    puzzleId: 'solar-filter',
    tier: 2,
  },
  {
    id: 'drone',
    name: 'Baie de drones',
    code: 'DRON',
    description: "Des drones de récupération découpent les épaves et rapportent de l'alliage.",
    flavor: 'Ils reviennent toujours. Presque toujours.',
    produces: { alloy: 0.5 },
    baseCost: { energy: 450 },
    growth: 1.16,
    unlock: { kind: 'owned', module: 'solar', count: 1 },
    risk: 1.2,
    puzzleId: 'drone-pairs',
    tier: 3,
  },
  {
    id: 'datacore',
    name: 'Noyau de données',
    code: 'DATA',
    description: 'Baies de serveurs ranimées. Extraient des données des archives corrompues.',
    flavor: 'Les ventilateurs chantent une berceuse en 3/4.',
    produces: { data: 0.25 },
    baseCost: { energy: 2500, alloy: 60 },
    growth: 1.17,
    unlock: { kind: 'owned', module: 'drone', count: 1 },
    risk: 1.2,
    puzzleId: 'checksum',
    tier: 4,
  },
  {
    id: 'fusion',
    name: 'Cellule à fusion',
    code: 'FUSN',
    description: 'Tokamak compact. Énorme rendement, confinement capricieux.',
    flavor: "Le plasma a la couleur d'un souvenir.",
    produces: { energy: 60 },
    baseCost: { energy: 9000, alloy: 250 },
    growth: 1.15,
    unlock: { kind: 'owned', module: 'datacore', count: 1 },
    risk: 1.5,
    puzzleId: 'coolant',
    tier: 5,
  },
  {
    id: 'relay',
    name: 'Antenne relais',
    code: 'RLAY',
    description: "La raison d'être de Kharon. Capte et décode les transmissions profondes.",
    flavor: 'Elle reçoit quelque chose. Elle a toujours reçu quelque chose.',
    produces: { data: 2, energy: 120 },
    baseCost: { energy: 40_000, alloy: 4000, data: 600 },
    growth: 1.16,
    unlock: { kind: 'owned', module: 'fusion', count: 1 },
    risk: 1.3,
    puzzleId: 'peak',
    tier: 6,
  },
  {
    id: 'foundry',
    name: 'Fonderie orbitale',
    code: 'FNDR',
    description: "Refond les épaves en lingots d'alliage de qualité structurelle.",
    flavor: "Les fours n'avaient pas été éteints. Juste oubliés.",
    produces: { alloy: 40 },
    baseCost: { energy: 150_000, alloy: 30_000, data: 3000 },
    growth: 1.16,
    unlock: { kind: 'owned', module: 'relay', count: 1 },
    risk: 1.4,
    puzzleId: 'countdown',
    tier: 7,
  },
  {
    id: 'siphon',
    name: 'Siphon gravitationnel',
    code: 'SIPH',
    description: "Un faisceau ancré dans le puits de Nérée. Pompe l'énergie des marées.",
    flavor: 'La géante tire. Le siphon tire plus fort.',
    produces: { energy: 2500 },
    baseCost: { energy: 2_000_000, alloy: 120_000, data: 60_000 },
    growth: 1.15,
    unlock: { kind: 'owned', module: 'foundry', count: 1 },
    risk: 1.6,
    puzzleId: 'sort3',
    tier: 8,
  },
  {
    id: 'lattice',
    name: 'Treillis quantique',
    code: 'QLAT',
    description: "Mémoire intriquée. Calcule des choses que personne n'a demandées.",
    flavor: "Il répond aux questions avant qu'on les pose.",
    produces: { data: 150 },
    baseCost: { energy: 30_000_000, alloy: 1_000_000, data: 1_000_000 },
    growth: 1.17,
    unlock: { kind: 'owned', module: 'siphon', count: 1 },
    risk: 1.5,
    puzzleId: 'fibonacci',
    tier: 9,
  },
  {
    id: 'antimatter',
    name: "Confinement d'antimatière",
    code: 'ANTI',
    description: "Bouteille magnétique contenant 4 grammes d'antihydrogène. Ne pas secouer.",
    flavor: 'Le voyant vert est le plus important de la station.',
    produces: { energy: 150_000, alloy: 2000 },
    baseCost: { energy: 300_000_000, alloy: 6_000_000, data: 5_000_000 },
    growth: 1.15,
    unlock: { kind: 'owned', module: 'lattice', count: 1 },
    risk: 2,
    puzzleId: 'absdiff',
    tier: 10,
  },
];

export const MODULE_IDS: readonly ModuleId[] = MODULES.map((m) => m.id);

const MODULE_INDEX: ReadonlyMap<string, ModuleDef> = new Map(MODULES.map((m) => [m.id, m]));

export function getModule(id: string): ModuleDef | undefined {
  return MODULE_INDEX.get(id);
}

export function isModuleId(id: string): id is ModuleId {
  return MODULE_INDEX.has(id);
}

/** Résout un identifiant de module depuis un id, un code ou un préfixe (pour le terminal). */
export function resolveModule(query: string): ModuleDef | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    MODULE_INDEX.get(q) ??
    MODULES.find((m) => m.code.toLowerCase() === q) ??
    MODULES.find((m) => m.id.startsWith(q))
  );
}
