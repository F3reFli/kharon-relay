# KX-ASM — référence du langage

_Kharon eXecutive Assembly_, langage de patch des firmwares de la station. Conçu par A. Ferreira : « Quatre registres suffisent à tout. »

## Modèle d'exécution

- **Registres** : `A`, `B`, `C`, `D`. Entiers valant 0 au démarrage, saturés à ±99 999.
- **IN** : flux d'entrée. Chaque lecture consomme une valeur. Lire un flux vide provoque une faute.
- **OUT** : flux de sortie, en écriture seule, uniquement via `MOV OUT, x`.
- Le programme s'arrête sur `HLT` ou après sa dernière instruction.
- Limites : 160 lignes, 120 instructions, 20 000 cycles par exécution (au-delà : « délai dépassé »).

## Syntaxe

```
etiquette:  OPCODE operande, operande   ; commentaire (ou #)
```

- Les opcodes et les registres sont insensibles à la casse.
- Les étiquettes s'écrivent `[a-z_][a-z0-9_]*` et peuvent figurer seules sur une ligne.
- Une étiquette placée après la dernière instruction équivaut à « fin du programme ».

## Instructions

| Instruction                          | Effet                                                      |
| ------------------------------------ | ---------------------------------------------------------- |
| `MOV d, s`                           | `d ← s` (d : registre ou OUT ; s : registre, entier ou IN) |
| `ADD r, s` / `SUB r, s` / `MUL r, s` | arithmétique                                               |
| `DIV r, s`                           | division entière tronquée vers zéro (faute si s = 0)       |
| `MOD r, s`                           | reste toujours positif (faute si s = 0)                    |
| `INC r` / `DEC r` / `NEG r`          | +1 / −1 / opposé                                           |
| `SWP r, q`                           | échange deux registres                                     |
| `JMP l`                              | saut inconditionnel                                        |
| `JZ r, l` / `JNZ r, l`               | saut si r = 0 / r ≠ 0                                      |
| `JGZ r, l` / `JLZ r, l`              | saut si r > 0 / r < 0                                      |
| `JEOF l`                             | saut si le flux IN est épuisé                              |
| `NOP` / `HLT`                        | rien / arrêt                                               |

## Évaluation

Chaque ticket est exécuté sur ses exemples publics puis sur des cas aléatoires, générés à partir d'une graine propre à l'incident. Une sortie est correcte si elle est **identique** à l'attendu : même longueur, mêmes valeurs, aucune faute. Le score d'optimisation est la somme des cycles sur les exemples publics.

## Exemple : maximum d'un flux

```asm
  MOV A, IN       ; premier relevé = maximum provisoire
suivant:
  JEOF fin
  MOV B, IN
  MOV C, B
  SUB C, A        ; C = B - A
  JLZ C, suivant  ; B < A : on garde A
  MOV A, B
  JMP suivant
fin:
  MOV OUT, A
```
