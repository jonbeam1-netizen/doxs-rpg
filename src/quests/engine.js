import { CHARACTERS, QUESTS, QUEST_ITEMS, FACTIONS } from '../data/quests.js';
import { WEAPONS } from '../data/weapons.js';
import { esc, fmtMoney, clamp, pick } from '../core/util.js';

// Quest state machine. Persistent progress lives in game.state.p.quests as
// plain JSON: { [id]: { step, done, data:{}, sd:{} (per-step data), t: dayStarted } }.
// Definitions (with functions) live in src/data/quests.js and are never saved.

const EVENT_TYPES = ['drug:sold', 'drug:bought', 'race:won', 'job:promoted', 'job:worked', 'job:hired', 'home:bought', 'car:entered', 'car:bought',
  'casino:result', 'brawl:won', 'npc:killed', 'course:completed', 'date:result', 'item:bought', 'item:used',
  'stat:gain', 'money:change', 'home:slept', 'location:enter', 'heist:completed', 'skate:trick'];

// XP paid for finishing a quest step (on top of any explicit reward), so every
// story beat feels like progress. Steps can override with `xp: n`.
const STEP_XP = { main: (i) => 35 + 12 * i, side: () => 30, faction: () => 20 };

export const KIND_COLORS = { main: '#e0b23a', side: '#4fc3d9', job: '#e0702a', faction: '#d0443a' };

export class QuestEngine {
  constructor(game) {
    this.g = game;
    this.defs = { ...QUESTS };
    for (const [id, d] of Object.entries(this.defs)) d.id = id;
    this.rt = {};             // runtime-only per quest: { armed, warned, busy }
    this.charMenus = {};      // charId -> (g) => [{ label, hint, disabled, run }]
    this.cars = {};
    this._poll = 0;
    this._talking = false;
    this.version = 0;         // bumps on any change (markers/log refresh)
    this.world = null;        // set by QuestWorld (positions)

    for (const evt of EVENT_TYPES) game.bus.on(evt, (d) => this._onEvent(evt, d));
    game.bus.on('state:before-save', () => this._persistTimers());
    game.bus.on('state:reset', () => { this.rt = {}; this.changed(); });
  }

  // ---------------------------------------------------------------- basics
  get store() {
    const p = this.g.state.p;
    if (!p.quests || typeof p.quests !== 'object') p.quests = {};
    return p.quests;
  }
  register(def) { this.defs[def.id] = def; return def; }
  def(id) { return this.defs[id]; }
  get(id) { return this.store[id]; }
  isActive(id) { const q = this.store[id]; return !!q && !q.done; }
  isDone(id) { return !!this.store[id]?.done; }
  activeIds() { return Object.keys(this.store).filter((id) => this.isActive(id) && this.defs[id]); }
  changed() { this.version++; this.g.bus.emit('quests:changed'); }

  steps(id) {
    const d = this.defs[id];
    if (!d) return [];
    const q = this.store[id];
    return typeof d.steps === 'function' ? d.steps(q?.data || {}, this.g) : d.steps;
  }
  current(id) { const q = this.store[id]; return q && !q.done ? this.steps(id)[q.step] : null; }

  objectiveText(id) {
    const st = this.current(id);
    if (!st) return '';
    try { return typeof st.text === 'function' ? st.text(this.g, this.store[id]) : st.text; } catch { return '...'; }
  }

  itemName(id) { return QUEST_ITEMS[id]?.name ?? this.g.items?.name?.(id) ?? id; }

  // ---------------------------------------------------------------- factions
  faction() { return this.g.state.getFlag('faction', null) || null; }
  rep(f) { return Number(this.g.state.getFlag('rep_' + f, 0)) || 0; }
  addRep(f, n) {
    const v = clamp(this.rep(f) + n, -100, 999);
    this.g.state.setFlag('rep_' + f, v);
    if (n) this.g.ui.toast(`${n > 0 ? '+' : ''}${n} ${FACTIONS[f]?.name || f} rep`, n > 0 ? 'stat' : 'bad', 1800);
    this.changed();
    return v;
  }
  rankIndex(f) {
    const F = FACTIONS[f]; if (!F) return 0;
    const r = this.rep(f); let idx = 0;
    F.ranks.forEach(([min], i) => { if (r >= min) idx = i; });
    return idx;
  }
  rankName(f) { const F = FACTIONS[f]; return F ? F.ranks[this.rankIndex(f)][1] : ''; }
  joinFaction(f) {
    const F = FACTIONS[f]; if (!F || this.faction() === f) return;
    this.g.state.setFlag('faction', f);
    if (this.rep(f) < 5) this.g.state.setFlag('rep_' + f, 5);
    this.g.state.setFlag('rep_' + F.enemy, Math.min(this.rep(F.enemy), -30));
    this.g.ui.bigText(F.name.toUpperCase(), `You're a ${F.ranks[0][1]} now. The ${FACTIONS[F.enemy].name} hate your guts.`, 3200);
    this.g.bus.emit('faction:joined', { faction: f });
    this.changed();
  }
  leaveFaction() {
    const f = this.faction(); if (!f) return;
    this.g.state.setFlag('faction', null);
    this.g.state.setFlag('rep_' + f, -20);
    if (this.isActive('job_' + f)) delete this.store['job_' + f];
    this.g.bus.emit('faction:left', { faction: f });
    this.changed();
  }

