// Tiny WebAudio synth for systems sounds (coins, cards, slots, wins...).
// Routed through game.audio.sfx so the global volume applies. Silent if audio isn't running yet.
export function installSfx(game) {
  function out() {
    const a = game.audio;
    if (!a?.ctx || !a.sfx) return null;
    if (a.ctx.state === 'suspended') { try { a.ctx.resume(); } catch { /* ignore */ } }
    return a;
  }

  function tone(a, { f = 440, f2 = null, type = 'square', t0 = 0, dur = 0.12, vol = 0.15 }) {
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime + t0;
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(a.sfx);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function noise(a, { t0 = 0, dur = 0.1, vol = 0.2, freq = 1200, q = 1 }) {
    const ctx = a.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(a.sfx);
    src.start(ctx.currentTime + t0);
  }

  const SOUNDS = {
    coin: (a) => { tone(a, { f: 988, dur: 0.07, vol: 0.1 }); tone(a, { f: 1319, t0: 0.07, dur: 0.18, vol: 0.1 }); },
    cash: (a) => { noise(a, { dur: 0.08, freq: 3000, vol: 0.25 }); tone(a, { f: 1568, t0: 0.06, dur: 0.25, type: 'triangle', vol: 0.12 }); tone(a, { f: 2093, t0: 0.1, dur: 0.3, type: 'triangle', vol: 0.08 }); },
    buy: (a) => { tone(a, { f: 660, dur: 0.06, vol: 0.08 }); tone(a, { f: 880, t0: 0.06, dur: 0.1, vol: 0.08 }); },
    card: (a) => noise(a, { dur: 0.06, freq: 2500, vol: 0.3, q: 0.7 }),
    tick: (a) => tone(a, { f: 1800, dur: 0.02, vol: 0.05, type: 'square' }),
    reel: (a) => tone(a, { f: 220, f2: 140, dur: 0.08, vol: 0.12, type: 'sawtooth' }),
    win: (a) => [523, 659, 784, 1047].forEach((f, i) => tone(a, { f, t0: i * 0.09, dur: 0.16, vol: 0.12, type: 'square' })),
    jackpot: (a) => { for (let i = 0; i < 10; i++) tone(a, { f: [523, 659, 784, 1047][i % 4] * (i > 5 ? 2 : 1), t0: i * 0.07, dur: 0.12, vol: 0.12 }); },
    lose: (a) => { tone(a, { f: 330, f2: 220, dur: 0.25, vol: 0.12, type: 'sawtooth' }); tone(a, { f: 220, f2: 110, t0: 0.25, dur: 0.4, vol: 0.12, type: 'sawtooth' }); },
    punch: (a) => { noise(a, { dur: 0.12, freq: 400, vol: 0.5 }); tone(a, { f: 120, f2: 50, dur: 0.15, vol: 0.2, type: 'sine' }); },
    gulp: (a) => { tone(a, { f: 300, f2: 150, dur: 0.12, vol: 0.12, type: 'sine' }); tone(a, { f: 280, f2: 120, t0: 0.18, dur: 0.12, vol: 0.12, type: 'sine' }); },
    levelup: (a) => [392, 523, 659, 784].forEach((f, i) => tone(a, { f, t0: i * 0.12, dur: 0.25, vol: 0.1, type: 'triangle' })),
    door: (a) => { noise(a, { dur: 0.2, freq: 300, vol: 0.3 }); tone(a, { f: 90, dur: 0.2, vol: 0.12, type: 'sine' }); },
    buzz: (a) => tone(a, { f: 110, dur: 0.3, vol: 0.12, type: 'square' }),
    spray: (a) => noise(a, { dur: 0.35, freq: 5000, vol: 0.15, q: 0.4 }),
    dart: (a) => { noise(a, { dur: 0.05, freq: 4000, vol: 0.2 }); tone(a, { f: 160, t0: 0.04, dur: 0.08, vol: 0.15, type: 'sine' }); },
    // minigames
    mgStart: (a) => { tone(a, { f: 440, dur: 0.08, vol: 0.08, type: 'triangle' }); tone(a, { f: 660, t0: 0.09, dur: 0.12, vol: 0.08, type: 'triangle' }); },
    mgGreat: (a) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, { f, t0: i * 0.07, dur: 0.18, vol: 0.09, type: 'triangle' })),
    mgOk: (a) => { tone(a, { f: 523, dur: 0.1, vol: 0.08, type: 'triangle' }); tone(a, { f: 659, t0: 0.1, dur: 0.18, vol: 0.08, type: 'triangle' }); },
    mgBad: (a) => { tone(a, { f: 260, f2: 180, dur: 0.3, vol: 0.1, type: 'sawtooth' }); tone(a, { f: 175, f2: 90, t0: 0.3, dur: 0.5, vol: 0.1, type: 'sawtooth' }); },
    mgBest: (a) => { for (let i = 0; i < 6; i++) tone(a, { f: [784, 988, 1175][i % 3] * (i > 2 ? 2 : 1), t0: i * 0.06, dur: 0.12, vol: 0.07 }); },
    hit: (a) => tone(a, { f: 880, dur: 0.06, vol: 0.07, type: 'triangle' }),
    perfect: (a) => { tone(a, { f: 1175, dur: 0.06, vol: 0.07, type: 'triangle' }); tone(a, { f: 1568, t0: 0.05, dur: 0.1, vol: 0.06, type: 'triangle' }); },
    miss: (a) => tone(a, { f: 150, f2: 90, dur: 0.16, vol: 0.1, type: 'square' }),
    scrub: (a) => noise(a, { dur: 0.09, freq: 2200 + Math.random() * 1200, vol: 0.22, q: 1.4 }),
    squeak: (a) => tone(a, { f: 1900, f2: 2600, dur: 0.07, vol: 0.05, type: 'sine' }),
    sizzle: (a) => noise(a, { dur: 0.45, freq: 6000, vol: 0.12, q: 0.5 }),
    flip: (a) => { noise(a, { dur: 0.05, freq: 900, vol: 0.25 }); tone(a, { f: 300, f2: 500, dur: 0.08, vol: 0.06, type: 'sine' }); },
    squish: (a) => { noise(a, { dur: 0.14, freq: 500, vol: 0.35, q: 2 }); tone(a, { f: 180, f2: 70, dur: 0.14, vol: 0.1, type: 'sine' }); },
    clank: (a) => { tone(a, { f: 620, dur: 0.18, vol: 0.06, type: 'square' }); tone(a, { f: 931, dur: 0.14, vol: 0.05, type: 'square' }); noise(a, { dur: 0.05, freq: 3000, vol: 0.2 }); },
    pour: (a) => noise(a, { dur: 0.3, freq: 900, vol: 0.18, q: 0.6 }),
    stamp: (a) => { noise(a, { dur: 0.06, freq: 700, vol: 0.4 }); tone(a, { f: 110, f2: 60, dur: 0.1, vol: 0.12, type: 'sine' }); },
    whoosh: (a) => noise(a, { dur: 0.18, freq: 1500, vol: 0.15, q: 0.4 }),
    grunt: (a) => { tone(a, { f: 140, f2: 95, dur: 0.22, vol: 0.12, type: 'sawtooth' }); noise(a, { dur: 0.12, freq: 600, vol: 0.12 }); },
    tickTock: (a) => tone(a, { f: 1200, dur: 0.025, vol: 0.05, type: 'square' }),
  };

  const sfx = {
    play(name) {
      const a = out();
      const s = SOUNDS[name];
      if (!a || !s) return;
      try { s(a); } catch (e) { /* audio is optional */ }
    },
  };
  game.sysSfx = sfx;

  // Cash register on purchases, coins on income (rate-limited).
  let lastMoney = 0;
  game.bus.on('money:change', ({ amount }) => {
    const now = performance.now();
    if (now - lastMoney < 120 || !amount) return;
    lastMoney = now;
    sfx.play(amount > 0 ? 'coin' : 'buy');
  });
  game.bus.on('job:promoted', () => sfx.play('levelup'));
  return sfx;
}
