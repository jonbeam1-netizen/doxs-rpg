// Synthesized city ambience: low urban rumble, wind, distant sirens/dogs/horns
// at random, crickets-ish hiss at night. No audio files. Starts on the first
// user gesture (browsers block audio before that).
//
// game.audio = { ctx, master, sfx (GainNode for other modules' sounds), setVolume(v),
//                ui(kind)  short UI blips: 'click' 'open' 'close' 'perk' 'levelup' 'achievement' 'text' 'cash' 'error',
//                onStart(fn)  run fn(ctx) once the AudioContext exists (after the first user gesture) }

export function installAudio(game) {
  let vol = 0.6;
  try { vol = Number(localStorage.getItem('doxsrpg_vol') ?? 0.6); } catch { /* ignore */ }

  const startHooks = [];
  const audio = { ctx: null, master: null, sfx: null, music: null, volume: vol, setVolume, ui: uiSound, onStart };
  function onStart(fn) { if (audio.ctx) { try { fn(audio.ctx); } catch (e) { console.error(e); } } else startHooks.push(fn); }
  game.audio = audio;

  function setVolume(v) {
    audio.volume = Math.max(0, Math.min(1, v));
    if (audio.master) audio.master.gain.value = audio.volume;
    try { localStorage.setItem('doxsrpg_vol', String(audio.volume)); } catch { /* ignore */ }
  }

  function noiseBuffer(ctx, seconds = 2, brown = true) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  let rumbleGain, windGain, windFilter, nightGain;

  function start() {
    if (audio.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.volume;
    audio.master.connect(ctx.destination);
    audio.sfx = ctx.createGain();
    audio.sfx.gain.value = 1;
    audio.sfx.connect(audio.master);
    const amb = ctx.createGain();
    amb.gain.value = 0.5;
    amb.connect(audio.master);

    // City rumble: brown noise through a low-pass.
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(ctx, 4, true);
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180;
    rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.35;
    rumble.connect(lp).connect(rumbleGain).connect(amb);
    rumble.start();

    // Wind: white noise through a wandering band-pass.
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 3, false);
    wind.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.8;
    windGain = ctx.createGain(); windGain.gain.value = 0.03;
    wind.connect(windFilter).connect(windGain).connect(amb);
    wind.start();

    // Night hiss (bugs / buzzing streetlights): high band-pass noise.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuffer(ctx, 2, false);
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 5200; hp.Q.value = 6;
    nightGain = ctx.createGain(); nightGain.gain.value = 0;
    hiss.connect(hp).connect(nightGain).connect(amb);
    hiss.start();
    audio.amb = amb;
    for (const fn of startHooks.splice(0)) { try { fn(ctx); } catch (e) { console.error('[audio] start hook failed', e); } }
  }

  // Tiny synthesized UI sounds.
  function blip(t, freq, dur, { type = 'square', vol = 0.05, slide = 0, dest = null } = {}) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || audio.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function uiSound(kind = 'click') {
    if (!audio.ctx || !audio.sfx) return;
    const t = audio.ctx.currentTime + 0.01;
    try {
      switch (kind) {
        case 'click': blip(t, 900, 0.05, { type: 'triangle', vol: 0.04 }); break;
        case 'open': blip(t, 520, 0.08, { type: 'triangle', vol: 0.05, slide: 1.6 }); break;
        case 'close': blip(t, 700, 0.08, { type: 'triangle', vol: 0.05, slide: 0.6 }); break;
        case 'error': blip(t, 160, 0.18, { type: 'sawtooth', vol: 0.04 }); break;
        case 'cash': [1318, 1760].forEach((f, i) => blip(t + i * 0.07, f, 0.12, { type: 'square', vol: 0.03 })); break;
        case 'text': [0, 0.14].forEach((d) => blip(t + d, 1480, 0.09, { type: 'sine', vol: 0.06 })); break;
        case 'perk': [523, 659, 784].forEach((f, i) => blip(t + i * 0.06, f, 0.18, { type: 'square', vol: 0.035 })); break;
        case 'levelup': [392, 523, 659, 784, 1046].forEach((f, i) => blip(t + i * 0.07, f, 0.22, { type: 'square', vol: 0.035 })); break;
        case 'achievement':
          [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3], [784, 0.42], [1046, 0.5]].forEach(([f, d]) => blip(t + d, f, 0.25, { type: 'square', vol: 0.035 }));
          blip(t + 0.5, 261, 0.6, { type: 'triangle', vol: 0.06 });
          break;
        default: blip(t, 600, 0.06);
      }
    } catch { /* ignore */ }
  }

  const unlock = () => { start(); audio.ctx?.resume?.(); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // One-shot distant sounds.
  function siren() {
    const ctx = audio.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    o.connect(lp).connect(g).connect(audio.amb);
    const dur = 5 + Math.random() * 4;
    for (let i = 0; i < dur; i += 1.2) {
      o.frequency.setValueAtTime(650, t + i);
      o.frequency.linearRampToValueAtTime(950, t + i + 0.6);
      o.frequency.linearRampToValueAtTime(650, t + i + 1.2);
    }
    g.gain.linearRampToValueAtTime(0.02, t + 1.5);
    g.gain.linearRampToValueAtTime(0.0, t + dur);
    o.start(t); o.stop(t + dur + 0.1);
  }
  function honk() {
    const ctx = audio.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = 0;
    g.connect(audio.amb);
    for (const f of [380, 470]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp).connect(g); o.start(t); o.stop(t + 0.5);
    }
    g.gain.linearRampToValueAtTime(0.012, t + 0.03);
    g.gain.setValueAtTime(0.012, t + 0.35);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
  }
  function bark() {
    const ctx = audio.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.32;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, s); o.frequency.exponentialRampToValueAtTime(180, s + 0.12);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.01, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700;
      o.connect(bp).connect(g).connect(audio.amb); o.start(s); o.stop(s + 0.2);
    }
  }

  let nextEvent = 8;
  game.addSystem({
    name: 'ambience',
    update(dt) {
      if (!audio.ctx || !game.started) return;
      const night = 1 - game.time.daylight;
      const t = game.elapsed;
      rumbleGain.gain.value = 0.25 + 0.15 * (1 - night);
      windFilter.frequency.value = 400 + Math.sin(t * 0.13) * 200 + Math.sin(t * 0.41) * 90;
      windGain.gain.value = 0.02 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.07));
      nightGain.gain.value = 0.004 * night;
      nextEvent -= dt;
      if (nextEvent <= 0) {
        nextEvent = 10 + Math.random() * 25;
        const r = Math.random();
        if (r < 0.3) siren(); else if (r < 0.7) honk(); else bark();
      }
    },
  });

  game.ui.menuButtons.push({
    label: 'Sound volume',
    onClick: () => {
      const opts = [0, 0.25, 0.5, 0.75, 1].map((v) => ({
        label: v === 0 ? 'Mute' : `${v * 100}%`,
        hint: Math.abs(audio.volume - v) < 0.01 ? 'current' : '',
        onSelect: () => { start(); setVolume(v); },
      }));
      game.ui.dialog({ title: 'Sound', text: 'How loud do you want the city to scream at you?', options: opts });
    },
  });
}
