/**
 * Types partagés du noyau de jeu. Le noyau est pur : aucune dépendance au DOM,
 * à Three.js ni à l'horloge murale. Toutes les fonctions renvoient de nouveaux objets.
 */

export type ResourceId = 'energy' | 'alloy' | 'data' | 'cores';
export type Resources = Readonly<Record<ResourceId, number>>;
export type Cost = Readonly<Partial<Record<ResourceId, number>>>;

export type ModuleId =
  | 'capacitor'
  | 'solar'
  | 'drone'
  | 'datacore'
  | 'fusion'
  | 'relay'
  | 'foundry'
  | 'siphon'
  | 'lattice'
  | 'antimatter';

export type Condition =
  | { readonly kind: 'always' }
  | { readonly kind: 'lifetime'; readonly resource: ResourceId; readonly amount: number }
  | { readonly kind: 'owned'; readonly module: ModuleId; readonly count: number }
  | { readonly kind: 'clicks'; readonly count: number }
  | { readonly kind: 'solved'; readonly count: number }
  | { readonly kind: 'flag'; readonly flag: string }
  | { readonly kind: 'upgrade'; readonly id: string }
  | { readonly kind: 'all'; readonly conditions: readonly Condition[] };

export type Effect =
  | { readonly kind: 'clickMult'; readonly value: number }
  | { readonly kind: 'clickFromRate'; readonly value: number }
  | { readonly kind: 'moduleMult'; readonly module: ModuleId; readonly value: number }
  | { readonly kind: 'resourceMult'; readonly resource: ResourceId; readonly value: number }
  | { readonly kind: 'globalMult'; readonly value: number }
  | { readonly kind: 'stability'; readonly value: number }
  | { readonly kind: 'critChance'; readonly value: number }
  | { readonly kind: 'autoDeploy' }
  | { readonly kind: 'autoRepair'; readonly seconds: number }
  | { readonly kind: 'offlineHours'; readonly value: number }
  | { readonly kind: 'offlineRate'; readonly value: number }
  | { readonly kind: 'patchCostMult'; readonly value: number }
  | { readonly kind: 'costMult'; readonly value: number }
  | { readonly kind: 'flag'; readonly flag: string };

export interface ModuleDef {
  readonly id: ModuleId;
  readonly name: string;
  /** Code court affiché dans le terminal (4 lettres). */
  readonly code: string;
  readonly description: string;
  readonly flavor: string;
  readonly produces: Cost;
  readonly baseCost: Cost;
  readonly growth: number;
  readonly unlock: Condition;
  /** Poids relatif dans le tirage des incidents. */
  readonly risk: number;
  readonly puzzleId: string;
  readonly tier: number;
}

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: Cost;
  readonly unlock: Condition;
  readonly effects: readonly Effect[];
  readonly category: 'module' | 'click' | 'stability' | 'automation' | 'global' | 'story';
}

export interface PerkDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxLevel: number;
  readonly baseCost: number;
  readonly costGrowth: number;
  /** Effets appliqués une fois par niveau. */
  readonly effects: readonly Effect[];
  /** Ressources de départ accordées par niveau à chaque redémarrage. */
  readonly startBonus?: Cost;
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly condition:
    Condition | { readonly kind: 'stat'; readonly stat: StatId; readonly value: number };
  readonly hidden?: boolean;
}

export interface Incident {
  readonly ticket: number;
  readonly module: ModuleId;
  readonly puzzleId: string;
  /** Fraction de production perdue (0..1). */
  readonly severity: number;
  readonly startedAt: number;
  readonly testSeed: number;
  readonly summary: string;
  /** Le démon de maintenance a déjà tenté un déploiement automatique. */
  readonly autoTried: boolean;
}

export interface ModuleState {
  readonly count: number;
  readonly incident: Incident | null;
  /** Temps de jeu jusqu'auquel le module bénéficie du bonus « patch optimisé ». */
  readonly boostUntil: number;
}

