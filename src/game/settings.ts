/** Réglages joueur (affichage, filtres, audio), validés au chargement. */

import { z } from 'zod';

export const settingsSchema = z.object({
  filter: z.enum(['ascii', 'dither', 'crt', 'clean']).default('ascii'),
  palette: z.enum(['phosphor', 'amber', 'ice', 'spectrum']).default('spectrum'),
  glyphs: z.enum(['ascii', 'blocks', 'binary', 'kana']).default('ascii'),
  cellSize: z.number().int().min(6).max(20).default(9),
  edges: z.boolean().default(true),
  bloom: z.boolean().default(true),
  crt: z.number().min(0).max(1).default(0.65),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  masterVolume: z.number().min(0).max(1).default(0.7),
  sfxVolume: z.number().min(0).max(1).default(0.8),
  ambientVolume: z.number().min(0).max(1).default(0.5),
  notation: z.enum(['suffix', 'scientific']).default('suffix'),
  reducedMotion: z.boolean().default(false),
  showFps: z.boolean().default(false),
  bootSequence: z.boolean().default(true),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export function parseSettings(raw: unknown): Settings {
  const res = settingsSchema.safeParse(raw ?? {});
  return res.success ? res.data : DEFAULT_SETTINGS;
}

export const PALETTES: Readonly<
  Record<Settings['palette'], { tint: [number, number, number]; colorize: number; css: string }>
> = {
  phosphor: { tint: [0.35, 1.0, 0.55], colorize: 0, css: '#5dff8f' },
  amber: { tint: [1.0, 0.68, 0.18], colorize: 0, css: '#ffb02e' },
  ice: { tint: [0.45, 0.85, 1.0], colorize: 0, css: '#73d8ff' },
  spectrum: { tint: [0.5, 0.95, 1.0], colorize: 1, css: '#7fe7ff' },
};