  // ---------------------------------------------------------------- lifecycle
  start(id, data = {}, { silent = false } = {}) {
    const d = this.defs[id];
    if (!d) { console.warn('[quests] unknown quest', id); return false; }
    if (this.isActive(id)) return false;
    if (this.isDone(id) && !d.repeatable) return false;
    this.store[id] = { step: 0, done: false, data: { ...data }, sd: {}, t: this.g.time.day };
    this.rt[id] = {};
    this.g.bus.emit('quest:started', { id, step: 0 });
    if (!silent) {
      this.g.ui.toast(`<b>${d.kind === 'main' ? 'STORY' : d.kind === 'job' ? 'JOB' : 'NEW QUEST'}:</b> ${d.title}`, 'good', 3600);
    }
    if (d.kind === 'main' || !this.trackedId()) this.g.state.setFlag('q_tracked', id);
    this._enter(id, silent);
    return true;
  }

  _enter(id, silent = false) {
    const q = this.store[id]; const st = this.current(id);
    if (!q || !st) return;
    q.sd = {};
    this.rt[id] = { armed: true };
    const obj = st.obj || {};
    try {
      if (st.give && !this.g.state.hasItem(st.give)) this.giveItem(st.give, 1, true);
      if (obj.type === 'visit') q.sd.points = (obj.points || []).map((p) => ({ ...this.resolvePoint(p), done: false }));
      if ((obj.type === 'goto' || obj.type === 'brawl') && obj.at) q.sd.at = this.resolvePoint(obj.at);
      if (obj.type === 'wait') q.sd.due = this.g.time.day + (obj.days || 1);
      if (obj.timer) q.sd.timeLeft = obj.timer;
      st.onStart?.(this.g, q);
    } catch (e) { console.error('[quests] step start failed', id, e); }
    this.g.bus.emit('quest:step', { id, step: q.step });
    if (!silent) this.g.ui.toast(`<span class="q-toast-k">Objective</span> ${this.objectiveText(id)}`, 'info', 4200);
    this.changed();
    this._checkPolled(id);
  }

  step(id) {
    const q = this.store[id]; const st = this.current(id);
    if (!q || q.done || !st) return;
    this._finishStep(id, st, q);
    q.step++;
    if (q.step >= this.steps(id).length) this.complete(id, true);
    else this._enter(id);
  }

  setStep(id, n) {
    const q = this.store[id]; if (!q) return;
    q.step = clamp(n | 0, 0, this.steps(id).length - 1);
    q.done = false;
    this._enter(id);
  }

  _finishStep(id, st, q) {
    try {
      if (st.take) this.takeItem(st.take);
      if (st.reward) this.reward(st.reward);
      const d = this.defs[id];
      const xp = st.xp ?? STEP_XP[d?.kind]?.(q.step) ?? 0;
      if (xp > 0 && !d?.repeatable) { this.g.state.addXP(xp); this.g.ui.toast(`+${Math.round(xp)} XP`, 'stat', 1400); }
      st.onDone?.(this.g, q);
    } catch (e) { console.error('[quests] step finish failed', id, e); }
  }

  complete(id, fromStep = false) {
    const q = this.store[id]; const d = this.defs[id];
    if (!q || !d || q.done) return;
    if (!fromStep) { const st = this.current(id); if (st) this._finishStep(id, st, q); }
    q.done = true; q.step = this.steps(id).length; q.sd = {};
    try {
      const r = typeof d.reward === 'function' ? d.reward(this.g, q) : d.reward;
      if (r) this.reward(r);
      d.onComplete?.(this.g, q);
    } catch (e) { console.error('[quests] reward failed', id, e); }
    this.g.bus.emit('quest:completed', { id, step: q.step });
    if (d.repeatable) {
      const k = 'done_' + id; this.g.state.setFlag(k, (this.g.state.getFlag(k, 0) || 0) + 1);
      delete this.store[id];
      this.g.ui.toast(`<b>JOB DONE:</b> ${d.title}`, 'good', 3200);
    } else if (!d.ending) {
      this.g.ui.bigText('QUEST COMPLETE', `${d.title}${d.rewardText ? ' — ' + d.rewardText : ''}`, 3000);
    }
    if (this.trackedId() === id || !this.isActive(this.g.state.getFlag('q_tracked'))) this.g.state.setFlag('q_tracked', this.activeIds()[0] || null);
    this.changed();
    if (d.ending) setTimeout(() => this.ending(d.ending, q.data?.variant), 600);
  }

