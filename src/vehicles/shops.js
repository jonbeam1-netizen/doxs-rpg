import { CARS, CAR_COLORS, UPGRADES, carScale } from '../data/cars.js';
import { fmtMoney, pick, esc } from '../core/util.js';
import { drawCarProfile } from './models.js';

// Lemon Lot Motors (car_dealer) and Chop Chop Customs (chop_shop).

const HAL = 'Honest Hal Grubbs';
const HAL_LINES = [
  'Welcome to Lemon Lot! Every car here was driven by a little old lady. To the pawn shop. Repeatedly.',
  "Smell that? New car smell. I spray it on myself. It's mostly body spray and lies.",
  "Financing? Sure! We take cash, more cash, or a kidney. The left one. The right one's spoken for.",
  "You look like a guy who wants something long, fast and expensive. I'm talking about the limo, you pervert.",
  'Test drive? My insurance agent cries every time someone says those words.',
  "Every car comes with a warranty. The warranty is me saying 'it'll be fine' really confidently.",
  "Don't kick the tires. Last guy did that and the whole car apologized and fell over.",
  'I got a cousin who does detailing. And alibis. Mostly alibis.',
];
const HAL_BUY = [
  "Pleasure doing business! No refunds, no returns, no eye contact.",
  'She\'s all yours. If it makes a noise, turn up the radio. That\'s what I do.',
  'Sold! I\'d shake your hand but I just used mine for something.',
];
const MAMA = 'Mama Chop';
const MAMA_LINES = [
  "Where'd you get it? Don't tell me. I'm allergic to subpoenas.",
  'Pull it in, sugar. I can make it faster, tougher, or legally somebody else\'s.',
  "I've chopped cars, bikes, a hot dog cart and one ex-husband. Don't test me.",
  'Cash only. Cards leave a trail, and I only like trails of grease.',
];

const stat = (label, frac, txt, col = '#b0672a') => `<div style="display:flex;align-items:center;gap:8px;font-size:15px;margin:2px 0">
  <span style="width:96px;color:#a9a291">${label}</span>
  <div style="flex:1;height:9px;background:#1d1915;border:1px solid #000"><i style="display:block;height:100%;width:${Math.round(Math.min(1, frac) * 100)}%;background:${col}"></i></div>
  <span style="width:70px;text-align:right">${txt}</span></div>`;

function statsHtml(def, upg = {}) {
  return stat('Top speed', def.topSpeed / 190, `${Math.round(def.topSpeed * (1 + (upg.engine || 0) * 0.07))} mph`)
    + stat('Acceleration', def.accel / 10, `${def.accel}/10${upg.engine ? ` +${upg.engine}` : ''}`)
    + stat('Handling', def.handling / 10, `${def.handling}/10${upg.handling ? ` +${upg.handling}` : ''}`)
    + stat('Toughness', def.hp / 300, `${Math.round(def.hp * (1 + (upg.armor || 0) * 0.35))} hp`, '#7a8a5a');
}

function swatches(selected, onPick) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0';
  for (const c of CAR_COLORS) {
    const b = document.createElement('button');
    b.title = c.name;
    b.style.cssText = `width:30px;height:30px;border-radius:3px;cursor:pointer;background:${c.hex};border:2px solid ${c.hex === selected ? '#e6dfcf' : '#000'};box-shadow:${c.hex === selected ? '0 0 0 2px #b0672a' : 'none'}`;
    b.addEventListener('click', () => onPick(c));
    wrap.appendChild(b);
  }
  return wrap;
}

function upgradesValue(e) {
  const def = CARS[e.carId];
  const u = e.upgrades || {};
  let v = 0;
  for (const k of Object.keys(UPGRADES)) for (let t = 0; t < (u[k] || 0); t++) v += UPGRADES[k].base[t] * carScale(def);
  if (u.nitro) v += 3000;
  return v;
}

export function sellValue(e) {
  const def = CARS[e.carId];
  if (!def) return 0;
  const hp = e.hp == null ? 1 : Math.max(0, e.hp) / (def.hp * (1 + (e.upgrades?.armor || 0) * 0.35));
  return Math.round(def.price * (0.4 + 0.1 * Math.min(1, hp)) + upgradesValue(e) * 0.3);
}

function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d; }

