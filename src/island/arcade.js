// Funland Arcade: skee-ball, Whack-a-Rat, the (rigged) claw machine, and the prize counter.
import { placeMenu, gamePanel, shopPanel, say } from '../systems/ui-kit.js';
import { pick, chance, randInt } from '../core/util.js';
import { PRIZES } from './data.js';
import { isle, $, beep, sfx } from './common.js';

const PLAY = { skee: 2, whack: 3, claw: 5 };

export function installArcade(game) {
  const st = game.state;

  function addTickets(n, why = '') {
    const s = isle(game);
    s.tickets += n; s.ticketsTotal += n;
    st.changed('island');
    if (n > 0) game.ui.toast(`+${n} tickets${why ? ' — ' + why : ''}. (${s.tickets} total)`, 'money', 1800);
  }

  // ---------------------------------------------------------------- skee-ball
  function skeeBall() {
    return gamePanel(game, {
      title: 'Skee-Ball (sticky edition)', width: 560,
      extra: () => `Tickets ${isle(game).tickets}`,
      build(api) {
        let balls = 0, score = 0, pos = 0, dir = 1, rolling = false, paid = false;
        const ZONES = [[0, 0.18, 10], [0.18, 0.34, 20], [0.34, 0.48, 30], [0.48, 0.58, 40], [0.58, 0.64, 50], [0.64, 0.665, 100], [0.665, 0.74, 50], [0.74, 0.86, 30], [0.86, 1, 10]];
        api.body.innerHTML = `<div class="sys-intro">Nine balls, one lane, a smell like old popcorn and despair. Stop the needle in the <b>100 hole</b>. The 100 hole is the size of a nostril.</div>
          <div class="sys-track" style="height:34px">${ZONES.map(([a, b, v]) => `<div class="${v >= 50 ? 'zone' : ''}" style="position:absolute;top:0;bottom:0;left:${a * 100}%;width:${(b - a) * 100}%;border-right:1px solid #3b342b;${v === 100 ? 'background:rgba(255,64,160,.6)' : ''};font-size:12px;text-align:center;color:#c8c0a8">${v}</div>`).join('')}<div class="needle"></div></div>
          <div class="sys-big" data-s>Score: 0 · Balls left: 9</div>
          <div class="ui-row" style="justify-content:center;margin-top:8px"><button class="ui-btn primary" data-roll>Pay ${$(PLAY.skee)} &amp; play</button></div>`;
        const needle = api.body.querySelector('.needle'), btn = api.body.querySelector('[data-roll]'), lbl = api.body.querySelector('[data-s]');
        api.timer(() => {
          if (!rolling) return;
          pos += dir * 0.022 * (1 + balls * 0.06);
          if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
          needle.style.left = `calc(${pos * 100}% - 2px)`;
        }, 16);
        btn.addEventListener('click', () => {
          if (!paid) {
            if (!st.spend(PLAY.skee, 'arcade')) return;
            paid = true; rolling = true; balls = 0; score = 0;
            btn.textContent = 'ROLL!'; api.cash(); return;
          }
          if (!rolling) return;
          const z = ZONES.find(([a, b]) => pos >= a && pos < b) ?? ZONES[0];
          const pts = z[2];
          score += pts; balls++;
          beep(game, 300 + pts * 6, 0.12);
          api.status(pick([`Thunk. ${pts}.`, `The ball rolls in sideways. ${pts}.`, `${pts}! A kid behind you gasps. There are no kids here. Who gasped?`, `${pts}. The machine burps.`]), pts >= 50 ? 'good' : '');
          lbl.textContent = `Score: ${score} · Balls left: ${9 - balls}`;
          if (balls >= 9) {
            rolling = false; paid = false;
            const t = Math.floor(score / 10) + (score >= 450 ? 25 : 0);
            addTickets(t, 'skee-ball');
            api.status(`Final score <b>${score}</b>. The machine spits out <b>${t}</b> damp tickets.${score >= 450 ? ' JACKPOT BONUS!' : ''}`, 'good');
            btn.textContent = `Pay ${$(PLAY.skee)} & play again`;
            game.time.advance(10);
            api.cash();
          }
        });
      },
    });
  }

  // ---------------------------------------------------------------- whack-a-rat
  function whackARat() {
    return gamePanel(game, {
      title: 'Whack-a-Rat', width: 520,
      extra: () => `Tickets ${isle(game).tickets}`,
      build(api) {
        let running = false, t = 0, hits = 0, misses = 0;
        const holes = Array.from({ length: 9 }, () => ({ kind: null, ttl: 0 }));
        api.body.innerHTML = `<div class="sys-intro">Real rats. Funland couldn't afford animatronics, so they just... trained some. Whack the <b>rats</b>, not the <b>clown</b>. 20 seconds.</div>
          <div data-grid style="display:grid;grid-template-columns:repeat(3,96px);gap:8px;justify-content:center;margin:10px 0">${holes.map((_, i) => `<button class="ui-btn" data-h="${i}" style="height:80px;font-size:40px;background:#1b1612">·</button>`).join('')}</div>
          <div class="sys-big" data-s>Hits 0</div>
          <div class="ui-row" style="justify-content:center"><button class="ui-btn primary" data-go>Pay ${$(PLAY.whack)} &amp; play</button></div>`;
        const btns = [...api.body.querySelectorAll('[data-h]')], go = api.body.querySelector('[data-go]'), lbl = api.body.querySelector('[data-s]');
        const draw = () => btns.forEach((b, i) => { const h = holes[i]; b.textContent = h.kind === 'rat' ? '🐀' : h.kind === 'clown' ? '🤡' : h.kind === 'gold' ? '💰' : '·'; });
        api.timer(() => {
          if (!running) return;
          const dt = 0.05;
          t += dt;
          for (const h of holes) if (h.kind && (h.ttl -= dt) <= 0) { if (h.kind === 'rat') misses++; h.kind = null; }
          const rate = 0.12 + t * 0.012;
          if (Math.random() < rate) {
            const free = holes.filter((h) => !h.kind);
            if (free.length) { const h = pick(free); h.kind = chance(0.14) ? 'clown' : chance(0.04) ? 'gold' : 'rat'; h.ttl = Math.max(0.45, 1.1 - t * 0.025); }
          }
          draw();
          lbl.textContent = `Hits ${hits} · Time ${Math.max(0, 20 - t).toFixed(1)}`;
          if (t >= 20) {
            running = false;
            for (const h of holes) h.kind = null; draw();
            const tix = Math.max(0, hits * 2 - misses);
            addTickets(tix, 'Whack-a-Rat');
            api.status(`${hits} rats bonked, ${misses} escaped. <b>${tix}</b> tickets. ${hits > 25 ? 'The rats have put a bounty on you.' : 'The rats are unimpressed.'}`, hits > 15 ? 'good' : '');
            go.textContent = `Pay ${$(PLAY.whack)} & play again`; go.disabled = false;
            game.time.advance(10); api.cash();
          }
        }, 50);
        btns.forEach((b, i) => b.addEventListener('mousedown', () => {
          if (!running) return;
          const h = holes[i];
          if (h.kind === 'rat') { hits++; beep(game, 880, 0.06); h.kind = null; }
          else if (h.kind === 'gold') { hits += 5; beep(game, 1320, 0.15, 'triangle'); h.kind = null; }
          else if (h.kind === 'clown') { hits = Math.max(0, hits - 5); beep(game, 140, 0.3, 'sawtooth'); api.status('You bonked the clown. It honks. It remembers. -5', 'bad'); h.kind = null; }
          else { beep(game, 200, 0.04); }
          draw();
        }));
        go.addEventListener('click', () => {
          if (running) return;
          if (!st.spend(PLAY.whack, 'arcade')) return;
          running = true; t = 0; hits = 0; misses = 0; go.disabled = true; api.status(''); api.cash();
        });
      },
    });
  }

  // ---------------------------------------------------------------- claw machine (rigged; Mr. Giggles knows the trick)
  const CLAW_PRIZES = [
    { id: 'prize_spider', label: 'rubber spider', w: 5 },
    { id: 'prize_rat', label: 'stuffed rat', w: 3 },
    { id: 'teddy', label: 'creepy teddy bear', w: 2 },
    { id: 'prize_nose', label: 'clown nose', w: 3 },
    { id: 'prize_lavalamp', label: 'toxic lava lamp', w: 1 },
  ];
  function claw() {
    return gamePanel(game, {
      title: 'The Claw', width: 520,
      extra: () => `Tickets ${isle(game).tickets}`,
      build(api) {
        let pos = 0, dir = 1, armed = false, swings = 0, lastEdge = 0;
        const target = 0.2 + Math.random() * 0.6;
        api.body.innerHTML = `<div class="sys-intro">A glass box full of plush horrors. The claw grip is "adjustable". It is adjusted to "lol".</div>
          <div class="sys-track" style="height:40px"><div class="zone" style="left:${(target - 0.05) * 100}%;width:10%"></div><div class="needle"></div></div>
          <div class="ui-row" style="justify-content:center;margin-top:8px"><button class="ui-btn primary" data-go>Pay ${$(PLAY.claw)} &amp; start</button></div>`;
        const needle = api.body.querySelector('.needle'), go = api.body.querySelector('[data-go]');
        api.timer(() => {
          if (!armed) return;
          pos += dir * 0.012;
          if (pos > 1 || pos < 0) { dir = -dir; pos = Math.max(0, Math.min(1, pos)); if (Date.now() - lastEdge > 100) { swings++; lastEdge = Date.now(); } }
          needle.style.left = `calc(${pos * 100}% - 2px)`;
        }, 16);
        go.addEventListener('click', () => {
          if (!armed) {
            if (!st.spend(PLAY.claw, 'arcade')) return;
            armed = true; swings = 0; go.textContent = 'DROP!'; api.status(''); api.cash(); return;
          }
          armed = false;
          go.textContent = `Pay ${$(PLAY.claw)} & try again`;
          const aligned = Math.abs(pos - target) < 0.05;
          const knowsTrick = !!game.state.getFlag('isle_claw_trick');
          const grip = knowsTrick && swings === 2 ? 0.85 : 0.22;
          beep(game, 500, 0.4, 'triangle', 0.08);
          game.time.advance(5);
          if (!aligned) { api.status(pick(['The claw grabs air. It gently strokes a teddy bear\'s head, then leaves. Rude.', 'Miss. The claw opens before it even touches anything. That\'s not physics, that\'s fraud.']), 'bad'); return; }
          if (!chance(grip)) { api.status(pick(['You had it! The claw lifts it, shivers, and drops it like a bad habit.', 'So close. The prize bounces off the chute and lands exactly where it started. Mocking you.']), 'bad'); return; }
          const tot = CLAW_PRIZES.reduce((a, b) => a + b.w, 0);
          let r = Math.random() * tot, pr = CLAW_PRIZES[0];
          for (const c of CLAW_PRIZES) if ((r -= c.w) <= 0) { pr = c; break; }
          st.addItem(pr.id, 1);
          sfx(game, 'win');
          api.status(`<b>WINNER!</b> You got a ${pr.label}! It stares at you. You stare back. You both lose.${knowsTrick ? ' (Third swing. Mr. Giggles was right.)' : ''}`, 'good');
        });
      },
    });
  }

  // ---------------------------------------------------------------- prize counter
  function prizeCounter() {
    return shopPanel(game, {
      title: 'Funland Prize Counter', speaker: 'Dottie (Prize Counter)', width: 760,
      intro: () => `Dottie has worked here since before the Incident. She never left. Possibly can't. "Tickets only, hon. We don't take cash, cards, or excuses." <b>You have ${isle(game).tickets} tickets.</b>`,
      sections: () => [{
        name: 'Prizes',
        products: PRIZES.map((pz) => {
          const d = game.items?.def?.(pz.id);
          const s = isle(game);
          return {
            name: d?.name ?? pz.id, desc: d?.desc ?? '', priceLabel: `${pz.tickets} tix`, btn: 'Redeem',
            disabled: s.tickets < pz.tickets,
            buy: () => {
              const s2 = isle(game);
              if (s2.tickets < pz.tickets) return false;
              s2.tickets -= pz.tickets;
              s2.prizes[pz.id] = (s2.prizes[pz.id] || 0) + 1;
              st.addItem(pz.id, 1);
              sfx(game, 'coin');
              game.ui.toast(`Dottie slides you a ${d?.name ?? pz.id}. Her hand is cold. Very cold.`, 'good', 2400);
              game.bus.emit('island:prize', { id: pz.id });
              return true;
            },
          };
        }),
      }],
      footer: 'Tickets never expire. Neither does Dottie.',
    });
  }

  game.locations.register('isle_arcade', (g, loc) => placeMenu(g, loc, {
    hours: [10, 3],
    speaker: 'Funland Arcade',
    closed: () => 'The arcade is dark. Through the window you can see one machine still on, playing its attract tune to nobody. It sounds like it\'s crying.',
    text: () => `${pick([
      'The carpet is the kind with cosmic patterns designed to hide stains. It is losing. Machines blink and burble. A sign reads: "PLEASE DO NOT FEED THE CHANGE MACHINE. IT BITES."',
      'Half the cabinets are dead. The other half are possessed. A Skee-Ball lane is sticky in a way you refuse to think about.',
      'Somewhere a pinball machine plays "Pop Goes the Weasel" in a minor key. Dottie waves from the prize counter without blinking.',
    ])}<br><span class="sys-hint">Tickets: <b>${isle(g).tickets}</b></span>`,
    options: () => [
      { label: 'Skee-Ball', hint: `${$(PLAY.skee)} · timing`, run: () => skeeBall() },
      { label: 'Whack-a-Rat', hint: `${$(PLAY.whack)} · reflexes`, run: () => whackARat() },
      { label: 'The Claw', hint: `${$(PLAY.claw)} · rigged`, run: () => claw() },
      { label: 'Prize counter', hint: `${isle(g).tickets} tickets`, run: () => prizeCounter() },
      { label: 'Ask Dottie about Funland', run: () => say(g, 'Prize Counter', pick([
        '"Funland was BEAUTIFUL, hon. Cotton candy, bumper cars, Mr. Giggles doing balloon animals. Then the fog came in and... well. We don\'t talk about the fog."',
        '"The Ferris wheel? Still turns. Nobody pays the power bill. Nobody\'s ON it. Don\'t look at it too long."',
        '"I\'ve been saving up for the Golden Ticket myself. Eleven years. I\'m at 9,998. Somebody keeps winning the last one."',
      ]), 'Dottie') },
    ],
  }));

  return { addTickets, skeeBall, whackARat, claw, prizeCounter };
}
