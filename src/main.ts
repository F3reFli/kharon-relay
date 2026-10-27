/** Point d'entrée : chargement, boucle de simulation, rendu, sauvegarde automatique. */

import './zod-setup';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/vt323/400.css';
import './styles/main.css';

import { AudioEngine } from './audio/audio';
import { TICK_SECONDS } from './core/constants';
import { applyOffline, freshState } from './core/save';
import type { GameState } from './core/types';
import { loadGame, loadSettings, saveGame, watchExternalSaves } from './game/persistence';
import { GameStore } from './game/store';
import { Engine } from './render/engine';
import { App } from './ui/app';
import { runBootSequence } from './ui/boot';
import { openOfflineDialog } from './ui/dialogs';

const AUTOSAVE_MS = 20_000;
/**
 * Au-delà de cet écart entre deux pas, on bascule sur le calcul hors-ligne. Assez large pour
 * qu'un onglet en arrière-plan (réveillé environ une fois par minute) soit simulé normalement.
 */
const OFFLINE_GAP_MS = 10 * 60_000;

function initialState(): { state: GameState; notice: string | null } {
  const loaded = loadGame();
  if (loaded.kind === 'loaded') return { state: loaded.state, notice: null };
  if (loaded.kind === 'corrupt')
    return {
      state: freshState(Date.now()),
      notice: `Sauvegarde illisible (${loaded.error}). Nouvelle partie.`,
    };
  return { state: freshState(Date.now()), notice: null };
}

/** Simulation à 10 Hz sur l'horloge murale (qui, elle, avance pendant la mise en veille). */
function startSimulation(store: GameStore, onOffline: () => void): void {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - last);
    last = now;
    if (elapsed > OFFLINE_GAP_MS) {
      store.replace(applyOffline({ ...store.state, lastSavedAt: now - elapsed }, now).state);
      onOffline();
      return;
    }
    let remaining = elapsed / 1000;
    while (remaining > 1e-6) {
      const dt = Math.min(remaining, 1);
      store.dispatch({ type: 'tick', dt });
      remaining -= dt;
    }
  }, TICK_SECONDS * 1000);
}

function createEngine(canvas: HTMLCanvasElement, app: App): Engine | null {
  try {
    const engine = new Engine(canvas, app.settings(), {
      onCoreClick: (x, y) => app.pulse(x, y),
      onAnomalyClick: (x, y) => app.catchAnomaly(x, y),
      onContextLost: () => app.showContextLost(),
    });
    app.attachEngine(engine);
    return engine;
  } catch (error: unknown) {
    console.error('[render] WebGL indisponible', error);
    canvas.remove();
    document.body.classList.add('no-webgl');
    app.toast('WebGL indisponible : mode terminal uniquement. Tapez « help ».', 'warn');
    return null;
  }
}

/** Sauvegarde automatique ; s'interrompt si un autre onglet écrit la même partie. */
function setupPersistence(store: GameStore, app: App): void {
  let suspended = false;
  const save = () => {
    if (!suspended) saveGame(store.state, Date.now());
  };
  setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  watchExternalSaves(() => {
    if (suspended) return;
    suspended = true;
    app.showOtherTab();
  });
}

/** Boucle de rendu : réarmée avant le travail, une erreur ponctuelle ne la tue pas. */
function startRenderLoop(engine: Engine | null, app: App): void {
  let lastError = '';
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    try {
      engine?.frame();
      app.frame(now);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError) console.error('[frame]', error);
      lastError = message;
    }
  };
  requestAnimationFrame(loop);
}

function bootstrap(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const root = document.querySelector<HTMLElement>('#app');
  if (!canvas || !root) throw new Error('Éléments #scene / #app introuvables');

  const settings = loadSettings();
  const { state, notice } = initialState();
  const offline = applyOffline(state, Date.now());
  const store = new GameStore(offline.state);
  const audio = new AudioEngine();
  const app = new App(store, audio, settings, root);
  const engine = createEngine(canvas, app);

  setupPersistence(store, app);
  startSimulation(store, () => app.terminalSystem('Reprise après une longue veille.'));
  startRenderLoop(engine, app);

  document.body.append(
    runBootSequence(settings.bootSequence, () => {
      audio.unlock();
      audio.setVolumes(app.settings());
      audio.play('boot');
      if (offline.report) openOfflineDialog(app.modal, offline.report);
      if (notice) app.toast(notice, 'err');
    }),
  );
}

bootstrap();
