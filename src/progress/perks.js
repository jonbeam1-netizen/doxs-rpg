import { esc, fmtMoney } from '../core/util.js';
import { BACKGROUNDS } from '../ui/creator.js';
import { JOBS } from '../data/jobs.js';
import { chip, bar } from '../ui/visual.js';
import { ic, ok, ensureStyles as ensureVx2 } from '../ui/visual2.js';

// Perk trees. One perk point per level-up (+ background bonus points).
//
// game.perks API:
//   has(id) -> bool
//   mult(key) -> number   product of every owned perk's (and the background's) multiplier for `key`; 1 if none.
//   points() / owned() / buy(id) / open(tab)
//
// Multiplier keys (who applies them):
//   meleeDamage   x  player melee damage            (applied here by wrapping game.npcs.damage; combat may read it natively)
//   gunDamage     x  player gun damage              (same)
//   damageTaken   x  damage the player takes        (applied here: wraps state.damage)
//   walkSpeed / runSpeed  on-foot speed             (applied in src/player/player.js)
//   carSpeed      x  vehicle top speed              (applied here on car:entered by scaling vehicle.vmax; vehicles may read it natively)
//   shopDiscount  x  shop/bar/food prices           (applied here: wraps state.spend for reasons shop/bar/food/cover/drink/black market/bottle service/date)
//   drugBuy       x  price paid to dealers          (applied here: state.spend reason 'drugs')
//   drugPrice     x  money from selling drugs       (applied here: state.addMoney reason 'drugs')
//   jobPay        x  job & delivery pay             (applied here: state.addMoney reason 'job'/'pizza')
//   gambling      x  casino / pit-bet PROFIT        (applied by systems/casino.js + fightclub.js on net winnings only)
//   fineCost      x  police fines & bribes          (applied here: state.spend reason 'fine'/'fines'/'bribe')
//   deathPenalty  x  cash lost when KO'd/killed     (applied here: state.addMoney reason 'hospital bill'/'knocked out')
//   heatGain      x  wanted-level gained            (applied here: wraps state.addHeat for n > 0)
//   heatDecay     x  wanted-level cooling           (applied here: wraps state.addHeat for n < 0)
//   energyCost    x  energy spent on activities     (applied here: wraps state.useEnergy)
//   xpGain        x  XP earned                      (applied here: wraps state.addXP)
//   strGain / intGain / chaGain / statGain   x stat training gains (applied here: wraps state.addStat, n > 0)
//   heistTake     x  heist payout                   (NOT applied here — heists module should read it)
//   lockpick      x  lockpick/hack success chance   (NOT applied here — heists module should read it)
//   dateChance    x  dating success odds            (NOT applied here — systems/dating should read it)
//   bankInterest  — Compound Interest perk pays its own daily interest here.
//   bankRate      x  savings interest rate          (applied by systems/civic.js)
//   ventureIncome x  business-venture daily income  (applied by systems/ventures.js)
// mult() also folds in career perks (data/jobs.js perks[rank], p.careerPerks) and game.lifestyle.mult(key)
// (ventures / home upgrades / status purchases, src/systems/ventures.js).

export const TREES = {
  brawler: { name: 'Brawler', color: '#e2402f', blurb: 'Solve problems with your face. Mostly other people\'s faces.' },
  hustler: { name: 'Hustler', color: '#7fbf4d', blurb: 'Buy low, sell high, lie constantly.' },
  brain: { name: 'Brain', color: '#6b8fb8', blurb: 'Big wrinkly brain. Smells faintly of library.' },
};

