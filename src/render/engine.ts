/** Moteur de rendu : scène, caméra orbitale, interaction (raycast) et effets liés aux événements. */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { isModuleId } from '../core/data/modules';
import type { GameEvent, GameState, ModuleId } from '../core/types';
import type { Settings } from '../game/settings';
import { AnomalyPacket } from './anomaly';
import { loadModels, mergedGeometry } from './assets';
import { Background, PLANET_POSITION, SUN_DIRECTION } from './background';
import { Effects } from './effects';
import { EventFx } from './eventFx';
import { PostFx } from './postfx';
import { Station } from './station/station';

export interface EngineCallbacks {
  readonly onCoreClick: (x: number, y: number) => void;
  readonly onAnomalyClick: (x: number, y: number) => void;
  readonly onContextLost: () => void;
}

/** Zone de l'écran non couverte par l'interface, en pixels CSS relatifs au canevas. */
export interface SafeArea {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Demi-hauteur (unités monde) à faire tenir dans la zone libre au premier cadrage. */
const FRAME_RADIUS = 10.5;

const QUALITY = {
  low: { stars: 2500, debris: 90, maxPixelRatio: 1 },
  medium: { stars: 5000, debris: 180, maxPixelRatio: 1.5 },
  high: { stars: 9000, debris: 300, maxPixelRatio: 2 },
} as const;

export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly postfx: PostFx;
  private readonly background: Background;
  private readonly station = new Station();
  private readonly effects = new Effects();
  private readonly anomaly = new AnomalyPacket();
  private readonly eventFx = new EventFx();
  private readonly sunLight = new DirectionalLight(0xfff0dd, 2.6);
  private readonly ambient = new AmbientLight(0x3a4a6a, 0.6);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly timer = new Timer();
  private readonly shakeOffset = new Vector3();
  private settings: Settings;
  private gameTime = 0;
  private shake = 0;
  private storm = 0;
  private downAt: { x: number; y: number; t: number } | null = null;
  private lastInteraction = 0;
  private hoverDirty = false;
  private safe: SafeArea | null = null;
  private framed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Settings,
    private readonly callbacks: EngineCallbacks,
  ) {
    this.settings = settings;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new PerspectiveCamera(50, 1, 0.1, 5000);
    this.camera.position.set(14, 4.2, 17.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.configureControls();
    const q = QUALITY[settings.quality];
    this.background = new Background(q.stars, q.debris);
    this.scene.add(
      this.background.group,
      this.station.group,
      this.effects.group,
      this.anomaly.group,
      this.eventFx.group,
    );
    this.addLights();
    this.postfx = new PostFx(this.renderer, this.scene, this.camera);
    this.postfx.apply(settings);
    this.bindEvents();
    this.resize();
    void this.loadOptionalModels();
    void this.refreshGlyphsWhenFontReady();
  }

  private configureControls(): void {
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.enablePan = false;
    c.minDistance = 10;
    c.maxDistance = 48;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.7;
    c.autoRotate = true;
    c.autoRotateSpeed = 0.25;
    c.target.set(0, 2, 0);
  }

  private addLights(): void {
    const sun = this.sunLight;
    sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
    const bounce = new DirectionalLight(0xff9a60, 0.7);
    bounce.position.copy(PLANET_POSITION).normalize().multiplyScalar(100);
    const fill = new DirectionalLight(0x7fa8d8, 0.9);
    fill.position.set(60, 30, 80);
    this.scene.add(sun, bounce, fill, this.ambient);
  }

  /** L'atlas ASCII est dessiné avec JetBrains Mono : on le redessine quand la police est prête. */
  private async refreshGlyphsWhenFontReady(): Promise<void> {
    try {
      await document.fonts.load('bold 28px "JetBrains Mono"');
      this.postfx.refreshGlyphs(this.settings);
    } catch (error: unknown) {
      console.warn('[render] police des glyphes indisponible', error);
    }
  }

  private async loadOptionalModels(): Promise<void> {
    const models = await loadModels();
    if (models.size === 0) return;
    this.station.applyModels(models);
    const debris = models.get('debris');
    const geo = debris ? mergedGeometry(debris) : null;
    if (geo) this.background.replaceDebris(geo, QUALITY[this.settings.quality].debris);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.lastInteraction = performance.now();
    });
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointermove', (e) => {
      this.setPointer(e.clientX, e.clientY);
      this.hoverDirty = true;
    });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.onContextLost();
    });
    this.controls.addEventListener('end', () => {
      this.lastInteraction = performance.now();
    });
    this.controls.addEventListener('start', () => {
      this.lastInteraction = performance.now();
      this.controls.autoRotate = false;
    });
  }

  private setPointer(x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
  }

  private handlePointerUp(e: PointerEvent): void {
    const down = this.downAt;
    this.downAt = null;
    if (
      !down ||
      Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 ||
      performance.now() - down.t > 500
    )
      return;
    this.setPointer(e.clientX, e.clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (
      this.anomaly.group.visible &&
      this.raycaster.intersectObject(this.anomaly.hitMesh, false).length > 0
    ) {
      this.callbacks.onAnomalyClick(e.clientX, e.clientY);
      return;
    }
    if (this.raycaster.intersectObject(this.station.core.hitMesh, false).length > 0) {
      this.callbacks.onCoreClick(e.clientX, e.clientY);
    }
  }

  /** Impulsion déclenchée hors souris (clavier, bouton d'accessibilité). */
  coreScreenPosition(): { x: number; y: number } {
    const p = new Vector3()
      .setFromMatrixPosition(this.station.core.hitMesh.matrixWorld)
      .project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
    };
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(w, h, pr);
    this.background.setPixelRatio(pr);
    this.effects.setPixelRatio(pr);
    this.applyFraming();
  }

  /** Recentre la projection sur la zone libre entre les panneaux. */
  setSafeArea(area: SafeArea): void {
    const prev = this.safe;
    const same =
      prev !== null &&
      Math.abs(prev.left - area.left) < 2 &&
      Math.abs(prev.top - area.top) < 2 &&
      Math.abs(prev.right - area.right) < 2 &&
      Math.abs(prev.bottom - area.bottom) < 2;
    if (same) return;
    this.safe = area;
    this.applyFraming();
  }

  private applyFraming(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const area = this.safe;
    const sw = area ? area.right - area.left : 0;
    const sh = area ? area.bottom - area.top : 0;
    if (!area || sw < w * 0.25 || sh < h * 0.25) {
      this.camera.clearViewOffset();
      return;
    }
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    if (this.framed) return;
    // Premier cadrage : recule la caméra pour que la station tienne dans la zone libre.
    this.framed = true;
    const fit = Math.min(sh / h, (sw / w) * this.camera.aspect);
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const c = this.controls;
    const distance = Math.min(c.maxDistance, Math.max(c.minDistance, FRAME_RADIUS / (tan * fit)));
    const dir = this.camera.position.clone().sub(c.target).normalize();
    this.camera.position.copy(c.target).addScaledVector(dir, distance);
  }

  /** Mise en service d'un nouveau sous-système : onde de choc et gerbe sur son emplacement. */
  celebrate(id: ModuleId): void {
    const at = this.station.anchorOf(id);
    this.effects.burst(at, 140, 0x9dffb0, 8, 0.8);
    this.effects.shockwave(at, this.camera.position.clone().sub(at).normalize(), 0x9dffb0, 7);
    this.postfx.kick(0.3 * (this.settings.reducedMotion ? 0.3 : 1));
  }

  applySettings(settings: Settings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = settings;
    this.postfx.apply(settings);
    if (qualityChanged) this.resize();
  }

  sync(state: GameState, energyRate: number): void {
    // Corrige en douceur l'horloge interpolée (évite les à-coups du paquet dérivant).
    const drift = state.time - this.gameTime;
    this.gameTime = Math.abs(drift) > 1 ? state.time : this.gameTime + drift * 0.25;
    this.station.sync(state, energyRate);
    this.anomaly.sync(state.anomaly);
    this.eventFx.sync(state.event);
    this.storm = state.flags.includes('echo-decoded') ? 1 : 0;
  }

  private handleStationEvent(event: GameEvent, motion: number): void {
    const core = new Vector3();
    if (event.type === 'stationEvent') {
      this.postfx.kick(0.6 * motion);
      this.shake = Math.max(this.shake, 0.2 * motion);
      return;
    }
    if (event.type !== 'stationEventEnded') return;
    const salvaged = this.eventFx.ended(event.id, event.result);
    if (salvaged) {
      this.effects.burst(salvaged, 160, 0x9fe8ff, 9, 0.8);
      this.effects.shockwave(
        salvaged,
        this.camera.position.clone().sub(salvaged).normalize(),
        0x9fe8ff,
        6,
      );
    }
    if (event.result === 'goal') {
      this.effects.burst(core, 220, 0xffd060, 14, 2);
      this.effects.shockwave(core, new Vector3(0, 1, 0), 0xffd060, 22);
      this.postfx.kick(0.5 * motion);
    }
  }

  handleEvent(event: GameEvent): void {
    const motion = this.settings.reducedMotion ? 0.3 : 1;
    const core = new Vector3();
    switch (event.type) {
      case 'click':
        this.station.core.kick(event.crit ? 1 : 0.45);
        this.effects.burst(
          core,
          event.crit ? 90 : 26,
          event.crit ? 0xffb347 : 0x7fe9ff,
          event.crit ? 11 : 6,
          1.6,
        );
        if (event.crit) {
          this.effects.shockwave(core, this.camera.position.clone().normalize(), 0xffc060, 9);
          this.shake = Math.max(this.shake, 0.35 * motion);
          this.postfx.kick(0.25 * motion);
        }
        break;
      case 'purchase':
        if (event.kind === 'module' && isModuleId(event.id))
          this.effects.burst(this.station.anchorOf(event.id), 30, 0x9dffb0, 4, 0.6);
        break;
      case 'incident':
        this.postfx.kick(1.2 * motion);
        this.shake = Math.max(this.shake, 0.5 * motion);
        this.effects.burst(this.station.anchorOf(event.incident.module), 70, 0xff3040, 7, 0.4);
        break;
      case 'incidentResolved':
        this.effects.burst(this.station.anchorOf(event.module), 60, 0x5dff8f, 5, 0.5);
        break;
      case 'anomalyCaught':
        this.effects.burst(this.anomaly.position(), 120, 0xffe066, 9, 0.3);
        this.effects.shockwave(
          this.anomaly.position(),
          this.camera.position.clone().sub(this.anomaly.position()).normalize(),
          0xffe066,
          5,
        );
        break;
      case 'reboot':
        this.postfx.kick(1.5);
        this.effects.shockwave(core, new Vector3(0, 1, 0), 0xffffff, 30);
        break;
      case 'stationEvent':
      case 'stationEventEnded':
        this.handleStationEvent(event, motion);
        break;
      default:
        break;
    }
  }

  private updateHover(): void {
    if (!this.hoverDirty) return;
    this.hoverDirty = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const overCore = this.raycaster.intersectObject(this.station.core.hitMesh, false).length > 0;
    const overAnomaly =
      this.anomaly.group.visible &&
      this.raycaster.intersectObject(this.anomaly.hitMesh, false).length > 0;
    this.station.core.setHover(overCore);
    this.canvas.style.cursor = overCore || overAnomaly ? 'pointer' : 'grab';
  }

  frame(): void {
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const time = this.timer.getElapsed();
    if (!this.controls.autoRotate && performance.now() - this.lastInteraction > 6000)
      this.controls.autoRotate = true;
    this.camera.position.sub(this.shakeOffset);
    this.controls.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.shakeOffset
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(this.shake);
    this.camera.position.add(this.shakeOffset);
    this.updateHover();
    const mood = this.eventFx.update(dt, time, this.gameTime);
    this.background.update(dt, time, {
      storm: Math.max(this.storm, mood.storm),
      lightning: mood.storm,
      flare: mood.flare,
    });
    this.station.setMood(mood);
    this.sunLight.intensity = 2.6 * (1 + mood.flare * 0.9);
    this.ambient.intensity = 0.6 * (1 - mood.blackout * 0.7);
    if (mood.ghost > 0.5 && Math.random() < dt * 0.5)
      this.postfx.kick(0.3 * (this.settings.reducedMotion ? 0.3 : 1));
    this.station.update(dt, time);
    this.effects.update(dt);
    this.gameTime += dt;
    this.anomaly.update(dt, this.gameTime);
    this.postfx.render(dt, time);
  }

  dispose(): void {
    this.eventFx.dispose();
    this.controls.dispose();
    this.timer.dispose();
    this.postfx.dispose();
    this.renderer.dispose();
  }
}
