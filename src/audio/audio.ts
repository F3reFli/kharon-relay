/**
 * Audio entièrement synthétisé (WebAudio) : effets d'interface et ambiance de station
 * (bourdonnement de coque, souffle de ventilation, craquements, bips lointains).
 */

export type Sfx =
  | 'click'
  | 'crit'
  | 'buy'
  | 'error'
  | 'incident'
  | 'resolve'
  | 'solve'
  | 'achievement'
  | 'anomaly'
  | 'catch'
  | 'type'
  | 'boot'
  | 'open'
  | 'reboot'
  | 'event'
  | 'eventEnd'
  | 'blackout'
  | 'resonance'
  | 'online';

interface Volumes {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly ambientVolume: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambient: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumes: Volumes = { masterVolume: 0.7, sfxVolume: 0.8, ambientVolume: 0.5 };
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private lastType = 0;

  /** Doit être appelé depuis un geste utilisateur (politique d'autoplay). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch (error: unknown) {
      console.warn('[audio] contexte indisponible', error);
      return;
    }
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.ambient = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.ambient.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise(2);
    this.applyVolumes();
    this.startAmbient();
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = volumes;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfx || !this.ambient) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfxVolume, t, 0.05);
    this.ambient.gain.setTargetAtTime(this.volumes.ambientVolume * 0.6, t, 0.3);
  }

  /** Intensité de l'ambiance selon la puissance de la station (0..1). */
  setIntensity(power: number): void {
    if (!this.ctx || !this.droneFilter) return;
    this.droneFilter.frequency.setTargetAtTime(160 + power * 520, this.ctx.currentTime, 2);
  }

