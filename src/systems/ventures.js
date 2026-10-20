// Lifestyle & late-game economy (balance pass 6): business ventures (daily income), charity legacy projects,
// home improvements, status perks, the cosmetic "style" Charm cap, the active-day rule for passive income,
// and the heist fence cut.
//
// game.lifestyle = {
//   mult(key)            perk-style multiplier from legacy projects / status assets / home upgrades (read by game.perks.mult)
//   styleGain(n, src)    grant cosmetic Charm through the STYLE_CAP pool -> actual gain
//   fenceCut()           share of heist cash the fence keeps (0.30 / 0.15 laundromat / 0.08 second books)
//   owns(ventureId), homeUp(homeId, upId), anyHomeUp(upId), wasActive(), status() (for epilogues), daily(), beginDay()
//   openVentures(), openLegacy(), openHomeUpgrades(loc), placeOptions(locId), ventureDaily(id)
// }
// Save: p.sys.ventures[id] = { day, up: [upgradeIds] }, p.sys.legacy[id] = day, p.sys.homeUp[homeId] = [ids],
//       p.sys.style (cosmetic CHA granted so far), p.sys.activity (energy spent since the day tick),
//       p.sys.lastActive, p.sys.lastIncome = { total, active, day }, p.sys.galaDay, p.sys.tubDay
import { VENTURES, VENTURE_ORDER, LEGACY, LEGACY_ORDER, HOME_UPGRADES, HOME_UPGRADE_ORDER, STATUS, STYLE_CAP, ACTIVE_ENERGY, LAZY_MULT, ODDITIES, ODDITY_ORDER } from '../data/ventures.js';
import { CARS } from '../data/cars.js';
import { fmtMoney, pick, chance, rand } from '../core/util.js';
import { chip } from '../ui/visual.js';
import { sect, tile } from '../ui/visual2.js';
import { say, choose, shopPanel } from './ui-kit.js';
import { train } from './common.js';

