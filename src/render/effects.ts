/** Effets ponctuels : gerbes de particules et ondes de choc (pools pré-alloués). */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

const MAX_PARTICLES = 1200;
const MAX_WAVES = 8;

/** Particules additives dont la taille et l'opacité suivent leur durée de vie restante. */
function createParticleMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float life;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vLife;
      void main() {
        vColor = color;
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(0.0, life) * 9.0 * uPixelRatio * (12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vLife;
      void main() {
        if (vLife <= 0.0) discard;
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLife;
        gl_FragColor = vec4(vColor * a * 2.0, a);
      }`,
  });
}

function createWaveMesh(): Mesh {
  const mesh = new Mesh(
    new RingGeometry(0.9, 1, 64),
    new MeshBasicMaterial({
      color: 0x77eeff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.visible = false;
  return mesh;
}

export class Effects {
  readonly group = new Group();
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new BufferGeometry();
  private cursor = 0;
  private readonly waves: Array<{ mesh: Mesh; t: number; scale: number }> = [];
  private readonly tmpColor = new Color();
  private readonly material: ShaderMaterial;

  constructor() {
    const dynamic = (array: Float32Array, size: number) =>
      new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', dynamic(this.positions, 3));
    this.geometry.setAttribute('color', dynamic(this.colors, 3));
    this.geometry.setAttribute('life', dynamic(this.life, 1));
    this.material = createParticleMaterial();
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    this.group.add(points);
    for (let i = 0; i < MAX_WAVES; i++) {
      const mesh = createWaveMesh();
      this.waves.push({ mesh, t: 1, scale: 1 });
      this.group.add(mesh);
    }
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms.uPixelRatio!.value = pr;
  }

  burst(origin: Vector3, count: number, color: number, speed = 6, spread = 1): void {
    this.tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const dir = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      const v = speed * (0.3 + Math.random() * 0.7);
      this.positions.set(
        [origin.x + dir.x * spread, origin.y + dir.y * spread, origin.z + dir.z * spread],
        i * 3,
      );
      this.velocities.set([dir.x * v, dir.y * v, dir.z * v], i * 3);
      const tint = 0.75 + Math.random() * 0.25;
      this.colors.set(
        [this.tmpColor.r * tint, this.tmpColor.g * tint, this.tmpColor.b * tint],
        i * 3,
      );
      this.life[i] = 0.6 + Math.random() * 0.4;
    }
  }

  shockwave(origin: Vector3, normal: Vector3, color: number, scale = 6): void {
    const wave = this.waves.find((w) => w.t >= 1) ?? this.waves[0];
    if (!wave) return;
    wave.t = 0;
    wave.scale = scale;
    wave.mesh.visible = true;
    wave.mesh.position.copy(origin);
    wave.mesh.lookAt(origin.clone().add(normal));
    (wave.mesh.material as MeshBasicMaterial).color.set(color);
  }

  update(dt: number): void {
    let alive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) continue;
      alive = true;
      this.life[i] = l - dt * 1.1;
      const damp = 1 - dt * 1.5;
      for (let k = 0; k < 3; k++) {
        const idx = i * 3 + k;
        this.velocities[idx] = (this.velocities[idx] ?? 0) * damp;
        this.positions[idx] = (this.positions[idx] ?? 0) + (this.velocities[idx] ?? 0) * dt;
      }
    }
    if (alive) {
      this.geometry.attributes.position!.needsUpdate = true;
      this.geometry.attributes.life!.needsUpdate = true;
      this.geometry.attributes.color!.needsUpdate = true;
    }
    this.waves.forEach((w) => {
      if (w.t >= 1) return;
      w.t = Math.min(1, w.t + dt * 1.8);
      const s = 0.5 + w.t * w.scale;
      w.mesh.scale.setScalar(s);
      (w.mesh.material as MeshBasicMaterial).opacity = (1 - w.t) * 0.85;
      if (w.t >= 1) w.mesh.visible = false;
    });
  }
}
