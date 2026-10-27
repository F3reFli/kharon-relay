# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

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
