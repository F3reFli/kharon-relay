# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

## [0.2.0] — 2026-10-27

Événements de station et refonte visuelle.

### Ajouté

- **Événements de station** : 8 alertes aléatoires (éruption stellaire, pluie de micrométéorites, tempête sur Nérée, convoi automatique, transmission fantôme, épave dérivante, résonance du cœur, chute de tension). Choix à faire avant la fin d'un compte à rebours, ou objectif d'impulsions à atteindre. Montants indexés sur la production, apparition pondérée sans répétition immédiate, pénalité si une alerte dangereuse est ignorée.
- Bonus temporaires ciblés (un module, une ressource, les impulsions ou toute la production).
- Mise en scène 3D des événements : vent solaire et halo autour du soleil, pluie de météores, éclairs dans l'œil de Nérée, cargo HÉLIX-9 qui traverse la scène, épave qui vient se poser près de l'anneau, pluie spectrale violette, cœur doré ou violet, hublots qui s'éteignent pendant une coupure. Étoiles filantes d'ambiance.
- Carte d'alerte (réponses à la souris ou touches 1-3), lueur colorée des bords de l'écran, grande annonce « SOUS-SYSTÈME EN LIGNE » à la mise en service d'un module, combo d'impulsions avec son qui monte, bavardage radio de la station dans le journal.
- Commande terminal `event`, journal caché « Fréquence 7 », 5 nouveaux succès, 5 nouveaux sons synthétisés.
- Jauge de progression vers le prochain achat sur chaque module.

### Modifié

- Rendu ASCII lisible : niveau de noir (l'espace reste noir), contours filtrés par contraste local, sous-couche colorée de l'image, points chauds blancs, léger scintillement. L'aberration chromatique au repos est presque nulle (elle reste forte pendant les glitchs).
- La caméra se centre sur la zone laissée libre par les panneaux et recule pour cadrer toute la station.
- Les notifications s'empilent sous la carte d'événement au lieu de la chevaucher.

## [0.1.0] — 2026-10-27

Première version jouable.

### Ajouté

- Station 3D procédurale (Three.js) : cœur du réacteur en shader, anneau d'habitation, 10 types de modules visibles, alertes d'incident.
- Fond 3D : nébuleuse, étoiles, géante gazeuse Nérée avec œil de tempête, anneaux, ceinture de débris.
- Post-traitement : ASCII avec contours Sobel (4 jeux de glyphes), tramage Bayer, CRT, glitchs ; palettes phosphore, ambre, glace et spectre.
- Économie : 3 ressources, 10 modules, plus de 60 protocoles, 30 succès, prestige (fragments mémoire et 6 perks).
- Langage KX-ASM : analyseur, machine virtuelle et banc de test ; 11 tickets de réparation ; éditeur avec coloration et débogueur pas à pas.
- Terminal KX-OS : système de fichiers virtuel, une trentaine de commandes, autocomplétion.
- Récit en 14 journaux de bord, dont certains chiffrés, et une fin en boucle.
- Audio synthétisé (WebAudio).
- Sauvegarde locale validée par schéma, copie de secours, export/import, progression hors-ligne.
- Pipeline Meshy AI pour des modèles 3D optionnels, avec plafond de crédits et reprise.
- Docker durci (nginx non-root, lecture seule, CSP), CI GitHub Actions, tests unitaires et E2E.
