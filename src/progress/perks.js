import { esc, fmtMoney } from '../core/util.js';
import { BACKGROUNDS } from '../ui/creator.js';

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
//   gambling      x  casino / pit-bet winnings      (applied here: state.addMoney reason 'casino'/'pit bet' when positive)
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

const SPEND_SHOP = new Set(['shop', 'bar', 'food', 'cover', 'drink', 'black market', 'bottle service', 'date']);
const SPEND_FINE = new Set(['fine', 'fines', 'bribe']);
const EARN_JOB = new Set(['job', 'pizza']);
const EARN_GAMBLE = new Set(['casino', 'pit bet', 'arm wrestling', 'pool']);
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
      else if (EARN_GAMBLE.has(reason)) n *= perks.mult('gambling');
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
  function perksHtml() {
    const pts = perks.points();
    const bg = BACKGROUNDS[st.p.background];
    let html = `<div class="perk-head"><div><b class="perk-pts">${pts}</b> perk point${pts === 1 ? '' : 's'} to spend</div>
      <div class="ui-muted">One point per level. ${bg ? `Background: <b>${bg.name}</b>` : ''}</div></div><div class="perk-trees">`;
    for (const [tid, T] of Object.entries(TREES)) {
      html += `<div class="perk-tree" style="--tree:${T.color}"><div class="perk-tree-name">${T.name}</div><div class="ui-muted perk-tree-blurb">${T.blurb}</div>`;
      for (const [id, d] of Object.entries(PERKS)) {
        if (d.tree !== tid) continue;
        const s = perks.status(id);
        const reqs = [];
        if (d.lvl) reqs.push(`LV ${d.lvl}`);
        if (d.req) reqs.push(...d.req.map((r) => PERKS[r]?.name || r));
        html += `<button class="perk ${s}" data-perk="${id}" ${s === 'available' ? '' : 'disabled'}>
          <span class="perk-name">${d.name}</span><span class="perk-desc">${d.desc}</span>
          ${s === 'owned' ? '<span class="perk-tag">OWNED</span>' : reqs.length ? `<span class="perk-req">Needs: ${reqs.map(esc).join(', ')}</span>` : ''}
        </button>`;
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  function openPanel(tab = 'perks') {
    if (panel && !panel.closed) panel.close();
    const body = document.createElement('div');
    body.innerHTML = `<div class="tabs"><button class="tab" data-tab="perks">Perks</button><button class="tab" data-tab="ach">Achievements</button></div><div class="tab-body"></div>`;
    const tb = body.querySelector('.tab-body');
    const show = (t) => {
      tab = t;
      body.querySelectorAll('.tab').forEach((b) => b.classList.toggle('sel', b.dataset.tab === t));
      tb.innerHTML = t === 'perks' ? perksHtml() : (game.achievements?.html() || '');
    };
    body.addEventListener('click', (e) => {
      const tbtn = e.target.closest('[data-tab]');
      if (tbtn) { show(tbtn.dataset.tab); return; }
      const pb = e.target.closest('[data-perk]');
      if (pb && !pb.disabled) { if (perks.buy(pb.dataset.perk)) show('perks'); }
    });
    panel = game.ui.openPanel({ title: 'Perks & Achievements', body, width: 980, className: 'perk-modal' });
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
    return `<div class="ui-section">Perks ${pts ? `<span class="ui-good" style="font-size:15px">(${pts} unspent — press P)</span>` : ''}</div>
      ${owned.length ? `<div class="ui-grid">${owned.map((id) => `<div class="ui-card" style="border-left:3px solid ${TREES[PERKS[id]?.tree]?.color}">${PERKS[id]?.name || id}</div>`).join('')}</div>` : '<div class="ui-muted">No perks yet. You are perfectly, tragically average.</div>'}`;
  });
  return perks;
}
