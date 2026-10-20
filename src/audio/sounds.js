// Synth patches. Every preset is (ctx, dest, t, opts) and schedules its nodes into `dest`
// starting at time t. They never touch game state, so they can be rendered offline for
// level checks. Levels are tuned so a single hit peaks around -12..-20 dBFS before the
// mix compressor; repeated sounds get small random pitch / level / timing variation.
import { osc, nz, bell, vary, rnd, noiseBuf } from './mixer.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- footsteps
// surface: 'pavement' | 'wet' | 'dirt' | 'sand' | 'wood' | 'metal'; k = loudness 0..1 (run ~1, walk ~0.6)
function step(ctx, d, t, { surface = 'pavement', k = 0.6 } = {}) {
  const v = vary(k, 0.15);
  switch (surface) {
    case 'dirt': // gravelly crunch: a few tiny grains
      for (let i = 0; i < 3; i++) nz(ctx, d, t + i * rnd(0.008, 0.016), { dur: 0.035, vol: 0.05 * v, type: 'bandpass', f: rnd(1800, 3200), q: 1.4 });
      nz(ctx, d, t, { dur: 0.07, vol: 0.06 * v, type: 'lowpass', f: 700, kind: 'pink' });
      break;
    case 'sand':
      nz(ctx, d, t, { dur: 0.13, vol: 0.06 * v, type: 'lowpass', f: vary(900, 0.15), f2: 400, a: 0.02, kind: 'pink' });
      nz(ctx, d, t + 0.01, { dur: 0.08, vol: 0.02 * v, type: 'highpass', f: 3500, a: 0.015 });
      break;
    case 'wood': // hollow board knock
      osc(ctx, d, t, { type: 'triangle', f: vary(210, 0.1), f2: 120, dur: 0.09, vol: 0.09 * v, a: 0.002 });
      nz(ctx, d, t, { dur: 0.05, vol: 0.06 * v, type: 'bandpass', f: vary(650, 0.12), q: 2 });
      if (Math.random() < 0.15) osc(ctx, d, t + 0.03, { type: 'sine', f: rnd(300, 420), f2: 260, dur: 0.12, vol: 0.012 * v }); // creak
      break;
    case 'metal': // grated bridge deck: dull clank with inharmonic ring
      nz(ctx, d, t, { dur: 0.03, vol: 0.06 * v, type: 'highpass', f: 2500 });
      osc(ctx, d, t, { type: 'sine', f: vary(480, 0.06), dur: 0.16, vol: 0.035 * v, a: 0.001 });
      osc(ctx, d, t, { type: 'sine', f: vary(1310, 0.06), dur: 0.1, vol: 0.018 * v, a: 0.001 });
      osc(ctx, d, t, { type: 'sine', f: 120, f2: 70, dur: 0.06, vol: 0.06 * v });
      break;
    case 'wet':
      nz(ctx, d, t, { dur: 0.04, vol: 0.05 * v, type: 'bandpass', f: vary(2000, 0.15), q: 1.2 });
      nz(ctx, d, t + 0.012, { dur: 0.1, vol: 0.04 * v, type: 'highpass', f: vary(2600, 0.2), a: 0.006 }); // splash
      osc(ctx, d, t, { type: 'sine', f: 110, f2: 60, dur: 0.05, vol: 0.05 * v });
      break;
    default: // pavement: heel scuff + soft thump
      nz(ctx, d, t, { dur: 0.045, vol: 0.055 * v, type: 'bandpass', f: vary(2100, 0.2), q: 1.1 });
      osc(ctx, d, t, { type: 'sine', f: vary(115, 0.1), f2: 60, dur: 0.055, vol: 0.07 * v });
      break;
  }
}
function land(ctx, d, t, { surface = 'pavement', k = 1 } = {}) {
  osc(ctx, d, t, { type: 'sine', f: vary(95, 0.08), f2: 42, dur: 0.14, vol: 0.14 * k });
  step(ctx, d, t, { surface, k: 1.3 * k });
  step(ctx, d, t + rnd(0.03, 0.05), { surface, k: 0.7 * k });
}