  fail(id, reason = '') {
    const d = this.defs[id]; const q = this.store[id];
    if (!q) return;
    const st = this.current(id);
    if (st?.give) this.takeItem(st.give, true);
    delete this.store[id];
    this.g.bus.emit('quest:failed', { id, reason });
    this.g.ui.toast(`<b>FAILED:</b> ${d?.title || id}${reason ? ' — ' + reason : ''}`, 'bad', 4200);
    try { d?.onFail?.(this.g, q); } catch (e) { console.error(e); }
    this.changed();
  }

  abandon(id) { this.fail(id, 'abandoned'); }

  trackedId() {
    const t = this.g.state.getFlag('q_tracked');
    if (t && this.isActive(t)) return t;
    const act = this.activeIds();
    return act.find((i) => this.defs[i]?.kind === 'job') || act.find((i) => this.defs[i]?.kind === 'main') || act[0] || null;
  }
  track(id) { this.g.state.setFlag('q_tracked', id); this.changed(); }

  // Nothing tracked after the prologue (or after an ending): point at the story doors that are
  // open to you right now, so the tracker and the map always have a next step.
  hint() {
    if (this.trackedId() || !this.isDone('main_prologue')) return null;
    const ends = this.g.state.getFlag('endings', []) || [];
    const targets = []; const names = []; const seen = new Set();
    for (const d of Object.values(this.defs)) {
      if (d.kind !== 'main' || d.id === 'main_prologue' || this.store[d.id] || seen.has(d.giver)) continue;
      let ok = true; try { ok = d.available ? !!d.available(this.g) : true; } catch { ok = false; }
      if (!ok) continue;
      const p = this.charPos(d.giver); if (!p) continue;
      seen.add(d.giver);
      const who = CHARACTERS[d.giver]?.name || d.giver;
      names.push(who);
      targets.push({ x: p.x, z: p.z, label: `${who}: ${d.title}` });
    }
    const title = ends.length ? 'Legend of Rotwell' : 'Five Doors';
    const text = targets.length
      ? `Pick a story: talk to ${names.join(', ').replace(/, ([^,]*)$/, ' or $1')} (gold "!"). J → Goals shows what each door needs.`
      : 'No new doors open yet. Raise your stats, karma or cash (J → Goals shows what each door needs), or take a side gig from anyone with a "!".';
    return { title, text, targets };
  }

  // ---------------------------------------------------------------- rewards & items
  reward(r = {}, quiet = false) {
    const g = this.g, s = g.state;
    if (r.money) s.addMoney(r.money, 'quest');
    if (r.xp) s.addXP(r.xp);
    if (r.karma) s.addStat('karma', r.karma, 'quest');
    for (const [k, v] of Object.entries(r.stats || {})) s.addStat(k, v, 'quest');
    for (const [k, v] of Object.entries(r.items || {})) this.giveItem(k, v, quiet);
    if (r.weapon) this.giveWeapon(r.weapon);
    if (r.car) this.giveCar(Array.isArray(r.car) ? r.car : [r.car], r.carColor, r.carFallback ?? 2000);
    for (const [k, v] of Object.entries(r.rep || {})) this.addRep(k, v);
    for (const [k, v] of Object.entries(r.flags || {})) s.setFlag(k, v);
    if (r.heat) s.addHeat(r.heat);
  }
  giveItem(id, qty = 1, quiet = false) {
    this.g.state.addItem(id, qty);
    if (!quiet) this.g.ui.toast(`Got: <b>${this.itemName(id)}</b>${qty > 1 ? ' ×' + qty : ''}`, 'good', 2600);
  }
  takeItem(id, quiet = true) {
    const n = this.g.state.itemCount(id);
    if (n > 0) this.g.state.addItem(id, -n);
    if (!quiet && n) this.g.ui.toast(`Handed over: ${this.itemName(id)}`, 'info', 2000);
  }
  giveWeapon(id) {
    const p = this.g.state.p;
    if (!Array.isArray(p.weapons)) p.weapons = ['fists'];
    if (!p.weapons.includes(id)) p.weapons.push(id);
    this.g.state.changed('weapons');
    this.g.bus.emit('weapon:gained', { id });
    this.g.ui.toast(`New weapon: <b>${WEAPONS[id]?.name || id}</b> (press <kbd>Q</kbd>)`, 'good', 3200);
  }
  giveCar(ids, color, fallbackMoney = 2000) {
    const g = this.g;
    const CARS = this.cars || {};
    let carId = ids.find((i) => CARS[i]);
    if (!carId) {
      const wantBike = ids.some((i) => /moto|bike/.test(i));
      const list = Object.entries(CARS).filter(([, c]) => !wantBike || c.kind === 'moto' || c.kind === 'bike');
      list.sort((a, b) => (a[1].price || 0) - (b[1].price || 0));
      carId = (list.find(([, c]) => c.kind === 'moto') || list[Math.min(1, list.length - 1)] || [])[0];
    }
    if (carId && g.vehicles?.giveCar) {
      try {
        if (g.vehicles.giveCar(carId, color || undefined)) return true;
      } catch (e) { console.error('[quests] giveCar failed', e); }
    }
    g.state.addMoney(fallbackMoney, 'quest (no garage)');
    g.ui.toast(`No garage space, so you got ${fmtMoney(fallbackMoney)} instead.`, 'money', 3000);
    return false;
  }