// row = tier (0..3). req: perk ids needed first. lvl: minimum level.
export const PERKS = {
  // ---------------- BRAWLER ----------------
  knuckle_sandwich: { tree: 'brawler', row: 0, name: 'Knuckle Sandwich Artisan', desc: '+20% melee damage. Hand-crafted, locally sourced beatings.', mult: { meleeDamage: 1.2 } },
  thick_skull: { tree: 'brawler', row: 0, name: 'Thick Skull', desc: '+25 max HP. Doctors call it "dense". You call it "armor".', once: { maxHp: 25 } },
  cardio: { tree: 'brawler', row: 1, name: 'Cardio Is For Cowards', desc: '+12% run speed, +5% walk speed. For running away. Bravely.', mult: { runSpeed: 1.12, walkSpeed: 1.05 } },
  trigger_happy: { tree: 'brawler', row: 1, name: 'Trigger Happy', desc: '+20% gun damage. Spray and pray, minus the prayer.', mult: { gunDamage: 1.2 }, lvl: 3 },
  pain_sponge: { tree: 'brawler', row: 1, name: 'Pain Sponge', desc: 'Take 15% less damage. You\'ve been hit so much it\'s basically a massage.', mult: { damageTaken: 0.85 }, req: ['thick_skull'] },
  bar_brawler: { tree: 'brawler', row: 2, name: 'Bar Brawl Veteran', desc: 'Another +25% melee damage. Chairs fear you.', mult: { meleeDamage: 1.25 }, req: ['knuckle_sandwich'], lvl: 5 },
  swole: { tree: 'brawler', row: 2, name: 'Swole Patrol', desc: '+25% STR gains. Your veins have veins.', mult: { strGain: 1.25 }, lvl: 4 },
  cockroach: { tree: 'brawler', row: 3, name: 'Cockroach Constitution', desc: 'Lose half as much cash when you get KO\'d or wrecked. You will survive the apocalypse.', mult: { deathPenalty: 0.5 }, req: ['pain_sponge'], lvl: 7 },

  // ---------------- HUSTLER ----------------
  haggler: { tree: 'hustler', row: 0, name: 'Haggler', desc: '10% off at shops, bars and food joints. "Is this your best price, Gary?"', mult: { shopDiscount: 0.9 } },
  street_pharma: { tree: 'hustler', row: 0, name: 'Street Pharmacist', desc: 'Sell drugs for 15% more. You call it "artisanal".', mult: { drugPrice: 1.15 } },
  brown_noser: { tree: 'hustler', row: 1, name: 'Professional Brown-Noser', desc: '+20% job pay. Your nose has a permanent tan.', mult: { jobPay: 1.2 } },
  wholesale: { tree: 'hustler', row: 1, name: 'Wholesale Degenerate', desc: 'Dealers charge you 10% less. Bulk discount on bad decisions.', mult: { drugBuy: 0.9 }, req: ['street_pharma'] },
  lucky_foot: { tree: 'hustler', row: 1, name: 'Lucky Rabbit\'s Foot', desc: '+15% casino & bet winnings. The rabbit was not consulted.', mult: { gambling: 1.15 }, lvl: 3 },
  lawyered: { tree: 'hustler', row: 2, name: 'Lawyer On Retainer', desc: 'Fines and bribes cost 40% less. His name is Saul-adjacent.', mult: { fineCost: 0.6 }, lvl: 4 },
  getaway: { tree: 'hustler', row: 2, name: 'Getaway Driver', desc: '+10% vehicle top speed. Stop signs are merely suggestions.', mult: { carSpeed: 1.1 }, lvl: 4 },
  low_profile: { tree: 'hustler', row: 3, name: 'Low Profile', desc: 'Crimes give 30% less heat and heat cools 50% faster. You look like a beige minivan.', mult: { heatGain: 0.7, heatDecay: 1.5 }, req: ['lawyered'], lvl: 6 },
  safecracker: { tree: 'hustler', row: 3, name: 'Sticky Fingers', desc: '+15% heist takes, better lockpicking. Nothing is nailed down. Even the nails.', mult: { heistTake: 1.15, lockpick: 1.25 }, lvl: 8 },

  // ---------------- BRAIN ----------------
  bookworm: { tree: 'brain', row: 0, name: 'Bookworm', desc: '+25% INT gains. Libraries are just free AC.', mult: { intGain: 1.25 } },
  silver_tongue: { tree: 'brain', row: 0, name: 'Silver Tongue', desc: '+25% CHA gains and better odds on dates. Smooth as a greased eel.', mult: { chaGain: 1.25, dateChance: 1.15 } },
  fast_learner: { tree: 'brain', row: 1, name: 'Fast Learner', desc: '+15% XP from everything. You learn from mistakes. You make a LOT of mistakes.', mult: { xpGain: 1.15 } },
  power_nap: { tree: 'brain', row: 1, name: 'Power Napper', desc: 'Everything costs 15% less energy. You can sleep standing up. At work.', mult: { energyCost: 0.85 } },
  second_wind: { tree: 'brain', row: 1, name: 'Second Wind', desc: '+20 max energy. Coffee is a food group.', once: { maxEnergy: 20 }, lvl: 3 },
  compound_interest: { tree: 'brain', row: 2, name: 'Compound Interest', desc: 'Your bank balance earns 1% a day (max $750/day). Money makes money. Gross.', req: ['bookworm'], lvl: 5 },
  galaxy_brain: { tree: 'brain', row: 3, name: 'Galaxy Brain', desc: '+10% to ALL stat gains and +10% XP. You\'ve transcended. Mostly into debt.', mult: { statGain: 1.1, xpGain: 1.1 }, req: ['fast_learner'], lvl: 8 },
};

