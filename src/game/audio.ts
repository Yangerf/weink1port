/**
 * Procedural audio — everything is synthesised in the Web Audio API so the
 * whole game keeps working from a single self-contained HTML file.
 */

type SfxName = 'orb' | 'shield' | 'boost' | 'hit' | 'death' | 'jump' | 'slide' | 'start' | 'ui';

const MINOR = [0, 3, 7, 10, 12, 15, 10, 7];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscs: OscillatorNode[] = [];
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private step = 0;
  private nextNoteAt = 0;
  private bpm = 132;
  private running = false;
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    // gentle limiter so the square-wave bass never clips
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.75;
    this.sfxBus.connect(comp);

    // ------------------------------------------------------------- engine --
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 620;
    flt.Q.value = 6;
    flt.connect(eg);
    eg.connect(comp);
    this.engineGain = eg;
    this.engineFilter = flt;

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'square' : 'sawtooth';
      osc.frequency.value = 42 + i * 11;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.12 : 0.36;
      osc.connect(g);
      g.connect(flt);
      osc.start();
      this.engineOscs.push(osc);
    }

    // wind / friction layer
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noise;

    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.9;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(comp);
    wind.start();
    this.windGain = wg;
  }

  resume(): void {
    void this.ctx?.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  /** Engine start / stop — the hum only runs while actually flying. */
  setRunning(on: boolean): void {
    this.running = on;
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.linearRampToValueAtTime(on ? 0.09 : 0, t + (on ? 1.2 : 0.35));
    if (this.windGain) this.windGain.gain.linearRampToValueAtTime(on ? 0.05 : 0, t + 0.5);
    this.nextNoteAt = t + 0.1;
  }

  /** Called every frame with the current speed (m/s) and normalised load. */
  update(speed: number, load: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.engineFilter && this.engineGain) {
      const target = 480 + speed * 14;
      this.engineFilter.frequency.setTargetAtTime(Math.min(target, 3200), t, 0.15);
      for (let i = 0; i < this.engineOscs.length; i++) {
        const f = (40 + i * 9) * (1 + load * 0.85) + speed * 0.32;
        this.engineOscs[i].frequency.setTargetAtTime(f, t, 0.12);
      }
      if (this.windGain) this.windGain.gain.setTargetAtTime(0.02 + load * 0.07, t, 0.2);
    }
    if (this.running) this.schedule(dt);
  }

  /** Look-ahead step sequencer for the bassline. */
  private schedule(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const spb = 60 / this.bpm / 2; // eighth notes
    if (this.nextNoteAt < ctx.currentTime) this.nextNoteAt = ctx.currentTime + 0.05;
    this.nextNoteAt -= 0; // keep TS happy about dt usage below
    void dt;
    while (this.nextNoteAt < ctx.currentTime + 0.25) {
      this.playStep(this.nextNoteAt);
      this.nextNoteAt += spb;
      this.step++;
    }
  }

  private playStep(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const s = this.step % 8;

    // bass
    const semi = MINOR[s] + (this.step % 16 < 8 ? 0 : -5);
    const freq = 55 * Math.pow(2, semi / 12);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(180, t);
    flt.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 700, t + 0.05);
    flt.frequency.exponentialRampToValueAtTime(240, t + 0.28);
    flt.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.34);

    // kick on the pulse, snare-ish noise off-beat
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.16);
    else this.hat(t, 0.05);
    if (this.step % 32 === 16) this.hat(t, 0.22, 0.9);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  private hat(t: number, gain: number, cutoff = 0.6): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000 * cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.08);
  }

  /* ----------------------------------------------------------------- sfx -- */

  play(name: SfxName, param = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'orb': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const base = 620 * Math.pow(2, Math.min(param, 12) / 12);
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.22);
        break;
      }
      case 'shield':
      case 'boost': {
        const notes = name === 'shield' ? [523, 784, 1046] : [330, 494, 660, 990];
        notes.forEach((f, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const g = ctx.createGain();
          const at = t + i * 0.055;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
          osc.connect(g);
          g.connect(this.sfxBus!);
          osc.start(at);
          osc.stop(at + 0.55);
        });
        break;
      }
      case 'jump': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.2);
        break;
      }
      case 'slide': {
        const src = ctx.createBufferSource();
        if (this.noiseBuffer) src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2600, t);
        bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.sfxBus);
        src.start(t);
        src.stop(t + 0.4);
        break;
      }
      case 'hit': {
        const src = ctx.createBufferSource();
        if (this.noiseBuffer) src.buffer = this.noiseBuffer;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(180, t + 0.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        src.connect(lp);
        lp.connect(g);
        g.connect(this.sfxBus);
        src.start(t);
        src.stop(t + 0.5);

        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(180, t);
        sub.frequency.exponentialRampToValueAtTime(45, t + 0.3);
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.42, t);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        sub.connect(sg);
        sg.connect(this.sfxBus);
        sub.start(t);
        sub.stop(t + 0.36);
        break;
      }
      case 'death': {
        [0, 1, 2, 3, 4, 5].forEach((i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          const at = t + i * 0.09;
          osc.frequency.setValueAtTime(440 / (1 + i * 0.35), at);
          osc.frequency.exponentialRampToValueAtTime(60, at + 0.5);
          const flt = ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = 1400;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
          osc.connect(flt);
          flt.connect(g);
          g.connect(this.sfxBus!);
          osc.start(at);
          osc.stop(at + 0.75);
        });
        break;
      }
      case 'start':
      case 'ui': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        const base = name === 'start' ? 300 : 700;
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * 2.2, t + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.connect(g);
        g.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.16);
        break;
      }
    }
  }

  dispose(): void {
    this.running = false;
    try {
      this.engineOscs.forEach((o) => o.stop());
    } catch {
      /* already stopped */
    }
    this.engineOscs = [];
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
  }
}
