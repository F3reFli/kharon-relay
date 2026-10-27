/** Chaîne de post-traitement : rendu → bloom → sortie sRGB → stylisation → CRT. */

import { type PerspectiveCamera, type Scene, Vector2, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PALETTES, type Settings } from '../game/settings';
import { buildGlyphAtlas, type GlyphAtlas, type GlyphSet } from './glyphs';
import { CrtShader, StylizeShader } from './shaders/postfx';

const FILTER_MODES: Readonly<Record<Settings['filter'], number>> = {
  ascii: 0,
  dither: 1,
  crt: 2,
  clean: 3,
};

export class PostFx {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly stylize: ShaderPass;
  private readonly crt: ShaderPass;
  private atlas: GlyphAtlas | null = null;
  private glyphSet: GlyphSet | null = null;
  private pixelRatio = 1;
  private cellCss = 9;
  private crtIntensity = 0.65;
  private glitch = 0;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.85, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.stylize = new ShaderPass(StylizeShader);
    this.composer.addPass(this.stylize);
    this.crt = new ShaderPass(CrtShader);
    this.composer.addPass(this.crt);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    const res = new Vector2(width * pixelRatio, height * pixelRatio);
    this.stylize.uniforms.uResolution!.value = res;
    this.crt.uniforms.uResolution!.value = res;
    this.stylize.uniforms.uCell!.value = this.cellCss * pixelRatio;
  }

  /** Redessine l'atlas (à appeler une fois la police web chargée). */
  refreshGlyphs(settings: Settings): void {
    this.glyphSet = null;
    this.apply(settings);
  }

  apply(settings: Settings): void {
    if (this.glyphSet !== settings.glyphs) {
      this.atlas?.texture.dispose();
      this.atlas = buildGlyphAtlas(settings.glyphs);
      this.glyphSet = settings.glyphs;
      this.stylize.uniforms.tGlyphs!.value = this.atlas.texture;
      this.stylize.uniforms.uRampCount!.value = this.atlas.rampCount;
      this.stylize.uniforms.uGlyphCount!.value = this.atlas.glyphCount;
    }
    const palette = PALETTES[settings.palette];
    this.cellCss = settings.cellSize;
    this.stylize.uniforms.uCell!.value = settings.cellSize * this.pixelRatio;
    this.stylize.uniforms.uMode!.value = FILTER_MODES[settings.filter];
    this.stylize.uniforms.uTint!.value.set(...palette.tint);
    this.stylize.uniforms.uColorize!.value = palette.colorize;
    this.stylize.uniforms.uEdges!.value = settings.edges ? 1 : 0;
    this.stylize.enabled = settings.filter === 'ascii' || settings.filter === 'dither';
    this.crtIntensity = settings.filter === 'clean' ? 0 : settings.crt;
    this.crt.enabled = this.crtIntensity > 0 || this.glitch > 0;
    this.bloom.enabled = settings.bloom;
    this.bloom.strength = settings.filter === 'ascii' ? 0.75 : 0.95;
  }

  /** Déclenche un glitch d'écran (incident, coup critique…). */
  kick(amount: number): void {
    this.glitch = Math.min(1.5, this.glitch + amount);
    this.crt.enabled = true;
  }

  render(dt: number, time: number): void {
    this.glitch = Math.max(0, this.glitch - dt * 1.6);
    this.crt.uniforms.uTime!.value = time;
    this.crt.uniforms.uIntensity!.value = this.crtIntensity;
    this.crt.uniforms.uGlitch!.value = Math.min(1, this.glitch);
    this.crt.enabled = this.crtIntensity > 0 || this.glitch > 0;
    this.stylize.uniforms.uTime!.value = time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.atlas?.texture.dispose();
    this.composer.dispose();
  }
}
