/**
 * Doit être le premier import de main.ts : zod sonde `new Function` pour son compilateur
 * JIT dès la première validation (certaines ont lieu à l'import). Notre CSP l'interdit.
 */
import { z } from 'zod';

z.config({ jitless: true });
