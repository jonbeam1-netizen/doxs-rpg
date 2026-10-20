// Job-shift minigames. Each one is ~30-45s; score 0..1 -> grade -> pay multiplier (see ../minigame.js).
//   dishwash  (Greasy Spoon dishwasher)   scrub on the beat
//   linecook  (Greasy Spoon line cook+)   build burgers off tickets, flip patties on time
//   conveyor  (Meat & Rendering)          grab the good cuts, toss the gross stuff
//   email     (Grimco)                    inbox triage: reply / delete / forward to HR
//   mixdrink  (Rusty Nail bartender)      mix the crude order from the recipe book
//   lineup    (Rotwell PD)                pick the suspect matching the witness statement
//   idcheck   (Club Velvet bouncer)       approve / deny IDs by Vince's rules
//   scrapsort (Scrapper Pete's)           sort scrap into copper / steel / trash / Mr. Chompers
//   gutfish   (The Rusty Hook)            cut on the marks, never the bile sac
import { clamp, pick, chance, randInt, rand } from '../../core/util.js';
import { shuffle, DIGITS, digitIndex } from '../minigame.js';

const L = 'ArrowLeft', R = 'ArrowRight', U = 'ArrowUp', D = 'ArrowDown', SP = 'Space', EN = 'Enter';
const isAct = (c) => c === SP || c === EN;
const COLORS = { red: '#c0392b', blue: '#2e5fa8', green: '#3c8a3a', yellow: '#d6b33c', purple: '#7a3fa0' };
const HAIR = { black: '#1b1714', blond: '#e0c04a', red: '#b5482a', gray: '#9a9a9a' };

