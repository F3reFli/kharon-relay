/** Paramètres d'équilibrage centralisés. */

export const SAVE_VERSION = 1;
export const TICK_SECONDS = 0.1;

export const BASE_CLICK = 1;
export const BASE_CRIT_CHANCE = 0.03;
export const CRIT_MULTIPLIER = 8;

/** Bonus passif par fragment mémoire non dépensé. */
export const CORE_BONUS = 0.04;
/** Énergie de cycle requise pour le premier fragment (fragments = √(énergie / seuil)). */
export const REBOOT_THRESHOLD = 1e8;

export const FIRST_INCIDENT_AT = 75;
export const INCIDENT_MEAN_INTERVAL = 150;
export const INCIDENT_RETRY_DELAY = 20;
export const MAX_ACTIVE_INCIDENTS = 3;
export const AUTO_DEPLOY_DELAY = 6;
export const DEBUG_BOOST_SECONDS = 600;
export const DEBUG_BOOST_MULT = 1.5;
export const PATCH_COST_RATIO = 0.5;

export const FIRST_ANOMALY_AT = 100;
export const ANOMALY_MEAN_INTERVAL = 160;
export const ANOMALY_LIFETIME = 14;

/** Événements de station : premier créneau, intervalle moyen (exponentiel) et plancher. */
export const FIRST_EVENT_AT = 300;
export const EVENT_MEAN_INTERVAL = 210;
export const EVENT_MIN_INTERVAL = 90;
export const EVENT_RETRY_DELAY = 30;
/** Délai avant l'incident provoqué par un choix risqué ou une alerte ignorée. */
export const EVENT_INCIDENT_DELAY = 3;

export const BASE_OFFLINE_HOURS = 8;
export const BASE_OFFLINE_RATE = 0.5;

/** Graine fixe des tests en mode entraînement (hors incident). */
export const PRACTICE_SEED = 0x5eed;
