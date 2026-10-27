/**
 * Structure fixe de la station : épine dorsale, cage du réacteur, sections empilées,
 * anneau d'habitation rotatif (hublots, rayons, capsules de sauvetage) et mât d'antenne.
 */

import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import type { StationMaterials } from './materials';

export const RING_RADIUS = 7.6;
const WINDOW_COUNT = 96;

function cylinder(r: number, h: number, mat: Material, segments = 16): Mesh {
  return new Mesh(new CylinderGeometry(r, r, h, segments), mat);
}

function addCage(group: Group, mats: StationMaterials): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const strut = new Mesh(new BoxGeometry(0.1, 5.4, 0.1), mats.truss);
    strut.position.set(Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3);
    group.add(strut);
  }
  for (const y of [-2.7, 2.7]) {
    const ring = new Mesh(new TorusGeometry(3.3, 0.12, 8, 56), mats.hullDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
}

function addStacks(group: Group, mats: StationMaterials): void {
  const spine = cylinder(0.5, 22, mats.truss, 12);
  group.add(spine);
  const upper: Array<[number, number, number]> = [
    [3.6, 1.25, 1.4],
    [5.3, 1.55, 1.8],
    [7.0, 1.1, 1.2],
  ];
  const lower: Array<[number, number, number]> = [
    [-3.4, 1.0, 1.0],
    [-5.0, 1.45, 2.0],
    [-7.2, 1.15, 1.6],
  ];
  [...upper, ...lower].forEach(([y, r, h]) => {
    const mod = cylinder(r, h, mats.hull, 20);
    mod.position.y = y;
    group.add(mod);
    const collar = new Mesh(new TorusGeometry(r + 0.05, 0.08, 6, 32), mats.hullDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y + h / 2;
    group.add(collar);
  });
  for (let i = 0; i < 4; i++) {
    const box = new Mesh(new BoxGeometry(1.4, 0.8, 0.9), mats.hull);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    box.position.set(Math.cos(a) * 1.9, 5.3, Math.sin(a) * 1.9);
    box.rotation.y = -a;
    group.add(box);
  }
}

export class HabitatRing {
  readonly group = new Group();
  private readonly windows: InstancedMesh;
  private readonly windowMat;
  private lit = 0;

  constructor(mats: StationMaterials) {
    const torus = new Mesh(new TorusGeometry(RING_RADIUS, 0.55, 14, 96), mats.hull);
    torus.rotation.x = Math.PI / 2;
    this.group.add(torus);
    for (let i = 0; i < 4; i++) {
      const spoke = cylinder(0.14, RING_RADIUS - 0.4, mats.truss, 8);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (i / 4) * Math.PI * 2;
      spoke.position.set(
        Math.cos((i / 4) * Math.PI * 2) * (RING_RADIUS / 2),
        0,
        -Math.sin((i / 4) * Math.PI * 2) * (RING_RADIUS / 2),
      );
      this.group.add(spoke);
    }
    this.windowMat = mats.window.clone();
    this.windows = new InstancedMesh(
      new BoxGeometry(0.22, 0.14, 0.05),
      this.windowMat,
      WINDOW_COUNT,
    );
    const dummy = new Object3D();
    for (let i = 0; i < WINDOW_COUNT; i++) {
      const a = (i / WINDOW_COUNT) * Math.PI * 2;
      dummy.position.set(
        Math.cos(a) * (RING_RADIUS + 0.56),
        i % 2 ? 0.16 : -0.16,
        Math.sin(a) * (RING_RADIUS + 0.56),
      );
      dummy.lookAt(Math.cos(a) * 20, dummy.position.y, Math.sin(a) * 20);
      dummy.updateMatrix();
      this.windows.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(this.windows);
    this.addEscapePods(mats);
  }

  /** Les sept capsules de sauvetage, toujours amarrées. */
  private addEscapePods(mats: StationMaterials): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const pod = new Mesh(new CapsuleGeometry(0.22, 0.5, 4, 10), mats.hullDark);
      pod.position.set(Math.cos(a) * RING_RADIUS, -0.75, Math.sin(a) * RING_RADIUS);
      this.group.add(pod);
      const light = new Mesh(new SphereGeometry(0.05, 6, 6), mats.glowCyan);
      light.position.set(pod.position.x, -1.12, pod.position.z);
      this.group.add(light);
    }
  }

  setPower(p: number): void {
    this.lit = p;
  }

  update(dt: number, time: number): void {
    this.group.rotation.y += dt * 0.05;
    this.windowMat.emissiveIntensity = 0.15 + this.lit * 2.2 + Math.sin(time * 3) * 0.05 * this.lit;
  }
}

export class Mast {
  readonly group = new Group();
  private readonly beacon: Mesh;

  constructor(mats: StationMaterials) {
    const mast = cylinder(0.08, 4.5, mats.truss, 6);
    mast.position.y = 10.2;
    this.group.add(mast);
    for (let i = 0; i < 3; i++) {
      const arm = new Mesh(new BoxGeometry(1.4 - i * 0.35, 0.05, 0.05), mats.truss);
      arm.position.y = 9.2 + i * 1.1;
      arm.rotation.y = i * 0.9;
      this.group.add(arm);
    }
    this.beacon = new Mesh(new SphereGeometry(0.12, 8, 8), mats.beacon);
    this.beacon.position.y = 12.55;
    this.group.add(this.beacon);
  }

  update(time: number): void {
    const on = Math.sin(time * 2.4) > 0.6;
    this.beacon.visible = on;
  }
}

export function buildStructure(mats: StationMaterials): Group {
  const group = new Group();
  addCage(group, mats);
  addStacks(group, mats);
  return group;
}
