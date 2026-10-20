// Homes: buy/rent, sleep, stash, shower, TV, wardrobe, set home, save.
// loc.home = { tier, price, rentPerDay, energyRestore }
// state.p.ownedHomes (core), state.p.home (core), state.p.stash[homeId] = { money, items:{}, drugs:{} },
// state.p.sys.rent[homeId] = last paid-through day.
import { fmtMoney, pick, chance, randInt, clamp } from '../core/util.js';
import { DRUGS } from '../data/drugs.js';
import { ITEMS } from '../data/items.js';
import { ensureState, today, train } from './common.js';
import { placeMenu, say, choose, cashLine } from './ui-kit.js';

const STASH_CAP = [12, 40, 120, 400, Infinity];
const TIER_NAMES = ['Dump', 'Starter', 'Nice', 'Luxury', 'Palace'];

const TV = [
  ['Channel 4 News', '"Tonight: is your toilet plotting against you? Experts say: maybe." You check your toilet. It looks guilty.'],
  ['Shopping Network', 'A man is selling a knife that cuts through other knives. You almost buy six.'],
  ['Cooking With Grease', 'Chef Lardo deep-fries a salad. Then the bowl. Then his own hand. The audience goes wild.'],
  ['Rotwell Wrestling', '"Big Mother" body-slams a guy dressed as a tax form. You feel things.'],
  ['Late-Night Infomercial', '"Are YOU tired of having a regular-sized butt? Try the Buttmaster 3000!" There is a phone number. You memorize it.'],
  ['Nature Documentary', 'Two pigeons fight over a cigarette butt in 4K. It\'s the most dramatic thing you\'ve ever seen. (+INT? Probably not.)'],
  ['Public Access', 'A man in a cape reads his poetry about the bus. It goes on for an hour. You can\'t look away.'],
  ['Soap Opera', '"Brock, I\'m pregnant... with your evil twin\'s clone\'s baby!" Brock slaps a vase. The vase deserved it.'],
  ['Cartoon Network-ish', 'A cartoon sponge commits tax fraud. Educational!'],
  ['Church Channel', 'Pastor Rick asks you to "sow a seed" of $99. You sow a seed of channel-changing.'],
  ['The Weather', '"Tomorrow: smog, with a chance of more smog. Wear a mask. Wear two. Don\'t lick anything."'],
  ['Reality TV', '"Who Wants to Marry a Hobo?" Contestant Brenda is crying into a trash can. She wins.'],
];

