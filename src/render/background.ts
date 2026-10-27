/**
 * Arrière-plan 3D : ciel nébuleux procédural, champ d'étoiles scintillantes,
 * géante gazeuse Nérée (bandes en fBm avec domain warping, œil de tempête pulsant),
 * anneaux, soleil lointain et ceinture de débris instanciés.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
} from 'three';
import { createRandomStream } from '../core/rng';
import { NOISE_GLSL } from './shaders/noise';

export const SUN_DIRECTION = new Vector3(0.45, 0.3, -0.85).normalize();
export const PLANET_POSITION = new Vector3(-600, -270, -180);
export const PLANET_RADIUS = 170;

function createSky(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float n1 = fbm(d * 2.2 + vec3(0.0, uTime * 0.002, 0.0));
        float n2 = fbm(d * 4.5 + n1 * 0.8);
        float bandX = d.y * 2.2 + n1 * 0.6 - 0.15;
        float band = exp(-bandX * bandX * 3.0);
        vec3 violet = vec3(0.22, 0.06, 0.32);
        vec3 teal = vec3(0.02, 0.18, 0.24);
        vec3 ember = vec3(0.35, 0.08, 0.05);
        vec3 col = mix(violet, teal, smoothstep(-0.3, 0.5, n2));
        col = mix(col, ember, smoothstep(0.35, 0.8, n1 * n2 + 0.3) * 0.6);
        float density = smoothstep(-0.15, 0.7, n2) * band;
        gl_FragColor = vec4(col * density * 0.55 + vec3(0.004, 0.006, 0.012), 1.0);
      }`,
  });
}

/** Positions sur une coquille sphérique, couleurs selon une température et quelques étoiles brillantes. */
function createStarGeometry(count: number): BufferGeometry {
  const rand = createRandomStream(91);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new Color();
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = 1400 + rand() * 300;
    const s = Math.sqrt(1 - u * u);
    positions.set([r * s * Math.cos(theta), r * u, r * s * Math.sin(theta)], i * 3);
    const temp = rand();
    const warm = temp >= 0.7;
    color.setHSL(warm ? 0.08 : 0.6 - temp * 0.1, warm ? 0.7 : 0.4, 0.75 + rand() * 0.25);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = rand() < 0.02 ? 5 + rand() * 4 : 1 + rand() * 2.4;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('size', new BufferAttribute(sizes, 1));
  return geo;
}

function createStarMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        vTwinkle = 0.65 + 0.35 * sin(uTime * (1.0 + fract(position.x * 0.13) * 3.0) + position.y);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a * vTwinkle * 1.6, a);
      }`,
  });
}

function createStars(count: number): Points {
  return new Points(createStarGeometry(count), createStarMaterial());
}

function createPlanetMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIRECTION.clone() }, uStorm: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      void main() {
        vPos = position / ${PLANET_RADIUS.toFixed(1)};
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSun;
      uniform float uStorm;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      ${NOISE_GLSL}
      void main() {
        vec3 p = vPos;
        float t = uTime * 0.01;
        float warp = fbm(p * 2.5 + vec3(t, 0.0, -t));
        float lat = p.y + warp * 0.12;
        float bands = sin(lat * 26.0 + fbm(p * vec3(1.0, 8.0, 1.0) + t) * 2.5);
        vec3 c1 = vec3(0.62, 0.38, 0.22);
        vec3 c2 = vec3(0.86, 0.72, 0.52);
        vec3 c3 = vec3(0.35, 0.18, 0.14);
        vec3 col = mix(c1, c2, smoothstep(-0.6, 0.8, bands));
        col = mix(col, c3, smoothstep(0.2, 0.9, fbm(p * 6.0 - t * 2.0)) * 0.5);
        // Œil de la tempête australe : la source de l'Écho.
        vec3 eye = normalize(vec3(0.55, -0.42, 0.72));
        float de = distance(normalize(p), eye);
        float swirl = sin(de * 60.0 - uTime * 0.8 + atan(p.z - eye.z, p.x - eye.x) * 3.0);
        float eyeMask = smoothstep(0.22, 0.0, de);
        col = mix(col, vec3(0.95, 0.5, 0.3) + swirl * 0.08, eyeMask * 0.7);
        float pulse = 0.5 + 0.5 * sin(uTime * 0.6);
        vec3 eyeGlow = vec3(0.4, 0.9, 1.0) * smoothstep(0.05, 0.0, de) * (0.6 + pulse * (0.6 + uStorm));
        float light = smoothstep(-0.15, 0.6, dot(normalize(vNormal), normalize(uSun)));
        float rim = pow(1.0 - max(dot(normalize(vNormal), vView), 0.0), 3.0);
        vec3 atmo = vec3(0.95, 0.6, 0.4) * rim * (0.25 + light);
        gl_FragColor = vec4(col * (0.015 + light * 0.62) + atmo * 0.7 + eyeGlow, 1.0);
      }`,
  });
}

