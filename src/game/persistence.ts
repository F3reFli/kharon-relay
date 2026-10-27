/** Accès au stockage local (gère l'indisponibilité : navigation privée, quota). */

import { deserialize, serialize } from '../core/save';
import type { GameState } from '../core/types';
import { parseSettings, type Settings } from './settings';

const SAVE_KEY = 'kharon-relay:save:v1';
const BACKUP_KEY = 'kharon-relay:save:backup';
const SETTINGS_KEY = 'kharon-relay:settings';

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.getItem('__probe__');
    return s;
  } catch {
    return null;
  }
}

export type LoadOutcome =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly state: GameState }
  | { readonly kind: 'corrupt'; readonly error: string };

export function loadGame(): LoadOutcome {
  const s = storage();
  const raw = s?.getItem(SAVE_KEY);
  if (!raw) return { kind: 'empty' };
  const res = deserialize(raw);
  if (res.ok) return { kind: 'loaded', state: res.state };
  // Conserve la sauvegarde illisible pour diagnostic, puis tente la copie de secours.
  try {
    s?.setItem(`${SAVE_KEY}:corrupt`, raw);
  } catch (error: unknown) {
    console.warn('[save] impossible de conserver la sauvegarde illisible', error);
  }
  const backup = s?.getItem(BACKUP_KEY);
  if (backup) {
    const b = deserialize(backup);
    if (b.ok) return { kind: 'loaded', state: b.state };
  }
  return { kind: 'corrupt', error: res.error };
}

export function saveGame(state: GameState, now: number): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const previous = s.getItem(SAVE_KEY);
    if (previous) s.setItem(BACKUP_KEY, previous);
    s.setItem(SAVE_KEY, serialize(state, now));
    return true;
  } catch (error: unknown) {
    console.warn('[save] échec de la sauvegarde', error);
    return false;
  }
}

/** Prévient quand un autre onglet écrit la sauvegarde (deux onglets s'écraseraient). */
export function watchExternalSaves(callback: () => void): void {
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY) callback();
  });
}

export function clearGame(): void {
  const s = storage();
  s?.removeItem(SAVE_KEY);
  s?.removeItem(BACKUP_KEY);
}

export function loadSettings(): Settings {
  const raw = storage()?.getItem(SETTINGS_KEY);
  if (!raw) return parseSettings({});
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return parseSettings({});
  }
}

export function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error: unknown) {
    console.warn('[settings] échec de la sauvegarde', error);
  }
}
