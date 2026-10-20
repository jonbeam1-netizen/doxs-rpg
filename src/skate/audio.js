// Skate sounds routed through game.audio.sfx (so the volume setting and ?dev muting apply).
// The owner's recordings (assets/sfx/skate: wheel roll loop, ollie pop/land, bails) are used when
// decoded; the original synth patches are the fallback. Everything no-ops until the context runs.
export class SkateAudio {
  constructor(game) {
    this.game = game;
    this.rumble = null;
    this.motor = null;
    this._noise = null;
  }

  // Only while running: a suspended context (?dev / ?mute) would pile up nodes that never stop.
  get ctx() { const c = this.game.audio?.ctx; return c && c.state === 'running' ? c : null; }
  get out() { return this.game.audio?.sfx || null; }

  _noiseBuf() {
    const ctx = this.ctx;
    if (this._noise && this._noise.sampleRate === ctx.sampleRate) return this._noise;
    const len = ctx.sampleRate * 1.5;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    this._noise = b;
    return b;
  }

  // Continuous wheel rumble (and an electric motor whine for the e-board).
  start(electric = false) {
    const ctx = this.ctx, out = this.out;
    this._electric = electric;
    this._want = true;
    if (!ctx || !out || this.rumble) return;
    try {
      const rec = this.game.audio?.samples?.loop?.('skate_roll', { vol: 0 });
      if (rec) {
        this.rumble = { rec, gain: rec.gain };
      } else {
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuf(); src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180; bp.Q.value = 0.9;
        const gain = ctx.createGain(); gain.gain.value = 0;
        src.connect(bp); bp.connect(gain); gain.connect(out);
        src.start();
        src._tag = 'skate-rumble';
        this.rumble = { src, bp, gain };
      }
      if (electric) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 80;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        const g = ctx.createGain(); g.gain.value = 0;
        osc.connect(lp); lp.connect(g); g.connect(out); osc.start(); osc._tag = 'skate-motor';
        this.motor = { osc, g };
      }
    } catch (e) { this.rumble = null; }
  }

  update(speed, grounded, motoring) {
    const ctx = this.ctx;
    if (!ctx) return;
    // mounted before the context ran / the recording decoded: (re)build the wheel loop now
    if (this._want && (!this.rumble || (!this.rumble.rec && this.game.audio?.samples?.has?.('skate_roll')))) {
      const e = this._electric; this.stop(); this._want = true; this.start(e);
    }
    if (!this.rumble) return;
    this.game.audio?.keepAlive?.('skate-roll', () => this.stop());
    const now = ctx.currentTime;
    const k = Math.min(1, speed / 18);
    if (this.rumble.rec) {
      // recorded roll: level and playback rate follow speed (slow roll = lower, duller)
      this.rumble.rec.setVol(grounded && speed > 0.4 ? 0.25 + k * 0.75 : 0, 0.06);
      this.rumble.rec.setRate(0.75 + k * 0.45, 0.1);
    } else {
      const target = grounded && speed > 0.4 ? 0.03 + k * 0.15 : 0;
      this.rumble.gain.gain.setTargetAtTime(target, now, 0.05);
      this.rumble.bp.frequency.setTargetAtTime(120 + k * 520 + Math.random() * 30, now, 0.05);
    }
    if (this.motor) {
      this.motor.g.gain.setTargetAtTime(motoring ? 0.05 + k * 0.05 : 0, now, 0.08);
      this.motor.osc.frequency.setTargetAtTime(70 + k * 380, now, 0.1);
    }
  }

  stop() {
    const ctx = this.ctx;
    this._want = false;
    for (const n of [this.rumble, this.motor]) {
      if (!n) continue;
      if (n.rec) { n.rec.stop(0.08); continue; }
      try { (n.src || n.osc).stop(ctx ? ctx.currentTime + 0.05 : 0); } catch { /* ignore */ }
      try { (n.gain || n.g).disconnect(); } catch { /* ignore */ }
    }
    this.rumble = null; this.motor = null;
  }

  // One-shots ------------------------------------------------------------
  _burst({ dur = 0.08, freq = 2000, type = 'highpass', vol = 0.4, q = 0.8, delay = 0 } = {}) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq * (0.9 + Math.random() * 0.2); f.Q.value = q;
    vol *= 0.6 * (0.85 + Math.random() * 0.3); // trimmed: the board was louder than gunfire
    const g = ctx.createGain();
    g.gain.value = vol;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  _thump(f0 = 160, f1 = 50, dur = 0.12, vol = 0.5, delay = 0) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const pr = 0.92 + Math.random() * 0.16; vol *= 0.6;
    o.frequency.setValueAtTime(f0 * pr, t); o.frequency.exponentialRampToValueAtTime(f1 * pr, t + dur);
    const g = ctx.createGain(); g.gain.value = vol; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }

  play(name) {
    try {
      const S = this.game.audio?.samples;
      const rec = { pop: 'skate_pop', land: 'skate_land', bail: 'skate_bail' }[name];
      if (rec && S?.has(rec) && this.ctx) {
        S.play(rec);
        if (name === 'land') this._thump(140, 45, 0.1, 0.25); // a little low end under the recorded slap
        return;
      }
      switch (name) {
        case 'pop': this._burst({ dur: 0.05, freq: 1800, vol: 0.5 }); this._thump(220, 70, 0.09, 0.45); break;
        case 'flip': this._burst({ dur: 0.18, freq: 900, type: 'bandpass', vol: 0.18, q: 2 }); break;
        case 'land': this._burst({ dur: 0.06, freq: 1400, vol: 0.45 }); this._thump(140, 45, 0.12, 0.55); this._burst({ dur: 0.05, freq: 1600, vol: 0.3, delay: 0.035 }); break;
        case 'bail': this._thump(110, 35, 0.3, 0.8); this._burst({ dur: 0.35, freq: 500, type: 'lowpass', vol: 0.5 }); this._burst({ dur: 0.08, freq: 2400, vol: 0.4, delay: 0.25 }); break;
        case 'push': this._burst({ dur: 0.07, freq: 700, type: 'bandpass', vol: 0.12, q: 1.5 }); break;
        case 'mount': this._thump(180, 90, 0.07, 0.35); this._burst({ dur: 0.04, freq: 2200, vol: 0.25 }); break;
        case 'slide': this._burst({ dur: 0.25, freq: 3000, type: 'bandpass', vol: 0.15, q: 3 }); break;
        default: break;
      }
    } catch { /* audio is cosmetic */ }
  }
}
