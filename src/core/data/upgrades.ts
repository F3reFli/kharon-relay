import type { Cost, ModuleId, PerkDef, UpgradeDef } from '../types';
import { MODULES } from './modules';

/** Paliers d'amélioration par module : seuil de possession, multiplicateur de coût, effet. */
const MODULE_TIERS = [
  { owned: 10, costMult: 25, value: 2 },
  { owned: 25, costMult: 250, value: 2 },
  { owned: 50, costMult: 5000, value: 2 },
  { owned: 100, costMult: 250_000, value: 3 },
] as const;

const MODULE_UPGRADE_NAMES: Readonly<Record<ModuleId, readonly [string, string, string, string]>> =
  {
    capacitor: [
      'Diélectrique graphène',
      'Supraconducteurs froids',
      'Condensateurs fractals',
      'Banc à charge infinie',
    ],
    solar: [
      'Nettoyage des cellules',
      'Suivi stellaire',
      'Cellules pérovskites',
      'Miroirs concentrateurs',
    ],
    drone: ['Lames thermiques', 'Essaim coordonné', 'Tractage magnétique', 'IA de récupération'],
    datacore: [
      'Défragmentation',
      'Refroidissement liquide',
      'Compression neuronale',
      'Archives holographiques',
    ],
    fusion: [
      'Aimants recalibrés',
      'Injection de deutérium',
      'Confinement stellarator',
      'Allumage inertiel',
    ],
    relay: [
      'Alignement de phase',
      'Amplis paramétriques',
      'Réseau interférométrique',
      'Écoute profonde',
    ],
    foundry: ['Creusets en tungstène', 'Coulée continue', 'Forge à arc', 'Transmutation douce'],
    siphon: ['Ancre de marée', 'Lentille gravitationnelle', 'Résonance orbitale', 'Puits inversé'],
    lattice: [
      "Correction d'erreurs",
      'Qubits topologiques',
      'Intrication longue portée',
      'Calcul rétrocausal',
    ],
    antimatter: [
      'Pièges de Penning',
      'Bouteille toroïdale',
      'Annihilation contrôlée',
      'Réaction en cascade',
    ],
  };

function scaleCost(cost: Cost, mult: number): Cost {
  return Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.ceil((v ?? 0) * mult)]));
}

function moduleUpgrades(): UpgradeDef[] {
  return MODULES.flatMap((mod) =>
    MODULE_TIERS.map((tier, i) => {
      const base = scaleCost(mod.baseCost, tier.costMult);
      const dataExtra = i >= 2 ? Math.ceil(((mod.baseCost.energy ?? 0) * tier.costMult) / 4000) : 0;
      const cost: Cost = dataExtra > 0 ? { ...base, data: (base.data ?? 0) + dataExtra } : base;
      return {
        id: `${mod.id}-t${i + 1}`,
        name: MODULE_UPGRADE_NAMES[mod.id][i] ?? `${mod.name} T${i + 1}`,
        description: `${mod.name} : production ×${tier.value}.`,
        cost,
        unlock: { kind: 'owned', module: mod.id, count: tier.owned },
        effects: [{ kind: 'moduleMult', module: mod.id, value: tier.value }],
        category: 'module',
      } satisfies UpgradeDef;
    }),
  );
}

