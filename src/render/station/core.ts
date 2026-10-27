/** Cœur du réacteur : sphère de plasma déformée par bruit, coque filaire et anneaux orbitaux. */

import {
  AdditiveBlending,
  Color,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { NOISE_GLSL } from '../shaders/noise';

const CORE_RADIUS = 1.9;

function coreMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uPulse: { value: 0 },
      uAlert: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPower;
      uniform float uPulse;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;
      ${NOISE_GLSL}
      void main() {
        float n = snoise(normal * 1.8 + vec3(uTime * 0.35));
        float n2 = snoise(normal * 5.0 - vec3(uTime * 0.6));
        vNoise = n * 0.7 + n2 * 0.3;
        vec3 displaced = position + normal * (vNoise * (0.08 + 0.12 * uPower) + uPulse * 0.18);
        vec4 world = modelMatrix * vec4(displaced, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPower;
      uniform float uPulse;
      uniform float uAlert;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vNoise;
      void main() {
        float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
        vec3 dim = vec3(0.9, 0.22, 0.08);
        vec3 mid = vec3(1.0, 0.62, 0.2);
        vec3 hot = vec3(0.35, 0.95, 1.0);
        vec3 base = mix(mix(dim, mid, smoothstep(0.0, 0.45, uPower)), hot, smoothstep(0.4, 1.0, uPower));
        vec3 alert = vec3(1.0, 0.1, 0.12) * (0.5 + 0.5 * sin(uTime * 9.0));
        base = mix(base, alert, uAlert * 0.55);
        float veins = smoothstep(0.15, 0.6, vNoise);
        vec3 col = base * (0.3 + 0.85 * veins) + base * fres * 1.5 + vec3(1.0) * uPulse * 0.45;
        gl_FragColor = vec4(col * (0.4 + uPower * 0.7), 1.0);
      }`,
  });
}

export class ReactorCore {
  readonly group = new Group();
  readonly hitMesh: Mesh;
  private readonly visual: Mesh;
  private readonly material: ShaderMaterial;
  private readonly shell: LineSegments;
  private readonly rings: Mesh[];
  private readonly light: PointLight;
  private power = 0;
  private pulse = 0;
  private hover = 0;
  private hoverTarget = 0;
  private alert = 0;

  constructor() {
    this.material = coreMaterial();
    this.visual = new Mesh(new IcosahedronGeometry(CORE_RADIUS, 24), this.material);
    this.group.add(this.visual);
    // Cible de sélection légère et invisible : le raycast ne parcourt pas les 12 k triangles.
    this.hitMesh = new Mesh(
      new SphereGeometry(CORE_RADIUS * 1.08, 16, 12),
      new MeshBasicMaterial(),
    );
    this.hitMesh.visible = false;
    this.hitMesh.name = 'reactor-core';
    this.group.add(this.hitMesh);

    const shellGeo = new EdgesGeometry(new IcosahedronGeometry(CORE_RADIUS * 1.42, 1));
    this.shell = new LineSegments(
      shellGeo,
      new LineBasicMaterial({
        color: 0x66e0ff,
        transparent: true,
        opacity: 0.45,
        blending: AdditiveBlending,
      }),
    );
    this.group.add(this.shell);

    this.rings = [0, 1, 2].map((i) => {
      const ring = new Mesh(
        new TorusGeometry(CORE_RADIUS * (1.75 + i * 0.22), 0.025, 6, 160),
        new MeshBasicMaterial({
          color: new Color().setHSL(0.52 - i * 0.04, 0.9, 0.6),
          transparent: true,
          opacity: 0.8,
          blending: AdditiveBlending,
        }),
      );
      ring.rotation.set(Math.PI / 2 + i * 0.6, i * 0.9, 0);
      this.group.add(ring);
      return ring;
    });

    this.light = new PointLight(0x66ddff, 20, 40, 1.6);
    this.group.add(this.light);
  }

  setPower(p: number): void {
    this.power = Math.min(1, Math.max(0, p));
  }

  setAlert(level: number): void {
    this.alert = level;
  }

  setHover(on: boolean): void {
    this.hoverTarget = on ? 1 : 0;
  }

  kick(strength: number): void {
    this.pulse = Math.min(1.4, this.pulse + strength);
  }

  update(dt: number, time: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.hover += (this.hoverTarget - this.hover) * Math.min(1, dt * 10);
    const u = this.material.uniforms;
    u.uTime!.value = time;
    u.uPower!.value = 0.25 + this.power * 0.75;
    u.uPulse!.value = this.pulse;
    u.uAlert!.value = this.alert;
    const s = 1 + this.hover * 0.06 + this.pulse * 0.08;
    this.visual.scale.setScalar(s);
    this.shell.rotation.y += dt * (0.15 + this.power * 0.5);
    this.shell.rotation.x += dt * 0.07;
    this.rings.forEach((r, i) => {
      r.rotation.z += dt * (0.3 + i * 0.25) * (0.4 + this.power) * (i % 2 ? -1 : 1);
    });
    const hue = this.alert > 0.5 ? 0.0 : 0.52 - (1 - this.power) * 0.45;
    this.light.color.setHSL(hue, 0.85, 0.6);
    this.light.intensity = 6 + this.power * 30 + this.pulse * 35;
  }
}
