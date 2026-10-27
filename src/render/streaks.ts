/** Traînées lumineuses (météores, vent solaire, étoiles filantes) : segments additifs en pool. */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';

const MAX_STREAKS = 220;

export interface StreakSpec {
  readonly origin: Vector3;
  readonly velocity: Vector3;
  readonly length: number;
  readonly life: number;
  readonly color: number;
  readonly brightness?: number;
}

export class Streaks {
  readonly mesh: LineSegments;
  private readonly positions = new Float32Array(MAX_STREAKS * 6);
  private readonly colors = new Float32Array(MAX_STREAKS * 6);
  private readonly heads = Array.from({ length: MAX_STREAKS }, () => new Vector3());
  private readonly velocities = Array.from({ length: MAX_STREAKS }, () => new Vector3());
  private readonly lengths = new Float32Array(MAX_STREAKS);
  private readonly life = new Float32Array(MAX_STREAKS);
  private readonly maxLife = new Float32Array(MAX_STREAKS);
  private readonly tints = Array.from({ length: MAX_STREAKS }, () => new Color());
  private readonly tail = new Vector3();
  private cursor = 0;
  private alive = 0;

  constructor() {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    geo.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    this.mesh = new LineSegments(
      geo,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  spawn(spec: StreakSpec): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_STREAKS;
    this.heads[i]?.copy(spec.origin);
    this.velocities[i]?.copy(spec.velocity);
    this.lengths[i] = spec.length;
    this.life[i] = spec.life;
    this.maxLife[i] = spec.life;
    this.tints[i]?.set(spec.color).multiplyScalar(spec.brightness ?? 1);
    this.alive = Math.max(this.alive, 1);
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < MAX_STREAKS; i++) {
      const head = this.heads[i] as Vector3;
      const vel = this.velocities[i] as Vector3;
      const left = (this.life[i] ?? 0) - dt;
      this.life[i] = left;
      if (left <= 0) {
        this.colors.fill(0, i * 6, i * 6 + 6);
        continue;
      }
      alive++;
      head.addScaledVector(vel, dt);
      // Apparition et extinction en douceur sur la durée de vie.
      const k = left / (this.maxLife[i] || 1);
      const fade = Math.min(1, k * 3) * Math.min(1, (1 - k) * 6 + 0.2);
      this.tail
        .copy(vel)
        .normalize()
        .multiplyScalar(-(this.lengths[i] ?? 1))
        .add(head);
      const o = i * 6;
      const c = this.tints[i] as Color;
      this.positions[o] = head.x;
      this.positions[o + 1] = head.y;
      this.positions[o + 2] = head.z;
      this.positions[o + 3] = this.tail.x;
      this.positions[o + 4] = this.tail.y;
      this.positions[o + 5] = this.tail.z;
      this.colors[o] = c.r * fade;
      this.colors[o + 1] = c.g * fade;
      this.colors[o + 2] = c.b * fade;
      this.colors[o + 3] = 0;
      this.colors[o + 4] = 0;
      this.colors[o + 5] = 0;
    }
    this.alive = alive;
    this.mesh.geometry.attributes.position!.needsUpdate = true;
    this.mesh.geometry.attributes.color!.needsUpdate = true;
  }
}
