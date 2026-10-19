// Synthesized vehicle sounds routed into game.audio.sfx (so the global volume
// slider applies). Falls back to a private AudioContext if the audio module
// isn't installed. Engine = detuned saw + square through a low-pass whose
// pitch follows a fake gearbox RPM.

const ENGINE = {
  bike: null,
  moped: { base: 85, range: 170, wave: 'square', cutoff: 1400, vol: 0.09 },
  moto: { base: 52, range: 210, wave: 'sawtooth', cutoff: 1500, vol: 0.13 },
  car: { base: 36, range: 120, wave: 'sawtooth', cutoff: 900, vol: 0.13 },
  truck: { base: 28, range: 80, wave: 'sawtooth', cutoff: 650, vol: 0.15 },
  sports: { base: 52, range: 230, wave: 'sawtooth', cutoff: 1800, vol: 0.13 },
  muscle: { base: 32, range: 125, wave: 'square', cutoff: 800, vol: 0.15 },
};

export function engineProfile(def) {
  if (def.kind === 'bike') return null;
  if (def.model === 'moped') return ENGINE.moped;
  if (def.kind === 'moto') return ENGINE.moto;
  if (def.model === 'sports') return ENGINE.sports;
  if (def.model === 'muscle') return ENGINE.muscle;
  if (def.kind === 'truck') return ENGINE.truck;
  return ENGINE.car;
}

export class CarAudio {
  constructor(game) {
    this.game = game;
    this.own = null;
    this.engine = null;
    this.hornNodes = null;
    this.skidGain = null;
    const unlock = () => this.ctx;
    addEventListener('keydown', unlock);
    addEventListener('mousedown', unlock);
  }