// Panel icons (presentation only)
const TREE_ICON = { brawler: 'fist', hustler: 'money', brain: 'bulb' };
const PERK_ICON = {
  knuckle_sandwich: 'fist', thick_skull: 'skull', cardio: 'pulse', trigger_happy: 'gun', pain_sponge: 'badge', bar_brawler: 'bottle', swole: 'gym', cockroach: 'heart',
  haggler: 'bag', street_pharma: 'pill', brown_noser: 'work', wholesale: 'crate', lucky_foot: 'dice', lawyered: 'scale', getaway: 'car', low_profile: 'eye', safecracker: 'key',
  bookworm: 'book', silver_tongue: 'talk', fast_learner: 'up', power_nap: 'bed', second_wind: 'bolt', compound_interest: 'money', galaxy_brain: 'bulb',
};

const SPEND_SHOP = new Set(['shop', 'bar', 'food', 'cover', 'drink', 'black market', 'bottle service', 'date']);
const SPEND_FINE = new Set(['fine', 'fines', 'bribe']);
const EARN_JOB = new Set(['job', 'pizza']);
const LOSS_DEATH = new Set(['hospital bill', 'knocked out']);

export function ensureProgress(p) {
  if (!p.progress || typeof p.progress !== 'object') p.progress = {};
  const pr = p.progress;
  pr.perks ??= [];
  pr.bonusPoints ??= 0;
  pr.ach ??= {};
  pr.c ??= {}; // achievement counters
  return pr;
}