const SPECIAL_UPGRADES: readonly UpgradeDef[] = [
  // — Impulsion manuelle —
  {
    id: 'click-1',
    name: 'Gants haptiques',
    description: 'Impulsion manuelle ×2.',
    cost: { energy: 80 },
    unlock: { kind: 'clicks', count: 15 },
    effects: [{ kind: 'clickMult', value: 2 }],
    category: 'click',
  },
  {
    id: 'click-2',
    name: 'Bobine de résonance',
    description: 'Impulsion manuelle ×2.',
    cost: { energy: 1200 },
    unlock: { kind: 'clicks', count: 120 },
    effects: [{ kind: 'clickMult', value: 2 }],
    category: 'click',
  },
  {
    id: 'click-crit',
    name: 'Surtension contrôlée',
    description: "+5 % de chances d'impulsion critique (×8).",
    cost: { energy: 9000, alloy: 120 },
    unlock: { kind: 'clicks', count: 300 },
    effects: [{ kind: 'critChance', value: 0.05 }],
    category: 'click',
  },
  {
    id: 'click-3',
    name: 'Couplage neural',
    description: "Chaque impulsion ajoute 3 % de l'énergie produite par seconde.",
    cost: { energy: 25_000, data: 60 },
    unlock: {
      kind: 'all',
      conditions: [
        { kind: 'clicks', count: 500 },
        { kind: 'owned', module: 'datacore', count: 1 },
      ],
    },
    effects: [{ kind: 'clickFromRate', value: 0.03 }],
    category: 'click',
  },
  {
    id: 'click-4',
    name: 'Arc de plasma',
    description: 'Impulsion manuelle ×3.',
    cost: { energy: 600_000, alloy: 8000 },
    unlock: { kind: 'clicks', count: 1500 },
    effects: [{ kind: 'clickMult', value: 3 }],
    category: 'click',
  },
  {
    id: 'click-5',
    name: 'Synapse du Gardien',
    description: "Chaque impulsion ajoute 6 % de l'énergie produite par seconde.",
    cost: { energy: 40_000_000, data: 8000 },
    unlock: { kind: 'clicks', count: 4000 },
    effects: [{ kind: 'clickFromRate', value: 0.06 }],
    category: 'click',
  },
  // — Stabilité —
  {
    id: 'stab-1',
    name: 'Diagnostics prédictifs',
    description: 'Les incidents surviennent 25 % moins souvent.',
    cost: { energy: 6000, alloy: 150 },
    unlock: { kind: 'solved', count: 1 },
    effects: [{ kind: 'stability', value: 1.25 }],
    category: 'stability',
  },
  {
    id: 'stab-2',
    name: 'Blindage redondant',
    description: 'Les incidents surviennent 50 % moins souvent.',
    cost: { energy: 750_000, alloy: 12_000 },
    unlock: { kind: 'owned', module: 'foundry', count: 1 },
    effects: [{ kind: 'stability', value: 1.5 }],
    category: 'stability',
  },
  {
    id: 'stab-3',
    name: 'Isolation galvanique',
    description: 'Les incidents surviennent 50 % moins souvent.',
    cost: { energy: 90_000_000, alloy: 600_000, data: 30_000 },
    unlock: { kind: 'owned', module: 'lattice', count: 1 },
    effects: [{ kind: 'stability', value: 1.5 }],
    category: 'stability',
  },
  {
    id: 'cold-weld',
    name: 'Soudure à froid',
    description: 'Les réparations rapides coûtent 50 % de moins.',
    cost: { energy: 20_000, alloy: 400 },
    unlock: { kind: 'lifetime', resource: 'alloy', amount: 300 },
    effects: [{ kind: 'patchCostMult', value: 0.5 }],
    category: 'stability',
  },
  // — Automatisation —
  {
    id: 'daemon',
    name: 'Démon de maintenance',
    description: 'Déploie automatiquement vos firmwares enregistrés sur les incidents connus.',
    cost: { energy: 50_000, data: 400 },
    unlock: { kind: 'solved', count: 3 },
    effects: [{ kind: 'autoDeploy' }],
    category: 'automation',
  },
  {
    id: 'swarm-1',
    name: 'Essaim réparateur',
    description: 'Les drones réparent seuls tout incident après 120 s.',
    cost: { energy: 2_000_000, alloy: 50_000 },
    unlock: { kind: 'owned', module: 'drone', count: 50 },
    effects: [{ kind: 'autoRepair', seconds: 120 }],
    category: 'automation',
  },
  {
    id: 'swarm-2',
    name: 'Essaim réparateur II',
    description: 'Les drones réparent seuls tout incident après 40 s.',
    cost: { energy: 300_000_000, alloy: 2_000_000 },
    unlock: { kind: 'upgrade', id: 'swarm-1' },
    effects: [{ kind: 'autoRepair', seconds: 40 }],
    category: 'automation',
  },
  {
    id: 'deep-sleep',
    name: 'Veille profonde',
    description: 'Production hors-ligne à 75 % et plafond porté à 12 h.',
    cost: { energy: 150_000, data: 900 },
    unlock: { kind: 'owned', module: 'relay', count: 1 },
    effects: [
      { kind: 'offlineRate', value: 0.25 },
      { kind: 'offlineHours', value: 4 },
    ],
    category: 'automation',
  },
  // — Global —
  {
    id: 'bus-opt',
    name: 'Optimisation du bus',
    description: 'Toute la production ×1,5.',
    cost: { energy: 120_000, data: 1200 },
    unlock: { kind: 'lifetime', resource: 'data', amount: 600 },
    effects: [{ kind: 'globalMult', value: 1.5 }],
    category: 'global',
  },
  {
    id: 'fractal',
    name: 'Compression fractale',
    description: 'Production de données ×2.',
    cost: { energy: 1_500_000, data: 6000 },
    unlock: { kind: 'lifetime', resource: 'data', amount: 4000 },
    effects: [{ kind: 'resourceMult', resource: 'data', value: 2 }],
    category: 'global',
  },
  {
    id: 'recycle',
    name: 'Recyclage moléculaire',
    description: "Production d'alliage ×2.",
    cost: { energy: 900_000, alloy: 20_000 },
    unlock: { kind: 'lifetime', resource: 'alloy', amount: 15_000 },
    effects: [{ kind: 'resourceMult', resource: 'alloy', value: 2 }],
    category: 'global',
  },
  {
    id: 'grid',
    name: 'Réseau maillé',
    description: "Production d'énergie ×2.",
    cost: { energy: 2_500_000, alloy: 50_000, data: 5000 },
    unlock: { kind: 'lifetime', resource: 'energy', amount: 5_000_000 },
    effects: [{ kind: 'resourceMult', resource: 'energy', value: 2 }],
    category: 'global',
  },
  {
    id: 'grid-2',
    name: 'Supraconducteurs de ligne',
    description: "Production d'énergie ×2.",
    cost: { energy: 400_000_000, alloy: 5_000_000, data: 500_000 },
    unlock: { kind: 'lifetime', resource: 'energy', amount: 1_000_000_000 },
    effects: [{ kind: 'resourceMult', resource: 'energy', value: 2 }],
    category: 'global',
  },
  {
    id: 'procurement',
    name: 'Inventaire automatisé',
    description: 'Tous les modules coûtent 10 % de moins.',
    cost: { energy: 5_000_000, data: 9000 },
    unlock: { kind: 'lifetime', resource: 'data', amount: 9000 },
    effects: [{ kind: 'costMult', value: 0.9 }],
    category: 'global',
  },
  // — Récit —
  {
    id: 'echo-decoder',
    name: "Décodeur d'Écho",
    description: 'Assemble les fragments du signal. Débloque le ticket ECHO dans /signal.',
    cost: { energy: 200_000_000, data: 50_000 },
    unlock: {
      kind: 'all',
      conditions: [
        { kind: 'owned', module: 'lattice', count: 5 },
        { kind: 'flag', flag: 'signal-seen' },
      ],
    },
    effects: [{ kind: 'flag', flag: 'echo-unlocked' }],
    category: 'story',
  },
  {
    id: 'echo-transmit',
    name: "Transmission de l'Écho",
    description: 'Renvoie le signal décodé vers Nérée. Toute la production ×3.',
    cost: { energy: 2_000_000_000, data: 400_000 },
    unlock: { kind: 'flag', flag: 'echo-decoded' },
    effects: [
      { kind: 'globalMult', value: 3 },
      { kind: 'flag', flag: 'echo-sent' },
    ],
    category: 'story',
  },
];