// ---------------------------------------------------------------- doors, shops, money
function doorOpen(ctx, d, t) {
  // latch click, then a short hinge creak
  nz(ctx, d, t, { dur: 0.03, vol: 0.09, type: 'bandpass', f: 3200, q: 2 });
  osc(ctx, d, t + 0.005, { type: 'triangle', f: 900, f2: 700, dur: 0.03, vol: 0.03 });
  const c = osc(ctx, d, t + 0.06, { type: 'sawtooth', f: vary(330, 0.15), f2: vary(520, 0.1), dur: 0.32, vol: 0.022, a: 0.04, filt: { type: 'bandpass', f: 1100, q: 4 } });
  c.detune.setValueAtTime(0, t + 0.06); c.detune.linearRampToValueAtTime(rnd(-60, 60), t + 0.25);
  nz(ctx, d, t + 0.05, { dur: 0.35, vol: 0.025, type: 'lowpass', f: 500, kind: 'pink', a: 0.08 }); // air whoosh
}
function doorClose(ctx, d, t) {
  osc(ctx, d, t, { type: 'sine', f: vary(85, 0.1), f2: 45, dur: 0.18, vol: 0.13 });
  nz(ctx, d, t, { dur: 0.12, vol: 0.08, type: 'lowpass', f: 900, f2: 200 });
  nz(ctx, d, t + 0.04, { dur: 0.03, vol: 0.05, type: 'bandpass', f: 2800, q: 2 }); // latch
}
function shopBell(ctx, d, t) {
  const f = vary(2350, 0.03);
  bell(ctx, d, t, { f, dur: 0.9, vol: 0.035 });
  bell(ctx, d, t + rnd(0.1, 0.14), { f: f * 1.06, dur: 0.8, vol: 0.026 });
  if (Math.random() < 0.5) bell(ctx, d, t + rnd(0.22, 0.28), { f: f * 0.98, dur: 0.6, vol: 0.014 });
}
function kaching(ctx, d, t) {
  // "ka": key + mechanism; drawer slide; "ching": bell
  nz(ctx, d, t, { dur: 0.03, vol: 0.08, type: 'bandpass', f: 2600, q: 1.5 });
  osc(ctx, d, t, { type: 'triangle', f: 320, f2: 180, dur: 0.05, vol: 0.05 });
  nz(ctx, d, t + 0.05, { dur: 0.16, vol: 0.05, type: 'bandpass', f: 900, f2: 450, q: 1.2, a: 0.02 });
  osc(ctx, d, t + 0.2, { type: 'sine', f: 90, f2: 55, dur: 0.08, vol: 0.06 }); // drawer stop
  const f = vary(2637, 0.02);
  bell(ctx, d, t + 0.19, { f, dur: 0.75, vol: 0.04, partials: [[1, 1], [1.5, 0.5], [2.76, 0.3], [4.1, 0.12]] });
}
function coin(ctx, d, t, { n = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const s = t + i * rnd(0.05, 0.08);
    const f = vary(2900, 0.08);
    osc(ctx, d, s, { type: 'sine', f, dur: 0.18, vol: 0.03, a: 0.001 });
    osc(ctx, d, s, { type: 'sine', f: f * 2.41, dur: 0.1, vol: 0.012, a: 0.001 });
    osc(ctx, d, s + 0.045, { type: 'sine', f: f * 1.335, dur: 0.24, vol: 0.026, a: 0.001 });
  }
}
function cash(ctx, d, t, { big = false } = {}) {
  // paper riffle (bills) + a couple of coins
  const n = big ? 6 : 3;
  for (let i = 0; i < n; i++) nz(ctx, d, t + i * rnd(0.03, 0.05), { dur: 0.04, vol: 0.035, type: 'bandpass', f: rnd(2800, 4200), q: 1.2 });
  coin(ctx, d, t + n * 0.035, { n: big ? 2 : 1 });
}
function moneyLoss(ctx, d, t) {
  // a few coins dribbling away, falling pitch
  for (let i = 0; i < 4; i++) {
    const s = t + i * (0.11 - i * 0.015);
    osc(ctx, d, s, { type: 'sine', f: vary(2400 - i * 260, 0.04), dur: 0.12, vol: 0.022 - i * 0.003, a: 0.001 });
  }
  osc(ctx, d, t + 0.05, { type: 'triangle', f: 330, f2: 230, dur: 0.4, vol: 0.025, a: 0.03, filt: { f: 900 } });
}

