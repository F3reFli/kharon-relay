/**
 * Visuels des modules : chaque type de module apparaît sur la station dès la première
 * unité et se densifie avec le nombre d'unités possédées.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { createRandomStream } from '../../core/rng';
import type { ModuleId } from '../../core/types';
import { PLANET_POSITION } from '../background';
import type { StationMaterials } from './materials';

const ALERT = new Color(0xff2030);

/** Les instances bougent et leur nombre varie : la sphère englobante (calculée une fois) serait fausse. */
function noCulling<T extends InstancedMesh>(mesh: T): T {
  mesh.frustumCulled = false;
  return mesh;
}

export abstract class ModuleVisual {
  readonly group = new Group();
  readonly anchor = new Vector3();
  protected count = 0;
  protected alert = false;
  protected readonly glows: MeshBasicMaterial[] = [];
  private readonly baseColors = new Map<MeshBasicMaterial, Color>();

  constructor(readonly id: ModuleId) {
    this.group.visible = false;
  }

  protected glow(
    mats: StationMaterials,
    key: 'glowCyan' | 'glowOrange' | 'glowMagenta',
  ): MeshBasicMaterial {
    const m = mats[key].clone();
    this.glows.push(m);
    this.baseColors.set(m, m.color.clone());
    return m;
  }

  setCount(n: number): void {
    this.count = n;
    this.group.visible = n > 0;
    this.layout(n);
  }

  setAlert(on: boolean): void {
    this.alert = on;
    if (!on) this.glows.forEach((m) => m.color.copy(this.baseColors.get(m) ?? m.color));
  }

  update(dt: number, time: number): void {
    if (this.alert) {
      const flick = Math.sin(time * 14) > 0 ? 1 : 0.25;
      this.glows.forEach((m) => m.color.copy(ALERT).multiplyScalar(flick));
    }
    this.animate(dt, time);
  }

  protected abstract layout(n: number): void;
  protected abstract animate(dt: number, time: number): void;
}

class CapacitorBank extends ModuleVisual {
  private readonly units: Group[] = [];
  private readonly band: MeshBasicMaterial;

  constructor(mats: StationMaterials) {
    super('capacitor');
    this.anchor.set(1.5, -3.4, 0);
    this.band = this.glow(mats, 'glowCyan');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const unit = new Group();
      const body = new Mesh(new CylinderGeometry(0.2, 0.2, 1.05, 12), mats.hullDark);
      const ring = new Mesh(new CylinderGeometry(0.205, 0.205, 0.12, 12), this.band);
      ring.position.y = 0.2;
      unit.add(body, ring);
      unit.position.set(Math.cos(a) * 1.42, -3.4, Math.sin(a) * 1.42);
      this.units.push(unit);
      this.group.add(unit);
    }
  }

  protected layout(n: number): void {
    this.units.forEach((u, i) => (u.visible = i < Math.min(12, Math.ceil(n / 2))));
  }

  protected animate(_dt: number, time: number): void {
    if (!this.alert) this.band.opacity = 0.55 + 0.45 * Math.sin(time * 2.2);
  }
}

class SolarArrays extends ModuleVisual {
  private readonly panels: InstancedMesh;
  private readonly arms: Group;

  constructor(mats: StationMaterials) {
    super('solar');
    this.anchor.set(5, 7, 0);
    this.arms = new Group();
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(11.5, 0.12, 0.12), mats.truss);
      arm.position.set(side * 6.6, 7, 0);
      this.arms.add(arm);
    }
    this.group.add(this.arms);
    this.panels = noCulling(new InstancedMesh(new BoxGeometry(0.72, 0.04, 1.9), mats.solar, 24));
    const dummy = new Object3D();
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      const k = Math.floor(i / 2);
      dummy.position.set(side * (1.6 + k * 0.85), 7, 0);
      dummy.rotation.set(0.35, 0, 0);
      dummy.updateMatrix();
      this.panels.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(this.panels);
  }

  protected layout(n: number): void {
    this.panels.count = Math.min(24, Math.max(2, Math.ceil(n / 1.5)));
  }

  protected animate(_dt: number, time: number): void {
    this.arms.rotation.x = Math.sin(time * 0.05) * 0.1;
    this.panels.rotation.x = this.arms.rotation.x;
  }
}

interface Orbit {
  radius: number;
  speed: number;
  phase: number;
  tilt: number;
  bob: number;
}

