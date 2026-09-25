'use client';

import type { Howl as HowlType } from 'howler';

/**
 * Scene audio. Each ambience/SFX tag plays a file from public/audio (listed in
 * manifest.json) when one is available; otherwise a small procedural synth
 * stands in so there's always some atmosphere.
 */

type Manifest = { ambience: Record<string, string[]>; sfx: Record<string, string[]> };
type Voice = { stop: (fade: number) => void };

let manifestPromise: Promise<Manifest> | null = null;
function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/audio/manifest.json')
    .then((r) => (r.ok ? r.json() : { ambience: {}, sfx: {} }))
    .catch(() => ({ ambience: {}, sfx: {} }));
  return manifestPromise;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private current: { tag: string; voice: Voice } | null = null;
  private howls = new Map<string, HowlType>();
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private ducked = false;
  private disposed = false;

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.ctx.destination);
      this.sfxBus.connect(this.ctx.destination);
      this.applyVolumes();
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  duck(on: boolean) {
    this.ducked = on;
    this.applyVolumes();
  }

  private applyVolumes() {
    const music = this.musicVolume * (this.ducked ? 0.35 : 1);
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.3);
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.1);
    for (const [key, h] of this.howls) {
      if (key.startsWith('amb:')) h.volume(music);
    }
  }

  async setAmbience(tag: string | null) {
    if (this.disposed || !this.ctx) return;
    if (this.current?.tag === tag) return;
    this.current?.voice.stop(2.5);
    this.current = null;
    if (!tag || tag === 'silence') return;
    const manifest = await loadManifest();
    const files = manifest.ambience[tag];
    const voice = (files?.length && (await this.playFileLoop(tag, pick(files)))) || this.synthAmbience(tag);
    if (voice) this.current = { tag, voice };
  }

  async playSfx(tag: string) {
    if (this.disposed || !this.ctx) return;
    const manifest = await loadManifest();
    const files = manifest.sfx[tag];
    if (files?.length && (await this.playFileOnce(pick(files)))) return;
    this.synthSfx(tag);
  }

  dispose() {
    this.disposed = true;
    this.current?.voice.stop(0.2);
    for (const h of this.howls.values()) h.unload();
    this.howls.clear();
    void this.ctx?.close();
  }

  // ---- files (Howler) ----

  private async playFileLoop(tag: string, file: string): Promise<Voice | null> {
    const { Howl } = await import('howler');
    const key = `amb:${tag}:${file}`;
    return new Promise((resolve) => {
      const target = this.musicVolume * (this.ducked ? 0.35 : 1);
      const howl = new Howl({
        src: [`/audio/${file}`],
        loop: true,
        volume: 0,
        html5: true, // stream long ambience files instead of decoding them whole
        onload: () => {
          howl.play();
          howl.fade(0, target, 2500);
          resolve({
            stop: (fade) => {
              howl.fade(howl.volume(), 0, fade * 1000);
              setTimeout(() => {
                howl.unload();
                this.howls.delete(key);
              }, fade * 1000 + 100);
            },
          });
        },
        onloaderror: () => {
          this.howls.delete(key);
          resolve(null);
        },
      });
      this.howls.set(key, howl);
    });
  }

  private async playFileOnce(file: string): Promise<boolean> {
    const { Howl } = await import('howler');
    return new Promise((resolve) => {
      const howl = new Howl({
        src: [`/audio/${file}`],
        volume: this.sfxVolume,
        onload: () => {
          howl.play();
          resolve(true);
        },
        onend: () => howl.unload(),
        onloaderror: () => resolve(false),
      });
    });
  }

  // ---- procedural fallback ----

  private noiseSource(loop = true) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7) {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(value: number) {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    return g;
  }

  /** A short enveloped tone. */
  private blip(out: AudioNode, freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.2, at = 0, endFreq?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A short enveloped burst of filtered noise. */
  private burst(out: AudioNode, dur: number, type: BiquadFilterType, freq: number, peak = 0.3, at = 0, q = 0.7) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const src = this.noiseSource(false);
    const f = this.filter(type, freq, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private synthAmbience(tag: string): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    out.connect(this.musicBus!);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    const every = (ms: number, chance: number, fn: () => void) => timers.push(setInterval(() => Math.random() < chance && fn(), ms));

    const bed = (type: BiquadFilterType, freq: number, level: number, lfoRate = 0, lfoDepth = 0) => {
      const src = this.noiseSource();
      const f = this.filter(type, freq);
      const g = this.gain(level);
      src.connect(f).connect(g).connect(out);
      if (lfoRate) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = lfoRate;
        const depth = this.gain(lfoDepth);
        lfo.connect(depth).connect(g.gain);
        lfo.start();
        nodes.push(lfo);
      }
      src.start();
      nodes.push(src);
    };
    const drone = (freqs: number[], level: number, type: OscillatorType = 'sine') => {
      for (const fq of freqs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = fq;
        o.detune.value = (Math.random() - 0.5) * 12;
        const g = this.gain(level);
        o.connect(g).connect(out);
        o.start();
        nodes.push(o);
      }
    };
    const crackle = (rate: number) => every(90, rate, () => this.burst(out, 0.03 + Math.random() * 0.05, 'highpass', 1500 + Math.random() * 2500, 0.08 + Math.random() * 0.1));
    const echo = (() => {
      const d = ctx.createDelay(1);
      d.delayTime.value = 0.37;
      const fb = this.gain(0.45);
      d.connect(fb).connect(d);
      d.connect(out);
      return d;
    })();

    switch (tag) {
      case 'storm':
        bed('lowpass', 1400, 0.22);
        bed('lowpass', 300, 0.15, 0.07, 0.1);
        every(6000, 0.35, () => this.thunder(out, 0.6));
        break;
      case 'sea':
        bed('lowpass', 500, 0.12, 0.09, 0.12);
        bed('bandpass', 1200, 0.03, 0.13, 0.03);
        every(3000, 0.2, () => this.blip(out, 1800 + Math.random() * 600, 0.3, 'sine', 0.03, 0, 1400)); // gulls, faintly
        break;
      case 'forest-day':
        bed('lowpass', 500, 0.05, 0.05, 0.04);
        every(700, 0.35, () => {
          const f = 2500 + Math.random() * 2000;
          this.blip(out, f, 0.12, 'sine', 0.05, 0, f * 1.3);
          this.blip(out, f * 1.1, 0.1, 'sine', 0.04, 0.15, f * 0.9);
        });
        break;
      case 'forest-night':
      case 'camp':
        bed('lowpass', 400, 0.04, 0.04, 0.03);
        every(400, 0.5, () => {
          for (let i = 0; i < 3; i++) this.blip(out, 4300 + Math.random() * 200, 0.04, 'square', 0.01, i * 0.06);
        });
        if (tag === 'camp') crackle(0.35);
        break;
      case 'tavern':
        bed('bandpass', 350, 0.1, 0.3, 0.05);
        bed('bandpass', 700, 0.04, 0.5, 0.03);
        crackle(0.25);
        every(2500, 0.2, () => this.blip(out, 1800 + Math.random() * 800, 0.4, 'sine', 0.03)); // clinking cups
        break;
      case 'city':
        bed('bandpass', 400, 0.09, 0.2, 0.04);
        every(500, 0.25, () => this.burst(out, 0.05, 'lowpass', 600, 0.08));
        every(5000, 0.15, () => this.bell(out, 0.05));
        break;
      case 'cave':
      case 'dungeon':
        drone(tag === 'cave' ? [55, 82.5] : [49, 73.4, 98], 0.035);
        bed('lowpass', 200, 0.04, 0.03, 0.03);
        every(900, 0.3, () => this.blip(echo, 700 + Math.random() * 900, 0.08, 'sine', 0.08, 0, 400));
        break;
      case 'temple':
        drone([110, 164.8, 220, 277.2], 0.025, 'triangle');
        every(8000, 0.3, () => this.bell(out, 0.04));
        break;
      case 'combat': {
        drone([55, 58.3], 0.03, 'sawtooth');
        let beat = 0;
        timers.push(
          setInterval(() => {
            const accent = beat % 4 === 0;
            this.blip(out, accent ? 70 : 90, 0.25, 'sine', accent ? 0.35 : 0.2, 0, 40);
            if (beat % 2 === 1) this.burst(out, 0.08, 'highpass', 3000, 0.04);
            beat++;
          }, 300),
        );
        break;
      }
      case 'tension':
        drone([61.7, 65.4, 92.5], 0.03, 'triangle');
        every(2200, 0.6, () => this.blip(out, 55, 1.2, 'sine', 0.12, 0, 50));
        break;
      case 'victory': {
        const notes = [261.6, 329.6, 392, 523.3, 392, 329.6];
        let i = 0;
        drone([130.8, 196], 0.02, 'triangle');
        timers.push(setInterval(() => this.blip(out, notes[i++ % notes.length]!, 0.9, 'triangle', 0.06), 450));
        break;
      }
      default:
        bed('lowpass', 400, 0.05, 0.05, 0.03);
    }

    return {
      stop: (fade) => {
        for (const t of timers) clearInterval(t);
        out.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.05, fade / 4));
        setTimeout(() => {
          for (const n of nodes) {
            try {
              n.stop();
            } catch {}
          }
          out.disconnect();
        }, fade * 1000 + 200);
      },
    };
  }

  private thunder(out: AudioNode, peak: number) {
    this.burst(out, 2.5 + Math.random(), 'lowpass', 120 + Math.random() * 80, peak);
    this.burst(out, 0.3, 'lowpass', 800, peak * 0.4);
  }

  private bell(out: AudioNode, peak: number) {
    for (const [f, p] of [
      [440, 1],
      [1108, 0.5],
      [1650, 0.3],
      [2400, 0.15],
    ] as const) {
      this.blip(out, f, 3.5, 'sine', peak * p);
    }
  }

  private synthSfx(tag: string) {
    const out = this.sfxBus!;
    switch (tag) {
      case 'sword':
        this.burst(out, 0.15, 'bandpass', 3200, 0.4, 0, 2);
        this.blip(out, 2600, 0.8, 'sine', 0.08);
        this.blip(out, 3900, 0.6, 'sine', 0.04);
        break;
      case 'door':
      case 'chest':
        this.blip(out, 220, 0.9, 'sawtooth', 0.04, 0, 140);
        this.burst(out, 0.25, 'lowpass', 180, 0.6, 0.8);
        break;
      case 'spell':
        this.blip(out, 400, 0.9, 'sine', 0.12, 0, 1600);
        for (let i = 0; i < 6; i++) this.blip(out, 1500 + Math.random() * 2000, 0.3, 'sine', 0.04, 0.2 + i * 0.08);
        break;
      case 'coins':
        for (let i = 0; i < 7; i++) this.blip(out, 3000 + Math.random() * 2500, 0.25, 'sine', 0.06, i * (0.04 + Math.random() * 0.05));
        break;
      case 'roar':
        this.blip(out, 110, 1.3, 'sawtooth', 0.2, 0, 60);
        this.burst(out, 1.2, 'lowpass', 400, 0.3);
        break;
      case 'footsteps':
        for (let i = 0; i < 4; i++) this.burst(out, 0.08, 'lowpass', 300, 0.35, i * 0.45);
        break;
      case 'thunder':
        this.thunder(out, 0.8);
        break;
      case 'splash':
        this.burst(out, 0.7, 'bandpass', 1000, 0.4);
        this.burst(out, 0.3, 'highpass', 3000, 0.15, 0.1);
        break;
      case 'arrow': {
        const ctx = this.ctx!;
        const src = this.noiseSource(false);
        const f = this.filter('bandpass', 1200, 3);
        f.frequency.exponentialRampToValueAtTime(5000, ctx.currentTime + 0.35);
        const g = this.gain(0.0001);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        src.connect(f).connect(g).connect(out);
        src.start();
        src.stop(ctx.currentTime + 0.45);
        this.burst(out, 0.1, 'lowpass', 500, 0.4, 0.4);
        break;
      }
      case 'scream':
        this.blip(out, 900, 1, 'sawtooth', 0.05, 0, 500);
        break;
      case 'bell':
        this.bell(out, 0.15);
        break;
      case 'dice':
        for (let i = 0; i < 5; i++) this.burst(out, 0.03, 'bandpass', 2000 + Math.random() * 2000, 0.2, i * (0.05 + Math.random() * 0.07), 3);
        break;
    }
  }
}