export interface Solution {
  readonly code: string;
  readonly cycles: number;
  readonly size: number;
  readonly solvedAt: number;
}

export interface Anomaly {
  readonly id: number;
  readonly spawnedAt: number;
  readonly expiresAt: number;
  /** Graine utilisée par le rendu pour la trajectoire. */
  readonly seed: number;
}

/** Portée d'un bonus temporaire. */
export type BuffTarget =
  | { readonly kind: 'global' }
  | { readonly kind: 'click' }
  | { readonly kind: 'module'; readonly module: ModuleId }
  | { readonly kind: 'resource'; readonly resource: ResourceId };

export interface Buff {
  readonly id: string;
  readonly label: string;
  readonly mult: number;
  readonly until: number;
  /** Portée du bonus ; absente = toute la production (sauvegardes antérieures à la v0.2). */
  readonly target?: BuffTarget | undefined;
}

/** Montant exprimé en secondes de production actuelle, avec un plancher garanti. */
export interface ScaledAmount {
  readonly resource: Exclude<ResourceId, 'cores'>;
  readonly seconds: number;
  readonly min: number;
}

export type EventEffect =
  | {
      readonly kind: 'buff';
      readonly id: string;
      readonly label: string;
      readonly mult: number;
      readonly seconds: number;
      readonly target: BuffTarget;
    }
  | { readonly kind: 'clearBuff'; readonly id: string }
  | { readonly kind: 'grant'; readonly amount: ScaledAmount }
  | { readonly kind: 'incident'; readonly chance: number }
  | { readonly kind: 'flag'; readonly flag: string };

export interface EventChoice {
  readonly id: string;
  readonly label: string;
  /** Conséquences annoncées au joueur. */
  readonly detail: string;
  readonly cost: readonly ScaledAmount[];
  readonly requires?: Condition;
  readonly effects: readonly EventEffect[];
  /** Texte affiché une fois le choix fait. */
  readonly outcome: string;
}

/** Visuel 3D et teinte d'écran associés à un événement. */
export type EventVisual =
  'flare' | 'meteors' | 'storm' | 'convoy' | 'ghost' | 'wreck' | 'resonance' | 'blackout';

export interface StationEventDef {
  readonly id: string;
  readonly title: string;
  /** Origine de l'alerte (capteur, fréquence…). */
  readonly source: string;
  readonly text: string;
  readonly visual: EventVisual;
  /** Durée de la fenêtre de décision (ou de l'effet d'ambiance), en secondes. */
  readonly duration: number;
  readonly weight: number;
  readonly unlock: Condition;
  readonly choices: readonly EventChoice[];
  /** Effets appliqués dès l'apparition. */
  readonly onStart: readonly EventEffect[];
  /** Effets appliqués si la fenêtre expire sans réponse. */
  readonly onExpire: readonly EventEffect[];
  readonly expireText: string;
  /** Objectif d'impulsions manuelles à atteindre avant l'expiration. */
  readonly clickGoal?: {
    readonly count: number;
    readonly effects: readonly EventEffect[];
    readonly outcome: string;
  };
}

/** Événement de station en cours. */
export interface ActiveEvent {
  readonly id: string;
  readonly serial: number;
  readonly startedAt: number;
  readonly expiresAt: number;
  /** Impulsions comptées vers l'objectif. */
  readonly progress: number;
  /** Graine utilisée par le rendu. */
  readonly seed: number;
}

export type StatId =
  | 'clicks'
  | 'crits'
  | 'incidents'
  | 'incidentsResolved'
  | 'puzzlesSolved'
  | 'reboots'
  | 'anomalies'
  | 'patches'
  | 'deploys'
  | 'commands'
  | 'logsRead'
  | 'events';

export type Stats = Readonly<Record<StatId, number>>;

