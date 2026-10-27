/** Résolution d'identifiants en libellés lisibles pour l'interface. */

import { ACHIEVEMENTS } from '../core/data/achievements';
import { getLog } from '../core/data/lore';
import { getModule } from '../core/data/modules';
import { getPuzzle } from '../core/data/puzzles';
import { getUpgrade } from '../core/data/upgrades';

export const getModuleName = (id: string): string => getModule(id)?.name ?? id;
export const getUpgradeName = (id: string): string => getUpgrade(id)?.name ?? id;
export const getPuzzleTitle = (id: string): string => getPuzzle(id)?.title ?? id;
export const getLogTitle = (id: string): string => getLog(id)?.title ?? id;
export const getAchievementName = (id: string): string =>
  ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
