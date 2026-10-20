// Economy simulator (dev tool, balance pass 6). Not loaded by the game; run it from the console:
//   const { runEcon } = await import('./src/systems/econsim.js'); runEcon({ era: 'after' })
// or game.sysDebug.econ() in a ?dev session.
//
// Plays four scripted archetypes — job, heist, dealer, mixed — through REAL prices, pay tables, heist bag
// values, drug prices/stock/district multipliers, venture incomes and stat-gain rules (src/data/*,
// systems/common.js dim()), spending real-time seconds per action (travel, minigames, menus, heist clocks),
// and reports net worth at 90 and 240 real minutes. era: 'before' replays the pre-pass-6 numbers (old job
// pay/reqs, old heist bags, no fence/fee/press/heat, no street demand, no ventures/seniority/career perks).
import { JOBS } from '../data/jobs.js';
import { HEISTS, FENCE_CUT, PRESS_VALUE, PRESS_FLOOR, PRESS_COOLDOWN, PRESS_DECAY_DAYS, FAIL_LEGAL, FAIL_COOLDOWN } from '../data/heists.js';
import { DRUGS, DRUG_ORDER } from '../data/drugs.js';
import { VENTURES, VENTURE_ORDER, ACTIVE_ENERGY, LAZY_MULT } from '../data/ventures.js';
import { CARS } from '../data/cars.js';
import { ITEMS } from '../data/items.js';
import { LOCATIONS } from '../data/locations.js';
import { dim, NEWBIE_UNTIL, SORE_FREE, SORE_SPAN } from './common.js';
import { xpForLevel } from '../core/state.js';
import { mulberry32 } from '../core/util.js';

// ---- the pre-pass-6 numbers ------------------------------------------------------------------------
const OLD = {
  pay: { diner: [10, 16, 24], pizza: [12, 20, 32], factory: [14, 22, 38, 62], office: [12, 26, 52, 120, 320], bartender: [11, 18, 32],
    cop: [16, 28, 50, 90, 170], bouncer: [17, 32, 55], scrapper: [10, 17, 30] },
  req: { factory: { 2: { str: 50, int: 15 }, 3: { str: 85, int: 35 } }, office: { 2: { int: 60, cha: 40 }, 3: { int: 100, cha: 75 }, 4: { int: 160, cha: 130 } } },
  bags: { gas: [300, 480], truck: [1500, 2100], bank: [3600, 5000], casino: [7500, 10500], grimco: [17000, 25000] },
};
const DISTRICT_SQUEEZE = 0.85; // src/data/drugs.js district multipliers = 1 + (old - 1) * this
const DISTRICTS = ['gutterside', 'downtown', 'rustyards', 'dustbowl', 'hilltop', 'blackwater'];
// dealer NPC spots (measured in-game); travel = path factor 1.3 / run 9.5 u/s on foot, ~28 u/s + 8 s parking by car
const DEALER_AT = { downtown: [69, -118], hilltop: [-110, -536], rustyards: [404, -129], gutterside: [-257, 329], dustbowl: [-404, 12], blackwater: [948, -8] };
const HOMES = LOCATIONS.filter((l) => l.type === 'home').map((l) => ({ id: l.id, ...l.home })).sort((a, b) => a.price - b.price);

const RT = { travel: 50, travelCar: 26, shift: 42, sleep: 8, gym: 22, menu: 12, dealLeg: 20, heistPrep: 100 };
const GRADE_MULT = 1.15;          // a decent player averages a B-ish grade (skips are 0.8)
const HEIST_REC = { gas: 0, truck: 18, bank: 25, casino: 30, grimco: 40 };

export function runEcon({ era = 'after', seeds = 4, minutes = [90, 240], who = ['job', 'heist', 'dealer', 'mixed'], tune = {} } = {}) {
  const out = {};
  for (const arch of who) {
    const rows = minutes.map(() => []);
    for (let s = 0; s < seeds; s++) {
      const sim = new Sim(era, arch, 1000 + s * 77, tune);
      for (let i = 0; i < minutes.length; i++) { sim.runUntil(minutes[i] * 60); rows[i].push(sim.snapshot()); }
    }
    out[arch] = minutes.map((m, i) => avgSnap(m, rows[i]));
  }
  return out;
}