export function installShops(vm) {
  const g = vm.game;
  g.locations.register('car_dealer', (game, loc) => openDealer(vm, loc));
  g.locations.register('chop_shop', (game, loc) => openChop(vm, loc));
}

// ---------------------------------------------------------------- dealer
function openDealer(vm, loc) {
  const g = vm.game;
  const p = g.state.p;
  const forSale = Object.entries(CARS).filter(([, d]) => !d.secret).sort((a, b) => a[1].price - b[1].price);
  let tab = 'show', sel = forSale[0][0], color = CARS[sel].color, line = pick(HAL_LINES);
  const root = document.createElement('div');
  const panel = g.ui.openPanel({ title: loc.name || 'Lemon Lot Motors', body: root, width: 900 });

  const render = () => {
    root.innerHTML = '';
    root.appendChild(el(`<div class="ui-speaker">${HAL}</div><div class="ui-text" style="font-size:17px">"${line}"</div>`));
    const tabs = document.createElement('div');
    tabs.className = 'ui-row';
    tabs.style.marginBottom = '10px';
    const dead = p.cars.filter((e) => e.destroyed && !e.stolen).length;
    for (const [id, label] of [['show', 'Showroom'], ['sell', 'Sell your ride'], ['impound', `Impound${dead ? ` (${dead})` : ''}`]]) {
      const b = document.createElement('button');
      b.className = 'ui-btn' + (tab === id ? ' primary' : '');
      b.textContent = label;
      b.addEventListener('click', () => { tab = id; render(); });
      tabs.appendChild(b);
    }
    root.appendChild(tabs);
    if (tab === 'show') renderShow();
    else if (tab === 'sell') renderSell();
    else renderImpound();
  };

  const renderShow = () => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;align-items:flex-start';
    const list = document.createElement('div');
    list.style.cssText = 'width:250px;display:flex;flex-direction:column;gap:4px;max-height:430px;overflow-y:auto';
    for (const [id, d] of forSale) {
      const b = document.createElement('button');
      b.className = 'ui-opt';
      b.style.padding = '5px 8px';
      if (id === sel) { b.style.borderColor = '#b0672a'; b.style.background = '#2a231b'; }
      b.innerHTML = `<span>${d.name}</span><small>${fmtMoney(d.price)}</small>`;
      b.addEventListener('click', () => { sel = id; color = d.color; render(); });
      list.appendChild(b);
    }
    row.appendChild(list);
    const det = document.createElement('div');
    det.style.cssText = 'flex:1;min-width:0';
    const d = CARS[sel];
    const cv = document.createElement('canvas');
    cv.width = 520; cv.height = 170;
    cv.style.cssText = 'width:100%;border:1px solid #2e2821;display:block';
    drawCarProfile(cv, sel, color);
    det.appendChild(cv);
    det.appendChild(el(`<h3 style="margin:8px 0 2px;font-family:var(--font-title);font-weight:400">${d.name}</h3>
      <div class="ui-muted" style="font-size:16px;margin-bottom:6px">${d.desc}</div>
      <div class="ui-muted" style="font-size:14px">${d.kind === 'bike' ? 'Bicycle' : d.kind === 'moto' ? 'Motorcycle' : d.kind === 'truck' ? 'Truck' : 'Car'} · seats ${d.seats}</div>
      ${statsHtml(d)}`));
    const cname = CAR_COLORS.find((c) => c.hex === color)?.name || 'Factory Grime';
    det.appendChild(el(`<div style="margin-top:6px;font-size:15px">Paint: <b>${cname}</b></div>`));
    det.appendChild(swatches(color, (c) => { color = c.hex; render(); }));
    const buyRow = document.createElement('div');
    buyRow.className = 'ui-row';
    const can = g.state.canAfford(d.price);
    buyRow.innerHTML = `<span style="font-size:26px;font-weight:800;color:${can ? '#7fbf4d' : '#e2402f'}">${fmtMoney(d.price)}</span><span style="flex:1"></span>`;
    const buy = document.createElement('button');
    buy.className = 'ui-btn primary';
    buy.textContent = can ? 'Sign here (and here, and here)' : 'Too broke';
    buy.disabled = !can;
    buy.addEventListener('click', () => {
      if (!g.state.spend(d.price, 'car')) return;
      const spot = vm.findSpot(loc.doorX ?? loc.x, loc.doorZ ?? loc.z, sel, 6, 34);
      const e = vm.addOwned(sel, color, spot);
      g.bus.emit('car:bought', { carId: sel, uid: e.uid, price: d.price });
      panel.close();
      g.ui.bigText('NEW WHEELS', `${d.name} is parked out front. ${pick(HAL_BUY)}`, 3600);
    });
    buyRow.appendChild(buy);
    det.appendChild(buyRow);
    row.appendChild(det);
    root.appendChild(row);
  };

  const renderSell = () => {
    const mine = p.cars.filter((e) => !e.destroyed && CARS[e.carId]);
    if (!mine.length) { root.appendChild(el('<div class="ui-muted">You own nothing with wheels. Not even a shopping cart.</div>')); return; }
    const t = document.createElement('table');
    t.className = 'ui-table';
    for (const e of mine) {
      const d = CARS[e.carId];
      const tr = document.createElement('tr');
      const hp = e.hp == null ? 100 : Math.round(100 * e.hp / (d.hp * (1 + (e.upgrades?.armor || 0) * 0.35)));
      tr.innerHTML = `<td><span style="display:inline-block;width:12px;height:12px;background:${esc(e.color)};margin-right:6px;border:1px solid #000"></span>${d.name}</td><td class="ui-muted">${hp}% body</td>`;
      const td = document.createElement('td');
      td.style.textAlign = 'right';
      if (e.stolen) {
        td.innerHTML = '<span class="ui-bad" style="font-size:15px">"Is that VIN scratched off with a KEY? Get it off my lot."</span>';
      } else if (vm.current && vm.current.uid === e.uid) {
        td.innerHTML = '<span class="ui-muted">You\'re sitting in it.</span>';
      } else {
        const v = sellValue(e);
        const b = document.createElement('button');
        b.className = 'ui-btn';
        b.textContent = `Sell for ${fmtMoney(v)}`;
        b.addEventListener('click', async () => {
          if (!(await g.ui.confirm(`Sell your ${d.name} to Hal for ${fmtMoney(v)}? He'll resell it for triple by lunch.`))) return;
          vm.removeOwned(e.uid);
          g.state.addMoney(v, 'car sale');
          g.bus.emit('car:sold', { carId: e.carId, uid: e.uid, price: v });
          line = 'Pleasure! I\'ll tell the next sucker it was owned by a priest.';
          render();
        });
        td.appendChild(b);
      }
      tr.appendChild(td);
      t.appendChild(tr);
    }
    root.appendChild(t);
  };

  const renderImpound = () => {
    const dead = p.cars.filter((e) => e.destroyed && !e.stolen && CARS[e.carId]);
    root.appendChild(el('<div class="ui-muted" style="margin-bottom:8px">Blew it up? Hal\'s guys scrape it off the road, hammer it straight and slap on a new coat of mystery. Fee applies.</div>'));
    if (!dead.length) { root.appendChild(el('<div class="ui-muted">Nothing in the impound. Your cars are alive, for now.</div>')); return; }
    for (const e of dead) {
      const d = CARS[e.carId];
      const fee = Math.max(250, Math.round(d.price * 0.12));
      const row = document.createElement('div');
      row.className = 'ui-row ui-card';
      row.style.marginBottom = '6px';
      row.innerHTML = `<span style="flex:1">${d.name} <span class="ui-muted">— crispy</span></span>`;
      const b = document.createElement('button');
      b.className = 'ui-btn primary';
      b.textContent = `Recover (${fmtMoney(fee)})`;
      b.disabled = !g.state.canAfford(fee);
      b.addEventListener('click', () => {
        if (!g.state.spend(fee, 'impound')) return;
        const spot = vm.findSpot(loc.doorX ?? loc.x, loc.doorZ ?? loc.z, e.carId, 6, 34);
        e.destroyed = false; e.hp = null; e.x = spot.x; e.z = spot.z; e.rot = spot.rot;
        vm.spawnOwned(e.uid);
        g.state.changed('cars');
        g.ui.toast(`Your ${d.name} is back from the dead. It's parked out front, smelling of smoke.`, 'good');
        line = 'Good as new! Well, good as used. Good as "drivable". Mostly.';
        render();
      });
      row.appendChild(b);
      root.appendChild(row);
    }
  };

  render();
}

