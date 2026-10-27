/** Contrôleur d'interface : assemble les composants, implémente UiContext, relaie les événements. */

import type { AudioEngine } from '../audio/audio';
import { formatNumber } from '../core/format';
import { computeModifiers, productionRates } from '../core/modifiers';
import { exportSave, freshState, importSave } from '../core/save';
import type { ShellAction } from '../core/shell/types';
import type { GameEvent, GameState, ModuleId, Resources } from '../core/types';
import { clearGame, saveGame, saveSettings } from '../game/persistence';
import { PALETTES, type Settings } from '../game/settings';
import type { GameStore } from '../game/store';
import type { Engine } from '../render/engine';
import { Station } from '../render/station/station';
import type { ToastTone, UiContext } from './context';
import { openEndingDialog, openLogDialog, openRebootDialog } from './dialogs';
import { h, setText, toggleClass } from './dom';
import { EditorModal } from './editor';
import { handleFeedback } from './feedback';
import { HintBox } from './hints';
import { EventLog, Floaters, Modal, Toasts } from './modal';
import { ModulesPanel } from './modulesPanel';
import { buildSettingsView } from './settingsView';
import { SidePanel } from './sidePanel';
import { TerminalView } from './terminal';
import { TopBar } from './topbar';

export class App implements UiContext {
  readonly modal = new Modal();
  private readonly toasts = new Toasts();
  private readonly floaters = new Floaters();
  private readonly eventLog = new EventLog();
  private readonly hints = new HintBox();
  private readonly topbar: TopBar;
  private readonly modules: ModulesPanel;
  private readonly side: SidePanel;
  private readonly terminal: TerminalView;
  private readonly editor: EditorModal;
  private readonly fps = h('div', { class: 'fps hidden' });
  private engine: Engine | null = null;
  private dirty = true;
  private lastRender = 0;
  private frames = 0;
  private fpsAt = performance.now();
  private rates: Resources = { energy: 0, alloy: 0, data: 0, cores: 0 };

  constructor(
    readonly store: GameStore,
    readonly audio: AudioEngine,
    private current: Settings,
    root: HTMLElement,
  ) {
    this.topbar = new TopBar(this, () => this.terminal.toggle());
    this.modules = new ModulesPanel(this);
    this.side = new SidePanel(this);
    this.terminal = new TerminalView(this, (a) => this.onShellAction(a));
    this.editor = new EditorModal(this);
    root.append(
      h('div', { class: 'hud' }, [
        this.topbar.root,
        this.modules.root,
        this.side.root,
        h('div', { class: 'bottom-dock' }, [this.terminal.root, this.eventLog.root]),
        this.hints.root,
      ]),
      this.toasts.root,
      this.floaters.root,
      this.fps,
      this.editor.root,
      this.modal.root,
      h('div', { class: 'scanlines', attrs: { 'aria-hidden': 'true' } }),
    );
    store.subscribe((state, events) => this.onStore(state, events));
    this.bindKeys();
    this.applySettings();
  }

  attachEngine(engine: Engine): void {
    this.engine = engine;
    engine.applySettings(this.current);
  }

  // — UiContext —
  settings(): Settings {
    return this.current;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    saveSettings(this.current);
    this.applySettings();
  }

  openEditor(puzzleId: string, module: ModuleId | null): void {
    this.editor.open(puzzleId, module);
  }

  openLog(logId: string): void {
    openLogDialog(this, this.modal, logId);
  }

  openSettings(): void {
    this.modal.open('RÉGLAGES', buildSettingsView(this), { wide: true });
  }

  openReboot(): void {
    openRebootDialog(this, this.modal);
  }

  runCommand(command: string): void {
    this.terminal.run(command);
  }

  toast(message: string, tone: ToastTone = 'info'): void {
    this.toasts.show(message, tone);
  }

  exportSave(): string {
    return exportSave(this.store.state, Date.now());
  }

  importSave(code: string): string | null {
    const res = importSave(code);
    if (!res.ok) return res.error;
    this.store.replace(res.state);
    saveGame(res.state, Date.now());
    this.modules.reset();
    return null;
  }