class DroneSwarm extends ModuleVisual {
  private readonly bodies: InstancedMesh;
  private readonly lights: InstancedMesh;
  private readonly orbits: Orbit[];
  private readonly dummy = new Object3D();
  private custom: Object3D[] = [];

  constructor(mats: StationMaterials) {
    super('drone');
    this.anchor.set(0, 0, 11);
    const rand = createRandomStream(77);
    this.orbits = Array.from({ length: 24 }, () => ({
      radius: 9.5 + rand() * 6,
      speed: (0.15 + rand() * 0.25) * (rand() < 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.9,
      bob: rand() * 6,
    }));
    const body = new OctahedronGeometry(0.22, 0);
    body.scale(1.6, 0.6, 1);
    this.bodies = noCulling(new InstancedMesh(body, mats.truss, 24));
    this.lights = noCulling(
      new InstancedMesh(new SphereGeometry(0.06, 6, 6), this.glow(mats, 'glowOrange'), 24),
    );
    this.group.add(this.bodies, this.lights);
  }

  /** Remplace le maillage procédural par un modèle Meshy (clonné par drone). */
  useModel(model: Object3D): void {
    this.bodies.visible = false;
    this.custom = this.orbits.map(() => model.clone(true));
    this.custom.forEach((c) => this.group.add(c));
    this.layout(this.count);
  }

  protected layout(n: number): void {
    const visible = Math.min(24, n);
    this.bodies.count = visible;
    this.lights.count = visible;
    this.custom.forEach((c, i) => (c.visible = i < visible));
  }

  protected animate(_dt: number, time: number): void {
    const visible = Math.min(24, this.count);
    for (let i = 0; i < visible; i++) {
      const o = this.orbits[i] as Orbit;
      const a = o.phase + time * o.speed;
      const p = this.dummy.position.set(
        Math.cos(a) * o.radius,
        Math.sin(a * 2 + o.bob) * 1.2 + Math.sin(a) * o.tilt * o.radius * 0.3,
        Math.sin(a) * o.radius,
      );
      this.dummy.rotation.set(0, -a + (o.speed > 0 ? 0 : Math.PI), 0);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      const custom = this.custom[i];
      if (custom) {
        custom.position.copy(p);
        custom.rotation.copy(this.dummy.rotation);
      }
      this.dummy.position.y += 0.12;
      this.dummy.updateMatrix();
      this.lights.setMatrixAt(i, this.dummy.matrix);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
  }
}

class DataCore extends ModuleVisual {
  private readonly racks: InstancedMesh;
  private readonly leds: InstancedMesh;
  private readonly ledColor = new Color();

  constructor(mats: StationMaterials) {
    super('datacore');
    this.anchor.set(2.1, -5, 0);
    const dummy = new Object3D();
    this.racks = noCulling(new InstancedMesh(new BoxGeometry(0.42, 1.5, 0.34), mats.hullDark, 12));
    this.leds = noCulling(
      new InstancedMesh(
        new BoxGeometry(0.3, 0.05, 0.02),
        new MeshBasicMaterial({ color: 0xffffff }),
        36,
      ),
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 2.05, -5, Math.sin(a) * 2.05);
      dummy.lookAt(0, -5, 0);
      dummy.updateMatrix();
      this.racks.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        dummy.position.set(Math.cos(a) * 1.86, -5.4 + k * 0.4, Math.sin(a) * 1.86);
        dummy.updateMatrix();
        this.leds.setMatrixAt(i * 3 + k, dummy.matrix);
        this.leds.setColorAt(i * 3 + k, this.ledColor.set(0x33ff88));
      }
    }
    this.group.add(this.racks, this.leds);
  }

  protected layout(n: number): void {
    const racks = Math.min(12, Math.ceil(n / 2));
    this.racks.count = racks;
    this.leds.count = racks * 3;
  }

  protected animate(_dt: number, time: number): void {
    const step = Math.floor(time * 8);
    for (let i = 0; i < this.leds.count; i++) {
      const on = (i * 7919 + step * 31) % 11 > 3;
      const hue = this.alert ? 0 : i % 5 === 0 ? 0.08 : 0.38;
      this.ledColor.setHSL(hue, 1, on ? 0.55 : 0.08);
      this.leds.setColorAt(i, this.ledColor);
    }
    if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
  }
}

class FusionCells extends ModuleVisual {
  private readonly cells: Group[] = [];
  private readonly plasma: MeshBasicMaterial;