// ---------------------------------------------------------------- jingles & stings
function arp(ctx, d, t, notes, { step = 0.075, dur = 0.35, vol = 0.04, type = 'triangle', cutoff = 2400 } = {}) {
  notes.forEach((m, i) => {
    osc(ctx, d, t + i * step, { type, f: mtof(m), dur, vol, a: 0.006, filt: { f: cutoff } });
    osc(ctx, d, t + i * step, { type: 'sine', f: mtof(m + 12), dur: dur * 0.7, vol: vol * 0.25 });
  });
}
function chord(ctx, d, t, notes, { dur = 1.2, vol = 0.025, a = 0.03, cutoff = 1400 } = {}) {
  for (const m of notes) for (const dt of [-6, 6]) osc(ctx, d, t, { type: 'sawtooth', f: mtof(m), dur, vol, a, detune: dt, filt: { f: cutoff, q: 0.6 }, curve: 'lin' });
}
function levelup(ctx, d, t) {
  arp(ctx, d, t, [60, 64, 67, 72, 76], { step: 0.07, vol: 0.045 });
  chord(ctx, d, t + 0.36, [60, 67, 72, 76], { dur: 1.3, vol: 0.016, cutoff: 1800 });
  osc(ctx, d, t + 0.36, { type: 'sine', f: mtof(48), dur: 1.0, vol: 0.06, a: 0.02 });
  bell(ctx, d, t + 0.36, { f: mtof(88), dur: 1.0, vol: 0.02 });
}
function promoted(ctx, d, t) {
  arp(ctx, d, t, [55, 60, 64, 67], { step: 0.09, vol: 0.04 });
  chord(ctx, d, t + 0.36, [55, 59, 62, 67], { dur: 0.9, vol: 0.014 });
}
function questStart(ctx, d, t) {
  osc(ctx, d, t, { type: 'triangle', f: mtof(57), dur: 0.5, vol: 0.04, a: 0.01, filt: { f: 1500 } });
  osc(ctx, d, t + 0.14, { type: 'triangle', f: mtof(60), dur: 0.5, vol: 0.04, a: 0.01, filt: { f: 1500 } });
  osc(ctx, d, t + 0.28, { type: 'triangle', f: mtof(64), dur: 0.9, vol: 0.045, a: 0.01, filt: { f: 1500 } });
  osc(ctx, d, t, { type: 'sine', f: mtof(45), dur: 1.1, vol: 0.05, a: 0.05 });
}
function questStep(ctx, d, t) {
  const root = 67 + (Math.random() < 0.5 ? 0 : 2);
  osc(ctx, d, t, { type: 'triangle', f: mtof(root), dur: 0.35, vol: 0.04, filt: { f: 2200 } });
  osc(ctx, d, t + 0.1, { type: 'triangle', f: mtof(root + 5), dur: 0.6, vol: 0.045, filt: { f: 2200 } });
  bell(ctx, d, t + 0.1, { f: mtof(root + 29), dur: 0.6, vol: 0.012 });
}
function questDone(ctx, d, t) {
  arp(ctx, d, t, [60, 64, 67], { step: 0.09, vol: 0.04 });
  chord(ctx, d, t + 0.27, [53, 60, 65, 69], { dur: 0.6, vol: 0.016 });
  chord(ctx, d, t + 0.75, [55, 62, 67, 71], { dur: 0.45, vol: 0.016 });
  chord(ctx, d, t + 1.1, [60, 64, 67, 72], { dur: 1.6, vol: 0.02, cutoff: 1900 });
  osc(ctx, d, t + 1.1, { type: 'sine', f: mtof(36), dur: 1.4, vol: 0.07, a: 0.02 });
  nz(ctx, d, t + 1.1, { dur: 1.2, vol: 0.012, type: 'highpass', f: 7000, a: 0.005 }); // cymbal-ish wash
}
function fail(ctx, d, t) {
  [64, 63, 62].forEach((m, i) => osc(ctx, d, t + i * 0.22, { type: 'triangle', f: mtof(m - 12), dur: i === 2 ? 0.7 : 0.24, vol: 0.05, filt: { f: 900 } }));
}

