// Mix graph + shared helpers for every synthesized sound in the game.
//
//   [sfx bus]   ─ vol ─────────┐
//   [amb bus]   ─ vol ─ duck ──┤
//   [music bus] ─ vol ─ duck ──┼─ mix ─ glue compressor ─ limiter ─ master volume ─ speakers
//   [ui bus]    ─ vol ─────────┘
//
// Bus inputs are plain GainNodes (gain 1) that modules connect to: audio.sfx, audio.amb,
// audio.music (radio + title music), audio.uiBus. User volumes live on the 'vol' stage and
// ducking on the 'duck' stage, so neither can be clobbered by a module touching its input.

export const BUSES = ['sfx', 'amb', 'music', 'ui'];
export const BUS_LABELS = { sfx: 'Effects', amb: 'Ambience & weather', music: 'Music & radio', ui: 'Interface' };
// Defaults for players with no saved setting (round 8 mix pass: ambience and UI sit lower).
export const BUS_DEFAULTS = { sfx: 1, amb: 0.7, music: 0.75, ui: 0.55 };
export const MASTER_DEFAULT = 0.3; // owner request: 30% master for new players

// Makeup compensation for the glue compressor's automatic makeup gain (measured offline:
// a -20 dBFS sine comes out of mix->comp->limiter at about the same level it went in).
const MIX_TRIM = 0.62;

export function buildMixer(ctx, { master = MASTER_DEFAULT, levels = {} } = {}) {
  const out = ctx.createGain();
  out.gain.value = master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5;
  comp.attack.value = 0.005; comp.release.value = 0.22;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.001; lim.release.value = 0.08;
  const mix = ctx.createGain();
  mix.gain.value = MIX_TRIM;
  mix.connect(comp); comp.connect(lim); lim.connect(out); out.connect(ctx.destination);

  const bus = {};
  for (const name of BUSES) {
    const input = ctx.createGain(); input.gain.value = 1;
    const vol = ctx.createGain(); vol.gain.value = levels[name] ?? BUS_DEFAULTS[name];
    const duck = ctx.createGain(); duck.gain.value = 1;
    input.connect(vol); vol.connect(duck); duck.connect(mix);
    bus[name] = { input, vol, duck, duckLevel: 1 };
  }
  return { out, comp, lim, mix, bus };
}

// ---------------------------------------------------------------- tiny helpers shared by presets
export const rnd = (a, b) => a + Math.random() * (b - a);
// v * (1 ± amt)
export const vary = (v, amt = 0.08) => v * (1 + (Math.random() * 2 - 1) * amt);

const NOISE = new WeakMap();
// Cached noise buffers per context: 'white' | 'brown' | 'pink' | 'crackle'.
export function noiseBuf(ctx, kind = 'white') {
  let m = NOISE.get(ctx);
  if (!m) { m = {}; NOISE.set(ctx, m); }
  if (m[kind]) return m[kind];
  const sec = kind === 'crackle' ? 3 : 2;
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else if (kind === 'crackle') { d[i] = Math.random() < 0.0016 ? w * (0.4 + Math.random() * 0.6) : 0; } // sparse drips/pops
    else d[i] = w;
  }
  m[kind] = b;
  return b;
}

// Oscillator voice. env: attack a, total dur, peak vol. Optional pitch glide f2 and filter.
export function osc(ctx, dest, t, { type = 'sine', f = 440, f2 = 0, dur = 0.2, vol = 0.1, a = 0.005, filt = null, detune = 0, curve = 'exp' } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  if (curve === 'lin') g.gain.linearRampToValueAtTime(vol, t + a);
  else g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (filt) { const fl = ctx.createBiquadFilter(); fl.type = filt.type || 'lowpass'; fl.frequency.value = filt.f; fl.Q.value = filt.q ?? 0.7; o.connect(fl); n = fl; }
  n.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.03);
  return o;
}

// Filtered noise burst. f -> f2 sweeps the filter.
export function nz(ctx, dest, t, { dur = 0.1, vol = 0.1, type = 'bandpass', f = 1500, f2 = 0, q = 0.8, a = 0.003, kind = 'white', hold = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx, kind);
  const fl = ctx.createBiquadFilter();
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  if (hold) g.gain.setValueAtTime(vol, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * (s.buffer.duration - dur - 0.05 > 0 ? s.buffer.duration - dur - 0.05 : 0));
  s.stop(t + dur + 0.03);
  return s;
}

// Bell / chime: a few inharmonic sine partials with independent decays.
export function bell(ctx, dest, t, { f = 1800, dur = 0.8, vol = 0.06, partials = [[1, 1], [2.76, 0.45], [5.4, 0.2]] } = {}) {
  for (const [m, k] of partials) osc(ctx, dest, t, { type: 'sine', f: f * m, dur: dur / Math.sqrt(m), vol: vol * k, a: 0.002 });
}
