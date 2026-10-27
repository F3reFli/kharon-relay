/** Mise en scène 3D des événements de station, plus quelques étoiles filantes d'ambiance. */

import { Group, type Mesh, Vector3 } from 'three';
import { getStationEvent } from '../core/data/events';
import type { ActiveEvent, EventVisual } from '../core/types';
import { SUN_DIRECTION } from './background';
import { Freighter, Wreck } from './eventProps';
import { Streaks, type StreakSpec } from './streaks';

export interface EventLevels {
  readonly flare: number;
  readonly storm: number;
  readonly blackout: number;
  readonly ghost: number;
  readonly resonance: number;
}

type LevelKey = keyof EventLevels;
const LEVEL_KEYS: readonly LevelKey[] = ['flare', 'storm', 'blackout', 'ghost', 'resonance'];

const CONVOY_FROM = new Vector3(-80, 9, -16);
const CONVOY_TO = new Vector3(80, 6, -8);
const WRECK_FROM = new Vector3(30, 12, -40);
const WRECK_REST = new Vector3(9, 4.5, -6);
const WRECK_AWAY = new Vector3(40, 18, -60);
const METEOR_DIR = new Vector3(1, -0.55, 0.35).normalize();

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function randomInSphere(radius: number, target: Vector3): Vector3 {
  return target
    .set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))
    .normalize()
    .multiplyScalar(radius * Math.cbrt(Math.random()));
}

type PropMode = 'hidden' | 'arriving' | 'leaving';

export class EventFx {
  readonly group = new Group();
  private readonly streaks = new Streaks();
  private readonly freighter = new Freighter();
  private readonly wreck = new Wreck();
  private readonly levels: Record<LevelKey, number> = {
    flare: 0,
    storm: 0,
    blackout: 0,
    ghost: 0,
    resonance: 0,
  };
  private event: ActiveEvent | null = null;
  private visual: EventVisual | null = null;
  private convoy: PropMode = 'hidden';
  private convoySpeed = 0;
  private wreckMode: PropMode = 'hidden';
  private wreckLeave = 0;
  private emitDebt = 0;
  private shootingIn = 6;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor() {
    this.group.add(this.streaks.mesh, this.freighter.group, this.wreck.group);
  }

  sync(event: ActiveEvent | null): void {
    const fresh = event !== null && event.serial !== this.event?.serial;
    this.event = event;
    if (!event) {
      this.visual = null;
      if (this.convoy === 'arriving') this.convoy = 'leaving';
      if (this.wreckMode === 'arriving') this.wreckMode = 'leaving';
      return;
    }
    if (!fresh) return;
    this.visual = getStationEvent(event.id)?.visual ?? null;
    if (this.visual === 'convoy') {
      this.convoy = 'arriving';
      this.convoySpeed = 0;
      this.freighter.group.position.copy(CONVOY_FROM);
      this.freighter.group.visible = true;
    }
    if (this.visual === 'wreck') {
      this.wreckMode = 'arriving';
      this.wreckLeave = 0;
      this.wreck.group.position.copy(WRECK_FROM);
      this.wreck.group.visible = true;
    }
  }

  /**
   * Fin d'événement : le cargo repart, l'épave est démantelée (réponse) ou s'éloigne.
   * Indépendant de l'ordre avec `sync(null)`, qui a pu déjà lancer le départ.
   */
  ended(id: string, result: 'choice' | 'goal' | 'expired'): Vector3 | null {
    const visual = getStationEvent(id)?.visual;
    if (visual === 'convoy' && this.convoy === 'arriving') this.convoy = 'leaving';
    if (visual !== 'wreck' || this.wreckMode === 'hidden') return null;
    if (result === 'choice') {
      this.wreckMode = 'hidden';
      this.wreck.group.visible = false;
      return this.wreck.group.position.clone();
    }
    this.wreckMode = 'leaving';
    return null;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      const mesh = obj as Partial<Mesh>;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  update(dt: number, time: number, gameTime: number): EventLevels {
    LEVEL_KEYS.forEach((k) => {
      const target = this.visual === k ? 1 : 0;
      this.levels[k] += (target - this.levels[k]) * Math.min(1, dt * 1.8);
    });
    this.emit(dt);
    this.updateConvoy(dt, time, gameTime);
    this.updateWreck(dt, time, gameTime);
    this.updateShootingStars(dt);
    this.streaks.update(dt);
    return this.levels;
  }

  private progress(gameTime: number): number {
    const e = this.event;
    if (!e) return 1;
    return Math.min(1, Math.max(0, (gameTime - e.startedAt) / (e.expiresAt - e.startedAt || 1)));
  }

  private emit(dt: number): void {
    const rate = { flare: 28, meteors: 7, ghost: 14, resonance: 18, blackout: 6, convoy: 26 };
    const visual = this.visual;
    const perSecond = visual && visual in rate ? rate[visual as keyof typeof rate] : 0;
    this.emitDebt += perSecond * dt;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const spec = this.streakFor(visual);
      if (spec) this.streaks.spawn(spec);
    }
    if (perSecond === 0) this.emitDebt = 0;
  }

