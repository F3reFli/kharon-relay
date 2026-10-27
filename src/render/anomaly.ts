/** Paquet de données dérivant : octaèdre lumineux avec traînée, à intercepter d'un clic. */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { createRandomStream } from '../core/rng';
import type { Anomaly } from '../core/types';

const TRAIL = 40;

export class AnomalyPacket {
  readonly group = new Group();
  readonly hitMesh: Mesh;
  private curve: CatmullRomCurve3 | null = null;
  private current: Anomaly | null = null;
  private readonly trail: Line;
  private readonly trailPositions = new Float32Array(TRAIL * 3);
  private readonly wire: LineSegments;

  constructor() {
    this.hitMesh = new Mesh(
      new OctahedronGeometry(0.55, 0),
      new MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
      }),
    );
    this.hitMesh.name = 'anomaly';
    this.wire = new LineSegments(
      new EdgesGeometry(new OctahedronGeometry(0.85, 0)),
      new LineBasicMaterial({ color: 0xfff3b0, blending: AdditiveBlending, transparent: true }),
    );
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.trailPositions, 3));
    this.trail = new Line(
      geo,
      new LineBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
      }),
    );
    this.trail.frustumCulled = false;
    this.group.add(this.hitMesh, this.wire, this.trail);
    this.group.visible = false;
  }

  sync(anomaly: Anomaly | null): void {
    if (anomaly?.id === this.current?.id) return;
    this.current = anomaly;
    this.group.visible = anomaly !== null;
    if (!anomaly) return;
    const rand = createRandomStream(anomaly.seed);
    const side = rand() < 0.5 ? -1 : 1;
    const pts = [
      new Vector3(side * 40, (rand() - 0.5) * 20, -20 + rand() * 20),
      new Vector3(side * 14, (rand() - 0.5) * 8, 8 + rand() * 6),
      new Vector3(-side * 6, (rand() - 0.5) * 8, 10 + rand() * 6),
      new Vector3(-side * 40, (rand() - 0.5) * 20, -10 - rand() * 20),
    ];
    this.curve = new CatmullRomCurve3(pts);
    const start = pts[0] as Vector3;
    for (let i = 0; i < TRAIL; i++) this.trailPositions.set([start.x, start.y, start.z], i * 3);
  }

  /** Position monde actuelle (pour les effets de capture). */
  position(): Vector3 {
    return this.hitMesh.getWorldPosition(new Vector3());
  }

  update(dt: number, gameTime: number): void {
    if (!this.current || !this.curve) return;
    const span = this.current.expiresAt - this.current.spawnedAt;
    const t = Math.min(1, Math.max(0, (gameTime - this.current.spawnedAt) / span));
    const p = this.curve.getPointAt(t);
    this.hitMesh.position.copy(p);
    this.wire.position.copy(p);
    this.hitMesh.rotation.y += dt * 2.5;
    this.wire.rotation.x += dt * 1.3;
    this.wire.rotation.y -= dt * 1.7;
    this.trailPositions.copyWithin(3, 0, (TRAIL - 1) * 3);
    this.trailPositions.set([p.x, p.y, p.z], 0);
    this.trail.geometry.attributes.position!.needsUpdate = true;
  }
}