// ---------------------------------------------------------------- chop shop
function openChop(vm, loc) {
  const g = vm.game;
  const dx = loc.doorX ?? loc.x, dz = loc.doorZ ?? loc.z;
  const here = () => vm.cars.filter((c) => c.owner === 'player' && c.uid && !c.dead && !c.removed && Math.hypot(c.x - dx, c.z - dz) < 45);
  let cars = here();
  if (!cars.length) {
    g.ui.dialog({
      title: loc.name || 'Chop Chop Customs', speaker: MAMA,
      text: `"Bring me a car, sugar. I can't paint your personality." *She flicks a cigarette at you.*\n\n(Park a car you own — or "own" — near the garage door.)`,
    });
    return;
  }
  let selUid = cars[0].uid, line = pick(MAMA_LINES);
  const root = document.createElement('div');
  const panel = g.ui.openPanel({ title: loc.name || 'Chop Chop Customs', body: root, width: 760 });

  const render = () => {
    cars = here();
    const car = cars.find((c) => c.uid === selUid) || cars[0];
    root.innerHTML = '';
    if (!car) { panel.close(); return; }
    selUid = car.uid;
    const e = vm.entry(car.uid);
    const d = car.def;
    root.appendChild(el(`<div class="ui-speaker">${MAMA}</div><div class="ui-text" style="font-size:17px">"${line}"</div>`));
    if (cars.length > 1) {
      const r = document.createElement('div');
      r.className = 'ui-row';
      r.style.marginBottom = '8px';
      for (const c of cars) {
        const b = document.createElement('button');
        b.className = 'ui-btn' + (c === car ? ' primary' : '');
        b.textContent = c.def.name + (c.stolen ? ' (hot)' : '');
        b.addEventListener('click', () => { selUid = c.uid; render(); });
        r.appendChild(b);
      }
      root.appendChild(r);
    }
    const scale = carScale(d);
    const hpFrac = car.hp / car.maxHp;
    root.appendChild(el(`<div class="ui-card" style="margin-bottom:8px"><b>${d.name}</b>${car.stolen ? ' <span class="ui-bad">STOLEN</span>' : ''}
      <span class="ui-muted"> · body ${Math.round(hpFrac * 100)}%</span>${statsHtml(d, car.upgrades)}</div>`));

    const btn = (label, cost, onBuy, disabled = false, hint = '') => {
      const b = document.createElement('button');
      b.className = 'ui-opt';
      b.innerHTML = `<span>${label}</span><small>${cost != null ? fmtMoney(cost) : ''}${hint ? ' · ' + hint : ''}</small>`;
      if (disabled || (cost != null && !g.state.canAfford(cost))) b.classList.add('disabled');
      b.addEventListener('click', () => {
        if (b.classList.contains('disabled')) return;
        if (cost != null && !g.state.spend(cost, 'chop shop')) return;
        onBuy();
        vm.syncEntry(car, e);
        g.state.changed('cars');
        render();
      });
      return b;
    };
    const section = (t) => root.appendChild(el(`<div class="ui-section">${t}</div>`));
    const opts = document.createElement('div');
    opts.className = 'ui-opts';

    if (car.stolen) {
      section('No questions asked');
      const box = document.createElement('div');
      box.className = 'ui-opts';
      const seed = [...car.uid].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 100 / 100;
      const fence = Math.round(d.price * (0.35 + seed * 0.15) * (0.5 + 0.5 * hpFrac));
      const b = document.createElement('button');
      b.className = 'ui-opt';
      b.innerHTML = `<span>Fence it — Mama pays cash, the car "never existed"</span><small class="ui-good">+${fmtMoney(fence)}</small>`;
      b.addEventListener('click', async () => {
        if (!(await g.ui.confirm(`Sell the stolen ${d.name} to Mama Chop for ${fmtMoney(fence)}?`))) return;
        vm.removeOwned(car.uid);
        g.state.addMoney(fence, 'chop shop');
        g.bus.emit('car:chopped', { carId: car.carId, price: fence });
        g.ui.toast(`Mama's boys turn the ${d.name} into parts in four minutes flat. <b>+${fmtMoney(fence)}</b>`, 'money', 3500);
        line = 'Pleasure, sugar. Bring me more. Bring me a limo. I got a guy in Belarus.';
        render();
      });
      box.appendChild(b);
      const vin = Math.round(d.price * 0.2 + 200);
      box.appendChild(btn('Clean the VIN — make it legally yours', vin, () => {
        car.stolen = false; e.stolen = false;
        g.ui.toast(`New VIN, new papers, new life. The ${d.name} is officially yours.`, 'good');
        line = 'Congratulations, it was always yours. That\'s what the paperwork says, anyway.';
      }));
      root.appendChild(box);
    }

    section('Body & paint');
    const repairCost = Math.round((1 - hpFrac) * Math.max(250, d.price * 0.15));
    opts.appendChild(btn('Bang out the dents (full repair)', hpFrac >= 0.999 ? null : Math.max(25, repairCost), () => {
      car.repair();
      line = 'Fixed. That smell? That\'s Bondo and hope.';
    }, hpFrac >= 0.999, hpFrac >= 0.999 ? 'already pristine-ish' : ''));
    root.appendChild(opts);
    const paintCost = Math.round(150 + d.price * 0.01);
    root.appendChild(el(`<div style="font-size:15px;margin-top:6px">Paint job: <b>${fmtMoney(paintCost)}</b>${car.stolen ? ' <span class="ui-muted">(fresh paint on a hot car drops a wanted star)</span>' : ''}</div>`));
    root.appendChild(swatches(car.color, (c) => {
      if (c.hex === car.color) return;
      if (!g.state.spend(paintCost, 'paint')) return;
      car.repaint(c.hex);
      if (e) e.color = c.hex;
      if (car.stolen && g.state.p.heat > 0) { g.state.addHeat(-1); g.ui.toast('New color, who dis? The cops lose interest a little.', 'good'); }
      line = `${c.name}. Bold. Says "I have secrets" without saying "I have a warrant".`;
      vm.syncEntry(car, e);
      render();
    }));

    section('Performance');
    const up = document.createElement('div');
    up.className = 'ui-opts';
    for (const [k, info] of Object.entries(UPGRADES)) {
      const tier = car.upgrades[k] || 0;
      const pips = '■'.repeat(tier) + '□'.repeat(info.tiers - tier);
      if (tier >= info.tiers) { up.appendChild(btn(`${info.name} <span style="color:#b0672a">${pips}</span> — maxed out`, null, () => {}, true)); continue; }
      const cost = Math.round(info.base[tier] * scale);
      up.appendChild(btn(`${info.name} <span style="color:#b0672a">${pips}</span> → tier ${tier + 1} <span class="ui-muted" style="font-size:14px">${info.desc}</span>`, cost, () => {
        car.upgrades[k] = tier + 1;
        car.applyStats();
        line = k === 'engine' ? 'Listen to her purr. Or cough. Same thing in this town.' : k === 'armor' ? 'Bolted on some dumpster lids. Bullets hate dumpsters.' : 'Now she corners like she owes somebody money.';
      }));
    }
    const nitroCost = Math.round(3000 * Math.max(0.6, scale * 0.8));
    up.appendChild(btn(car.upgrades.nitro ? 'Nitrous — installed (press N)' : `Nitrous oxide kit <span class="ui-muted" style="font-size:14px">${d.kind === 'bike' ? 'on a BMX. Sure. Why not.' : 'N for a big stupid boost'}</span>`, car.upgrades.nitro ? null : nitroCost, () => {
      car.upgrades.nitro = true;
      line = d.kind === 'bike' ? 'Nitro on a pedal bike. I hope your legs are insured.' : 'Hit N and say goodbye to your eyebrows.';
    }, car.upgrades.nitro));
    up.appendChild(btn(car.upgrades.tires ? 'Bulletproof tires — installed' : 'Bulletproof tires <span class="ui-muted" style="font-size:14px">the tires. Only the tires.</span>', car.upgrades.tires ? null : 1500, () => {
      car.upgrades.tires = true;
      line = 'Your tires are now bulletproof. The rest of the car, and especially you, are not. Enjoy!';
      g.ui.toast('Bulletproof tires installed. You feel 0% safer.', 'info');
    }, car.upgrades.tires));
    root.appendChild(up);
  };
  render();
}
