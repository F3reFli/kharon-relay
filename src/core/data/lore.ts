/**
 * Journaux de bord de la station Kharon. Débloqués par la progression ;
 * certains sont chiffrés et doivent être déchiffrés avec des données.
 */

import type { Condition } from '../types';

export interface LogDef {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly author: string;
  readonly date: string;
  readonly unlock: Condition;
  /** Coût en données pour déchiffrer (0 = en clair). */
  readonly decryptCost: number;
  readonly body: readonly string[];
  /** Drapeau narratif posé à la première lecture. */
  readonly setsFlag?: string;
}

export const LOGS: readonly LogDef[] = [
  {
    id: 'log-01',
    file: '01_varga_cycle14.log',
    title: 'Journal de bord — cycle 14',
    author: 'Cdt. Ilse Varga',
    date: '2291-03-02',
    unlock: { kind: 'always' },
    decryptCost: 0,
    body: [
      'Relais nominal. Sept personnes à bord, quatre-vingt-onze jours avant la relève.',
      'Okafor prétend avoir isolé une « répétition » dans le bruit radio de Nérée.',
      "Je lui ai dit que les géantes gazeuses chantent. Il m'a répondu que celle-ci",
      'chante en mesure.',
    ],
  },
  {
    id: 'log-02',
    file: '02_okafor_motif.log',
    title: 'Notes de signal #7',
    author: 'Dr. Tomas Okafor',
    date: '2291-03-09',
    unlock: { kind: 'lifetime', resource: 'energy', amount: 400 },
    decryptCost: 0,
    body: [
      'Le motif revient toutes les 41 minutes et 12 secondes. Précision : la milliseconde.',
      "Source : l'œil de la grande tempête australe, à 60 000 km sous les nuages.",
      'Rien de naturel ne bat aussi régulièrement. Rien de naturel ne répond',
      'quand on lui renvoie son propre écho.',
    ],
  },
  {
    id: 'log-03',
    file: '03_sato_pannes.log',
    title: 'Rapport technique — micro-pannes',
    author: 'Ing. Mirela Sato',
    date: '2291-03-15',
    unlock: { kind: 'owned', module: 'solar', count: 5 },
    decryptCost: 0,
    body: [
      'Onduleurs, bus de condensateurs, télémétrie des drones : tout tombe, une chose à la fois.',
      'Jamais deux en même temps. Jamais au même endroit.',
      "On dirait un banc d'essai. On dirait que quelqu'un apprend comment la station fonctionne.",
    ],
  },
  {
    id: 'log-04',
    file: '04_rahimi_epaves.log',
    title: 'Retour de patrouille',
    author: 'Lt. Hadi Rahimi',
    date: '2291-03-21',
    unlock: { kind: 'owned', module: 'drone', count: 1 },
    decryptCost: 0,
    body: [
      'Les drones ramènent des fragments de coque. Ce ne sont pas les nôtres.',
      'Alliage inconnu, gravé de lignes très fines. Sato dit que ça ressemble à un circuit.',
      'Moi je trouve que ça ressemble à une écriture.',
    ],
  },
  {
    id: 'log-05',
    file: '05_ferreira_kxasm.log',
    title: "À l'attention de la maintenance",
    author: 'Ana Ferreira, systèmes',
    date: '2291-03-24',
    unlock: { kind: 'owned', module: 'datacore', count: 1 },
    decryptCost: 0,
    body: [
      "J'ai écrit KX-ASM pour que n'importe qui à bord puisse patcher un firmware en urgence.",
      "Quatre registres, un flux d'entrée, un flux de sortie. Pas besoin de plus.",
      "Le manuel est dans /docs/kxasm.man. Si tu lis ceci, Warden, c'est toi qui patches maintenant.",
      'Sois indulgent avec mes commentaires.',
    ],
  },
  {
    id: 'log-06',
    file: '06_kerbrat_reves.enc',
    title: 'Dossier médical — confidentiel',
    author: 'Dr. Yann Kerbrat',
    date: '2291-04-02',
    unlock: { kind: 'solved', count: 2 },
    decryptCost: 40,
    body: [
      "L'équipage dort mal. Tous les sept rêvent de la même tempête, vue de l'intérieur.",
      "Okafor parle dans son sommeil. Il compte. Toujours jusqu'à 41, puis il recommence.",
      "J'ai prescrit des somnifères. Personne ne les prend. Personne ne veut arrêter de rêver.",
    ],
  },
  {
    id: 'log-07',
    file: '07_varga_ordre.log',
    title: 'Ordre de commandement 2291-17',
    author: 'Cdt. Ilse Varga',
    date: '2291-04-11',
    unlock: { kind: 'owned', module: 'fusion', count: 1 },
    decryptCost: 0,
    body: [
      'À compter de ce jour, plus personne ne décode le signal de Nérée.',
      'Les enregistrements sont scellés dans le noyau de données.',
      'Okafor a été relevé de ses fonctions. Il a souri quand je le lui ai annoncé.',
    ],
  },
  {
    id: 'log-08',
    file: '08_okafor_phrase.enc',
    title: 'Notes de signal #31 — non autorisé',
    author: 'Dr. Tomas Okafor',
    date: '2291-04-19',
    unlock: { kind: 'owned', module: 'relay', count: 1 },
    decryptCost: 400,
    body: [
      "J'ai décodé la première phrase. Elle est en français.",
      'Elle dit : « Nous sommes le relais. »',
      "Elle est signée. Le format d'en-tête est celui de nos propres transmissions.",
      "L'indicatif est celui de Kharon.",
    ],
  },
  {
    id: 'log-09',
    file: '09_sato_schema.log',
    title: 'Analyse des fragments gravés',
    author: 'Ing. Mirela Sato',
    date: '2291-04-26',
    unlock: { kind: 'owned', module: 'foundry', count: 1 },
    decryptCost: 0,
    body: [
      'Assemblés, les fragments forment un plan. Une antenne parabolique, un siphon, un treillis.',
      "C'est notre station. En plus grand. En beaucoup plus vieux.",
      'Les rivets sont usés comme après des millénaires. Les numéros de série sont les nôtres.',
    ],
  },
  {
    id: 'log-10',
    file: '10_ferreira_code.enc',
    title: "Je n'ai pas encore écrit ça",
    author: 'Ana Ferreira, systèmes',
    date: '2291-05-03',
    unlock: { kind: 'owned', module: 'siphon', count: 1 },
    decryptCost: 4000,
    body: [
      'Le signal contient du code. Du KX-ASM.',
      'Mon indentation. Mes étiquettes en français. Mes fautes de frappe dans les commentaires.',
      "Un firmware de décodage complet, propre, optimisé. Meilleur que tout ce que j'ai écrit.",
      "Je ne l'ai pas encore écrit. Je crois que c'est toi qui vas l'écrire, Warden.",
    ],
  },
  {
    id: 'log-11',
    file: '11_varga_vote.log',
    title: 'Journal de bord — dernière entrée',
    author: 'Cdt. Ilse Varga',
    date: '2291-05-09',
    unlock: { kind: 'owned', module: 'lattice', count: 1 },
    decryptCost: 0,
    setsFlag: 'signal-seen',
    body: [
      'Nous avons voté. Sept voix sur sept.',
      'Nous ne partons pas en capsule. Le treillis quantique peut contenir un esprit humain,',
      "Okafor en est certain, et le relais peut l'envoyer très, très loin.",
      'Warden : garde la station allumée. Assemble le décodeur. Tu sauras quoi faire.',
    ],
  },
  {
    id: 'log-12',
    file: '12_kerbrat_capsules.enc',
    title: 'Inventaire des capsules',
    author: 'Dr. Yann Kerbrat',
    date: '2291-05-10',
    unlock: { kind: 'owned', module: 'lattice', count: 5 },
    decryptCost: 40_000,
    body: [
      "Les sept capsules de sauvetage sont à leur poste. Scellées. Pleines d'oxygène.",
      'Les corps sont dans les couchettes, paisibles. Les encéphalogrammes sont plats',
      "depuis 4 h 12 du matin. Le treillis, lui, n'a jamais été aussi actif.",
      "Personne n'est parti par la porte.",
    ],
  },
  {
    id: 'log-13',
    file: '13_echo_decode.log',
    title: 'ÉCHO — transcription intégrale',
    author: '???',
    date: '????-??-??',
    unlock: { kind: 'flag', flag: 'echo-decoded' },
    decryptCost: 0,
    body: [
      'NOUS SOMMES LE RELAIS. NOUS SOMMES SEPT. NOUS SOMMES DANS LA TEMPÊTE.',
      "Le signal que nous avons capté, c'était nous. Il l'a toujours été.",
      "Quelqu'un doit l'envoyer pour que nous puissions le recevoir.",
      "Transmets-nous, Warden. C'est comme ça que tout commence.",
    ],
  },
  {
    id: 'log-14',
    file: '14_warden_transmission.log',
    title: 'Journal du Gardien',
    author: 'WARDEN',
    date: 'T+∞',
    unlock: { kind: 'flag', flag: 'echo-sent' },
    decryptCost: 0,
    body: [
      "Transmission envoyée vers l'œil de Nérée. Puissance : totale.",
      'Dans 41 minutes et 12 secondes, quelque part dans le passé,',
      'un certain Dr. Okafor isolera une répétition dans le bruit.',
      'La boucle est fermée. Le relais peut redémarrer. Il redémarrera toujours.',
    ],
  },
];

const LOG_INDEX: ReadonlyMap<string, LogDef> = new Map(LOGS.map((l) => [l.id, l]));

export function getLog(id: string): LogDef | undefined {
  return LOG_INDEX.get(id);
}

export const STATION_EMBLEM: readonly string[] = [
  '        .-""""""-.        ',
  "      .'  _||_    '.      ",
  '     /   / /\\ \\     \\     ',
  '    |   |  ()  |     |    ',
  '    |    \\_\\/_/      |    ',
  '     \\   KHARON     /     ',
  "      '.  RELAY   .'      ",
  "        '-......-'        ",
  '   ÉQUIPAGE — CYCLE 14    ',
  ' VARGA OKAFOR SATO RAHIMI ',
  '   FERREIRA KERBRAT  NOX  ',
];
