// Recorded-sample player for the owner's sounds (list: ./sample-manifest.js, files: assets/sfx/).
// Lazy: nothing is fetched until the AudioContext exists, then groups load in the background
// (priority groups first). Every call is non-blocking and returns null when its group isn't
// decoded (yet, or ever) so callers fall back to the synth patch they always had.
//
//   S.has(group)                         decoded & non-empty
//   S.play(group, opts) -> src|null      opts: { bus, vol, rate, delay, pan, lp, dest, slice }
//   S.play3D(group, x, z, opts)          distance + pan + muffle via audio.spatial()
//   S.loop(group, opts) -> handle|null   { setVol(v, tc), setRate(r, tc), stop(fade) }
//   S.load(group) -> Promise<bool>,  S.preloadAll(),  S.status()
import { SAMPLE_FILES } from './sample-manifest.js';

// Per-group mix settings. vol is relative to a sample normalized to ~-18 dBFS RMS / -1 dBFS peak.
// rate/volJ = random +/- variation per play, gap = min ms between two plays of the group,
// voices = max simultaneous plays. slices = [[offset, dur], ...] cut variants out of long takes;
// from = reuse another group's buffers (e.g. different slices of the same file).
export const GROUPS = {
  hit: { vol: 0.62, rate: 0.07, volJ: 0.12, gap: 25, voices: 6, prio: 1 },
  hit_crit: { vol: 0.62, rate: 0.06, volJ: 0.1, gap: 30, voices: 4, prio: 1 },
  swing: { vol: 0.24, rate: 0.08, volJ: 0.15, gap: 40, voices: 4, prio: 1 },
  slam: { vol: 0.6, rate: 0.05, volJ: 0.1, gap: 80, voices: 3, prio: 1 },
  shield_block: { vol: 0.5, rate: 0.06, volJ: 0.1, gap: 40, voices: 3, prio: 1 },
  hero_ouch: { vol: 0.34, rate: 0.04, volJ: 0.1, gap: 320, voices: 1, prio: 1 },
  hurt: { vol: 0.3, rate: 0.12, volJ: 0.12, gap: 120, voices: 3, prio: 1 },
  heartbeat: { vol: 0.25, rate: 0.02, volJ: 0.05, gap: 300, voices: 1 },
  step: { vol: 0.08, rate: 0.08, volJ: 0.2, gap: 60, voices: 3, prio: 1 },
  mstep_light: { vol: 0.07, rate: 0.1, volJ: 0.2, gap: 40, voices: 4, prio: 1 },
  mstep_heavy: { vol: 0.24, rate: 0.06, volJ: 0.1, gap: 120, voices: 2 },
  land: { vol: 0.2, rate: 0.06, volJ: 0.1, gap: 120, voices: 2, prio: 1 },
  jump: { vol: 0.08, rate: 0.08, volJ: 0.15, gap: 150, voices: 1, prio: 1 },
  door_open: { vol: 0.16, rate: 0.05, volJ: 0.1, gap: 300, voices: 1, prio: 1 },
  door_close: { vol: 0.2, rate: 0.05, volJ: 0.1, gap: 300, voices: 1, prio: 1 },
  door_creak: { vol: 0.12, rate: 0.08, volJ: 0.1, gap: 300, voices: 1 },
  coins: { vol: 0.16, rate: 0.05, volJ: 0.1, gap: 120, voices: 2, prio: 1 },
  coin_drop: { vol: 0.2, rate: 0.06, volJ: 0.1, gap: 90, voices: 2, prio: 1 },
  buy: { vol: 0.18, rate: 0.03, volJ: 0.08, gap: 150, voices: 1, prio: 1 },
  sell: { vol: 0.25, rate: 0.03, volJ: 0.08, gap: 150, voices: 1 },
  item_pickup: { vol: 0.22, rate: 0.05, volJ: 0.1, gap: 80, voices: 2 },
  drink: { vol: 0.3, rate: 0.06, volJ: 0.1, gap: 300, voices: 1 },
  heal: { vol: 0.2, rate: 0.03, volJ: 0.08, gap: 300, voices: 1 },
  crate: { vol: 0.3, rate: 0.08, volJ: 0.1, gap: 120, voices: 2 },
  sack: { vol: 0.24, rate: 0.08, volJ: 0.1, gap: 120, voices: 2 },
  ui_click: { vol: 0.12, rate: 0.04, volJ: 0.1, gap: 35, voices: 2, prio: 1, bus: 'ui' },
  level_up: { vol: 0.3, rate: 0, volJ: 0, gap: 900, voices: 1 },
  wind_gust: { vol: 0.09, rate: 0.12, volJ: 0.15, gap: 1500, voices: 2, bus: 'amb' },
  lightning_boom: { vol: 0.4, rate: 0.08, volJ: 0.1, gap: 600, voices: 2, bus: 'amb' },
  rain_loop: { vol: 0.2, rate: 0, volJ: 0, gap: 0, voices: 1, bus: 'amb' },
  skate_roll: { vol: 0.3, rate: 0, volJ: 0, gap: 0, voices: 1, loop: [0.3, 9.5] },
  skate_land: { vol: 0.32, rate: 0.05, volJ: 0.1, gap: 90, voices: 2, slices: [[2.82, 0.62]] },
  skate_pop: { from: 'skate_land', vol: 0.3, rate: 0.06, volJ: 0.1, gap: 90, voices: 2, slices: [[2.44, 0.17]] },
  skate_bail: { vol: 0.34, rate: 0.04, volJ: 0.08, gap: 400, voices: 1, slices: [[0.73, 0.75], [2.89, 0.85], [6.23, 0.95], [9.63, 0.85], [11.29, 1.1]] },
  skate_grind: { vol: 0.3, rate: 0, volJ: 0, gap: 100, voices: 1 },
};

