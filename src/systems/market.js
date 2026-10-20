// The street market: fictional drug prices per district, a daily random walk, busts/shipments,
// dealer stock, buying/selling (with heat), and sampling the product (buffs + trips + addiction).
// game.market = { name(id), price(id, district), sellPrice(id, district), use(id), openDealer(loc),
//                 events(), nextEvent(), cheapest(id), DRUGS }
import { DRUGS, DRUG_ORDER, DEALERS, MARKET_EVENTS } from '../data/drugs.js';
import { DISTRICTS } from '../data/locations.js';
import { fmtMoney, pick, chance, rand, randInt, clamp } from '../core/util.js';
import { ensureState, capacity, hasCourse, playerXZ } from './common.js';
import { cashLine } from './ui-kit.js';

const DISTRICT_IDS = Object.keys(DISTRICTS);

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function installMarket(game) {
  const st = game.state;

  function m() {
    const p = st.p;
    if (!p.market || !p.market.f) p.market = freshMarket();
    return p.market;
  }

  function freshMarket() {
    const f = {};
    for (const id of DRUG_ORDER) f[id] = clamp(1 + gauss() * 0.15, 0.6, 1.5);
    const mk = { f, events: [], next: null, stock: {}, stockDay: 0, day: game.time.day };
    mk.next = rollEvent();
    return mk;
  }

  function rollEvent() {
    if (!chance(0.55)) return null;
    const kind = pick(['bust', 'bust', 'shipment', 'shipment', 'craze', 'scare']);
    const drug = pick(DRUG_ORDER);
    const district = chance(0.5) ? null : pick(DISTRICT_IDS);
    const mult = { bust: rand(2, 3.5), shipment: rand(0.28, 0.5), craze: rand(1.6, 2.3), scare: rand(0.5, 0.7) }[kind];
    const headline = pick(MARKET_EVENTS[kind]).replace('{drug}', DRUGS[drug].name.toUpperCase()).replace('{district}', district ? DISTRICTS[district].name : 'Rotwell');
    return { kind, drug, district, mult: Math.round(mult * 100) / 100, days: randInt(1, 3), headline };
  }

  function eventMult(id, district) {
    let mult = 1;
    for (const e of m().events) if (e.drug === id && (!e.district || e.district === district)) mult *= e.mult;
    return mult;
  }

  function price(id, district) {
    const d = DRUGS[id];
    if (!d) return 0;
    district = district || 'downtown';
    const mk = m();
    const f = mk.f[id] ?? 1;
    const dm = d.districts?.[district] ?? 1;
    return Math.max(1, Math.round(d.base * f * dm * eventMult(id, district)));
  }

  // What a dealer pays you (spread + perks).
  function sellPrice(id, district) {
    const p = st.p;
    let mult = 0.9;
    if (hasCourse(p, 'remedial_math')) mult += 0.05;
    if (hasCourse(p, 'chem')) mult += 0.1;
    return Math.max(1, Math.floor(price(id, district) * mult));
  }

  function restock() {
    const mk = m();
    mk.stock = {};
    for (const dist of DISTRICT_IDS) {
      const s = (mk.stock[dist] = {});
      for (const id of DRUG_ORDER) {
        const base = DRUGS[id].base;
        const smuggled = dist === 'blackwater' && base >= 900;
        if (!smuggled && chance(0.12)) { s[id] = 0; continue; }
        const scale = base < 100 ? 2.2 : base < 600 ? 1.3 : base < 2000 ? 0.8 : 0.45;
        let q = Math.round(randInt(6, 34) * scale);
        // Blackwater smugglers: the rare stuff comes in by boat (never sold out, deeper stock).
        if (smuggled) q = Math.max(4, Math.round(q * 1.8));
        for (const e of mk.events) if (e.drug === id && (!e.district || e.district === dist)) q = Math.round(q * (e.kind === 'shipment' ? 3 : e.kind === 'bust' ? 0.3 : 1));
        s[id] = q;
      }
    }
    mk.stockDay = game.time.day;
  }

  function stockOf(dist) {
    const mk = m();
    if (mk.stockDay !== game.time.day || !mk.stock[dist]) restock();
    return mk.stock[dist];
  }

  // Called once per in-game day (from index.js, before the newspaper is printed).
  function daily() {
    const mk = m();
    for (const id of DRUG_ORDER) {
      const d = DRUGS[id];
      let f = mk.f[id] ?? 1;
      f *= Math.exp(gauss() * d.vol);
      f += (1 - f) * 0.12;
      mk.f[id] = clamp(f, d.min, d.max);
    }
    mk.events = mk.events.map((e) => ({ ...e, days: e.days - 1 })).filter((e) => e.days > 0);
    mk.today = null;
    if (mk.next) {
      mk.events.push(mk.next);
      mk.today = mk.next;
    }
    mk.next = rollEvent();
    mk.day = game.time.day;
    restock();
  }

  function cheapest(id) {
    let best = null;
    for (const dist of DISTRICT_IDS) {
      const pr = price(id, dist);
      if (!best || pr < best.price) best = { district: dist, price: pr };
    }
    return best;
  }
  function priciest(id) {
    let best = null;
    for (const dist of DISTRICT_IDS) {
      const pr = price(id, dist);
      if (!best || pr > best.price) best = { district: dist, price: pr };
    }
    return best;
  }

  // A true-ish rumor about prices (bars, diner, newspaper). accuracy 0..1
  function rumor(accuracy = 0.85) {
    const id = pick(DRUG_ORDER);
    const name = DRUGS[id].name;
    const ev = m().events.find((e) => chance(0.5) && e);
    if (ev && chance(0.4)) {
      const where = ev.district ? DISTRICTS[ev.district].name : 'all over town';
      return ev.mult > 1
        ? `Word is ${DRUGS[ev.drug].name} is scarce ${where} right now. Folks payin' through the nose.`
        : `Somebody flooded ${where} with ${DRUGS[ev.drug].name}. Cheap as dirt for a day or two.`;
    }
    if (!chance(accuracy)) {
      return pick([
        `Heard ${name} is going for a fortune in ${DISTRICTS[pick(DISTRICT_IDS)].name}. Or was it a fortune cookie? I dunno.`,
        `My cousin says ${name} is about to crash. My cousin also says birds aren't real.`,
      ]);
    }
    const lo = cheapest(id), hi = priciest(id);
    return pick([
      `${name}? Cheapest in ${DISTRICTS[lo.district].name}, about ${fmtMoney(lo.price)}. Hilltop snobs... nah, ${DISTRICTS[hi.district].name} pays best, like ${fmtMoney(hi.price)}.`,
      `If you're movin' ${name}, buy in ${DISTRICTS[lo.district].name} and sell in ${DISTRICTS[hi.district].name}. You didn't hear it from me. You heard it from my mouth, but not from ME.`,
    ]);
  }

  // ---------------- using the product ----------------
  function use(id) {
    const d = DRUGS[id];
    if (!d) return false;
    if (st.drugCount(id) < 1) { game.ui.toast("You're out. The baggie is just dust and lies.", 'bad'); return false; }
    st.addDrug(id, -1);
    const u = d.use;
    const fx = game.sysFx;
    const active = st.p.effects.filter((e) => e.id.startsWith('drug_') && e.id !== 'drug_' + id).length;
    fx.add({ id: 'drug_' + id, label: d.name, kind: 'drug', min: u.min, temp: u.temp, speed: u.speed ?? 1, trip: u.trip });
    if (u.energy) st.addStat('energy', u.energy);
    if (u.hp > 0) st.heal(u.hp);
    if (u.hp < 0) st.damage(-u.hp, 'drugs');
    if (u.karma) st.addStat('karma', u.karma);
    const a = st.p.sys.addiction;
    fx.addAddiction(u.addict * (1 + a.level / 120));
    fx.markUse();
    game.ui.toast(u.text, 'info', 4200);
    if (active >= 2 && chance(0.35 + active * 0.1)) {
      setTimeout(() => {
        st.damage(25 + active * 10, 'overdose');
        game.ui.bigText('OVERDOSE', 'You see God. She looks disappointed. She sends you back.', 3000);
        game.cameraRig?.shake?.(0.8, 1.2);
      }, 600);
    }
    game.bus.emit('drug:used', { drugId: id });
    return true;
  }

  // ---------------- dealer ----------------
  async function openDealer(loc) {
    ensureState(st.p);
    const dist = loc?.district || game.world?.districtAt?.(playerXZ(game).x, playerXZ(game).z) || 'downtown';
    const base = DEALERS[dist] || DEALERS.downtown;
    const dealer = { ...base, name: loc?.npc?.name || base.name };
    const name = loc?.name || dealer.name;
    try { if (loc?.npc && game.npcs?.say) game.npcs.say(loc.npc, pick(['Psst. Over here.', 'Keep it quiet.', 'Cash only, chief.']), { ttl: 2 }); } catch (e) { /* cosmetic */ }
    const p = st.p;
    if (p.job?.id === 'cop' && chance(0.5)) game.ui.toast(`${dealer.name} squints at you. "You smell like bacon, man. ...Eh, money's money."`, 'info', 3500);
    const wrap = document.createElement('div');
    const entry = game.ui.openPanel({ title: `${name} — ${DISTRICTS[dist]?.name ?? dist}`, body: wrap, width: 780 });
    let msg = pick(dealer.greet).replace(/\{name\}/g, dealer.name);
    const render = () => {
      const stock = stockOf(dist);
      const total = st.totalDrugs();
      let html = `<div class="ui-speaker">${dealer.name}</div><div class="sys-intro">${msg}</div>${cashLine(game, `Bag ${total}/${capacity(p)}`)}
        <table class="sys-table"><tr><th>Product</th><th class="num">Buy</th><th class="num">Sell</th><th class="num">Stock</th><th class="num">You have</th><th></th></tr>`;
      for (const id of DRUG_ORDER) {
        const d = DRUGS[id];
        const pr = price(id, dist), sp = sellPrice(id, dist);
        const ev = m().events.find((e) => e.drug === id && (!e.district || e.district === dist));
        const tag = ev ? (ev.mult > 1 ? ' <span class="sys-up" title="Prices up">▲HOT</span>' : ' <span class="sys-down" title="Prices down">▼GLUT</span>') : '';
        const have = p.drugs[id] || 0;
        const canBuy = stock[id] > 0 && p.money >= pr && total < capacity(p);
        html += `<tr><td><b style="color:${d.color}">${d.name}</b>${tag}<div class="ui-muted" style="font-size:13px">${d.desc}</div></td>
          <td class="num">${fmtMoney(pr)}</td><td class="num">${fmtMoney(sp)}</td><td class="num">${stock[id] || '<span class="ui-bad">out</span>'}</td><td class="num">${have || ''}</td>
          <td class="num" style="white-space:nowrap"><button class="ui-btn primary" data-buy="${id}" ${canBuy ? '' : 'disabled'}>Buy</button>
          <button class="ui-btn" data-sell="${id}" ${have ? '' : 'disabled'}>Sell</button></td></tr>`;
      }
      html += `</table><div class="ui-row" style="margin-top:10px"><button class="ui-btn" data-rumor="1">Ask about the word on the street</button>
        <button class="ui-btn" data-sellall="1" ${total ? '' : 'disabled'}>Sell everything</button><span style="flex:1"></span>
        <span class="sys-hint">Dealing raises heat — more with cops nearby.</span></div>`;
      wrap.innerHTML = html;
    };
    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.rumor) {
        msg = `"${rumor(0.9)}"`;
      } else if (b.dataset.buy) {
        const id = b.dataset.buy;
        const pr = price(id, dist);
        const stock = stockOf(dist);
        const room = capacity(p) - st.totalDrugs();
        const max = Math.min(stock[id], Math.floor(p.money / pr), room);
        if (max <= 0) { msg = room <= 0 ? '"Your bag\'s full, genius. Get a bigger bag."' : '"Come back when you got money, ya bum."'; render(); return; }
        const n = await game.ui.promptNumber({ title: `Buy ${DRUGS[id].name}`, text: `${fmtMoney(pr)} each. Room in bag: ${room}. In stock: ${stock[id]}.`, max, min: 1, initial: max });
        if (!n || entry.closed) { if (!entry.closed) render(); return; }
        if (!st.spend(n * pr, 'drugs')) { render(); return; }
        st.addDrug(id, n);
        stock[id] -= n;
        msg = pick([`"Pleasure doin' business."`, `"Don't smoke it all in one place."`, `"You didn't get it from me. You got it from a guy who looks like me."`, `"Tell your friends. Actually, don't."`]);
        game.bus.emit('drug:bought', { drugId: id, qty: n, price: pr, district: dist });
      } else if (b.dataset.sell) {
        const id = b.dataset.sell;
        const have = p.drugs[id] || 0;
        const n = await game.ui.promptNumber({ title: `Sell ${DRUGS[id].name}`, text: `${dealer.name} pays ${fmtMoney(sellPrice(id, dist))} each.`, max: have, min: 1, initial: have });
        if (!n || entry.closed) { if (!entry.closed) render(); return; }
        doSell(id, n, dist);
        msg = pick([`"Nice. This'll sell like hotcakes. Drug hotcakes."`, `"Mmm. Smells legit. Smells like a felony."`, `"Here's your cash. Count it later, cops are everywhere."`]);
      } else if (b.dataset.sellall) {
        for (const id of DRUG_ORDER) if (p.drugs[id]) doSell(id, p.drugs[id], dist);
        msg = '"Whoa, clearance sale! You going straight or something?"';
      }
      if (!entry.closed) render();
    });
    render();
  }

  function doSell(id, n, dist) {
    const p = st.p;
    n = Math.min(n, p.drugs[id] || 0);
    if (n <= 0) return;
    const sp = sellPrice(id, dist);
    const total = sp * n;
    st.addDrug(id, -n);
    st.addMoney(total, 'drugs');
    p.totals.drugsSold = (p.totals.drugsSold || 0) + n;
    game.bus.emit('drug:sold', { drugId: id, qty: n, price: sp, district: dist });
    // heat + karma
    let heat = 0.06 + Math.min(0.35, n * 0.006 + total / 40000);
    const pos = playerXZ(game);
    const cops = (game.npcs?.near?.(pos.x, pos.z, 30) || []).filter((x) => x && !x.dead && x.kind === 'cop');
    if (cops.length) { heat += 0.6; game.ui.toast('A cop was watching that. Smooth move, Einstein.', 'bad', 3000); }
    if (game.time.isNight) heat *= 0.75;
    p.sys.dealHeat = (p.sys.dealHeat || 0) + heat;
    while (p.sys.dealHeat >= 1) {
      p.sys.dealHeat -= 1;
      st.addHeat(1);
      game.ui.toast('Word gets around. The cops are sniffing. (+1 heat)', 'bad', 3000);
    }
    if (chance(0.3) || total > 2000) st.addStat('karma', -1);
    // dirty cop?
    if (p.job?.id === 'cop' && chance(0.12)) {
      setTimeout(() => {
        game.jobs?.fire?.('Internal Affairs caught you dealing on the side. You\'re fired. They keep your badge AND your dignity.');
        st.addHeat(1);
      }, 300);
    }
  }

  const market = {
    DRUGS, name: (id) => DRUGS[id]?.name ?? id, price, sellPrice, use, openDealer, daily, rumor, cheapest, priciest,
    events: () => m().events, nextEvent: () => m().next, todayEvent: () => m().today, state: m,
  };
  game.market = market;
  game.locations.register('dealer', (g, loc) => openDealer(loc));
  game.bus.on('state:reset', () => { ensureState(st.p); m(); });
  return market;
}