// ---------------------------------------------------------------- UI (soft, short, varied)
function uiClick(ctx, d, t) {
  osc(ctx, d, t, { type: 'sine', f: vary(1500, 0.06), f2: 1100, dur: 0.035, vol: 0.03, a: 0.001 });
  nz(ctx, d, t, { dur: 0.012, vol: 0.02, type: 'highpass', f: 4000 });
}
function uiHover(ctx, d, t) {
  osc(ctx, d, t, { type: 'sine', f: vary(2300, 0.05), dur: 0.022, vol: 0.008, a: 0.001 });
}
function uiOpen(ctx, d, t) {
  osc(ctx, d, t, { type: 'triangle', f: vary(520, 0.03), f2: 820, dur: 0.09, vol: 0.035, filt: { f: 2500 } });
  nz(ctx, d, t, { dur: 0.08, vol: 0.012, type: 'bandpass', f: 1200, f2: 3000, q: 0.8 });
}
function uiClose(ctx, d, t) {
  osc(ctx, d, t, { type: 'triangle', f: vary(760, 0.03), f2: 470, dur: 0.09, vol: 0.03, filt: { f: 2500 } });
}
function uiError(ctx, d, t) {
  osc(ctx, d, t, { type: 'triangle', f: 196, dur: 0.12, vol: 0.05, filt: { f: 700 } });
  osc(ctx, d, t + 0.11, { type: 'triangle', f: 185, dur: 0.16, vol: 0.05, filt: { f: 700 } });
}
function uiText(ctx, d, t) {
  bell(ctx, d, t, { f: vary(1480, 0.01), dur: 0.35, vol: 0.03, partials: [[1, 1], [2, 0.2]] });
  bell(ctx, d, t + 0.13, { f: 1975, dur: 0.45, vol: 0.03, partials: [[1, 1], [2, 0.2]] });
}
function uiPerk(ctx, d, t) {
  arp(ctx, d, t, [72, 76, 79], { step: 0.06, dur: 0.3, vol: 0.035 });
  bell(ctx, d, t + 0.12, { f: mtof(91), dur: 0.6, vol: 0.012 });
}
function achievement(ctx, d, t) {
  arp(ctx, d, t, [60, 64, 67, 72], { step: 0.09, dur: 0.4, vol: 0.04 });
  arp(ctx, d, t + 0.42, [67, 72], { step: 0.08, dur: 0.6, vol: 0.04 });
  chord(ctx, d, t + 0.5, [48, 60, 64, 67], { dur: 1.1, vol: 0.013, cutoff: 1600 });
  bell(ctx, d, t + 0.5, { f: mtof(96), dur: 1.0, vol: 0.012 });
}