export function createSampler(audio) {
  const groups = new Map(); // name -> { urls, bufs, state, p, last, voices:Set, lastT }
  for (const [g, file] of SAMPLE_FILES) {
    if (!groups.has(g)) groups.set(g, { urls: [], bufs: [], state: 'idle', p: null, last: -1, voices: new Set(), lastT: 0 });
    groups.get(g).urls.push('assets/sfx/' + file); // relative: works under /doxs-rpg/ on Pages
  }
  for (const [g, c] of Object.entries(GROUPS)) if (c.from && groups.has(c.from) && !groups.has(g)) groups.set(g, { alias: c.from, last: -1, voices: new Set(), lastT: 0 });
  let warned = false;

  const base = (g) => { const e = groups.get(g); return e?.alias ? groups.get(e.alias) : e; };

  function decode(ctx, ab) {
    return new Promise((res, rej) => {
      try {
        const p = ctx.decodeAudioData(ab, res, rej); // callback form for old Safari, promise form elsewhere
        if (p && p.then) p.then(res, rej);
      } catch (e) { rej(e); }
    });
  }

  function load(g) {
    const e = base(g);
    if (!e) return Promise.resolve(false);
    if (e.p) return e.p;
    const ctx = audio.ctx;
    if (!ctx) return Promise.resolve(false);
    e.state = 'loading';
    e.p = Promise.all(e.urls.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error(r.status + ' ' + u);
        return await decode(ctx, await r.arrayBuffer());
      } catch (err) {
        if (!warned) { warned = true; console.warn('[audio] sample failed (synth fallback in use)', u, err?.message || err); }
        return null;
      }
    })).then((bufs) => {
      e.bufs = bufs.filter(Boolean);
      e.state = e.bufs.length ? 'ready' : 'failed';
      return e.state === 'ready';
    });
    return e.p;
  }

  async function preloadAll() {
    const names = [...groups.keys()].filter((g) => !groups.get(g).alias);
    names.sort((a, b) => (GROUPS[b]?.prio || 0) - (GROUPS[a]?.prio || 0));
    // a few at a time so the first-needed groups are decoded within a frame or two
    for (let i = 0; i < names.length; i += 4) await Promise.all(names.slice(i, i + 4).map(load));
  }

  function has(g) { const e = base(g); return !!(e && e.state === 'ready' && e.bufs.length); }

  // pick a variant: [buffer, offset, duration]
  function pick(g) {
    const e = groups.get(g), b = base(g), cfg = GROUPS[g] || {};
    const slices = cfg.slices || [[0, 0]];
    const n = b.bufs.length * slices.length;
    let i = (Math.random() * n) | 0;
    if (n > 1 && i === e.last) i = (i + 1 + ((Math.random() * (n - 1)) | 0)) % n;
    e.last = i;
    const s = slices[i % slices.length];
    return [b.bufs[(i / slices.length) | 0], s[0], s[1]];
  }

  // Shared one-shot path. dest: an AudioNode to connect into (spatial chain) or null for a bus.
  function fire(g, opts, dest) {
    if (!audio.running?.() || !has(g)) { if (audio.ctx && !base(g)?.p) load(g); return null; }
    const e = groups.get(g), cfg = GROUPS[g] || {};
    const now = performance.now();
    if (cfg.gap && now - e.lastT < cfg.gap && !opts.force) return null;
    for (const v of e.voices) if (v._end < audio.ctx.currentTime) e.voices.delete(v);
    if (e.voices.size >= (cfg.voices || 4)) return null;
    e.lastT = now;
    const ctx = audio.ctx;
    const [buf, off, dur] = pick(g);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const jr = cfg.rate ?? 0.05, jv = cfg.volJ ?? 0.1;
    const rate = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jr);
    src.playbackRate.value = rate;
    const g0 = ctx.createGain();
    const vol = (cfg.vol ?? 0.5) * (opts.vol ?? 1) * (1 + (Math.random() * 2 - 1) * jv);
    g0.gain.value = vol;
    let tail = g0;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; g0.connect(f); tail = f; }
    if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); tail.connect(p); tail = p; }
    tail.connect(dest || audio.mixer?.bus?.[opts.bus || cfg.bus || 'sfx']?.input || audio.sfx);
    src.connect(g0);
    const t = (opts.t ?? ctx.currentTime + 0.005) + (opts.delay || 0);
    const len = dur || Math.max(0.01, buf.duration - off);
    if (dur) { // slice: short fade at the cut so it doesn't click
      g0.gain.setValueAtTime(vol, t + len - 0.04);
      g0.gain.linearRampToValueAtTime(0, t + len);
    }
    src.start(t, off, len + 0.01);
    src._end = t + len / rate + 0.05;
    src._tag = 'sample:' + g;
    e.voices.add(src);
    src.onended = () => { e.voices.delete(src); try { tail.disconnect(); } catch { /* ignore */ } };
    return src;
  }

  function play(g, opts = {}) { try { return fire(g, opts, opts.dest || null); } catch (err) { if (!warned) { warned = true; console.warn('[audio] sample play', err); } return null; } }

  function play3D(g, x, z, opts = {}) {
    if (!has(g)) { play(g); return null; } // kicks off the load; returns null -> synth fallback
    const cfg = GROUPS[g] || {};
    const sp = audio.spatial?.(x, z, { maxDist: opts.maxDist ?? 60, refDist: opts.refDist ?? 3, vol: 1, bus: opts.bus || cfg.bus || 'sfx' });
    if (!sp) return false; // out of range: handled (silence), not a failure
    return play(g, { ...opts, dest: sp.dest, t: sp.t });
  }

  // Looping bed (rain, skate wheels). Returns null when the group isn't ready.
  function loop(g, opts = {}) {
    if (!audio.running?.() || !has(g)) { if (audio.ctx) load(g); return null; }
    const ctx = audio.ctx, cfg = GROUPS[g] || {};
    const e = base(g);
    const src = ctx.createBufferSource();
    src.buffer = e.bufs[(Math.random() * e.bufs.length) | 0];
    src.loop = true;
    if (cfg.loop) { src.loopStart = cfg.loop[0]; src.loopEnd = Math.min(src.buffer.duration, cfg.loop[1]); }
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(opts.dest || audio.mixer?.bus?.[opts.bus || cfg.bus || 'sfx']?.input || audio.sfx);
    const start = cfg.loop ? cfg.loop[0] + Math.random() * (cfg.loop[1] - cfg.loop[0]) * 0.8 : Math.random() * src.buffer.duration * 0.8;
    src.start(ctx.currentTime + 0.01, start);
    src._tag = 'loop:' + g;
    const k = cfg.vol ?? 0.5;
    let stopped = false;
    const h = {
      src, gain, group: g,
      setVol(v, tc = 0.08) { if (!stopped) gain.gain.setTargetAtTime(Math.max(0, v) * k, ctx.currentTime, tc); },
      setRate(r, tc = 0.08) { if (!stopped) src.playbackRate.setTargetAtTime(Math.max(0.1, r), ctx.currentTime, tc); },
      stop(fade = 0.12) {
        if (stopped) return; stopped = true;
        const t = ctx.currentTime;
        try { gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.02); } catch { /* ignore */ }
        src.onended = () => { try { gain.disconnect(); } catch { /* ignore */ } };
      },
      get stopped() { return stopped; },
    };
    h.setVol(opts.vol ?? 0, 0.01);
    return h;
  }

  function status() {
    const o = {};
    for (const [g, e] of groups) { const b = base(g); o[g] = (b.state || 'idle') + (b.bufs?.length ? ` x${b.bufs.length}` : ''); }
    return o;
  }

  return { has, play, play3D, loop, load, preloadAll, status, groups: () => [...groups.keys()] };
}
