/** Contrat partagé entre les composants d'interface et le contrôleur principal. */

import type { AudioEngine } from '../audio/audio';
import type { ModuleId } from '../core/types';
import type { GameStore } from '../game/store';
import type { Settings } from '../game/settings';

export type ToastTone = 'info' | 'ok' | 'warn' | 'err' | 'achievement' | 'log';

export interface UiContext {
  readonly store: GameStore;
  readonly audio: AudioEngine;
  settings(): Settings;
  updateSettings(patch: Partial<Settings>): void;
  openEditor(puzzleId: string, module: ModuleId | null): void;
  openLog(logId: string): void;
  openSettings(): void;
  openReboot(): void;
  runCommand(command: string): void;
  toast(message: string, tone?: ToastTone): void;
  exportSave(): string;
  importSave(code: string): string | null;
  resetGame(): void;
}
