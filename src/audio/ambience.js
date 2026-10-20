// Audio core + synthesized city ambience. No audio files. The AudioContext starts on the
// first user gesture (browsers block audio before that); ?dev / ?mute sessions keep it
// suspended (index.html) and everything here quietly no-ops while it isn't running.
//
// game.audio = {
//   ctx, volume, setVolume(v)                         master volume (0..1, saved)
//   sfx, amb, music, uiBus                            bus inputs (GainNodes) — connect your sounds here
//   master                                            legacy: pre-limiter mix input
//   getBusVolume(bus), setBusVolume(bus, v)           bus: 'sfx' | 'amb' | 'music' | 'ui' (saved)
//   play(presetOrFn, {bus, vol, delay, ...opts})      non-positional one-shot -> bool
//   play3D(presetOrFn, x, z, {maxDist, refDist, vol, bus, delay, ...opts})
//                                                     distance attenuation + stereo pan + distance muffling
//   spatial(x, z, opts) -> {ctx, dest, t, d} | null   the node chain play3D uses, for custom sounds
//   duck(level, seconds, buses=['amb','music'])       temporarily lower buses (big moments)
//   ui(kind)   'click' 'hover' 'open' 'close' 'error' 'text' 'cash' 'perk' 'levelup' 'achievement'
//   presets, running(), throttle(key, ms), onStart(fn)
// }
// A preset/fn is (ctx, dest, t, opts) => void; see src/audio/sounds.js.
import { buildMixer, BUSES, BUS_LABELS, BUS_DEFAULTS, noiseBuf, vary, rnd } from './mixer.js';
import { PRESETS } from './sounds.js';
import { installFootsteps, surfaceAt } from './footsteps.js';
import { installAudioHooks } from './hooks.js';

