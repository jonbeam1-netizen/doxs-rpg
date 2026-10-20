import { pick, esc } from '../core/util.js';

// Car radio + title-screen music. 100% procedural WebAudio, routed into game.audio.master
// through its own gains (radio volume / menu music volume, saved in localStorage).
//
// Plays while the player is in a vehicle (or with "earbuds" on from the phone's Radio app).
// Keys (in a vehicle): ',' previous station, '.' next station.
//
// game.radio = { STATIONS, current() -> station|null, set(id|'off'), next(), prev(),
//                volume, setVolume(v), musicVolume, setMusicVolume(v), earbuds, setEarbuds(on) }
// Events: radio:station {id}  (when a station starts playing)

export const STATIONS = [
  { id: 'grime', freq: 'KRUD 66.6 FM', genre: 'Grimewave', tag: 'Synths as dirty as your search history.' },
  { id: 'trash', freq: 'WTRSH 88.1 FM', genre: 'Trash-Hop Beats', tag: 'Lo-fi beats to get mugged / relax to.' },
  { id: 'dust', freq: 'K-DUST 101.9', genre: 'Dustbowl Honky-Tonk', tag: 'Eight-bit yeehaw from the trailer park.' },
  { id: 'talk', freq: 'KRAP 1310 AM', genre: 'The Grease Trap w/ Big Ron', tag: 'Talk radio for people who should not be allowed to talk.' },
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const loadNum = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : Number(v); } catch { return d; } };
const saveNum = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

// Tiny seeded RNG so phrases repeat (sounds like a song, not a cat on a keyboard).
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- talk radio script
const CALLERS = ['Darlene from Gutterside', 'Big Steve, long-time listener', 'Anonymous (it\'s Gary)', 'Trucker Dan', 'Meemaw', 'Some kid named Tyler', 'A man who will only say he is "the Sewer King"', 'Linda, first-time caller'];
const TALK = [
  [['dj', "You're listening to the Grease Trap on KRAP 1310 AM. I'm Big Ron. Lines are open, and so is my shirt."],
    ['dj', "Today's topic: is it still littering if you throw your trash into a bigger pile of trash? I say no. I say that's recycling."]],
  [['dj', 'Caller, you are on the Grease Trap.'], ['caller', 'Ron, my neighbor keeps stealing my newspaper.'], ['dj', 'Do you read it?'], ['caller', 'No. I use it for the bird.'], ['dj', 'Then your neighbor is stealing bird toilet paper. Let him have it. Next caller!']],
  [['ad', "This hour of the Grease Trap is brought to you by Grimco. Grimco: we made the smog, so you don't have to. Side effects may include coughing, more coughing, and a third, deeper cough."]],
  [['dj', 'Breaking news: the mayor says the potholes on Fifth are now a "water feature". Folks, I lost a whole sedan in one. My cousin lives in it now. Pays no rent.']],
  [['dj', 'Line two, go.'], ['caller', 'Ron, is it normal for the river to be warm?'], ['dj', 'Absolutely not. Stay out of the river.'], ['caller', "I'm calling from the river."], ['dj', 'God bless. Next!']],
  [['ad', 'Lucky Larry\'s Pawn! We buy gold, guns, guitars, and grandma\'s stuff, no questions asked. Seriously, do not tell us anything. Lucky Larry\'s. Plausible deniability since nineteen eighty-whatever.']],
  [['dj', "Ron's life tip of the day: if you can't afford a gym, just get chased by the cops twice a week. Free cardio. Free housing, eventually."]],
  [['dj', 'We got a caller who says he has a hot stock tip.'], ['caller', 'HoboCoin, Ron. It is going to the moon.'], ['dj', "Buddy, it's backed by a shopping cart."], ['caller', "A FULL shopping cart, Ron."]],
  [['ad', "Feeling tired? Sad? Have you tried Sad Clown Pills? Of course you haven't, they're not real, this ad is legally a joke. Talk to your local guy in an alley today."]],
  [['dj', 'Weather now. Expect a high of "ugh" with a ninety percent chance of something falling on you. Could be rain. Could be a pigeon. Could be a guy.']],
  [['dj', 'Caller, you are on the air.'], ['caller', "Ron, I think my date went great. She said I'm a great friend."], ['dj', "Oh, buddy. Oh no. Ron's gonna play you a sad song."], ['dj', 'Doot doot dooo. That was the song. Hang in there.']],
  [['dj', "Sports update: the Rotwell Rats lost again, 41 to nothing. The coach says the team is 'rebuilding'. Rebuilding what, Coach? The building burned down."]],
  [['ad', "St. Mercy's Mostly General Hospital. Now with forty percent fewer sponges left inside patients! St. Mercy's: you'll probably wake up."]],
  [['dj', 'Somebody just texted the station: "Ron, my car smells like feet." Pal, that is not the car. That is you. Roll down a window and think about your choices.']],
  [['dj', "A listener asks, Ron, what's the secret to success in Rotwell? Easy. Lower your standards until you're already successful. I did it. Look at me. I'm on the AM dial."]],
  [['caller', "Ron! RON! There's a stick man running from the cops on Main Street!"], ['dj', 'Is he in a stolen car?'], ['caller', "He's in a STOLEN PIZZA VAN."], ['dj', 'Godspeed, pizza man. Godspeed.']],
  [['dj', "Time for Ron's Recipe Corner. Take a hot dog. Put it in another hot dog. That's a Rotwell Turducken. You're welcome. My doctor says I can't have those anymore."]],
];