  // ---------------------------------------------------------------- positions
  playerPos() {
    const p = this.g.player; if (!p) return null;
    return p.vehicle?.group?.position || p.group.position;
  }
  locPos(id) {
    const l = this.g.locations.get(id);
    return l ? { x: l.doorX ?? l.x, z: l.doorZ ?? l.z, label: l.name } : null;
  }
  charPos(id) {
    const w = this.world?.charPos(id);
    if (w) return w;
    const c = CHARACTERS[id];
    return c ? this.locPos(c.loc) : null;
  }
  districtName(d) { return { downtown: 'Downtown', hilltop: 'Hilltop Heights', rustyards: 'the Rustyards', gutterside: 'Gutterside', dustbowl: 'the Dustbowl' }[d] || d; }

  // A walkable-ish point inside a district.
  districtPoint(d) {
    const g = this.g, w = g.world;
    for (let i = 0; i < 8; i++) {
      try {
        const p = w?.randomSidewalkPoint?.(d);
        if (p && Number.isFinite(p.x) && (!w.districtAt || w.districtAt(p.x, p.z) === d) && !g.physics.pointBlocked(p.x, p.z)) return { x: p.x, z: p.z };
      } catch { /* ignore */ }
    }
    let locs = g.locations.list.filter((l) => l.district === d);
    if (!locs.length) locs = g.locations.list;
    for (let i = 0; i < 20; i++) {
      const l = pick(locs); if (!l) break;
      const dx = (l.doorX ?? l.x) - l.x, dz = (l.doorZ ?? l.z) - l.z;
      const base = Math.atan2(dx, dz) || 0;
      const a = base + (Math.random() - 0.5) * 2.2;
      const r = 7 + Math.random() * 9;
      const x = (l.doorX ?? l.x) + Math.sin(a) * r, z = (l.doorZ ?? l.z) + Math.cos(a) * r;
      if (!g.physics.pointBlocked(x, z)) return { x, z };
    }
    const l = pick(locs);
    return l ? { x: l.doorX ?? l.x, z: (l.doorZ ?? l.z) + 4 } : { x: 0, z: 0 };
  }

  resolvePoint(spec) {
    if (!spec) return { x: 0, z: 0 };
    if (spec.loc) { const p = this.locPos(spec.loc); return { ...(p || { x: 0, z: 0 }), label: spec.label || p?.label }; }
    if (Number.isFinite(spec.x)) return { x: spec.x, z: spec.z, label: spec.label };
    if (spec.district) return { ...this.districtPoint(spec.district), label: spec.label };
    return { x: 0, z: 0, label: spec.label };
  }

  // Where the current step wants you to go: [{ x, z, label }]
  targets(id) {
    const st = this.current(id); const q = this.store[id];
    if (!st || !q) return [];
    const o = st.obj || {};
    const d = this.defs[id];
    switch (o.type) {
      case 'talk': { const p = this.charPos(o.who); return p ? [{ ...p, label: CHARACTERS[o.who]?.name || o.who }] : []; }
      case 'goto': case 'brawl': {
        const p = q.sd.at || (o.loc ? this.locPos(o.loc) : null);
        return p ? [{ x: p.x, z: p.z, label: o.label || p.label || d.title }] : [];
      }
      case 'visit': return (q.sd.points || []).filter((p) => !p.done).map((p) => ({ x: p.x, z: p.z, label: p.label || d.title }));
      default: return this._markerTargets(st, d);
    }
  }

