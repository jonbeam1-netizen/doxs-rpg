// Shared helpers for the systems module: state defaults, daily counters, stat gains, requirements.
import { clamp, fmtMoney } from '../core/util.js';
import { STAT_NAMES } from '../core/state.js';
import { COURSES } from '../data/courses.js';
import { BASE_CAPACITY } from '../data/items.js';

export const $ = fmtMoney;

// Make sure every key the systems module relies on exists (old saves, new games).
export function ensureState(p) {
  p.sys ??= {};
  const s = p.sys;
  s.today ??= { day: 0 };
  s.capacity ??= BASE_CAPACITY;
  s.outfits ??= ['default'];
  s.hats ??= [];
  s.tattoos ??= [];
  s.gym ??= { until: 0, lifetime: false };
  s.pitRank ??= 0;
  s.loan ??= null;            // { amount, day }
  s.fund ??= 0;               // Rotwell Mutual Fund balance
  s.insuranceUntil ??= 0;     // game day
  s.fines ??= 0;
  s.surgery ??= 0;
  s.rent ??= {};              // homeId -> paid-through day
  s.drunk ??= 0;
  s.addiction ??= { level: 0, last: 0 };
  s.dealHeat ??= 0;
  s.partner ??= null;
  s.casino ??= { day: 0, net: 0, bannedDay: 0 };
  s.newsSeen ??= 0;
  p.careers ??= {};
  p.stash ??= {};
  p.effects ??= [];
  p.dating ??= {};
  p.market ??= null;          // built by market.js
  p.education ??= {};
  p.totals.drugsSold ??= 0;
  return p;
}

// Per-day counters (reset lazily when the day changes): today(game).plasma etc.
export function today(game) {
  const s = game.state.p.sys;
  if (!s.today || s.today.day !== game.time.day) s.today = { day: game.time.day };
  return s.today;
}

// ---------------------------------------------------------------------------------------------
// Stat curve (balance pass 4). Stats used to fall in a day and a half (STR 12 -> 34) while cash
// carried all the pacing. Now:
//   - "newbie gains": while a stat is under 15 every gain is x1.4 (the first 15 minutes stay quick);
//   - diminishing returns: the old soft curve, plus an extra falloff once a stat passes 25;
//   - soreness (the daily soft cap): points from training since your last real sleep (6h+) pile up;
//     past SORE_FREE further training in that stat gives less and less. A 2h nap takes a quarter
//     off, a new day halves it. Stats under 15 never get sore. Courses (once a day anyway), job
//     shifts and "doing things" rewards (fights won, heists, flirts/dates: tiring:false) skip
//     soreness entirely, so the city itself is the best gym.
// p.sys.sore = { str, int, cha } (points gained while tired-eligible since the last sleep)
// ---------------------------------------------------------------------------------------------
export const SORE_FREE = 2;     // points per rest cycle at full speed
export const SORE_SPAN = 2;     // every SORE_SPAN points beyond that: gains / (1 + n)
export const NEWBIE_UNTIL = 15;

// Diminishing returns: high stats grow slower. `soft` is the stat value at which gains halve.
export function dim(base, current, soft = 50) {
  const c = Math.max(0, current);
  let m = soft / (soft + c);
  if (c > 25) m *= 25 / c;
  return base * m;
}

// 1 = fresh, lower = sore. Training the same stat over and over before sleeping is the soft cap.
export function soreMult(p, stat, extra = 0) {
  const f = (p.sys?.sore?.[stat] || 0) + extra;
  return f <= SORE_FREE ? 1 : 1 / (1 + (f - SORE_FREE) / SORE_SPAN);
}

const SORE_TEXT = {
  str: 'Your muscles are SCREAMING. STR training is less effective until you sleep (6h+). Fights, jobs and heists still build you up.',
  int: 'Your brain is fried. INT study is less effective until you sleep (6h+). Classes still count in full.',
  cha: 'You\'re socially drained. CHA practice is less effective until you sleep (6h+). Dates and real adventures still count.',
};

// Train a stat with diminishing returns + active effect multipliers. Returns actual gain.
// opts.tiring = false: an activity reward that ignores (and doesn't add to) soreness.
export function train(game, stat, base, source = '', soft = 50, opts = {}) {
  const p = game.state.p;
  let mult = 1;
  const fx = game.sysFx;
  if (stat === 'str' && fx) {
    if (fx.has('roids')) mult *= 2;
    if (fx.has('protein')) mult *= 1.3;
  }
  if (fx?.has('withdrawal')) mult *= 0.7;
  const cur = p[stat] ?? 0;
  if (cur < NEWBIE_UNTIL) mult *= 1.4;
  const src = String(source);
  const tiring = opts.tiring !== false && !src.startsWith('course:') && !src.startsWith('job:') && cur >= NEWBIE_UNTIL && stat in SORE_TEXT;
  const before = tiring ? soreMult(p, stat) : 1;
  // judge soreness halfway through this session, so one huge session can't blow past the cap
  if (tiring) mult *= soreMult(p, stat, dim(base, cur, soft) * mult / 2);
  const amount = Math.round(dim(base, cur, soft) * mult * 100) / 100;
  if (amount <= 0) return 0;
  const got = game.state.addStat(stat, amount, source) || 0;
  if (tiring && got > 0) {
    p.sys ??= {};
    const sore = (p.sys.sore ??= {});
    sore[stat] = Math.round(((sore[stat] || 0) + got) * 100) / 100;
    const after = soreMult(p, stat);
    if (before > 0.8 && after <= 0.8) game.ui?.toast(SORE_TEXT[stat], 'bad', 4500);
  }
  return got;
}

