/** Solutions de référence des tickets (gardées hors du bundle du jeu). */

export const REFERENCE_SOLUTIONS: Readonly<Record<string, string>> = {
  'echo-bus': `
boucle:
  JEOF fin
  MOV OUT, IN
  JMP boucle
fin:`,
  'solar-filter': `
lire:
  JEOF fin
  MOV A, IN
  JGZ A, garder
  JMP lire
garder:
  MOV OUT, A
  JMP lire
fin:`,
  'drone-pairs': `
paire:
  JEOF fin
  MOV A, IN
  ADD A, IN
  MOV OUT, A
  JMP paire
fin:`,
  checksum: `
boucle:
  JEOF fin
  ADD A, IN
  JMP boucle
fin:
  MOV OUT, A`,
  coolant: `
temp:
  JEOF fin
  MOV A, IN
  SUB A, 50
  JGZ A, chaud
  MOV OUT, 0
  JMP temp
chaud:
  MOV OUT, 1
  JMP temp
fin:`,
  peak: `
  MOV A, IN
suivant:
  JEOF fin
  MOV B, IN
  MOV C, B
  SUB C, A
  JLZ C, suivant
  MOV A, B
  JMP suivant
fin:
  MOV OUT, A`,
  countdown: `
lot:
  JEOF fin
  MOV A, IN
decompte:
  MOV OUT, A
  DEC A
  JNZ A, decompte
  JMP lot
fin:`,
  sort3: `
triplet:
  JEOF fin
  MOV A, IN
  MOV B, IN
  MOV C, IN
  MOV D, A
  SUB D, B
  JLZ D, ab
  SWP A, B
ab:
  MOV D, B
  SUB D, C
  JLZ D, bc
  SWP B, C
bc:
  MOV D, A
  SUB D, B
  JLZ D, ok
  SWP A, B
ok:
  MOV OUT, A
  MOV OUT, B
  MOV OUT, C
  JMP triplet
fin:`,
  fibonacci: `
nombre:
  JEOF fin
  MOV D, IN
  MOV A, 0
  MOV B, 1
iter:
  DEC D
  JZ D, emit
  MOV C, A
  ADD C, B
  MOV A, B
  MOV B, C
  JMP iter
emit:
  MOV OUT, B
  JMP nombre
fin:`,
  absdiff: `
paire:
  JEOF fin
  MOV A, IN
  SUB A, IN
  JGZ A, pos
  NEG A
pos:
  MOV OUT, A
  JMP paire
fin:`,
  echo: `
  MOV D, IN
lettre:
  JEOF fin
  MOV A, IN
  SUB A, D
  MOD A, 27
  MOV OUT, A
  JMP lettre
fin:`,
};
