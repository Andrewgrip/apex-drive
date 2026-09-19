import type { Telemetry } from "./telemetry";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private screechGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private limiterPhase = 0;
  cylinders = 4;

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx || typeof window === "undefined") return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // Noise buffer for screech / wind / clicks
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // Engine: layered oscillators -> lowpass -> gain
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 600;
    this.engineFilter.Q.value = 1.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    const types: OscillatorType[] = ["sawtooth", "square", "sawtooth", "triangle"];
    const gains = [0.5, 0.25, 0.3, 0.4];
    types.forEach((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 30;
      const g = ctx.createGain();
      g.gain.value = gains[i];
      osc.connect(g);
      g.connect(this.engineFilter!);
      osc.start();
      this.oscs.push(osc);
    });

    // Screech: noise -> bandpass -> gain
    const screech = ctx.createBufferSource();
    screech.buffer = buf;
    screech.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 4;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 2300;
    bp2.Q.value = 6;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    screech.connect(bp);
    screech.connect(bp2);
    bp.connect(this.screechGain);
    bp2.connect(this.screechGain);
    this.screechGain.connect(this.master);
    screech.start();

    // Wind: noise -> lowpass -> gain
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(lp);
    lp.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();

    if (ctx.state === "suspended") void ctx.resume();
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    this.apply();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  /** Called every frame with the live telemetry. */
  update(t: Telemetry, dt: number) {
    if (!this.ctx || !this.engineGain || !this.engineFilter || !this.screechGain || !this.windGain) return;
    const now = this.ctx.currentTime;
    const firing = (t.rpm / 60) * (this.cylinders / 2);
    const f = Math.max(8, firing);
    this.oscs[0].frequency.setTargetAtTime(f, now, 0.03);
    this.oscs[1].frequency.setTargetAtTime(f * 0.5, now, 0.03);
    this.oscs[2].frequency.setTargetAtTime(f * 1.005, now, 0.03);
    this.oscs[3].frequency.setTargetAtTime(f * 2, now, 0.03);
    const load = t.clutch > 0.3 ? t.throttle : t.throttle * 0.7;
    let g = t.engineOn ? 0.08 + 0.2 * load + (t.rpm / 8000) * 0.12 : 0;
    if (t.limiter) {
      this.limiterPhase += dt * 28;
      if (Math.sin(this.limiterPhase * Math.PI) > 0) g *= 0.25;
    }
    if (t.shifting) g *= 0.5;
    this.engineGain.gain.setTargetAtTime(g, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(250 + load * 1600 + t.rpm * 0.18, now, 0.05);

    const slip = (t.drifting ? Math.min(1, Math.abs(t.driftAngle) / 0.6) : 0) + (t.wheelspin ? 0.7 : 0);
    const speedFactor = Math.min(1, t.speedKmh / 40);
    const screech = Math.min(0.35, slip * 0.3) * (t.wheelspin ? 1 : speedFactor);
    this.screechGain.gain.setTargetAtTime(screech, now, 0.08);
    this.windGain.gain.setTargetAtTime(Math.min(0.25, (t.speedKmh / 220) ** 2 * 0.25), now, 0.2);
  }

  private burst(duration: number, filterType: BiquadFilterType, freq: number, q: number, gain: number) {
    if (!this.ctx || !this.noiseBuffer || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  playShift() {
    this.burst(0.09, "highpass", 1800, 0.8, 0.35);
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  playGrind() {
    this.burst(0.35, "bandpass", 2800, 9, 0.5);
    this.burst(0.3, "bandpass", 3600, 12, 0.3);
  }

  playDeny() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  playStall() {
    this.burst(0.4, "lowpass", 300, 1, 0.5);
  }

  playStarter() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(18, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(26, ctx.currentTime + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.setValueAtTime(0.25, ctx.currentTime + 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  playHit() {
    this.burst(0.25, "lowpass", 220, 1, 0.8);
  }
}

export const audio = new AudioEngine();