function avgSnap(m, arr) {
  const keys = Object.keys(arr[0]);
  const o = { min: m };
  for (const k of keys) {
    const v = arr.map((x) => x[k]);
    o[k] = typeof v[0] === 'number' ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : v[0];
  }
  return o;
}

class Sim {
  constructor(era, arch, seed, tune = {}) {
    this.after = era !== 'before';
    this.tune = tune;
    this.arch = arch;
    this.rng = mulberry32(seed);
    this.t = 0; this.min = 8 * 60; this.day = 1;
    this.p = { money: 50, bank: 0, str: 5, int: 5, cha: 5, karma: 0, lvl: 1, xp: 0, energy: 100, heat: 0, cap: 20, maxE: 100 };
    this.sore = { str: 0, int: 0, cha: 0 };
    this.job = null; this.careers = {}; this.perks = {};
    this.ventures = {}; this.home = HOMES[0]; this.car = null;
    this.heists = { last: {}, failed: {}, press: {}, done: {} }; this.gear = { picks: false, bat: false, pistol: false, intel: false, codes: false };
    this.drugs = {}; this.activity = 0; this.lastActive = true;
    this.mk = { f: Object.fromEntries(DRUG_ORDER.map((id) => [id, 1])), ev: null, stock: {}, sold: {} };
    this.restock();
    this.earn = { job: 0, heist: 0, drugs: 0, passive: 0, fights: 0 };
    this.spent = { living: 0, gear: 0, fees: 0, heat: 0, invest: 0, fence: 0, legal: 0 };
    this.n = { shifts: 0, heists: 0, fails: 0, trips: 0, promos: 0 };
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  get hour() { return Math.floor((this.min % 1440) / 60); }

  // ---- clock & body ----
  advance(m) {
    const before = Math.floor(this.min / 1440);
    this.min += m;
    const after = Math.floor(this.min / 1440);
    for (let d = before; d < after; d++) this.dayTick();
  }
  rt(s) { this.t += s; }
  travel() { this.rt(this.car ? RT.travelCar : RT.travel); this.advance(this.car ? 12 : 25); }
  useEnergy(n) {
    const p = this.p;
    if (p.energy < n) { // eat: Mystery Meat Platter $9 / 34 energy
      const need = n - p.energy;
      const meals = Math.ceil(need / 34);
      this.pay(meals * 9, 'living'); p.energy += meals * 34; this.rt(4 * meals);
    }
    p.energy -= n; this.activity += n;
  }
  sleep() {
    const p = this.p;
    const until = this.hour >= 17 ? (24 - this.hour + 7) * 60 : this.hour < 7 ? (7 - this.hour) * 60 : 8 * 60;
    this.advance(until);
    p.energy = Math.min(p.maxE, p.energy + p.maxE * (this.home.energyRestore ?? 0.7));
    this.sore = { str: 0, int: 0, cha: 0 };
    this.rt(RT.sleep + (this.homeFar ? 10 : 0));
  }
  pay(n, k) { const p = this.p; n = Math.round(n); if (p.money < n) { const w = Math.min(p.bank, n - p.money); p.bank -= w; p.money += w; } p.money -= n; this.spent[k] = (this.spent[k] || 0) + n; }
  gain(n, k) { n = Math.round(n); this.p.money += n; this.earn[k] = (this.earn[k] || 0) + n; }
  addXP(n) { const p = this.p; p.xp += n; while (p.xp >= xpForLevel(p.lvl)) { p.xp -= xpForLevel(p.lvl); p.lvl++; p.maxE += 2; p.str += 1; p.int += 1; p.cha += 1; } }
  train(stat, base, tiring = true) {
    const p = this.p, cur = p[stat];
    let m = cur < NEWBIE_UNTIL ? 1.4 : 1;
    const raw = dim(base, cur, 50) * m;
    if (tiring && cur >= NEWBIE_UNTIL) { const f = this.sore[stat] + raw / 2; if (f > SORE_FREE) m *= 1 / (1 + (f - SORE_FREE) / SORE_SPAN); }
    const g = dim(base, cur, 50) * m;
    p[stat] += g;
    if (tiring && cur >= NEWBIE_UNTIL) this.sore[stat] += g;
    return g;
  }
  cash() { return this.p.money + this.p.bank; }
  deposit() { const p = this.p; if (p.money > 3000) { p.bank += p.money - 3000; p.money = 3000; } }

  dayTick() {
    this.day++;
    const p = this.p;
    const active = this.activity >= ACTIVE_ENERGY; this.activity = 0;
    const lazy = this.after && !active ? LAZY_MULT : 1;
    // savings interest
    p.bank += Math.floor(Math.min(p.bank, 250000) * 0.002 * lazy);
    if (this.after) {
      let inc = 0;
      for (const id of Object.keys(this.ventures)) inc += VENTURES[id].daily * (this.perkMult('ventureIncome'));
      inc += this.careerDaily();
      if (inc > 0) { p.bank += Math.round(inc * lazy); this.earn.passive += Math.round(inc * lazy); }
    }
    p.heat = Math.max(0, p.heat - 1);
    // market: daily random walk + an event
    for (const id of DRUG_ORDER) { const d = DRUGS[id]; let f = this.mk.f[id] * Math.exp(gauss(this.rng) * d.vol); f += (1 - f) * 0.12; this.mk.f[id] = Math.min(d.max, Math.max(d.min, f)); }
    this.mk.ev = this.rng() < 0.55 ? { drug: DRUG_ORDER[Math.floor(this.rng() * DRUG_ORDER.length)], dist: this.rng() < 0.5 ? null : DISTRICTS[Math.floor(this.rng() * 6)], mult: [2.6, 0.4, 1.9, 0.6][Math.floor(this.rng() * 4)] } : null;
    this.restock();
    this.mk.sold = {};
  }

  // ---- jobs ----
  jobPay(id, rank) { return this.after ? JOBS[id].ranks[rank].pay : (OLD.pay[id]?.[rank] ?? JOBS[id].ranks[rank].pay); }
  jobReq(id, rank) { return (!this.after && OLD.req[id]?.[rank]) || JOBS[id].ranks[rank].req || {}; }
  reqOk(req) { const p = this.p; return ['str', 'int', 'cha', 'karma', 'level'].every((k) => req[k] == null || (k === 'level' ? p.lvl : p[k]) >= req[k]) && (!req.course || this.courses?.[req.course]); }
  careerDaily() {
    if (!this.job) return 0;
    let n = 0;
    for (let r = 0; r <= this.job.rank; r++) n += (this.perks[`${this.job.id}:${r}`] && JOBS[this.job.id].perks?.[r]?.daily) || 0;
    return n;
  }
  perkMult(key) { let m = 1; for (const k of Object.keys(this.perks)) { const [j, r] = k.split(':'); const v = JOBS[j]?.perks?.[r]?.mult?.[key]; if (v) m *= v; } return m; }
  pickJob(prefer) {
    // best paying job we qualify for (keeping our rank there), from the preferred ladders
    let best = null;
    for (const id of prefer) {
      const c = this.careers[id] || { rank: 0, shifts: 0 };
      if (!this.reqOk(this.jobReq(id, c.rank))) continue;
      const pay = this.jobPay(id, c.rank);
      if (!best || pay > best.pay) best = { id, pay };
    }
    if (best && this.job?.id !== best.id) { const c = this.careers[best.id] ||= { rank: 0, shifts: 0 }; this.job = { id: best.id, rank: c.rank, shifts: c.shifts }; }
  }
  open(id) { const h = JOBS[id].hours; if (!h) return true; const x = this.hour; return h[0] <= h[1] ? x >= h[0] && x < h[1] : x >= h[0] || x < h[1]; }
  workShift(hours = 8) {
    const j = this.job, d = JOBS[j.id];
    if (!this.open(j.id)) return false;
    this.travel();
    this.useEnergy(d.energy * hours);
    const sen = this.after ? Math.min(0.5, 0.05 * j.shifts) : 0;
    const gm = this.after ? 1 + (GRADE_MULT - 1) * (1 + 0.3 * j.rank) : GRADE_MULT;
    let pay = this.jobPay(j.id, j.rank) * hours * (1 + sen) * gm * this.perkMult('jobPay');
    if (d.tips) pay += 0.6 * (2 + this.p.cha * 0.12) * hours;
    if (d.kind === 'delivery') pay = this.jobPay(j.id, j.rank) * hours * 1.6 * (1 + sen) + (3 + this.p.cha * 0.18) * hours; // ~1.6 drops/h + tips
    this.gain(pay, 'job');
    for (const [k, v] of Object.entries(d.gain || {})) this.train(k, v * hours * 1.1 * (k === 'str' ? this.perkMult('strGain') : 1), false);
    this.addXP(hours * 6 + j.rank * 4 + 7);
    this.advance(hours * 60);
    this.rt(d.kind === 'delivery' ? hours * 45 : RT.shift);
    j.shifts++; this.n.shifts++;
    const c = this.careers[j.id] ||= { rank: 0, shifts: 0 }; c.shifts = j.shifts; c.rank = j.rank;
    // promotion
    const next = d.ranks[j.rank + 1];
    if (next && j.shifts >= d.ranks[j.rank].shifts && this.reqOk(this.jobReq(j.id, j.rank + 1))) {
      j.rank++; j.shifts = 0; c.rank = j.rank; c.shifts = 0; this.n.promos++;
      this.addXP(50 * j.rank);
      if (this.after) {
        this.gain(this.jobPay(j.id, j.rank) * (d.kind === 'delivery' ? 10 : 20), 'job');
        if (d.perks?.[j.rank]) this.perks[`${j.id}:${j.rank}`] = true;
        if (d.perks?.[j.rank]?.car && !this.car) this.car = d.perks[j.rank].car;
      }
    }
    this.blocked = next && j.shifts >= d.ranks[j.rank].shifts ? this.jobReq(j.id, j.rank + 1) : null;
    return true;
  }
  // training toward whatever's blocking the next rank (gym / library / public speaking / classes)
  trainFor(req) {
    const p = this.p;
    if (!req) return false;
    if (req.course && !this.courses?.[req.course]) { this.takeCourse(req.course); return true; }
    const need = ['str', 'int', 'cha'].filter((k) => req[k] != null && p[k] < req[k]);
    if (!need.length) return false;
    const k = need[0];
    this.travel();
    for (let i = 0; i < 3; i++) {
      if (k === 'str') { this.useEnergy(12); this.train('str', 1.1 * 1.1); this.advance(60); this.addXP(7); }
      else if (k === 'int') { this.useEnergy(18); this.train('int', 2.8 * 1.1); this.advance(180); this.addXP(14); }
      else { this.pay(5, 'living'); this.useEnergy(12); this.train('cha', 1.2 * 1.1); this.advance(120); this.addXP(8); }
      this.rt(RT.gym);
    }
    if (k === 'str' && !this.gym) { this.gym = true; this.pay(150, 'living'); }
    return true;
  }
  takeCourse(id) {
    // night school: a fee and ~one 2-3h session a day for N days; modelled as a lump of sessions
    this.courses ||= {};
    const fee = { crim_justice: 1200, mba: 4500, law: 6000 }[id] || 1000;
    if (this.cash() < fee) return;
    this.pay(fee, 'invest');
    const sess = { crim_justice: 8, mba: 10, law: 10 }[id] || 8;
    for (let i = 0; i < sess; i++) { this.travel(); this.useEnergy(10); this.train('int', 2.2, false); this.advance(180); this.rt(RT.gym); if (i % 2) this.sleep(); }
    this.courses[id] = true;
  }

  // ---- heists ----
  bags(id) { return this.after ? HEISTS[id].bags.value : OLD.bags[id]; }
  press(id) { const P = this.heists.press[id]; if (!P) return 0; return Math.max(0, P.n - Math.floor((this.min - P.t) / (PRESS_DECAY_DAYS * 1440))); }
  heistReady(id) {
    const d = HEISTS[id], h = this.heists, p = this.p;
    const lvl = { gas: 1, truck: 3, bank: 5, casino: 6, grimco: 8 }[id];
    if (p.lvl < lvl) return false;
    const prev = { truck: 'gas', bank: 'truck', casino: 'bank', grimco: 'casino' }[id];
    if (prev && !h.done[prev]) return false;
    if (id === 'casino' && !this.gear.intel && !this.perks['cop:2'] && !this.perks['bouncer:1']) return false;
    if (id === 'grimco' && !this.gear.codes && !this.perks['office:2']) return false;
    const cd = this.after ? d.cooldown * (1 + PRESS_COOLDOWN * Math.max(0, this.press(id) - 1)) : d.cooldown;
    if (this.min - (h.last[id] ?? -1e9) < cd) return false;
    const fcd = this.after ? Math.max(360, d.cooldown * FAIL_COOLDOWN) : 360;
    if (this.min - (h.failed[id] ?? -1e9) < fcd) return false;
    if (this.after && this.cash() < (d.fee || 0)) return false;
    return true;
  }
  heistPrereqs(id) {
    // buy what a sensible player buys before the job
    const g = this.gear;
    if (!g.picks && this.cash() > 300) { this.pay(120, 'gear'); g.picks = true; }
    if (!g.bat && this.cash() > 600) { this.pay(250, 'gear'); g.bat = true; }
    if (HEISTS[id].tier >= 2 && !g.pistol && this.cash() > 1000) { this.pay(450 + 60, 'gear'); g.pistol = true; }
    if (id === 'casino' && !g.intel && !this.perks['cop:2'] && !this.perks['bouncer:1'] && this.cash() > 4000 * 2.5) { this.pay(4000, 'gear'); g.intel = true; }
    if (id === 'grimco' && !g.codes && !this.perks['office:2'] && this.cash() > 15000 * 2.5) { this.pay(15000, 'gear'); g.codes = true; }
  }
  doHeist(id) {
    const d = HEISTS[id], p = this.p, h = this.heists;
    this.heistPrereqs(id);
    if (this.after && d.fee) this.pay(d.fee, 'fees');
    if (d.tier >= 3) this.pay(60 + 30 * d.tier, 'gear'); // ammo + heals
    this.travel();
    this.rt(d.time * 0.7 + RT.heistPrep);
    this.advance(Math.round(d.time * 0.7 / 1) + 30);
    const strOk = p.str + (this.gear.bat ? 8 : 0) + (this.gear.pistol ? 10 : 0) >= HEIST_REC[id];
    const pSucc = strOk ? 0.88 : 0.62;
    this.n.heists++;
    if (this.r() > pSucc) {
      h.failed[id] = this.min; this.n.fails++;
      if (this.after) { const legal = Math.min(Math.round(p.money * FAIL_LEGAL), 2000 * d.tier); this.pay(legal, 'legal'); p.heat += 1; }
      return false;
    }
    const quiet = this.r() < 0.55;
    const pm = this.after ? Math.max(PRESS_FLOOR, 1 - PRESS_VALUE * this.press(id)) : 1;
    const bv = this.bags(id);
    let take = d.bags.count * (bv[0] + bv[1]) / 2 * pm * this.r(0.85, 1.05) + (d.extra[0] + d.extra[1]) / 2;
    if (quiet) take *= d.quietBonus;
    if (this.after) { const cut = this.ventures.laundromat ? 0.15 : FENCE_CUT; this.spent.fence += Math.round(take * cut); take *= 1 - cut; }
    this.gain(take, 'heist');
    this.addXP(d.xp);
    if (quiet) { this.train('int', 0.6 + 0.4 * d.tier, false); this.train('cha', 0.3 + 0.2 * d.tier, false); } else this.train('str', 0.6 + 0.4 * d.tier, false);
    p.karma -= Math.min(5, d.tier);
    p.heat += this.after ? d.heat[quiet ? 'quiet' : 'loud'] : (quiet ? 0 : 1);
    h.done[id] = (h.done[id] || 0) + 1; h.last[id] = this.min;
    if (this.after) h.press[id] = { n: this.press(id) + 1, t: this.min };
    this.activity += 40;
    return true;
  }
  coolHeat() {
    const p = this.p;
    if (p.heat >= 2) {
      const recent = this.after ? (this.dealLog || []).filter((e) => this.min - e.m < 3 * 1440).reduce((x, e) => x + e.a, 0) : 0;
      const c = Math.round(p.heat * (300 + p.lvl * 60) + recent * 0.06);
      this.pay(c, 'heat'); p.heat = 0; this.dealLog = []; this.travel(); this.rt(RT.menu);
    }
  }
  bestHeist() {
    let best = null;
    for (const id of ['grimco', 'casino', 'bank', 'truck', 'gas']) {
      const prev = { truck: 'gas', bank: 'truck', casino: 'bank', grimco: 'casino' }[id];
      if (!prev || this.heists.done[prev]) this.heistPrereqs(id);
      if (this.heistReady(id)) { best = id; break; }
    }
    return best;
  }
  pitFight() {
    // The Pit ladder: purse for the next rung we can beat (STR >= rung str - 4)
    const L = [[8, 60], [16, 120], [26, 250], [38, 500], [52, 900], [68, 1700], [88, 3200], [112, 6000]];
    this.pitRank ??= 0;
    const rung = L[this.pitRank];
    this.travel(); this.useEnergy(15); this.rt(40); this.advance(60);
    const ok = rung && this.p.str >= rung[0] - 4;
    if (ok) { this.gain(rung[1], 'fights'); this.pitRank++; this.addXP(10 + 10 * Math.min(7, Math.floor(this.pitRank * 0.75)) + 3); }
    else { this.gain(0, 'fights'); }
    this.train('str', 0.35 + 0.3 * Math.min(7, Math.floor(this.pitRank * 0.75)), false);
    return ok;
  }

  // ---- drugs ----
  restock() {
    for (const dist of DISTRICTS) {
      const s = this.mk.stock[dist] = {};
      for (const id of DRUG_ORDER) {
        const base = DRUGS[id].base;
        const smug = dist === 'blackwater' && base >= 900;
        if (!smug && this.rng() < 0.12) { s[id] = 0; continue; }
        const scale = this.after ? (base < 100 ? 2.2 : base < 600 ? 1.3 : base < 2000 ? 0.65 : 0.35) : (base < 100 ? 2.2 : base < 600 ? 1.3 : base < 2000 ? 0.8 : 0.45);
        let q = Math.round((6 + Math.floor(this.rng() * 29)) * scale);
        if (smug) q = Math.max(4, Math.round(q * 1.8));
        s[id] = q;
      }
    }
  }
  price(id, dist) {
    const d = DRUGS[id]; const dm = d.districts[dist] ?? 1;
    const orig = 1 + (dm - 1) / DISTRICT_SQUEEZE; // data was squeezed toward 1 in pass 6
    let m = this.mk.f[id] * (this.after ? (this.tune.spread != null ? 1 + (orig - 1) * this.tune.spread : dm) : orig);
    const e = this.mk.ev; if (e && e.drug === id && (!e.dist || e.dist === dist)) m *= e.mult;
    return Math.max(1, Math.round(d.base * m));
  }
  demand(id) { const b = DRUGS[id].base; return b < 100 ? 40 : b < 600 ? 24 : b < 2000 ? 10 : 6; }
  sellTotal(id, dist, n) {
    const base = this.price(id, dist) * 0.9;
    if (!this.after) return Math.floor(base) * n;
    const k0 = this.mk.sold[dist + id] || 0, D = this.demand(id);
    let t = 0; for (let k = 0; k < n; k++) { const kk = k0 + k; t += Math.floor(base * (kk < D ? 1 : D / (D + (kk - D + 1)))); }
    return t;
  }
  legTime(a, b) {
    const A = DEALER_AT[a] || DEALER_AT.downtown, B = DEALER_AT[b] || DEALER_AT.downtown;
    const d = Math.hypot(A[0] - B[0], A[1] - B[1]) * 1.3;
    return this.car ? d / 28 + 8 : d / 9.5;
  }
  goDeal(dist) { const s = this.legTime(this.at || 'downtown', dist); this.rt(s + RT.dealLeg); this.advance(Math.round(s / 1) + 5); this.at = dist; }
  // one buy-leg + sell-leg trip; returns profit (0 = nothing worth doing today)
  drugTrip(budgetFrac = 0.95) {
    const p = this.p;
    let best = null;
    const budget = p.money + p.bank;
    for (const id of DRUG_ORDER) for (const a of DISTRICTS) {
      const st = this.mk.stock[a][id]; if (!st) continue;
      const bp = this.price(id, a);
      const n = Math.min(st, p.cap, Math.floor(budget * budgetFrac / bp));
      if (n < 1) continue;
      for (const b of DISTRICTS) {
        if (b === a) continue;
        const prof = this.sellTotal(id, b, n) - n * bp;
        // rate it per real second of walking/driving (a smart dealer picks short, fat routes)
        const secs = this.legTime(this.at || 'downtown', a) + this.legTime(a, b) + 2 * RT.dealLeg;
        const score = prof / secs;
        if (prof > 0 && (!best || score > best.score)) best = { id, a, b, n, bp, prof, score };
      }
    }
    if (!best || best.prof < Math.min(25, 4 + this.cash() * 0.05)) return 0;
    // buy
    this.goDeal(best.a);
    this.pay(best.n * best.bp, 'drugbuy');
    this.mk.stock[best.a][best.id] -= best.n;
    // sell
    this.goDeal(best.b);
    const total = this.sellTotal(best.id, best.b, best.n);
    this.mk.sold[best.b + best.id] = (this.mk.sold[best.b + best.id] || 0) + best.n;
    p.money += total;
    this.earn.drugs += total - best.n * best.bp;
    this.spent.drugbuy = (this.spent.drugbuy || 0) - best.n * best.bp; // net it out (buy cost isn't "spending")
    p.heat += (this.after ? 0.08 + Math.min(0.6, best.n * 0.008 + total / 12000) : 0.06 + Math.min(0.35, best.n * 0.006 + total / 40000)) * (this.hour >= 20 || this.hour < 6 ? 0.75 : 1);
    (this.dealLog ||= []).push({ m: this.min, a: total });
    if (this.r() < 0.12) p.heat += 0.6; // a cop saw it
    this.n.trips++;
    this.activity += 20;
    return best.prof;
  }
  bag() {
    const p = this.p;
    for (const [id, cap] of [['fanny_pack', 40], ['duffel', 80], ['rucksack', 160], ['trenchcoat', 320]]) {
      if (p.cap < cap && this.cash() > ITEMS[id].price * 2.5) { this.pay(ITEMS[id].price, 'invest'); p.cap = cap; }
    }
  }

  // ---- spending (same policy for everyone) ----
  invest() {
    const p = this.p;
    if (!this.car && this.cash() > 4500) { this.pay(CARS.rustbucket.price, 'invest'); this.car = 'rustbucket'; this.assets = (this.assets || 0) + CARS.rustbucket.price * 0.4; }
    if (this.after) {
      for (const id of VENTURE_ORDER) {
        const V = VENTURES[id];
        if (this.ventures[id] || (V.req?.level || 0) > p.lvl) continue;
        if (id === 'laundromat' && this.arch !== 'heist' && this.arch !== 'mixed') { /* still a fine income */ }
        if (this.cash() > V.price * 1.8) { this.pay(V.price, 'invest'); this.ventures[id] = true; this.assets = (this.assets || 0) + V.price * 0.5; }
      }
    }
    for (const h of HOMES) {
      if (h.tier <= this.home.tier || h.price <= 0 || h.tier > 3) continue;
      if (this.cash() > h.price * 3) { this.pay(h.price, 'invest'); this.home = h; this.assets = (this.assets || 0) + h.price * 0.7; }
    }
    this.deposit();
  }

  // ---- policies ----
  step() {
    const h = this.hour;
    const night = h >= 23 || h < 6;
    if (this.arch === 'job') return this.stepJob(night);
    if (this.arch === 'heist') return this.stepHeist(night);
    if (this.arch === 'dealer') return this.stepDealer(night);
    return this.stepMixed(night);
  }
  stepJob(night) {
    if (night) { this.invest(); return this.sleep(); }
    this.pickJob(['diner', 'scrapper', 'factory', 'bartender', 'office', 'cop', 'bouncer']);
    if (!this.job) return this.sleep();
    // one long shift, one training block if a promotion is stat-blocked, maybe a short evening shift
    if (this.trainedToday !== this.day && this.blocked && this.trainFor(this.blocked)) { this.trainedToday = this.day; return; }
    if (this.shiftsToday?.day !== this.day) this.shiftsToday = { day: this.day, n: 0 };
    if (this.shiftsToday.n < 2 && this.workShift(this.shiftsToday.n === 0 ? 8 : 4)) { this.shiftsToday.n++; return; }
    this.invest();
    return this.sleep();
  }
  stepHeist(night) {
    this.coolHeat();
    const id = this.bestHeist();
    if (id) { this.doHeist(id); this.invest(); return; }
    // between jobs: get stronger / climb the Pit, else sleep the cooldown off
    if (!night) {
      const next = ['gas', 'truck', 'bank', 'casino', 'grimco'].find((x) => !this.heists.done[x]) || 'grimco';
      if (this.p.str < HEIST_REC[next] + 8 && this.trainedToday !== this.day) { this.trainedToday = this.day; this.trainFor({ str: HEIST_REC[next] + 8 }); return; }
      if (this.pitToday !== this.day) { this.pitToday = this.day; this.pitFight(); return; }
    }
    this.invest();
    return this.sleep();
  }
  stepDealer(night) {
    this.coolHeat();
    this.bag();
    if (this.drugTrip() > 0) { if (this.n.trips % 6 === 0) this.invest(); return; }
    this.invest();
    return this.sleep();
  }
  stepMixed(night) {
    this.coolHeat();
    const id = this.bestHeist();
    if (id && !night) { this.doHeist(id); this.invest(); return; }
    if (night) { this.bag(); if (this.drugTrip(0.5) > 0) return; this.invest(); return this.sleep(); }
    this.pickJob(['diner', 'scrapper', 'factory', 'bartender', 'office', 'cop', 'bouncer']);
    if (this.shiftsToday?.day !== this.day) this.shiftsToday = { day: this.day, n: 0 };
    if (this.job && this.shiftsToday.n < 1 && this.workShift(8)) { this.shiftsToday.n++; return; }
    if (this.trainedToday !== this.day && this.blocked && this.trainFor(this.blocked)) { this.trainedToday = this.day; return; }
    this.bag();
    if (this.drugTrip(0.5) > 0) return;
    this.invest();
    return this.sleep();
  }
  runUntil(sec) { let guard = 0; while (this.t < sec && guard++ < 200000) this.step(); }
  snapshot() {
    const p = this.p;
    const ventureVal = Object.keys(this.ventures).reduce((a, id) => a + VENTURES[id].price, 0);
    return {
      netWorth: Math.round(p.money + p.bank + (this.assets || 0)),
      cash: Math.round(p.money + p.bank), days: this.day, level: p.lvl, str: Math.round(p.str), int: Math.round(p.int), cha: Math.round(p.cha),
      job: this.job ? `${this.job.id}:${this.job.rank}` : '-', earnedJob: this.earn.job, earnedHeist: this.earn.heist, earnedDrugs: this.earn.drugs,
      earnedPassive: this.earn.passive, earnedFights: this.earn.fights, ventures: Object.keys(this.ventures).length, ventureVal,
      spentFence: this.spent.fence, spentFees: this.spent.fees, spentHeat: this.spent.heat, spentLegal: this.spent.legal,
      hd: Object.entries(this.heists.done).map(([k, v]) => k + v).join(','), heists: this.n.heists, fails: this.n.fails, shifts: this.n.shifts, trips: this.n.trips, promos: this.n.promos,
    };
  }
}

function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
