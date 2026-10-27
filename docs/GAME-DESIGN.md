# Game design

> ⚠️ Ce document divulgue l'histoire et les solutions.

## Boucle de jeu

1. **Impulsion** : clic sur le cœur, qui rapporte `1 × multiplicateurs` (+ une fraction de la production/s grâce aux protocoles « Couplage neural » et « Synapse du Gardien »). 3 % de chances de critique ×8 au départ.
2. **Modules** : production passive. Coût géométrique `base × g^possédés`, avec `g ≈ 1,15–1,17`. Les achats ×10 / ×100 / MAX utilisent la somme géométrique fermée.
3. **Incidents** : processus de Poisson de moyenne 150 s, multipliée par la stabilité (protocoles et perks). Le module touché est tiré en pondérant par `risque × √unités`. Une panne retire 50 à 100 % de la production du module. Au plus 3 incidents simultanés. Le premier tombe toujours sur le banc de condensateurs, après environ 75 s : c'est le didacticiel.
4. **Réparation** :
   - _patch_ : 50 % du prix unitaire actuel ;
   - _debug_ : programme KX-ASM, gratuit, et production ×1,5 pendant 10 min ;
   - _deploy_ : firmware enregistré, rejoué sur les tests propres au ticket ;
   - _auto_ : l'essaim de drones répare tout incident après 120 s (40 s avec la version II).
5. **Paquets dérivants** : environ toutes les 160 s, visibles 14 s. Récompense : surcharge ×3 pendant 30 s, ou un lot d'énergie, d'alliage ou de données.
6. **Événements de station** : premier créneau à 5 min, puis intervalle exponentiel de moyenne 210 s (au moins 90 s). Voir plus bas.
7. **Prestige** : `fragments = ⌊√(énergie du cycle / 10⁸)⌋`. Chaque fragment non dépensé donne +4 % de production. Les perks coûtent des fragments.

## Multiplicateurs

```
production(module) = base × unités × multModule × multRessource × multGlobal
                     × (1 + 0,04 × fragments) × (1 + 0,02 × succès)
                     × buffsGlobaux × buffsModule × buffsRessource
                     × (1 − gravitéIncident) × (1,5 si patch optimisé)

impulsion = (1 × multImpulsion × multiplicateur commun + taux ⚡ × couplage) × buffsImpulsion
```

Les bonus temporaires ont une portée : toute la production, un module, une ressource ou les impulsions. Hors-ligne, seuls les bonus globaux sont pris en compte.

## Modules

| #   | Module                    | Produit / unité  | Coût de base              | Ticket KX-ASM                               |
| --- | ------------------------- | ---------------- | ------------------------- | ------------------------------------------- |
| 1   | Banc de condensateurs     | 0,4 ⚡           | 15 ⚡                     | Bus d'écho (recopie)                        |
| 2   | Panneaux solaires         | 3 ⚡             | 110 ⚡                    | Filtre des cellules (> 0)                   |
| 3   | Baie de drones            | 0,5 ⬡            | 450 ⚡                    | Télémétrie (somme de paires)                |
| 4   | Noyau de données          | 0,25 ◈           | 2,5 K ⚡ + 60 ⬡           | Somme de contrôle                           |
| 5   | Cellule à fusion          | 60 ⚡            | 9 K ⚡ + 250 ⬡            | Seuils (1 si > 50)                          |
| 6   | Antenne relais            | 2 ◈ + 120 ⚡     | 40 K ⚡ + 4 K ⬡ + 600 ◈   | Pic de signal (max)                         |
| 7   | Fonderie orbitale         | 40 ⬡             | 150 K ⚡ + 30 K ⬡ + 3 K ◈ | Séquence de coulée (décompte)               |
| 8   | Siphon gravitationnel     | 2,5 K ⚡         | 2 M ⚡ + 120 K ⬡ + 60 K ◈ | Tri des ancres (tri de triplets)            |
| 9   | Treillis quantique        | 150 ◈            | 30 M ⚡ + 1 M ⬡ + 1 M ◈   | Suite du treillis (Fibonacci)               |
| 10  | Confinement d'antimatière | 150 K ⚡ + 2 K ⬡ | 300 M ⚡ + 6 M ⬡ + 5 M ◈  | Équilibre (écart absolu)                    |
| —   | _Récit_                   | —                | —                         | L'Écho (déchiffrement par décalage, mod 27) |

Chaque module dispose de 4 protocoles de palier, débloqués à 10, 25, 50 et 100 unités (×2, ×2, ×2 puis ×3).

## Événements de station