export function installHomes(game) {
  const st = game.state;

  const rentPerDay = (loc) => loc.home?.rentPerDay || (loc.home?.price ? Math.max(20, Math.round(loc.home.price / 140)) : 0);
  const owns = (id) => st.p.ownedHomes.includes(id);
  const rented = (id) => (st.p.sys.rent?.[id] ?? -1) >= game.time.day;
  const hasAccess = (loc) => owns(loc.id) || rented(loc.id) || (loc.home?.price === 0);

  function stash(id) {
    const p = st.p;
    return (p.stash[id] ??= { money: 0, items: {}, drugs: {} });
  }
  function stashUnits(s) {
    return Object.values(s.items).reduce((a, b) => a + b, 0) + Object.values(s.drugs).reduce((a, b) => a + b, 0);
  }

  game.locations.register('home', (g, loc) => {
    ensureState(st.p);
    if (!loc.home) loc.home = { tier: 0, price: 0, energyRestore: 0.7 };
    if (!hasAccess(loc)) return realtor(loc);
    return placeMenu(g, loc, {
      text: () => homeText(loc),
      options: () => homeOptions(loc),
    });
  });

  function homeText(loc) {
    const p = st.p, h = game.time.hour, tier = loc.home.tier;
    const base = {
      0: [
        'Room 6. The carpet is sticky in a pattern. A roach the size of a Pop-Tart watches you from the ceiling. You name him Gary.',
        'The neighbors are either fighting or doing something else loudly. Possibly both. The wall shakes.',
        'The mini-fridge hums ominously. The bedspread has a stain shaped like Florida. It\'s spreading.',
      ],
      1: [
        'Home sweet home. It\'s small, it\'s brown, it\'s yours. The faucet drips in Morse code. It says "help".',
        'Your neighbor is grilling something in the hallway. It might be a pigeon. It smells incredible.',
      ],
      2: [
        'Exposed brick, exposed pipes, exposed neighbor across the street (close the blinds, Gerald). Classy.',
        'The loft smells of fresh paint and faint fish from the docks. You feel like an artist who sells drugs.',
      ],
      3: [
        'The penthouse. Floor-to-ceiling windows look down on all the little people. You wave. They can\'t see you. Perfect.',
        'Your bathroom has a TV in the mirror and a bidet with nine settings. Setting nine is illegal in four states.',
      ],
      4: [
        'Grimsworth Manor. The butler, Pemberton, greets you with a slight sneer and a fresh towel. "Welcome home, sir/madam/whatever."',
        'Forty rooms, one of which you\'ve never found. Pemberton says it "isn\'t for you yet".',
      ],
    }[clamp(tier, 0, 4)];
    let t = pick(base);
    if (h >= 22 || h < 5) t += '<br><br><em>It\'s late. The bed is calling your name. It is also calling you a loser, but quietly.</em>';
    if (p.home !== loc.id) t += `<br><br><span class="sys-hint">This isn't your main home (you respawn at ${game.locations.get(p.home)?.name ?? p.home}).</span>`;
    if (!owns(loc.id) && rented(loc.id)) t += `<br><span class="sys-hint">Renting: paid through day ${p.sys.rent[loc.id]} (${fmtMoney(rentPerDay(loc))}/day).</span>`;
    return t;
  }

  function homeOptions(loc) {
    const p = st.p;
    const hr = game.time.hour;
    const out = [
      // "until morning" only makes sense in the evening/night (at 7 AM it would skip a whole day)
      ...(hr >= 17 || hr < 6 ? [{ label: 'Sleep until morning', hint: `until 7AM · ${Math.round(game.time.minutesUntil(7) / 60)}h`, run: () => sleep(loc, Math.max(60, game.time.minutesUntil(7)), true) }] : []),
      { label: 'Sleep 8 hours', run: () => sleep(loc, 480) },
      { label: 'Take a nap', hint: '2 hours', run: () => sleep(loc, 120) },
      { label: 'Stash', hint: 'safe from cops & muggers', run: () => openStash(loc) },
      { label: 'Take a shower', hint: today(game).shower ? 'already clean-ish' : '+Charm', run: () => shower(loc) },
      { label: 'Watch TV', hint: '1 hour', run: () => watchTv(loc) },
      { label: 'Wardrobe', hint: 'change outfit', run: () => game.sysShops?.wardrobe?.() },
      { label: 'Read the paper', run: () => game.sysNews?.open() },
    ];
    // home improvements (src/systems/ventures.js) — only for places you own
    if (owns(loc.id) || loc.home.price === 0) {
      try { out.push(...(game.lifestyle?.homeActions?.(loc) || [])); } catch (e) { console.error('[home] upgrade actions failed', e); }
      if (game.lifestyle) out.push({ label: 'Home improvements', hint: 'upgrades & perks', run: () => game.lifestyle.openHomeUpgrades(loc) });
    }
    if (p.home !== loc.id) out.push({ label: 'Make this my main home', hint: 'respawn here', run: () => { p.home = loc.id; st.changed('home'); game.ui.toast(`${loc.name} is now home. Lower your standards accordingly.`, 'good'); } });
    out.push({ label: 'Save game', run: () => { st.save(false); } });
    if (!owns(loc.id) && loc.home.price > 0) {
      out.push({ label: 'Extend rent (7 days)', hint: fmtMoney(rentPerDay(loc) * 7), run: () => payRent(loc, 7) });
      out.push({ label: `Buy it outright`, hint: fmtMoney(loc.home.price), disabled: p.money + p.bank < loc.home.price, run: () => buy(loc) });
    }
    if (owns(loc.id) && loc.home.price > 0) out.push({ label: 'Sell this property', hint: fmtMoney(Math.round(loc.home.price * 0.7)), run: () => sell(loc) });
    return out;
  }

  // ---------------- not owned ----------------
  function realtor(loc) {
    const h = loc.home;
    const p = st.p;
    const rpd = rentPerDay(loc);
    return placeMenu(game, loc, {
      speaker: 'Realtor Randy',
      text: () => `A realtor with frosted tips and a spray tan materializes out of nowhere. "${pick([
        "Welcome! This baby's got CHARACTER. And a little bit of asbestos. Character asbestos.",
        "Location, location, location! This one's got at least one of those.",
        "I can tell you're a person of taste. And of cash, hopefully.",
      ])}"<br><br><b>${loc.name}</b> — ${TIER_NAMES[h.tier] ?? ''} tier · sleep restores ${Math.round((h.energyRestore ?? 0.8) * 100)}% energy · stash ${STASH_CAP[h.tier] === Infinity ? 'unlimited' : STASH_CAP[h.tier] + ' units'}${h.tier >= 2 ? ' · garage' : ''}${h.tier >= 3 ? ' · passive Charm from living fancy' : ''}${h.tier >= 4 ? ' · a butler who judges you' : ''}.`,
      options: () => [
        { label: 'Buy it', hint: `${fmtMoney(h.price)} (cash + bank)`, disabled: p.money + p.bank < h.price, run: async () => { if (await buy(loc)) return 'leave'; } },
        { label: 'Rent it for a week', hint: `${fmtMoney(rpd * 7)} (${fmtMoney(rpd)}/day)`, disabled: p.money < rpd * 7, run: async () => { if (payRent(loc, 7)) { await say(game, loc.name, 'Randy hands you a key on a lanyard shaped like a dollar sign. "Rent\'s due every day. I WILL find you."', 'Realtor Randy'); return 'leave'; } } },
        { label: 'Take a tour', run: () => say(game, loc.name, tour(loc), 'Realtor Randy') },
      ],
    });
  }

  function tour(loc) {
    return {
      0: 'Randy: "Free room! Bring your own bug spray. And sheets. And a priest."',
      1: '"Cozy! That\'s realtor for small. The previous tenant left suddenly. Didn\'t take his teeth. Bonus!"',
      2: '"Industrial chic! The fish smell is included at no extra cost. And there\'s a garage for your ride."',
      3: '"Panoramic views! Heated floors! A hot tub on the balcony! The last guy fell off it. Don\'t do that."',
      4: '"Forty rooms. A wine cellar. A dungeon — sorry, \'basement\'. And Pemberton the butler, who comes with the house. Like a ghost, but paid."',
    }[clamp(loc.home.tier, 0, 4)];
  }

  async function buy(loc) {
    const p = st.p, price = loc.home.price;
    if (p.money + p.bank < price) { game.ui.toast('Randy laughs at your bank statement. Then shows it to his coworkers.', 'bad'); return false; }
    if (!(await game.ui.confirm(`Buy ${loc.name} for ${fmtMoney(price)}? (Cash first, then bank.)`, { title: 'Sign here, here, and in blood here' }))) return false;
    const fromCash = Math.min(p.money, price);
    st.addMoney(-fromCash, 'home');
    p.bank -= price - fromCash;
    if (!p.ownedHomes.includes(loc.id)) p.ownedHomes.push(loc.id);
    delete p.sys.rent[loc.id];
    if (loc.home.tier >= 2) st.setFlag('garage_' + loc.id, true);
    st.changed('home');
    game.bus.emit('home:bought', { id: loc.id });
    game.ui.bigText('HOMEOWNER', loc.name, 2600);
    if (await game.ui.confirm(`Make ${loc.name} your main home (respawn point)?`)) { p.home = loc.id; st.changed('home'); }
    return true;
  }

  function sell(loc) {
    const p = st.p;
    game.ui.confirm(`Sell ${loc.name} for ${fmtMoney(Math.round(loc.home.price * 0.7))}? Your stash here moves to your pockets.`).then((ok) => {
      if (!ok) return;
      p.ownedHomes = p.ownedHomes.filter((x) => x !== loc.id);
      const s = p.stash[loc.id];
      if (s) {
        st.addMoney(s.money || 0, 'stash');
        for (const [k, v] of Object.entries(s.items)) st.addItem(k, v);
        for (const [k, v] of Object.entries(s.drugs)) st.addDrug(k, v);
        delete p.stash[loc.id];
      }
      if (p.home === loc.id) p.home = 'roach_motel';
      st.addMoney(Math.round(loc.home.price * 0.7), 'home sale');
      st.changed('home');
      game.ui.toast('Sold. Randy takes a commission so big it has its own commission.', 'money');
    });
  }

  function payRent(loc, days) {
    const p = st.p;
    const cost = rentPerDay(loc) * days;
    if (!st.spend(cost, 'rent')) return false;
    const cur = Math.max(p.sys.rent[loc.id] ?? 0, game.time.day - 1);
    p.sys.rent[loc.id] = cur + days;
    st.changed('home');
    game.ui.toast(`Rent paid through day ${p.sys.rent[loc.id]}.`, 'good');
    return true;
  }

  // ---------------- sleep ----------------
  async function sleep(loc, minutes, morning = false) {
    const p = st.p;
    const h = loc.home;
    const restore = h.energyRestore ?? 0.8;
    const frac = Math.min(1, minutes / 480);
    const wasDrunk = p.sys.drunk;
    game.time.advance(minutes);
    const before = p.energy;
    st.addStat('energy', Math.round(p.maxEnergy * restore * frac));
    const energyGain = Math.max(0, Math.round(p.energy - before)); // what you actually got (a full tank gains nothing)
    st.heal(Math.round(p.maxHp * (0.25 + 0.1 * h.tier) * frac));
    if (minutes >= 360) { game.sysFx.sober(); if (wasDrunk >= 3) game.sysFx.add({ id: 'hungover', min: 180 }); }
    const notes = [];
    // tier perks
    if (minutes >= 360) {
      if (h.tier >= 3) { st.addStat('cha', 0.3, 'luxury'); notes.push('You wake up on Egyptian cotton feeling like a person of importance. (+Charm)'); }
      if (h.tier >= 4) { st.addStat('energy', 25); notes.push(pick(['Pemberton serves breakfast in bed and says "Another day of disappointing your parents, I presume?"', 'Pemberton has ironed your underwear. You didn\'t ask. You\'re not mad.'])); }
      // motel roaches
      if (h.tier === 0 && chance(0.25)) notes.push(roaches(loc));
      if (h.tier === 0 && chance(0.2)) notes.push(pick(['The neighbors had a screaming match until 4AM. You learned three new swears.', 'Something crawled into your ear. It crawled back out. You\'re fine. You\'re FINE.', 'The bed springs stabbed you all night. Acupuncture, basically.']));
    }
    game.bus.emit('home:slept', { id: loc.id, minutes });
    const woke = minutes >= 360 || morning; // "sleep until morning" is a night's sleep even if it was only a few hours
    const dream = woke ? pick([
      'You dream you\'re being chased by a giant Pizza Butt hat.',
      'You dream about money. It\'s the only thing you dream about now.',
      'You dream your teeth fall out and a dentist charges you for it.',
      'No dreams. Just the cold, black void. Refreshing.',
      'You dream you\'re CEO of Grimco. You fire everyone. It feels wonderful.',
    ]) : 'A quick power nap. You drool on yourself efficiently.';
    await say(game, woke ? 'Good morning, sunshine' : 'Nap time', `${dream}<br><br>+${energyGain} energy. It's now ${game.time.label()}.${notes.length ? '<br><br>' + notes.join('<br>') : ''}`);
    if (minutes >= 360) game.sysNews?.announce?.(true);
  }

  function roaches(loc) {
    if (game.lifestyle?.homeUp?.(loc.id, 'safe')) return 'Roaches tried the floor safe. The floor safe won. They settle for licking your toothbrush.';
    const s = stash(loc.id);
    const p = st.p;
    const foods = Object.keys(s.items).filter((k) => ITEMS[k]?.cat === 'food');
    if (foods.length) {
      const k = pick(foods);
      s.items[k]--; if (s.items[k] <= 0) delete s.items[k];
      return `Gary the roach and his family ate your ${ITEMS[k].name} out of the stash. They left a thank-you note. In poop.`;
    }
    const invFood = Object.keys(p.inventory).filter((k) => ITEMS[k]?.cat === 'food');
    if (invFood.length) {
      const k = pick(invFood);
      st.removeItem(k, 1);
      return `Roaches carried off your ${ITEMS[k].name}. You watched them do it. You were too tired to stop them.`;
    }
    if (s.money > 0 && chance(0.4)) {
      const lost = Math.min(s.money, randInt(5, 40));
      s.money -= lost;
      return `The roaches got into your cash stash and shredded ${fmtMoney(lost)} into a nest. It's honestly a nice nest.`;
    }
    return 'Roaches held a rave on your face. You didn\'t lose anything except your will to live.';
  }

  // ---------------- shower / TV ----------------
  async function shower(loc) {
    const t = today(game);
    game.time.advance(15);
    game.sysFx.add({ id: 'fresh', min: 600, temp: { cha: 2 } });
    game.sysFx.remove('hungover');
    if (!t.shower) { t.shower = true; train(game, 'cha', 0.4, 'shower'); }
    const tier = loc.home.tier;
    const line = tier === 0
      ? pick(['The water comes out brown, then yellow, then clear, then brown again. You feel... cleaner? Relatively.', 'The shower has two settings: lava and glacier. You alternate screaming.'])
      : tier >= 3 ? pick(['Twelve shower heads massage you from every angle. You cry a little. Good tears.', 'Rainfall shower, eucalyptus steam. You emerge reborn, like a beautiful, sleazy phoenix.'])
        : pick(['You scrub off three days of city grime. The drain gurgles in protest.', 'You sing in the shower. A neighbor bangs on the wall. You sing louder.']);
    await say(game, 'Shower', `${line}<br><br><span class="ui-good">Fresh: +2 Charm for 10 hours.</span>`);
  }

  async function watchTv(loc) {
    const [ch, txt] = pick(TV);
    game.time.advance(60);
    const theater = game.lifestyle?.homeUp?.(loc?.id ?? st.p.home, 'theater') || false;
    st.addStat('energy', theater ? 12 : 4);
    let note = '';
    if ((ch === 'Nature Documentary' || theater) && chance(theater ? 0.5 : 0.6)) { train(game, 'int', theater ? 0.5 : 0.3, 'tv'); note = theater ? 'On a screen this big, even the documentaries stick. +INT' : 'You actually learned something.'; }
    else if (chance(0.25)) { st.addStat('int', -0.1); note = 'You feel your brain cells packing their bags.'; }
    await say(game, `📺 ${ch}`, `${txt}${note ? `<br><br><em>${note}</em>` : ''}`);
  }

  // ---------------- stash ----------------
  function openStash(loc) {
    return new Promise((resolve) => {
      const p = st.p;
      const s = stash(loc.id);
      const cap = STASH_CAP[clamp(loc.home.tier, 0, 4)] * (game.lifestyle?.homeUp?.(loc.id, 'safe') ? 2 : 1);
      const wrap = document.createElement('div');
      const entry = game.ui.openPanel({ title: `Stash — ${loc.name}`, body: wrap, width: 760, onClose: resolve });
      const render = () => {
        const used = stashUnits(s);
        const row = (kind, id, qty, where) => {
          const name = kind === 'drug' ? DRUGS[id]?.name : game.items.name(id);
          return `<tr><td>${name}</td><td class="num">${qty}</td><td class="num" style="white-space:nowrap">
            <button class="ui-btn" data-mv="${where}" data-k="${kind}" data-id="${id}" data-n="1">1</button>
            <button class="ui-btn" data-mv="${where}" data-k="${kind}" data-id="${id}" data-n="all">All</button></td></tr>`;
        };
        let pocket = '', stashed = '';
        for (const [id, q] of Object.entries(p.inventory)) if (q > 0 && !String(id).startsWith('q_')) pocket += row('item', id, q, 'in');
        for (const [id, q] of Object.entries(p.drugs)) if (q > 0) pocket += row('drug', id, q, 'in');
        for (const [id, q] of Object.entries(s.items)) if (q > 0) stashed += row('item', id, q, 'out');
        for (const [id, q] of Object.entries(s.drugs)) if (q > 0) stashed += row('drug', id, q, 'out');
        wrap.innerHTML = `${cashLine(game)}
          <div class="sys-hint">Stuff in the stash is safe from arrests, muggings and blackouts${loc.home.tier === 0 ? ' (but NOT from roaches)' : ''}. Space: ${used} / ${cap === Infinity ? '∞' : cap} units.</div>
          <div class="ui-row" style="margin:8px 0"><b>Cash in stash: ${fmtMoney(s.money)}</b>
            <button class="ui-btn" data-cash="in">Stash cash</button><button class="ui-btn" data-cash="out">Take cash</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><div class="sys-sect">On you → stash</div><table class="sys-table">${pocket || '<tr><td class="ui-muted">Empty pockets.</td></tr>'}</table></div>
            <div><div class="sys-sect">Stash → you</div><table class="sys-table">${stashed || '<tr><td class="ui-muted">Nothing but a dust bunny named Kevin.</td></tr>'}</table></div>
          </div>`;
      };
      wrap.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.cash) {
          if (b.dataset.cash === 'in') {
            const n = await game.ui.promptNumber({ title: 'Stash cash', max: p.money, min: 0 });
            if (n > 0 && n <= p.money) { st.addMoney(-n, 'stash'); s.money += n; }
          } else {
            const n = await game.ui.promptNumber({ title: 'Take cash', max: s.money, min: 0 });
            if (n > 0 && n <= s.money) { s.money -= n; st.addMoney(n, 'stash'); }
          }
        } else if (b.dataset.mv) {
          const { k, id } = b.dataset;
          const into = b.dataset.mv === 'in';
          const src = into ? (k === 'drug' ? p.drugs : p.inventory) : (k === 'drug' ? s.drugs : s.items);
          let n = b.dataset.n === 'all' ? src[id] || 0 : 1;
          if (into) n = Math.min(n, cap - stashUnits(s));
          if (!into && k === 'drug') n = Math.min(n, (game.sysCapacity?.() ?? Infinity) - st.totalDrugs());
          if (n <= 0) { game.ui.toast(into ? 'Stash is full. Buy a bigger place, hoarder.' : 'Your bag is full.', 'bad'); }
          else if (into) {
            if (k === 'drug') { st.addDrug(id, -n); s.drugs[id] = (s.drugs[id] || 0) + n; } else { st.addItem(id, -n); s.items[id] = (s.items[id] || 0) + n; }
          } else {
            const tgt = k === 'drug' ? s.drugs : s.items;
            tgt[id] -= n; if (tgt[id] <= 0) delete tgt[id];
            if (k === 'drug') st.addDrug(id, n); else st.addItem(id, n);
          }
        }
        st.changed('stash');
        if (!entry.closed) render();
      });
      render();
    });
  }

  // ---------------- daily rent ----------------
  function daily() {
    const p = st.p;
    for (const [id, through] of Object.entries(p.sys.rent || {})) {
      if (through >= game.time.day) continue;
      if (owns(id)) { delete p.sys.rent[id]; continue; }
      const loc = game.locations.get(id);
      if (!loc) continue;
      // Auto-pay from the bank if possible.
      const cost = rentPerDay(loc);
      if (p.bank >= cost) {
        p.bank -= cost;
        p.sys.rent[id] = game.time.day;
        st.changed('bank');
        game.ui.toast(`Rent for ${loc.name} auto-paid from your bank (${fmtMoney(cost)}).`, 'info');
      } else {
        delete p.sys.rent[id];
        if (p.home === id) p.home = 'roach_motel';
        st.changed('home');
        game.ui.toast(`EVICTED from ${loc.name}. Randy changed the locks and kept your stash "as a deposit."`, 'bad', 5000);
        delete p.stash[id];
      }
    }
  }

  return { daily, sleep, hasAccess, owns, stash, STASH_CAP };
}