  constructor(mats: StationMaterials) {
    super('fusion');
    this.anchor.set(2.2, 3.6, 0);
    this.plasma = this.glow(mats, 'glowOrange');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cell = new Group();
      const core = new Mesh(new SphereGeometry(0.3, 16, 12), this.plasma);
      const cage = new Mesh(new TorusGeometry(0.42, 0.05, 6, 24), mats.truss);
      const cage2 = cage.clone();
      cage2.rotation.y = Math.PI / 2;
      cell.add(core, cage, cage2);
      cell.position.set(Math.cos(a) * 2.15, 3.6, Math.sin(a) * 2.15);
      this.cells.push(cell);
      this.group.add(cell);
    }
  }

  protected layout(n: number): void {
    this.cells.forEach((c, i) => (c.visible = i < Math.min(6, Math.ceil(n / 3))));
  }

  protected animate(dt: number, time: number): void {
    this.cells.forEach((c, i) => {
      c.rotation.y += dt * (0.8 + i * 0.1);
      c.children[0]?.scale.setScalar(0.85 + 0.2 * Math.sin(time * 5 + i));
    });
  }
}

class RelayDish extends ModuleVisual {
  private readonly dish: Group;
  private readonly signal: MeshBasicMaterial;

  constructor(mats: StationMaterials) {
    super('relay');
    this.anchor.set(0, 9.6, 0);
    this.dish = new Group();
    const profile = Array.from(
      { length: 14 },
      (_, i) => new Vector2(i * 0.2, (i * 0.2) ** 2 * 0.22),
    );
    const bowlMat = mats.hull.clone();
    bowlMat.side = DoubleSide;
    const bowl = new Mesh(new LatheGeometry(profile, 48), bowlMat);
    const feed = new Mesh(new CylinderGeometry(0.05, 0.05, 1.6, 6), mats.truss);
    feed.position.y = 0.8;
    this.signal = this.glow(mats, 'glowCyan');
    const tip = new Mesh(new SphereGeometry(0.12, 10, 8), this.signal);
    tip.position.y = 1.65;
    this.dish.add(bowl, feed, tip);
    this.dish.position.set(0, 9.4, 0);
    this.dish.lookAt(PLANET_POSITION);
    this.dish.rotateX(Math.PI / 2);
    this.group.add(this.dish);
  }

  useModel(model: Object3D): void {
    this.dish.children.slice(0, 2).forEach((c) => (c.visible = false));
    this.dish.add(model);
  }

  protected layout(n: number): void {
    this.dish.scale.setScalar(0.8 + Math.min(0.5, n * 0.02));
  }

  protected animate(_dt: number, time: number): void {
    if (!this.alert) this.signal.opacity = Math.sin(time * 1.5) > 0.7 ? 1 : 0.25;
  }
}

class Foundry extends ModuleVisual {
  private readonly vents: MeshBasicMaterial;

  constructor(mats: StationMaterials) {
    super('foundry');
    this.anchor.set(0, -9.3, 1.3);
    const block = new Mesh(new BoxGeometry(2.4, 1.4, 2.4), mats.hull);
    block.position.y = -9.3;
    this.vents = this.glow(mats, 'glowOrange');
    const group = new Group();
    for (let i = 0; i < 4; i++) {
      const vent = new Mesh(new BoxGeometry(1.8, 0.08, 0.02), this.vents);
      vent.position.set(0, -9.6 + i * 0.18, 1.21);
      group.add(vent);
    }
    const chimney = new Mesh(new CylinderGeometry(0.18, 0.24, 1.2, 10), mats.hullDark);
    chimney.position.set(0.8, -8.1, -0.6);
    this.group.add(block, group, chimney);
  }

  protected layout(): void {}

  protected animate(_dt: number, time: number): void {
    if (!this.alert) this.vents.opacity = 0.6 + 0.4 * Math.sin(time * 3 + Math.sin(time * 7));
  }
}

class Siphon extends ModuleVisual {
  private readonly beam: ShaderMaterial;