Les événements ne se cumulent pas : un seul à la fois. Le tirage est pondéré parmi les événements débloqués et évite de répéter le précédent quand un autre est possible. Les montants sont exprimés en **secondes de production actuelle**, avec un plancher, pour garder le même poids à tous les stades.

| Événement                | Déblocage  | Fenêtre | Réponses                                                              | Sans réponse             |
| ------------------------ | ---------- | ------- | --------------------------------------------------------------------- | ------------------------ |
| Éruption stellaire       | 3 solaires | 30 s    | solaires ×6 pendant 60 s (incident 50 %) / +60 s de ⚡                | incident 50 %            |
| Pluie de micrométéorites | 1 drone    | 30 s    | ⬡ ×5 pendant 45 s (incident 35 %) / boucliers : coûte 45 s de ⚡      | incident certain         |
| Tempête sur Nérée        | 1 relais   | 35 s    | ◈ ×4 pendant 60 s / siphon ×6 pendant 60 s (si siphon) / +40 s de ⚡  | —                        |
| Convoi automatique       | 1 noyau    | 40 s    | 90 s de ⚡ → 150 s de ⬡ / 90 s de ⬡ → 150 s de ◈ / rien               | —                        |
| Transmission fantôme     | 1 relais   | 35 s    | coûte 60 s de ◈ : tout ×2 pendant 90 s + journal caché / +120 s de ⚡ | —                        |
| Épave dérivante          | 3 drones   | 35 s    | +180 s de ⬡ et +60 s de ⚡ / +200 s de ◈                              | —                        |
| Résonance du cœur        | 100 clics  | 20 s    | impulsions ×7 ; 45 impulsions → tout ×2 pendant 60 s                  | fin de la résonance      |
| Chute de tension         | 1 fusion   | 30 s    | production ×0,5 ; 25 impulsions → relance, tout ×1,5 pendant 45 s     | retour lent à la normale |

Un incident « provoqué » survient 3 s plus tard sur un module tiré normalement (pondéré par risque × √unités), dans la limite des 3 incidents simultanés.

## Rythme mesuré

Une simulation sur le noyau pur, avec un joueur scripté glouton (3 clics/s puis 1 clic/s, achats en économisant pour le palier suivant, incidents réparés en KX-ASM, sans paquets dérivants), donne pour une première partie sans redémarrage :

| Jalon                                     | Temps  |
| ----------------------------------------- | ------ |
| Noyau de données                          | 4 min  |
| Cellule à fusion                          | 8 min  |
| Antenne relais                            | 17 min |
| Fonderie                                  | 31 min |
| Siphon                                    | 1 h 07 |
| Premier redémarrage possible (1 fragment) | 1 h 28 |
| Treillis quantique                        | 2 h 14 |
| 10 fragments                              | ≈ 6 h  |

L'antimatière et la fin du récit (5 treillis, décodeur, transmission) sont pensées pour être atteintes après un ou deux redémarrages.

## Tickets KX-ASM

- Le firmware de départ est **corrompu** : instruction altérée, logique inversée, boucle sans fin, routine effacée. Il échoue toujours ; les tests le vérifient.
- La difficulté progresse : corriger une ligne, inverser une condition, écrire une boucle, puis un tri en trois comparaisons-échanges, Fibonacci, et enfin le déchiffrement.
- Chaque ticket comprend des exemples publics et N cas aléatoires générés à partir d'une graine propre à l'incident.
- Le nombre de cycles cumulés sur les exemples sert de score d'optimisation. Atteindre la référence débloque le succès « Optimiseur ».

## Récit (structure)

| Phase      | Déclencheur                    | Révélation                                                                                                                                            |
| ---------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normalité  | départ                         | Un signal se répète toutes les 41 min 12 s depuis l'œil de la tempête de Nérée.                                                                       |
| Inquiétude | solaire ×5, drones             | Micro-pannes « pédagogiques », fragments de coque gravés qui ne viennent pas de la station.                                                           |
| Interdit   | fusion, relais                 | La commandante interdit le décodage. La première phrase décodée est en français et porte l'indicatif de Kharon.                                       |
| Vertige    | fonderie, siphon               | Les fragments forment le plan de la station, vieillie de plusieurs millénaires. Le signal contient du code KX-ASM écrit dans le style d'Ana Ferreira. |
| Décision   | treillis                       | L'équipage vote de se téléverser dans le treillis. Les capsules n'ont jamais été utilisées.                                                           |
| Boucle     | ticket ÉCHO, puis transmission | Le signal, c'était eux. Le Gardien le renvoie, ce qui ferme la boucle temporelle. Le redémarrage devient « Transmettre et redémarrer ».               |

Les 7 capsules de sauvetage restent visibles, amarrées à l'anneau d'habitation.