export function installRadio(game) {
  const audio = game.audio;
  if (!audio) return null;
  let radioVol = Math.max(0, Math.min(1, loadNum('doxsrpg_radio_vol', 0.55)));
  let musicVol = Math.max(0, Math.min(1, loadNum('doxsrpg_music_vol', 0.4)));
  let stationIdx = loadNum('doxsrpg_station', 0) | 0;
  if (stationIdx < -1 || stationIdx >= STATIONS.length) stationIdx = 0;
  let earbuds = false;

  let ctx = null, radioBus = null, menuBus = null, noiseBuf = null, pulse25 = null, pulse12 = null, shaper = null;
  let playing = null;        // id currently sounding ('menu' / station id / null)
  let out = null;            // current station output node
  let gen = null;            // current generator
  let nextT = 0, stepN = 0;
  let talk = { busy: false, line: '', until: 0, seg: null, segI: 0, deck: [] };

  function setup(c) {
    ctx = c;
    const musicIn = audio.music || audio.master; // music bus (ducked under dialogs, own slider)
    radioBus = ctx.createGain(); radioBus.gain.value = radioVol; radioBus.connect(musicIn);
    menuBus = ctx.createGain(); menuBus.gain.value = musicVol; menuBus.connect(musicIn);
    audio.radioOut = radioBus; audio.menuMusic = menuBus;
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    pulse25 = pulseWave(0.25); pulse12 = pulseWave(0.125);
    shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    shaper.curve = curve;
  }
  audio.onStart?.(setup);

  function pulseWave(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(re, im);
  }

  // ---------------------------------------------------------------- synth primitives
  function tone(t, freq, dur, { type = 'sawtooth', wave = null, vol = 0.1, a = 0.005, r = null, cutoff = 0, q = 0.7, detune = 0, glide = 0, vib = 0, dest = out } = {}) {
    if (!dest) return;
    const o = ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    o.detune.value = detune;
    let node = o;
    if (vib) {
      const l = ctx.createOscillator(); l.frequency.value = 5.5;
      const lg = ctx.createGain(); lg.gain.value = vib;
      l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.3);
    }
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q; node.connect(f); node = f; }
    const g = ctx.createGain();
    const rel = r ?? Math.min(0.25, dur * 0.5);
    g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function pluck(t, freq, dur, vol, type = 'triangle', dest = out) {
    if (!dest) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, vol = 0.5, dest = out) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain(); g.gain.value = vol; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.32);
  }
  function noise(t, dur, vol, { type = 'highpass', freq = 7000, q = 0.7, dest = out } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  function snare(t, vol = 0.25, decay = 0.18) {
    noise(t, decay, vol, { type: 'bandpass', freq: 1800, q: 0.6 });
    tone(t, 190, 0.08, { type: 'triangle', vol: vol * 0.6, a: 0.002, r: 0.06 });
  }

  // ---------------------------------------------------------------- generators
  // Each: { bpm, swing, start?(), step(n, t, sd) } where n = global 16th step, sd = step duration.
  const GEN = {
    menu: () => {
      const chords = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [38, 45, 50, 57, 65], [40, 47, 52, 56, 59]];
      const scale = [57, 60, 62, 64, 67, 69, 72, 76];
      const R = rng(7);
      return {
        bpm: 64, swing: 0,
        step(n, t, sd) {
          const pos = n % 32, bar2 = Math.floor(n / 32);
          if (pos === 0) {
            const ch = chords[bar2 % 4];
            for (const m of ch) {
              tone(t, mtof(m), sd * 32 + 1, { type: 'sawtooth', vol: 0.018, a: 2.2, r: 2, cutoff: 520, detune: -7 });
              tone(t, mtof(m), sd * 32 + 1, { type: 'sawtooth', vol: 0.018, a: 2.2, r: 2, cutoff: 520, detune: 7 });
            }
            tone(t, mtof(ch[0] - 12), sd * 32 + 1, { type: 'sine', vol: 0.09, a: 1.5, r: 2 });
          }
          if (pos % 4 === 2 && R() < 0.28) pluck(t, mtof(pick(scale) + 12), 2.2, 0.035, 'sine');
          if (pos === 16 && R() < 0.4) noise(t, 3.5, 0.012, { type: 'bandpass', freq: 400 + R() * 500, q: 1.2 });
        },
      };
    },
    grime: () => {
      const chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
      const roots = [33, 29, 36, 31];
      const pent = [69, 72, 74, 76, 79, 81];
      let phrase = null;
      return {
        bpm: 96, swing: 0,
        step(n, t, sd) {
          const pos = n % 16, bar = Math.floor(n / 16), ci = bar % 4, ch = chords[ci];
          if (pos % 4 === 0) kick(t, 0.55);
          if (pos === 4 || pos === 12) { snare(t, 0.22, 0.38); noise(t, 0.6, 0.04, { type: 'bandpass', freq: 3000, q: 0.4 }); }
          if (pos % 2 === 1) noise(t, 0.04, pos % 4 === 3 ? 0.05 : 0.025);
          if (pos % 2 === 0) tone(t, mtof(roots[ci] + (pos % 4 === 2 ? 12 : 0) + 12), sd * 1.7, { type: 'sawtooth', vol: 0.12, cutoff: 380 + 200 * Math.sin(n * 0.05), q: 4, r: 0.05 });
          const arp = [...ch, ...ch.map((m) => m + 12)];
          tone(t, mtof(arp[(pos % 6)] + 12), sd * 0.9, { wave: pulse25, vol: 0.026, cutoff: 1400 + 1100 * Math.sin(bar * 0.4 + pos * 0.1), r: 0.04 });
          if (pos === 0) for (const m of ch) for (const dt of [-9, 9]) tone(t, mtof(m), sd * 16, { type: 'sawtooth', vol: 0.016, a: 0.35, r: 0.5, cutoff: 1100, detune: dt });
          // Lead melody on bars 4-7 of every 8, phrase regenerates every 16 bars.
          if (bar % 16 === 0 && pos === 0) {
            const R = rng(bar * 31 + 5);
            phrase = Array.from({ length: 16 }, (_, i) => (R() < 0.45 && i % 2 === 0 ? pent[Math.floor(R() * pent.length)] : 0));
          }
          if (phrase && bar % 8 >= 4) {
            const m = phrase[pos];
            if (m) tone(t, mtof(m), sd * 2.6, { type: 'triangle', vol: 0.07, a: 0.02, vib: 5, r: 0.2 });
          }
        },
      };
    },
    trash: () => {
      const chords = [[62, 65, 69, 72], [55, 58, 62, 65], [58, 62, 65, 69], [57, 61, 64, 67]];
      const roots = [38, 43, 46, 45];
      let crackle = null;
      return {
        bpm: 84, swing: 0.2,
        start(o) {
          crackle = ctx.createBufferSource(); crackle.buffer = noiseBuf; crackle.loop = true;
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
          const g = ctx.createGain(); g.gain.value = 0.012;
          crackle.connect(f).connect(g).connect(o); crackle.start();
        },
        stop() { try { crackle?.stop(); } catch { /* ignore */ } },
        step(n, t, sd) {
          const pos = n % 16, bar = Math.floor(n / 16), ci = bar % 4, ch = chords[ci];
          const R = rng(bar * 13 + pos);
          if (pos === 0 || pos === 10 || (pos === 7 && bar % 2 === 1)) kick(t, pos === 0 ? 0.6 : 0.45);
          if (pos === 4 || pos === 12) { noise(t, 0.16, 0.2, { type: 'bandpass', freq: 1400, q: 0.8 }); noise(t, 0.05, 0.08, { type: 'highpass', freq: 5000 }); }
          if (pos % 2 === 0) noise(t, pos === 14 && bar % 2 ? 0.22 : 0.035, pos % 4 === 0 ? 0.03 : 0.05, { freq: 8000 });
          if (pos === 0 || (pos === 10 && bar % 2 === 0)) {
            const len = pos === 0 ? sd * 9 : sd * 4;
            for (const m of ch) { tone(t + R() * 0.02, mtof(m), len, { type: 'sine', vol: 0.045, a: 0.01, r: len * 0.7 }); tone(t, mtof(m + 12), len * 0.5, { type: 'triangle', vol: 0.008, a: 0.005 }); }
          }
          if (pos === 0) tone(t, mtof(roots[ci]), sd * 6, { type: 'sine', vol: 0.2, a: 0.01, r: 0.2 });
          if (pos === 10) tone(t, mtof(roots[ci] + (bar % 2 ? 12 : 7)), sd * 3, { type: 'sine', vol: 0.16, a: 0.01, r: 0.1 });
          if (R() < 0.08) noise(t, 0.01, 0.12, { type: 'bandpass', freq: 2500 + R() * 3000, q: 3 }); // vinyl pop
          if (bar % 4 === 3 && pos === 8 && R() < 0.6) tone(t, mtof(pick([74, 77, 81])), sd * 6, { type: 'sine', vol: 0.05, vib: 9, glide: 0.94, a: 0.05 });
        },
      };
    },
    dust: () => {
      const prog = ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'];
      const CH = { G: { r: 43, ch: [67, 71, 74] }, C: { r: 48, ch: [67, 72, 76] }, D: { r: 50, ch: [66, 69, 74] } };
      const pent = [67, 69, 71, 74, 76, 79, 81, 83];
      let phraseA = null, phraseB = null;
      const mk = (seed) => {
        const R = rng(seed); let i = 3; const out = [];
        for (let s = 0; s < 32; s++) {
          if (s % 2) { out.push(0); continue; }
          if (R() < 0.18) { out.push(-1); continue; } // rest
          i = Math.max(0, Math.min(pent.length - 1, i + Math.floor(R() * 5) - 2));
          out.push(pent[i]);
        }
        return out;
      };
      return {
        bpm: 132, swing: 0.12,
        step(n, t, sd) {
          const pos = n % 16, bar = Math.floor(n / 16), c = CH[prog[bar % 8]], nxt = CH[prog[(bar + 1) % 8]];
          if (bar % 32 === 0 && pos === 0) { phraseA = mk(bar + 1); phraseB = mk(bar + 99); }
          if (pos === 0) { kick(t, 0.35); tone(t, mtof(c.r), sd * 3, { wave: pulse25, vol: 0.09, cutoff: 1200, r: 0.05 }); }
          if (pos === 8) { kick(t, 0.25); tone(t, mtof(c.r + 7), sd * 3, { wave: pulse25, vol: 0.08, cutoff: 1200, r: 0.05 }); }
          if (pos === 12 && bar % 2 === 1) tone(t, mtof(nxt.r - 1), sd * 1.5, { wave: pulse25, vol: 0.07, cutoff: 1200 });
          if (pos === 14) tone(t, mtof(c.r + 4), sd * 1.5, { wave: pulse25, vol: 0.06, cutoff: 1200 });
          if (pos === 4 || pos === 12) {
            for (const m of c.ch) tone(t, mtof(m), sd * 1.2, { wave: pulse12, vol: 0.022, r: 0.03 });
            noise(t, 0.07, 0.08, { type: 'bandpass', freq: 2500, q: 0.9 });
          }
          if (pos % 2 === 1) noise(t, 0.025, 0.02, { freq: 9000 });
          if (phraseA) {
            const ph = (bar % 8) < 4 ? phraseA : (bar % 8) < 6 ? phraseB : phraseA;
            const m = ph[(bar % 2) * 16 + pos];
            if (m > 0) {
              const yeehaw = pos === 14 && bar % 4 === 3;
              tone(t, mtof(m), sd * (yeehaw ? 3 : 1.8), { type: 'square', vol: 0.04, cutoff: 3000, glide: yeehaw ? 1.33 : 0, vib: yeehaw ? 0 : 3, r: 0.04 });
            }
          }
        },
      };
    },
    talk: () => ({
      bpm: 90, swing: 0,
      step(n, t) {
        // Quiet "hold music" bed under Big Ron.
        const pos = n % 32;
        if (pos === 0) for (const m of [[60, 64, 67], [57, 60, 65]][Math.floor(n / 32) % 2]) tone(t, mtof(m), 5, { type: 'triangle', vol: 0.006, a: 0.4, r: 1 });
      },
    }),
  };

  // ---------------------------------------------------------------- switching
  function desired() {
    if (!game.started) return musicVol > 0 ? 'menu' : null;
    if (stationIdx < 0) return null;
    if (game.player?.vehicle || earbuds) return STATIONS[stationIdx].id;
    return null;
  }

  function switchTo(id) {
    if (out) {
      const o = out, g = gen;
      try { o.gain.cancelScheduledValues(ctx.currentTime); o.gain.setValueAtTime(o.gain.value, ctx.currentTime); o.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4); } catch { /* ignore */ }
      setTimeout(() => { try { g?.stop?.(); o.disconnect(); } catch { /* ignore */ } }, 600);
    }
    stopTalk();
    out = null; gen = null; playing = id;
    if (!id) { updateHud(); return; }
    out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + (id === 'menu' ? 2.5 : 0.3));
    if (id === 'trash') {
      // lo-fi: saturate + darken
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
      const sat = ctx.createWaveShaper(); sat.curve = shaper.curve;
      out.connect(sat).connect(f).connect(radioBus);
    } else out.connect(id === 'menu' ? menuBus : radioBus);
    gen = GEN[id]();
    gen.start?.(out);
    nextT = ctx.currentTime + 0.08;
    stepN = 0;
    if (id !== 'menu') game.bus.emit('radio:station', { id });
    updateHud(true);
  }

  // ---------------------------------------------------------------- talk radio
  function stopTalk() {
    try { if (talk.busy && window.speechSynthesis) speechSynthesis.cancel(); } catch { /* ignore */ }
    talk.busy = false; talk.seg = null; talk.line = '';
  }
  function speakerName(who) { return who === 'dj' ? 'BIG RON' : who === 'ad' ? 'SPONSOR' : (talk.caller || 'CALLER').toUpperCase(); }
  function nextTalkLine() {
    if (!talk.seg || talk.segI >= talk.seg.length) {
      if (!talk.deck.length) talk.deck = TALK.map((_, i) => i).sort(() => Math.random() - 0.5);
      talk.seg = TALK[talk.deck.pop()];
      talk.segI = 0;
      talk.caller = pick(CALLERS);
      // station ident jingle
      if (out) { const t = ctx.currentTime + 0.02; [72, 76, 79].forEach((m, i) => tone(t + i * 0.12, mtof(m), 0.3, { type: 'triangle', vol: 0.05 })); }
    }
    const [who, text] = talk.seg[talk.segI++];
    talk.line = `<b>${speakerName(who)}:</b> ${esc(text)}`;
    talk.busy = true;
    updateHud();
    const vol = radioVol * (audio.volume ?? 1) * (audio.getBusVolume?.('music') ?? 1);
    const synth = window.speechSynthesis;
    const done = () => { if (playing === 'talk') { talk.busy = false; talk.until = performance.now() + 450; } };
    if (synth && vol > 0.02 && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.volume = Math.min(1, vol * 1.2);
        u.rate = who === 'ad' ? 1.35 : who === 'dj' ? 1.02 : 1.1;
        u.pitch = who === 'dj' ? 0.6 : who === 'ad' ? 1.1 : 1.3 + Math.random() * 0.5;
        const voices = synth.getVoices?.() || [];
        const en = voices.filter((v) => /^en/i.test(v.lang));
        if (en.length) u.voice = who === 'dj' ? en[0] : en[(talk.segI + 1) % en.length];
        u.onend = done; u.onerror = done;
        synth.speak(u);
        // Safety net in case onend never fires.
        talk.until = performance.now() + 2500 + text.length * 90;
        talk.watchdog = true;
        return;
      } catch { /* fall back to subtitles */ }
    }
    talk.watchdog = false;
    setTimeout(done, 1500 + text.length * 55);
  }
  function updateTalk() {
    if (playing !== 'talk') return;
    const now = performance.now();
    if (!talk.busy && now >= talk.until) nextTalkLine();
    else if (talk.busy && talk.watchdog && now > talk.until) { try { speechSynthesis.cancel(); } catch { /* ignore */ } talk.busy = false; }
  }

  // ---------------------------------------------------------------- HUD
  let hudFlashT = 0;
  function updateHud(flash = false) {
    const el = document.getElementById('hud-radio');
    if (!el) return;
    if (!playing || playing === 'menu') { el.classList.add('hidden'); return; }
    const s = STATIONS.find((x) => x.id === playing);
    if (flash) { hudFlashT = performance.now() + 3500; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    const big = performance.now() < hudFlashT;
    el.classList.remove('hidden');
    el.innerHTML = `<div class="rad-st"><span class="rad-note">♫</span> <b>${s.freq}</b> · ${s.genre} <span class="rad-keys"><kbd>,</kbd><kbd>.</kbd></span></div>
      ${big ? `<div class="rad-tag">${s.tag}</div>` : ''}${playing === 'talk' && talk.line ? `<div class="rad-sub">${talk.line}</div>` : ''}`;
  }

  // ---------------------------------------------------------------- scheduler
  function tick() {
    if (!ctx) return;
    const want = desired();
    if (want !== playing) switchTo(want);
    if (!gen) return;
    const bpm = gen.bpm, sd = 60 / bpm / 4;
    const now = ctx.currentTime;
    if (nextT < now - 0.1) nextT = now + 0.05; // tab was asleep: resync instead of bursting
    while (nextT < now + 0.25) {
      const swing = stepN % 2 === 1 ? gen.swing * sd : 0;
      try { gen.step(stepN, nextT + swing, sd); } catch (e) { if (!gen._err) { console.error('[radio]', e); gen._err = true; } }
      nextT += sd; stepN++;
    }
    updateTalk();
  }
  setInterval(tick, 40);

  let hudT = 0;
  game.addSystem({
    name: 'radio',
    update(dt) {
      if (!game.started) return;
      const inp = game.input;
      if ((game.player?.vehicle || earbuds) && !game.controlsLocked) {
        if (inp.wasPressed('Period')) api.next();
        if (inp.wasPressed('Comma')) api.prev();
      }
      hudT -= dt;
      if (hudT <= 0) { hudT = 0.5; updateHud(); }
    },
  });
  game.bus.on('car:entered', () => setTimeout(() => updateHud(true), 50));
  game.bus.on('game:start', () => { if (ctx) tick(); });

  const api = {
    STATIONS,
    current: () => (stationIdx >= 0 ? STATIONS[stationIdx] : null),
    get playing() { return playing; },
    get volume() { return radioVol; },
    get musicVolume() { return musicVol; },
    get earbuds() { return earbuds; },
    set(id) {
      stationIdx = id === 'off' || id == null ? -1 : STATIONS.findIndex((s) => s.id === id || s === id);
      saveNum('doxsrpg_station', stationIdx);
      if (stationIdx < 0) game.ui.toast('Radio off. Sweet, sweet tinnitus.', 'info', 1400);
      tick();
      updateHud(true);
    },
    next() { const i = stationIdx + 1; api.set(i >= STATIONS.length ? 'off' : STATIONS[i].id); },
    prev() { const i = stationIdx - 1; api.set(i < -1 ? STATIONS[STATIONS.length - 1].id : i === -1 ? 'off' : STATIONS[i].id); },
    setVolume(v) { radioVol = Math.max(0, Math.min(1, v)); saveNum('doxsrpg_radio_vol', radioVol); if (radioBus) radioBus.gain.value = radioVol; },
    setMusicVolume(v) { musicVol = Math.max(0, Math.min(1, v)); saveNum('doxsrpg_music_vol', musicVol); if (menuBus) menuBus.gain.value = musicVol; },
    setEarbuds(on) { earbuds = !!on; tick(); },
  };
  game.radio = api;
  return api;
}