  private streakFor(visual: EventVisual | null): StreakSpec | null {
    const p = this.tmp;
    switch (visual) {
      case 'flare':
        randomInSphere(18, p).addScaledVector(SUN_DIRECTION, 50);
        return {
          origin: p.clone(),
          velocity: SUN_DIRECTION.clone().multiplyScalar(-70),
          length: 7,
          life: 1.1,
          color: 0xffb35a,
          brightness: 0.5,
        };
      case 'meteors': {
        const dir = this.tmp2
          .copy(METEOR_DIR)
          .add(new Vector3(rnd(-0.15, 0.15), rnd(-0.1, 0.1), rnd(-0.15, 0.15)))
          .normalize();
        randomInSphere(22, p).addScaledVector(dir, -80);
        const big = Math.random() < 0.15;
        return {
          origin: p.clone(),
          velocity: dir.clone().multiplyScalar(rnd(45, 65)),
          length: big ? 14 : rnd(4, 9),
          life: 2.8,
          color: big ? 0xffb070 : 0xffe2b0,
          brightness: big ? 1.6 : 1.1,
        };
      }
      case 'ghost': {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(4, 14);
        return {
          origin: new Vector3(Math.cos(a) * r, rnd(9, 14), Math.sin(a) * r),
          velocity: new Vector3(0, -rnd(4, 7), 0),
          length: 1.4,
          life: 2.6,
          color: 0xc69bff,
          brightness: 0.7,
        };
      }
      case 'resonance': {
        const dir = randomInSphere(1, p).normalize();
        return {
          origin: dir.clone().multiplyScalar(2.6),
          velocity: dir.clone().multiplyScalar(rnd(5, 9)),
          length: 1,
          life: 0.9,
          color: 0xffc860,
          brightness: 1.2,
        };
      }
      case 'blackout': {
        const a = rnd(0, Math.PI * 2);
        return {
          origin: new Vector3(Math.cos(a) * 7.6, 0, Math.sin(a) * 7.6),
          velocity: new Vector3(rnd(-1, 1), -rnd(2, 4), rnd(-1, 1)),
          length: 0.6,
          life: 0.7,
          color: 0x9fe8ff,
          brightness: 1.4,
        };
      }
      case 'convoy':
        if (this.convoy === 'hidden') return null;
        return {
          origin: this.freighter.exhaust(p).clone(),
          velocity: new Vector3(-14 + rnd(-2, 2), rnd(-0.5, 0.5), rnd(-0.5, 0.5)),
          length: 1.6,
          life: 0.8,
          color: 0x66ccff,
          brightness: 0.6,
        };
      default:
        return null;
    }
  }

  private updateConvoy(dt: number, time: number, gameTime: number): void {
    if (this.convoy === 'hidden') return;
    const g = this.freighter.group;
    if (this.convoy === 'arriving') {
      // Traverse lentement la première moitié du trajet le temps de l'échange.
      const t = this.progress(gameTime) * 0.55;
      g.position.lerpVectors(CONVOY_FROM, CONVOY_TO, t);
    } else {
      this.convoySpeed = Math.min(60, this.convoySpeed + dt * 18);
      g.position.x += (4 + this.convoySpeed) * dt;
      if (g.position.x > CONVOY_TO.x + 20) {
        this.convoy = 'hidden';
        g.visible = false;
      }
    }
    g.rotation.y = -0.06;
    g.updateMatrixWorld();
    this.freighter.update(time, this.convoy === 'leaving' ? 1 : 0.2);
  }

  private updateWreck(dt: number, time: number, gameTime: number): void {
    if (this.wreckMode === 'hidden') return;
    const g = this.wreck.group;
    if (this.wreckMode === 'arriving') {
      const t = Math.min(1, this.progress(gameTime) / 0.7);
      const eased = 1 - (1 - t) ** 3;
      g.position.lerpVectors(WRECK_FROM, WRECK_REST, eased);
    } else {
      this.wreckLeave = Math.min(1, this.wreckLeave + dt / 7);
      g.position.lerpVectors(WRECK_REST, WRECK_AWAY, this.wreckLeave ** 2);
      if (this.wreckLeave >= 1) {
        this.wreckMode = 'hidden';
        g.visible = false;
      }
    }
    this.wreck.update(dt, time);
  }

  private updateShootingStars(dt: number): void {
    this.shootingIn -= dt;
    if (this.shootingIn > 0) return;
    this.shootingIn = rnd(5, 14);
    const origin = randomInSphere(1, this.tmp).normalize().multiplyScalar(rnd(260, 340));
    origin.y = Math.abs(origin.y) * 0.6 + 20;
    const tangent = this.tmp2.set(rnd(-1, 1), rnd(-0.4, 0.1), rnd(-1, 1)).normalize();
    this.streaks.spawn({
      origin: origin.clone(),
      velocity: tangent.clone().multiplyScalar(240),
      length: 30,
      life: 1,
      color: 0xdff4ff,
      brightness: 0.9,
    });
  }
}
