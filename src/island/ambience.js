// Island atmosphere + locals: the lighthouse foghorn, seagulls, the toll troll, Mumbling Hank,
// a night-shift clown at the Funland gate, the gate guard, and the island dealer.
import { pick, chance } from '../core/util.js';
import { isle, playerPos } from './common.js';

export function installAmbience(game) {
  const W = () => game.world?.island;

  // ---------------------------------------------------------------- sounds (WebAudio synthesis)
  function out() { const a = game.audio; return a?.ctx && a.sfx ? a : null; }
  function foghorn(vol = 1) {
    const a = out(); if (!a) return;
    const ctx = a.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.35);
    g.gain.setValueAtTime(0.32 * vol, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    lp.connect(g).connect(a.sfx);
    for (const [f, type] of [[82, 'sawtooth'], [83.2, 'sawtooth'], [123, 'square'], [41, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.4);
      const og = ctx.createGain(); og.gain.value = type === 'square' ? 0.15 : 0.5;
      o.connect(og).connect(lp); o.start(t); o.stop(t + 3.5);
    }
  }
  function gull(vol = 0.5) {
    const a = out(); if (!a) return;
    const ctx = a.ctx;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * (0.16 + Math.random() * 0.1);
      const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      const f0 = 1300 + Math.random() * 600;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.04); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.14);
      bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(bp).connect(g).connect(a.sfx); o.start(t); o.stop(t + 0.18);
    }
  }
  function waves(vol = 0.4) {
    const a = out(); if (!a) return;
    const ctx = a.ctx, t = ctx.currentTime, len = 2.6;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.12 * vol;
    s.connect(lp).connect(g).connect(a.sfx); s.start(t);
  }

  // ---------------------------------------------------------------- locals
  const LOCALS = [];
  function spawnLocals() {
    const I = W(); const n = game.npcs; if (!I || !n?.spawn) return;
    const mk = (spec) => { if (n.get(spec.id) && !n.get(spec.id).removed) return; const npc = n.spawn({ kind: 'static', persistent: true, wander: false, ...spec }); if (npc) LOCALS.push(npc); };
    mk({ id: 'isle_toll_terry', name: 'Toll Troll Terry', x: I.tollX + 2.5, z: -10, facing: Math.PI / 2, color: '#e86a1a', hat: 'hardhat', hatColor: '#d8c020', scale: 1.15,
      talkPrompt: 'Talk to Toll Troll Terry',
      onTalk: (g) => g.ui.dialog({ title: 'Toll Troll Terry', speaker: 'Terry', text: pick([
        '"I been guardin\' this bridge since I was nine. My dad guarded it before me. He fell off it. That\'s how I got the job."',
        '"Toll\'s for the BRIDGE fund. The bridge fund is a jar. The jar is in my truck. The truck is also a fund."',
        isle(g).tollDay === g.time.day ? '"You\'re square for today. Go on. Don\'t feed the clown."' : '"You ain\'t paid today. I can smell it on you."',
      ]) }) });
    const pier = I.spots.pier;
    mk({ id: 'isle_hank', name: 'Mumbling Hank', x: pier.x + 2.2, z: pier.z1 - 9, facing: 0, color: '#4a5a3a', hat: 'beanie', hatColor: '#8a2a1a',
      onTalk: (g) => g.ui.dialog({ title: 'Mumbling Hank', speaker: 'Hank', text: pick(['"Mmrrf. Big one. Fog. Mrrf."', '"Don\'t eat the glowin\' ones. Ate one in \'09. Could see through walls for a week. Saw things. Bad things. My neighbor\'s things."', '"Bait shed\'s open. Hank\'s always open. Hank don\'t sleep. Hank fishes."']) }) });
    if (I.penGate) mk({ id: 'isle_krumm', name: 'Officer Krumm', x: I.penGate.x - 9, z: I.penGate.z + 2, facing: 0, color: '#2a3a5a', hat: 'cap', hatColor: '#1a2030',
      onTalk: (g) => g.ui.dialog({ title: 'Officer Krumm', speaker: 'Krumm', text: pick(['"Visiting room\'s the grey door. Everything here is grey. Even my soul. Especially my soul."', '"No loitering by the gate. Loitering is for the inside."', '"Seven letters, \'place you shouldn\'t be\'. ...PRISONS? Nah, that\'s seven. Huh. It IS seven."']) }) });
    // the island dealer (if the NPC module doesn't place one here)
    const ds = game.world?.dealerSpots?.blackwater;
    if (ds && !n.get('dealer_blackwater')) {
      const npc = n.spawn({ id: 'dealer_blackwater', kind: 'dealer', role: 'dealer', name: 'Salty Sal', x: ds.x, z: ds.z, facing: ds.facing ?? 0, persistent: true, wander: false, leash: 4,
        color: '#1c2a2e', hat: 'beanie', hatColor: '#2a6a7a', talkPrompt: 'Talk to Salty Sal <small>(dealer)</small>', data: { dealer: true, district: 'blackwater' } });
      if (npc) LOCALS.push(npc);
    }
  }
  // the night clown at the Funland gate (only between 10PM and 4AM)
  let clown = null;
  function updateClown() {
    const I = W(); const n = game.npcs; if (!I || !n?.spawn) return;
    const night = game.time.isBetween(22, 4);
    if (night && (!clown || clown.removed || clown.dead)) {
      clown = n.spawn({ id: 'isle_clown', kind: 'static', name: 'Chuckles', x: I.spots.gate.x - 3, z: I.spots.gate.z + 8, facing: -Math.PI / 2, color: '#e8e0d0', hat: 'beanie', hatColor: '#c82a2a', persistent: true, wander: false,
        talkPrompt: 'Talk to the clown (why?)',
        onTalk: async (g) => {
          const i = await g.ui.dialog({ title: 'Chuckles', speaker: 'Chuckles the Clown', text: pick([
            '"Wanna see a magic trick?" He pulls a tissue from his sleeve. And another. And another. They\'re all wet. He doesn\'t stop. "Hee."',
            '"Funland\'s closed, friend. But the WHEEL is open. The wheel is always open. Want a balloon? It\'s red. They\'re all red now."',
          ]), options: [{ label: 'Take the balloon' }, { label: 'Back away slowly' }] });
          if (i === 0) {
            if (chance(0.5)) { g.state.addItem('prize_nose', 1); g.ui.toast('The balloon pops. Inside: a clown nose. It\'s warm.', 'info', 3000); }
            else { g.state.damage(5, 'clown'); g.ui.toast('The balloon pops in your face. Chuckles laughs for nine straight seconds. -5 HP (emotional).', 'bad', 3000); }
          }
        } });
    } else if (!night && clown && !clown.removed) { n.remove(clown); clown = null; }
  }

  // ---------------------------------------------------------------- per-frame: sounds, locals upkeep, island mist
  let hornT = 8, gullT = 3, waveT = 2, upkeepT = 0;
  game.addSystem({
    name: 'island-ambience',
    update(dt) {
      if (!game.started) return;
      const I = W(); if (!I) return;
      const p = playerPos(game);
      const L = I.lighthouse;
      const dl = Math.hypot(p.x - L.x, p.z - L.z);
      const onIsle = p.x > 700;
      const weather = game.world?.weather ?? 'overcast';
      const gloomy = weather === 'fog' || weather === 'rain' || weather === 'storm' || game.time.isNight;
      // foghorn: in fog/rain/at night, audible across the bay
      hornT -= dt;
      if (hornT <= 0) {
        hornT = weather === 'fog' ? 28 + Math.random() * 10 : 50 + Math.random() * 20;
        if (gloomy && dl < 1000) foghorn(Math.max(0.12, Math.min(1, 160 / (dl + 60))));
      }
      // gulls by day near/over the island and the docks
      gullT -= dt;
      if (gullT <= 0) {
        gullT = 4 + Math.random() * 9;
        if (!game.time.isNight && weather !== 'storm' && (onIsle || p.x > 560)) gull(onIsle ? 0.7 : 0.35);
      }
      waveT -= dt;
      if (waveT <= 0) { waveT = 3 + Math.random() * 3; if (onIsle || p.x > 600) waves(onIsle ? 0.6 : 0.4); }
      upkeepT -= dt;
      if (upkeepT <= 0) { upkeepT = 5; try { if (onIsle || p.x > 500) { spawnLocals(); updateClown(); } } catch (e) { console.error('[island] locals', e); } }
    },
  });

  game.bus.on('game:start', () => { upkeepT = 1; });
  return { foghorn, gull, waves, spawnLocals };
}