  constructor(mats: StationMaterials) {
    super('siphon');
    this.anchor.set(0, -10.5, 0);
    const start = new Vector3(0, -10.4, 0);
    const length = start.distanceTo(PLANET_POSITION) - 140;
    this.beam = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0.3 }, uAlert: { value: 0 } },
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uStrength; uniform float uAlert; varying vec2 vUv;
        void main() {
          float pulses = 0.5 + 0.5 * sin(vUv.y * 160.0 + uTime * 12.0);
          float core = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
          vec3 col = mix(vec3(0.45, 0.6, 1.0), vec3(1.0, 0.15, 0.2), uAlert);
          float a = core * (0.25 + 0.75 * pulses) * uStrength * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    const beam = new Mesh(new CylinderGeometry(0.18, 0.5, length, 8, 1, true), this.beam);
    beam.position.copy(start).lerp(PLANET_POSITION, length / 2 / start.distanceTo(PLANET_POSITION));
    beam.lookAt(PLANET_POSITION);
    beam.rotateX(Math.PI / 2);
    const emitter = new Mesh(new TorusGeometry(0.6, 0.1, 8, 24), this.glow(mats, 'glowCyan'));
    emitter.position.copy(start);
    emitter.lookAt(PLANET_POSITION);
    this.group.add(beam, emitter);
  }

  protected layout(n: number): void {
    this.beam.uniforms.uStrength!.value = 0.35 + Math.min(0.65, n * 0.03);
  }

  protected animate(_dt: number, time: number): void {
    this.beam.uniforms.uTime!.value = time;
    this.beam.uniforms.uAlert!.value = this.alert ? 1 : 0;
  }
}

class Lattice extends ModuleVisual {
  private readonly cubes: LineSegments[] = [];

  constructor() {
    super('lattice');
    this.anchor.set(4.4, 2.9, 0);
    const geo = new EdgesGeometry(new BoxGeometry(0.42, 0.42, 0.42));
    for (let i = 0; i < 27; i++) {
      const mat = new LineBasicMaterial({
        color: new Color().setHSL(0.75 + (i % 3) * 0.05, 0.9, 0.65),
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
      });
      const cube = new LineSegments(geo, mat);
      this.cubes.push(cube);
      this.group.add(cube);
    }
  }

  protected layout(n: number): void {
    this.cubes.forEach((c, i) => (c.visible = i < Math.min(27, n)));
  }

  protected animate(dt: number, time: number): void {
    this.cubes.forEach((c, i) => {
      const a = (i / 27) * Math.PI * 2 + time * 0.12;
      c.position.set(Math.cos(a) * 4.4, 2.9 + Math.sin(a * 3 + time) * 0.35, Math.sin(a) * 4.4);
      c.rotation.x += dt * 0.6;
      c.rotation.y += dt * 0.4;
      const m = c.material as LineBasicMaterial;
      m.color.setHSL(this.alert ? 0 : 0.75 + (i % 3) * 0.05, 0.9, 0.65);
    });
  }
}

class Antimatter extends ModuleVisual {
  private readonly rings: Mesh[] = [];
  private readonly bottle: Group;

  constructor(mats: StationMaterials) {
    super('antimatter');
    this.anchor.set(3.6, -6.2, 0);
    this.bottle = new Group();
    this.bottle.position.copy(this.anchor);
    const core = new Mesh(new SphereGeometry(0.5, 20, 16), this.glow(mats, 'glowMagenta'));
    this.bottle.add(core);
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new TorusGeometry(0.85, 0.06, 8, 40), mats.truss);
      ring.rotation.set(i * 1.05, i * 0.6, 0);
      this.rings.push(ring);
      this.bottle.add(ring);
    }
    const strut = new Mesh(new BoxGeometry(2.6, 0.12, 0.12), mats.truss);
    strut.position.set(2.2, -6.2, 0);
    this.group.add(this.bottle, strut);
  }

  protected layout(n: number): void {
    this.bottle.scale.setScalar(0.9 + Math.min(0.5, n * 0.03));
  }

  protected animate(dt: number, time: number): void {
    this.rings.forEach((r, i) => {
      r.rotation.x += dt * (1.2 + i * 0.4);
      r.rotation.y += dt * 0.7;
    });
    this.bottle.children[0]?.scale.setScalar(0.9 + 0.12 * Math.sin(time * 7));
  }
}

export function createModuleVisuals(mats: StationMaterials): ModuleVisual[] {
  return [
    new CapacitorBank(mats),
    new SolarArrays(mats),
    new DroneSwarm(mats),
    new DataCore(mats),
    new FusionCells(mats),
    new RelayDish(mats),
    new Foundry(mats),
    new Siphon(mats),
    new Lattice(),
    new Antimatter(mats),
  ];
}

export { DroneSwarm, RelayDish };