  private makeNoise(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tone(
    type: OscillatorType,
    freq: number,
    start: number,
    duration: number,
    gain: number,
    endFreq?: number,
    dest?: AudioNode,
  ): void {
    if (!this.ctx || !this.sfx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g).connect(dest ?? this.sfx);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noiseBurst(
    start: number,
    duration: number,
    gain: number,
    freq: number,
    q = 1,
    type: BiquadFilterType = 'bandpass',
    dest?: AudioNode,
  ): void {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src
      .connect(filter)
      .connect(g)
      .connect(dest ?? this.sfx);
    src.start(start, Math.random());
    src.stop(start + duration + 0.02);
  }

  /** Recettes sonores : chacune programme des oscillateurs/bruits à partir de l'instant t. */
  private readonly recipes: Readonly<Record<Sfx, (t: number, jitter: number) => void>> = {
    click: (t, j) => {
      this.tone('sine', 180 * j, t, 0.12, 0.35, 420 * j);
      this.noiseBurst(t, 0.03, 0.12, 3200, 2);
    },
    crit: (t) => {
      this.tone('triangle', 260, t, 0.35, 0.35, 1040);
      this.arpeggio('sine', [1320, 1760, 2640], t, 0.04, 0.25, 0.1);
      this.noiseBurst(t, 0.25, 0.2, 600, 0.6, 'lowpass');
    },
    buy: (t) => this.arpeggio('square', [660, 990], t, 0.06, 0.08, 0.08),
    error: (t) => this.arpeggio('square', [140, 120], t, 0.13, 0.11, 0.12),
    incident: (t) => {
      for (let i = 0; i < 3; i++)
        this.arpeggio('sawtooth', [440, 330], t + i * 0.36, 0.18, 0.17, 0.14);
      this.tone('sine', 60, t, 0.6, 0.4, 35);
    },
    resolve: (t) => this.arpeggio('sine', [523, 659, 784], t, 0.07, 0.3, 0.18),
    solve: (t) => {
      this.arpeggio('triangle', [392, 523, 659, 784, 1046], t, 0.08, 0.45, 0.16);
      this.noiseBurst(t + 0.3, 0.6, 0.05, 6000, 1, 'highpass');
    },
    achievement: (t) => {
      this.tone('sine', 880, t, 1.2, 0.18);
      this.tone('sine', 1320, t, 1.0, 0.1);
      this.tone('sine', 1760, t + 0.12, 0.9, 0.06);
    },
    anomaly: (t) => {
      this.tone('sine', 300, t, 0.6, 0.12, 1200);
      this.tone('sine', 450, t + 0.1, 0.5, 0.06, 1800);
    },
    catch: (t) => this.arpeggio('sine', [1046, 1318, 1568, 2093], t, 0.05, 0.3, 0.12),
    type: (t, j) => {
      if (t - this.lastType < 0.025) return;
      this.lastType = t;
      this.noiseBurst(t, 0.012, 0.06 * j, 5000, 1, 'highpass');
    },
    boot: (t) => {
      this.tone('sine', 40, t, 1.5, 0.4, 120);
      this.arpeggio('square', [1000, 1500], t + 1.2, 0.12, 0.08, 0.06);
    },
    open: (t) => this.tone('sine', 900, t, 0.06, 0.08, 1300),
    reboot: (t) => {
      this.tone('sawtooth', 800, t, 2, 0.15, 30);
      this.noiseBurst(t, 2, 0.2, 400, 0.5, 'lowpass');
    },
    event: (t) => {
      // Ouverture de canal radio : souffle filtré puis double bip montant.
      this.noiseBurst(t, 0.35, 0.16, 1800, 3);
      this.arpeggio('square', [880, 1175, 880, 1175], t + 0.3, 0.11, 0.09, 0.06);
      this.tone('sine', 220, t + 0.3, 0.5, 0.12, 440);
    },
    eventEnd: (t) => {
      this.arpeggio('sine', [784, 1046], t, 0.09, 0.35, 0.12);
      this.noiseBurst(t + 0.1, 0.25, 0.05, 2500, 2);
    },
    blackout: (t) => {
      this.tone('sawtooth', 320, t, 1.4, 0.18, 28);
      this.tone('sine', 90, t, 1.2, 0.3, 30);
      this.noiseBurst(t, 0.12, 0.25, 900, 1);
    },
    resonance: (t) => {
      this.arpeggio('triangle', [523, 659, 784, 1046, 1318, 1568], t, 0.06, 0.6, 0.1);
      this.tone('sine', 130, t, 1.2, 0.25, 260);
    },
    online: (t) => {
      this.tone('sine', 110, t, 0.8, 0.3, 220);
      this.arpeggio('triangle', [440, 554, 659, 880], t + 0.15, 0.07, 0.4, 0.12);
    },
  };

  private arpeggio(
    type: OscillatorType,
    freqs: readonly number[],
    start: number,
    step: number,
    duration: number,
    gain: number,
  ): void {
    freqs.forEach((f, i) => this.tone(type, f, start + i * step, duration, gain));
  }

  /** Joue un effet ; `pitch` transpose les recettes qui en tiennent compte (impulsions). */
  play(name: Sfx, pitch = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.recipes[name](this.ctx.currentTime, pitch * (1 + (Math.random() - 0.5) * 0.08));
  }

  private startAmbient(): void {
    if (!this.ctx || !this.ambient || !this.noise) return;
    const ctx = this.ctx;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 220;
    this.droneFilter.Q.value = 4;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.12;
    this.droneFilter.connect(droneGain).connect(this.ambient);
    [55, 55.37, 82.4].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.value = f;
      osc.connect(this.droneFilter as BiquadFilterNode);
      osc.start();
    });
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.04;
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 700;
    airFilter.Q.value = 0.6;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.035;
    air.connect(airFilter).connect(airGain).connect(this.ambient);
    air.start();
    this.scheduleCreak();
    this.scheduleBeep();
  }

  private scheduleCreak(): void {
    this.timers.push(
      setTimeout(
        () => {
          if (this.ctx && this.ambient) {
            const t = this.ctx.currentTime;
            this.noiseBurst(
              t,
              1.4 + Math.random(),
              0.25,
              90 + Math.random() * 140,
              18,
              'bandpass',
              this.ambient,
            );
          }
          this.scheduleCreak();
        },
        7000 + Math.random() * 12000,
      ),
    );
  }

  private scheduleBeep(): void {
    this.timers.push(
      setTimeout(
        () => {
          if (this.ctx && this.ambient) {
            const t = this.ctx.currentTime;
            const f = 1100 + Math.floor(Math.random() * 4) * 220;
            this.tone('sine', f, t, 0.09, 0.03, undefined, this.ambient);
            if (Math.random() < 0.5)
              this.tone('sine', f * 1.25, t + 0.14, 0.09, 0.025, undefined, this.ambient);
          }
          this.scheduleBeep();
        },
        9000 + Math.random() * 15000,
      ),
    );
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    void this.ctx?.close();
  }
}
