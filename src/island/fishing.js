// Pier Zero fishing: cast (power meter), wait for the bite, hook it (timing), reel (tension game).
// Catches are real items (src/island/data.js FISH) you can sell at the Rusty Hook fish counter,
// eat raw (bad idea) or pawn. Junk and treasure too, plus the legendary Old Rustjaw.
import { placeMenu, gamePanel, say } from '../systems/ui-kit.js';
import { pick, chance, rand } from '../core/util.js';
import { FISH, FISH_ORDER, CATCH_JUNK } from './data.js';
import { isle, $, beep, sfx } from './common.js';

const ROD_RENT = 5;

export function installFishing(game) {
  const st = game.state;

  // What bites, given cast distance (0..1), bait, time and weather.
  function rollCatch(dist, bait) {
    const night = game.time.isNight;
    const weather = game.world?.weather ?? 'overcast';
    const foggy = weather === 'fog';
    const s = isle(game);
    // the legend: fog + long cast (+ bait). Rare, but possible.
    let legendP = (foggy ? 0.035 : 0.004) * (dist > 0.75 ? 1.6 : 0.4) * (bait ? 1.5 : 1) * (s.keeper?.secret ? 1.6 : 1);
    if (s.rustjaw) legendP *= 0.5;
    if (chance(legendP)) return { kind: 'fish', id: 'fish_rustjaw' };
    if (chance(bait ? 0.1 : 0.2)) {
      const tot = CATCH_JUNK.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * tot;
      for (const j of CATCH_JUNK) if ((r -= j.w) <= 0) return { kind: 'junk', id: j.id };
      return { kind: 'junk', id: 'soggy_boot' };
    }
    const pool = FISH_ORDER.filter((id) => !FISH[id].legendary && (!FISH[id].minDist || dist >= FISH[id].minDist));
    const wt = (id) => {
      const f = FISH[id];
      let w = f.w;
      if (night && f.night) w *= f.night;
      if (bait) w *= 1 + f.diff; // better bait = fancier fish
      w *= 0.6 + dist * (f.price > 40 ? 1.2 : 0.6);
      return w;
    };
    const tot = pool.reduce((a, id) => a + wt(id), 0);
    let r = Math.random() * tot;
    for (const id of pool) if ((r -= wt(id)) <= 0) return { kind: 'fish', id };
    return { kind: 'fish', id: pool[0] };
  }

  function land(c) {
    const s = isle(game);
    s.casts++;
    const name = game.items?.name?.(c.id) ?? c.id;
    st.addItem(c.id, 1);
    if (c.kind === 'fish') {
      s.caught[c.id] = (s.caught[c.id] || 0) + 1;
      st.addXP(FISH[c.id].legendary ? 400 : 4 + Math.round(FISH[c.id].diff * 10));
      if (FISH[c.id].legendary) {
        s.rustjaw = true;
        game.ui.bigText('OLD RUSTJAW!', 'The legend of Blackwater is yours. He looks at you like you owe him money.', 4200);
        sfx(game, 'jackpot');
        st.addStat('karma', 2);
      }
      game.bus.emit('island:fish', { id: c.id });
    }
    st.changed('island');
    return name;
  }

  // ---------------------------------------------------------------- the minigame
  function fish(useRod) {
    return gamePanel(game, {
      title: 'Pier Zero — Fishing', width: 580,
      extra: () => `Bait ${st.itemCount('bait_worms')}`,
      build(api) {
        let phase = 'idle', power = 0, pdir = 1, wait = 0, biteT = 0, dist = 0, bait = false, cat = null;
        let barPos = 0.4, barVel = 0, hold = false, fishPos = 0.5, fishVel = 0, prog = 0.3, fishT = 0;
        api.body.innerHTML = `<div class="sys-intro" data-intro>The water is black and thick enough to stand a spoon in. Something big moves under the pier. Something bigger moves under <em>that</em>.</div>
          <div data-stage style="min-height:120px"></div>
          <div class="ui-row" style="justify-content:center;margin-top:8px"><button class="ui-btn primary" data-act style="min-width:200px">Cast</button></div>
          <div class="sys-hint" style="text-align:center;margin-top:4px">Each cast takes ~15 minutes and 3 energy. Bait worms improve the bites.</div>`;
        const stage = api.body.querySelector('[data-stage]'), act = api.body.querySelector('[data-act]');
        const setStage = (h) => { stage.innerHTML = h; };
        const bar = (p, cls = '') => `<div class="sys-track"><div class="zone" style="left:0;width:${p * 100}%;background:rgba(74,192,200,.45)"></div><div class="needle ${cls}" style="left:calc(${p * 100}% - 2px)"></div></div>`;
        const idle = () => { phase = 'idle'; act.textContent = 'Cast'; act.disabled = false; setStage(''); };
        const finish = (html, kind) => { api.status(html, kind); idle(); api.cash(); };

        api.timer(() => {
          const dt = 0.03;
          if (phase === 'power') {
            power += pdir * dt * 1.4;
            if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; }
            setStage(`<div class="sys-big" style="font-size:20px">Power</div>${bar(power)}`);
          } else if (phase === 'wait') {
            wait -= dt;
            const bob = Math.sin(Date.now() / 300) * 3;
            setStage(`<div style="text-align:center;font-size:40px;transform:translateY(${bob}px)">🎣 <span style="opacity:.5">~ ~ ~</span> ${'·'.repeat(Math.round(dist * 10))}<span style="color:#e0402f">●</span></div><div class="sys-hint" style="text-align:center">Waiting... (don't jerk it early)</div>`);
            if (wait <= 0) { phase = 'bite'; biteT = 0.85 - (cat?.kind === 'fish' ? FISH[cat.id].diff * 0.3 : 0); act.textContent = 'HOOK IT!'; beep(game, 1200, 0.08); beep(game, 1500, 0.08); }
          } else if (phase === 'bite') {
            biteT -= dt;
            setStage(`<div style="text-align:center;font-size:44px;color:#ffd040">❗ BITE ❗</div>`);
            if (biteT <= 0) { phase = 'idle'; finish(pick(['Too slow. The fish took your bait and left a one-star review.', 'You blinked. The bait is gone. Somewhere a fish is laughing.']), 'bad'); }
          } else if (phase === 'reel') {
            fishT += dt;
            const diff = cat.kind === 'fish' ? FISH[cat.id].diff : 0.2;
            // fish darts around; difficulty = speed + jerkiness
            if (Math.random() < 0.04 + diff * 0.1) fishVel = (Math.random() - 0.5) * (0.6 + diff * 2.2);
            fishPos += fishVel * dt; fishVel *= 0.985;
            if (fishPos < 0.05 || fishPos > 0.95) { fishVel = -fishVel; fishPos = Math.max(0.05, Math.min(0.95, fishPos)); }
            barVel += (hold ? 1.9 : -1.6) * dt; barVel *= 0.96;
            barPos += barVel * dt;
            if (barPos < 0) { barPos = 0; barVel = Math.max(0, barVel) * 0.3; } if (barPos > 1) { barPos = 1; barVel = Math.min(0, barVel) * 0.3; }
            const zoneW = 0.22 - diff * 0.1;
            const inZone = Math.abs(fishPos - barPos) < zoneW / 2;
            prog += (inZone ? 0.22 : -0.16 - diff * 0.08) * dt;
            if (inZone && Math.random() < 0.15) sfx(game, 'reel');
            setStage(`<div class="sys-hint" style="text-align:center">Hold the button (or Space) to lift the green bar. Keep the 🐟 inside it.</div>
              <div class="sys-track" style="height:34px"><div class="zone" style="left:${(barPos - zoneW / 2) * 100}%;width:${zoneW * 100}%"></div><div style="position:absolute;top:2px;left:calc(${fishPos * 100}% - 12px);font-size:22px">🐟</div></div>
              <div class="sys-track" style="height:12px"><div class="zone2" style="left:0;width:${Math.max(0, Math.min(1, prog)) * 100}%;background:rgba(127,191,77,.75)"></div></div>`);
            if (prog >= 1) { phase = 'idle'; const name = land(cat); hold = false;
              const f = cat.kind === 'fish' ? FISH[cat.id] : null;
              finish(f ? `<b>Caught: ${name}!</b> ${f.desc} <span class="sys-hint">(worth ~${$(f.price)} at the Rusty Hook)</span>` : `You reel in... <b>${name}</b>. ${cat.id === 'soggy_boot' ? 'Classic.' : 'Ooh, salvage!'}`, 'good'); }
            else if (prog <= 0 || fishT > 25) { phase = 'idle'; hold = false; finish(cat.id === 'fish_rustjaw' ? 'The line goes slack. Something enormous rolls at the surface — a flash of rust, a hubcap, an eye. Then nothing. <b>Old Rustjaw</b> got away.' : pick(['SNAP. The line breaks. You hold a stick and a feeling.', 'The fish spits the hook out and flips you off with a fin.', 'It got away. They always get away. That\'s fishing. That\'s life.']), 'bad'); }
          }
        }, 30);

        const down = () => { if (phase === 'reel') hold = true; };
        const up = () => { hold = false; };
        act.addEventListener('mousedown', down); act.addEventListener('touchstart', down);
        addEventListener('mouseup', up); addEventListener('touchend', up);
        const key = (e) => { if (e.code === 'Space') { e.preventDefault(); if (e.type === 'keydown') { if (phase === 'reel') hold = true; else act.click(); } else hold = false; } };
        addEventListener('keydown', key); addEventListener('keyup', key);
        api.onClose(() => { removeEventListener('mouseup', up); removeEventListener('touchend', up); removeEventListener('keydown', key); removeEventListener('keyup', key); });

        act.addEventListener('click', () => {
          if (phase === 'idle') {
            if (st.p.energy < 3) { api.status('Too tired to cast. Your arm just flops.', 'bad'); return; }
            phase = 'power'; power = 0; pdir = 1; act.textContent = 'Release!'; api.status('');
          } else if (phase === 'power') {
            dist = power;
            bait = st.removeItem('bait_worms', 1);
            st.addStat('energy', -3);
            game.time.advance(15);
            cat = rollCatch(dist, bait);
            wait = rand(1.2, 4.2) + (cat.id === 'fish_rustjaw' ? 2 : 0);
            phase = 'wait'; act.textContent = 'Hook it!';
            api.status(dist > 0.85 ? 'A beautiful cast. The lure sails into the fog.' : dist < 0.2 ? 'The lure plops three feet away and hits a floating diaper.' : 'Decent cast. Plop.', '');
            api.cash();
          } else if (phase === 'wait') {
            phase = 'idle'; finish('You yanked too early. The fish saw the whole thing and told its friends.', 'bad');
          } else if (phase === 'bite') {
            phase = 'reel'; prog = 0.3; barPos = 0.5; barVel = 0; fishPos = 0.5; fishVel = 0; fishT = 0; hold = true;
            act.textContent = 'REEL (hold)';
            api.status(cat.id === 'fish_rustjaw' ? '<b>THE LINE SCREAMS.</b> Something ancient is on the other end.' : 'Fish on!', 'good');
          }
        });
        // expose for tests / other modules
        api.el._isleFish = { get phase() { return phase; }, force: (p) => { prog = p; } };
      },
    });
  }

  async function shed() {
    const s = isle(game);
    const caughtN = Object.values(s.caught).reduce((a, b) => a + b, 0);
    const i = await game.ui.dialog({
      title: 'Bait Shed', speaker: 'Mumbling Hank',
      html: `${pick(['Hank mumbles something about "the big one". Or "the bingo". Hard to tell. He has six teeth and they all disagree.', 'Hank is gutting a fish with a spoon. "Rods, worms, wisdom. Two outta three\'s for sale."'])}<br><span class="sys-hint">Fish caught so far: ${caughtN}${s.rustjaw ? ' · <b>Old Rustjaw: CAUGHT</b>' : ''}</span>`,
      options: [
        { label: `Buy a fishing rod (${$(35)})`, disabled: st.hasItem('fishing_rod') },
        { label: `Buy bait worms ×5 (${$(4 * 5)})` },
        { label: 'Ask about Old Rustjaw' },
        { label: 'Back' },
      ],
    });
    if (i === 0) { if (game.items.buy('fishing_rod', 1)) game.ui.toast('Hank: "Treat her nice. She\'s caught more fish than I have."', 'info', 2500); }
    else if (i === 1) game.items.buy('bait_worms', 5);
    else if (i === 2) await say(game, 'Bait Shed', pick([
      '"Rustjaw? Ninety pounds. Hubcap in his mouth. Ate my brother\'s hat. With my brother\'s head in it. Fog. Long cast. That\'s all I know."',
      '"Fog\'s when he feeds. Cast long as you can. Worms help. Prayin\' helps less."',
    ]), 'Mumbling Hank');
  }

  game.locations.register('isle_pier', (g, loc) => placeMenu(g, loc, {
    hours: null,
    speaker: 'Pier Zero',
    text: () => `${pick([
      'The pier creaks like an old man getting out of a recliner. Gulls watch you with open contempt. The water smells like a gas station bathroom.',
      'A hand-painted sign: "CATCH & RELEASE · OR CATCH & EAT · WE DON\'T JUDGE (WE DO)". Mumbling Hank fishes from the bait shed, asleep.',
    ])}${g.world?.weather === 'fog' ? '<br><em>The fog is in. Hank says the big ones come up in the fog.</em>' : ''}`,
    options: () => {
      const has = st.hasItem('fishing_rod');
      return [
        { label: has ? 'Fish' : `Rent Hank's rod and fish (${$(ROD_RENT)})`, hint: `bait: ${st.itemCount('bait_worms')}`, run: () => {
          if (!has && !st.spend(ROD_RENT, 'fishing')) return;
          return fish(has);
        } },
        { label: 'Visit the bait shed', run: () => shed() },
      ];
    },
  }));

  return { fish, rollCatch, land };
}
