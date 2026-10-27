# Architecture

## Principes

1. **Noyau pur** (`src/core`). Toute la logique de jeu est faite de fonctions pures sur des données immuables : économie, incidents, assembleur, terminal, sauvegarde. Aucun accès au DOM, à Three.js ou à l'horloge murale. C'est ce qui permet d'atteindre ~98 % de couverture et de rejouer des scénarios de manière déterministe.
2. **Réducteur unique**. `reduce(state, action) → { state, events }` est le seul point d'entrée qui modifie l'état. L'aléatoire passe par un PRNG (mulberry32) dont l'état est stocké dans la sauvegarde, donc la même séquence d'actions donne toujours le même résultat.
3. **Événements → retours**. Le noyau ne joue ni son ni animation. Il émet des événements (`click`, `incident`, `puzzleSolved`, `achievement`…) que l'interface traduit en sons, notifications, effets 3D et lignes de terminal (`src/ui/feedback.ts`).
4. **Le rendu lit, il n'écrit pas**. `Engine.sync(state)` aligne la scène sur l'état, environ 10 fois par seconde. Le rendu ne modifie jamais l'état : un clic sur le cœur remonte un _callback_ qui envoie une action au store.
5. **Frontières validées**. Tout ce qui vient de l'extérieur est validé par schéma (zod) avant usage : sauvegarde locale, code d'import, réglages, manifest des modèles.

## Flux

```
                ┌──────────── setInterval 100 ms ────────────┐
                ▼                                            │
 entrée ──► GameStore.dispatch(action) ──► reduce() ──► { state, events }
 (clic,           ▲                                     │        │
 terminal,        │                                     │        ▼
 éditeur)         │                         App.onStore ─┤  handleFeedback → audio, toasts, journal
                  │                                     │  Engine.handleEvent → particules, glitch
                  │                                     ▼
                  └──── requestAnimationFrame ──► App.frame (≤ 10 Hz) → panneaux DOM
                                                 Engine.frame (60 Hz) → Three.js + post-traitement
```

- **Simulation** : un `setInterval` à 10 Hz mesure le temps réellement écoulé et le découpe en pas d'au plus 1 s. Elle continue donc, au rythme réduit qu'impose le navigateur, quand l'onglet est en arrière-plan. Au-delà de 60 s d'écart, le calcul hors-ligne (`applyOffline`) prend le relais.
- **Rendu** : boucle `requestAnimationFrame` indépendante. L'interface se rafraîchit au plus toutes les 100 ms, et seulement si l'état a changé.

## Rendu 3D

```
RenderPass ─► UnrealBloomPass ─► OutputPass (tone mapping + sRGB) ─► StylizeShader ─► CrtShader
```

- **StylizeShader** (`render/shaders/postfx.ts`) :
  - _ASCII_ : l'écran est découpé en cellules ; la luminance moyenne de chaque cellule choisit un glyphe dans un atlas généré par canvas. Un filtre de Sobel calculé à l'échelle des cellules détecte les contours et les remplace par des glyphes orientés (`| / - \`).
  - _Tramage_ : seuil ordonné de Bayer 8×8, quantifié sur 4 niveaux.
- **CrtShader** : courbure, lignes de balayage, barre de défilement, aberration chromatique, vignettage, grain, scintillement et déchirures horizontales pilotées par un niveau de _glitch_ que les incidents font monter.
- **Station** (`render/station/`) :
  - géométrie procédurale avec textures de coque générées par canvas ;
  - un visuel par type de module, qui apparaît et se densifie selon le nombre d'unités ;
  - un état d'alerte par module (lueurs rouges clignotantes) ;
  - les modèles Meshy, s'ils existent, remplacent ou complètent certains éléments (`applyModels`).
- **Fond** : ciel nébuleux en fBm, étoiles en `Points`, géante gazeuse (bandes avec _domain warping_ et œil de tempête), anneaux, ceinture de débris en `InstancedMesh`.
- **Interaction** : raycast au relâchement du clic (un glisser fait tourner la caméra), survol limité à une vérification par image.
- **Robustesse** : perte de contexte WebGL interceptée. Sans WebGL, le jeu reste jouable entièrement au terminal.

## Persistance

- `localStorage` : `kharon-relay:save:v1` (avec copie de secours `…:backup`) et `kharon-relay:settings`.
- Sauvegarde toutes les 20 s, au passage en arrière-plan et à la fermeture de la page.
- Une sauvegarde illisible est conservée sous `…:corrupt` pour diagnostic, et la copie de secours est tentée.
- Le schéma zod fournit des valeurs par défaut pour les champs manquants, ce qui sert de mécanisme de migration entre versions.

## Déploiement

- Image multi-étapes : `node:24-alpine` (build) puis `nginxinc/nginx-unprivileged` (service).
- En production :
  - le conteneur tourne non-root, en lecture seule (`tmpfs /tmp`) et sans capacités Linux ;
  - le navigateur reçoit une CSP stricte (`script-src 'self' 'wasm-unsafe-eval'` pour le décodeur meshopt), `X-Frame-Options: DENY` et `nosniff` ;
  - les assets Vite sont mis en cache 1 an, `index.html` n'est pas mis en cache ;
  - la sonde de santé répond sur `/healthz`.
- La CI vérifie que l'image démarre durcie et qu'elle répond.