export function registerWorkGames(mg) {
  // ======================================================================= DISHWASH
  mg.register('dishwash', {
    name: 'The Dish Pit',
    how: 'The sponge swings back and forth. Hit <kbd>←</kbd> when it reaches the <b>left</b>, <kbd>→</kbd> when it reaches the <b>right</b> (or <kbd>A</kbd>/<kbd>D</kbd>, or tap the big buttons). On the beat = squeaky clean. Mashing = splashing dishwater in your own mouth. 30 seconds. Clean 9 plates for full marks.',
    lines: {
      S: ['Marge holds a plate up to the light. She can see her own regrets in it. Perfect.'],
      F: ['The plates are dirtier than when they came in. You have invented anti-washing.'],
    },
    create(api) {
      const T = 30, beat = 0.5 - 0.1 * api.diff, target = 9;
      const PLATES = ['a plate', 'a crusty skillet', 'a mug with a face in it', 'a gravy boat (shipwrecked)', 'a plate of fossilized egg', 'Marge\'s personal fork', 'a bowl that smells like feet', 'a pan with a hair situation'];
      let t = 0, plates = 0, last = -9, grime = 0, max = 1, perfect = 0, name = '';
      api.stage.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="position:relative;width:92%;height:26px;background:#14110e;border:2px solid #3b342b;border-radius:13px">
          <div data-l style="position:absolute;left:0;top:0;bottom:0;width:18%;border-radius:11px;background:rgba(127,191,77,.25)"></div>
          <div data-r style="position:absolute;right:0;top:0;bottom:0;width:18%;border-radius:11px;background:rgba(127,191,77,.25)"></div>
          <div data-sp style="position:absolute;top:-6px;width:34px;height:34px;margin-left:-17px;font-size:28px;line-height:34px;text-align:center">🧽</div></div>
        <div data-pl style="font-size:84px;line-height:1;position:relative">🍽️<div data-gr style="position:absolute;inset:0;font-size:30px;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:2px"></div></div>
        <div data-nm class="sys-hint"></div>
        <div style="width:60%"><div class="mg-time" style="height:8px"><i data-gm style="width:100%;background:#7a5a2a"></i></div></div></div>`;
      api.pad([{ k: L, label: '◀ SCRUB', sub: '← / A' }, { k: R, label: 'SCRUB ▶', sub: '→ / D' }]);
      const sp = api.stage.querySelector('[data-sp]'), gr = api.stage.querySelector('[data-gr]'), gm = api.stage.querySelector('[data-gm]'), nm = api.stage.querySelector('[data-nm]');
      const newPlate = () => { max = grime = 5 + randInt(0, 2) + Math.round(api.diff * 2); name = pick(PLATES); nm.textContent = `Now scrubbing: ${name}`; draw(); };
      const draw = () => { gr.textContent = '🟤'.repeat(Math.ceil(grime)); gm.style.width = `${(grime / max) * 100}%`; };
      const sc = () => api.score(`🍽️ ${plates}/${target}`);
      newPlate(); sc();
      const score = () => clamp((plates + (1 - grime / max) * 0.5) / target, 0, 1);
      return {
        partial: score,
        tick(dt) {
          t += dt;
          const ph = (t / beat) % 2; // 0 -> left, 1 -> right
          const x = ph < 1 ? ph : 2 - ph;
          sp.style.left = `${x * 100}%`;
          api.time(1 - t / T);
          if (t >= T) api.done(score(), { stats: `${plates} plates · ${perfect} perfect scrubs` });
        },
        key(code) {
          if (code !== L && code !== R) return false;
          if (t - last < beat * 0.7) { last = t; api.msg(pick(['Too fast! Dishwater in the mouth.', 'Splash! That\'s not scrubbing, that\'s a tantrum.', 'Slow down, you animal.']), 'bad', 700); api.sfx('whoosh'); return; }
          last = t;
          // when does the sponge reach this side? left at even beats, right at odd beats
          const want = code === L ? 0 : 1;
          const n = t / beat;
          let k = Math.round(n);
          if ((((k % 2) + 2) % 2) !== want) k = n > k ? k + 1 : k - 1;
          const err = Math.abs(n - k) * beat;
          const power = err < 0.08 ? 1 : err < 0.16 ? 0.55 : 0.15;
          if (power === 1) { perfect++; api.sfx('squeak'); } else api.sfx('scrub');
          if (power < 0.5) api.msg(pick(['Off beat. You\'re just smearing it.', 'Wrong side, genius.', 'You rub it like it owes you money. It doesn\'t help.']), 'bad', 600);
          grime -= power;
          if (grime <= 0) {
            plates++; api.sfx('hit');
            api.float('+1 CLEAN', api.stage.clientWidth / 2 - 40, 60, '#7fbf4d');
            if (plates === target) api.msg('Quota hit! Marge throws more plates at you anyway.', 'good');
            newPlate(); sc();
          } else draw();
        },
      };
    },
  });

  // ======================================================================= LINECOOK
  const ING = [
    { id: 'bun', e: '🍞', n: 'Bun' }, { id: 'patty', e: '🥩', n: 'Patty' }, { id: 'cheese', e: '🧀', n: 'Cheese' },
    { id: 'lettuce', e: '🥬', n: 'Lettuce' }, { id: 'onion', e: '🧅', n: 'Onion' }, { id: 'pickle', e: '🥒', n: 'Pickle' },
    { id: 'sauce', e: '🟤', n: 'Marge Sauce' },
  ];
  const BURGERS = ['The Heart Attack', 'The Trucker\'s Regret', 'Double Divorce', 'The Wet Napkin', 'Grandpa\'s Last Meal', 'The Sad Tuesday', 'The Cholesterol Bomb', 'The Morning After', 'The Hairnet Special'];
  mg.register('linecook', {
    name: 'The Flat Top',
    how: 'Tickets list a burger stack <b>top to bottom</b>. Press ingredients in order with <kbd>1</kbd>–<kbd>7</kbd> (or tap). When a patty hits the grill, press <kbd>Space</kbd> to <b>FLIP</b> it when the needle is in the golden zone. Raw = gross, burnt = grosser. Wrong ingredients make Marge yell. 40 seconds.',
    lines: { S: ['Marge wipes a single greasy tear. "That\'s a burger, baby."'], F: ['A customer sends back a burger. It was sent back by the burger itself.'] },
    create(api) {
      const T = 40, target = 8, ings = api.diff >= 0.5 ? ING : ING.slice(0, 6);
      const cookTime = 1.6 - api.diff * 0.45;
      const gold = [0.56, 0.8 - api.diff * 0.08];
      let t = 0, done = 0, total = 0, ticket = null, cooking = null, mistakes = 0;
      api.stage.innerHTML = `<div style="display:flex;gap:12px;align-items:stretch">
        <div class="mg-card" style="width:42%;min-height:170px"><div style="font-family:var(--font-title);font-size:15px;border-bottom:1px dashed #555;margin-bottom:4px">ORDER UP <span data-tn></span></div><div data-tk style="font-size:17px;line-height:1.35"></div></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end">
          <div data-st style="font-size:30px;line-height:.82;text-align:center;min-height:120px;display:flex;flex-direction:column;justify-content:flex-end"></div>
          <div style="font-size:12px;color:#777">— plate —</div>
          <div data-gr style="width:100%;visibility:hidden"><div class="mg-track" style="height:26px;margin:6px 0 0"><div class="z bad" style="left:0;width:${gold[0] * 100}%;background:rgba(200,120,120,.35)"></div><div class="z top" style="left:${gold[0] * 100}%;width:${(gold[1] - gold[0]) * 100}%"></div><div class="z bad" style="left:${gold[1] * 100}%;width:${(1 - gold[1]) * 100}%;background:rgba(40,20,10,.9)"></div><div class="ndl" data-nd></div></div><div class="sys-hint" style="text-align:center">🔥 SIZZLING — FLIP IT! (Space)</div></div>
        </div></div>`;
      api.pad([...ings.map((g, i) => ({ k: DIGITS[i], label: g.e, sub: `${i + 1} ${g.n}` })), { k: SP, label: 'FLIP', sub: 'Space', cls: 'gold' }]);
      const tk = api.stage.querySelector('[data-tk]'), stEl = api.stage.querySelector('[data-st]'), grill = api.stage.querySelector('[data-gr]'), nd = api.stage.querySelector('[data-nd]'), tn = api.stage.querySelector('[data-tn]');
      const newTicket = () => {
        const mid = [];
        const n = 2 + randInt(0, 1) + Math.round(api.diff * 2);
        mid.push('patty');
        if (api.diff > 0.4 && chance(0.5)) mid.push('patty');
        while (mid.length < n) mid.push(pick(ings.slice(2)).id);
        ticket = { name: pick(BURGERS), seq: ['bun', ...shuffle(mid), 'bun'], i: 0, q: [], miss: 0 };
        total++;
        tn.textContent = `#${total}`;
        drawTicket(); stEl.innerHTML = '';
      };
      const drawTicket = () => {
        // tickets read top-down (top bun first); we build bottom-up, so the display is reversed
        const seq = ticket.seq.slice().reverse();
        const idx = ticket.seq.length - 1 - ticket.i;
        tk.innerHTML = `<b>${ticket.name}</b><br>${seq.map((id, j) => { const g = ING.find((x) => x.id === id); return `<div style="${j === idx ? 'background:#ffd84a;font-weight:700' : j > idx ? 'opacity:.4;text-decoration:line-through' : ''}">${g.e} ${g.n}</div>`; }).join('')}<div style="font-size:12px;color:#555;margin-top:2px">build from the bottom up ↑</div>`;
      };
      const tScore = (tk2) => { const q = tk2.q.length ? tk2.q.reduce((a, b) => a + b, 0) / tk2.q.length : 1; return clamp(q * (1 - 0.2 * tk2.miss), 0.15, 1); };
      let sum = 0;
      const score = () => clamp((sum + (ticket ? (ticket.i / ticket.seq.length) * 0.5 : 0)) / target, 0, 1);
      const sc = () => api.score(`🍔 ${done}/${target}`);
      newTicket(); sc();
      const addLayer = (id, q = 1) => {
        const g = ING.find((x) => x.id === id);
        const d = document.createElement('div');
        d.textContent = g.e;
        if (id === 'patty') d.style.filter = q >= 0.95 ? 'sepia(.6) saturate(1.4)' : q > 0.45 ? 'saturate(.4) brightness(1.3)' : 'brightness(.35)';
        stEl.prepend(d);
        ticket.i++;
        if (ticket.i >= ticket.seq.length) {
          const s = tScore(ticket);
          sum += s; done++;
          api.sfx('hit');
          api.msg(s >= 0.9 ? pick(['ORDER UP! Chef\'s kiss. Marge\'s kiss is worse.', 'Beautiful. The trucker weeps.']) : s >= 0.6 ? 'Served. It\'s food. Legally.' : pick(['Served... the customer is praying over it.', 'It\'s technically a burger.']), s >= 0.6 ? 'good' : 'bad');
          sc();
          newTicket();
        } else drawTicket();
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          if (cooking) {
            cooking.x += dt / cookTime;
            nd.style.left = `${Math.min(1, cooking.x) * 100}%`;
            if (cooking.x >= 1.05) { cooking = null; grill.style.visibility = 'hidden'; ticket.q.push(0.15); api.msg('🔥 GREASE FIRE. You serve the charcoal anyway.', 'bad'); api.shake(); api.sfx('miss'); addLayer('patty', 0.15); }
          }
          if (t >= T) api.done(score(), { stats: `${done} burgers · ${mistakes} screw-ups` });
        },
        key(code) {
          if (code === SP || code === EN) {
            if (!cooking) return;
            const x = cooking.x;
            cooking = null; grill.style.visibility = 'hidden';
            const q = x >= gold[0] && x <= gold[1] ? 1 : x < gold[0] ? (x > gold[0] - 0.15 ? 0.6 : 0.3) : 0.4;
            ticket.q.push(q);
            api.sfx('flip');
            api.msg(q === 1 ? pick(['Golden brown. Texture like sun.', 'PERFECT FLIP.']) : x < gold[0] ? pick(['Still mooing.', 'Raw! That cow could still testify.']) : 'Burnt. "Cajun style," you tell yourself.', q === 1 ? 'gold' : 'bad', 800);
            addLayer('patty', q);
            return;
          }
          const i = digitIndex(code);
          if (i < 0 || i >= ings.length) return false;
          if (cooking) { api.msg('Flip the patty first! It\'s screaming.', 'bad', 700); return; }
          const id = ings[i].id;
          if (id !== ticket.seq[ticket.i]) {
            ticket.miss++; mistakes++;
            api.sfx('miss'); api.shake();
            api.msg(pick(['WRONG. Marge throws a spatula at you.', '"That ain\'t on the ticket, hon."', 'You put a pickle where no pickle should be.', 'Marge: "Can you READ? Can ANYONE here read?"']), 'bad');
            return;
          }
          if (id === 'patty') { cooking = { x: 0 }; grill.style.visibility = 'visible'; nd.style.left = '0%'; api.sfx('sizzle'); return; }
          api.sfx('tick');
          addLayer(id);
        },
      };
    },
  });

  // ======================================================================= CONVEYOR
  const GOOD = [['🥩', 'Rump Roast'], ['🍖', 'Rib Rack'], ['🥓', 'Belly Strip'], ['🍗', 'Mystery Drumstick'], ['🦴', 'Soup Bone'], ['🌭', 'Pre-Hot Dog'], ['🫀', 'Heart (cow, probably)']];
  const GROSS = [['🧦', 'Sock (used)'], ['💍', 'Ring, still on finger'], ['🐀', 'Live rat'], ['🟢', 'Glowing kidney'], ['🧤', 'Somebody\'s glove'], ['👁️', 'An eye. Watching.'], ['🦷', 'Too many teeth'], ['🪳', 'Cockroach colony'], ['🩲', 'Gary\'s underwear']];
  mg.register('conveyor', {
    name: 'The Line', width: 660,
    how: 'Meat rolls down the belt into your station (the yellow box). <kbd>←</kbd> <b>GRAB</b> good cuts, <kbd>→</kbd> <b>TOSS</b> anything gross. Let something slide past and it goes in the hot dog vat. Foreman Gristle sometimes bans a cut: obey the <b>RULE</b>. 32 seconds.',
    lines: { S: ['Gristle nods at you. Gristle has never nodded. A coworker faints.'], F: ['Today\'s hot dogs contain: a sock, a ring, and your dignity.'] },
    create(api) {
      const T = 32, zone = [0.16, 0.34];
      const baseV = 0.24 + api.diff * 0.12, interval = 1.25 - api.diff * 0.35;
      let t = 0, spawnT = 0.3, items = [], ok = 0, bad = 0, n = 0, banned = null, banT = 0;
      api.stage.innerHTML = `<div data-rule class="sys-hint" style="text-align:center;min-height:22px"></div>
        <div style="position:relative;height:150px;margin-top:6px">
          <div data-belt style="position:absolute;left:0;right:0;top:46px;height:64px;background:repeating-linear-gradient(90deg,#2b2620 0 18px,#1c1915 18px 36px);border-top:3px solid #555;border-bottom:3px solid #555"></div>
          <div style="position:absolute;left:${zone[0] * 100}%;width:${(zone[1] - zone[0]) * 100}%;top:36px;height:84px;border:3px dashed #d6b33c;border-radius:4px"></div>
          <div style="position:absolute;left:0;top:118px;width:${zone[0] * 100}%;text-align:center;font-size:12px;color:#a9a291">HOT DOG VAT →🌭</div>
          <div data-items></div></div>`;
      api.pad([{ k: L, label: '✋ GRAB', sub: '← / A · good meat', cls: 'green' }, { k: R, label: 'TOSS 🗑️', sub: '→ / D · gross stuff', cls: 'red' }]);
      const belt = api.stage.querySelector('[data-belt]'), box = api.stage.querySelector('[data-items]'), rule = api.stage.querySelector('[data-rule]');
      const W = () => api.stage.clientWidth || 600;
      const isGood = (it) => it.good && it.name !== banned;
      const sc = () => api.score(`✅ ${ok} · ❌ ${bad}`);
      const setRule = () => {
        if (api.diff < 0.3) { rule.innerHTML = 'Rule: keep the meat, toss the gross. Simple. Like you.'; return; }
        banned = chance(0.25) ? null : pick(GOOD)[1];
        rule.innerHTML = banned ? `<b style="color:#e2402f">RULE: NO ${banned.toUpperCase()}!</b> <span class="sys-hint">("those are for Gristle")</span>` : 'Rule: everything that\'s meat. Gristle is feeling generous.';
        api.sfx('stamp');
      };
      setRule(); sc();
      const resolve = (it, right, why) => {
        it.done = true; n++;
        if (right) { ok++; api.sfx('hit'); } else { bad++; api.sfx('miss'); api.msg(why, 'bad', 900); }
        it.el.style.opacity = '0.25';
        it.el.style.transform += right ? ' translateY(-30px)' : ' translateY(30px)';
        sc();
      };
      const score = () => clamp((ok - 0.5 * bad) / Math.max(n, Math.round(T / interval) * 0.8), 0, 1);  // blind 50/50 guessing should land around D
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          belt.style.backgroundPosition = `${-(t * baseV * W()) % 36}px 0`;
          if (api.diff >= 0.3 && (banT += dt) > 10) { banT = 0; setRule(); }
          if ((spawnT -= dt) <= 0 && t < T - 2) {
            spawnT = interval * rand(0.8, 1.25);
            const good = chance(0.62);
            const [e, name] = pick(good ? GOOD : GROSS);
            const el = document.createElement('div');
            el.style.cssText = 'position:absolute;top:50px;width:70px;margin-left:-35px;text-align:center;transition:opacity .2s,transform .2s';
            el.innerHTML = `<div style="font-size:34px;line-height:38px">${e}</div><div style="font-size:11px;line-height:1;color:#ddd;text-shadow:1px 1px 0 #000">${name}</div>`;
            box.appendChild(el);
            items.push({ el, x: 1.05, good, name, done: false });
          }
          const v = baseV * (1 + 0.35 * (t / T));
          for (const it of items) {
            it.x -= v * dt;
            it.el.style.left = `${it.x * 100}%`;
            if (!it.done && it.x < zone[0] - 0.02) resolve(it, false, isGood(it) ? 'Good meat in the vat. Gristle docks your pay in spirit.' : pick(['It\'s a hot dog now. Congrats.', 'That went in the hot dogs. Someone will eat that.']));
          }
          items = items.filter((it) => { if (it.x < -0.15) { it.el.remove(); return false; } return true; });
          if (t >= T) api.done(score(), { stats: `${ok} right · ${bad} wrong` });
        },
        key(code) {
          if (code !== L && code !== R) return false;
          const it = items.filter((x) => !x.done && x.x >= zone[0] - 0.03 && x.x <= zone[1] + 0.05).sort((a, b) => a.x - b.x)[0];
          if (!it) { api.msg(pick(['You grab air. Gristle sees.', 'Nothing in your station, champ.']), '', 600); return; }
          const g = isGood(it);
          if (code === L) resolve(it, g, it.good ? 'That cut is BANNED today. Read the rule!' : pick(['You saved a sock for the customers.', 'You packed a rat. It\'s a pet now.', 'GROSS. That goes in the BIN.']));
          else resolve(it, !g, 'You tossed perfectly good meat. Perfectly.');
        },
      };
    },
  });

  // ======================================================================= EMAIL
  const MAIL = {
    reply: [
      ['Mr. Grimsby', 'Need the Q3 synergy deck by EOD (end of decade)'],
      ['Mr. Grimsby', 'Quick sync to circle back on the low-hanging fruit'],
      ['Client: Hamhock Meats', 'Re: our order of 40,000 staplers'],
      ['Mr. Grimsby', 'Let\'s deep-dive the paradigm. Bring a snorkel.'],
      ['Accounting', 'Your expense report: explain the $90 "emotional support sandwich"'],
      ['Client: Rotwell PD', 'Invoice for the riot gear (pastel edition)'],
      ['Mr. Grimsby', 'Move the needle. Literally. It\'s in my chair.'],
      ['Legal', 'Please confirm you did NOT reply-all to the board'],
    ],
    spam: [
      ['totallyrealprince@rotmail', 'A Prince of Rotwell needs your bank PIN'],
      ['Gary', 'FW: FW: FW: FW: send to 10 coworkers or you DIE'],
      ['HotSinglesNearRendering', 'Hot singles in your meat plant!!!'],
      ['Gary', 'lol look at this dog (attachment: 400MB)'],
      ['Rewards Center', 'U WON a FREE cruise (you are the cruise)'],
      ['Crypto Chad', 'GrimCoin to the MOON. Moon not guaranteed.'],
      ['Facilities', 'Mandatory fun survey (optional) (mandatory)'],
      ['Gary', 'who wants to see my mole'],
    ],
    hr: [
      ['Brenda', 'WHO keeps microwaving FISH in the break room'],
      ['Anonymous', 'Dale from Accounting keeps sniffing my chair'],
      ['Facilities', 'Someone pooped in the supply closet. Again. It\'s signed.'],
      ['Brenda', 'Steve is wearing ONLY the tie again'],
      ['Anonymous', 'Gary\'s "jokes" are now a podcast. In the break room. Live.'],
      ['Intern Kyle', 'My manager made me lick the stapler for "team bonding"'],
      ['Brenda', 'Someone replaced the coffee with gravy. It was Gary.'],
    ],
    phish: [
      ['Mr. Grimbsy', 'URGENT: buy me 40 gift cards. Do not tell Mr. Grimsby.'],
      ['Mr Grimsby (real)', 'Plz wire $5000 to my nephew, he is a real boss'],
      ['IT Departmint', 'Your pasword expired. Reply with pasword.'],
      ['Mr. Grimsbee', 'CEO here. Send me your social security. For synergy.'],
    ],
  };
  mg.register('email', {
    name: 'Inbox Zero (Hero)', width: 640,
    how: '<kbd>←</kbd> <b>REPLY</b> to real work (the boss, clients, departments) · <kbd>↓</kbd> <b>DELETE</b> spam, chain letters and Gary · <kbd>→</kbd> <b>FORWARD TO HR</b> anything creepy or crimey. Watch for <b>fake bosses</b> (misspelled names, gift cards) — those get <b>DELETED</b>. Each email has a patience bar. ~40 seconds.',
    lines: { S: ['Inbox zero. Mr. Grimsby calls it "visionary" and steals the credit. Classic.'], F: ['You replied-all to a dick pic. Not your own. Somehow worse.'] },
    create(api) {
      const N = 14 + Math.round(api.diff * 4), patience = 6.5 - api.diff * 2.2, T = 45;
      let t = 0, i = 0, cur = null, sum = 0, right = 0, left = 0;
      const deck = [];
      for (let k = 0; k < N; k++) {
        let kind = pick(['reply', 'reply', 'spam', 'spam', 'hr']);
        if (api.diff >= 0.25 && chance(0.18 + api.diff * 0.1)) kind = 'phish';
        const [from, subj] = pick(MAIL[kind]);
        deck.push({ kind, from, subj, want: kind === 'reply' ? L : kind === 'hr' ? R : D });
      }
      api.stage.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:14px;color:#a9a291;margin-bottom:4px"><span>📥 Grimco Mail 97</span><span data-n></span></div>
        <div data-cur class="mg-card" style="min-height:96px;font-size:18px"></div>
        <div data-q style="margin-top:6px;opacity:.45;font-size:14px"></div>`;
      api.pad([{ k: L, label: '↩ REPLY', sub: '← / A · real work', cls: 'green' }, { k: D, label: '🗑 DELETE', sub: '↓ / S · spam & fakes' }, { k: R, label: 'HR ⚠', sub: '→ / D · creepy / crimey', cls: 'red' }]);
      const curEl = api.stage.querySelector('[data-cur]'), qEl = api.stage.querySelector('[data-q]'), nEl = api.stage.querySelector('[data-n]');
      const show = () => {
        cur = deck[i]; left = patience;
        if (!cur) return;
        curEl.innerHTML = `<div style="font-size:13px;color:#555">From: <b style="color:#141210">${cur.from}</b></div><div style="font-weight:700;margin:4px 0">${cur.subj}</div><div class="mg-time" style="height:6px;background:#bbb"><i data-pt style="width:100%"></i></div>`;
        qEl.innerHTML = deck.slice(i + 1, i + 3).map((m) => `<div>✉ ${m.from}: ${m.subj.slice(0, 48)}${m.subj.length > 48 ? '…' : ''}</div>`).join('');
        nEl.textContent = `${N - i} unread`;
        api.sfx('tick');
      };
      const answer = (code) => {
        const good = code === cur.want;
        if (good) { right++; sum += 0.75 + 0.25 * (left / patience); api.sfx('hit'); api.msg(pick(['Handled.', 'Synergized.', 'Leveraged.', 'Circled back.', 'Actioned. (That\'s a verb now.)']), 'good', 500); }
        else {
          api.sfx('miss'); api.shake();
          const why = code === 'timeout' ? 'Ignored. It\'s now a "fire". You\'re the arsonist.'
            : cur.kind === 'phish' ? (code === L ? 'You bought 40 gift cards for a scammer. Grimsby is "disappointed but not surprised".' : 'HR just forwarded it back. It\'s spam. Delete it.')
              : cur.kind === 'hr' ? 'That needed HR. Now YOU\'RE in the email chain.'
                : cur.kind === 'spam' ? (code === L ? 'You replied to Gary. He replied back. Forty times.' : 'HR does not care about Gary\'s dog.')
                  : 'That was your boss. Mr. Grimsby is typing in ALL CAPS.';
          api.msg(why, 'bad', 1300);
        }
        i++;
        api.score(`✉ ${right}/${i}`);
        if (i >= N) { api.done(sum / N, { stats: `${right}/${N} handled right` }); return; }
        show();
      };
      show(); api.score('✉ 0/0');
      return {
        partial: () => sum / N,
        tick(dt) {
          t += dt;
          api.time(1 - i / N);
          if (!cur) return;
          left -= dt;
          const pt = curEl.querySelector('[data-pt]');
          if (pt) pt.style.width = `${clamp(left / patience, 0, 1) * 100}%`;
          if (left <= 0) answer('timeout');
          if (t >= T && cur) api.done(sum / N, { stats: `${right}/${N} handled right` });
        },
        key(code) { if (code !== L && code !== R && code !== D) return false; if (cur) answer(code); },
      };
    },
  });

  // ======================================================================= MIXDRINK
  const BOOZE = [
    { id: 'W', e: '🥃', n: 'Rotgut Whiskey' }, { id: 'V', e: '🧴', n: 'Shampoo-Bottle Vodka' }, { id: 'T', e: '🌵', n: 'Tequila' }, { id: 'B', e: '🍺', n: 'Piss Lite' },
    { id: 'C', e: '🥤', n: 'Flat Cola' }, { id: 'L', e: '🍋', n: 'Lime' }, { id: 'P', e: '🥒', n: 'Pickle Juice' }, { id: 'H', e: '🌶️', n: 'Hot Sauce' },
  ];
  const DRINKS = [
    ['Sloppy Divorce', 'WTP'], ['Dirty Grandma', 'WC'], ['Soggy Handshake', 'VP'], ['Tequila Mockingbird', 'TL'], ['Walk of Shame', 'BLH'],
    ['Swamp Water', 'BPL'], ['Spicy Ex', 'THC'], ['Mom\'s Minivan', 'VCL'], ['Gristle\'s Gargle', 'WPH'], ['Liquid Regret', 'WVTB'],
  ];
  const PATRONS = ['A sweaty trucker', 'Divorced Doug', 'A bachelorette (sash: "BRIDE 2 BLEED")', 'A man in a wet suit (not wetsuit — a wet suit)', 'A guy named Moist Kevin', 'An off-duty clown', 'Grandma Knuckles', 'A biker with a teardrop tattoo of a smaller biker', 'A lawyer, crying'];
  const ORDER_LINES = ['Gimme a {d}. And make it hurt.', 'One {d}. I\'m not here to talk.', 'A {d}, sweetheart. Like my mama used to make. In prison.', '{d}. Make it sloppy. Like my life.', 'Whatever a {d} is, I need four. Start with one.', 'I\'ll take a {d}. Don\'t spit in it. Unless you want to.'];
  mg.register('mixdrink', {
    name: 'Behind the Bar', width: 680,
    how: 'A customer barks a drink order. Find it in Sal\'s <b>recipe book</b>, tap the ingredients (<kbd>1</kbd>–<kbd>8</kbd>, order doesn\'t matter), then <kbd>Space</kbd>/<kbd>Enter</kbd> to <b>SERVE</b>. <kbd>Backspace</kbd> dumps the glass. Faster = bigger tip. Wrong drink = spit take. 45 seconds.',
    lines: { S: ['Sal\'s one eye tears up. "You\'re the son I never wanted."'], F: ['Three customers are now blind. Sal says that\'s "about average".'] },
    create(api) {
      const T = 45, target = 10 - Math.round(api.diff * 2), patience = 15 - api.diff * 5;
      const pool = api.diff < 0.3 ? DRINKS.slice(0, 7) : DRINKS;
      const showRecipe = api.diff < 0.3;
      let t = 0, cust = null, glass = new Set(), sum = 0, served = 0, n = 0, gap = 0;
      api.stage.innerHTML = `<div style="display:flex;gap:10px">
        <div style="flex:1.2"><div data-c class="mg-card" style="min-height:64px;font-size:17px"></div>
          <div style="margin-top:8px;text-align:center"><span style="font-size:40px">🍸</span><div data-g style="min-height:28px"></div></div></div>
        <div style="flex:1;font-size:13.5px;background:#15120f;border:1px solid #2e2821;padding:4px 8px;max-height:200px;overflow:auto"><div style="font-family:var(--font-title);color:var(--rust)">SAL'S BOOK</div>${pool.map(([nm, r]) => `<div><b>${nm}</b>: ${[...r].map((c) => BOOZE.find((b) => b.id === c).e).join(' ')}</div>`).join('')}</div></div>`;
      api.pad([...BOOZE.map((b, i) => ({ k: DIGITS[i], label: b.e, sub: `${i + 1} ${b.n.split(' ').pop()}` })), { k: SP, label: 'SERVE', sub: 'Space / Enter', cls: 'green wide' }, { k: 'Backspace', label: 'DUMP', sub: 'Backspace', cls: 'red' }]);
      const cEl = api.stage.querySelector('[data-c]'), gEl = api.stage.querySelector('[data-g]');
      const drawGlass = () => { gEl.innerHTML = [...glass].map((id) => { const b = BOOZE.find((x) => x.id === id); return `<span class="mg-chip on">${b.e} ${b.n}</span>`; }).join('') || '<span class="sys-hint">(empty glass)</span>'; };
      const next = () => {
        const [name, rec] = pick(pool);
        cust = { name, rec, who: pick(PATRONS), line: pick(ORDER_LINES).replace('{d}', `<b>${name}</b>`), left: patience };
        n++; glass = new Set(); drawGlass();
        cEl.innerHTML = `<div style="font-size:13px;color:#555">${cust.who}:</div>"${cust.line}"${showRecipe ? `<div style="font-size:14px;color:#3c5a26;margin-top:2px">(${[...rec].map((c) => BOOZE.find((b) => b.id === c).n).join(' + ')})</div>` : ''}<div class="mg-time" style="height:6px;background:#bbb;margin-top:4px"><i data-pt style="width:100%"></i></div>`;
      };
      const score = () => clamp(sum / target, 0, 1);
      const sc = () => api.score(`🍸 ${served}/${target}`);
      next(); sc();
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          if (cust) {
            cust.left -= dt;
            const pt = cEl.querySelector('[data-pt]');
            if (pt) pt.style.width = `${clamp(cust.left / patience, 0, 1) * 100}%`;
            if (cust.left <= 0) { api.msg(`${cust.who} gives up and drinks from the bar mat.`, 'bad'); api.sfx('miss'); cust = null; gap = 1.1; }
          } else if ((gap -= dt) <= 0 && t < T - 2) next();
          if (t >= T) api.done(score(), { stats: `${served} drinks served` });
        },
        key(code) {
          if (!cust) return;
          if (code === 'Backspace') { glass.clear(); drawGlass(); api.sfx('pour'); return; }
          if (isAct(code)) {
            const want = [...cust.rec].sort().join(''), got = [...glass].sort().join('');
            if (!got) { api.msg('That\'s an empty glass. Even here, that\'s a no.', 'bad', 700); return; }
            if (want === got) {
              const s = 0.7 + 0.3 * (cust.left / patience);
              sum += s; served++;
              api.sfx('hit');
              api.msg(s > 0.9 ? pick(['Fast AND filthy. Big tip!', '"That\'s the stuff." They lick the glass.']) : pick(['Served. They grunt. That\'s a thank-you here.', 'They drink it in one go and stare into the void.']), 'good');
            } else {
              api.sfx('miss'); api.shake();
              api.msg(pick(['Spit take! Right in Sal\'s good eye.', '"This tastes like a dare." They leave.', '"I said a ' + cust.name + ', not whatever THIS war crime is."']), 'bad', 1300);
            }
            cust = null; gap = 1.0; sc();
            return;
          }
          const i = digitIndex(code);
          if (i < 0 || i >= BOOZE.length) return false;
          const id = BOOZE[i].id;
          if (glass.has(id)) glass.delete(id); else glass.add(id);
          api.sfx('pour'); drawGlass();
        },
      };
    },
  });

  // ======================================================================= LINEUP (cop)
  const HATS = ['none', 'cap', 'tophat', 'beanie'];
  const HAT_WORDS = { none: 'no hat', cap: 'a ball cap', tophat: 'a top hat', beanie: 'a beanie' };
  mg.register('lineup', {
    name: 'Suspect Lineup', width: 680,
    how: 'Read the witness statement, then pick the <b>one</b> suspect who matches <b>every</b> detail. <kbd>1</kbd>–<kbd>6</kbd> or tap them. Faster = better. 6 lineups. Wrong pick = an innocent man in jail (Hamhock calls that "Tuesday").',
    lines: { S: ['The Chief gives you a donut from the GOOD box. Detective material.'], F: ['You arrested the witness, the lawyer and a mop.'] },
    create(api) {
      const rounds = 6, N = 4 + Math.round(api.diff * 2), timeR = 10 - api.diff * 3, nTraits = 2 + Math.round(api.diff * 2);
      let r = 0, left = timeR, sum = 0, right = 0, cur = null, wait = 0;
      api.stage.innerHTML = `<div data-w class="mg-card" style="font-size:17px;min-height:48px"></div><div data-s style="display:flex;justify-content:center;gap:4px;margin-top:8px;background:repeating-linear-gradient(0deg,#1a1713 0 18px,#24201a 18px 20px);padding:6px 0 0"></div>`;
      const wEl = api.stage.querySelector('[data-w]'), sEl = api.stage.querySelector('[data-s]');
      const randT = () => ({ shirt: pick(Object.keys(COLORS)), hat: pick(HATS), stache: chance(0.5), glasses: chance(0.45), tall: chance(0.5) });
      const KEYS = ['shirt', 'hat', 'stache', 'glasses', 'tall'];
      const phrase = (k, v) => ({ shirt: `a <b>${v}</b> shirt`, hat: `<b>${HAT_WORDS[v]}</b>`, stache: v ? 'a <b>mustache</b>' : '<b>no mustache</b>', glasses: v ? '<b>glasses</b>' : '<b>no glasses</b>', tall: v ? 'was <b>tall</b>' : 'was <b>short</b>' }[k]);
      const matches = (s, c, ks) => ks.every((k) => s[k] === c[k]);
      const newRound = () => {
        const culprit = randT();
        const ks = shuffle(KEYS).slice(0, nTraits);
        const sus = [culprit];
        let guard = 0;
        while (sus.length < N && guard++ < 200) {
          const s = chance(0.7) ? { ...culprit } : randT();
          const k = pick(ks);
          if (k === 'shirt') s.shirt = pick(Object.keys(COLORS).filter((c) => c !== culprit.shirt));
          else if (k === 'hat') s.hat = pick(HATS.filter((h) => h !== culprit.hat));
          else s[k] = !culprit[k];
          if (chance(0.5)) { const o = pick(KEYS.filter((x) => !ks.includes(x))); if (o) s[o] = o === 'shirt' ? pick(Object.keys(COLORS)) : o === 'hat' ? pick(HATS) : !s[o]; }
          if (!matches(s, culprit, ks)) sus.push(s);
        }
        const order = shuffle(sus);
        cur = { culprit, ks, order, ans: order.indexOf(culprit) };
        left = timeR;
        const smell = pick(['regret', 'hot dogs', 'Axe body spray and fear', 'a wet basement', 'cheap cologne and cheaper decisions', 'my uncle']);
        wEl.innerHTML = `<div style="font-size:13px;color:#555">Witness #${r + 1} (${pick(['a drunk', 'a nun', 'a guy in a bathrobe', 'a very confident child', 'a man holding a ferret'])}):</div>"The guy had ${ks.map((k) => phrase(k, culprit[k])).join(', ')}. He smelled like ${smell}."`;
        sEl.innerHTML = order.map((s, i) => `<div data-k="${DIGITS[i]}" style="cursor:pointer;text-align:center;padding:2px 4px;border:2px solid transparent;border-radius:4px">${stickSvg(s)}<div style="font-family:var(--font-title);font-size:18px;background:#000;color:#fff;margin-top:-4px">${i + 1}</div></div>`).join('');
        api.pad([]);
      };
      newRound();
      api.score('🚔 0/0');
      return {
        partial: () => sum / rounds,
        tick(dt) {
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (r >= rounds) api.done(sum / rounds, { stats: `${right}/${rounds} collars` }); else newRound(); } return; }
          left -= dt;
          api.time(left / timeR);
          if (left <= 0) this.key('timeout');
        },
        key(code) {
          if (wait > 0 || !cur) return code === 'timeout' ? undefined : false;
          const i = code === 'timeout' ? -1 : digitIndex(code);
          if (code !== 'timeout' && (i < 0 || i >= cur.order.length)) return false;
          const els = sEl.children;
          if (els[cur.ans]) els[cur.ans].style.borderColor = '#7fbf4d';
          if (i === cur.ans) { right++; sum += 0.6 + 0.4 * clamp(left / timeR, 0, 1); api.sfx('stamp'); api.msg(pick(['Book \'em!', 'GOT HIM. He confesses to three other things.', 'Nailed it. He cries. You cry. Beautiful.']), 'good'); }
          else {
            if (i >= 0 && els[i]) els[i].style.borderColor = '#e2402f';
            api.sfx('miss'); api.shake();
            api.msg(code === 'timeout' ? 'Too slow. The suspect walked. Literally, out the door.' : pick(['Wrong guy! He was just there for the free coffee.', 'Innocent man arrested. The Chief says "close enough".', 'Nope. That\'s the witness\'s cousin.']), 'bad', 1300);
          }
          r++; wait = 1.1;
          api.score(`🚔 ${right}/${r}`);
        },
      };
    },
  });

  // ======================================================================= IDCHECK (bouncer)
  const YEAR = 2031;
  const FIRST = ['Chad', 'Destinee', 'Barry', 'Tiffanee', 'Moist', 'Brayden', 'Krystal', 'Dr.', 'Lil', 'Big', 'Duke', 'Skyler', 'Gertrude', 'Rocco'];
  const LAST = ['Brosky', 'Sparkles', 'Bigsby', 'McPartyface', 'Kevin', 'Thunderthighs', 'Gristle', 'Vape', 'Fontaine', 'Noodle', 'Hamhock Jr.', 'DeVille'];
  mg.register('idcheck', {
    name: 'The Velvet Rope', width: 660,
    how: (o) => `Check each ID against <b>Vince's rules</b>, then <kbd>←</kbd> <b>LET IN</b> or <kbd>→</kbd> <b>BOUNCE</b>. Today is <b>${YEAR}</b>. Rules: <b>21+</b> · <b>not expired</b>${(o.diff ?? 0) >= 0.4 ? ' · <b>photo must match</b> (hair, mustache, glasses)' : ''}${(o.diff ?? 0) >= 0.9 ? ' · <b>NO SNEAKERS</b>' : ''}. 10 patrons, and they get impatient.`,
    lines: { S: ['Vince fist-bumps you. Your hand goes numb for an hour. Worth it.'], F: ['You let in three 16-year-olds and a raccoon in a trench coat.'] },
    create(api) {
      const N = 10, patience = 7 - api.diff * 2.5;
      const rules = ['age', 'exp', ...(api.diff >= 0.4 ? ['photo'] : []), ...(api.diff >= 0.9 ? ['shoes'] : [])];
      let i = 0, left = patience, sum = 0, right = 0, cur = null, wait = 0;
      api.stage.innerHTML = `<div class="sys-hint" style="text-align:center;margin-bottom:6px">TODAY: <b>${YEAR}</b> · RULES: <b>21+</b> (born ${YEAR - 21} or earlier) · <b>not expired</b>${rules.includes("photo") ? " · <b>photo matches</b>" : ""}${rules.includes("shoes") ? " · <b>NO SNEAKERS</b>" : ""}</div><div style="display:flex;gap:14px;align-items:center;justify-content:center">
        <div style="text-align:center"><div data-pp></div><div data-sh style="font-size:14px"></div></div>
        <div data-id class="mg-card" style="width:270px;font-size:15px;line-height:1.3;background:linear-gradient(135deg,#efe6c8,#d6ccb0)"></div></div>
        <div data-say class="sys-hint" style="text-align:center;margin-top:6px;min-height:20px"></div>`;
      api.pad([{ k: L, label: '✅ LET IN', sub: '← / A', cls: 'green' }, { k: R, label: 'BOUNCE ⛔', sub: '→ / D', cls: 'red' }]);
      const pp = api.stage.querySelector('[data-pp]'), idEl = api.stage.querySelector('[data-id]'), shEl = api.stage.querySelector('[data-sh]'), sayEl = api.stage.querySelector('[data-say]');
      const next = () => {
        const face = { hair: pick(Object.keys(HAIR)), stache: chance(0.4), glasses: chance(0.35) };
        const c = { name: `${pick(FIRST)} ${pick(LAST)}`, born: YEAR - randInt(21, 58), exp: YEAR + randInt(0, 5), face, photo: { ...face }, sneakers: rules.includes('shoes') ? chance(0.25) : chance(0.5), bad: null };
        if (rules.includes('shoes') && c.sneakers) c.bad = 'shoes';
        if (!c.bad && chance(0.5)) {
          const b = pick(rules.filter((x) => x !== 'shoes'));
          c.bad = b;
          if (b === 'age') c.born = YEAR - randInt(16, 20);
          if (b === 'exp') c.exp = YEAR - randInt(1, 6);
          if (b === 'photo') { const k = pick(['hair', 'stache', 'glasses']); c.photo[k] = k === 'hair' ? pick(Object.keys(HAIR).filter((h) => h !== face.hair)) : !face[k]; }
        }
        cur = c; left = patience;
        pp.innerHTML = faceSvg(face, 120);
        shEl.innerHTML = c.sneakers ? '👟 <b>sneakers</b>' : pick(['👞 dress shoes', '🥾 boots', '👠 heels', '🩴 flip-flops (bold)']);
        idEl.innerHTML = `<div style="display:flex;justify-content:space-between;font-family:var(--font-title);font-size:12px;color:#6d1510"><span>STATE OF ROTWELL</span><span>DRIVER LICENSE-ISH</span></div>
          <div style="display:flex;gap:8px;margin-top:4px"><div style="background:#bfb59a;border:1px solid #888">${faceSvg(c.photo, 64)}</div>
          <div><b>${c.name}</b><br>Born: <b>${c.born}</b> ${api.diff < 0.4 ? `<span style="color:#666">(age ${YEAR - c.born})</span>` : ""}<br>Expires: <b>${c.exp}</b><br><span style="font-size:11px;color:#666">Organ donor: ${pick(['YES', 'ALREADY DID', 'KIDNEY ONLY', 'NO (selfish)'])}</span></div></div>`;
        sayEl.textContent = `"${pick(['I know Vince.', 'Do you know who I am?', 'I\'m on the list. Under "VIP". Or "Steve".', 'My cousin owns this club. Different club, but still.', 'Hurry up, I gotta pee so bad.', 'That\'s an old photo. I\'ve had work done.', 'Is this the line for the bathroom?'])}"`;
        api.sfx('whoosh');
      };
      next(); api.score('🚪 0/0');
      return {
        partial: () => clamp((sum - 0.4 * (i - right)) / N, 0, 1),
        tick(dt) {
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (i >= N) api.done(clamp((sum - 0.4 * (i - right)) / N, 0, 1), { stats: `${right}/${N} correct calls` }); else next(); } return; }
          left -= dt;
          api.time(left / patience);
          if (left <= 0) this.key('timeout');
        },
        key(code) {
          if (wait > 0 || !cur) return code === 'timeout' ? undefined : false;
          if (code !== L && code !== R && code !== 'timeout') return false;
          const shouldIn = !cur.bad;
          const ok = code !== 'timeout' && (code === L) === shouldIn;
          if (ok) { right++; sum += 0.75 + 0.25 * clamp(left / patience, 0, 1); api.sfx(code === L ? 'hit' : 'stamp'); api.msg(code === L ? pick(['In you go.', 'Enjoy the bass. And the smell.']) : pick(['BOUNCED. Like a bad check.', 'Get outta here, kid.', 'Rejected. They cry in the parking lot.']), 'good', 700); }
          else {
            api.sfx('miss'); api.shake();
            const why = code === 'timeout' ? 'Too slow. They climbed over the rope.'
              : shouldIn ? 'That ID was fine. You bounced a paying customer. Vince is doing math at you.'
                : { age: `They're ${YEAR - cur.born}. That's a CHILD, by club law.`, exp: 'Expired ID. Vince\'s rule two. Or four. There are a lot of rules.', photo: 'That\'s not their photo. That\'s their cousin. Or a stranger.', shoes: 'SNEAKERS. In Club Velvet. Vince is physically ill.' }[cur.bad];
            api.msg(why, 'bad', 1400);
          }
          i++; wait = 0.75;
          api.score(`🚪 ${right}/${i}`);
        },
      };
    },
  });

  // ======================================================================= SCRAPSORT
  const SCRAP = {
    copper: [['🔌', 'Copper wire bundle'], ['🪙', 'Jar of old pennies'], ['🔩', 'Copper pipe'], ['♨️', 'Radiator core'], ['🔔', 'Bell (copper-ish)'], ['🌀', 'Motor windings']],
    steel: [['🛞', 'Hubcap'], ['🚪', 'Car door'], ['⚙️', 'Engine block'], ['🔧', 'Rebar'], ['🛒', 'Shopping cart'], ['🧲', 'Suspicious fridge']],
    trash: [['🧸', 'Haunted teddy bear'], ['📼', 'VHS: "Our Wedding (do NOT watch)"'], ['🗿', 'Mannequin head (your face)'], ['🩲', 'Underwear, used heroically'], ['🍕', 'Pizza Butt box (still full?)'], ['🧻', 'A soggy something']],
    dog: [['🦴', 'A bone (don\'t ask)'], ['🎾', 'Tennis ball'], ['👞', 'Single shoe'], ['🥩', 'Raw steak'], ['🐿️', 'Squirrel (furious)']],
  };
  mg.register('scrapsort', {
    name: 'Scrap Sorting', width: 620,
    how: (o) => `Junk drops off the magnet. Sort it fast: <kbd>←</kbd> <b>COPPER</b> · <kbd>↓</kbd> <b>STEEL</b> · <kbd>→</kbd> <b>TRASH</b>${(o.diff ?? 0) >= 0.5 ? ' · <kbd>↑</kbd> <b>MR. CHOMPERS</b> (dog stuff)' : ''}. Each piece has a fuse. Sort ~26 for full marks; wrong bins cost you. 35 seconds.`,
    lines: { S: ['Pete hands you a cold beer from inside a dead fridge. Highest honor in the yard.'], F: ['You sorted Mr. Chompers into the crusher. He climbed out. He\'s angry.'] },
    create(api) {
      const T = 35, target = 26 + Math.round(api.diff * 4), fuse = 3.4 - api.diff * 1.1;
      const bins = [['copper', L, '🟠 COPPER', '← / A'], ['steel', D, '⚙️ STEEL', '↓ / S'], ['trash', R, '🗑️ TRASH', '→ / D']];
      if (api.diff >= 0.5) bins.push(['dog', U, '🐕 CHOMPERS', '↑ / W']);
      let t = 0, cur = null, ok = 0, bad = 0, streak = 0, left = 0;
      api.stage.innerHTML = `<div style="text-align:center;font-size:26px">🧲</div><div style="text-align:center;height:2px;width:2px;margin:0 auto;border-left:2px solid #777;height:18px"></div>
        <div data-it style="text-align:center;min-height:110px"></div><div style="width:50%;margin:0 auto"><div class="mg-time" style="height:6px"><i data-f style="width:100%"></i></div></div><div data-sk class="sys-hint" style="text-align:center;margin-top:4px"></div>`;
      api.pad(bins.map(([, k, label, sub]) => ({ k, label, sub })));
      const it = api.stage.querySelector('[data-it]'), fEl = api.stage.querySelector('[data-f]'), sk = api.stage.querySelector('[data-sk]');
      const kinds = bins.map((b) => b[0]);
      const next = () => {
        const kind = pick(kinds);
        const [e, name] = pick(SCRAP[kind]);
        cur = { kind, e, name };
        left = fuse;
        it.innerHTML = `<div style="font-size:64px;line-height:1.1;animation:mgPop .2s ease-out">${e}</div><div style="font-size:17px">${name}</div>`;
      };
      const score = () => clamp((ok - 0.5 * bad) / target, 0, 1);
      const sc = () => { api.score(`🔩 ${ok}/${target}`); sk.textContent = streak >= 3 ? `🔥 streak ${streak}! Pete grunts approvingly.` : ''; };
      next(); sc();
      const answer = (kind) => {
        if (kind === cur.kind) { ok++; streak++; api.sfx(cur.kind === 'steel' || cur.kind === 'copper' ? 'clank' : 'hit'); }
        else {
          bad++; streak = 0; api.sfx('miss'); api.shake();
          api.msg(kind == null ? 'Too slow. It fell on your foot.' : pick([`That's ${cur.kind === 'dog' ? 'Mr. Chompers\' stuff' : cur.kind.toUpperCase()}, genius.`, 'Wrong bin. Pete spits near you. Not at you. Near.', 'Mr. Chompers growls at your sorting.']), 'bad', 900);
        }
        sc();
        next();
      };
      return {
        partial: score,
        tick(dt) {
          t += dt;
          api.time(1 - t / T);
          left -= dt;
          fEl.style.width = `${clamp(left / fuse, 0, 1) * 100}%`;
          if (left <= 0) answer(null);
          if (t >= T) api.done(score(), { stats: `${ok} sorted · ${bad} botched` });
        },
        key(code) {
          const b = bins.find((x) => x[1] === code);
          if (!b) return false;
          answer(b[0]);
        },
      };
    },
  });

  // ======================================================================= GUTFISH
  const FISH = [['🐟', 'Sludge Carp'], ['🐠', 'Tire Bass'], ['🐡', 'Lawyerfish'], ['🐟', 'Three-Eyed Trout'], ['🦈', 'Mini Shark (angry)'], ['🐠', 'Mutant Mackerel']];
  mg.register('gutfish', {
    name: 'Gutting Table',
    how: 'The knife sweeps along each fish. Press <kbd>Space</kbd> (or tap <b>CUT</b>) when it\'s over a <b style="color:#ffd84a">gold mark</b>. <b style="color:#e2402f">Never cut the bile sac</b> (red) — the whole fish is ruined and you smell like it for a week. Missed cuts and sloppy hacks cost points.',
    lines: { S: ['Mama Barnacle kisses your forehead. It leaves a fish scale. Keep it forever.'], F: ['Bile everywhere. Seagulls are filing a complaint about YOU.'] },
    create(api) {
      const N = 7 + Math.round(api.diff * 2), tol = 0.04 - api.diff * 0.012;
      let f = 0, x = 0, sweep = 0, fish = null, sum = 0, wait = 0, ruined = 0;
      api.stage.innerHTML = `<div data-fn class="sys-hint" style="text-align:center"></div><div data-fe style="text-align:center;font-size:90px;line-height:1.05;transform:scaleX(-1)"></div>
        <div data-tr class="mg-track" style="height:40px"></div>`;
      api.pad([{ k: SP, label: '🔪 CUT', sub: 'Space / Enter', cls: 'wide gold' }]);
      const tr = api.stage.querySelector('[data-tr]'), fe = api.stage.querySelector('[data-fe]'), fn = api.stage.querySelector('[data-fn]');
      const newFish = () => {
        const [e, name] = pick(FISH);
        const nm = 2 + randInt(0, 1) + Math.round(api.diff);
        const bileW = 0.08 + api.diff * 0.04;
        const bile = rand(0.25, 0.75 - bileW);
        const marks = [];
        let g = 0;
        while (marks.length < nm && g++ < 200) {
          const m = rand(0.08, 0.95);
          if (m > bile - 0.05 && m < bile + bileW + 0.05) continue;
          if (marks.some((o) => Math.abs(o.x - m) < 0.11)) continue;
          marks.push({ x: m, done: false });
        }
        sweep = 1.9 - api.diff * 0.5 - f * 0.03;
        fish = { name, marks, bile, bileW, hits: 0, slop: 0, ruined: false };
        x = -0.06;
        fe.textContent = e; fe.style.filter = '';
        fn.textContent = `Fish ${f + 1}/${N}: ${name}`;
        tr.innerHTML = `<div class="z bad" style="left:${bile * 100}%;width:${bileW * 100}%"></div>${marks.map((m, i) => `<div class="z mark" data-m="${i}" style="left:${(m.x - 0.015) * 100}%"></div>`).join('')}<div class="ndl" data-nd style="left:0"></div>`;
      };
      const fishScore = (fs) => fs.ruined ? 0 : clamp(fs.hits / fs.marks.length - 0.2 * fs.slop, 0, 1);
      const endFish = () => {
        const s = fishScore(fish);
        sum += s; f++;
        if (!fish.ruined) api.msg(s >= 1 ? pick(['Clean as a whistle. A fishy whistle.', 'Textbook gut. Mama Barnacle approves.']) : s > 0.5 ? 'Decent. Mostly fish, minimal you.' : 'You mangled it. It\'s chowder now.', s >= 1 ? 'good' : s > 0.5 ? '' : 'bad', 800);
        api.score(`🐟 ${f}/${N}`);
        wait = 0.5;
      };
      newFish(); api.score(`🐟 0/${N}`);
      const nd = () => tr.querySelector('[data-nd]');
      return {
        partial: () => (sum + (fish ? fishScore(fish) * 0.5 : 0)) / N,
        tick(dt) {
          api.time(1 - f / N);
          if (wait > 0) { wait -= dt; if (wait <= 0) { if (f >= N) api.done(sum / N, { stats: `${N - ruined}/${N} fish saved` }); else newFish(); } return; }
          x += dt / sweep;
          const n = nd(); if (n) n.style.left = `${clamp(x, 0, 1) * 100}%`;
          if (x >= 1.04) endFish();
        },
        key(code) {
          if (!isAct(code)) return false;
          if (wait > 0 || !fish) return;
          if (x >= fish.bile && x <= fish.bile + fish.bileW) {
            fish.ruined = true; ruined++;
            fe.style.filter = 'hue-rotate(70deg) brightness(.7)';
            api.sfx('squish'); api.shake();
            api.msg(pick(['BILE SAC! You\'re wearing it now.', 'SPLOOSH. Green everywhere. Mama Barnacle gags.', 'You hit the bile. The fish wins.']), 'bad', 1100);
            endFish();
            return;
          }
          const m = fish.marks.find((mm) => !mm.done && Math.abs(mm.x - x) <= tol);
          if (m) { m.done = true; fish.hits++; api.sfx('flip'); const el = tr.querySelector(`[data-m="${fish.marks.indexOf(m)}"]`); el?.classList.add('done'); }
          else { fish.slop++; api.sfx('miss'); api.msg(pick(['Sloppy hack.', 'You stabbed the table.', 'That was a fin. Fins have feelings.']), 'bad', 600); }
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------------------------- art
// Little lineup stickman (SVG). t: { shirt, hat, stache, glasses, tall }
export function stickSvg(t, w = 78) {
  const h = 150, s = t.tall ? 1 : 0.8, top = h - 140 * s;
  const y = (v) => top + v * s;
  const col = COLORS[t.shirt] || '#888';
  const hx = 40;
  let hat = '';
  if (t.hat === 'cap') hat = `<path d="M${hx - 13} ${y(18)} Q${hx} ${y(2)} ${hx + 13} ${y(18)} Z" fill="#333"/><rect x="${hx + 8}" y="${y(15)}" width="14" height="4" fill="#333"/>`;
  if (t.hat === 'tophat') hat = `<rect x="${hx - 10}" y="${y(-8)}" width="20" height="22" fill="#111"/><rect x="${hx - 15}" y="${y(13)}" width="30" height="4" fill="#111"/>`;
  if (t.hat === 'beanie') hat = `<path d="M${hx - 13} ${y(18)} Q${hx} ${y(-2)} ${hx + 13} ${y(18)} Z" fill="#7a3a2a"/><circle cx="${hx}" cy="${y(3)}" r="4" fill="#d6b33c"/>`;
  const stache = t.stache ? `<path d="M${hx - 7} ${y(31)} Q${hx} ${y(26)} ${hx + 7} ${y(31)}" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>` : '';
  const glasses = t.glasses ? `<circle cx="${hx - 5}" cy="${y(23)}" r="4" fill="none" stroke="#111" stroke-width="1.6"/><circle cx="${hx + 5}" cy="${y(23)}" r="4" fill="none" stroke="#111" stroke-width="1.6"/><line x1="${hx - 1}" y1="${y(23)}" x2="${hx + 1}" y2="${y(23)}" stroke="#111" stroke-width="1.6"/>` : '<circle cx="' + (hx - 5) + '" cy="' + y(23) + '" r="1.5" fill="#111"/><circle cx="' + (hx + 5) + '" cy="' + y(23) + '" r="1.5" fill="#111"/>';
  return `<svg width="${w}" height="${(w * h) / 80}" viewBox="0 0 80 ${h}">
    <line x1="${hx}" y1="${y(40)}" x2="${hx}" y2="${y(92)}" stroke="#e6dfcf" stroke-width="4"/>
    <path d="M${hx - 13} ${y(42)} L${hx + 13} ${y(42)} L${hx + 10} ${y(86)} L${hx - 10} ${y(86)} Z" fill="${col}"/>
    <line x1="${hx - 12}" y1="${y(46)}" x2="${hx - 24}" y2="${y(80)}" stroke="#e6dfcf" stroke-width="4" stroke-linecap="round"/>
    <line x1="${hx + 12}" y1="${y(46)}" x2="${hx + 24}" y2="${y(80)}" stroke="#e6dfcf" stroke-width="4" stroke-linecap="round"/>
    <line x1="${hx}" y1="${y(90)}" x2="${hx - 14}" y2="${y(138)}" stroke="#e6dfcf" stroke-width="4" stroke-linecap="round"/>
    <line x1="${hx}" y1="${y(90)}" x2="${hx + 14}" y2="${y(138)}" stroke="#e6dfcf" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${hx}" cy="${y(25)}" r="13" fill="#e6dfcf"/>${glasses}${stache}${hat}</svg>`;
}

// Mugshot face for the bouncer ID check. f: { hair, stache, glasses }
export function faceSvg(f, size = 100) {
  const hc = HAIR[f.hair] || '#333';
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="none"/>
    <ellipse cx="50" cy="56" rx="27" ry="31" fill="#e6dfcf"/>
    <path d="M22 50 Q24 18 50 20 Q78 18 78 50 Q70 32 50 33 Q30 32 22 50 Z" fill="${hc}"/>
    ${f.glasses ? '<circle cx="39" cy="54" r="8" fill="none" stroke="#111" stroke-width="2.5"/><circle cx="61" cy="54" r="8" fill="none" stroke="#111" stroke-width="2.5"/><line x1="47" y1="54" x2="53" y2="54" stroke="#111" stroke-width="2.5"/>' : '<circle cx="39" cy="54" r="2.6" fill="#111"/><circle cx="61" cy="54" r="2.6" fill="#111"/>'}
    ${f.stache ? `<path d="M36 72 Q50 63 64 72 Q50 69 36 72 Z" fill="${hc}" stroke="${hc}" stroke-width="3"/>` : ''}
    <path d="M42 79 Q50 83 58 79" stroke="#111" stroke-width="2" fill="none"/></svg>`;
}
