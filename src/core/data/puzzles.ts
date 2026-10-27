/**
 * Tickets de maintenance résolus en KX-ASM. Chaque ticket fournit un firmware « corrompu »
 * que le joueur doit réparer, des exemples fixes et un générateur de cas aléatoires
 * (empêche de coder les réponses en dur).
 */

import type { Cost, ModuleId } from '../types';

export interface TestCase {
  readonly input: readonly number[];
  readonly expected: readonly number[];
}

export interface PuzzleDef {
  readonly id: string;
  readonly title: string;
  readonly module: ModuleId | null;
  readonly brief: readonly string[];
  readonly hints: readonly string[];
  readonly starter: string;
  readonly examples: readonly TestCase[];
  readonly generate: (rand: () => number) => TestCase;
  readonly randomCases: number;
  /** Cycles cumulés sur les exemples pour obtenir la mention « optimisé ». */
  readonly parCycles: number;
  readonly reward: Cost;
  /** Si défini, la sortie est aussi affichée comme texte (alphabet A-Z + espace). */
  readonly decodeAsText?: boolean;
}

function int(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function list(
  rand: () => number,
  minLen: number,
  maxLen: number,
  min: number,
  max: number,
): number[] {
  return Array.from({ length: int(rand, minLen, maxLen) }, () => int(rand, min, max));
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';

export function textToCodes(text: string): number[] {
  return [...text.toUpperCase()].map((c) => ALPHABET.indexOf(c)).filter((n) => n >= 0);
}

export function codesToText(codes: readonly number[]): string {
  return codes.map((n) => ALPHABET[n] ?? '?').join('');
}

function encodeEcho(message: string, key: number, rand: () => number): TestCase {
  const codes = textToCodes(message);
  return {
    input: [key, ...codes.map((c) => c + key + 27 * int(rand, 0, 3))],
    expected: codes,
  };
}

/** Source déterministe pour les exemples : alterne décalage nul et décalage de 27. */
function alternating(): () => number {
  let i = 0;
  return () => (i++ % 2 === 0 ? 0 : 0.3);
}

const ECHO_MESSAGES = [
  'NOUS SOMMES LE RELAIS',
  'NE LES REVEILLE PAS',
  'LA TEMPETE ECOUTE',
  'WARDEN REPONDS',
  'TRANSMETS NOUS',
  'IL N Y A PAS DE RETOUR',
];

export const PUZZLES: readonly PuzzleDef[] = [
  {
    id: 'echo-bus',
    title: "Bus d'écho",
    module: 'capacitor',
    brief: [
      'Le bus du banc de condensateurs ne relaie plus les impulsions.',
      "Recopier chaque valeur lue sur IN vers OUT, dans l'ordre.",
    ],
    hints: [
      'Une ligne a été effacée entre la lecture et le saut.',
      'MOV OUT, A écrit le registre A sur la sortie.',
    ],
    starter: [
      '; FIRMWARE CAPA-BUS v1.2 — banc de condensateurs',
      "; Recopie chaque valeur du bus d'entrée vers la sortie.",
      'boucle:',
      "  JEOF fin        ; plus rien à lire ? on s'arrête",
      '  MOV A, IN',
      '  ; ▓▓▓▓▓▓ SECTEUR CORROMPU ▓▓▓▓▓▓',
      '  JMP boucle',
      'fin:',
      '  HLT',
    ].join('\n'),
    examples: [
      { input: [3, 14, 15], expected: [3, 14, 15] },
      { input: [-7, 0, 42, 9], expected: [-7, 0, 42, 9] },
    ],
    generate: (rand) => {
      const input = list(rand, 3, 8, -50, 99);
      return { input, expected: input };
    },
    randomCases: 4,
    parCycles: 23,
    reward: { data: 15, alloy: 20 },
  },
  {
    id: 'solar-filter',
    title: 'Filtre des cellules',
    module: 'solar',
    brief: [
      'Les cellules mortes renvoient 0 ou une valeur négative et polluent le bus.',
      'Ne transmettre sur OUT que les relevés strictement positifs.',
    ],
    hints: [
      'La logique du saut conditionnel est inversée.',
      'JGZ saute si > 0, JLZ si < 0, JZ si = 0.',
    ],
    starter: [
      '; FIRMWARE SOLR-FLT v2.0',
      '; Transmet uniquement les relevés strictement positifs.',
      'lire:',
      '  JEOF fin',
      '  MOV A, IN',
      '  JGZ A, lire     ; ▓▓ logique inversée ? ▓▓',
      '  MOV OUT, A',
      '  JMP lire',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [5, -2, 0, 8, 1], expected: [5, 8, 1] },
      { input: [-1, -9, 12], expected: [12] },
    ],
    generate: (rand) => {
      const input = list(rand, 4, 9, -30, 60);
      return { input, expected: input.filter((v) => v > 0) };
    },
    randomCases: 5,
    parCycles: 38,
    reward: { data: 30, alloy: 60 },
  },
  {
    id: 'drone-pairs',
    title: 'Télémétrie des drones',
    module: 'drone',
    brief: [
      'Les drones envoient leurs relevés de masse par paires (x, y).',
      'Pour chaque paire, émettre x + y.',
    ],
    hints: ['Une seule instruction a été altérée.'],
    starter: [
      '; FIRMWARE DRON-TLM v0.9',
      '; Paires (x, y) → x + y',
      'paire:',
      '  JEOF fin',
      '  MOV A, IN',
      '  MOV B, IN',
      '  SUB A, B        ; ▓▓ opération altérée ▓▓',
      '  MOV OUT, A',
      '  JMP paire',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [2, 3, 10, -4], expected: [5, 6] },
      { input: [0, 0, 7, 8, -5, -5], expected: [0, 15, -10] },
    ],
    generate: (rand) => {
      const pairs = int(rand, 2, 5);
      const input = list(rand, pairs * 2, pairs * 2, -40, 80);
      const expected = Array.from(
        { length: pairs },
        (_, i) => (input[2 * i] ?? 0) + (input[2 * i + 1] ?? 0),
      );
      return { input, expected };
    },
    randomCases: 5,
    parCycles: 27,
    reward: { data: 60, alloy: 150 },
  },
  {
    id: 'checksum',
    title: 'Somme de contrôle',
    module: 'datacore',
    brief: [
      'Le noyau de données valide ses blocs par une somme de contrôle.',
      'Émettre UNE seule valeur : la somme de toutes les entrées, à la fin du flux.',
    ],
    hints: [
      "La sortie est écrite à chaque tour de boucle au lieu d'une seule fois.",
      'Les registres valent 0 au démarrage.',
    ],
    starter: [
      '; FIRMWARE DATA-CHK v3.1',
      '; Somme de toutes les valeurs, une seule sortie en fin de flux.',
      'boucle:',
      '  JEOF fin',
      '  ADD A, IN',
      '  MOV OUT, A      ; ▓▓ fuite de sortie ▓▓',
      '  JMP boucle',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [1, 2, 3, 4], expected: [10] },
      { input: [50, -20, 7], expected: [37] },
    ],
    generate: (rand) => {
      const input = list(rand, 1, 10, -99, 99);
      return { input, expected: [input.reduce((s, v) => s + v, 0)] };
    },
    randomCases: 5,
    parCycles: 25,
    reward: { data: 120, alloy: 300 },
  },
  {
    id: 'coolant',
    title: 'Seuils de refroidissement',
    module: 'fusion',
    brief: [
      'Les sondes du tokamak envoient des températures (en centaines de kelvins).',
      "Pour chaque relevé : émettre 1 s'il dépasse 50 (strictement), sinon 0.",
    ],
    hints: [
      'Après SUB A, 50, le signe de A indique le côté du seuil.',
      'Il faut deux branches : une qui émet 1, une qui émet 0.',
    ],
    starter: [
      '; FIRMWARE FUSN-CLT v1.0',
      '; 1 si température > 50, sinon 0.',
      'temp:',
      '  JEOF fin',
      '  MOV A, IN',
      '  SUB A, 50',
      '  ; ▓▓▓▓ le reste de la routine est illisible ▓▓▓▓',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [10, 51, 50, 99], expected: [0, 1, 0, 1] },
      { input: [70, 20], expected: [1, 0] },
    ],
    generate: (rand) => {
      const input = list(rand, 3, 8, 0, 99);
      return { input, expected: input.map((v) => (v > 50 ? 1 : 0)) };
    },
    randomCases: 5,
    parCycles: 38,
    reward: { data: 300, alloy: 900 },
  },
  {
    id: 'peak',
    title: 'Pic de signal',
    module: 'relay',
    brief: [
      "L'antenne doit verrouiller la fréquence la plus forte.",
      'Émettre UNE seule valeur : le maximum du flux. Les valeurs peuvent être négatives.',
    ],
    hints: [
      'Copiez B dans C, soustrayez A : si le résultat est négatif, A reste le maximum.',
      'Pensez au cas où tous les relevés sont négatifs.',
    ],
    starter: [
      '; FIRMWARE RLAY-PK v4.2',
      '; Plus grande valeur du flux (une seule sortie).',
      '  MOV A, IN       ; premier relevé = maximum provisoire',
      'suivant:',
      '  JEOF fin',
      '  MOV B, IN',
      '  ; ▓▓ comparer B à A et garder le plus grand ▓▓',
      '  JMP suivant',
      'fin:',
      '  MOV OUT, A',
    ].join('\n'),
    examples: [
      { input: [3, 9, 2, 7], expected: [9] },
      { input: [-8, -3, -11], expected: [-3] },
    ],
    generate: (rand) => {
      const input = list(rand, 1, 10, -99, 99);
      return { input, expected: [Math.max(...input)] };
    },
    randomCases: 6,
    parCycles: 35,
    reward: { data: 1500, alloy: 4000 },
  },
  {
    id: 'countdown',
    title: 'Séquence de coulée',
    module: 'foundry',
    brief: [
      'Chaque lot de la fonderie est coulé en N passes décroissantes.',
      'Pour chaque valeur N (≥ 1), émettre N, N-1, …, 1.',
    ],
    hints: [
      "La boucle de décompte n'a pas de condition d'arrêt.",
      'JNZ A, etiquette saute tant que A ≠ 0.',
    ],
    starter: [
      '; FIRMWARE FNDR-SEQ v2.3',
      '; Pour chaque N : N, N-1, ..., 1',
      'lot:',
      '  JEOF fin',
      '  MOV A, IN',
      'decompte:',
      '  MOV OUT, A',
      '  DEC A',
      "  JMP decompte    ; ▓▓ condition d'arrêt manquante ▓▓",
      'fin:',
    ].join('\n'),
    examples: [
      { input: [3, 1], expected: [3, 2, 1, 1] },
      { input: [5], expected: [5, 4, 3, 2, 1] },
    ],
    generate: (rand) => {
      const input = list(rand, 1, 4, 1, 9);
      return { input, expected: input.flatMap((n) => Array.from({ length: n }, (_, i) => n - i)) };
    },
    randomCases: 5,
    parCycles: 38,
    reward: { data: 6000, alloy: 20_000 },
  },
  {
    id: 'sort3',
    title: 'Tri des ancres',
    module: 'siphon',
    brief: [
      'Les ancres de marée transmettent leurs tensions par trois (x, y, z).',
      'Pour chaque triplet, émettre les trois valeurs triées de la plus petite à la plus grande.',
    ],
    hints: [
      'Trois comparaisons-échanges suffisent : (A,B), (B,C), puis (A,B).',
      'SWP A, B échange deux registres. D est libre comme registre temporaire.',
    ],
    starter: [
      "; FIRMWARE SIPH-SRT v0.1 — brouillon d'A. Ferreira",
      '; Triplets → valeurs triées par ordre croissant.',
      'triplet:',
      '  JEOF fin',
      '  MOV A, IN',
      '  MOV B, IN',
      '  MOV C, IN',
      '  ; ▓▓▓▓ routine de tri effacée ▓▓▓▓',
      '  MOV OUT, A',
      '  MOV OUT, B',
      '  MOV OUT, C',
      '  JMP triplet',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [3, 1, 2], expected: [1, 2, 3] },
      { input: [9, 9, -4, 5, 0, 7], expected: [-4, 9, 9, 0, 5, 7] },
    ],
    generate: (rand) => {
      const triples = int(rand, 1, 4);
      const input = list(rand, triples * 3, triples * 3, -50, 50);
      const expected = Array.from({ length: triples }, (_, i) =>
        input.slice(i * 3, i * 3 + 3).sort((a, b) => a - b),
      ).flat();
      return { input, expected };
    },
    randomCases: 8,
    parCycles: 59,
    reward: { data: 40_000, alloy: 150_000 },
  },
  {
    id: 'fibonacci',
    title: 'Suite du treillis',
    module: 'lattice',
    brief: [
      'Le treillis indexe sa mémoire selon une suite où chaque terme est la somme des deux précédents.',
      'Pour chaque N (1 ≤ N ≤ 20), émettre le N-ième terme : 1, 1, 2, 3, 5, 8, 13…',
    ],
    hints: [
      'Avec A = 0 et B = 1, répétez N-1 fois : C = A + B, A = B, B = C. Le résultat est dans B.',
      'D sert de compteur : DEC D puis JZ D, …',
    ],
    starter: [
      '; FIRMWARE QLAT-FIB v7.0',
      '; Pour chaque N : N-ième terme de 1, 1, 2, 3, 5, 8...',
      'nombre:',
      '  JEOF fin',
      '  MOV D, IN',
      '  MOV A, 0',
      '  MOV B, 1',
      "  ; ▓▓▓▓ boucle d'itération corrompue ▓▓▓▓",
      '  JMP nombre',
      'fin:',
    ].join('\n'),
    examples: [
      { input: [1, 2, 3, 6], expected: [1, 1, 2, 8] },
      { input: [10], expected: [55] },
    ],
    generate: (rand) => {
      const input = list(rand, 1, 4, 1, 20);
      const fib = (n: number): number => {
        let a = 0;
        let b = 1;
        for (let i = 1; i < n; i++) [a, b] = [b, a + b];
        return b;
      };
      return { input, expected: input.map(fib) };
    },
    randomCases: 6,
    parCycles: 161,
    reward: { data: 400_000, alloy: 1_000_000 },
  },
  {
    id: 'absdiff',
    title: 'Équilibre de confinement',
    module: 'antimatter',
    brief: [
      'Les deux bobines du confinement doivent rester équilibrées.',
      "Pour chaque paire (x, y), émettre l'écart absolu |x − y|.",
    ],
    hints: [
      'NEG A inverse le signe de A.',
      'Soustraire puis corriger le signe si le résultat est négatif.',
    ],
    starter: [
      '; FIRMWARE ANTI-BAL v1.0',
      '; Paires (x, y) → |x - y|',
      '; ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
      '; ▓▓▓▓ firmware entièrement effacé ▓▓▓',
      '; ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
    ].join('\n'),
    examples: [
      { input: [9, 4, 4, 9], expected: [5, 5] },
      { input: [-3, 3, 0, 0], expected: [6, 0] },
    ],
    generate: (rand) => {
      const pairs = int(rand, 2, 5);
      const input = list(rand, pairs * 2, pairs * 2, -60, 60);
      const expected = Array.from({ length: pairs }, (_, i) =>
        Math.abs((input[2 * i] ?? 0) - (input[2 * i + 1] ?? 0)),
      );
      return { input, expected };
    },
    randomCases: 6,
    parCycles: 29,
    reward: { data: 3_000_000, alloy: 9_000_000 },
  },
  {
    id: 'echo',
    title: "L'Écho",
    module: null,
    brief: [
      "Le signal capté depuis l'œil de la tempête de Nérée est chiffré par décalage.",
      'La PREMIÈRE valeur du flux est la clé K. Pour chaque valeur v suivante, émettre (v − K) MOD 27.',
      'Alphabet : 0 = A … 25 = Z, 26 = espace. La sortie sera affichée en clair.',
    ],
    hints: [
      'Gardez la clé dans un registre dédié (D par exemple).',
      'MOD renvoie toujours un résultat positif.',
    ],
    starter: [
      '; FIRMWARE ECHO-DEC v?.?',
      '; ▓▓▓▓ source inconnue ▓▓▓▓',
      '; Première valeur = clé K, puis émettre (v - K) MOD 27 pour chaque v.',
    ].join('\n'),
    examples: [encodeEcho('ECOUTE', 5, alternating()), encodeEcho('KHARON', 12, alternating())],
    generate: (rand) => {
      const msg = ECHO_MESSAGES[int(rand, 0, ECHO_MESSAGES.length - 1)] ?? 'ECHO';
      return encodeEcho(msg, int(rand, 1, 40), rand);
    },
    randomCases: 3,
    parCycles: 76,
    reward: { data: 1_000_000 },
    decodeAsText: true,
  },
];

const PUZZLE_INDEX: ReadonlyMap<string, PuzzleDef> = new Map(PUZZLES.map((p) => [p.id, p]));

export function getPuzzle(id: string): PuzzleDef | undefined {
  return PUZZLE_INDEX.get(id);
}
