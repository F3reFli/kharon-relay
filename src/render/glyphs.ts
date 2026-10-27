/** Atlas de glyphes généré à la volée dans un canvas 2D (aucun asset requis). */

import { CanvasTexture, LinearFilter } from 'three';

export type GlyphSet = 'ascii' | 'blocks' | 'binary' | 'kana';

export const GLYPH_RAMPS: Readonly<Record<GlyphSet, string>> = {
  ascii: ' .:-=+*#%@',
  blocks: ' ·░▒▓█',
  binary: ' .:01',
  kana: ' ･ｰｼﾂｱﾑﾈﾓ',
};

/** Glyphes de contour, dans l'ordre attendu par le shader : | / - \ */
const EDGE_GLYPHS = ['|', '/', '-', '\\'];
const CELL = 32;

export interface GlyphAtlas {
  readonly texture: CanvasTexture;
  readonly rampCount: number;
  readonly glyphCount: number;
}

export function buildGlyphAtlas(set: GlyphSet): GlyphAtlas {
  const glyphs = [...GLYPH_RAMPS[set], ...EDGE_GLYPHS];
  const canvas = document.createElement('canvas');
  canvas.width = CELL * glyphs.length;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(CELL * 0.86)}px "JetBrains Mono", "DejaVu Sans Mono", monospace`;
  glyphs.forEach((g, i) => {
    if (g === '█') {
      ctx.fillRect(i * CELL + 2, 2, CELL - 4, CELL - 4);
      return;
    }
    ctx.fillText(g, i * CELL + CELL / 2, CELL / 2 + 1);
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, rampCount: [...GLYPH_RAMPS[set]].length, glyphCount: glyphs.length };
}