export const UPGRADES: readonly UpgradeDef[] = [...SPECIAL_UPGRADES, ...moduleUpgrades()];

const UPGRADE_INDEX: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADE_INDEX.get(id);
}

/** Améliorations permanentes achetées avec des fragments mémoire. */
export const PERKS: readonly PerkDef[] = [
  {
    id: 'residual',
    name: 'Mémoire résiduelle',
    description: 'Démarre chaque cycle avec 5 000 ⚡ et 200 ⬡ par niveau.',
    maxLevel: 10,
    baseCost: 1,
    costGrowth: 2,
    effects: [],
    startBonus: { energy: 5000, alloy: 200 },
  },
  {
    id: 'overclock',
    name: 'Surcadençage',
    description: 'Impulsion manuelle ×2 par niveau.',
    maxLevel: 8,
    baseCost: 1,
    costGrowth: 1.8,
    effects: [{ kind: 'clickMult', value: 2 }],
  },
  {
    id: 'harmonic',
    name: 'Écho harmonique',
    description: 'Toute la production ×1,25 par niveau.',
    maxLevel: 20,
    baseCost: 2,
    costGrowth: 1.6,
    effects: [{ kind: 'globalMult', value: 1.25 }],
  },
  {
    id: 'patience',
    name: 'Patience des machines',
    description: 'Les incidents surviennent 15 % moins souvent par niveau.',
    maxLevel: 5,
    baseCost: 3,
    costGrowth: 2,
    effects: [{ kind: 'stability', value: 1.15 }],
  },
  {
    id: 'vigil',
    name: 'Veille étendue',
    description: '+4 h de plafond hors-ligne et +5 % de rendement par niveau.',
    maxLevel: 5,
    baseCost: 2,
    costGrowth: 2,
    effects: [
      { kind: 'offlineHours', value: 4 },
      { kind: 'offlineRate', value: 0.05 },
    ],
  },
  {
    id: 'persistent-daemon',
    name: 'Démon persistant',
    description: 'Le démon de maintenance survit aux redémarrages.',
    maxLevel: 1,
    baseCost: 5,
    costGrowth: 1,
    effects: [{ kind: 'autoDeploy' }],
  },
];

const PERK_INDEX: ReadonlyMap<string, PerkDef> = new Map(PERKS.map((p) => [p.id, p]));

export function getPerk(id: string): PerkDef | undefined {
  return PERK_INDEX.get(id);
}

export function perkCost(perk: PerkDef, level: number): number {
  return Math.ceil(perk.baseCost * perk.costGrowth ** level);
}