  resetGame(): void {
    clearGame();
    this.store.replace(freshState(Date.now()));
    this.modules.reset();
    this.modal.close();
    this.toast('Station réinitialisée.', 'warn');
  }

  // — Internes —
  private applySettings(): void {
    const s = this.current;
    document.documentElement.style.setProperty('--accent', PALETTES[s.palette].css);
    toggleClass(document.body, 'reduced-motion', s.reducedMotion);
    toggleClass(this.fps, 'hidden', !s.showFps);
    this.audio.setVolumes(s);
    this.engine?.applySettings(s);
    this.dirty = true;
  }

  private onShellAction(action: ShellAction): void {
    switch (action.type) {
      case 'dispatch':
        this.store.dispatch(action.action);
        break;
      case 'openEditor':
        this.openEditor(action.puzzleId, action.module);
        break;
      case 'openSettings':
        this.openSettings();
        break;
      case 'openReboot':
        this.openReboot();
        break;
      case 'clear':
        break;
    }
  }

  private onStore(state: GameState, events: readonly GameEvent[]): void {
    this.dirty = true;
    events.forEach((e) => {
      handleFeedback(e, state, {
        audio: this.audio,
        toasts: this.toasts,
        log: this.eventLog,
        terminal: this.terminal,
        onEnding: () => openEndingDialog(this.modal, state),
      });
      this.engine?.handleEvent(e);
    });
  }

  /** Impulsion manuelle (clic sur le cœur ou barre d'espace). */
  pulse(x: number, y: number): void {
    const events = this.store.dispatch({ type: 'click' });
    const click = events.find((e) => e.type === 'click');
    if (click?.type === 'click') {
      const text = `${click.crit ? 'CRITIQUE ' : ''}+${formatNumber(click.amount, this.current.notation)} ⚡`;
      this.floaters.spawn(x, y, text, click.crit);
    }
  }

  catchAnomaly(x: number, y: number): void {
    this.store.dispatch({ type: 'catchAnomaly' });
    this.floaters.spawn(x, y, 'INTERCEPTÉ !', true);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLAnchorElement ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey;
      if (typing || this.editor.isOpen() || this.modal.isOpen()) return;
      if (e.key === '`' || e.key === '²') {
        e.preventDefault();
        this.terminal.focus();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        const pos = this.engine?.coreScreenPosition() ?? {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        this.pulse(pos.x, pos.y);
      }
    });
  }

  /** Appelé à chaque image : rafraîchit l'interface au plus 10 fois par seconde. */
  frame(now: number): void {
    this.frames++;
    if (now - this.fpsAt >= 1000) {
      setText(this.fps, `${this.frames} FPS`);
      this.frames = 0;
      this.fpsAt = now;
    }
    if (!this.dirty || now - this.lastRender < 100) return;
    this.dirty = false;
    this.lastRender = now;
    const state = this.store.state;
    this.rates = productionRates(state, computeModifiers(state));
    this.topbar.update(state, this.rates);
    this.modules.update(state, this.rates);
    this.side.update(state);
    this.hints.update(state);
    this.engine?.sync(state, this.rates.energy);
    this.audio.setIntensity(Station.powerLevel(state, this.rates.energy));
  }

  showContextLost(): void {
    this.modal.open('CONTEXTE GRAPHIQUE PERDU', [
      h('p', {
        text: 'Le pilote graphique a réinitialisé le rendu 3D. Votre progression est sauvegardée.',
      }),
      h('button', {
        class: 'run-btn',
        text: 'RECHARGER',
        on: { click: () => window.location.reload() },
      }),
    ]);
  }

  showOtherTab(): void {
    this.modal.open('PARTIE OUVERTE AILLEURS', [
      h('p', {
        text: "La station est aussi pilotée depuis un autre onglet. Pour éviter que les deux sauvegardes ne s'écrasent, celui-ci n'enregistre plus.",
      }),
      h('button', {
        class: 'run-btn',
        text: 'RECHARGER LA PARTIE LA PLUS RÉCENTE',
        on: { click: () => window.location.reload() },
      }),
    ]);
  }

  terminalSystem(text: string): void {
    this.terminal.system(text);
  }
}