// ---------------------------------------------------------------- weather & world
function thunder(ctx, d, t, { near = 0.5 } = {}) {
  // near 0..1: close strikes get a crack, everything gets a long irregular rumble
  if (near > 0.55) {
    nz(ctx, d, t, { dur: 0.35, vol: 0.12 * near, type: 'highpass', f: 1800, f2: 600, a: 0.002 });
    nz(ctx, d, t + 0.02, { dur: 0.6, vol: 0.18 * near, type: 'lowpass', f: 2500, f2: 300, a: 0.004 });
  }
  const len = 2.5 + near * 2.5;
  const n = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const s = t + 0.05 + (i / n) * len * 0.6 + rnd(0, 0.3);
    nz(ctx, d, s, { dur: rnd(0.9, 1.8), vol: (0.12 + 0.12 * near) * rnd(0.5, 1) * (1 - i / (n + 2)), type: 'lowpass', f: 120 + near * 260, q: 0.5, a: rnd(0.05, 0.25), kind: 'brown' });
  }
  osc(ctx, d, t + 0.05, { type: 'sine', f: 48, f2: 30, dur: len * 0.7, vol: 0.05 + 0.06 * near, a: 0.3 });
}
function gust(ctx, d, t, { k = 1 } = {}) {
  const len = rnd(2.2, 4.5);
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx, 'white');
  s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  const f0 = rnd(280, 420);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.linearRampToValueAtTime(f0 * rnd(2, 2.8), t + len * 0.45);
  bp.frequency.linearRampToValueAtTime(f0 * 1.2, t + len);
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06 * k, t + len * 0.4);
  g.gain.linearRampToValueAtTime(0.035 * k, t + len * 0.65);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  s.connect(bp); bp.connect(g); g.connect(d);
  s.start(t, Math.random()); s.stop(t + len + 0.05);
}
// One muffled voice "blurb": a buzzy glottal source through two vowel formants with
// syllable-rate amplitude wobble. Pitch, vowel and length randomized.
const VOWELS = [[700, 1220], [530, 1840], [400, 2000], [300, 870], [640, 1190], [490, 1350]];
function voice(ctx, d, t, { pitch = 0 } = {}) {
  const f0 = pitch || (Math.random() < 0.5 ? rnd(95, 140) : rnd(170, 240));
  const len = rnd(0.35, 1.1);
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  const syl = Math.max(2, Math.round(len * rnd(4, 6)));
  for (let i = 1; i <= syl; i++) o.frequency.linearRampToValueAtTime(f0 * rnd(0.88, 1.15), t + (i / syl) * len);
  const mix = ctx.createGain(); mix.gain.value = 1;
  const vw = VOWELS[(Math.random() * VOWELS.length) | 0];
  for (const [fi, gk] of [[0, 1], [1, 0.5]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = vw[fi] * rnd(0.9, 1.1); bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = gk;
    o.connect(bp); bp.connect(g); g.connect(mix);
  }
  const am = ctx.createGain();
  am.gain.value = 0.0001;
  am.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < syl; i++) {
    const s = t + (i / syl) * len;
    am.gain.linearRampToValueAtTime(rnd(0.5, 1) * 0.09, s + 0.04);
    am.gain.linearRampToValueAtTime(0.012, s + len / syl * 0.9);
  }
  am.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
  mix.connect(lp); lp.connect(am); am.connect(d);
  o.start(t); o.stop(t + len + 0.1);
}
function laugh(ctx, d, t) {
  const f0 = rnd(150, 260), n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const s = t + i * rnd(0.13, 0.17);
    osc(ctx, d, s, { type: 'sawtooth', f: f0 * (1 - i * 0.03), f2: f0 * 0.85, dur: 0.1, vol: 0.05, a: 0.01, filt: { type: 'bandpass', f: 800, q: 3 } });
    nz(ctx, d, s, { dur: 0.08, vol: 0.02, type: 'bandpass', f: 1500, q: 1.5 });
  }
}

export const PRESETS = {
  step, land, doorOpen, doorClose, shopBell, kaching, coin, cash, moneyLoss,
  levelup, promoted, questStart, questStep, questDone, fail,
  uiClick, uiHover, uiOpen, uiClose, uiError, uiText, uiPerk, achievement,
  thunder, gust, voice, laugh,
};
