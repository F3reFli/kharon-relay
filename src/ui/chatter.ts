/**
 * Bavardage de la station : de temps en temps, un sous-système en service émet une ligne
 * d'ambiance dans le journal des événements. Purement décoratif (aucun effet sur le jeu).
 */

import type { GameState, ModuleId } from '../core/types';

const GENERIC: readonly string[] = [
  'KX-OS : vérification de parité de la mémoire… OK.',
  'Hublot 31 : givre résiduel détecté, dégivrage programmé.',
  'Pression de l’anneau d’habitation : 101,2 kPa. Personne pour la respirer.',
  'Les sept capsules répondent au ping. Toujours scellées.',
  'Gyroscope 2 : dérive corrigée de 0,003°.',
  'Horloge interne resynchronisée sur le pulsar PSR-K7.',
];

const BY_MODULE: Readonly<Partial<Record<ModuleId, readonly string[]>>> = {
  capacitor: ['Banc 3 : cycle de charge terminé.', 'Diélectrique : micro-fissure stable.'],
  solar: ['Aile tribord réorientée de 2°.', 'Cellule 1142 : remise en ligne après nettoyage.'],
  drone: [
    'Drone 14 : retour à la baie, soute pleine.',
    'Drone 9 : a ramené un morceau de coque gravé « K ».',
  ],
  datacore: [
    'Archive 7 : 3 blocs supplémentaires reconstruits.',
    'Ventilateurs : berceuse en 3/4.',
  ],
  fusion: ['Tokamak : plasma stable à 150 MK.', 'Injection de deutérium : débit nominal.'],
  relay: [
    'Relais : le motif de Nérée est revenu. 41 min 12 s, pile.',
    'Antenne : verrouillage de phase maintenu.',
  ],
  foundry: ['Fonderie : lingot n° 40 211 refroidi.', 'Four 2 : température de coulée atteinte.'],
  siphon: ['Siphon : marée gravitationnelle favorable.', 'Ancres de marée alignées sur Nérée.'],
  lattice: [
    'Treillis : sept motifs d’activité persistants. Origine inconnue.',
    'Treillis : quelqu’un a laissé un commentaire dans le cache. Il est signé « A. F. ».',
  ],
  antimatter: ['Confinement : bobines équilibrées à 0,01 %.', 'Pièges de Penning : nominal.'],
};

/** Lignes possibles compte tenu des sous-systèmes en service. */
export function chatterPool(state: GameState): readonly string[] {
  const owned = (Object.keys(BY_MODULE) as ModuleId[]).filter((id) => state.modules[id].count > 0);
  return [...GENERIC, ...owned.flatMap((id) => BY_MODULE[id] ?? [])];
}

export class Chatter {
  private nextAt = 0;

  /** Renvoie une ligne quand il est temps d'en émettre une, sinon null. */
  poll(state: GameState, now: number): string | null {
    if (this.nextAt === 0) this.nextAt = now + 25_000;
    if (now < this.nextAt) return null;
    this.nextAt = now + 35_000 + Math.random() * 45_000;
    const pool = chatterPool(state);
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
}
