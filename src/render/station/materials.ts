/** Matériaux partagés de la station. */

import { AdditiveBlending, Color, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { createHullTextures, createSolarTexture } from '../textures';

export interface StationMaterials {
  readonly hull: MeshStandardMaterial;
  readonly hullDark: MeshStandardMaterial;
  readonly truss: MeshStandardMaterial;
  readonly solar: MeshStandardMaterial;
  readonly window: MeshStandardMaterial;
  readonly glowCyan: MeshBasicMaterial;
  readonly glowOrange: MeshBasicMaterial;
  readonly glowMagenta: MeshBasicMaterial;
  readonly beacon: MeshBasicMaterial;
}

export function createStationMaterials(): StationMaterials {
  const hullTex = createHullTextures();
  hullTex.map.repeat.set(2, 2);
  hullTex.emissive.repeat.set(2, 2);
  hullTex.roughness.repeat.set(2, 2);
  const glow = (color: number, opacity = 1) =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    });
  return {
    hull: new MeshStandardMaterial({
      map: hullTex.map,
      emissiveMap: hullTex.emissive,
      emissive: new Color(0xffffff),
      emissiveIntensity: 0.6,
      roughnessMap: hullTex.roughness,
      roughness: 0.75,
      metalness: 0.55,
    }),
    hullDark: new MeshStandardMaterial({
      color: 0x23262d,
      map: hullTex.map,
      roughness: 0.6,
      metalness: 0.7,
    }),
    truss: new MeshStandardMaterial({ color: 0x6c717c, roughness: 0.5, metalness: 0.85 }),
    solar: new MeshStandardMaterial({
      map: createSolarTexture(),
      roughness: 0.25,
      metalness: 0.6,
      emissive: new Color(0x0a1a40),
      emissiveIntensity: 0.4,
    }),
    window: new MeshStandardMaterial({
      color: 0x111111,
      emissive: new Color(0x9fe8ff),
      emissiveIntensity: 0,
      roughness: 0.2,
    }),
    glowCyan: glow(0x55e6ff),
    glowOrange: glow(0xff8a2a),
    glowMagenta: glow(0xff3ad0),
    beacon: glow(0xff2a2a),
  };
}