export function installPerks(game) {
  const st = game.state;
  const P = () => ensureProgress(st.p);

  const perks = {
    PERKS, TREES,
    has(id) { return P().perks.includes(id); },
    owned() { return P().perks.slice(); },
    points() { const pr = P(); return Math.max(0, (st.p.level - 1) + pr.bonusPoints - pr.perks.length); },
    mult(key) {
      let m = 1;
      const pr = st.p.progress;
      if (pr?.perks) for (const id of pr.perks) { const v = PERKS[id]?.mult?.[key]; if (v) m *= v; }
      const bg = BACKGROUNDS[st.p.background];
      if (bg?.mult?.[key]) m *= bg.mult[key];
      // career perks (data/jobs.js perks[rank], earned on promotion, kept for good)
      const cp = st.p.careerPerks;
      if (cp) for (const k in cp) { const [j, r] = k.split(':'); const v = JOBS[j]?.perks?.[r]?.mult?.[key]; if (v) m *= v; }
      // lifestyle: ventures, home upgrades, status purchases (src/systems/ventures.js)
      try { const v = game.lifestyle?.mult?.(key); if (typeof v === 'number' && Number.isFinite(v) && v >= 0) m *= v; } catch { /* ignore */ }
      return m;
    },
    status(id) {
      const d = PERKS[id];
      if (!d) return 'locked';
      if (perks.has(id)) return 'owned';
      if (d.lvl && st.p.level < d.lvl) return 'locked';
      if (d.req && !d.req.every((r) => perks.has(r))) return 'locked';
      return perks.points() > 0 ? 'available' : 'nopoints';
    },
    buy(id) {
      const d = PERKS[id];
      if (!d || perks.status(id) !== 'available') return false;
      P().perks.push(id);
      const p = st.p;
      if (d.once?.maxHp) { p.maxHp += d.once.maxHp; p.hp = Math.min(p.maxHp, p.hp + d.once.maxHp); }
      if (d.once?.maxEnergy) { p.maxEnergy += d.once.maxEnergy; p.energy = Math.min(p.maxEnergy, p.energy + d.once.maxEnergy); }
      st.changed('progress');
      game.bus.emit('perk:bought', { id, tree: d.tree });
      game.ui.toast(`Perk unlocked: <b>${d.name}</b>`, 'good', 2600);
      game.audio?.ui?.('perk');
      refreshBubble();
      return true;
    },
    open: (tab) => openPanel(tab),
  };
  game.perks = perks;

  // ---------------------------------------------------------------- real effects (wrap core state API)
  const wrap = (name, fn) => { const orig = st[name].bind(st); st[name] = (...a) => fn(orig, ...a); };
  wrap('spend', (orig, n, reason = '') => {
    let m = 1;
    if (SPEND_SHOP.has(reason)) m = perks.mult('shopDiscount');
    else if (reason === 'drugs') m = perks.mult('drugBuy');
    else if (SPEND_FINE.has(reason)) m = perks.mult('fineCost');
    if (m !== 1 && n > 0) {
      const n2 = Math.max(0, Math.round(n * m));
      if (n2 < n && st.p.money >= n2) { const ok = orig(n2, reason); if (ok && n - n2 >= 2) game.ui.toast(`Perk saved you ${fmtMoney(n - n2)}`, 'money', 1500); return ok; }
    }
    return orig(n, reason);
  });
  wrap('addMoney', (orig, n, reason = '') => {
    if (n > 0) {
      if (EARN_JOB.has(reason)) n *= perks.mult('jobPay');
      else if (reason === 'drugs') n *= perks.mult('drugPrice');
    } else if (n < 0 && LOSS_DEATH.has(reason)) n *= perks.mult('deathPenalty');
    return orig(n, reason);
  });
  wrap('damage', (orig, n, source) => orig(n * perks.mult('damageTaken'), source));
  wrap('useEnergy', (orig, n) => orig(Math.round(n * perks.mult('energyCost') * 10) / 10));
  wrap('addXP', (orig, n) => orig(n > 0 ? n * perks.mult('xpGain') : n));
  wrap('addStat', (orig, stat, n, source) => {
    if (n > 0 && (stat === 'str' || stat === 'int' || stat === 'cha') && source !== 'perk') {
      n *= perks.mult(stat + 'Gain') * perks.mult('statGain');
    }
    return orig(stat, n, source);
  });
  wrap('addHeat', (orig, n) => orig(n > 0 ? n * perks.mult('heatGain') : n * perks.mult('heatDecay')));

  // Player damage dealt → npcs.damage(id, amount, 'local', opts)
  if (game.npcs?.damage) {
    const origDmg = game.npcs.damage.bind(game.npcs);
    game.npcs.damage = (id, amount, attackerId, opts) => {
      if ((attackerId ?? 'local') === 'local' && amount > 0) {
        const w = game.combat?.weapon;
        amount *= perks.mult(w?.kind === 'gun' || w?.ammo ? 'gunDamage' : 'meleeDamage');
      }
      return origDmg(id, amount, attackerId, opts);
    };
  }

  // Vehicle top speed.
  game.bus.on('car:entered', () => {
    const car = game.player?.vehicle;
    if (!car || typeof car.vmax !== 'number') return;
    if (car._perkVmax !== car.vmax) car._perkBase = car.vmax; // recomputed (upgrade) since last time
    car.vmax = car._perkBase * perks.mult('carSpeed');
    car._perkVmax = car.vmax;
  });

  // Compound Interest perk.
  game.bus.on('time:day', () => {
    if (!game.started || !perks.has('compound_interest')) return;
    const add = Math.min(750, Math.floor(st.p.bank * 0.01));
    if (add > 0) { st.p.bank += add; st.changed('bank'); game.ui.toast(`Compound Interest: +${fmtMoney(add)} in the bank`, 'money', 2600); }
  });

  // ---------------------------------------------------------------- level-up + bubble
  function refreshBubble() {
    if (!game.started) return;
    const n = perks.points();
    game.ui.setBubble('perks', n > 0 ? { icon: '★', text: `${n} perk point${n > 1 ? 's' : ''}`, key: 'P', onClick: () => openPanel('perks') } : null);
  }
  game.bus.on('player:levelup', ({ level }) => {
    setTimeout(() => {
      game.ui.toast(`<b>+1 PERK POINT</b> — press <kbd>P</kbd> to spend it on something stupid`, 'good', 4200);
      game.audio?.ui?.('levelup');
      refreshBubble();
    }, 400);
    game.bus.emit('progress:levelup', { level });
  });
  game.bus.on('game:start', () => { ensureProgress(st.p); setTimeout(refreshBubble, 500); });
  game.bus.on('state:reset', () => { ensureProgress(st.p); refreshBubble(); });

  // ---------------------------------------------------------------- panel
  let panel = null;
  let selPerk = null;
  const reqParts = (d) => {
    const out = [];
    if (d.lvl) out.push(ok(`LV ${d.lvl}`, st.p.level >= d.lvl));
    for (const r of d.req || []) out.push(ok(esc(PERKS[r]?.name || r), perks.has(r)));
    return out.join('');
  };
  // Three skill-tree columns of icon nodes, tier by tier; prerequisite links are drawn after layout.
  function perksHtml() {
    const pts = perks.points();
    const bg = BACKGROUNDS[st.p.background];
    const owned = perks.owned().length;
    let html = `<div class="px-head">
        <div class="px-pts${pts ? ' on' : ''}"><b>${pts}</b><span>perk point${pts === 1 ? '' : 's'}<em>${pts ? 'Pick a glowing perk' : 'Level up to earn more'}</em></span></div>
        <div class="pm-chips">${chip('star', `${owned}/${Object.keys(PERKS).length} owned`, 'muted')}${chip('up', 'one point per level', 'muted')}${bg ? chip('person', esc(bg.name), 'muted', 'background') : ''}</div>
      </div><div class="px-trees">`;
    for (const [tid, T] of Object.entries(TREES)) {
      const list = Object.entries(PERKS).filter(([, d]) => d.tree === tid);
      const have = list.filter(([id]) => perks.has(id)).length;
      html += `<div class="px-tree" data-tree="${tid}" style="--tree:${T.color}" title="${esc(T.blurb)}">
        <svg class="px-svg"></svg>
        <div class="px-th"><span class="vx2-ibox">${ic(TREE_ICON[tid])}</span><b>${T.name}</b><small>${have}/${list.length}</small>${bar(have, list.length)}</div>`;
      // three columns per tier; a perk sits under the perk it needs when it can
      const col = {};
      for (let row = 0; row <= 3; row++) {
        const tier = list.filter(([, d]) => d.row === row);
        if (!tier.length) continue;
        const taken = new Set();
        const pref = tier.length === 1 ? [2, 1, 3] : tier.length === 2 ? [1, 3, 2] : [1, 2, 3];
        for (const [id, d] of tier) { const pc = col[d.req?.[0]]; if (pc && !taken.has(pc)) { col[id] = pc; taken.add(pc); } }
        for (const [id] of tier) if (!col[id]) { const c = pref.find((x) => !taken.has(x)); col[id] = c; taken.add(c); }
        html += '<div class="px-tier">';
        for (const [id, d] of tier) {
          const s = perks.status(id);
          const badge = s === 'owned' ? ic('check') : s === 'locked' ? (d.lvl && st.p.level < d.lvl ? `LV${d.lvl}` : ic('lock')) : '';
          html += `<button class="px-node ${s}${selPerk === id ? ' sel' : ''}" style="grid-column:${col[id]}" data-perk="${id}" data-req="${(d.req || []).join(',')}" aria-label="${esc(d.name)}">
            <span class="px-orb">${ic(PERK_ICON[id] || 'star')}${badge ? `<span class="px-badge">${badge}</span>` : ''}</span><span class="px-nm">${d.name}</span></button>`;
        }
        html += '</div>';
      }
      html += '</div>';
    }
    return html + `</div><div class="px-detail empty">Hover or tap a perk to see what it does.</div>`;
  }

  function detailHtml(id) {
    const d = PERKS[id];
    if (!d) return null;
    const s = perks.status(id);
    const T = TREES[d.tree];
    const btn = s === 'owned' ? `<button class="ui-btn vx2-btn" disabled>${ic('check')}<span>Owned</span></button>`
      : s === 'available' ? `<button class="ui-btn vx2-btn primary" data-buy="${id}">${ic('star')}<span>Unlock · 1 point</span></button>`
        : s === 'nopoints' ? `<button class="ui-btn vx2-btn" disabled>${ic('star')}<span>No points</span></button>`
          : `<button class="ui-btn vx2-btn" disabled>${ic('lock')}<span>Locked</span></button>`;
    const reqs = reqParts(d);
    return { tree: T.color, html: `<span class="vx2-ibox">${ic(PERK_ICON[id] || 'star')}</span>
      <div class="px-dn">${d.name}<small>${T.name}</small></div>
      <div class="px-dd">${d.desc}${reqs ? `<div class="pm-chips">${reqs}</div>` : ''}</div>${btn}` };
  }

  function drawLinks(root) {
    for (const tree of root.querySelectorAll('.px-tree')) {
      const svg = tree.querySelector('.px-svg');
      if (!svg) continue;
      const tr = tree.getBoundingClientRect();
      const k = tr.width / (tree.offsetWidth || tr.width || 1) || 1; // the panel may still be mid scale-in
      const f = (v) => (v / k).toFixed(1);
      const X = (v) => f(v - tr.left), Y = (v) => f(v - tr.top);
      const nodes = [...tree.querySelectorAll('.px-node')];
      let lines = '';
      for (const n of nodes) {
        const reqs = n.dataset.req ? n.dataset.req.split(',') : [];
        const orb = n.querySelector('.px-orb').getBoundingClientRect();
        for (const r of reqs) {
          const srcNode = tree.querySelector(`.px-node[data-perk="${r}"]`);
          if (!srcNode) continue;
          const sr = srcNode.querySelector('.px-orb').getBoundingClientRect();
          const on = perks.has(r);
          const x1 = sr.left + sr.width / 2, y1 = srcNode.getBoundingClientRect().bottom - 2, x2 = orb.left + orb.width / 2, y2 = orb.top;
          // a link that skips a tier steps around whatever node sits in its way
          const block = nodes.find((o) => {
            if (o === n || o === srcNode) return false;
            const b = o.getBoundingClientRect();
            return b.top > y1 && b.bottom < y2 && b.left < Math.max(x1, x2) && b.right > Math.min(x1, x2);
          });
          let d;
          if (block) {
            const b = block.getBoundingClientRect();
            const gx = b.left - 3;
            d = `M${X(x1)} ${Y(y1)} L${X(x1)} ${Y(b.top - 4)} L${X(gx)} ${Y(b.top - 4)} L${X(gx)} ${Y(b.bottom + 2)} L${X(x2)} ${Y(b.bottom + 2)} L${X(x2)} ${Y(y2)}`;
          } else d = `M${X(x1)} ${Y(y1)} L${X(x2)} ${Y(y2)}`;
          lines += `<path class="${on ? 'on' : ''}" d="${d}"/>`;
        }
      }
      svg.innerHTML = lines;
    }
  }

  function openPanel(tab = 'perks') {
    if (panel && !panel.closed) panel.close();
    ensureVx2();
    const body = document.createElement('div');
    const tabsHtml = () => {
      const pts = perks.points();
      const an = game.achievements?.count?.() ?? 0;
      return `<button class="tab" data-tab="perks">${ic('star')}<span class="lbl">Perks</span>${pts ? `<span class="vx2-n hot">${pts}</span>` : ''}</button><button class="tab" data-tab="ach">${ic('trophy')}<span class="lbl">Achievements</span><span class="vx2-n">${an}</span></button>`;
    };
    body.innerHTML = `<div class="tabs vx2-tabs"></div><div class="tab-body"></div>`;
    const tb = body.querySelector('.tab-body');
    let ro = null;
    const show = (t) => {
      tab = t;
      body.querySelector('.tabs').innerHTML = tabsHtml();
      body.querySelectorAll('.tab').forEach((b) => b.classList.toggle('sel', b.dataset.tab === t));
      tb.innerHTML = t === 'perks' ? perksHtml() : (game.achievements?.html() || '');
      ro?.disconnect(); ro = null;
      if (t === 'perks') {
        drawLinks(tb);
        if (selPerk) setDetail(selPerk);
        try { ro = new ResizeObserver(() => drawLinks(tb)); ro.observe(tb); } catch { /* old browser */ }
      }
    };
    const setDetail = (id) => {
      const el = tb.querySelector('.px-detail');
      const d = id && detailHtml(id);
      if (!el || !d) return;
      el.className = 'px-detail';
      el.style.setProperty('--tree', d.tree);
      el.innerHTML = d.html;
    };
    const hover = (e) => { const n = e.target.closest?.('.px-node'); if (n) setDetail(n.dataset.perk); };
    body.addEventListener('mouseover', hover);
    body.addEventListener('focusin', hover);
    body.addEventListener('click', (e) => {
      const tbtn = e.target.closest('[data-tab]');
      if (tbtn) { show(tbtn.dataset.tab); return; }
      const bb = e.target.closest('[data-buy]');
      if (bb) { if (perks.buy(bb.dataset.buy)) show('perks'); return; }
      const af = e.target.closest('[data-af]');
      if (af) { game.achievements.filter = af.dataset.af; show('ach'); return; }
      // first tap selects (shows the details + Unlock); tapping the selected, available perk again buys it
      const pb = e.target.closest('[data-perk]');
      if (!pb) return;
      const id = pb.dataset.perk;
      if (selPerk === id && perks.status(id) === 'available') { if (perks.buy(id)) show('perks'); return; }
      selPerk = id;
      tb.querySelectorAll('.px-node.sel').forEach((n) => n.classList.remove('sel'));
      pb.classList.add('sel');
      setDetail(id);
    });
    panel = game.ui.openPanel({ title: 'Perks & Achievements', body, width: 980, className: 'perk-modal', onClose: () => { ro?.disconnect(); ro = null; } });
    panel.isPerks = true;
    show(tab);
    return panel;
  }

  game.addSystem({
    name: 'perks-keys',
    update() {
      if (!game.started) return;
      if (game.input.wasPressed('KeyP')) {
        const top = game.ui.top();
        if (top?.isPerks) top.close();
        else if (!game.ui.isBlocking()) openPanel('perks');
      }
    },
  });
  game.ui.menuButtons.push({ label: 'Perks & achievements', hint: 'P', onClick: () => openPanel('perks') });
  game.ui.sheetSections.push(() => {
    const owned = perks.owned();
    const pts = perks.points();
    ensureVx2();
    return `<div class="pm-sect cs-h vx2-sect">${ic('star')}<span>Perks</span><small>${pts ? `<span class="ui-good">${pts} unspent</span>` : ''}<span class="kb-only"> <kbd>P</kbd></span></small></div>
      ${owned.length ? `<div class="vx2-cards">${owned.map((id) => { const d = PERKS[id]; const col = TREES[d?.tree]?.color || 'var(--rust)'; return `<div class="vx2-mini" title="${esc(d?.desc || '')}"><span class="vx2-ibox" style="--gc:${col}">${ic(PERK_ICON[id] || 'star')}</span><span class="vx2-rt"><b>${d?.name || id}</b><span>${TREES[d?.tree]?.name || ''}</span></span></div>`; }).join('')}</div>` : '<div class="cs-empty">No perks yet. You are perfectly, tragically average.</div>'}`;
  });
  return perks;
}
