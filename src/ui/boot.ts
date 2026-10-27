/** Séquence de démarrage façon BIOS ; le clic final déverrouille aussi l'audio. */

import { h } from './dom';

const LINES: ReadonlyArray<[string, string]> = [
  ['KX-BIOS v4.12 (c) 2287 Ferreira Systems', 'title'],
  ['Processeur : KX-9 tri-cœur @ 2.4 THz ........ OK', ''],
  ['Mémoire : 4096 To ECC ......................... 3 % intègre', 'warn'],
  ["Bus d'alimentation principal ................. DÉGRADÉ", 'warn'],
  ['Réacteur : confinement ........................ STABLE', 'ok'],
  ['Montage /dev/archives ......................... lecture seule', ''],
  ['Équipage détecté : 0/7', 'err'],
  ['Dernière activité humaine : il y a 1 097 jours', 'err'],
  ['Chargement du noyau KX-OS 0.9.14-rc ........... OK', 'ok'],
  ['Démarrage de warden.service ................... OK', 'ok'],
];

const bootLine = ([text, tone]: readonly [string, string]) =>
  h('div', { class: `boot-line ${tone}`, text });

function buildPrompt(): HTMLElement {
  return h('div', { class: 'boot-prompt hidden' }, [
    h('div', {
      class: 'boot-title glitch-text',
      text: 'KHARON//RELAY',
      attrs: { 'data-text': 'KHARON//RELAY' },
    }),
    h('div', { class: 'boot-sub', text: 'Le relais est silencieux. Vous êtes le Gardien.' }),
    h('div', {
      class: 'boot-cta blink',
      text: '[ CLIQUEZ OU APPUYEZ SUR UNE TOUCHE POUR INITIALISER ]',
    }),
    h('div', {
      class: 'boot-help',
      text: 'Cliquez le cœur du réacteur · construisez des modules · réparez les firmwares en KX-ASM · lisez les journaux',
    }),
  ]);
}

/** Fait défiler les lignes du BIOS, puis révèle l'invite (sauf si déjà révélée par un clic). */
function scheduleLines(log: HTMLElement, isRevealed: () => boolean, reveal: () => void): void {
  LINES.forEach((entry, i) => {
    const delay = 120 + i * 170 + (i > 5 ? 200 : 0);
    setTimeout(() => {
      if (isRevealed()) return;
      log.append(bootLine(entry));
      if (i === LINES.length - 1) setTimeout(reveal, 350);
    }, delay);
  });
}

export function runBootSequence(full: boolean, onStart: () => void): HTMLElement {
  const log = h('div', { class: 'boot-log' });
  const prompt = buildPrompt();
  const root = h(
    'div',
    { class: 'boot-overlay', attrs: { role: 'dialog', 'aria-label': 'Démarrage' } },
    [log, prompt],
  );
  const isRevealed = () => !prompt.classList.contains('hidden');
  let started = false;
  const start = () => {
    if (started || !isRevealed()) return;
    started = true;
    window.removeEventListener('keydown', start);
    root.classList.add('leaving');
    onStart();
    setTimeout(() => root.remove(), 900);
  };
  const reveal = () => {
    prompt.classList.remove('hidden');
    window.addEventListener('keydown', start);
  };
  root.addEventListener('click', () => {
    if (isRevealed()) return start();
    log.replaceChildren(...LINES.map(bootLine));
    reveal();
  });
  if (full) scheduleLines(log, isRevealed, reveal);
  else reveal();
  return root;
}