  get ctx() {
    const a = this.game.audio;
    if (a?.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume?.(); return a.ctx; }
    if (a) return null; // audio module will create it on the first gesture
    if (!this.own) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.own = new AC();
        this.ownOut = this.own.createGain();
        this.ownOut.gain.value = 0.5;
        this.ownOut.connect(this.own.destination);
      } catch { return null; }
    }
    return this.own;
  }

  get out() { return this.game.audio?.sfx || this.ownOut || null; }

  _noise(ctx) {
    if (this._nbuf && this._nbuf.sampleRate === ctx.sampleRate) return this._nbuf;
    const len = ctx.sampleRate * 1.5;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nbuf = b;
    return b;
  }

  // ---- engine (player's car only) ----
  startEngine(def) {
    this.stopEngine();
    const prof = engineProfile(def);
    const ctx = this.ctx, out = this.out;
    if (!prof || !ctx || !out) { this._pendingDef = prof ? def : null; return; }
    this._pendingDef = null;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = prof.wave; o2.type = 'square';
    o1.frequency.value = prof.base; o2.frequency.value = prof.base * 0.5;
    o2.detune.value = 9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = prof.cutoff; lp.Q.value = 2.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    o1.connect(lp); o2.connect(g2).connect(lp);
    lp.connect(g).connect(out);
    // Skid: band-passed noise.
    const n = ctx.createBufferSource(); n.buffer = this._noise(ctx); n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
    const sg = ctx.createGain(); sg.gain.value = 0;
    n.connect(bp).connect(sg).connect(out);
    o1.start(); o2.start(); n.start();
    g.gain.setTargetAtTime(prof.vol * 0.6, ctx.currentTime, 0.1);
    this.engine = { o1, o2, lp, g, n, sg, prof };
  }

  stopEngine() {
    const e = this.engine;
    this._pendingDef = null;
    if (!e) return;
    this.engine = null;
    const ctx = this.ctx;
    try {
      const t = ctx.currentTime;
      e.g.gain.setTargetAtTime(0, t, 0.08);
      e.sg.gain.setTargetAtTime(0, t, 0.05);
      e.o1.stop(t + 0.4); e.o2.stop(t + 0.4); e.n.stop(t + 0.4);
    } catch { /* ignore */ }
  }

  // rpm 0..1, throttle 0..1, skid 0..1, muted when a menu is open
  updateEngine(rpm, throttle, skid, muted, def) {
    if (!this.engine && this._pendingDef && this.ctx) this.startEngine(this._pendingDef);
    if (!this.engine && def && !this._pendingDef && engineProfile(def) && !this.ctx) this._pendingDef = def;
    const e = this.engine;
    if (!e) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, p = e.prof;
    const f = p.base + rpm * p.range;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(p.cutoff * (0.6 + throttle * 0.8 + rpm * 0.6), t, 0.08);
    e.g.gain.setTargetAtTime(muted ? p.vol * 0.12 : p.vol * (0.45 + throttle * 0.55), t, 0.08);
    e.sg.gain.setTargetAtTime(muted ? 0 : Math.min(1, skid) * 0.22, t, 0.05);
  }

  // ---- horn ----
  horn(on, meep = false) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    if (on && !this.hornNodes) {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const fs = meep ? [620, 780] : [347, 440];
      const os = fs.map((fr) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(lp); o.start(); return o; });
      lp.connect(g).connect(out);
      g.gain.setTargetAtTime(meep ? 0.06 : 0.1, ctx.currentTime, 0.01);
      this.hornNodes = { g, os };
    } else if (!on && this.hornNodes) {
      const { g, os } = this.hornNodes;
      this.hornNodes = null;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      os.forEach((o) => o.stop(ctx.currentTime + 0.15));
    }
  }

  // One-shot honk from somewhere in the world (traffic).
  honk(dist = 10, angry = false) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const vol = Math.max(0, 0.09 * (1 - dist / 70));
    if (vol <= 0.002) return;
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 - dist * 15;
    lp.connect(g).connect(out);
    const pitch = 0.85 + Math.random() * 0.4;
    for (const fr of [330 * pitch, 415 * pitch]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(lp);
      o.start(t); o.stop(t + (angry ? 1.1 : 0.5));
    }
    if (angry) {
      g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(0.0001, t + 0.18);
      g.gain.setValueAtTime(vol, t + 0.3); g.gain.setValueAtTime(0.0001, t + 0.45);
      g.gain.setValueAtTime(vol, t + 0.6); g.gain.setTargetAtTime(0, t + 1.0, 0.03);
    } else {
      g.gain.setTargetAtTime(vol, t, 0.01); g.gain.setTargetAtTime(0, t + 0.42, 0.03);
    }
  }

  // Noise burst: crashes, glass, explosions.
  burst({ vol = 0.3, dur = 0.25, freq = 600, endFreq = 120, type = 'lowpass', dist = 0 } = {}) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const v = vol * Math.max(0, 1 - dist / 90);
    if (v < 0.003) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this._noise(ctx);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    n.connect(f).connect(g).connect(out);
    n.start(t); n.stop(t + dur + 0.05);
  }

  crash(strength = 0.5, dist = 0) {
    this.burst({ vol: 0.12 + strength * 0.35, dur: 0.18 + strength * 0.3, freq: 900, endFreq: 90, dist });
    if (strength > 0.4) this.burst({ vol: 0.12 * strength, dur: 0.25, freq: 4500, endFreq: 1800, type: 'highpass', dist });
  }

  glass() { this.burst({ vol: 0.25, dur: 0.35, freq: 6000, endFreq: 2500, type: 'highpass' }); }

  thud(dist = 0) { this.burst({ vol: 0.3, dur: 0.15, freq: 300, endFreq: 60, dist }); }

  explosion(dist = 0) {
    this.burst({ vol: 0.9, dur: 1.6, freq: 1200, endFreq: 40, dist });
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * Math.max(0, 1 - dist / 90), t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    o.connect(g).connect(out); o.start(t); o.stop(t + 1);
  }

  whoosh() { this.burst({ vol: 0.25, dur: 0.8, freq: 300, endFreq: 2500, type: 'bandpass' }); }

  beep(freq = 660, dur = 0.15, vol = 0.12) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + dur, 0.02);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.2);
  }
}
