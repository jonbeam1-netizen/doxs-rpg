// The Golden Tooth Casino: blackjack, slots, roulette, high-low. Table limits by room,
// and security throws you out if you win too much in one day.
// state.p.sys.casino = { day, net, bannedDay }
import { fmtMoney, pick, chance, randInt } from '../core/util.js';
import { netWorth, ensureState, today } from './common.js';
import { placeMenu, say, choose, gamePanel, betInput } from './ui-kit.js';

const ROOMS = {
  floor: { name: 'Main Floor', min: 5, max: 200, limit: 4000 },
  vip: { name: 'VIP Lounge', min: 50, max: 2500, limit: 40000 },
  high: { name: 'High Roller Suite', min: 500, max: 25000, limit: 400000 },
};
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SLOT_SYMS = [['💩', 6], ['🍋', 5], ['🍒', 4], ['💀', 4], ['🔔', 3], ['7️⃣', 2], ['🦷', 1]];
const SLOT_PAY = { '🦷': 250, '7️⃣': 80, '🔔': 30, '🍒': 15, '🍋': 10, '💀': 8, '💩': 5 };

export function installCasino(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);
  let room = 'floor';

  function cs() {
    const c = st.p.sys.casino;
    if (c.day !== game.time.day) { c.day = game.time.day; c.net = 0; }
    return c;
  }
  const lucky = () => game.sysFx.has('lucky');
  const cursed = () => game.sysFx.has('cursed');

  // Book a result. Returns false if security kicks you out.
  function result(gameName, amount, api) {
    const c = cs();
    c.net += amount;
    // Lucky Rabbit's Foot perk: bonus on the net profit (never on the returned stake).
    const gm = game.perks?.mult?.('gambling') ?? 1;
    if (amount > 0 && gm > 1) {
      const bonus = Math.round(amount * (gm - 1));
      if (bonus > 0) { st.addMoney(bonus, 'casino bonus'); c.net += bonus; }
    }
    game.bus.emit('casino:result', { game: gameName, amount });
    if (amount > 0) sfx(amount >= ROOMS[room].max * 10 ? 'jackpot' : 'win');
    else if (amount < 0) sfx('lose');
    if (c.net > ROOMS[room].limit) {
      c.bannedDay = game.time.day;
      setTimeout(() => {
        api?.close?.();
        game.ui.closeAll();
        game.ui.dialog({
          title: 'Security!', speaker: 'Big Tony & Bigger Tony',
          html: `Two enormous men in matching suits lift you by the armpits. "Mr. Molars says you\'re <em>too lucky</em>. Luck like that is bad for business. Come back tomorrow. Or don\'t. Preferably don\'t."<br><br>They toss you onto the sidewalk. You keep your winnings. You lose a shoe.`,
        });
      }, 900);
      return false;
    }
    return true;
  }

  function canBet(bet) {
    if (st.p.money < bet) { game.ui.toast('You can\'t cover that bet. The dealer smirks.', 'bad'); return false; }
    return true;
  }

  const roomLine = () => `${ROOMS[room].name} · limits ${fmtMoney(ROOMS[room].min)}–${fmtMoney(ROOMS[room].max)}`;

  // ================= BLACKJACK =================
  let shoe = [];
  function draw() {
    if (shoe.length < 52) {
      shoe = [];
      for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
      for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
    }
    return shoe.pop();
  }
  function handValue(h) {
    let v = 0, aces = 0;
    for (const c of h) { if (c.r === 'A') { aces++; v += 11; } else v += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); }
    while (v > 21 && aces) { v -= 10; aces--; }
    return { v, soft: aces > 0 };
  }
  const cardHtml = (c, hidden) => hidden ? '<div class="sys-card back"></div>'
    : `<div class="sys-card ${c.s === '♥' || c.s === '♦' ? 'red' : ''}"><span>${c.r}${c.s}</span><span class="s2">${c.r}${c.s}</span></div>`;

  function blackjack() {
    const R = ROOMS[room];
    return gamePanel(game, {
      title: 'Blackjack', width: 620, extra: roomLine,
      build(api) {
        const bi = betInput(R.min, R.max, Math.min(R.max, Math.max(R.min, 25)));
        api.body.innerHTML = `<div class="sys-felt">
            <div class="lbl">Dealer: Dolores (chews gum, hates you) <span class="dv"></span></div><div class="sys-cards dealer"></div>
            <div class="lbl" style="margin-top:8px">You <span class="pv"></span></div><div class="sys-cards player"></div></div>
          <div class="ui-row" style="margin-top:10px">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px"><button class="ui-btn primary" data-a="deal">Deal</button><button class="ui-btn" data-a="hit">Hit</button><button class="ui-btn" data-a="stand">Stand</button><button class="ui-btn" data-a="double">Double</button></div>
          <div class="sys-hint" style="margin-top:6px">Blackjack pays 3:2. Dealer stands on all 17s. No splitting — Dolores doesn't believe in it.</div>`;
        const getBet = bi.wire(api.body, game);
        let player = [], dealer = [], bet = 0, live = false;
        const q = (s) => api.body.querySelector(s);
        const render = (reveal) => {
          q('.dealer').innerHTML = dealer.map((c, i) => cardHtml(c, i === 1 && !reveal)).join('');
          q('.player').innerHTML = player.map((c) => cardHtml(c)).join('');
          q('.pv').textContent = player.length ? `(${handValue(player).v})` : '';
          q('.dv').textContent = dealer.length && reveal ? `(${handValue(dealer).v})` : '';
          q('[data-a=deal]').disabled = live;
          q('[data-a=hit]').disabled = !live;
          q('[data-a=stand]').disabled = !live;
          q('[data-a=double]').disabled = !live || player.length !== 2 || st.p.money < bet;
          api.cash();
        };
        const finish = (msg, payout) => {
          live = false;
          render(true);
          if (payout > 0) st.addMoney(payout, 'casino');
          const net = payout - bet;
          api.status(`${msg} ${net > 0 ? `<b>+${fmtMoney(net)}</b>` : net < 0 ? `<b>-${fmtMoney(-net)}</b>` : '(push)'}`, net > 0 ? 'good' : net < 0 ? 'bad' : '');
          result('blackjack', net, api);
          api.cash();
        };
        const dealerPlay = () => {
          let d = handValue(dealer);
          while (d.v < 17) { dealer.push(draw()); d = handValue(dealer); }
          const pv = handValue(player).v;
          if (d.v > 21) finish(pick(['Dolores busts! She pops her gum angrily.', 'Dealer busts. Dolores mutters a word your mom wouldn\'t like.']), bet * 2);
          else if (d.v > pv) finish(pick(['Dealer wins. Dolores doesn\'t even look up.', `Dolores has ${d.v}. You lose. She blows a bubble at you.`]), 0);
          else if (d.v < pv) finish(pick(['You win! Dolores slides your chips over like they\'re radioactive.', 'Winner! A cocktail waitress gives you a thumbs up.']), bet * 2);
          else finish('Push. Nobody wins. Like most of life.', bet);
        };
        api.body.addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          if (a === 'deal') {
            if (game.time.day === cs().bannedDay) return api.close();
            bet = getBet();
            if (!canBet(bet)) return;
            st.addMoney(-bet, 'casino');
            player = [draw(), draw()]; dealer = [draw(), draw()];
            sfx('card');
            live = true;
            api.status('');
            const pv = handValue(player).v, dv = handValue(dealer).v;
            if (pv === 21 || dv === 21) {
              if (pv === 21 && dv === 21) return finish('Both blackjack. Push.', bet);
              if (pv === 21) return finish('<b>BLACKJACK!</b> Dolores swallows her gum.', Math.floor(bet * 2.5));
              return finish('Dealer blackjack. Dolores smiles for the first time in 11 years.', 0);
            }
            render(false);
          } else if (a === 'hit' && live) {
            player.push(draw());
            sfx('card');
            const v = handValue(player).v;
            if (v > 21) return finish(pick(['Bust! You went over. Like your credit limit.', 'Busted. Dolores collects your chips with a little too much joy.']), 0);
            if (v === 21) { render(true); return dealerPlay(); }
            render(false);
          } else if (a === 'stand' && live) {
            dealerPlay();
          } else if (a === 'double' && live && player.length === 2 && canBet(bet)) {
            st.addMoney(-bet, 'casino');
            bet *= 2;
            player.push(draw());
            sfx('card');
            if (handValue(player).v > 21) return finish('Doubled down and busted. Bold. Dumb. Bold-dumb.', 0);
            dealerPlay();
          }
        });
        render(false);
      },
    });
  }

  // ================= SLOTS =================
  function spinSym() {
    const tot = SLOT_SYMS.reduce((a, s) => a + s[1], 0);
    let r = Math.random() * tot;
    for (const [s, w] of SLOT_SYMS) if ((r -= w) <= 0) return s;
    return SLOT_SYMS[0][0];
  }
  function slotPay(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) return SLOT_PAY[a];
    const ch = reels.filter((x) => x === '🍒').length;
    return ch === 2 ? 4 : ch === 1 ? 1 : 0;
  }

  function slots() {
    const R = ROOMS[room];
    const machine = room === 'floor' ? 'The Molar Machine' : room === 'vip' ? 'Golden Gums Deluxe' : 'The Root Canal';
    return gamePanel(game, {
      title: `Slots — ${machine}`, width: 520, extra: roomLine,
      build(api) {
        const bi = betInput(R.min, R.max, R.min);
        api.body.innerHTML = `<div class="sys-reels"><div class="sys-reel"><span>🦷</span></div><div class="sys-reel"><span>🦷</span></div><div class="sys-reel"><span>🦷</span></div></div>
          <div class="sys-paytable">🦷🦷🦷 ×250 · 7️⃣7️⃣7️⃣ ×80 · 🔔🔔🔔 ×30 · 🍒🍒🍒 ×15 · 🍋🍋🍋 ×10 · 💀💀💀 ×8 · 💩💩💩 ×5 · 🍒🍒 ×4 · 🍒 ×1</div>
          <div class="ui-row" style="margin-top:10px">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px"><button class="ui-btn primary" data-spin style="font-size:22px;padding:8px 30px">PULL THE LEVER</button><label class="sys-hint"><input type="checkbox" data-auto> auto-spin</label></div>`;
        const getBet = bi.wire(api.body, game);
        const reels = [...api.body.querySelectorAll('.sys-reel')];
        let spinning = false;
        const spin = () => {
          if (spinning || api.closed) return;
          if (game.time.day === cs().bannedDay) return api.close();
          const bet = getBet();
          if (!canBet(bet)) { api.body.querySelector('[data-auto]').checked = false; return; }
          st.addMoney(-bet, 'casino');
          api.cash();
          spinning = true;
          let res = [spinSym(), spinSym(), spinSym()];
          if (slotPay(res) === 0 && lucky() && chance(0.15)) res = [spinSym(), spinSym(), spinSym()];
          if (slotPay(res) > 0 && cursed() && chance(0.2)) res = ['💩', '💀', '🍋'];
          reels.forEach((r) => r.classList.add('spin'));
          const tick = api.timer(() => reels.forEach((r) => { if (r.classList.contains('spin')) r.firstChild.textContent = spinSym(); }), 70);
          res.forEach((sym, i) => api.timeout(() => {
            reels[i].classList.remove('spin');
            reels[i].firstChild.textContent = sym;
            sfx('reel');
            if (i === 2) {
              clearInterval(tick);
              spinning = false;
              const mult = slotPay(res);
              const win = Math.floor(bet * mult);
              if (win > 0) st.addMoney(win, 'casino');
              const net = win - bet;
              api.status(mult >= 30 ? `<b>JACKPOT! ×${mult} — ${fmtMoney(win)}!</b> Lights flash. A grandma faints. Two more grandmas take her machine.`
                : mult >= 5 ? `Winner! ×${mult} — ${fmtMoney(win)}`
                  : mult === 4 ? `Two cherries! ${fmtMoney(win)}` : mult === 1 ? 'One cherry. Your money back. The machine pities you.'
                    : pick(['Nothing.', 'Nada.', 'The machine burps.', 'So close! (Not close.)', 'A man next to you shakes his head sadly.']), net > 0 ? 'good' : net < 0 ? 'bad' : '');
              const ok = result('slots', net, api);
              api.cash();
              if (ok && api.body.querySelector('[data-auto]')?.checked) api.timeout(spin, 650);
            }
          }, 700 + i * 380));
        };
        api.body.querySelector('[data-spin]').addEventListener('click', spin);
      },
    });
  }

  // ================= ROULETTE =================
  function roulette() {
    const R = ROOMS[room];
    return gamePanel(game, {
      title: 'Roulette', width: 600, extra: roomLine,
      build(api) {
        const bi = betInput(R.min, R.max, R.min);
        const bets = [['red', 'Red', 1], ['black', 'Black', 1], ['odd', 'Odd', 1], ['even', 'Even', 1], ['low', '1–18', 1], ['high', '19–36', 1], ['d1', '1st 12', 2], ['d2', '2nd 12', 2], ['d3', '3rd 12', 2], ['num', 'Single #', 35]];
        api.body.innerHTML = `<div class="sys-wheel"><span>?</span></div>
          <div class="sys-chips">${bets.map(([k, l, m]) => `<button class="ui-btn ${k === 'red' ? 'sel' : ''}" data-b="${k}">${l} <small>${m}:1</small></button>`).join('')}</div>
          <div class="ui-row" style="margin-top:8px;justify-content:center"><span>Number:</span><input type="number" min="0" max="36" value="17" class="sys-num" style="width:70px;padding:4px;background:#0f0d0b;color:var(--bone);border:1px solid var(--panel-edge);font-size:18px"></div>
          <div class="ui-row" style="margin-top:10px">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px;justify-content:center"><button class="ui-btn primary" data-spin style="font-size:20px;padding:6px 30px">SPIN</button></div>
          <div class="sys-hint" style="text-align:center">Croupier Jacques has a fake French accent and a real gambling problem.</div>`;
        const getBet = bi.wire(api.body, game);
        const numIn = api.body.querySelector('.sys-num');
        numIn.addEventListener('keydown', (e) => e.stopPropagation());
        let sel = 'red', spinning = false;
        api.body.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => {
          sel = b.dataset.b;
          api.body.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('sel', x === b));
        }));
        const wins = (n, k, pickN) => {
          if (k === 'num') return n === pickN;
          if (n === 0) return false;
          return { red: REDS.has(n), black: !REDS.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19, d1: n <= 12, d2: n > 12 && n <= 24, d3: n > 24 }[k];
        };
        api.body.querySelector('[data-spin]').addEventListener('click', () => {
          if (spinning) return;
          if (game.time.day === cs().bannedDay) return api.close();
          const bet = getBet();
          if (!canBet(bet)) return;
          const pickN = Math.max(0, Math.min(36, Math.floor(Number(numIn.value) || 0)));
          st.addMoney(-bet, 'casino');
          api.cash();
          spinning = true;
          let n = randInt(0, 36);
          if (!wins(n, sel, pickN) && lucky() && chance(0.08)) n = randInt(0, 36);
          const wheel = api.body.querySelector('.sys-wheel');
          const label = wheel.firstElementChild;
          wheel.classList.add('spin');
          api.status('"Rien ne va plus! No more bets! Zat means no more bets!"');
          const tick = api.timer(() => { label.textContent = randInt(0, 36); sfx('tick'); }, 80);
          api.timeout(() => {
            clearInterval(tick);
            wheel.classList.remove('spin');
            label.textContent = n;
            label.style.color = n === 0 ? '#5fd35f' : REDS.has(n) ? '#ff6655' : '#fff';
            spinning = false;
            const mult = { num: 35, d1: 2, d2: 2, d3: 2 }[sel] ?? 1;
            const won = wins(n, sel, pickN);
            const pay = won ? bet * (mult + 1) : 0;
            if (pay) st.addMoney(pay, 'casino');
            const col = n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
            api.status(won ? `${n} ${col}! You win <b>${fmtMoney(pay - bet)}</b>. Jacques: "Magnifique. I mean it. I am broke."` : `${n} ${col}. ${n === 0 ? 'Zero! The house eats.' : pick(['Jacques shrugs: "C\'est la vie. Mostly la mort."', 'You lose. Jacques rakes your chips with a tiny broom.'])}`, won ? 'good' : 'bad');
            result('roulette', pay - bet, api);
            api.cash();
          }, 2000);
        });
      },
    });
  }

  // ================= HIGH-LOW =================
  function highLow() {
    const R = ROOMS[room];
    return gamePanel(game, {
      title: 'High-Low', width: 520, extra: roomLine,
      build(api) {
        const bi = betInput(R.min, R.max, R.min);
        api.body.innerHTML = `<div class="sys-felt" style="text-align:center"><div class="lbl">Current card</div><div class="sys-cards cur" style="justify-content:center"></div>
          <div class="sys-big pot" style="margin-top:6px"></div></div>
          <div class="ui-row" style="margin-top:10px">${bi.html}</div>
          <div class="ui-row" style="margin-top:8px"><button class="ui-btn primary" data-a="start">Ante up</button><button class="ui-btn" data-a="hi">Higher ▲</button><button class="ui-btn" data-a="lo">Lower ▼</button><button class="ui-btn" data-a="cash">Cash out</button></div>
          <div class="sys-hint" style="margin-top:6px">Guess whether the next card is higher or lower. Ties lose. Payout depends on the odds. Ride the streak or cash out. Aces are low.</div>`;
        const getBet = bi.wire(api.body, game);
        let cur = null, pot = 0, live = false, streak = 0;
        const val = (c) => RANKS.indexOf(c.r) + 1;
        const q = (s) => api.body.querySelector(s);
        const render = () => {
          q('.cur').innerHTML = cur ? cardHtml(cur) : '<div class="sys-card back"></div>';
          q('.pot').innerHTML = live ? `Pot: ${fmtMoney(pot)} <span class="sys-hint">streak ${streak}</span>` : '';
          q('[data-a=start]').disabled = live;
          for (const a of ['hi', 'lo']) q(`[data-a=${a}]`).disabled = !live;
          q('[data-a=cash]').disabled = !live || streak === 0;
          if (live && cur) {
            const v = val(cur);
            const pHi = (13 - v) / 13, pLo = (v - 1) / 13;
            q('[data-a=hi]').textContent = `Higher ▲ ×${pHi > 0 ? (0.95 / pHi).toFixed(2) : '—'}`;
            q('[data-a=lo]').textContent = `Lower ▼ ×${pLo > 0 ? (0.95 / pLo).toFixed(2) : '—'}`;
            if (pHi <= 0) q('[data-a=hi]').disabled = true;
            if (pLo <= 0) q('[data-a=lo]').disabled = true;
          }
          api.cash();
        };
        api.body.addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          if (a === 'start') {
            if (game.time.day === cs().bannedDay) return api.close();
            const bet = getBet();
            if (!canBet(bet)) return;
            st.addMoney(-bet, 'casino');
            pot = bet; live = true; streak = 0; cur = draw();
            api.bet = bet;
            sfx('card');
            api.status('');
          } else if ((a === 'hi' || a === 'lo') && live) {
            const v = val(cur);
            const p = a === 'hi' ? (13 - v) / 13 : (v - 1) / 13;
            const next = draw();
            const nv = val(next);
            sfx('card');
            cur = next;
            if ((a === 'hi' && nv > v) || (a === 'lo' && nv < v)) {
              pot = Math.floor(pot * (0.95 / p));
              streak++;
              api.status(pick(['Correct!', 'Nailed it!', 'The crowd murmurs.', 'Your palms are sweating. Keep going?']), 'good');
            } else {
              live = false;
              api.status(`${next.r}${next.s}. Wrong! The pot evaporates like your dignity.`, 'bad');
              result('highlow', -api.bet, api);
            }
          } else if (a === 'cash' && live) {
            live = false;
            st.addMoney(pot, 'casino');
            api.status(`Cashed out <b>${fmtMoney(pot)}</b>.`, 'good');
            result('highlow', pot - api.bet, api);
          }
          render();
        });
        render();
      },
    });
  }

  // ================= the casino itself =================
  game.locations.register('casino', (g, loc) => {
    ensureState(st.p);
    if (cs().bannedDay === g.time.day) {
      return say(g, loc.name, 'Big Tony blocks the door with his entire body. "Mr. Molars said tomorrow. Is it tomorrow? No. It is today. Goodbye."', 'Big Tony');
    }
    return placeMenu(g, loc, {
      hours: null,
      speaker: 'Vinnie "The Molar" Molars',
      text: () => {
        const p = st.p;
        const c = cs();
        return `${pick([
          'The Golden Tooth: a casino shaped like a giant gold tooth. Inside, it smells like cigarettes, desperation, and carpet shampoo. No clocks. No windows. No hope.',
          'Slot machines scream. A woman in a fur coat is feeding quarters into a machine with one hand and a cigarette with the other. She hasn\'t blinked in hours.',
          'Vinnie Molars, the Contessa\'s floor manager, smiles at you with 32 gold teeth. "Welcome, welcome! Lose responsibly! Or irresponsibly! We\'re not picky!"',
        ])}<br><br><span class="sys-hint">Room: <b>${ROOMS[room].name}</b> (${fmtMoney(ROOMS[room].min)}–${fmtMoney(ROOMS[room].max)} bets). Today's net: <span class="${c.net >= 0 ? 'ui-good' : 'ui-bad'}">${c.net >= 0 ? '+' : ''}${fmtMoney(c.net)}</span>.${p.sys.casino.net > ROOMS[room].limit * 0.7 ? ' <b class="ui-bad">Security is watching you.</b>' : ''}</span>`;
      },
      options: () => {
        const p = st.p;
        const vipOk = p.cha >= 35 || p.level >= 8;
        const hrOk = netWorth(p) >= 100000;
        const out = [
          { label: 'Blackjack', hint: 'hit, stand, double', run: blackjack },
          { label: 'Slots', hint: 'pull the lever, Kronk', run: slots },
          { label: 'Roulette', hint: 'red, black, or rent money', run: roulette },
          { label: 'High-Low', hint: 'streaks & cash-outs', run: highLow },
          { label: 'Change rooms', hint: ROOMS[room].name, run: async () => {
            const r = await choose(g, {
              title: 'Rooms', text: 'Where do you want to lose money?',
              choices: [
                { label: `Main Floor (${fmtMoney(5)}–${fmtMoney(200)})`, value: 'floor' },
                { label: `VIP Lounge (${fmtMoney(50)}–${fmtMoney(2500)})`, hint: vipOk ? '' : 'needs CHA 35 or level 8', disabled: !vipOk, value: 'vip' },
                { label: `High Roller Suite (${fmtMoney(500)}–${fmtMoney(25000)})`, hint: hrOk ? '' : 'needs $100k net worth', disabled: !hrOk, value: 'high' },
              ],
            });
            if (r) room = r;
          } },
          { label: 'Free cocktail', hint: 'comped (they want you drunk)', run: () => {
            const td = today(g);
            td.casinoDrinks = (td.casinoDrinks || 0) + 1;
            if (td.casinoDrinks > 3) return say(g, 'Cocktail Waitress', '"Honey, you\'ve had three. The free ones are for people who are still LOSING money." She looks at your chips. "...Fine."');
            sfx('gulp');
            g.sysFx.addDrunk(1.5);
            return say(g, 'Cocktail Waitress', pick(['A "Golden Margarita". It\'s yellow. It\'s mostly tequila. You feel lucky. You are not.', 'A watered-down whiskey in a tiny glass shaped like a tooth. Classy.']));
          } },
        ];
        const div = g.sysDating?.option?.('divina', loc);
        if (div) out.push(div);
        return out;
      },
    });
  });

  return { blackjack, slots, roulette, highLow, ROOMS };
}
