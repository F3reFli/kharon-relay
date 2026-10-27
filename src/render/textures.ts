/** Textures procédurales (panneaux de coque, cellules solaires) générées par canvas. */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { createRandomStream } from '../core/rng';

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface HullTextures {
  readonly map: CanvasTexture;
  readonly emissive: CanvasTexture;
  readonly roughness: CanvasTexture;
}

type Ctx = CanvasRenderingContext2D;

interface Layers {
  readonly base: Ctx;
  readonly glow: Ctx;
  readonly rough: Ctx;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function fill(ctx: Ctx, color: string, size: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

/** Plaque avec joint, rugosité propre et quatre rivets. */
function drawPlate(layers: Layers, rand: () => number, r: Rect): void {
  const shade = 46 + Math.floor(rand() * 34);
  layers.base.fillStyle = `rgb(${shade},${shade + 3},${shade + 9})`;
  layers.base.fillRect(r.x, r.y, r.w, r.h);
  layers.base.strokeStyle = 'rgba(10,12,16,0.85)';
  layers.base.lineWidth = 2;
  layers.base.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  layers.rough.fillStyle = `rgb(${120 + Math.floor(rand() * 100)},0,0)`;
  layers.rough.fillRect(r.x, r.y, r.w, r.h);
  layers.base.fillStyle = 'rgba(200,205,215,0.35)';
  for (const [rx, ry] of [
    [r.x + 4, r.y + 4],
    [r.x + r.w - 6, r.y + 4],
    [r.x + 4, r.y + r.h - 6],
    [r.x + r.w - 6, r.y + r.h - 6],
  ] as const) {
    layers.base.fillRect(rx, ry, 2, 2);
  }
}

function drawHazard(ctx: Ctx, r: Rect): void {
  for (let s = 0; s < r.w; s += 12) {
    ctx.fillStyle = s % 24 === 0 ? '#c8a020' : '#1a1a1a';
    ctx.fillRect(r.x + s, r.y + r.h - 8, 12, 6);
  }
}

/** Rangée de hublots, dont certains éclairés (couche émissive). */
function drawWindows(layers: Layers, rand: () => number, r: Rect): void {
  const cols = 2 + Math.floor(rand() * 4);
  for (let c = 0; c < cols; c++) {
    const lit = rand() < 0.55;
    const wx = r.x + 8 + c * 10;
    layers.base.fillStyle = '#0c1118';
    layers.base.fillRect(wx, r.y + 8, 6, 4);
    if (lit) {
      layers.glow.fillStyle = rand() < 0.8 ? '#9fe8ff' : '#ffb35a';
      layers.glow.fillRect(wx, r.y + 8, 6, 4);
    }
  }
}

/** Plaques de coque avec joints, rivets, bandes de danger et hublots éclairés. */
export function createHullTextures(seed = 7): HullTextures {
  const size = 512;
  const rand = createRandomStream(seed);
  const base = makeCanvas(size);
  const glow = makeCanvas(size);
  const rough = makeCanvas(size);
  const layers: Layers = { base: base.ctx, glow: glow.ctx, rough: rough.ctx };
  fill(base.ctx, '#3a3f47', size);
  fill(glow.ctx, '#000', size);
  fill(rough.ctx, '#9a9a9a', size);
  for (let i = 0; i < 70; i++) {
    const w = 32 + Math.floor(rand() * 6) * 24;
    const h = 24 + Math.floor(rand() * 5) * 24;
    const x = Math.floor(rand() * (size / 8)) * 8;
    const y = Math.floor(rand() * (size / 8)) * 8;
    const rect = { x, y, w, h };
    drawPlate(layers, rand, rect);
    if (rand() < 0.08) drawHazard(base.ctx, rect);
    if (rand() < 0.35) drawWindows(layers, rand, rect);
  }
  // Traînées d'usure.
  for (let i = 0; i < 260; i++) {
    base.ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.08})`;
    base.ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 6 + rand() * 30);
  }
  return {
    map: toTexture(base.canvas),
    emissive: toTexture(glow.canvas),
    roughness: toTexture(rough.canvas, false),
  };
}

/** Grille de cellules photovoltaïques, certaines mortes. */
export function createSolarTexture(seed = 3): CanvasTexture {
  const size = 256;
  const rand = createRandomStream(seed);
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#0a0f1c';
  ctx.fillRect(0, 0, size, size);
  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const dead = rand() < 0.18;
      ctx.fillStyle = dead
        ? '#141414'
        : `rgb(${20 + rand() * 15},${40 + rand() * 25},${90 + rand() * 50})`;
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.strokeStyle = 'rgba(160,190,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y + 2);
      ctx.lineTo(x + cell / 2, y + cell - 2);
      ctx.stroke();
    }
  }
  return toTexture(canvas);
}