function createRings(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { uInner: { value: PLANET_RADIUS * 1.35 }, uOuter: { value: PLANET_RADIUS * 2.3 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uInner;
      uniform float uOuter;
      varying vec3 vLocal;
      float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      void main() {
        float r = (length(vLocal.xy) - uInner) / (uOuter - uInner);
        float rings = 0.55 + 0.45 * sin(r * 140.0) * sin(r * 37.0 + 1.3);
        float gaps = smoothstep(0.0, 0.02, abs(r - 0.62)) * smoothstep(0.0, 0.01, abs(r - 0.3));
        float edge = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r);
        float grain = 0.8 + 0.2 * h(floor(r * 400.0));
        float a = rings * gaps * edge * grain * 0.38;
        gl_FragColor = vec4(vec3(0.85, 0.74, 0.6) * a, a);
      }`,
  });
}

function createSunSprite(): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.08, 'rgba(255,240,210,0.95)');
    g.addColorStop(0.25, 'rgba(255,190,120,0.35)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.position.copy(SUN_DIRECTION).multiplyScalar(1200);
  sprite.scale.setScalar(260);
  return sprite;
}

interface DebrisItem {
  radius: number;
  angle: number;
  speed: number;
  height: number;
  spin: Vector3;
  scale: number;
  rotation: Quaternion;
}

export class DebrisField {
  readonly mesh: InstancedMesh;
  private readonly items: DebrisItem[];
  private readonly dummy = new Object3D();
  private readonly tmpQ = new Quaternion();

  constructor(count: number, geometry?: BufferGeometry) {
    const rand = createRandomStream(404);
    const geo = geometry ?? DebrisField.rockGeometry();
    const mat = new MeshStandardMaterial({
      color: 0x5a5560,
      roughness: 0.9,
      metalness: 0.3,
      flatShading: !geometry,
    });
    this.mesh = new InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.items = Array.from({ length: count }, () => ({
      radius: 26 + rand() * 60,
      angle: rand() * Math.PI * 2,
      speed: (0.004 + rand() * 0.012) * (rand() < 0.5 ? 1 : -1) * 0.6,
      height: (rand() - 0.5) * 18 * (0.4 + rand()),
      spin: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8),
      scale: 0.15 + rand() ** 3 * 1.6,
      rotation: new Quaternion().setFromAxisAngle(
        new Vector3(rand(), rand(), rand()).normalize(),
        rand() * 6,
      ),
    }));
  }

  static rockGeometry(): BufferGeometry {
    const geo = new IcosahedronGeometry(1, 1);
    const pos = geo.getAttribute('position');
    const rand = createRandomStream(5);
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).multiplyScalar(0.7 + rand() * 0.6);
      pos.setXYZ(i, v.x, v.y * 0.7, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  update(dt: number): void {
    const m = new Matrix4();
    this.items.forEach((it, i) => {
      it.angle += it.speed * dt;
      this.tmpQ.setFromEuler(
        this.dummy.rotation.set(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt),
      );
      it.rotation.multiply(this.tmpQ);
      this.dummy.position.set(
        Math.cos(it.angle) * it.radius,
        it.height,
        Math.sin(it.angle) * it.radius,
      );
      this.dummy.quaternion.copy(it.rotation);
      this.dummy.scale.setScalar(it.scale);
      this.dummy.updateMatrix();
      m.copy(this.dummy.matrix);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Background {
  readonly group = new Group();
  private readonly sky: ShaderMaterial;
  private readonly stars: Points;
  private readonly planet: ShaderMaterial;
  private readonly planetMesh: Mesh;
  debris: DebrisField;

  constructor(starCount: number, debrisCount: number) {
    this.sky = createSky();
    this.group.add(new Mesh(new SphereGeometry(1800, 48, 24), this.sky));
    this.stars = createStars(starCount);
    this.group.add(this.stars);
    this.planet = createPlanetMaterial();
    this.planetMesh = new Mesh(new SphereGeometry(PLANET_RADIUS, 96, 64), this.planet);
    this.planetMesh.position.copy(PLANET_POSITION);
    this.planetMesh.rotation.z = 0.32;
    this.group.add(this.planetMesh);
    const rings = new Mesh(
      new RingGeometry(PLANET_RADIUS * 1.35, PLANET_RADIUS * 2.3, 160, 4),
      createRings(),
    );
    rings.position.copy(PLANET_POSITION);
    rings.rotation.set(Math.PI / 2 - 0.32, 0.18, 0);
    this.group.add(rings);
    this.group.add(createSunSprite());
    this.debris = new DebrisField(debrisCount);
    this.group.add(this.debris.mesh);
  }

  replaceDebris(geometry: BufferGeometry, count: number): void {
    this.group.remove(this.debris.mesh);
    this.debris.mesh.geometry.dispose();
    (this.debris.mesh.material as MeshStandardMaterial).dispose();
    this.debris.mesh.dispose();
    this.debris = new DebrisField(count, geometry);
    this.group.add(this.debris.mesh);
  }

  setPixelRatio(pr: number): void {
    (this.stars.material as ShaderMaterial).uniforms.uPixelRatio!.value = pr;
  }

  update(dt: number, time: number, storm: number): void {
    this.sky.uniforms.uTime!.value = time;
    (this.stars.material as ShaderMaterial).uniforms.uTime!.value = time;
    this.planet.uniforms.uTime!.value = time;
    this.planet.uniforms.uStorm!.value = storm;
    this.planetMesh.rotation.y += dt * 0.004;
    this.debris.update(dt);
  }
}