const loadNum = (k, d) => { try { const v = localStorage.getItem(k); return v == null || v === '' || !isFinite(Number(v)) ? d : Number(v); } catch { return d; } };
const saveNum = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function installAudio(game) {
  const levels = {};
  for (const b of BUSES) levels[b] = clamp01(loadNum('doxsrpg_vol_' + b, BUS_DEFAULTS[b]));

  const startHooks = [];
  let mixer = null;
  const audio = {
    ctx: null, master: null, sfx: null, amb: null, music: null, uiBus: null,
    volume: clamp01(loadNum('doxsrpg_vol', 0.6)), levels, BUSES, BUS_LABELS, presets: PRESETS,
    setVolume, getBusVolume, setBusVolume, ui: uiSound, onStart, play, play3D, spatial, duck, running, throttle,
    surfaceAt: (x, z) => surfaceAt(game, x, z),
  };
  game.audio = audio;

  function onStart(fn) { if (audio.ctx) { try { fn(audio.ctx); } catch (e) { console.error(e); } } else startHooks.push(fn); }
  function running() { return !!(audio.ctx && audio.ctx.state === 'running' && mixer); }

  function setVolume(v) {
    audio.volume = clamp01(v);
    if (mixer) mixer.out.gain.setTargetAtTime(audio.volume, audio.ctx.currentTime, 0.02);
    saveNum('doxsrpg_vol', audio.volume);
  }
  function getBusVolume(b) { return levels[b] ?? 1; }
  function setBusVolume(b, v) {
    if (!(b in levels)) return;
    levels[b] = clamp01(v);
    if (mixer) mixer.bus[b].vol.gain.setTargetAtTime(levels[b], audio.ctx.currentTime, 0.02);
    saveNum('doxsrpg_vol_' + b, levels[b]);
  }

  const lastT = new Map();
  function throttle(key, ms) {
    const now = performance.now();
    if (now - (lastT.get(key) ?? -1e9) < ms) return false;
    lastT.set(key, now);
    return true;
  }

  let warned = false;
  function run(fn, ctx, dest, t, opts) {
    try { fn(ctx, dest, t, opts); } catch (e) { if (!warned) { warned = true; console.warn('[audio] sound failed', e); } }
  }
  const resolve = (p) => (typeof p === 'function' ? p : PRESETS[p]);

  // Non-positional one-shot on a bus.
  function play(preset, opts = {}) {
    const fn = resolve(preset);
    if (!fn || !running()) return false;
    const ctx = audio.ctx;
    const input = mixer.bus[opts.bus || 'sfx']?.input || audio.sfx;
    let dest = input;
    if ((opts.vol ?? 1) !== 1 || opts.pan) {
      dest = ctx.createGain(); dest.gain.value = opts.vol ?? 1;
      if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); dest.connect(p); p.connect(input); } else dest.connect(input);
    }
    run(fn, ctx, dest, ctx.currentTime + 0.01 + (opts.delay || 0), opts);
    return true;
  }

  // Listener = the local player (or their car), oriented by the camera.
  function listenerPos() {
    const pl = game.player;
    const g = pl?.vehicle?.group ?? pl?.group;
    return g?.position ?? game.camera?.position ?? null;
  }
  function spatial(x, z, { maxDist = 60, refDist = 3, vol = 1, bus = 'sfx', muffle = true } = {}) {
    if (!running()) return null;
    const L = listenerPos();
    if (!L || !isFinite(x) || !isFinite(z)) return null;
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    if (d >= maxDist) return null;
    const k = d <= refDist ? 1 : 1 - (d - refDist) / Math.max(0.01, maxDist - refDist);
    const g = vol * k * k;
    if (g < 0.003) return null;
    const ctx = audio.ctx;
    const gain = ctx.createGain(); gain.gain.value = g;
    let tail = gain;
    if (muffle && d > maxDist * 0.25) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 12000 * Math.pow(0.1, Math.min(1, (d / maxDist - 0.25) / 0.75));
      tail.connect(lp); tail = lp;
    }
    if (ctx.createStereoPanner && d > 0.4 && game.camera) {
      const e = game.camera.matrixWorld.elements; // camera right axis = (e0, e1, e2)
      const rl = Math.hypot(e[0], e[2]) || 1;
      const side = (dx * e[0] + dz * e[2]) / rl / d;
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.85, Math.min(0.85, side * Math.min(1, d / (refDist * 2)) * 0.85));
      tail.connect(p); tail = p;
    }
    tail.connect(mixer.bus[bus]?.input || audio.sfx);
    return { ctx, dest: gain, t: ctx.currentTime + 0.005, d, k };
  }
  function play3D(preset, x, z, opts = {}) {
    const fn = resolve(preset);
    if (!fn) return false;
    const sp = spatial(x, z, opts);
    if (!sp) return false;
    run(fn, sp.ctx, sp.dest, sp.t + (opts.delay || 0), opts);
    return true;
  }

  // ---------------------------------------------------------------- ducking
  const ducks = []; // { level, until, buses }
  function duck(level = 0.5, seconds = 2, buses = ['amb', 'music']) {
    ducks.push({ level: clamp01(level), until: performance.now() + seconds * 1000, buses });
  }
  function updateDucks() {
    if (!mixer) return;
    const now = performance.now();
    for (let i = ducks.length - 1; i >= 0; i--) if (ducks[i].until < now) ducks.splice(i, 1);
    const stack = game.started ? game.ui?.stack : null;
    const top = stack?.length ? stack[stack.length - 1] : null;
    for (const b of BUSES) {
      let target = 1;
      if (top && (b === 'amb' || b === 'music')) target = top.isDialog ? (b === 'amb' ? 0.55 : 0.5) : (b === 'amb' ? 0.75 : 0.7);
      for (const d of ducks) if (d.buses.includes(b)) target = Math.min(target, d.level);
      const B = mixer.bus[b];
      if (Math.abs(B.duckLevel - target) > 0.005) {
        B.duck.gain.setTargetAtTime(target, audio.ctx.currentTime, target < B.duckLevel ? 0.12 : 0.6);
        B.duckLevel = target;
      }
    }
  }

  // ---------------------------------------------------------------- UI sounds
  const UI = {
    click: ['uiClick', 'ui', 35], hover: ['uiHover', 'ui', 70], open: ['uiOpen', 'ui', 60], close: ['uiClose', 'ui', 60],
    error: ['uiError', 'ui', 120], text: ['uiText', 'ui', 300], cash: ['cash', 'sfx', 120], perk: ['uiPerk', 'sfx', 200],
    levelup: ['levelup', 'sfx', 800], achievement: ['achievement', 'sfx', 800],
  };
  function uiSound(kind = 'click') {
    const u = UI[kind] || UI.click;
    if (!running() || !throttle('ui:' + kind, u[2])) return;
    play(u[0], { bus: u[1] });
    if (kind === 'levelup' || kind === 'achievement') duck(0.35, 2.4);
  }

  // ---------------------------------------------------------------- continuous ambience
  let L = null; // loop nodes

  function loop(ctx, kind, dest, filters, gain = 0) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx, kind); s.loop = true;
    let n = s;
    const fs = filters.map(([type, f, q = 0.7]) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; n.connect(b); n = b; return b; });
    const g = ctx.createGain(); g.gain.value = gain;
    n.connect(g); g.connect(dest);
    s.start(0, Math.random() * 1.5);
    return { s, f: fs, g };
  }

  function start() {
    if (audio.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch { return; }
    audio.ctx = ctx;
    mixer = buildMixer(ctx, { master: audio.volume, levels });
    audio.master = mixer.mix;
    audio.sfx = mixer.bus.sfx.input;
    audio.amb = mixer.bus.amb.input;
    audio.music = mixer.bus.music.input;
    audio.uiBus = mixer.bus.ui.input;
    audio.mixer = mixer;

    const amb = audio.amb;
    L = {
      rumble: loop(ctx, 'brown', amb, [['lowpass', 180]], 0.16),        // distant traffic / city hum
      wind: loop(ctx, 'white', amb, [['bandpass', 500, 0.8]], 0.015),
      night: loop(ctx, 'white', amb, [['bandpass', 5200, 6]], 0),        // bugs / buzzing streetlights
      rain: loop(ctx, 'white', amb, [['highpass', 600], ['lowpass', 6500]], 0),
      rainLow: loop(ctx, 'pink', amb, [['lowpass', 500]], 0),
      drips: loop(ctx, 'crackle', amb, [['bandpass', 2800, 0.6]], 0),
      crowd: loop(ctx, 'pink', amb, [['bandpass', 600, 1.4], ['lowpass', 1400]], 0),
    };
    for (const fn of startHooks.splice(0)) { try { fn(ctx); } catch (e) { console.error('[audio] start hook failed', e); } }
  }

  const unlock = () => { start(); try { if (audio.ctx?.state === 'suspended') audio.ctx.resume?.(); } catch { /* ignore */ } };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  addEventListener('touchstart', unlock, { passive: true });

  // ---------------------------------------------------------------- one-shot distant city sounds (randomly panned)
  function siren(ctx, d, t) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    o.connect(lp); lp.connect(g); g.connect(d);
    const dur = 5 + Math.random() * 4, lo = vary(640, 0.06), hi = lo * 1.45, per = vary(1.2, 0.1);
    for (let i = 0; i < dur; i += per) {
      o.frequency.setValueAtTime(lo, t + i);
      o.frequency.linearRampToValueAtTime(hi, t + i + per / 2);
      o.frequency.linearRampToValueAtTime(lo, t + i + per);
    }
    g.gain.linearRampToValueAtTime(0.012, t + 1.5);
    g.gain.linearRampToValueAtTime(0.0, t + dur);
    o.start(t); o.stop(t + dur + 0.1);
  }
  function honk(ctx, d, t) {
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    lp.connect(g); g.connect(d);
    const p = vary(1, 0.12), len = rnd(0.25, 0.5);
    for (const f of [380 * p, 470 * p]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + len + 0.1); }
    g.gain.linearRampToValueAtTime(0.007, t + 0.03);
    g.gain.setValueAtTime(0.007, t + len - 0.08);
    g.gain.linearRampToValueAtTime(0, t + len);
  }
  function dogBark(ctx, d, t) {
    const n = 1 + Math.floor(Math.random() * 3), p = vary(1, 0.15);
    for (let i = 0; i < n; i++) {
      const s = t + i * rnd(0.26, 0.36);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420 * p, s); o.frequency.exponentialRampToValueAtTime(180 * p, s + 0.12);
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.007, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 * p;
      o.connect(bp); bp.connect(g); g.connect(d); o.start(s); o.stop(s + 0.2);
    }
  }

  // ---------------------------------------------------------------- weather: thunder sync with the sky flash
  let sky = null, skySearchT = 0, lastFlash = 0, thunderCool = 0, stormT = 10;
  function findSky() {
    sky = null;
    game.scene?.traverse?.((o) => { if (!sky && o.material?.uniforms?.uFlash) sky = o.material.uniforms.uFlash; });
  }
  function thunderNow(delay, near) {
    play('thunder', { bus: 'amb', delay, near, pan: rnd(-0.6, 0.6) });
  }

  // ---------------------------------------------------------------- per-frame
  let nextEvent = 8, gustT = 12, crowdT = 0, density = 0, blurbT = 2, npcStepT = 0;
  const lastNpcPos = new WeakMap();
  const set = (param, v, tc = 0.5) => param.setTargetAtTime(v, audio.ctx.currentTime, tc);

  game.addSystem({
    name: 'ambience',
    update(dt) {
      if (!audio.ctx || !mixer) return;
      updateDucks();
      if (!game.started || !running() || !L) return;
      try {
        const night = 1 - (game.time?.daylight ?? 1);
        const t = game.elapsed || 0;
        const weather = game.world?.weather ?? 'overcast';
        const wet = weather === 'rain' ? 1 : weather === 'storm' ? 1.5 : 0;
        const pos = listenerPos() || { x: 0, z: 0 };
        const inCar = !!game.player?.vehicle;
        const exposed = pos.x > 600 || game.world?.districtAt?.(pos.x, pos.z) === 'hilltop' ? 1.4 : 1;

        // loops
        set(L.rumble.g.gain, 0.12 + 0.08 * (1 - night) + 0.04 * Math.min(1, density));
        set(L.wind.f[0].frequency, 400 + Math.sin(t * 0.13) * 200 + Math.sin(t * 0.41) * 90, 0.3);
        set(L.wind.g.gain, (0.012 + 0.012 * (0.5 + 0.5 * Math.sin(t * 0.07))) * (1 + wet * 0.8) * exposed);
        set(L.night.g.gain, wet ? 0 : 0.003 * night);
        set(L.rain.g.gain, 0.055 * wet * (inCar ? 0.5 : 1), 1.2);
        set(L.rainLow.g.gain, 0.05 * wet, 1.2);
        set(L.drips.g.gain, 0.5 * wet * (inCar ? 1.8 : 1), 1.2);
        set(L.crowd.g.gain, 0.012 * density * (inCar ? 0.4 : 1), 1);

        // thunder: follow the sky's lightning flash (light first, sound a moment later)
        skySearchT -= dt;
        if (!sky && skySearchT <= 0) { skySearchT = 5; findSky(); }
        thunderCool -= dt;
        if (sky) {
          const f = sky.value || 0;
          if (f > 0.35 && lastFlash < 0.15 && thunderCool <= 0) {
            const delay = rnd(0.15, 2.3);
            thunderNow(delay, 1 - delay / 2.6);
            thunderCool = 2.5;
          }
          lastFlash = f;
        } else if (weather === 'storm') {
          stormT -= dt;
          if (stormT <= 0) { stormT = rnd(6, 18); thunderNow(0, rnd(0.1, 0.9)); }
        }

        // wind gusts
        gustT -= dt;
        if (gustT <= 0) {
          gustT = wet ? rnd(7, 16) : rnd(16, 40);
          play('gust', { bus: 'amb', k: (0.6 + wet * 0.4) * exposed * (inCar ? 0.4 : 1), pan: rnd(-0.7, 0.7) });
        }

        // distant city one-shots
        nextEvent -= dt;
        if (nextEvent <= 0) {
          nextEvent = 10 + Math.random() * 25;
          const r = Math.random(), pan = rnd(-0.8, 0.8);
          if (r < 0.3) play(siren, { bus: 'amb', pan }); else if (r < 0.7) play(honk, { bus: 'amb', pan }); else play(dogBark, { bus: 'amb', pan });
        }

        // crowds: density, murmurs and other people's footsteps
        crowdT -= dt;
        let near = null;
        if (crowdT <= 0 && game.npcs?.near && !inCar) {
          crowdT = 0.5;
          near = game.npcs.near(pos.x, pos.z, 26);
          const calm = near.filter((n) => !n.hostile && !n.dead);
          density += (Math.min(1, calm.length / 9) - density) * 0.3;
          audio._crowd = calm;
        } else if (inCar) density *= 0.98;
        const crowd = audio._crowd || [];
        blurbT -= dt;
        if (blurbT <= 0) {
          blurbT = density > 0.05 ? rnd(0.4, 1.6) / (0.3 + density) : 1.5;
          if (density > 0.05 && crowd.length && !inCar) {
            const n = crowd[(Math.random() * crowd.length) | 0];
            if (n?.pos && !n.removed) play3D(Math.random() < 0.06 ? 'laugh' : 'voice', n.pos.x, n.pos.z, { bus: 'amb', maxDist: 28, refDist: 4, vol: 0.55 * (1 - night * 0.3) });
          }
        }
        npcStepT -= dt;
        if (npcStepT <= 0) {
          npcStepT = rnd(0.18, 0.35);
          if (crowd.length && !inCar) {
            const n = crowd[(Math.random() * crowd.length) | 0];
            if (n?.pos && !n.removed) {
              const last = lastNpcPos.get(n);
              const now = game.elapsed || 0;
              if (last) {
                const sp = Math.hypot(n.pos.x - last.x, n.pos.z - last.z) / Math.max(0.05, now - last.t);
                if (sp > 0.8 && sp < 12) play3D('step', n.pos.x, n.pos.z, { maxDist: 16, refDist: 2, vol: 0.5, surface: surfaceAt(game, n.pos.x, n.pos.z), k: Math.min(1, sp / 8) });
              }
              lastNpcPos.set(n, { x: n.pos.x, z: n.pos.z, t: now });
            }
          }
        }
      } catch (e) { if (!audio._ambErr) { audio._ambErr = true; console.warn('[audio] ambience', e); } }
    },
  });

  // ---------------------------------------------------------------- settings UI
  function openSoundPanel() {
    start();
    const el = document.createElement('div');
    const row = (key, label, val) => `<label style="display:flex;align-items:center;gap:10px;margin:8px 0">
        <span style="flex:0 0 150px">${label}</span>
        <input type="range" min="0" max="1" step="0.05" value="${val}" data-vol="${key}" style="flex:1;min-width:0">
        <b data-out="${key}" style="flex:0 0 42px;text-align:right">${Math.round(val * 100)}%</b></label>`;
    el.innerHTML = `<div class="ui-muted" style="margin-bottom:6px">How loud do you want the city to scream at you?</div>
      ${row('master', '<b>Master</b>', audio.volume)}
      ${BUSES.map((b) => row(b, BUS_LABELS[b], levels[b])).join('')}
      ${game.radio ? row('radio', '&nbsp;&nbsp;Car radio', game.radio.volume) + row('menu', '&nbsp;&nbsp;Title music', game.radio.musicVolume) : ''}`;
    const preview = { master: 'uiClick', sfx: 'coin', amb: 'gust', music: 'questStep', ui: 'uiClick' };
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.vol; if (!k) return;
      const v = Number(e.target.value);
      if (k === 'master') setVolume(v);
      else if (k === 'radio') game.radio?.setVolume(v);
      else if (k === 'menu') game.radio?.setMusicVolume(v);
      else setBusVolume(k, v);
      const o = el.querySelector(`[data-out="${k}"]`); if (o) o.textContent = `${Math.round(v * 100)}%`;
      if (preview[k] && throttle('preview:' + k, 350)) play(preview[k], { bus: k === 'master' ? 'ui' : k, k: 0.5 });
    });
    game.ui.openPanel({ title: 'Sound', body: el, width: 460 });
  }
  audio.openSettings = openSoundPanel;
  game.ui.menuButtons.push({ label: 'Sound volume', onClick: openSoundPanel });

  installFootsteps(game);
  installAudioHooks(game);
  return audio;
}