export interface GameState {
  readonly version: number;
  /** Temps de jeu simulé en secondes depuis la création de la sauvegarde. */
  readonly time: number;
  readonly createdAt: number;
  readonly lastSavedAt: number;
  readonly resources: Resources;
  /** Total gagné depuis toujours. */
  readonly lifetime: Resources;
  /** Total gagné depuis le dernier redémarrage. */
  readonly run: Resources;
  readonly stats: Stats;
  readonly modules: Readonly<Record<ModuleId, ModuleState>>;
  readonly upgrades: readonly string[];
  readonly perks: Readonly<Record<string, number>>;
  readonly solutions: Readonly<Record<string, Solution>>;
  readonly drafts: Readonly<Record<string, string>>;
  readonly logsUnlocked: readonly string[];
  readonly logsDecrypted: readonly string[];
  readonly logsRead: readonly string[];
  readonly achievements: readonly string[];
  readonly discovered: readonly string[];
  readonly flags: readonly string[];
  readonly buffs: readonly Buff[];
  readonly anomaly: Anomaly | null;
  readonly nextAnomalyAt: number;
  readonly nextIncidentAt: number;
  readonly event: ActiveEvent | null;
  readonly nextEventAt: number;
  readonly lastEventId: string | null;
  readonly nextTicket: number;
  readonly rng: number;
}

export type GameEvent =
  | { readonly type: 'click'; readonly amount: number; readonly crit: boolean }
  | {
      readonly type: 'purchase';
      readonly kind: 'module' | 'upgrade' | 'perk';
      readonly id: string;
      readonly qty: number;
    }
  | { readonly type: 'incident'; readonly incident: Incident }
  | {
      readonly type: 'incidentResolved';
      readonly module: ModuleId;
      readonly method: 'patch' | 'debug' | 'deploy' | 'auto';
    }
  | {
      readonly type: 'puzzleSolved';
      readonly puzzleId: string;
      readonly firstTime: boolean;
      readonly cycles: number;
      readonly improved: boolean;
    }
  | { readonly type: 'achievement'; readonly id: string }
  | { readonly type: 'log'; readonly id: string }
  | { readonly type: 'discover'; readonly kind: 'module' | 'upgrade'; readonly id: string }
  | { readonly type: 'anomalySpawned'; readonly anomaly: Anomaly }
  | { readonly type: 'anomalyCaught'; readonly label: string }
  | { readonly type: 'anomalyLost' }
  | { readonly type: 'stationEvent'; readonly event: ActiveEvent }
  | {
      readonly type: 'stationEventEnded';
      readonly id: string;
      readonly outcome: string;
      readonly result: 'choice' | 'goal' | 'expired';
    }
  | { readonly type: 'reboot'; readonly cores: number }
  | { readonly type: 'flag'; readonly flag: string }
  | { readonly type: 'error'; readonly message: string };

export interface Outcome {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type Action =
  | { readonly type: 'tick'; readonly dt: number }
  | { readonly type: 'click' }
  | { readonly type: 'buyModule'; readonly id: ModuleId; readonly qty: number | 'max' }
  | { readonly type: 'buyUpgrade'; readonly id: string }
  | { readonly type: 'buyPerk'; readonly id: string }
  | { readonly type: 'patch'; readonly module: ModuleId }
  | { readonly type: 'deploy'; readonly module: ModuleId }
  | {
      readonly type: 'submitSolution';
      readonly puzzleId: string;
      readonly code: string;
      readonly module: ModuleId | null;
    }
  | { readonly type: 'saveDraft'; readonly puzzleId: string; readonly code: string }
  | { readonly type: 'catchAnomaly' }
  | { readonly type: 'answerEvent'; readonly choice: string }
  | { readonly type: 'decrypt'; readonly logId: string }
  | { readonly type: 'readLog'; readonly logId: string }
  | { readonly type: 'reboot' }
  | { readonly type: 'setFlag'; readonly flag: string }
  | { readonly type: 'command' };
