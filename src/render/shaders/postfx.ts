/**
 * Passes de post-traitement :
 *  - StylizeShader : ASCII (rampe de luminance + glyphes de contour orientés par Sobel)
 *    ou tramage ordonné de Bayer, ou transparent.
 *  - CrtShader : courbure d'écran, lignes de balayage, aberration chromatique,
 *    vignettage, grain, scintillement et glitch d'incident.
 */

import { Texture, Vector2, Vector3 } from 'three';
import { HASH_GLSL } from './noise';

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const StylizeShader = {
  name: 'StylizeShader',
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    tGlyphs: { value: null as Texture | null },
    uResolution: { value: new Vector2(1, 1) },
    uCell: { value: 10 },
    uRampCount: { value: 10 },
    uGlyphCount: { value: 14 },
    uMode: { value: 0 },
    uTint: { value: new Vector3(0.3, 1.0, 0.6) },
    uColorize: { value: 0 },
    uEdges: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tGlyphs;
uniform vec2 uResolution;
uniform float uCell;
uniform float uRampCount;
uniform float uGlyphCount;
uniform int uMode;
uniform vec3 uTint;
uniform float uColorize;
uniform float uEdges;
uniform float uTime;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 at(vec2 px) { return texture2D(tDiffuse, clamp(px / uResolution, 0.0, 1.0)).rgb; }

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 shade(vec3 col, float l) {
  vec3 mono = uTint * l;
  vec3 spectral = col / max(max(col.r, max(col.g, col.b)), 0.08) * l;
  return mix(mono, spectral, uColorize);
}

vec4 dither(vec2 px) {
  float size = max(2.0, floor(uCell * 0.35));
  vec2 cell = floor(px / size);
  vec3 col = at((cell + 0.5) * size);
  float l = pow(clamp(luma(col) * 1.25, 0.0, 1.0), 0.8);
  float t = bayer8(cell) - 0.5;
  float levels = 4.0;
  float q = clamp(floor(l * (levels - 1.0) + 0.5 + t), 0.0, levels - 1.0) / (levels - 1.0);
  vec3 qc = clamp(floor(col * (levels - 1.0) + 0.5 + t), 0.0, levels - 1.0) / (levels - 1.0);
  vec3 outc = mix(uTint * q, qc, uColorize);
  return vec4(outc + uTint * 0.015, 1.0);
}

float sobelLum(vec2 c, vec2 d) { return luma(at(c + d * uCell)); }

vec4 ascii(vec2 px) {
  vec2 cell = floor(px / uCell);
  vec2 center = (cell + 0.5) * uCell;
  float q = uCell * 0.25;
  vec3 col = (at(center + vec2(-q, -q)) + at(center + vec2(q, -q)) + at(center + vec2(-q, q)) + at(center + vec2(q, q))) * 0.25;
  float l = luma(col);
  float boosted = pow(clamp(l * 1.6, 0.0, 1.0), 0.7);

  float tl = sobelLum(center, vec2(-1.0, 1.0));
  float t  = sobelLum(center, vec2(0.0, 1.0));
  float tr = sobelLum(center, vec2(1.0, 1.0));
  float ml = sobelLum(center, vec2(-1.0, 0.0));
  float mr = sobelLum(center, vec2(1.0, 0.0));
  float bl = sobelLum(center, vec2(-1.0, -1.0));
  float b  = sobelLum(center, vec2(0.0, -1.0));
  float br = sobelLum(center, vec2(1.0, -1.0));
  vec2 g = vec2(tr + 2.0 * mr + br - tl - 2.0 * ml - bl, tl + 2.0 * t + tr - bl - 2.0 * b - br);
  float mag = length(g);

  float glyph;
  if (uEdges > 0.5 && mag > 0.55 && boosted > 0.08) {
    float a = mod(atan(g.y, g.x) + 3.14159265, 3.14159265);
    float bucket = mod(floor(a / 0.78539816 + 0.5), 4.0);
    // ordre de l'atlas après la rampe : barre, slash, tiret, antislash
    float edgeIndex = bucket < 0.5 ? 0.0 : bucket < 1.5 ? 3.0 : bucket < 2.5 ? 2.0 : 1.0;
    glyph = uRampCount + edgeIndex;
  } else {
    glyph = floor(boosted * (uRampCount - 0.001));
  }
  vec2 inCell = fract(px / uCell);
  float mask = texture2D(tGlyphs, vec2((glyph + inCell.x) / uGlyphCount, inCell.y)).r;
  vec3 ink = shade(col, 0.45 + 1.15 * boosted);
  vec3 background = mix(uTint * 0.018, col * 0.06, uColorize);
  return vec4(background + ink * mask, 1.0);
}

void main() {
  vec2 px = vUv * uResolution;
  if (uMode == 0) { gl_FragColor = ascii(px); return; }
  if (uMode == 1) { gl_FragColor = dither(px); return; }
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`,
};

export const CrtShader = {
  name: 'CrtShader',
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uResolution: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uIntensity: { value: 0.7 },
    uGlitch: { value: 0 },
    uCurvature: { value: 1 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uGlitch;
uniform float uCurvature;
varying vec2 vUv;
${HASH_GLSL}

vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) / vec2(6.0, 5.0);
  uv = uv + uv * off * off * uCurvature * uIntensity;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 uv = curve(vUv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float band = floor(uv.y * 48.0);
  float frame = floor(uTime * 24.0);
  float tear = step(0.86, hash12(vec2(band, frame))) * (hash12(vec2(frame, band * 1.7)) - 0.5);
  uv.x += tear * 0.08 * uGlitch;
  uv.y += (hash12(vec2(frame, 3.0)) - 0.5) * 0.004 * uGlitch;

  float ca = (0.0008 + 0.006 * uGlitch) * (0.4 + uIntensity);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

  float scan = 0.5 + 0.5 * sin(uv.y * uResolution.y * 3.14159265);
  col *= mix(1.0, 0.78 + 0.22 * scan, uIntensity * 0.8);
  float roll = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.5 - uTime * 0.07) - 0.5));
  col *= mix(1.0, 0.94 + 0.06 * roll, uIntensity);

  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.95, 0.25, length(d * vec2(1.05, 1.25)));
  col *= mix(1.0, vig, uIntensity * 0.9);

  col += (hash12(vUv * uResolution + fract(uTime) * 91.7) - 0.5) * 0.05 * uIntensity;
  col *= 1.0 - 0.015 * uIntensity * sin(uTime * 55.0);
  col += vec3(0.6, 0.05, 0.08) * uGlitch * 0.12 * step(0.5, hash12(vec2(frame, 9.0)));

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`,
};