// Rest: sleeping 6h+ clears soreness, a nap takes a quarter off, a new day halves it.
export function rest(p, frac = 1) {
  const sore = p.sys?.sore;
  if (!sore) return;
  for (const k of Object.keys(sore)) { sore[k] = Math.round(sore[k] * (1 - frac) * 100) / 100; if (sore[k] < 0.05) delete sore[k]; }
}

// "Sore: STR -40%" style hint for menus ('' when fresh).
export function soreHint(p, stat) {
  const m = soreMult(p, stat);
  return m >= 0.97 ? '' : `sore: gains -${Math.round((1 - m) * 100)}%`;
}

export function hasCourse(p, id) {
  const c = COURSES[id];
  const e = p.education?.[id];
  return !!(c && e && (e.done || (e.sessions ?? 0) >= c.sessions));
}

// Requirements: { str, int, cha, karma, level, course, maxHeat, money }
export function reqCheck(game, req = {}) {
  const p = game.state.p;
  const parts = [];
  for (const k of ['str', 'int', 'cha', 'karma', 'level']) {
    if (req[k] == null) continue;
    const label = k === 'level' ? 'LV' : k.toUpperCase();
    parts.push({ label: `${label} ${req[k]}`, ok: p[k] >= req[k] });
  }
  if (req.maxKarma != null) parts.push({ label: `KARMA ≤ ${req.maxKarma}`, ok: p.karma <= req.maxKarma });
  if (req.course) parts.push({ label: `${COURSES[req.course]?.short ?? req.course} degree`, ok: hasCourse(p, req.course) });
  if (req.maxHeat != null) parts.push({ label: req.maxHeat === 0 ? 'No heat' : `Heat ≤ ${req.maxHeat}`, ok: p.heat <= req.maxHeat });
  return { ok: parts.every((x) => x.ok), parts };
}

export function reqHtml(game, req) {
  const { parts } = reqCheck(game, req);
  if (!parts.length) return '';
  return parts.map((x) => `<span class="sys-req ${x.ok ? 'ok' : 'no'}">${x.label}</span>`).join(' ');
}

export function reqMissing(game, req) {
  return reqCheck(game, req).parts.filter((x) => !x.ok).map((x) => x.label).join(', ');
}

// Do an activity: checks energy + money, spends both, skips time. Returns true on success.
export function activity(game, { minutes = 0, energy = 0, cost = 0, reason = '' } = {}) {
  const st = game.state, p = st.p;
  if (cost > 0 && p.money < cost) { st.spend(cost); return false; }
  if (energy > 0 && p.energy < energy) { st.useEnergy(energy); return false; }
  if (cost > 0) st.addMoney(-cost, reason);
  if (energy > 0) st.addStat('energy', -energy);
  if (minutes > 0) game.time.advance(minutes);
  return true;
}

// Is the place open right now? hours = null (24/7) or [open, close) (wraps midnight).
export function isOpen(game, hours) {
  if (!hours) return true;
  return game.time.isBetween(hours[0], hours[1]);
}

export function hourName(h) {
  h = ((h % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${((h + 11) % 12) + 1}${h < 12 ? 'AM' : 'PM'}`;
}

export function hoursLabel(hours) {
  return hours ? `Open ${hourName(hours[0])}–${hourName(hours[1])}` : 'Open 24/7';
}

export function netWorth(p) {
  return p.money + p.bank + (p.sys?.fund || 0) - (p.sys?.loan?.amount || 0);
}

// Pick a line that depends on time of day: { morning, day, evening, night } (arrays or strings).
export function byTime(game, lines) {
  const h = game.time.hour;
  const key = h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night';
  const v = lines[key] ?? lines.day ?? '';
  return Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
}

export function statName(k) { return STAT_NAMES[k] ?? k.toUpperCase(); }

export function capacity(p) { return p.sys?.capacity ?? BASE_CAPACITY; }

export function clampMoney(n) { return clamp(Math.round(n), 0, 1e12); }

export function partnerOf(p) { return p.sys?.partner || null; }

export function playerXZ(game) {
  const pl = game.player;
  if (!pl) return { x: 0, z: 0 };
  const g = pl.vehicle?.group ?? pl.group;
  return { x: g.position.x, z: g.position.z };
}

// Where to stage a brawl for a building: its door if the player is near it, else where the player is.
export function brawlSpot(game, loc) {
  const pp = playerXZ(game);
  const dx = loc?.doorX ?? loc?.x, dz = loc?.doorZ ?? loc?.z;
  if (dx == null || Math.hypot(dx - pp.x, dz - pp.z) > 15) return { x: pp.x, z: pp.z };
  return { x: dx, z: dz };
}
