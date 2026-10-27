/** Contenu de la fenêtre de réglages (affichage, audio, jeu, sauvegarde, à propos). */

import type { Settings } from '../game/settings';
import type { UiContext } from './context';
import { h } from './dom';

type Option<T extends string> = { readonly value: T; readonly label: string };

function select<K extends keyof Settings>(
  ctx: UiContext,
  key: K,
  label: string,
  options: ReadonlyArray<Option<Settings[K] & string>>,
): HTMLElement {
  const current = ctx.settings()[key];
  const el = h(
    'select',
    {
      on: {
        change: (e) =>
          ctx.updateSettings({ [key]: (e.target as HTMLSelectElement).value } as Partial<Settings>),
      },
    },
    options.map((o) =>
      h('option', {
        text: o.label,
        attrs: o.value === current ? { value: o.value, selected: 'true' } : { value: o.value },
      }),
    ),
  );
  return h('label', { class: 'setting' }, [h('span', { text: label }), el]);
}

function toggle<K extends keyof Settings>(ctx: UiContext, key: K, label: string): HTMLElement {
  const input = h('input', {
    attrs: ctx.settings()[key] ? { type: 'checkbox', checked: 'true' } : { type: 'checkbox' },
    on: {
      change: (e) =>
        ctx.updateSettings({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>),
    },
  });
  return h('label', { class: 'setting' }, [h('span', { text: label }), input]);
}

function slider<K extends keyof Settings>(
  ctx: UiContext,
  key: K,
  label: string,
  min: number,
  max: number,
  stepValue: number,
): HTMLElement {
  const value = h('span', { class: 'slider-value', text: String(ctx.settings()[key]) });
  const input = h('input', {
    attrs: {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(stepValue),
      value: String(ctx.settings()[key]),
    },
    on: {
      input: (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        value.textContent = String(v);
        ctx.updateSettings({ [key]: v } as Partial<Settings>);
      },
    },
  });
  return h('label', { class: 'setting' }, [
    h('span', { text: label }),
    h('div', { class: 'slider' }, [input, value]),
  ]);
}

const miniButton = (text: string, onClick: () => void, extra = '') =>
  h('button', { class: `mini-btn${extra}`, text, on: { click: onClick } });

function transferRow(ctx: UiContext, area: HTMLTextAreaElement, status: HTMLElement): HTMLElement {
  const exportCode = () => {
    area.value = ctx.exportSave();
    area.select();
    void navigator.clipboard?.writeText(area.value).then(
      () => (status.textContent = 'Code copié dans le presse-papiers.'),
      () => (status.textContent = 'Code généré : copiez-le manuellement.'),
    );
  };
  const importCode = () => {
    status.textContent = ctx.importSave(area.value) ?? 'Sauvegarde importée.';
  };
  return h('div', { class: 'row' }, [
    miniButton('EXPORTER', exportCode),
    miniButton('IMPORTER', importCode),
  ]);
}

function dangerZone(ctx: UiContext, status: HTMLElement): HTMLElement {
  const confirm = h('input', {
    attrs: {
      type: 'text',
      placeholder: 'tapez EFFACER',
      'aria-label': 'Confirmation de réinitialisation',
    },
  });
  const reset = () => {
    if (confirm.value.trim().toUpperCase() === 'EFFACER') ctx.resetGame();
    else status.textContent = 'Tapez EFFACER pour confirmer la réinitialisation complète.';
  };
  return h('div', { class: 'row danger-zone' }, [
    confirm,
    miniButton('RÉINITIALISER', reset, ' danger'),
  ]);
}

function saveSection(ctx: UiContext): HTMLElement[] {
  const area = h('textarea', {
    class: 'save-area',
    attrs: {
      rows: '3',
      spellcheck: 'false',
      placeholder: 'Collez ici un code KHARON1:…',
      'aria-label': 'Code de sauvegarde',
    },
  });
  const status = h('p', { class: 'small dim' });
  return [
    h('h3', { text: 'SAUVEGARDE' }),
    h('p', {
      class: 'small dim',
      text: 'Sauvegarde automatique toutes les 20 s dans le navigateur.',
    }),
    area,
    transferRow(ctx, area, status),
    status,
    dangerZone(ctx, status),
  ];
}

export function buildSettingsView(ctx: UiContext): Node[] {
  return [
    h('h3', { text: 'AFFICHAGE' }),
    select(ctx, 'filter', 'Filtre', [
      { value: 'ascii', label: 'ASCII' },
      { value: 'dither', label: 'Tramage 1-bit' },
      { value: 'crt', label: 'CRT seul' },
      { value: 'clean', label: 'Net (aucun filtre)' },
    ]),
    select(ctx, 'palette', 'Palette', [
      { value: 'spectrum', label: 'Spectre (couleurs)' },
      { value: 'phosphor', label: 'Phosphore vert' },
      { value: 'amber', label: 'Ambre' },
      { value: 'ice', label: 'Glace' },
    ]),
    select(ctx, 'glyphs', 'Jeu de glyphes', [
      { value: 'ascii', label: 'ASCII classique' },
      { value: 'blocks', label: 'Blocs ░▒▓' },
      { value: 'binary', label: 'Binaire 01' },
      { value: 'kana', label: 'Katakana' },
    ]),
    slider(ctx, 'cellSize', 'Taille des cellules', 6, 20, 1),
    toggle(ctx, 'edges', 'Contours ASCII (Sobel)'),
    slider(ctx, 'crt', 'Intensité CRT', 0, 1, 0.05),
    toggle(ctx, 'bloom', 'Halo lumineux (bloom)'),
    select(ctx, 'quality', 'Qualité (étoiles/débris : au rechargement)', [
      { value: 'low', label: 'Basse' },
      { value: 'medium', label: 'Moyenne' },
      { value: 'high', label: 'Haute' },
    ]),
    toggle(ctx, 'reducedMotion', 'Mouvements réduits'),
    toggle(ctx, 'showFps', 'Afficher les FPS'),
    h('h3', { text: 'AUDIO' }),
    slider(ctx, 'masterVolume', 'Volume général', 0, 1, 0.05),
    slider(ctx, 'sfxVolume', 'Effets', 0, 1, 0.05),
    slider(ctx, 'ambientVolume', 'Ambiance', 0, 1, 0.05),
    h('h3', { text: 'JEU' }),
    select(ctx, 'notation', 'Notation des nombres', [
      { value: 'suffix', label: 'Suffixes (1.5M)' },
      { value: 'scientific', label: 'Scientifique (1.50e6)' },
    ]),
    toggle(ctx, 'bootSequence', 'Séquence de démarrage complète'),
    ...saveSection(ctx),
    h('h3', { text: 'À PROPOS' }),
    h('p', {
      class: 'small dim',
      text: `KHARON//RELAY v${__APP_VERSION__} — clicker spatial open source (MIT). Three.js, TypeScript, Vite.`,
    }),
  ];
}