  // Optional `marker` on any step (event/stat/check/money/...): where the player should go to do it.
  // { loc } | { loc: [ids] } (nearest) | { who } | { near: 'dealer' } (nearest dealer NPC) | (g) => {x,z,label}
  _markerTargets(st, d) {
    const m = st.marker;
    if (!m) return [];
    try {
      const pos = this.playerPos() || { x: 0, z: 0 };
      const near = (pts) => pts.filter(Boolean).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z))[0];
      let t = null;
      if (typeof m === 'function') t = m(this.g);
      else if (m.who) { const p = this.charPos(m.who); t = p && { ...p, label: CHARACTERS[m.who]?.name }; }
      else if (m.near === 'dealer') {
        const ds = (this.g.npcs?.list?.() || []).filter((n) => n.kind === 'dealer' && !n.dead).map((n) => ({ x: n.pos.x, z: n.pos.z, label: n.name ? `${n.name} (dealer)` : 'Dealer' }));
        t = near(ds);
      } else if (m.loc) {
        const ids = Array.isArray(m.loc) ? m.loc : [m.loc];
        t = near(ids.map((i) => this.locPos(i)));
      }
      return t ? [{ x: t.x, z: t.z, label: m.label || t.label || d.title }] : [];
    } catch { return []; }
  }

  // '?' = has something for you right now, '!' = offers a new quest.
  charIndicator(charId) {
    for (const id of this.activeIds()) {
      const o = this.current(id)?.obj;
      if (o?.type === 'talk' && o.who === charId) return '?';
    }
    return this.offersFor(charId).length ? '!' : null;
  }
  offersFor(charId) {
    const out = [];
    for (const d of Object.values(this.defs)) {
      if (d.giver !== charId || d.repeatable || this.store[d.id]) continue;
      let ok = true;
      try { ok = d.available ? !!d.available(this.g) : true; } catch { ok = false; }
      if (ok) out.push(d);
    }
    return out;
  }

  // ---------------------------------------------------------------- update loop
  update(dt) {
    const g = this.g;
    if (!g.started || !g.player) return;
    // timers (pause while a dialog/menu is open)
    if (!g.controlsLocked) {
      for (const id of this.activeIds()) {
        const q = this.store[id];
        if (q.sd?.timeLeft == null) continue;
        // a night-only timed step doesn't burn its clock during the day (you can't do it yet)
        if (this.current(id)?.obj?.night && !g.time.isNight) continue;
        q.sd.timeLeft -= dt;
        if (q.sd.timeLeft <= 0) this._timeout(id);
      }
    }
    this._poll += dt;
    if (this._poll < 0.2) return;
    this._poll = 0;
    if (g.player.dead || g.ui.isBlocking()) return;
    for (const id of this.activeIds()) {
      try { this._checkPolled(id); this._checkSpatial(id); } catch (e) {
        if (!this._errLogged) { console.error('[quests] check failed', id, e); this._errLogged = true; }
      }
    }
  }

  _timeout(id) {
    const d = this.defs[id]; const st = this.current(id);
    if (!st) return;
    if (d.repeatable) { this.fail(id, 'out of time'); return; }
    this.g.ui.toast(st.failText || 'Out of time! Try again.', 'bad', 4500);
    if (st.give) this.takeItem(st.give);
    this._enter(id, true);
  }

  _persistTimers() { /* timeLeft already lives in q.sd, which is saved as-is */ }

  _checkPolled(id) {
    const g = this.g, p = g.state.p;
    const q = this.store[id]; const st = this.current(id);
    if (!q || !st || this.rt[id]?.busy) return;
    const o = st.obj || {};
    let done = false;
    switch (o.type) {
      case 'stat': done = (o.stat === 'level' ? p.level : p[o.stat] ?? 0) >= o.min; break;
      case 'money': done = o.max != null ? p.money <= o.max : p.money >= o.min; break;
      case 'check': done = !!o.check?.(g, q); break;
      case 'flag': done = g.state.getFlag(o.flag) === (o.value ?? true); break;
      case 'home': done = (p.ownedHomes?.length || 0) >= 2 || !!q.sd.bought; break;
      case 'job': done = (p.job?.rank ?? 0) >= (o.rank || 2); break;
      case 'wait': done = g.time.day >= (q.sd.due || 0); break;
      case 'event': done = !!o.orCheck?.(g, q); break;
      default: return;
    }
    if (done) {
      if (st.done) g.ui.toast(st.done.replace(/^> /, ''), 'info', 5000);
      this.step(id);
    }
  }

  _checkSpatial(id) {
    const g = this.g; const q = this.store[id]; const st = this.current(id);
    if (!q || !st) return;
    const o = st.obj || {};
    if (!['goto', 'brawl', 'visit'].includes(o.type)) return;
    const pos = this.playerPos(); if (!pos) return;
    const rt = this.rt[id] || (this.rt[id] = { armed: true });
    if (rt.busy) return;
    if (o.type === 'visit') {
      const pts = q.sd.points || [];
      const R = o.radius || 6;
      pts.forEach((pt, i) => {
        if (pt.done || Math.hypot(pt.x - pos.x, pt.z - pos.z) > R) return;
        pt.done = true;
        const txt = st.visitText?.[pts.filter((x) => x.done).length - 1] || st.visitText?.[i];
        g.ui.toast(txt || `${pt.label || 'Spot'} checked off.`, 'good', 4200);
        this.changed();
      });
      if (pts.length && pts.every((x) => x.done)) this.step(id);
      return;
    }
    const tgt = this.targets(id)[0]; if (!tgt) return;
    const R = o.radius || 7;
    const d = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
    if (d > R) { if (d > R + 6) { rt.armed = true; rt.warned = false; } return; }
    if (!rt.armed) return;
    const warn = (msg) => { if (!rt.warned) { g.ui.toast(msg, 'bad', 3800); rt.warned = true; } };
    if (o.night && !g.time.isNight) return warn('This has to happen after dark (8 PM - 6 AM). Come back later.');
    if (o.needCar && g.vehicles && !g.player.vehicle) return warn('You need to be driving a car for this.');
    if (o.req && !o.req(g)) return warn(o.reqText || "You're not ready for this yet.");
    rt.armed = false;
    this._arrive(id);
  }

  async _arrive(id) {
    const g = this.g; const q = this.store[id]; const st = this.current(id);
    const stepAt = q.step; const rt = this.rt[id];
    rt.busy = true;
    try {
      const ctx = { q, def: this.defs[id], title: this.defs[id].title };
      if (st.obj.type === 'brawl') {
        let r = st.arrive ? await this.say(st.arrive, ctx) : 'advance';
        if (r === 'stay' || r === 'decline') return;
        const o = st.obj;
        const won = await this.brawl({ count: o.count, kind: o.kind, tier: o.tier, label: o.label });
        if (!this._still(id, stepAt)) return;
        if (won) {
          if (st.win) await this.say(st.win, ctx);
          if (st.winGive) this.giveItem(st.winGive);
          this.step(id);
        } else {
          g.ui.toast(`${o.label} kicked your ass. Heal up and come back.`, 'bad', 4200);
        }
        return;
      }
      let r = st.run ? await st.run(g, q) : (st.arrive ? await this.say(st.arrive, ctx) : 'advance');
      if (r == null) r = 'stay';
      if (this._still(id, stepAt)) this._apply(id, r);
    } catch (e) {
      console.error('[quests] arrive failed', id, e);
    } finally { rt.busy = false; }
  }

  _still(id, stepAt) { const q = this.store[id]; return !!q && !q.done && q.step === stepAt; }

  _apply(id, r) {
    if (r === 'advance' || r === 'accept') this.step(id);
    else if (r === 'complete') this.complete(id);
    else if (r === 'fail') this.fail(id);
    else if (typeof r === 'number') this.setStep(id, r);
  }

  _onEvent(evt, data) {
    if (evt === 'home:bought') {
      for (const id of this.activeIds()) { const st = this.current(id); if (st?.obj?.type === 'home') this.store[id].sd.bought = true; }
    }
    for (const id of this.activeIds()) {
      const st = this.current(id); const o = st?.obj; const q = this.store[id];
      if (!o || o.type !== 'event') continue;
      if (!(o.evt === evt || o.evts?.includes(evt))) continue;
      try { if (o.filter && !o.filter(data, evt, this.g)) continue; } catch { continue; }
      const inc = o.sum ? Math.max(1, Number(data?.[o.sum]) || 1) : 1;
      q.sd.n = (q.sd.n || 0) + inc;
      if (q.sd.n >= o.count) this.step(id);
      else { if (!o.quiet) this.g.ui.toast(`${this.defs[id].title}: ${Math.min(q.sd.n, o.count)}/${o.count}`, 'stat', 2000); this.changed(); }
    }
  }

  // ---------------------------------------------------------------- talking
  async talkTo(charId) {
    if (this._talking || this.g.ui.isBlocking()) return;
    this._talking = true;
    try { await this._talk(charId); } catch (e) { console.error('[quests] talk failed', charId, e); } finally { this._talking = false; this.changed(); }
  }

  async _talk(charId) {
    const g = this.g; const c = CHARACTERS[charId];
    if (!c) return;
    const hooks = this.activeIds().filter((id) => { const o = this.current(id)?.obj; return o?.type === 'talk' && o.who === charId; });
    const offers = this.offersFor(charId);
    let extras = [];
    try { extras = this.charMenus[charId]?.(g) || []; } catch (e) { console.error(e); }
    if (hooks.length + offers.length === 1 && !extras.length) {
      if (hooks.length) return this.runTalkStep(hooks[0], charId);
      return this.runOffer(offers[0], charId);
    }
    const opts = [];
    for (const id of hooks) opts.push({ label: `<b class="q-mark">?</b> ${this.defs[id].title}`, hint: this.defs[id].kind === 'main' ? 'story' : 'quest', go: () => this.runTalkStep(id, charId) });
    for (const d of offers) opts.push({ label: `<b class="q-mark new">!</b> ${d.title}`, hint: d.kind === 'main' ? 'new story' : 'new quest', go: () => this.runOffer(d, charId) });
    for (const e of extras) opts.push({ label: e.label, hint: e.hint, disabled: e.disabled, go: e.run });
    opts.push({ label: 'Leave' });
    let line = null;
    try { line = c.after?.(g) || null; } catch { line = null; }
    line = line || pick(c.idle || ['...']);
    if (!hooks.length && !offers.length) {
      const locked = Object.values(this.defs).find((d) => d.giver === charId && !this.store[d.id] && d.lockedText);
      const lt = locked ? locked.lockedText(g) : null;
      if (lt) line = lt;
    }
    const i = await g.ui.dialog({ title: c.title, speaker: c.name.toUpperCase(), html: this.fmt(line), options: opts });
    if (i == null) return;
    await opts[i]?.go?.();
  }

  async runTalkStep(id, charId) {
    const q = this.store[id]; const st = this.current(id);
    if (!st) return;
    const stepAt = q.step;
    const ctx = { q, char: charId, def: this.defs[id], title: this.defs[id].title };
    this.rt[id] = this.rt[id] || {};
    this.rt[id].busy = true;
    let r;
    try { r = st.run ? await st.run(this.g, q) : await this.say(st.talk || [], ctx); } finally { if (this.rt[id]) this.rt[id].busy = false; }
    if (r == null) r = 'stay';
    if (this._still(id, stepAt)) this._apply(id, r);
  }

  async runOffer(def, charId) {
    const pages = [...(def.offer || [])];
    const last = pages[pages.length - 1];
    const lastObj = typeof last === 'string' || Array.isArray(last) ? { t: last } : last;
    if (!lastObj?.choices) {
      pages[pages.length - 1] = { ...lastObj, choices: [
        { label: 'Sure, I\'ll do it.', hint: def.rewardText ? 'reward: ' + def.rewardText : '', result: 'accept' },
        { label: 'Not right now.', result: 'decline' },
      ] };
    } else if (def.rewardText) {
      // Custom offer pages: still show the payoff on the first (accepting) choice before you commit.
      pages[pages.length - 1] = { ...lastObj, choices: lastObj.choices.map((c, i) => (i === 0 && !['decline', 'stay'].includes(c.result) && typeof c.hint !== 'function' && !/reward/i.test(c.hint || '')
        ? { ...c, hint: `${c.hint ? c.hint + ' · ' : ''}reward: ${def.rewardText}` } : c)) };
    }
    const r = await this.say(pages, { char: charId, def, title: def.title });
    if (r === 'accept') this.start(def.id);
  }

  // ---------------------------------------------------------------- dialog helpers
  fmt(t, who) {
    const name = esc(this.g.state.p.name || 'You');
    const lines = Array.isArray(t) ? t : [t];
    return lines.filter((l) => l != null).map((l) => {
      let s = String(l).replace(/\{name\}/g, '\u0001');
      let cls = '';
      if (s.startsWith('> ')) { s = s.slice(2); cls = 'q-nar'; } else if (s.startsWith('@ ')) { s = s.slice(2); cls = 'q-you'; }
      s = esc(s).replace(/\u0001/g, name).replace(/\*(.+?)\*/g, '<em>$1</em>');
      if (cls === 'q-you') return `<p class="q-you"><b>${name}:</b> ${s}</p>`;
      if (cls === 'q-nar') return `<p class="q-nar">${s}</p>`;
      return `<p class="q-say">${s}</p>`;
    }).join('');
  }

  speakerFor(who, ctx) {
    if (who === 'nar') return '';
    if (who === 'you') return (this.g.state.p.name || 'You').toUpperCase();
    const c = CHARACTERS[who];
    if (c) return c.name.toUpperCase();
    return String(who || '').toUpperCase();
  }

  // Play a script. Resolves to a result string (see data/quests.js header).
  async say(pages, ctx = {}) {
    if (!pages) return 'advance';
    if (!Array.isArray(pages)) pages = [pages];
    for (let i = 0; i < pages.length; i++) {
      let page = pages[i];
      try { if (typeof page === 'function') page = page(this.g, ctx.q, ctx); } catch (e) { console.error(e); page = null; }
      if (!page) continue;
      if (typeof page === 'string' || Array.isArray(page)) page = { t: page };
      const r = await this._page(page, ctx, i === pages.length - 1 && !ctx._nested);
      if (r !== 'advance') return r;
    }
    return 'advance';
  }

  async _page(page, ctx, isLast) {
    const g = this.g;
    const who = page.who ?? ctx.char ?? 'nar';
    const html = page.html ?? this.fmt(page.t ?? '', who);
    const title = ctx.title || CHARACTERS[who]?.title || '';
    const speaker = this.speakerFor(who, ctx);
    const choices = (page.choices || []).filter((c) => { try { return !c.hide?.(g, ctx.q); } catch { return true; } });
    if (!choices.length) {
      await g.ui.dialog({ title, speaker, html, options: [{ label: page.next || (isLast ? 'Okay.' : 'Continue') }] });
      return 'advance';
    }
    const opts = choices.map((c) => {
      let ok = true;
      try { ok = !c.if || !!c.if(g, ctx.q); } catch { ok = false; }
      let hint = c.hint || '';
      try { if (typeof hint === 'function') hint = hint(g, ctx.q) || ''; } catch { hint = ''; }
      return { label: c.label, hint, disabled: !ok };
    });
    const i = await g.ui.dialog({ title, speaker, html, options: opts });
    if (i == null) return 'stay';
    const c = choices[i];
    let r;
    try { r = c.do ? await c.do(g, ctx.q, ctx) : undefined; } catch (e) { console.error('[quests] choice failed', e); r = 'stay'; }
    if (r === undefined || r === null) r = c.result ?? 'advance';
    if (c.then && r !== 'stay' && r !== 'decline') {
      const r2 = await this.say(c.then, { ...ctx, _nested: !isLast || ctx._nested });
      if (r === 'advance' && r2 !== 'advance') r = r2;
    }
    return r;
  }

  // Single question dialog -> index or null.
  ask({ title = '', speaker = '', text = '', options = [] }) {
    return this.g.ui.dialog({ title, speaker, html: this.fmt(String(text).split('\n\n')), options });
  }

  // ---------------------------------------------------------------- fights
  // Resolves true on win. Uses the combat module when present, else a stat roll.
  brawl(spec = {}) {
    const g = this.g;
    const pos = this.playerPos() || { x: 0, z: 0 };
    const full = { x: pos.x, z: pos.z, count: 2, kind: 'thug', tier: 1, label: 'Some Jerks', ...spec };
    return new Promise((resolve) => {
      let done = false; const offs = []; let timer = null;
      const finish = (v) => {
        if (done) return; done = true;
        offs.forEach((f) => f()); clearTimeout(timer);
        resolve(v);
      };
      if (g.combat?.startBrawl) {
        let bid;
        try {
          bid = g.combat.startBrawl({ ...full, onWin: () => finish(true), onLose: () => finish(false) });
        } catch (e) { console.error('[quests] startBrawl failed', e); this._fallbackFight(full).then(finish); return; }
        offs.push(g.bus.on('brawl:won', (d) => { if (bid != null && d?.id === bid) finish(true); }));
        offs.push(g.bus.on('brawl:lost', (d) => { if (bid != null && d?.id === bid) finish(false); }));
        offs.push(g.bus.on('player:died', () => finish(false)));
        offs.push(g.bus.on('player:arrested', () => finish(false)));
        timer = setTimeout(() => finish(false), 6 * 60 * 1000);
        g.ui.toast(`<b>FIGHT:</b> ${full.label}!`, 'bad', 2400);
      } else {
        this._fallbackFight(full).then(finish);
      }
    });
  }

  async _fallbackFight(spec) {
    const g = this.g, p = g.state.p;
    const chance = clamp(0.5 + (p.str - spec.tier * 9) / 40 - (spec.count - 1) * 0.04, 0.08, 0.95);
    const i = await g.ui.dialog({
      title: 'Fight!', speaker: spec.label.toUpperCase(),
      html: this.fmt([`> ${spec.count > 1 ? spec.count + ' of them' : 'One of them'} square${spec.count > 1 ? '' : 's'} up. Knuckles crack. Somebody\'s mom is gonna get a phone call.`]),
      options: [{ label: 'Throw down', hint: `${Math.round(chance * 100)}% odds` }, { label: 'Back off', hint: 'run away' }],
    });
    if (i !== 0) return false;
    if (Math.random() < chance) {
      p.totals.fightsWon = (p.totals.fightsWon || 0) + 1;
      g.state.damage(Math.round(5 + spec.tier * 3 * Math.random()), 'brawl');
      g.state.addXP(15 + spec.tier * 10);
      g.ui.toast(`You beat ${spec.label}. ${pick(['Knuckles bloody, pride intact.', 'They\'ll feel that tomorrow. So will you.', 'Somebody call an ambulance. Not for you.'])}`, 'good', 3200);
      g.bus.emit('brawl:won', { id: 'quest-fallback', label: spec.label });
      return true;
    }
    p.totals.fightsLost = (p.totals.fightsLost || 0) + 1;
    g.state.damage(15 + spec.tier * 6, 'brawl');
    g.bus.emit('brawl:lost', { id: 'quest-fallback', label: spec.label });
    return false;
  }

  // Set by the UI module.
  ending(id, variant) { this.g.bus.emit('quests:ending-request', { id, variant }); }
}
