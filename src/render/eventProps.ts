/** Accessoires 3D procéduraux des événements : cargo HÉLIX-9 et épave dérivante. */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { createRandomStream } from '../core/rng';

const glow = (color: number, opacity = 1): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });

const HULL = new MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.6, metalness: 0.7 });
const HULL_DARK = new MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.7, metalness: 0.6 });
const CONTAINER_COLORS = [0xb8572e, 0x2e6fb8, 0xc9a23a, 0x4e8a4a, 0x8a3a6e];

/** Cargo long à conteneurs, réacteurs à l'arrière, feux de position clignotants. */
export class Freighter {
  readonly group = new Group();
  private readonly engines: Mesh[] = [];
  private readonly navLights: Mesh[] = [];

  constructor() {
    const spine = new Mesh(new BoxGeometry(9, 0.45, 0.45), HULL);
    const bridge = new Mesh(new BoxGeometry(1.4, 1.1, 1.3), HULL);
    bridge.position.set(4.2, 0.45, 0);
    const windows = new Mesh(new BoxGeometry(0.05, 0.18, 1.0), glow(0x9fe8ff));
    windows.position.set(4.92, 0.7, 0);
    this.group.add(spine, bridge, windows);
    const rand = createRandomStream(9);
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        const color = CONTAINER_COLORS[Math.floor(rand() * CONTAINER_COLORS.length)] ?? 0x888888;
        const box = new Mesh(
          new BoxGeometry(0.95, 0.7, 0.62),
          new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.3 }),
        );
        box.position.set(-3.4 + i * 1.05, 0.05 + (rand() < 0.3 ? 0.72 : 0), side * 0.55);
        this.group.add(box);
      }
    }
    const nozzle = new CylinderGeometry(0.32, 0.45, 0.7, 10);
    for (const z of [-0.45, 0.45]) {
      const pod = new Mesh(nozzle, HULL_DARK);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(-4.8, 0, z);
      const flame = new Mesh(new SphereGeometry(0.42, 10, 8), glow(0x66ccff, 0.9));
      flame.position.set(-5.3, 0, z);
      flame.scale.set(1.8, 0.8, 0.8);
      this.engines.push(flame);
      this.group.add(pod, flame);
    }
    for (const [z, color] of [
      [-0.8, 0xff3030],
      [0.8, 0x30ff60],
    ] as const) {
      const light = new Mesh(new SphereGeometry(0.09, 6, 6), glow(color));
      light.position.set(0, 0.35, z);
      this.navLights.push(light);
      this.group.add(light);
    }
    this.group.scale.setScalar(1.8);
    this.group.visible = false;
  }

  /** Position monde de la tuyère (pour la traînée). */
  exhaust(target: Vector3): Vector3 {
    return target.set(-5.6, 0, 0).applyMatrix4(this.group.matrixWorld);
  }

  update(time: number, thrust: number): void {
    this.engines.forEach((e, i) => {
      e.scale.x = 1.4 + thrust * 2 + Math.sin(time * 30 + i) * 0.15;
    });
    const blink = Math.sin(time * 3.2) > 0.7;
    this.navLights.forEach((l) => {
      l.visible = blink;
    });
  }
}

/** Capsule de sauvetage d'un « autre » Kharon : coque cabossée, panneaux arrachés, balise rouge. */
export class Wreck {
  readonly group = new Group();
  private readonly beacon: Mesh;

  constructor() {
    const body = new Mesh(new CylinderGeometry(0.55, 0.55, 1.6, 12, 1, true), HULL_DARK);
    body.rotation.z = Math.PI / 2;
    const nose = new Mesh(new ConeGeometry(0.55, 0.8, 12), HULL);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 1.2;
    const ring = new Mesh(new CylinderGeometry(0.62, 0.62, 0.14, 12), HULL);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = -0.5;
    this.group.add(body, nose, ring);
    const rand = createRandomStream(77);
    for (let i = 0; i < 5; i++) {
      const plate = new Mesh(new BoxGeometry(0.5 + rand() * 0.5, 0.04, 0.35), HULL);
      const a = rand() * Math.PI * 2;
      plate.position.set(-1 + rand() * 1.5, Math.cos(a) * 0.75, Math.sin(a) * 0.75);
      plate.rotation.set(rand() * 2, rand() * 2, rand() * 2);
      this.group.add(plate);
    }
    this.beacon = new Mesh(new SphereGeometry(0.1, 8, 8), glow(0xff2a2a));
    this.beacon.position.set(-0.9, 0.6, 0);
    const halo = new Mesh(new SphereGeometry(0.35, 8, 8), glow(0xff2a2a, 0.25));
    this.beacon.add(halo);
    this.group.add(this.beacon);
    this.group.scale.setScalar(1.4);
    this.group.visible = false;
  }

  update(dt: number, time: number): void {
    this.group.rotation.x += dt * 0.35;
    this.group.rotation.y += dt * 0.12;
    this.beacon.visible = Math.sin(time * 4.5) > 0.2;
  }
}

/** Couleurs d'ambiance par visuel d'événement (reprises par le cœur et les effets). */
export const MOOD_COLORS = {
  resonance: new Color(1.0, 0.72, 0.22),
  ghost: new Color(0.72, 0.42, 1.0),
} as const;
