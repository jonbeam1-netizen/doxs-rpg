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

// Diminishing returns: high stats grow slower. `soft` is the stat value at which gains halve.
export function dim(base, current, soft = 50) {
  return base * soft / (soft + Math.max(0, current));
}

// Train a stat with diminishing returns + active effect multipliers. Returns actual gain.
export function train(game, stat, base, source = '', soft = 50) {
  const p = game.state.p;
  let mult = 1;
  const fx = game.sysFx;
  if (stat === 'str' && fx) {
    if (fx.has('roids')) mult *= 2;
    if (fx.has('protein')) mult *= 1.5;
  }
  if (fx?.has('withdrawal')) mult *= 0.7;
  const amount = Math.round(dim(base, p[stat], soft) * mult * 100) / 100;
  if (amount <= 0) return 0;
  return game.state.addStat(stat, amount, source);
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
