// Tiny synthesized critter sounds, positioned by distance + stereo pan from the camera.
// Routed into the ambience bus (game.audio.amb, ducked under dialogs) so the volume settings
// (and ?dev mute) apply. Each call gets a small random pitch offset so repeats don't sound identical.

let NOISE = null;
function noise(ac) {
  if (NOISE && NOISE.sampleRate === ac.sampleRate) return NOISE;
  const len = Math.floor(ac.sampleRate * 0.6);
  NOISE = ac.createBuffer(1, len, ac.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return NOISE;
}

// Output node for a sound at (x, z), or null when silent / too far / no audio yet.
function out(game, x, z, maxD, vol) {
  const A = game.audio;
  if (!A?.ctx || !A.sfx || A.ctx.state !== 'running') return null;
  const cam = game.camera.position;
  const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz);
  if (d > maxD) return null;
  const k = 1 - d / maxD, g = vol * k * k;
  if (g < 0.004) return null;
  const ac = A.ctx, gain = ac.createGain();
  gain.gain.value = g;
  if (ac.createStereoPanner) {
    const pan = ac.createStereoPanner();
    const e = game.camera.matrixWorld.elements; // camera right axis = (e0, e1, e2)
    const rl = Math.hypot(e[0], e[2]) || 1;
    pan.pan.value = Math.max(-0.8, Math.min(0.8, ((dx * e[0] + dz * e[2]) / rl / (d || 1)) * 0.8));
    gain.connect(pan); pan.connect(A.amb || A.sfx);
  } else gain.connect(A.amb || A.sfx);
  return { ac, dest: gain, t: ac.currentTime + 0.01 + Math.random() * 0.02, p: 0.94 + Math.random() * 0.12 };
}

function env(ac, g, t, a, peak, dur) {
  g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(o, type, f0, f1, t, dur, peak, filt) {
  const { ac, dest } = o;
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.type = type;
  const p = o.p || 1;
  osc.frequency.setValueAtTime(f0 * p, t);
  osc.frequency.exponentialRampToValueAtTime(f1 * p, t + dur);
  env(ac, g, t, Math.min(0.012, dur * 0.2), peak, dur);
  let n = osc;
  if (filt) { const f = ac.createBiquadFilter(); f.type = filt.type ?? 'bandpass'; f.frequency.value = filt.f; f.Q.value = filt.q ?? 1; osc.connect(f); n = f; }
  n.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + dur + 0.05);
  return osc;
}

function burst(o, t, dur, peak, f, q = 1, type = 'bandpass') {
  const { ac, dest } = o;
  const src = ac.createBufferSource(); src.buffer = noise(ac);
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ac.createGain(); env(ac, g, t, 0.006, peak, dur);
  src.connect(fl).connect(g).connect(dest);
  src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.05);
}

export const SFX = {
  // scruffy two-three note "ruff ruff"
  bark(game, x, z, pitch = 1, n = 2) {
    const o = out(game, x, z, 70, 0.3); if (!o) return; // (was 0.55: a close dog out-barked gunfire)
    for (let i = 0; i < n; i++) {
      const t = o.t + i * (0.2 + Math.random() * 0.06);
      tone(o, 'sawtooth', 430 * pitch, 210 * pitch, t, 0.13, 0.5, { f: 950 * pitch, q: 1.3 });
      tone(o, 'square', 300 * pitch, 160 * pitch, t, 0.1, 0.12, { type: 'lowpass', f: 700 });
      burst(o, t, 0.06, 0.25, 1400 * pitch, 0.8);
    }
  },
  whimper(game, x, z) {
    const o = out(game, x, z, 30, 0.25); if (!o) return;
    tone(o, 'sine', 820, 1250, o.t, 0.18, 0.4);
    tone(o, 'sine', 1250, 640, o.t + 0.18, 0.3, 0.35);
  },
  // wing flutter for a flock taking off
  flap(game, x, z, n = 6) {
    const o = out(game, x, z, 45, 0.35 + Math.min(0.35, n * 0.04)); if (!o) return;
    const { ac, dest } = o;
    const src = ac.createBufferSource(); src.buffer = noise(ac);
    const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1100; fl.Q.value = 0.7;
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 15 + Math.random() * 5;
    const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    const g = ac.createGain(); env(ac, g, o.t, 0.02, 0.9, 0.75);
    src.connect(fl).connect(am).connect(g).connect(dest);
    src.start(o.t); src.stop(o.t + 0.8); lfo.start(o.t); lfo.stop(o.t + 0.8);
  },
  coo(game, x, z) {
    const o = out(game, x, z, 14, 0.2); if (!o) return;
    tone(o, 'sine', 310, 270, o.t, 0.22, 0.4, { type: 'lowpass', f: 600 });
    tone(o, 'sine', 330, 260, o.t + 0.26, 0.38, 0.35, { type: 'lowpass', f: 600 });
  },
  caw(game, x, z) {
    const o = out(game, x, z, 80, 0.22); if (!o) return;
    const n = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const t = o.t + i * 0.36;
      tone(o, 'sawtooth', 560, 420, t, 0.24, 0.45, { f: 1150, q: 2.5 });
      burst(o, t, 0.18, 0.12, 1800, 1.5);
    }
  },
  gull(game, x, z) {
    const o = out(game, x, z, 110, 0.2); if (!o) return;
    const t = o.t;
    tone(o, 'triangle', 1350, 1900, t, 0.12, 0.35, { f: 1700, q: 1.5 });
    tone(o, 'triangle', 1900, 1050, t + 0.12, 0.3, 0.3, { f: 1500, q: 1.5 });
    if (Math.random() < 0.5) { tone(o, 'triangle', 1500, 1800, t + 0.55, 0.1, 0.25, { f: 1700, q: 1.5 }); tone(o, 'triangle', 1800, 1100, t + 0.65, 0.22, 0.22, { f: 1500, q: 1.5 }); }
  },
  squeak(game, x, z) {
    const o = out(game, x, z, 14, 0.18); if (!o) return;
    tone(o, 'sine', 3300, 4300, o.t, 0.05, 0.35);
    tone(o, 'sine', 3600, 4500, o.t + 0.09, 0.05, 0.3);
  },
  plip(game, x, z) {
    const o = out(game, x, z, 40, 0.35); if (!o) return;
    tone(o, 'sine', 700, 220, o.t, 0.09, 0.4);
    burst(o, o.t, 0.12, 0.25, 900, 0.6, 'lowpass');
  },
  rustle(game, x, z) {
    const o = out(game, x, z, 18, 0.12); if (!o) return;
    burst(o, o.t, 0.35, 0.5, 2600, 0.6);
  },
};
