/** Assemblage de la station et synchronisation avec l'état du jeu. */

import { Box3, Group, Object3D, Vector3 } from 'three';
import type { GameState, ModuleId } from '../../core/types';
import { ReactorCore } from './core';
import { createStationMaterials } from './materials';
import { DroneSwarm, ModuleVisual, RelayDish, createModuleVisuals } from './modules';
import { HabitatRing, Mast, RING_RADIUS, buildStructure } from './structure';

/** Ramène un modèle importé à une taille cible, centré sur l'origine. */
export function normalizeModel(model: Object3D, targetSize: number): Object3D {
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z, 1e-6);
  const wrapper = new Group();
  model.position.sub(center);
  wrapper.add(model);
  wrapper.scale.setScalar(scale);
  return wrapper;
}

export class Station {
  readonly group = new Group();
  readonly core: ReactorCore;
  private readonly ring: HabitatRing;
  private readonly mast: Mast;
  private readonly visuals: Map<ModuleId, ModuleVisual>;
  private readonly counts = new Map<ModuleId, number>();

  constructor() {
    const mats = createStationMaterials();
    this.core = new ReactorCore();
    this.group.add(this.core.group);
    this.group.add(buildStructure(mats));
    this.ring = new HabitatRing(mats);
    this.group.add(this.ring.group);
    this.mast = new Mast(mats);
    this.group.add(this.mast.group);
    this.visuals = new Map(createModuleVisuals(mats).map((v) => [v.id, v]));
    this.visuals.forEach((v) => this.group.add(v.group));
    this.group.rotation.z = 0.08;
  }

  /** Puissance perçue (0..1) dérivée du nombre de types de modules actifs et de la production. */
  static powerLevel(state: GameState, energyRate: number): number {
    const typed = Object.values(state.modules).filter((m) => m.count > 0).length / 10;
    const rate = Math.min(1, Math.log10(1 + energyRate) / 7);
    return Math.min(1, 0.08 + typed * 0.5 + rate * 0.5);
  }

  sync(state: GameState, energyRate: number): void {
    const power = Station.powerLevel(state, energyRate);
    this.core.setPower(power);
    this.ring.setPower(power);
    let alerts = 0;
    this.visuals.forEach((visual, id) => {
      const ms = state.modules[id];
      if (this.counts.get(id) !== ms.count) {
        visual.setCount(ms.count);
        this.counts.set(id, ms.count);
      }
      const alert = ms.incident !== null;
      visual.setAlert(alert);
      if (alert) alerts++;
    });
    this.core.setAlert(alerts > 0 ? 1 : 0);
  }

  anchorOf(id: ModuleId): Vector3 {
    const v = this.visuals.get(id);
    return v ? v.anchor.clone().applyMatrix4(this.group.matrixWorld) : new Vector3();
  }

  /** Intègre les modèles Meshy disponibles dans leurs emplacements. */
  applyModels(models: ReadonlyMap<string, Object3D>): void {
    const hub = models.get('station_hub');
    if (hub) {
      const placed = normalizeModel(hub, 2.8);
      placed.position.set(0, 8.4, 0);
      this.group.add(placed);
    }
    const drone = models.get('drone');
    if (drone)
      (this.visuals.get('drone') as DroneSwarm | undefined)?.useModel(normalizeModel(drone, 0.7));
    const dish = models.get('relay_dish');
    if (dish)
      (this.visuals.get('relay') as RelayDish | undefined)?.useModel(normalizeModel(dish, 3.2));
    const cargo = models.get('cargo_pod');
    if (cargo) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const pod = normalizeModel(cargo.clone(true), 1.3);
        pod.position.set(Math.cos(a) * 2.5, -7.2, Math.sin(a) * 2.5);
        pod.lookAt(0, -7.2, 0);
        this.group.add(pod);
      }
    }
    const probe = models.get('derelict_probe');
    if (probe) {
      const pod = normalizeModel(probe, 1.6);
      pod.position.set(RING_RADIUS + 6, 4, -9);
      pod.name = 'drifting-pod';
      this.group.add(pod);
    }
  }

  update(dt: number, time: number): void {
    this.core.update(dt, time);
    this.ring.update(dt, time);
    this.mast.update(time);
    this.visuals.forEach((v) => {
      if (v.group.visible) v.update(dt, time);
    });
    const pod = this.group.getObjectByName('drifting-pod');
    if (pod) {
      pod.rotation.x += dt * 0.1;
      pod.rotation.z += dt * 0.07;
    }
  }
}