export function installVentures(game) {
  const st = game.state;
  const sfx = (n) => game.sysSfx?.play(n);

  function S() {
    const p = st.p;
    p.sys ??= {};
    const s = p.sys;
    s.ventures ??= {};
    s.legacy ??= {};
    s.homeUp ??= {};
    s.oddities ??= {};
    s.activity ??= 0;
    if (s.style == null) s.style = initialStyle(p);
    return s;
  }
  // Old saves: count the Charm already bought with cosmetics (approx.) so the cap applies going forward.
  function initialStyle(p) {
    let n = (p.sys?.surgery || 0) * 5;
    try {
      const sh = game.sysShops;
      for (const id of p.sys?.outfits || []) n += sh?.OUTFITS?.[id]?.cha || 0;
      for (const id of p.sys?.hats || []) n += sh?.HATS?.[id]?.cha || 0;
      for (const id of p.sys?.tattoos || []) n += sh?.TATTOOS?.[id]?.cha || 0;
    } catch { /* shops not up yet */ }
    return Math.round(n * 10) / 10;
  }

  // ---- activity tracking: energy spent since the last day tick ------------------------------
  const origAdd = st.addStat.bind(st);
  st.addStat = (stat, n, source) => {
    if (stat === 'energy' && n < 0) { const s = st.p.sys; if (s) s.activity = (s.activity || 0) - n; }
    return origAdd(stat, n, source);
  };

  // cash first, then bank
  const canPay = (n) => st.p.money + st.p.bank >= n;
  function payBig(n, reason) {
    const p = st.p;
    if (!canPay(n)) { game.ui.toast('You can\'t cover that (cash + bank).', 'bad'); return false; }
    const fromCash = Math.min(p.money, n);
    if (fromCash > 0) st.addMoney(-fromCash, reason);
    if (n - fromCash > 0) { p.bank -= n - fromCash; st.changed('bank'); }
    sfx('cash');
    return true;
  }

  const owns = (id) => !!S().ventures[id];
  const hasUp = (id, up) => !!S().ventures[id]?.up?.includes(up);
  const homeUp = (homeId, up) => !!S().homeUp[homeId]?.includes(up);
  const anyHomeUp = (up) => Object.entries(S().homeUp).some(([h, ups]) => ups.includes(up) && st.p.ownedHomes.includes(h));
  const ownsCar = (pred) => (st.p.cars || []).some((c) => { const d = CARS[c.carId]; return d && pred(d, c.carId); });

  function ventureDiscount(id) {
    if (id === 'greasy' && st.getFlag('perk_marge')) return 0.7;
    if (id === 'butt' && st.getFlag('perk_butt_franchise')) return 0.75;
    return 1;
  }
  const ventPrice = (id) => Math.round(VENTURES[id].price * ventureDiscount(id));

  function ventureDaily(id) {
    const V = VENTURES[id], o = S().ventures[id];
    if (!V || !o) return 0;
    let n = V.daily;
    for (const u of V.upgrades || []) if (o.up?.includes(u.id)) n += u.daily;
    if (id === 'greasy' && st.getFlag('perk_marge')) n *= 1.25;
    n *= Number(game.perks?.mult?.('ventureIncome')) || 1;
    return Math.round(n);
  }

  function fenceCut() {
    if (hasUp('laundromat', 'books')) return 0.08;
    if (owns('laundromat')) return 0.15;
    return 0.3;
  }

  // ---- status ------------------------------------------------------------------------------------
  function statusKeys() {
    const p = st.p, out = [];
    if (p.ownedHomes.includes('hilltop_mansion')) out.push('manor');
    if (p.ownedHomes.includes('hilltop_penthouse')) out.push('penthouse');
    if (ownsCar((d) => d.price >= 150000)) out.push('supercar');
    if (ownsCar((d, id) => id === 'vendetta_oro')) out.push('goldcar');
    return out;
  }

  function mult(key) {
    let m = 1;
    const s = S();
    for (const id of Object.keys(s.legacy)) { const v = LEGACY[id]?.mult?.[key]; if (v) m *= v; }
    for (const k of statusKeys()) { const v = STATUS[k]?.mult?.[key]; if (v) m *= v; }
    for (const id of Object.keys(s.oddities)) { const v = ODDITIES[id]?.mult?.[key]; if (v) m *= v; }
    if (key === 'deathPenalty' && anyHomeUp('panic')) m *= 0;
    return m;
  }

  // ---- cosmetic Charm pool -------------------------------------------------------------------------
  function styleGain(n, source = 'style') {
    const s = S();
    if (!(n > 0)) return 0;
    const room = Math.max(0, STYLE_CAP - s.style);
    const got = Math.round(Math.min(n, room) * 10) / 10;
    s.style = Math.round((s.style + n) * 10) / 10;
    if (got > 0) st.addStat('cha', got, source);
    if (got < n) game.ui.toast(got > 0 ? `Style maxed out: only +${got} Charm. Past this, clothes are just clothes.` : 'Your look is already maxed. This one is pure vanity (no Charm).', 'info', 3500);
    return got;
  }

  // ---- daily ---------------------------------------------------------------------------------------
  function beginDay() {
    const s = S();
    s.lastActive = (s.activity || 0) >= ACTIVE_ENERGY;
    s.activity = 0;
    return s.lastActive;
  }
  const wasActive = () => S().lastActive !== false;

  function daily() {
    const s = S(), p = st.p;
    const active = wasActive();
    const m = active ? 1 : LAZY_MULT;
    let total = 0;
    const lines = [];
    for (const id of VENTURE_ORDER) {
      if (!owns(id)) continue;
      const V = VENTURES[id];
      const n = Math.max(0, Math.round(ventureDaily(id) * (1 + rand(-V.var, V.var)) * m));
      total += n;
      lines.push(`${V.name.replace(/\s*\(.*\)$/, '')}: ${fmtMoney(n)}`);
    }
    // career retainers (data/jobs.js perks[rank].daily)
    try { const c = Math.round((game.jobs?.dailyIncome?.() || 0) * m); if (c > 0) { total += c; lines.push(`Career retainer: ${fmtMoney(c)}`); } } catch (e) { console.error(e); }
    if (total > 0) {
      p.bank += total;
      st.changed('bank');
      p.totals.earned = (p.totals.earned || 0) + total;
      game.ui.toast(`💼 <b>Passive income</b> → bank: ${fmtMoney(total)}${active ? '' : ' <span class="ui-bad">(lazy day: 25%)</span>'}<br><small>${lines.join(' · ')}</small>`, 'money', 6000);
    }
    s.lastIncome = { total, active, day: game.time.day };
    // laundromat raid
    if (owns('laundromat') && (p.heat || 0) >= 4 && chance(0.25)) {
      const fine = Math.round(VENTURES.laundromat.price * 0.12);
      p.sys.fines = (p.sys.fines || 0) + fine;
      game.ui.toast(`🚨 The feds raided Suds &amp; Duds. Fine: ${fmtMoney(fine)} (pay it at the PD). The dryers are evidence now.`, 'bad', 6000);
    }
    // homes: grow closets, the manor vault, Pemberton's errands
    for (const homeId of p.ownedHomes) {
      const ups = s.homeUp[homeId] || [];
      const stash = (p.stash[homeId] ??= { money: 0, items: {}, drugs: {} });
      if (ups.includes('grow')) {
        if ((p.heat || 0) >= 3 && p.home === homeId && chance(0.3)) {
          stash.drugs = {};
          p.sys.fines = (p.sys.fines || 0) + 2500;
          game.ui.toast('🚨 The cops followed your heat home and found the grow closet. Stash drugs seized, $2,500 fine.', 'bad', 6000);
        } else {
          stash.drugs.cloud_cheese = (stash.drugs.cloud_cheese || 0) + 4;
          st.addStat('karma', -1);
        }
      }
      if (ups.includes('vault') && active && stash.money > 0) {
        const i = Math.floor(Math.min(stash.money, 3000000) * 0.004);
        stash.money += i;
        if (i > 0) lines.push(`Vault +${fmtMoney(i)}`);
      }
      if (homeId === 'hilltop_mansion') {
        stash.items.first_aid = (stash.items.first_aid || 0) + (stash.items.first_aid >= 6 ? 0 : 2);
        stash.items.energy_drink = (stash.items.energy_drink || 0) + (stash.items.energy_drink >= 6 ? 0 : 2);
      }
    }
    st.changed('ventures');
  }

  // ---- bank: ventures ------------------------------------------------------------------------------
  function openVentures() {
    return shopPanel(game, {
      title: 'Rotwell Business Brokerage', speaker: 'Deb from Commercial Lending',
      intro: () => `Deb (Chip's cousin, worse haircut) fans out a stack of brochures. "Money that works while you sleep, hon. Well. While you <em>work</em>. Businesses don't run themselves — on days you just lie around (under ${ACTIVE_ENERGY} energy spent), they only pay a quarter."<br><span class="sys-hint">Daily income goes straight to your bank. Fence cut on heist cash: <b>${Math.round(fenceCut() * 100)}%</b>.${S().lastIncome ? ` Last payout: ${fmtMoney(S().lastIncome.total)}${S().lastIncome.active ? '' : ' (lazy day)'}.` : ''}</span>`,
      width: 820,
      sections: () => {
        const secs = [];
        const prods = [];
        for (const id of VENTURE_ORDER) {
          const V = VENTURES[id], have = owns(id), price = ventPrice(id);
          prods.push({
            name: V.name, desc: `${V.desc}<br><b>Perk:</b> ${V.perk}`, price: null,
            priceLabel: have ? `${fmtMoney(ventureDaily(id))}/day` : `${fmtMoney(price)}${price < V.price ? ' (insider price)' : ''}`,
            tag: have ? 'Yours' : `~${fmtMoney(V.daily)}/day${V.var >= 0.4 ? ' (swingy)' : ''} · pays back in ~${Math.round(price / V.daily)} days`,
            req: V.req && Object.keys(V.req).length ? V.req : null,
            owned: have, ownedLabel: 'Owned',
            disabled: !have && !canPay(price),
            buy: () => buyVenture(id),
          });
          if (have) {
            for (const u of V.upgrades || []) {
              const got = hasUp(id, u.id);
              prods.push({
                name: `↳ ${u.name}`, desc: u.desc, price: null, priceLabel: got ? 'installed' : fmtMoney(u.price),
                tag: `+${fmtMoney(u.daily)}/day${u.karma ? ` · ${u.karma} karma` : ''}${id === 'laundromat' ? ' · fence 8%' : ''}`,
                owned: got, ownedLabel: 'Installed', disabled: !got && !canPay(u.price),
                buy: () => { if (payBig(u.price, 'venture')) { S().ventures[id].up.push(u.id); if (u.karma) st.addStat('karma', u.karma); game.ui.toast(`Installed: <b>${u.name}</b>.`, 'good'); st.changed('ventures'); } },
              });
            }
          }
        }
        secs.push({ name: 'Ventures', products: prods });
        return secs;
      },
    });
  }

  function buyVenture(id) {
    const V = VENTURES[id];
    if (owns(id)) return;
    const price = ventPrice(id);
    if (!payBig(price, 'venture')) return;
    S().ventures[id] = { day: game.time.day, up: [] };
    st.changed('ventures');
    game.bus.emit('venture:bought', { id, price });
    game.ui.bigText('BUSINESS OWNER', V.name, 2600);
  }

  // ---- bank: legacy (charity) ----------------------------------------------------------------------
  function openLegacy() {
    return shopPanel(game, {
      title: 'Legacy Projects', speaker: 'Gloria',
      intro: '"Want your name on something that isn\'t a warrant? These are one-time gifts. Tax-deductible. Allegedly."',
      sections: () => [{ products: LEGACY_ORDER.map((id) => {
        const L = LEGACY[id], have = !!S().legacy[id];
        return {
          name: L.name, desc: L.perk, price: null, priceLabel: have ? 'funded' : fmtMoney(L.price), tag: `+${L.karma} karma`,
          owned: have, ownedLabel: 'Funded', disabled: !have && !canPay(L.price),
          buy: () => {
            if (!payBig(L.price, 'donation')) return;
            S().legacy[id] = game.time.day;
            st.addStat('karma', L.karma);
            st.changed('ventures');
            game.bus.emit('legacy:funded', { id });
            game.ui.bigText('PHILANTHROPIST', L.name, 2600);
          },
        };
      }) }],
    });
  }

  // ---- pawn shop: collector's oddities ---------------------------------------------------------------
  function openOddities() {
    return shopPanel(game, {
      title: 'Lucky Larry’s Locked Case', speaker: 'Lucky Larry',
      intro: () => `Larry unlocks a glass case with a key he keeps somewhere you don't want to know. "Not for sale. Unless you got money. Then, for sale."<br><span class="sys-hint">Collected ${Object.keys(S().oddities).length}/${ODDITY_ORDER.length}. Get them all and Larry calls you "Curator". Respectfully.</span>`,
      sections: () => [{ products: ODDITY_ORDER.map((id) => {
        const O = ODDITIES[id], have = !!S().oddities[id];
        return {
          name: O.name, desc: O.perk, price: null, priceLabel: have ? 'on your wall' : fmtMoney(O.price),
          owned: have, ownedLabel: 'Collected', disabled: !have && !canPay(O.price),
          buy: () => {
            if (!payBig(O.price, 'collectible')) return;
            S().oddities[id] = game.time.day;
            if (O.karma) st.addStat('karma', O.karma);
            st.changed('ventures');
            if (Object.keys(S().oddities).length === ODDITY_ORDER.length) { st.setFlag('curator', true); game.ui.bigText('CURATOR', 'Every oddity in Rotwell. Larry weeps with pride.', 3000); }
            else game.ui.toast(`Collected: <b>${O.name}</b>.`, 'good');
          },
        };
      }) }],
    });
  }

  // ---- homes ---------------------------------------------------------------------------------------
  function openHomeUpgrades(loc) {
    const tier = loc.home?.tier ?? 0;
    return shopPanel(game, {
      title: `Home improvements — ${loc.name}`, speaker: 'Realtor Randy',
      intro: '"Every upgrade raises the property value! Not when you sell it. But spiritually."',
      sections: () => [{ products: HOME_UPGRADE_ORDER.filter((u) => HOME_UPGRADES[u].tier <= tier).map((u) => {
        const U = HOME_UPGRADES[u], have = homeUp(loc.id, u);
        return {
          name: U.name, desc: U.desc, price: null, priceLabel: have ? 'installed' : fmtMoney(U.price),
          owned: have, ownedLabel: 'Installed', disabled: !have && !canPay(U.price),
          buy: () => {
            if (!payBig(U.price, 'home upgrade')) return;
            (S().homeUp[loc.id] ??= []).push(u);
            st.changed('ventures');
            game.bus.emit('home:upgraded', { id: loc.id, upgrade: u });
            game.ui.toast(`Installed: <b>${U.name}</b>.`, 'good');
          },
        };
      }) }],
    });
  }

  // Extra home menu options for installed upgrades (called by home.js).
  function homeActions(loc) {
    const out = [];
    const t = game.sysToday?.() || {};
    const p = st.p;
    if (homeUp(loc.id, 'gym')) out.push({ label: 'Home gym: pump iron', hint: '1h · -12 energy · +STR', run: () => {
      if (p.energy < 12) { st.useEnergy(12); return; }
      st.addStat('energy', -12); game.time.advance(60);
      const g2 = train(game, 'str', 1.1, 'gym');
      st.addXP(6);
      return say(game, 'Home Gym', `${pick(['You bench in your living room while a neighbor watches through the window. You flex. He leaves.', 'You curl two paint cans and a cat. The cat consents. Probably.'])}<br><br>+${g2.toFixed(2)} STR`);
    } });
    if (homeUp(loc.id, 'study')) out.push({ label: 'Study nook: hit the books', hint: '1h · -5 energy · +INT', run: () => {
      if (p.energy < 5) { st.useEnergy(5); return; }
      st.addStat('energy', -5); game.time.advance(60);
      const g2 = train(game, 'int', 0.9, 'study');
      st.addXP(4);
      return say(game, 'Study Nook', `${pick(['You read a library book eleven months overdue. The fine is now larger than your brain.', 'You learn three facts and forget two. Net positive!'])}<br><br>+${g2.toFixed(2)} INT`);
    } });
    if (homeUp(loc.id, 'hottub')) out.push({ label: 'Soak in the hot tub', hint: t.tub ? 'pruned for today' : 'full energy · +3 Charm 6h', disabled: !!t.tub, run: () => {
      t.tub = true; game.time.advance(60);
      st.addStat('energy', p.maxEnergy);
      game.sysFx?.add?.({ id: 'tub', label: 'Hot-tub glow', min: 360, temp: { cha: 3 } });
      return say(game, 'Hot Tub', pick(['The jets hit a knot in your back you didn\'t know you had. It was a tumor of stress. It\'s gone now.', 'You soak above the smog line. Rotwell twinkles below like a dumpster fire seen from space.']));
    } });
    if (homeUp(loc.id, 'cellar')) {
      const ready = game.time.day - (S().galaDay ?? -9) >= 3;
      out.push({ label: 'Host a gala', hint: ready ? '$5,000 · 4h · +CHA, +karma, VIP buzz' : 'Pemberton is still scrubbing up after the last one', disabled: !ready, run: async () => {
        if (!payBig(5000, 'gala')) return;
        S().galaDay = game.time.day;
        game.time.advance(240);
        train(game, 'cha', 2.5, 'gala', 50, { tiring: false });
        st.addStat('karma', 3);
        game.sysFx?.add?.({ id: 'gala', label: 'Toast of the town', min: 720, temp: { cha: 4 } });
        st.addXP(40);
        return say(game, 'The Grimsworth Gala', pick([
          'Hilltop\'s finest drink your champagne and pretend not to know where your money came from. The charity raffle raises $4,000 for orphans. Pemberton raises one eyebrow.',
          'A string quartet plays covers of gangster rap. A city councilman cries in the wine cellar. You are, briefly, society.',
        ]) + '<br><br>+Charm, +3 karma, "Toast of the town" for 12h.');
      } });
    }
    if (homeUp(loc.id, 'helipad')) out.push({ label: 'Helipad: fly somewhere', hint: 'Pemberton pilots, badly', run: () => helicopter() });
    return out;
  }

  async function helicopter() {
    const dests = [
      ['first_bank', 'Downtown (First Bank)'], ['greasy_spoon', 'Gutterside (Greasy Spoon)'], ['meat_plant', 'The Rustyards (Meat Plant)'],
      ['junkyard', 'The Dustbowl (Junkyard)'], ['golden_tooth', 'Hilltop (Golden Tooth)'], ['funland_arcade', 'Blackwater Isle (Funland)'],
    ];
    const id = await choose(game, { title: 'Helipad', text: 'Pemberton puts on aviators. "Where to? Please say somewhere with a long runway."', choices: dests.map(([v, l]) => ({ label: l, value: v })) });
    const loc = id && game.locations.get(id);
    if (!loc) return;
    game.ui.closeAll?.();
    game.time.advance(20);
    try { game.player.spawn(loc.doorX ?? loc.x, (loc.doorZ ?? loc.z) + 3, game.player.facing); } catch (e) { console.error('[lifestyle] heli failed', e); }
    game.ui.toast(`🚁 Pemberton drops you near ${loc.name}. From about four feet up.`, 'good', 3500);
  }

  // Options a venture adds at its own location (diner, etc).
  function placeOptions(locId) {
    const out = [];
    const t = game.sysToday?.() || {};
    if (locId === 'greasy_spoon') {
      const free = owns('greasy') || (st.getFlag('perk_family_meal') && !t.familyMeal);
      if (free) out.push({ label: owns('greasy') ? 'Eat on the house (you own a piece)' : 'Family meal (free, once a day)', hint: '+34 energy · +10 HP', run: () => {
        if (!owns('greasy')) t.familyMeal = true;
        game.time.advance(20); st.addStat('energy', 34); st.heal(10);
        return say(game, 'Big Marge', owns('greasy') ? '"For you, partner? On the house. Don\'t tell the other partners. There are no other partners."' : '"Staff eats free. Staff also eats standing up."', 'Big Marge');
      } });
      if (!owns('greasy')) out.push({ label: 'Ask Marge about buying in', hint: fmtMoney(ventPrice('greasy')), run: () => openVentures() });
    }
    return out;
  }

  // For epilogues: what the player's life looks like when the credits roll.
  function status() {
    const p = st.p, s = S();
    return {
      manor: p.ownedHomes.includes('hilltop_mansion'), penthouse: p.ownedHomes.includes('hilltop_penthouse'),
      supercar: ownsCar((d) => d.price >= 150000), goldcar: ownsCar((d, id) => id === 'vendetta_oro'),
      ventures: VENTURE_ORDER.filter((id) => s.ventures[id]), legacy: LEGACY_ORDER.filter((id) => s.legacy[id]), curator: !!st.getFlag('curator'),
      helipad: anyHomeUp('helipad'), job: p.job ? { id: p.job.id, rank: p.job.rank } : null,
      netWorth: p.money + p.bank + (p.sys.fund || 0),
    };
  }

  const api = { mult, styleGain, fenceCut, owns, hasUp, homeUp, anyHomeUp, wasActive, beginDay, daily, status, ventureDaily, ventPrice,
    openVentures, openLegacy, openHomeUpgrades, openOddities, homeActions, placeOptions, payBig, S };
  game.lifestyle = api;

  // Character sheet (Tab): businesses, career perks, style.
  try {
    game.ui.sheetSections?.push?.(() => {
      const s = S();
      const vs = VENTURE_ORDER.filter((id) => s.ventures[id]);
      const cps = game.jobs?.earnedPerks?.() || [];
      if (!vs.length && !cps.length && !(s.style > 0)) return '';
      const daily = vs.reduce((a, id) => a + ventureDaily(id), 0) + (game.jobs?.dailyIncome?.() || 0);
      const style = Math.min(STYLE_CAP, Math.round(s.style || 0));
      return `${sect('work', 'Ventures &amp; career')}<div class="vx2-tiles">
        ${daily ? tile({ icon: 'money', color: 'var(--cash)', value: `~${fmtMoney(daily)}`, label: 'Per active day', sub: `fence cut ${Math.round(fenceCut() * 100)}%` }) : ''}
        ${tile({ icon: 'shirt', color: '#d84a8a', value: `${style}<small>/${STYLE_CAP}</small>`, label: 'Style charm', bar: [style, STYLE_CAP] })}
        ${vs.map((id) => tile({ icon: 'work', color: 'var(--g-work)', value: VENTURES[id].name.replace(/\s*\(.*\)$/, ''), label: 'Business' })).join('')}</div>
        ${cps.length ? `<div class="vx2-chip-row" style="margin-top:5px">${cps.map((c) => chip('up', game.jobs.JOBS[c.jobId]?.ranks?.[c.rank]?.title || c.jobId, 'gain', c.text)).join('')}</div>` : ''}`;
    });
  } catch (e) { console.error('[lifestyle] sheet failed', e); }
  game.bus.on('state:reset', () => { const p = st.p; if (p.sys) p.sys.style = null; S(); });
  return api;
}
