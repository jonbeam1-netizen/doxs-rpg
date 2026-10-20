import { HEISTS, GEAR, MASKS, GUARD_NAMES, GUARD_BARKS, RADIO, DROP_HOT, DROPOFF_LABEL, FENCE_CUT, PRESS_VALUE, PRESS_FLOOR, PRESS_COOLDOWN, PRESS_DECAY_DAYS, FAIL_COOLDOWN, FAIL_LEGAL } from '../data/heists.js';
import { clamp, rand, randInt, pick, chance, fmtMoney, esc, uid as makeUid, angleLerp } from '../core/util.js';
import { HeistHud } from './hud.js';
import { createBag, bagOnBack, wearMask, createProp, createBeacon, pulseBeacon } from './meshes.js';
import { startLockpick, startHack } from './minigames.js';

// Heist runtime. One run at a time per machine.
//   - The machine that launched the run is its AUTHORITY (single-player, the co-op host, or a client
//     running a solo-local job). It owns guards, the armored truck, the timer, objectives and loot.
//   - When the authority is the co-op host, the snapshot `s` is broadcast as heist:state and every crew
//     member mirrors it; clients send their actions (heist:act / heist:loot) to the host.
// Snapshot s = { uid, id, name, approach, leader, phase, reason, timeLeft, alarm, susp, crew[], obj[], bags[],
//   truck, drop {x,z,label}, target {x,z}, gear {id:true}, extraGot }
// bag.s: g = on the ground, c = carried (by), k = stashed in a car (by), s = secured, x = lost

const SPOTS = { door: [0, 1.7], left: [-5, 1.5], right: [5, 1.5], farLeft: [-9, 1.5], farRight: [9, 1.5], street: [0, 7] };
const PROP_FOR = { hold: 'safe', lockpick: 'door', hack: 'panel' };
const CARRY_SLOW = 0.72;
const TRUCK_STOPS = [['first_bank', 22], ['gas_n_gulp', 8], ['pizza_butt', 8], ['city_hall', 8]];
const GUARD_COLOR = '#2b3442';

export class HeistManager {
  constructor(game) {
    this.g = game;
    this.s = null;           // current snapshot (authority's live object or a client's mirror)
    this.auth = false;       // this machine runs the show
    this.shared = false;     // broadcasting to a co-op crew
    this.A = null;           // authority-only runtime
    this.hud = new HeistHud(game);
    this.masked = false;
    this.maskObj = null;
    this.mg = null;
    this.carryApplied = 1;
    this.t = 0;
    this.v = this._freshView();
    this.leftovers = [];     // npcs/cars to clean up after a run
    // Yard Boss career perk: Scrapper Pete leaves a spike strip out for you every morning
    game.bus.on('time:day', () => { try { if (game.state.getFlag('perk_spikes')) { const h = this.h; if ((h.gear.spikes || 0) < 1) { h.gear.spikes = 1; game.state.changed('heists'); } } } catch { /* ignore */ } });
  }

  // ------------------------------------------------------------------ economy (balance pass 6)
  // Press on a target: completions pile up, bleeding off 1 per PRESS_DECAY_DAYS.
  press(id) {
    const P = this.h.press?.[id];
    if (!P) return 0;
    const decay = Math.floor(Math.max(0, this.g.time.total - (P.t || 0)) / (PRESS_DECAY_DAYS * 1440));
    return Math.max(0, (P.n || 0) - decay);
  }
  pressMult(id) { return Math.max(PRESS_FLOOR, 1 - PRESS_VALUE * this.press(id)); }
  fenceCut() { try { const f = this.g.lifestyle?.fenceCut?.(); if (Number.isFinite(f)) return f; } catch { /* ignore */ } return FENCE_CUT; }
  fee(id) { return Math.round(HEISTS[id]?.fee || 0); }
  cooldownFor(id) { const d = HEISTS[id]; return d ? Math.round(d.cooldown * (1 + PRESS_COOLDOWN * Math.max(0, this.press(id) - 1))) : 0; }
  // What you'd actually pocket (solo), for the board: headline take x press x quiet, minus fence and fee.
  estimate(id, approach = 'quiet') {
    const d = HEISTS[id];
    if (!d) return { gross: 0, net: 0 };
    let gross = (d.bags.count * (d.bags.value[0] + d.bags.value[1]) / 2) * this.pressMult(id) + (d.extra[0] + d.extra[1]) / 2;
    if (approach === 'quiet') gross *= d.quietBonus || 1;
    let pm = 1; try { pm = Number(this.g.perks?.mult?.('heistTake') ?? 1) || 1; } catch { /* ignore */ }
    const net = gross * pm * (1 - this.fenceCut()) - this.fee(id);
    return { gross: Math.round(gross), net: Math.round(net), fence: this.fenceCut(), fee: this.fee(id), press: this.press(id), pressMult: this.pressMult(id) };
  }

  _freshView() {
    return {
      uid: null, bagMeshes: new Map(), props: new Map(), beacons: new Map(), interacts: new Set(),
      remoteMasks: new Map(), myCars: new Map(), truckMirror: null, holdAcc: 0, holdSendT: 0, warnT: 0,
      ramCd: 0, lastAlarm: false, lastDoneKeys: new Set(), lowTimeSaid: false, heatT: 0, dropHotT: 0, bagsSaid: false, getaway: null,
      securedSaid: 0,
    };
  }

  // ------------------------------------------------------------------ helpers
  get net() { return this.g.net; }
  me() { return this.net.connected ? this.net.localId : 'local'; }
  get h() { return this.ensure(); }
  ensure() {
    const p = this.g.state.p;
    if (!p.heists || typeof p.heists !== 'object') p.heists = {};
    const h = p.heists;
    h.done ||= {}; h.best ||= {}; h.last ||= {}; h.failedAt ||= {}; h.gear ||= {}; h.intel ||= {}; h.news ||= [];
    if (!Array.isArray(h.masks)) h.masks = ['stocking'];
    if (!h.masks.includes('stocking')) h.masks.unshift('stocking');
    if (!MASKS[h.mask]) h.mask = 'stocking';
    h.total ||= 0;
    return h;
  }

  status(id) {
    const def = HEISTS[id];
    if (!def) return { ok: false, why: 'No such job.' };
    let u = { ok: true };
    try { u = def.unlock(this.g) || { ok: true }; } catch (e) { console.error('[heists] unlock check failed', e); }
    if (!u.ok) return { ok: false, locked: true, why: u.why };
    const h = this.h, now = this.g.time.total;
    const cdA = (h.last[id] ?? -1e9) + this.cooldownFor(id) - now;
    const cdB = (h.failedAt[id] ?? -1e9) + Math.max(6 * 60, def.cooldown * FAIL_COOLDOWN) - now;
    const cd = Math.max(cdA, cdB);
    if (cd > 0) return { ok: false, cooldown: cd, why: `Cooling off: ${Math.ceil(cd / 60)}h left.` };
    return { ok: true };
  }

  crewPos(id) {
    if (id === this.me()) {
      const pl = this.g.player;
      return pl.vehicle ? pl.vehicle.group.position : pl.group.position;
    }
    const rp = this.net.remotePlayers.get(id);
    return rp?.pos || rp?.group?.position || this.A?.lastPos.get(id) || null;
  }

  crewModel(id) {
    if (id === this.me()) return this.g.player.vehicle ? null : this.g.player.model;
    const rp = this.net.remotePlayers.get(id);
    return rp && !rp.vehicle ? rp._model : null;
  }

  locPoint(locId) {
    const loc = this.g.locations.get(locId);
    if (!loc) return null;
    return { x: loc.doorX ?? loc.x, z: loc.doorZ ?? loc.z, loc };
  }

  spotPos(locId, spot) {
    const loc = this.g.locations.get(locId);
    if (!loc) return { x: 0, z: 0, f: 0 };
    const dx = loc.doorX ?? loc.x, dz = loc.doorZ ?? loc.z;
    const ph = this.g.physics;
    let nx = dx - loc.x, nz = dz - loc.z;
    // Prefer the building's collision box: the door sits just outside one of its faces.
    let found = false;
    for (const d of [0.8, 1.6, 2.6, 3.6]) {
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let b = null;
        try { b = ph.pointBlocked(dx - ux * d, dz - uz * d); } catch { b = null; }
        if (b && b.tag !== 'water') { nx = ux; nz = uz; found = true; break; }
      }
      if (found) break;
    }
    const len = Math.hypot(nx, nz);
    if (len < 0.01) { nx = 0; nz = 1; } else { nx /= len; nz /= len; }
    const tx = -nz, tz = nx;
    const [a, b] = SPOTS[spot] || SPOTS.door;
    let x = dx + tx * a + nx * b, z = dz + tz * a + nz * b;
    for (let i = 0; i < 6; i++) {
      const r = ph.resolveCircle(x, z, 0.7);
      if (!r.hit && !ph.pointBlocked(x, z)) break;
      if (r.hit && (r.x !== x || r.z !== z)) { x = r.x; z = r.z; } else { x += nx * 0.8; z += nz * 0.8; }
    }
    return { x, z, f: Math.atan2(nx, nz) };
  }

  gearUnion(ids) { const o = {}; for (const id of ids) if (GEAR[id]) o[id] = true; return o; }
  myGearIds() { const g = this.h.gear; return Object.keys(g).filter((k) => (g[k] || 0) > 0); }

  needFor(o, gear) {
    let n = o.base;
    for (const [gid, mult] of Object.entries(o.fast || {})) if (gear[gid]) n = Math.min(n, o.base * mult);
    return Math.round(n * 10) / 10;
  }

  // Consume the one-use gear that this job actually uses.
  consumeGear(def) {
    const h = this.h, used = [];
    for (const gid of def.uses || []) {
      if ((h.gear[gid] || 0) > 0 && !GEAR[gid]?.perm) { h.gear[gid]--; if (h.gear[gid] <= 0) delete h.gear[gid]; used.push(GEAR[gid].name); }
    }
    return used;
  }

  toast(html, kind = 'info', ms = 3800) { try { this.g.ui.toast(html, kind, ms); } catch { /* ignore */ } }

  // ------------------------------------------------------------------ start (authority)
  startRun(id, approach, { pitcher = null, pitcherInfo = {}, invite = true } = {}) {
    const g = this.g, def = HEISTS[id];
    if (!def || this.s) return false;
    const target = this.locPoint(def.loc), drop = this.locPoint(def.dropoff);
    if (!target || !drop) { this.toast('Terry\'s map is missing that building. Weird.', 'bad'); return false; }
    const me = this.me();
    const myGear = this.myGearIds();
    const gear = this.gearUnion(myGear);
    const used = this.consumeGear(def);
    const dropAt = this.spotPos(def.dropoff, 'street'); // out on the street, clear of the door prompt

    const obj = def.objectives[approach].map((o) => {
      const r = { k: o.k, type: o.type, label: o.label, x: target.x, z: target.z, f: 0, r: 2.4, base: o.need || 0, need: o.need || 0, fast: o.fast || null,
        prog: 0, done: false, pins: o.pins || 3, rounds: o.rounds || 3, verb: o.verb || 'Working', onDone: o.onDone || '', spot: o.spot || null };
      if (o.spot && o.spot !== 'truckRear') { const p = this.spotPos(def.loc, o.spot); r.x = p.x; r.z = p.z; r.f = p.f; }
      if (o.type === 'goto') r.r = 16;
      if (o.type === 'escape') { r.x = dropAt.x; r.z = dropAt.z; r.r = 8; }
      if (o.type === 'hold') r.need = this.needFor(r, gear);
      return r;
    });
    // loot objective sits where the bags spawn
    const bagObj = [...obj].reverse().find((o) => o.onDone.includes('bags'));
    for (const o of obj) if (o.type === 'loot' && bagObj) { o.x = bagObj.x; o.z = bagObj.z; }

    const s = {
      uid: makeUid(), id, name: def.name, approach, leader: me, phase: 'active', reason: '',
      timeLeft: def.time, alarm: false, susp: 0, extraGot: 0,
      crew: [{ id: me, name: this.myName(), masked: this.masked, mask: this.h.mask, out: false }],
      obj, bags: [], truck: null,
      drop: { x: dropAt.x, z: dropAt.z, label: DROPOFF_LABEL[def.dropoff] || drop.loc.name },
      target: { x: target.x, z: target.z, label: target.loc.name },
      gear,
    };
    this.s = s;
    this.auth = true;
    this.shared = !!(this.net.connected && this.net.isHost);
    this.A = {
      def, guards: [], civ: null, truck: null, waveT: def.waves?.every ?? 0, radioT: 0, sendT: 0, dirty: true,
      lastPos: new Map(), busy: new Map(), alarmHostileT: 0, barkT: 3, heatT: 0, ramT: 0,
    };
    try { this.spawnGuards(); } catch (e) { console.error('[heists] guards failed', e); }
    try { this.spawnCiv(); } catch (e) { console.error('[heists] civ failed', e); }
    if (obj.some((o) => o.type === 'truck_find')) { try { this.spawnTruck(); } catch (e) { console.error('[heists] truck failed', e); } }
    if (pitcher && pitcher !== me) this.addCrew(pitcher, { name: this.net.remotePlayers.get(pitcher)?.name || pitcherInfo.name || 'Your buddy', gear: pitcherInfo.gear || [], mask: pitcherInfo.mask });
    this.onLocalStart(used);
    if (this.shared && invite) {
      this.net.broadcast({ t: 'heist:invite', uid: s.uid, id, name: def.name, approach, leaderName: this.myName() });
      this.toast('📞 Crew invites sent. Anyone who accepts gets the markers.', 'info');
    }
    this.broadcastState(true);
    return true;
  }

  myName() { return String(this.g.state.p.name || 'Dox').slice(0, 16); }

  addCrew(id, { name = 'Somebody', gear = [], mask = 'stocking' } = {}) {
    const s = this.s;
    if (!s || s.phase !== 'active') return false;
    if (s.crew.some((c) => c.id === id)) return true;
    if (s.crew.length >= 4) return false;
    s.crew.push({ id, name: (typeof name === 'string' ? name : 'Crew').slice(0, 16), masked: false, mask: typeof mask === 'string' && Object.prototype.hasOwnProperty.call(MASKS, mask) ? mask : 'stocking', out: false });
    for (const gid of (Array.isArray(gear) ? gear : [])) if (typeof gid === 'string' && Object.prototype.hasOwnProperty.call(GEAR, gid)) s.gear[gid] = true;
    for (const o of s.obj) if (o.type === 'hold') o.need = this.needFor(o, s.gear);
    if (this.A) this.A.needFull = true; // crew & gear changed: everyone gets a full snapshot
    this.toast(`<b>${esc(s.crew[s.crew.length - 1].name)}</b> is in on the ${esc(s.name)}. The split just got smaller. And safer.`, 'good');
    this.dirty();
    return true;
  }

  dirty() { if (this.A) this.A.dirty = true; }

  // ------------------------------------------------------------------ NPCs (authority)
  guardSpec(x, z, weapon, hostile, extra = {}) {
    const def = this.A.def;
    const name = pick(GUARD_NAMES);
    return {
      kind: 'thug', role: 'thug', x, z, facing: Math.random() * Math.PI * 2, name,
      color: def.id === 'grimco' ? '#0f1012' : GUARD_COLOR, hat: def.id === 'grimco' ? 'hardhat' : 'cop', hatColor: def.id === 'grimco' ? '#0a0a0a' : '#1b2230',
      hp: def.guard?.hp ?? 70 + def.tier * 18, weapon, hostile, wander: !hostile, leash: 5,
      // per-job tuning (src/data/heists.js guard): gun accuracy and how many may shoot at you at once
      acc: def.guard?.acc ?? 1, shooters: def.guard?.shooters ?? 2,
      networked: !!(this.net.connected && this.net.isHost), persistent: false,
      talkPrompt: `Talk to ${name} <small>(guard)</small>`,
      onTalk: (g, npc) => this.guardTalk(npc),
      data: { heistGuard: true }, ...extra,
    };
  }

  spawnGuard(x, z, weapon, hostile, extra) {
    const npc = this.g.npcs?.spawn(this.guardSpec(x, z, weapon, hostile, extra));
    if (!npc) return null;
    npc.aggressor = true;
    this.A.guards.push(npc);
    if (hostile) this.aggro(npc);
    return npc;
  }

  spawnGuards() {
    const A = this.A, s = this.s, def = A.def;
    const list = def.guards?.[s.approach] || [];
    if (!list.length || s.obj.some((o) => o.type === 'truck_find')) return; // truck guards ride inside
    const spots = s.obj.filter((o) => ['hold', 'lockpick', 'hack'].includes(o.type));
    list.forEach((w, i) => {
      const o = spots[i % Math.max(1, spots.length)] || { x: s.target.x, z: s.target.z };
      let x = o.x, z = o.z;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = rand(5, 9);
        const tx = o.x + Math.cos(a) * r, tz = o.z + Math.sin(a) * r;
        if (!this.g.physics.pointBlocked(tx, tz) && !this.g.physics.resolveCircle(tx, tz, 0.5).hit) { x = tx; z = tz; break; }
      }
      this.spawnGuard(x, z, w, false);
    });
  }

  spawnCiv() {
    const def = this.A.def;
    if (!def.civ || !this.g.npcs) return;
    const p = this.spotPos(def.loc, 'street');
    const c = def.civ;
    const npc = this.g.npcs.spawn({
      kind: 'static', x: p.x + rand(-2, 2), z: p.z - 2, facing: p.f + Math.PI, name: c.name, color: c.color, hat: c.hat ?? null, hatColor: c.hatColor,
      persistent: false, wander: false, networked: false, talkPrompt: `Talk to ${c.name}`,
      onTalk: (g, n) => { this.g.npcs.say?.(n, pick(c.lines), { ttl: 3.5 }); },
      data: { heistCiv: true },
    });
    this.A.civ = npc;
  }

  nearestCrewTarget(x, z, maxD = 60) {
    let best = null, bd = maxD;
    for (const c of this.s.crew) {
      if (c.out) continue;
      const p = this.crewPos(c.id);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = c.id; }
    }
    if (!best) return null;
    return best === this.me() ? { type: 'player' } : { type: 'remote', id: best };
  }

  aggro(npc) {
    if (!npc || npc.dead || npc.removed) return;
    const tgt = this.nearestCrewTarget(npc.pos.x, npc.pos.z, 80);
    const mgr = this.g.npcs;
    if (tgt && mgr._goHostile) mgr._goHostile(npc, tgt);
    else { npc.hostile = true; npc.state = 'hunt'; npc.stateT = 0; }
  }

  guardTalk(npc) {
    const g = this.g;
    if (this.masked && this.s && !this.s.alarm) {
      g.npcs.say?.(npc, pick(['Why are you wearing a... OH NO.', 'Nice mask. Wait. WAIT.', 'Is it Halloween? ...It\'s not Halloween.']), { ttl: 2.5, kind: 'angry' });
      this.act({ a: 'spotted' });
      return;
    }
    g.npcs.say?.(npc, pick(GUARD_BARKS.idle), { ttl: 3 });
  }

  // ------------------------------------------------------------------ armored truck (authority)
  roadAdj() {
    const roads = this.g.world?.roads;
    if (!roads) return null;
    if (this._adj && this._adjFor === roads) return this._adj;
    const adj = roads.nodes.map(() => []);
    for (const e of roads.edges || []) {
      const a = Array.isArray(e) ? e[0] : e.a, b = Array.isArray(e) ? e[1] : e.b;
      if (a == null || b == null || !adj[a] || !adj[b]) continue;
      const len = Math.hypot(roads.nodes[a].x - roads.nodes[b].x, roads.nodes[a].z - roads.nodes[b].z);
      adj[a].push([b, len]); adj[b].push([a, len]);
    }
    this._adj = adj; this._adjFor = roads;
    return adj;
  }

  roadPath(from, to) {
    const adj = this.roadAdj();
    if (!adj || from === to) return [from];
    const dist = new Map([[from, 0]]), prev = new Map(), open = new Set([from]);
    while (open.size) {
      let u = null, ud = Infinity;
      for (const n of open) { const d = dist.get(n); if (d < ud) { ud = d; u = n; } }
      open.delete(u);
      if (u === to) break;
      for (const [v, len] of adj[u]) {
        const nd = ud + len;
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); open.add(v); }
      }
    }
    if (!prev.has(to)) return [from, to];
    const path = [to];
    let c = to;
    while (prev.has(c)) { c = prev.get(c); path.unshift(c); }
    return path;
  }

  spawnTruck() {
    const g = this.g, w = g.world, vm = g.vehicles;
    if (!w?.roads || !vm?.spawnCar) return;
    const N = w.roads.nodes;
    const stops = TRUCK_STOPS.map(([locId, dur]) => { const p = this.locPoint(locId); return p ? { node: w.nearestRoadNode(p.x, p.z), dur, name: p.loc.name } : null; }).filter(Boolean);
    if (stops.length < 2) return;
    // start one stop "behind" the bank so it shows up downtown and heads to the bank first
    const order = [...stops.slice(1), stops[0]];
    let nodes = [];
    for (let i = 0; i < order.length; i++) {
      const a = order[i].node, b = order[(i + 1) % order.length].node;
      const seg = this.roadPath(a, b);
      if (nodes.length) seg.shift();
      nodes.push(...seg);
    }
    if (nodes.length > 1 && nodes[0] === nodes[nodes.length - 1]) nodes.pop();
    const stopAt = new Map(order.map((s) => [s.node, s]));
    const lane = w.roads.laneOffset ?? 2.6;
    const wps = [];
    for (let i = 0; i < nodes.length; i++) {
      const A = N[nodes[i]], B = N[nodes[(i + 1) % nodes.length]];
      const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      const ox = uz * lane, oz = -ux * lane;
      const cut = Math.min(6, L * 0.3);
      wps.push({ x: A.x + ux * cut + ox, z: A.z + uz * cut + oz });
      const st = stopAt.get(nodes[(i + 1) % nodes.length]);
      wps.push({ x: B.x - ux * cut + ox, z: B.z - uz * cut + oz, stop: st || null });
    }
    const p0 = wps[0], p1 = wps[1];
    const car = vm.spawnCar('goliath', { x: p0.x, z: p0.z, rot: Math.atan2(p1.x - p0.x, p1.z - p0.z), color: '#5d625a', owner: 'heist', driver: true, driverColor: GUARD_COLOR, hat: 'cop' });
    car.frozen = true;
    car.heistTruck = true;
    this.A.truck = { car, wps, idx: 1, speed: 8, parkT: 0, parkedAt: null, stopped: false, heading: car.heading, lastStop: -1 };
    this.s.truck = { x: p0.x, z: p0.z, h: car.heading, stopped: false, parked: false, rams: 0 };
    for (const o of this.s.obj) if (o.type === 'truck_find') { o.x = p0.x; o.z = p0.z; }
  }

  tickTruck(dt) {
    const T = this.A.truck, s = this.s;
    if (!T || T.car.removed) return;
    const car = T.car;
    if (car.owner === 'player' || this.g.player.vehicle === car) { if (!T.stopped) this.stopTruck('jack'); }
    if (!T.stopped && !car.dead) {
      if (T.parkT > 0) {
        T.parkT -= dt;
        s.truck.parked = true;
      } else {
        s.truck.parked = false;
        const wp = T.wps[T.idx];
        const dx = wp.x - car.x, dz = wp.z - car.z, d = Math.hypot(dx, dz);
        const step = T.speed * dt;
        if (d <= Math.max(0.6, step)) {
          car.group.position.x = wp.x; car.group.position.z = wp.z;
          if (wp.stop) { T.parkT = wp.stop.dur * (this.s.alarm ? 0.3 : 1); T.parkedAt = wp.stop.name; }
          T.idx = (T.idx + 1) % T.wps.length;
        } else {
          car.group.position.x += (dx / d) * step;
          car.group.position.z += (dz / d) * step;
          T.heading = angleLerp(T.heading, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt));
        }
      }
      car.heading = T.heading;
      car.group.rotation.y = T.heading;
      car.vel.set(0, 0); car.vf = 0; car.vl = 0; car.angVel = 0;
    }
    s.truck.x = car.x; s.truck.z = car.z; s.truck.h = car.heading;
    for (const o of s.obj) if (o.type === 'truck_find' || o.type === 'truck_stop') { o.x = car.x; o.z = car.z; }
  }

  stopTruck(how) {
    const A = this.A, s = this.s, T = A?.truck;
    if (!T || T.stopped) return;
    T.stopped = true;
    s.truck.stopped = true; s.truck.parked = false;
    const car = T.car;
    car.vel.set(0, 0);
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const L = car.dims?.L ?? 6;
    const rear = { x: car.x - f.x * (L / 2 + 1.3), z: car.z - f.z * (L / 2 + 1.3) };
    for (const o of s.obj) if (o.spot === 'truckRear' || o.type === 'loot') { o.x = rear.x; o.z = rear.z; o.f = car.heading + Math.PI; }
    const stopObj = s.obj.find((o) => o.type === 'truck_stop');
    if (stopObj) stopObj.done = true;
    const quiet = how === 'boot' && !s.alarm;
    const list = A.def.guards?.[quiet ? 'quiet' : 'loud'] || ['pistol'];
    const rx = f.z, rz = -f.x;
    list.forEach((w, i) => {
      const side = i % 2 ? 1 : -1;
      const along = quiet ? L / 2 + 2 + i : (i - 1) * 1.5;
      this.spawnGuard(car.x + rx * side * 2.6 + f.x * along, car.z + rz * side * 2.6 + f.z * along, w, !quiet);
    });
    try { car.setDriverVisible(false); } catch { /* ignore */ }
    const msg = { jack: 'You yanked the driver out. The truck is yours. So is the attention.', ram: 'The truck shudders to a halt, steaming like a hot dog in a microwave!',
      spikes: 'POP POP POP. The truck grinds to a stop on its rims!', boot: 'Boot\'s on. That truck isn\'t going anywhere.' }[how] || 'The truck is stopped!';
    this.broadcastToast(msg, 'good');
    if (!quiet) this.setAlarm('truck');
    this.dirty();
  }

  // ------------------------------------------------------------------ actions
  // Every crew action goes through here: applied directly on the authority, sent to the host otherwise.
  act(msg) {
    if (!this.s) return;
    msg.uid = this.s.uid;
    if (this.auth) { this.applyAct(msg, this.me()); return; }
    const t = ['pick', 'drop', 'stash', 'secure'].includes(msg.a) ? 'heist:loot' : 'heist:act';
    try { this.net.sendToHost({ t, ...msg }); } catch (e) { console.error('[heists] send failed', e); }
  }

  applyAct(msg, from) {
    const s = this.s;
    if (!msg || typeof msg !== 'object' || typeof msg.a !== 'string') return; // remote data is untrusted
    if (!this.auth || !s || s.phase !== 'active' || msg.uid !== s.uid) return;
    const crew = s.crew.find((c) => c.id === from);
    if (!crew && msg.a !== 'join') return;
    const bag = Number.isInteger(msg.i) ? s.bags[msg.i] : null;
    const cur = this.currentObj();
    switch (msg.a) {
      case 'join': this.addCrew(from, msg); break;
      case 'mask':
        crew.masked = !!msg.on; if (typeof msg.style === 'string' && Object.prototype.hasOwnProperty.call(MASKS, msg.style)) crew.mask = msg.style; break;
      case 'hold': {
        const o = s.obj.find((x) => x.k === msg.k);
        if (!o || o.done || o.type !== 'hold' || o !== cur) break;
        o.prog = Math.min(o.need, o.prog + clamp(Number(msg.d) || 0, 0, 1));
        this.A.busy.set(from, this.t + 0.6);
        if (o.prog >= o.need) this.completeObj(o, from);
        break;
      }
      case 'obj': {
        const o = s.obj.find((x) => x.k === msg.k);
        if (!o || o.done || o !== cur || !['lockpick', 'hack'].includes(o.type)) break;
        if (msg.ok) this.completeObj(o, from);
        else if (!s.alarm) { s.susp = Math.min(0.95, s.susp + 0.35); this.broadcastToast('That made some noise. The guards are twitchy now.', 'bad'); }
        break;
      }
      case 'busy': this.A.busy.set(from, this.t + 0.8); break;
      case 'spotted': if (!s.alarm) this.setAlarm('spotted'); break;
      case 'pick':
        if (bag && bag.s === 'g' && !s.bags.some((b) => b.s === 'c' && b.by === from) && !crew.out) { bag.s = 'c'; bag.by = from; }
        break;
      case 'drop':
        if (bag && (bag.s === 'c' || bag.s === 'k') && bag.by === from) {
          bag.s = 'g'; bag.by = null;
          if (Number.isFinite(msg.x) && Number.isFinite(msg.z)) { bag.x = msg.x; bag.z = msg.z; }
        }
        break;
      case 'stash': if (bag && bag.s === 'c' && bag.by === from) bag.s = 'k'; break;
      case 'secure': {
        let n = 0;
        for (const i of (Array.isArray(msg.list) ? msg.list.slice(0, 32) : [])) { const b = s.bags[i]; if (b && (b.s === 'c' || b.s === 'k') && b.by === from) { b.s = 's'; n++; } }
        if (n) {
          const val = s.bags.filter((b) => b.s === 's').reduce((a, b) => a + b.v, 0);
          this.broadcastToast(`💰 <b>${esc(crew.name)}</b> dropped off ${n} bag${n > 1 ? 's' : ''}. Secured: ${fmtMoney(val)}`, 'money');
          const loose = s.bags.some((b) => b.s === 'g' || b.s === 'c' || b.s === 'k');
          if (!loose) this.complete();
        }
        break;
      }
      case 'finish': if (s.bags.some((b) => b.s === 's') || s.extraGot > 0) this.complete(); break;
      case 'down': {
        if (crew.out) break;
        crew.out = true;
        for (const d of (Array.isArray(msg.bags) ? msg.bags.slice(0, 32) : [])) {
          const b = Number.isInteger(d?.i) ? s.bags[d.i] : null;
          if (b && b.by === from && (b.s === 'c' || b.s === 'k')) { b.s = 'g'; b.by = null; if (Number.isFinite(d.x) && Number.isFinite(d.z)) { b.x = d.x; b.z = d.z; } }
        }
        for (const b of s.bags) if (b.by === from && (b.s === 'c' || b.s === 'k')) { const p = this.crewPos(from); b.s = 'g'; b.by = null; if (p) { b.x = p.x; b.z = p.z; } }
        this.broadcastToast(`<b>${esc(crew.name)}</b> is out (${msg.why === 'arrested' ? 'busted' : 'wrecked'}). ${pick(['Their share just got redistributed.', 'More for the rest of you. Grim, but true.'])}`, 'bad');
        if (s.crew.every((c) => c.out)) this.fail(msg.why === 'arrested' ? 'Everybody got busted.' : 'Everybody got wrecked.');
        break;
      }
      case 'ram': {
        const T = this.A.truck;
        if (!T || T.stopped || this.t < this.A.ramT) break;
        this.A.ramT = this.t + 0.9;
        s.truck.rams = (s.truck.rams || 0) + 1;
        T.speed = 12.5;
        if (T.parkT > 0) T.parkT = 0;
        if (s.truck.rams >= 3) this.stopTruck('ram');
        else { this.broadcastToast(`CRUNCH! The truck wobbles. (${s.truck.rams}/3)`, 'info'); if (!s.alarm) this.setAlarm('ram'); }
        break;
      }
      case 'spikes': if (this.A.truck && !this.A.truck.stopped && s.gear.spikes) this.stopTruck('spikes'); break;
      case 'boot': if (this.A.truck && !this.A.truck.stopped && s.truck.parked) this.stopTruck('boot'); break;
      case 'jack': if (this.A.truck && !this.A.truck.stopped) this.stopTruck('jack'); break;
      case 'abort': if (from === s.leader) this.fail('Called off.'); break;
      default: break;
    }
    this.dirty();
  }

  currentObj() { return this.s?.obj.find((o) => !o.done && o.type !== 'escape') || null; }

  completeObj(o, by) {
    const s = this.s, def = this.A.def;
    if (o.done) return;
    o.done = true;
    if (o.type === 'hold') o.prog = o.need;
    const flags = o.onDone.split(',').filter(Boolean);
    if (flags.includes('cash')) {
      const amt = randInt(def.extra[0], def.extra[1]);
      if (amt > 0) { s.extraGot += amt; this.broadcastToast(`💵 Loose cash: +${fmtMoney(amt)} to the take.`, 'money'); }
    }
    if (flags.includes('bags')) this.spawnBags(o.x, o.z, o.f);
    if (flags.includes('alarm')) this.setAlarm('loud');
    this.dirty();
  }

  spawnBags(x, z, f = 0) {
    const s = this.s, def = this.A.def;
    const n = def.bags.count;
    const tx = Math.cos(f), tz = -Math.sin(f);
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.9;
      let bx = x + tx * a + Math.sin(f) * 1.2, bz = z + tz * a + Math.cos(f) * 1.2;
      const r = this.g.physics.resolveCircle(bx, bz, 0.4);
      bx = r.x; bz = r.z;
      // a target you've hit recently keeps less cash on hand (press)
      s.bags.push({ i: s.bags.length, v: Math.round(randInt(def.bags.value[0], def.bags.value[1]) * this.pressMult(def.id) / 10) * 10, s: 'g', by: null, x: bx, z: bz });
    }
  }

  setAlarm(why) {
    const s = this.s;
    if (!s || s.alarm) return;
    s.alarm = true;
    s.susp = 1;
    for (const n of this.A.guards) if (!n.dead && !n.removed) this.aggro(n);
    const loudGuard = this.A.guards.find((n) => !n.dead && !n.removed);
    if (loudGuard) this.g.npcs.say?.(loudGuard, pick(GUARD_BARKS.spot), { ttl: 2.5, kind: 'angry' });
    if (this.A.civ && !this.A.civ.removed) this.g.npcs.say?.(this.A.civ, pick(this.A.def.civ.lines), { ttl: 3.5 });
    try { this.g.npcs.ambient?.panic?.(s.target.x, s.target.z, 35); } catch { /* ignore */ }
    this.A.waveT = Math.min(this.A.waveT || 30, s.approach === 'quiet' ? 35 : 25);
    this.dirty();
  }

  broadcastToast(html, kind = 'info') {
    this.toast(html, kind);
    if (this.shared) { try { this.net.broadcast({ t: 'heist:state', toast: html, kind, uid: this.s?.uid }); } catch { /* ignore */ } }
  }

  // ------------------------------------------------------------------ end (authority)
  complete() {
    const s = this.s;
    if (!s || s.phase !== 'active') return;
    const def = this.A.def;
    let take = s.bags.filter((b) => b.s === 's').reduce((a, b) => a + b.v, 0) + s.extraGot;
    const quiet = !s.alarm;
    if (quiet) take = Math.round(take * (def.quietBonus || 1));
    const active = s.crew.filter((c) => !c.out);
    const share = Math.floor(take / Math.max(1, active.length));
    s.phase = 'done';
    s.take = take; s.share = share; s.quiet = quiet;
    for (const c of active) {
      const msg = { t: 'heist:payout', uid: s.uid, id: s.id, take, share, quiet, crew: s.crew.map((x) => x.name) };
      if (c.id === this.me()) this.applyPayout(msg);
      else { try { this.net.sendTo(c.id, msg); } catch (e) { console.error('[heists] payout send failed', e); } }
    }
    this.broadcastState(true);
    this.endRun();
  }

  fail(reason = 'It all went sideways.') {
    const s = this.s;
    if (!s || s.phase !== 'active') return;
    s.phase = 'failed';
    s.reason = reason;
    this.broadcastState(true);
    this.applyFail(s.id, reason);
    this.endRun();
  }

  // ------------------------------------------------------------------ local results (every crew machine)
  applyPayout(msg) {
    const g = this.g, h = this.h, def = HEISTS[msg.id];
    if (!def) return;
    let share = Math.max(0, Math.round(Number(msg.share) || 0));
    try { const pm = Number(g.perks?.mult?.('heistTake') ?? 1); if (Number.isFinite(pm) && pm > 0) share = Math.round(share * pm); } catch { /* no perks */ }
    const take = Math.max(0, Math.round(Number(msg.take) || 0));
    // the fence turns hot bills into spendable ones, for a cut (laundromat venture: less)
    const cut = this.fenceCut();
    const fenced = Math.round(share * cut);
    share -= fenced;
    if (share > 0) g.state.addMoney(share, 'heist');
    // press on the target + heat from the investigation
    h.press ||= {};
    h.press[def.id] = { n: this.press(def.id) + 1, t: g.time.total };
    const heat = Number(def.heat?.[msg.quiet ? 'quiet' : 'loud']) || 0;
    if (heat > 0) { try { g.state.addHeat(heat); } catch { /* ignore */ } }
    setTimeout(() => this.toast(`💸 The fence keeps <b>${Math.round(cut * 100)}%</b> (${fmtMoney(fenced)}). You pocket <b>${fmtMoney(share)}</b>.${heat > 0 ? ` Detectives are sniffing around (+${heat}★).` : ''}${cut >= 0.3 ? ' <small>(A laundromat "front" would cut the fence’s share — ask at the bank.)</small>' : ''}`, 'money', 7000), 1200);
    g.state.addXP(def.xp);
    g.state.addStat('karma', -Math.min(5, def.tier), 'heist');
    h.done[def.id] = (h.done[def.id] || 0) + 1;
    h.best[def.id] = Math.max(h.best[def.id] || 0, take);
    h.last[def.id] = g.time.total;
    h.total = (h.total || 0) + share;
    const crewN = Array.isArray(msg.crew) ? msg.crew.length : 1;
    g.ui.bigText('SCORE!', `${esc(def.name)} — take ${fmtMoney(take)}${crewN > 1 ? ` · your cut ${fmtMoney(share)}` : ''}${msg.quiet ? ' · clean job bonus' : ''}`, 4500);
    this.combatSfx('cash');
    const headline = pick(def.headlines).replace('{take}', fmtMoney(take)).replace('{mask}', (MASKS[h.mask]?.name || 'mask').toUpperCase());
    h.news.push({ headline, body: `Police describe the suspect${crewN > 1 ? 's' : ''} as "${pick(['stick-thin', 'smelly', 'surprisingly polite', 'very, very sweaty', 'probably idiots'])}" and "wearing ${MASKS[h.mask]?.name.toLowerCase() || 'masks'}". Chief Lardner promises an investigation "right after lunch".` });
    setTimeout(() => this.toast(`📰 <b>ROTWELL RAG EXTRA:</b> ${esc(headline)}`, 'info', 8000), 2500);
    this.unmask();
    g.state.changed('heists');
    g.bus.emit('heist:completed', { id: def.id, take, share, quiet: !!msg.quiet });
  }

  applyFail(id, reason) {
    const g = this.g, h = this.h, def = HEISTS[id];
    if (def) h.failedAt[id] = g.time.total;
    // a blown job costs more than pride: lawyers and a heat bump (calling it off early is free-ish)
    const soft = /called off|walked away/i.test(String(reason || ''));
    if (def && !soft) {
      const p = g.state.p;
      const legal = Math.min(Math.round((p.money || 0) * FAIL_LEGAL), 2000 * def.tier);
      if (legal > 0) g.state.addMoney(-legal, 'legal fees');
      try { g.state.addHeat(1); } catch { /* ignore */ }
      setTimeout(() => this.toast(`⚖️ Lawyer's retainer for the mess: <b>${fmtMoney(legal)}</b>. Terry keeps his fee. The ${esc(def.name)} is crawling with cops for a while.`, 'bad', 6000), 1500);
    }
    g.ui.bigText('HEIST FAILED', esc(reason || 'It all went sideways.'), 3500);
    this.combatSfx('trombone');
    this.toast(pick(RADIO.fail), 'bad', 5000);
    this.unmask();
    g.state.changed('heists');
    g.bus.emit('heist:failed', { id, reason });
  }

  combatSfx(name) { try { this.g.combat?.sfx?.(name); } catch { /* ignore */ } }

  onLocalStart(usedGear = []) {
    const s = this.s, g = this.g;
    this.v = this._freshView();
    this.v.uid = s.uid;
    g.ui.bigText(esc(s.name.toUpperCase()), `${s.approach === 'quiet' ? 'Quiet' : 'Loud'} approach · you have ${Math.floor(s.timeLeft / 60)} minutes`, 3200);
    this.toast(pick(RADIO.start), 'info', 5000);
    if (s.obj.some((o) => o.type === 'truck_find')) setTimeout(() => this.toast(pick(RADIO.truck), 'info', 6000), 2500);
    if (usedGear.length) this.toast(`Packed: ${usedGear.map(esc).join(', ')}`, 'info');
    if (!this.masked) setTimeout(() => this.toast('Press <kbd>V</kbd> to pull your mask on when you get there.', 'info', 4000), 1200);
    this.spawnGetaway();
    g.bus.emit('heist:started', { id: s.id, approach: s.approach, crew: s.crew.map((c) => c.name), leader: s.leader === this.me() });
  }

  // Your own getaway car (if you bought one) waits near the target — local to your machine.
  spawnGetaway() {
    const g = this.g, h = this.h, vm = g.vehicles, s = this.s;
    let gid = (h.gear.getaway_fast || 0) > 0 ? 'getaway_fast' : (h.gear.getaway || 0) > 0 ? 'getaway' : null;
    // Chop Chop partner (ventures): a free beige sedan at every job
    const comp = !gid && !!g.lifestyle?.owns?.('chop');
    if (comp) gid = 'getaway';
    if (!gid || !vm?.spawnCar) return;
    if (!comp) { h.gear[gid]--; if (h.gear[gid] <= 0) delete h.gear[gid]; }
    const carId = GEAR[gid].car;
    try {
      const spot = vm.findSpot ? vm.findSpot(s.target.x, s.target.z, carId, 7, 28) : { x: s.target.x + 6, z: s.target.z + 6, rot: 0 };
      const car = vm.spawnCar(carId, { x: spot.x, z: spot.z, rot: spot.rot ?? 0, owner: 'player', color: carId === 'commuter' ? '#b8ad8c' : '#a8241a' });
      car.heistGetaway = true;
      this.v.getaway = car;
      this.leftovers.push({ car, t: 0 });
      this.toast(`🚗 Your <b>${esc(GEAR[gid].name)}</b> is waiting near the target. Keys are in the visor.`, 'good', 4500);
    } catch (e) { console.error('[heists] getaway failed', e); }
  }

  endRun() {
    const A = this.A;
    if (A) {
      for (const n of A.guards) this.leftovers.push({ npc: n, t: 0 });
      if (A.civ) this.leftovers.push({ npc: A.civ, t: 0 });
      if (A.truck?.car && A.truck.car.owner !== 'player') this.leftovers.push({ car: A.truck.car, t: 0 });
    }
    this.A = null;
    this.auth = false;
    this.shared = false;
    this.clearView();
    this.s = null;
  }

  // Abort from the planner (authority) or bail out of a mirrored run (client).
  abort() {
    if (!this.s) return;
    if (this.auth) this.fail('Called off. Terry is disappointed in you. Mildly.');
    else { this.act({ a: 'down', why: 'quit', bags: this.myBagDrops() }); const id = this.s.id; this.clearView(); this.s = null; this.applyFail(id, 'You walked away from the job.'); }
  }

  // ------------------------------------------------------------------ net
  // Bandwidth: the full snapshot (~1.5 KB: every objective's static layout) goes out on start,
  // crew changes, phase changes, late joins and every 8 s as a safety net. In between we send
  // a small delta only when something actually changed, plus a ~1 Hz clock heartbeat.
  broadcastState(force = false, full = false) {
    if (!this.shared || !this.s) return;
    if (!force && !this.A?.dirty) return;
    const A = this.A, s = this.s;
    if (A) A.dirty = false;
    try {
      if (full || !A || A.needFull || !A.lastFull || this.t - A.lastFull > 8 || s.phase !== 'active') {
        if (A) { A.lastFull = this.t; A.needFull = false; A.lastSig = null; A.beatT = this.t; }
        this.net.broadcast({ t: 'heist:state', s });
        return;
      }
      const d = this.stateDelta();
      const sig = JSON.stringify({ ...d, timeLeft: 0 });
      if (sig !== A.lastSig) { A.lastSig = sig; A.beatT = this.t; this.net.broadcast({ t: 'heist:state', d }); }
      else if (this.t - (A.beatT || 0) >= 1) { A.beatT = this.t; this.net.broadcast({ t: 'heist:state', d: { uid: s.uid, timeLeft: d.timeLeft } }); }
    } catch (e) { console.error('[heists] state broadcast failed', e); }
  }

  stateDelta() {
    const s = this.s;
    const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
    return {
      uid: s.uid, phase: s.phase, timeLeft: Math.round(s.timeLeft * 10) / 10, alarm: s.alarm, susp: r1(s.susp), extraGot: s.extraGot,
      leader: s.leader, crew: s.crew, bags: s.bags, truck: s.truck,
      objd: s.obj.map((o) => [o.done ? 1 : 0, r1(o.prog), r1(o.need), r1(o.x), r1(o.z)]),
    };
  }

  applyDelta(d) {
    const s = this.s;
    if (!s || !d || typeof d !== 'object' || d.uid !== s.uid) return false; // wait for the next full snapshot
    if (Number.isFinite(d.timeLeft)) s.timeLeft = d.timeLeft;
    if (Number.isFinite(d.susp)) s.susp = d.susp;
    if (Number.isFinite(d.extraGot)) s.extraGot = d.extraGot;
    if ('alarm' in d) s.alarm = d.alarm;
    if (typeof d.phase === 'string') s.phase = d.phase;
    if (typeof d.leader === 'string') s.leader = d.leader;
    if (Array.isArray(d.crew)) s.crew = d.crew.filter((c) => c && typeof c === 'object');
    if (Array.isArray(d.bags)) s.bags = d.bags.filter((b) => b && typeof b === 'object');
    if (d.truck && typeof d.truck === 'object') s.truck = d.truck;
    if (Array.isArray(d.objd)) {
      d.objd.forEach((v, i) => {
        const o = s.obj[i];
        if (!o || !Array.isArray(v)) return;
        o.done = !!v[0];
        if (Number.isFinite(v[1])) o.prog = v[1];
        if (Number.isFinite(v[2])) o.need = v[2];
        if (Number.isFinite(v[3]) && Number.isFinite(v[4])) { o.x = v[3]; o.z = v[4]; }
      });
    }
    return true;
  }

  // Someone joined the session mid-job: offer them a spot (the host runs the job).
  onPlayerJoined(id) {
    const s = this.s;
    if (!id || !this.auth || !this.shared || !s || s.phase !== 'active') return;
    try {
      this.net.sendTo(id, { t: 'heist:invite', uid: s.uid, id: s.id, name: s.name, approach: s.approach, leaderName: this.myName() });
      if (this.A) this.A.needFull = true;
    } catch (e) { console.error('[heists] late invite failed', e); }
  }

  onState(msg, from) {
    if (this.auth || !msg || typeof msg !== 'object') return;
    if (msg.toast) {
      if (this.s && msg.uid === this.s.uid && typeof msg.toast === 'string') this.toast(msg.toast, typeof msg.kind === 'string' ? msg.kind : 'info');
      return;
    }
    if (msg.d) {
      this.applyDelta(msg.d); // phase changes always arrive as full snapshots, handled below
      return;
    }
    const s = msg.s;
    if (!s || typeof s !== 'object' || !Array.isArray(s.crew)) return;
    const me = this.me();
    const inCrew = s.crew.some((c) => c.id === me);
    if (!inCrew) return;
    const fresh = !this.s || this.s.uid !== s.uid;
    if (fresh && s.phase !== 'active') return;
    const prev = this.s;
    this.s = s;
    if (fresh) this.onLocalStart(this.consumeGear(HEISTS[s.id] || {}));
    const meOut = !!s.crew.find((c) => c.id === me)?.out;
    if (s.phase === 'failed') {
      const id = s.id;
      this.clearView(); this.s = null;
      if (!meOut || !prev) this.applyFail(id, s.reason);
    } else if (s.phase === 'done') {
      this.clearView(); this.s = null; // payout arrives as its own message
      if (meOut) this.toast(`The crew finished the ${esc(s.name)} without you. Took ${fmtMoney(s.take || 0)}. You got a story.`, 'info', 5000);
    }
  }

  onPayout(msg, from) {
    if (this.auth && from !== this.me()) return;
    if (!HEISTS[msg.id]) return;
    if (this._paid === msg.uid) return;
    this._paid = msg.uid;
    if (this.s && this.s.uid === msg.uid) { this.clearView(); this.s = null; }
    this.applyPayout(msg);
  }

  myBagDrops() {
    const s = this.s, me = this.me(), out = [];
    if (!s) return out;
    for (const b of s.bags) {
      if (b.by !== me) continue;
      if (b.s === 'c') { const p = this.g.player.group.position; out.push({ i: b.i, x: p.x, z: p.z }); }
      else if (b.s === 'k') { const car = this.v.myCars.get(b.i); out.push({ i: b.i, x: car ? car.x + 2 : this.g.player.pos.x, z: car ? car.z : this.g.player.pos.z }); }
    }
    return out;
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    if (!g.started) return;
    // G toggles the mask anywhere (it's a free country)
    if (!g.controlsLocked && g.input.wasPressed('KeyV') && !g.player.dead) this.toggleMask();
    this.updateMaskVisual();
    if (this.mg) { try { this.mg.update(dt); } catch (e) { console.error('[heists] minigame failed', e); this.mg = null; } if (this.mg?.done) this.mg = null; }
    this.tickLeftovers(dt);
    if (!this.s) { this.applyCarry(false); this.hud.hide(); return; }
    if (this.auth) { try { this.tickAuth(dt); } catch (e) { if (!this._ae) { console.error('[heists] authority tick failed', e); this._ae = true; } } }
    else if (this.s) this.s.timeLeft = Math.max(0, this.s.timeLeft - dt);
    if (!this.s) { this.applyCarry(false); this.hud.hide(); return; }
    try { this.tickLocal(dt); } catch (e) { if (!this._le) { console.error('[heists] local tick failed', e); this._le = true; } }
  }

  // Job's over (won or lost): the mask comes off on its own.
  unmask() {
    if (!this.masked) return;
    this.masked = false;
    this.onMaskChanged();
  }

  toggleMask() {
    this.masked = !this.masked;
    const style = this.h.mask;
    this.toast(this.masked ? `🎭 ${pick(['Mask on. You are now legally nobody.', 'Mask on. Breathe through your mouth.', 'Mask on. Feeling dangerous. And sweaty.'])}` : 'Mask off. Hello, face.', 'info', 1800);
    if (this.s) this.act({ a: 'mask', on: this.masked, style });
  }

  // Progression perk: speeds up lockpicking, safe-cracking and hacking.
  skill() {
    try { const m = Number(this.g.perks?.mult?.('lockpick') ?? 1); return Number.isFinite(m) && m > 0 ? clamp(m, 0.5, 3) : 1; } catch { return 1; }
  }

  onMaskChanged() {
    if (this.maskObj) { this.maskObj.removeFromParent(); this.maskObj = null; }
    if (this.s && this.masked) this.act({ a: 'mask', on: true, style: this.h.mask });
  }

  updateMaskVisual() {
    const model = this.g.player?.model;
    if (this.masked && model) this.maskObj = wearMask(model, this.maskObj, this.h.mask);
    else if (this.maskObj?.parent) this.maskObj.removeFromParent();
  }

  tickLeftovers(dt) {
    if (!this.leftovers.length) return;
    const pp = this.g.player.group.position;
    this.leftovers = this.leftovers.filter((L) => {
      if (this.s && L.car && L.car === this.v.getaway) return true; // still in use
      L.t += dt;
      const o = L.npc || L.car;
      if (!o || o.removed) return false;
      const pos = L.npc ? o.pos : o.group.position;
      const far = Math.hypot(pos.x - pp.x, pos.z - pp.z) > 70;
      if (L.car && this.g.player.vehicle === L.car) return true;
      if ((far && L.t > 3) || L.t > (L.car ? 240 : 45)) {
        if (L.npc) this.g.npcs?.remove(o);
        else this.g.vehicles?.removeCar(o);
        return false;
      }
      return true;
    });
  }

  tickAuth(dt) {
    const s = this.s, A = this.A;
    s.timeLeft -= dt;
    // remember remote crew positions (for disconnects)
    for (const c of s.crew) { if (c.id !== this.me()) { const p = this.net.remotePlayers.get(c.id)?.pos; if (p) A.lastPos.set(c.id, { x: p.x, z: p.z }); } }
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      if (s.bags.some((b) => b.s === 's') || s.extraGot > 0) { this.broadcastToast('⏰ Time\'s up. You split what you got away with.', 'info'); this.complete(); }
      else this.fail('Out of time. The cops have the place locked down.');
      return;
    }
    if (A.truck) this.tickTruck(dt);
    const cur = this.currentObj();
    if (cur) {
      if (cur.type === 'goto') {
        for (const c of s.crew) { if (c.out) continue; const p = this.crewPos(c.id); if (p && Math.hypot(p.x - cur.x, p.z - cur.z) < cur.r) { this.completeObj(cur, c.id); break; } }
      } else if (cur.type === 'truck_find') {
        for (const c of s.crew) { if (c.out) continue; const p = this.crewPos(c.id); if (p && s.truck && Math.hypot(p.x - s.truck.x, p.z - s.truck.z) < 35) { this.completeObj(cur, c.id); break; } }
      } else if (cur.type === 'mask') {
        if (s.crew.some((c) => !c.out && c.masked)) this.completeObj(cur);
      } else if (cur.type === 'truck_stop') {
        if (A.truck?.stopped) this.completeObj(cur);
      } else if (cur.type === 'loot') {
        if (s.bags.length && !s.bags.some((b) => b.s === 'g')) this.completeObj(cur);
      }
    }
    // a truck heist without the truck (it exploded / despawned): fall back to bags at the wreck
    if (A.truck && (A.truck.car.removed || A.truck.car.dead) && !A.truck.stopped) this.stopTruck('ram');

    this.tickGuards(dt);
    // drop bags that sit with crew members who vanished from the session
    if (this.shared) {
      for (const c of s.crew) {
        if (c.out || c.id === this.me()) continue;
        if (!this.net.remotePlayers.has(c.id)) { c.leftT = (c.leftT || 0) + dt; if (c.leftT > 4) this.applyAct({ a: 'down', why: 'left', uid: s.uid }, c.id); } else c.leftT = 0;
      }
    }
    A.sendT -= dt;
    if (A.sendT <= 0) { A.sendT = A.dirty ? 0.2 : 1; this.broadcastState(true); }
  }

  tickGuards(dt) {
    const s = this.s, A = this.A, npcs = this.g.npcs;
    if (!npcs) return;
    A.guards = A.guards.filter((n) => !n.removed);
    const alive = A.guards.filter((n) => !n.dead);
    A.barkT -= dt;
    if (!s.alarm) {
      // a guard who's been jumped radios for backup unless you shut him up fast
      const angry = alive.find((n) => n.hostile);
      if (angry) {
        A.radioT += dt;
        if (A.radioT > 0.2 && A.radioT - dt <= 0.2) npcs.say?.(angry, pick(GUARD_BARKS.radio), { ttl: 2.5, kind: 'angry' });
        if (A.radioT > 4) { this.setAlarm('radio'); return; }
      } else A.radioT = Math.max(0, A.radioT - dt * 0.5);
      // vision cones
      let best = 0;
      for (const n of alive) {
        if (n.hostile) continue;
        let seen = 0;
        for (const c of s.crew) {
          if (c.out) continue;
          const busy = (A.busy.get(c.id) || 0) > this.t;
          if (!c.masked && !busy) continue;
          const p = this.crewPos(c.id);
          if (!p) continue;
          const dx = p.x - n.pos.x, dz = p.z - n.pos.z, d = Math.hypot(dx, dz);
          if (d > 11) continue;
          const ang = Math.abs(((Math.atan2(dx, dz) - n.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (ang > 1.0 && d > 2.2) continue;
          if (!npcs.los?.(n.pos.x, n.pos.z, p.x, p.z)) continue;
          seen = Math.max(seen, (1.3 - d / 11) * (busy ? 1.25 : 1));
        }
        n.data.sus = clamp((n.data.sus || 0) + (seen > 0 ? seen * dt * 0.55 : -dt * 0.22), 0, 1.05);
        if (seen > 0 && n.data.sus > 0.3 && !n.data.susSaid) { n.data.susSaid = true; npcs.say?.(n, pick(GUARD_BARKS.sus), { ttl: 2 }); }
        if (n.data.sus < 0.1) n.data.susSaid = false;
        best = Math.max(best, n.data.sus);
      }
      const prev = s.susp;
      s.susp = Math.max(best, s.susp - dt * 0.2);
      if (Math.abs(prev - s.susp) > 0.03) this.dirty();
      if (best >= 1) { this.setAlarm('spotted'); return; }
      if (A.barkT <= 0 && alive.length) { A.barkT = rand(9, 16); const n = pick(alive); if (n.dist < 25) npcs.say?.(n, pick(GUARD_BARKS.idle), { ttl: 3 }); }
      return;
    }
    // alarm: keep guards on the crew, send waves
    A.alarmHostileT -= dt;
    if (A.alarmHostileT <= 0) {
      A.alarmHostileT = 1;
      for (const n of alive) if (!n.hostile) { const t = this.nearestCrewTarget(n.pos.x, n.pos.z, 40); if (t) this.aggro(n); }
    }
    if (A.barkT <= 0 && alive.length) { A.barkT = rand(5, 9); const n = pick(alive); if (n.dist < 30) npcs.say?.(n, pick(GUARD_BARKS.alarm), { ttl: 2, kind: 'angry' }); }
    // A quiet job that went loud only gets the skeleton crew: later, smaller waves.
    const W0 = A.def.waves;
    const W = W0 && s.approach === 'quiet' ? { ...W0, every: W0.every * 1.4, count: Math.max(1, W0.count - 1), max: Math.max(2, W0.max - 2) } : W0;
    if (W && s.timeLeft > 20) {
      A.waveT -= dt;
      const anyNear = s.crew.some((c) => { if (c.out) return false; const p = this.crewPos(c.id); return p && Math.hypot(p.x - s.target.x, p.z - s.target.z) < 80; });
      if (A.waveT <= 0 && anyNear) {
        A.waveT = W.every;
        let n = Math.min(W.count, W.max - alive.length);
        const center = A.truck ? { x: A.truck.car.x, z: A.truck.car.z } : s.target;
        for (let tries = 0; n > 0 && tries < 20; tries++) {
          const a = Math.random() * Math.PI * 2, r = rand(26, 36);
          const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
          if (this.g.physics.pointBlocked(x, z)) continue;
          this.spawnGuard(x, z, pick(W.weapons), true, { data: { heistGuard: true, wave: true } });
          n--;
        }
        if (n < Math.min(W.count, W.max - alive.length)) this.broadcastToast(pick(['🚨 Security reinforcements incoming!', '🚨 More rent-a-cops! They breed like rabbits!', '🚨 Backup has arrived. Backup brought guns.']), 'bad');
      }
    }
  }

  // ------------------------------------------------------------------ local view & input
  tickLocal(dt) {
    const g = this.g, s = this.s, v = this.v, me = this.me();
    if (v.uid !== s.uid) { this.clearView(); this.v = this._freshView(); this.v.uid = s.uid; }
    const crewMe = s.crew.find((c) => c.id === me);
    const active = crewMe && !crewMe.out;
    const pl = g.player;
    const pp = pl.group.position;

    // mask state sync (crew list says what the authority thinks)
    if (crewMe && crewMe.masked !== this.masked && active && (this.t - (v.maskSyncT || 0)) > 1) { v.maskSyncT = this.t; this.act({ a: 'mask', on: this.masked, style: this.h.mask }); }

    this.syncInteracts(s, active);
    this.syncProps(s);
    this.syncBags(s, me);
    this.syncRemoteMasks(s, me);
    this.syncTruckMirror(s, dt);
    this.syncBeacons(s, dt);

    // carrying
    const carried = s.bags.find((b) => b.s === 'c' && b.by === me);
    this.applyCarry(!!carried && !pl.vehicle);
    if (carried && active) {
      if (pl.vehicle) { v.myCars.set(carried.i, pl.vehicle); this.act({ a: 'stash', i: carried.i }); this.toast('You toss the bag in the back seat. It clinks. Money doesn\'t clink. Don\'t think about it.', 'info', 2500); carried.s = 'k'; }
      else if (!g.controlsLocked && g.input.wasPressed('KeyX')) {
        const f = pl.facing;
        const r = g.physics.resolveCircle(pp.x + Math.sin(f) * 1.4, pp.z + Math.cos(f) * 1.4, 0.4);
        this.act({ a: 'drop', i: carried.i, x: r.x, z: r.z });
        carried.s = 'g'; carried.by = null; carried.x = r.x; carried.z = r.z;
      }
    }
    // cars holding my bags got wrecked or towed
    for (const [i, car] of v.myCars) {
      const b = s.bags[i];
      if (!b || b.s !== 'k' || b.by !== me) { v.myCars.delete(i); continue; }
      if (car.removed || car.dead) { this.act({ a: 'drop', i, x: car.x + 2, z: car.z }); v.myCars.delete(i); }
    }

    // hold-E objectives
    const cur = s.obj.find((o) => !o.done && o.type !== 'escape');
    let holding = false;
    if (active && cur && cur.type === 'hold' && !pl.vehicle && !pl.dead && !g.controlsLocked) {
      const d = Math.hypot(pp.x - cur.x, pp.z - cur.z);
      if (d < cur.r + 0.3 && g.input.isDown('KeyE') && !carried) {
        if (!this.masked) {
          if (this.t > v.warnT) { v.warnT = this.t + 3; this.toast('Put your mask on first, genius. (<kbd>V</kbd>) Unless you WANT to be on the news.', 'bad'); }
        } else {
          holding = true;
          v.holdAcc += dt * this.skill();
          v.holdSendT -= dt;
          if (v.holdSendT <= 0) { v.holdSendT = 0.2; const d2 = v.holdAcc; v.holdAcc = 0; this.act({ a: 'hold', k: cur.k, d: d2 }); }
        }
      }
    }
    if (holding) {
      const fr = (cur.prog + (this.auth ? 0 : v.holdAcc)) / Math.max(0.1, cur.need);
      this.hud.showProgress(`${esc(cur.verb)}... <small>(${Math.floor(fr * 100)}%)</small>`, fr);
      v.holdT = (v.holdT || 0) + dt;
      if (v.holdT > 0.5) { v.holdT = 0; this.combatSfx('click'); }
    } else {
      if (v.holdAcc > 0 && cur) { this.act({ a: 'hold', k: cur.k, d: v.holdAcc }); v.holdAcc = 0; }
      this.hud.showProgress(null);
    }

    // drop-off
    const dd = Math.hypot(pp.x - s.drop.x, pp.z - s.drop.z);
    if (active && dd < 9) {
      const list = [];
      if (carried && !pl.vehicle) list.push(carried.i);
      if (pl.vehicle) for (const [i, car] of v.myCars) if (car === pl.vehicle) list.push(i);
      if (list.length) {
        if ((g.state.p.heat || 0) >= 3) { if (this.t > v.dropHotT) { v.dropHotT = this.t + 4; this.toast(DROP_HOT, 'bad', 3500); } }
        else {
          this.act({ a: 'secure', list });
          for (const i of list) { const b = s.bags[i]; if (b) b.s = 's'; v.myCars.delete(i); }
          this.combatSfx('cash');
          if (v.securedSaid++ === 0) this.toast(pick(RADIO.dropoff), 'info', 5000);
        }
      }
    }

    // ramming the armored truck
    v.ramCd -= dt;
    const vSpeed = pl.vehicle ? Math.max(pl.vehicle.speed || 0, v.lastVSpeed || 0) : 0;
    v.lastVSpeed = pl.vehicle ? pl.vehicle.speed || 0 : 0;
    if (active && s.truck && !s.truck.stopped && pl.vehicle && pl.vehicle !== this.truckCar() && v.ramCd <= 0) {
      const tc = this.truckCar();
      if (tc && Math.hypot(pl.vehicle.x - tc.x, pl.vehicle.z - tc.z) < 5.4 && vSpeed > 5) {
        v.ramCd = 1.2;
        this.act({ a: 'ram' });
        g.cameraRig?.shake?.(0.5, 0.3);
      }
    }
    if (active && s.truck && !s.truck.stopped && !this.auth && v.truckMirror && (v.truckMirror.owner === 'player' || pl.vehicle === v.truckMirror)) this.act({ a: 'jack' });

    // quiet: tell the host when we're doing something sketchy (lockpicking / hacking)
    if (active && this.mg && !this.auth && this.t > (v.busySendT || 0)) { v.busySendT = this.t + 0.4; this.act({ a: 'busy' }); }
    if (active && this.mg && this.auth) this.A.busy.set(me, this.t + 0.5);

    // alarm consequences: heat for anyone nearby
    if (s.alarm && !v.lastAlarm) {
      v.lastAlarm = true;
      this.toast(pick(RADIO.alarm), 'bad', 5000);
      if (Math.hypot(pp.x - s.target.x, pp.z - s.target.z) < 220 || s.truck) g.state.addHeat((HEISTS[s.id]?.tier || 2) <= 1 ? 1 : 2);
      try { g.combat?.sfx?.('siren'); } catch { /* ignore */ }
    }
    if (s.alarm && active) {
      v.heatT += dt;
      const near = Math.hypot(pp.x - s.target.x, pp.z - s.target.z) < 70 || (s.truck && Math.hypot(pp.x - s.truck.x, pp.z - s.truck.z) < 70);
      if (v.heatT > 40 && near) { v.heatT = 0; if ((g.state.p.heat || 0) < 4) g.state.addHeat(0.5); }
    }

    // radio chatter on progress
    for (const o of s.obj) {
      if (o.done && !v.lastDoneKeys.has(o.k)) {
        v.lastDoneKeys.add(o.k);
        if (['goto', 'mask', 'truck_find'].includes(o.type)) continue;
        if (o.onDone.includes('bags') && !v.bagsSaid) { v.bagsSaid = true; this.toast(pick(RADIO.bags), 'info', 4500); continue; }
        this.toast(pick(s.alarm ? RADIO.loudStep : RADIO.quietStep), 'info', 3500);
      }
    }
    if (s.timeLeft < 60 && !v.lowTimeSaid) { v.lowTimeSaid = true; this.toast(pick(RADIO.lowTime), 'bad', 4500); }

    this.hud.render(s, me);
    this.hud.showSuspicion(s.alarm ? 0 : s.susp);
  }

  truckCar() { return this.auth ? this.A?.truck?.car : this.v.truckMirror; }

  applyCarry(on) {
    const pl = this.g.player;
    if (!pl) return;
    const want = on ? CARRY_SLOW : 1;
    if (want === this.carryApplied) return;
    const cur = pl.speedMult || 1;
    pl.speedMult = (cur / this.carryApplied) * want;
    this.carryApplied = want;
  }

  // Interactables: objectives, bags, truck tricks, stashing, calling it.
  syncInteracts(s, active) {
    const g = this.g, v = this.v;
    const add = (it) => { if (!v.interacts.has(it.id)) { g.interact.add(it); v.interacts.add(it.id); } };
    const isCur = (o) => s.obj.find((x) => !x.done && x.type !== 'escape') === o;
    const carrying = () => !!this.s?.bags.some((b) => b.s === 'c' && b.by === this.me());
    for (const o of s.obj) {
      if (!['hold', 'lockpick', 'hack'].includes(o.type)) continue;
      const id = `heist:obj:${s.uid}:${o.k}`;
      add({
        id, radius: o.r,
        getPos: () => { const oo = this.s?.obj.find((x) => x.k === o.k); return oo ? { x: oo.x, z: oo.z } : null; },
        prompt: o.type === 'hold' ? `Hold: ${esc(o.label)}` : o.type === 'lockpick' ? `${esc(o.label)} <small>(lockpick)</small>` : `${esc(o.label)} <small>(hack)</small>`,
        enabled: () => { const oo = this.s?.obj.find((x) => x.k === o.k); const c = this.s?.crew.find((x) => x.id === this.me()); return !!oo && isCur(oo) && !!c && !c.out && !carrying(); },
        onInteract: () => this.onObjInteract(o.k),
      });
    }
    for (const b of s.bags) {
      const id = `heist:bag:${s.uid}:${b.i}`;
      add({
        id, radius: 1.8,
        getPos: () => { const bb = this.s?.bags[b.i]; return bb && bb.s === 'g' ? { x: bb.x, z: bb.z } : null; },
        prompt: `Grab the loot bag <small>(${fmtMoney(b.v)})</small>`,
        enabled: () => !carrying() && !!this.s?.crew.find((x) => x.id === this.me() && !x.out),
        onInteract: () => { const bb = this.s?.bags[b.i]; if (!bb || bb.s !== 'g') return; this.act({ a: 'pick', i: b.i }); if (this.auth) this.combatSfx('pickup'); else { bb.s = 'c'; bb.by = this.me(); this.combatSfx('pickup'); } },
      });
    }
    if (!active) return;
    add({
      id: `heist:stash:${s.uid}`, radius: 4.2,
      getPos: () => { if (!carrying()) return null; const c = this.nearCar(4.2); return c ? { x: c.x, z: c.z } : null; },
      prompt: 'Toss the bag in the car',
      enabled: () => carrying() && !!this.nearCar(4.2),
      onInteract: () => {
        const b = this.s?.bags.find((x) => x.s === 'c' && x.by === this.me());
        const car = this.nearCar(4.2);
        if (!b || !car) return;
        this.v.myCars.set(b.i, car);
        this.act({ a: 'stash', i: b.i });
        b.s = 'k';
        this.toast(`Bag's in the ${esc(car.def?.name || 'car')}. Now drive it to ${esc(this.s.drop.label)}.`, 'info', 2600);
      },
    });
    add({
      id: `heist:finish:${s.uid}`, radius: 6,
      getPos: () => (this.s ? { x: this.s.drop.x, z: this.s.drop.z } : null),
      prompt: 'Split the take &amp; call it a night',
      enabled: () => !!this.s?.bags.some((b) => b.s === 's') && !carrying(),
      onInteract: async () => {
        const left = this.s.bags.filter((b) => b.s === 'g' || b.s === 'k' || b.s === 'c').length;
        if (left && !(await g.ui.confirm(`There ${left === 1 ? 'is' : 'are'} still ${left} bag${left > 1 ? 's' : ''} out there. Leave ${left === 1 ? 'it' : 'them'} and split what you've got?`, { yes: 'Split it', no: 'Go back for more' }))) return;
        this.act({ a: 'finish' });
      },
    });
    if (s.truck) {
      add({
        id: `heist:spikes:${s.uid}`, radius: 11,
        getPos: () => { const c = this.truckCar(); return c && this.s?.truck && !this.s.truck.stopped ? { x: c.x, z: c.z } : null; },
        prompt: 'Throw the spike strip',
        enabled: () => !!this.s?.gear?.spikes && !this.s.truck?.stopped && !this.s.truck?.parked,
        onInteract: () => { if (!this.masked) { this.toast('Mask first (<kbd>V</kbd>). Truck drivers have dashcams.', 'bad'); return; } this.act({ a: 'spikes' }); },
      });
      add({
        id: `heist:boot:${s.uid}`, radius: 5,
        getPos: () => { const c = this.truckCar(); return c && this.s?.truck?.parked && !this.s.truck.stopped ? { x: c.x, z: c.z } : null; },
        prompt: 'Slap a wheel boot on the truck',
        enabled: () => !!this.s?.truck?.parked && !this.s.truck.stopped,
        onInteract: () => { if (!this.masked) { this.toast('Mask first (<kbd>V</kbd>). Smile, you\'re on the bank\'s camera.', 'bad'); return; } this.act({ a: 'boot' }); },
      });
    }
  }

  nearCar(r) {
    const vm = this.g.vehicles, pp = this.g.player.group.position;
    if (!vm?.list) return null;
    let best = null, bd = r;
    for (const c of vm.list) {
      if (c.removed || c.dead || c.isBike) continue;
      if (c === this.truckCar() && !this.s?.truck?.stopped) continue;
      if (c.owner === 'traffic' && c.speed > 2) continue;
      const d = Math.hypot(c.x - pp.x, c.z - pp.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  onObjInteract(k) {
    const s = this.s, g = this.g;
    if (!s) return;
    const o = s.obj.find((x) => x.k === k);
    if (!o || o.done) return;
    if (!this.masked) { this.toast('Put your mask on first, genius. (<kbd>V</kbd>)', 'bad'); return; }
    if (o.type === 'hold') return; // holding E is handled per-frame
    if (this.mg) return;
    const done = (ok, why) => {
      this.mg = null;
      if (why === 'abort') return;
      if (ok) this.toast(o.type === 'hack' ? 'Hacked. You are basically in a movie.' : 'Lock popped.', 'good', 2000);
      else this.toast(o.type === 'hack' ? 'Locked out. Try again, script kiddie.' : 'Pick snapped. Try again, butterfingers.', 'bad', 2200);
      this.act({ a: 'obj', k, ok: !!ok });
    };
    if (o.type === 'lockpick') this.mg = startLockpick(g, { pins: o.pins, hard: !s.gear.picks, skill: this.skill(), title: o.label, onDone: done });
    else if (o.type === 'hack') this.mg = startHack(g, { rounds: s.gear.hacker ? Math.max(2, o.rounds - 1) : o.rounds + 1, hard: !s.gear.hacker, skill: this.skill(), title: o.label, onDone: done });
  }

  syncProps(s) {
    const v = this.v, scene = this.g.scene;
    for (const o of s.obj) {
      if (!['hold', 'lockpick', 'hack'].includes(o.type) || o.spot === 'truckRear') continue;
      const key = o.k;
      if (v.props.has(key)) continue;
      let type = PROP_FOR[o.type];
      if (o.type === 'hold' && /vault/i.test(o.label)) type = 'vault';
      if (o.type === 'hold' && /register|cage|lobby|floor/i.test(o.label)) type = o.k === 'register' ? 'register' : 'panel';
      const m = createProp(type);
      // stand it against the wall, facing the street
      const back = type === 'vault' || type === 'door' || type === 'panel' ? 0.9 : 0.2;
      m.position.set(o.x - Math.sin(o.f) * back, 0, o.z - Math.cos(o.f) * back);
      m.rotation.y = o.f;
      scene.add(m);
      v.props.set(key, m);
    }
  }

  syncBags(s, me) {
    const v = this.v, scene = this.g.scene;
    for (const b of s.bags) {
      let m = v.bagMeshes.get(b.i);
      if (!m) { m = createBag(); v.bagMeshes.set(b.i, m); }
      if (b.s === 'g') {
        if (m.parent !== scene) scene.add(m);
        m.position.set(b.x, 0.2 + Math.sin(this.t * 3 + b.i) * 0.04, b.z);
        m.rotation.set(0, b.i * 1.3 + this.t * 0.4, 0);
      } else if (b.s === 'c') {
        const model = this.crewModel(b.by);
        if (model) bagOnBack(model, m);
        else if (m.parent) m.removeFromParent();
      } else if (m.parent) m.removeFromParent();
    }
  }

  syncRemoteMasks(s, me) {
    const v = this.v;
    for (const c of s.crew) {
      if (c.id === me) continue;
      const rp = this.net.remotePlayers.get(c.id);
      const model = rp?._model;
      let mk = v.remoteMasks.get(c.id);
      if (c.masked && model) { mk = wearMask(model, mk, c.mask); v.remoteMasks.set(c.id, mk); }
      else if (mk?.parent) mk.removeFromParent();
    }
  }

  syncTruckMirror(s, dt) {
    const v = this.v;
    if (this.auth || !s.truck) return;
    let car = v.truckMirror;
    if (!car || car.removed) {
      if (!this.g.vehicles?.spawnCar) return;
      car = this.g.vehicles.spawnCar('goliath', { x: s.truck.x, z: s.truck.z, rot: s.truck.h, color: '#5d625a', owner: 'heist', driver: !s.truck.stopped, driverColor: GUARD_COLOR, hat: 'cop' });
      car.frozen = true;
      v.truckMirror = car;
    }
    if (car.owner === 'player') return;
    const k = 1 - Math.exp(-8 * dt);
    const p = car.group.position;
    if (Math.hypot(s.truck.x - p.x, s.truck.z - p.z) > 15) { p.x = s.truck.x; p.z = s.truck.z; } else { p.x += (s.truck.x - p.x) * k; p.z += (s.truck.z - p.z) * k; }
    car.heading = angleLerp(car.heading, s.truck.h, k);
    car.group.rotation.y = car.heading;
    car.vel.set(0, 0);
    if (s.truck.stopped && car.hasDriver) { try { car.setDriverVisible(false); } catch { /* ignore */ } }
  }

  syncBeacons(s, dt) {
    const v = this.v, scene = this.g.scene, markers = this.g.world?.markers;
    const want = new Map();
    const cur = s.obj.find((o) => !o.done && o.type !== 'escape');
    const lootStarted = s.bags.some((b) => b.s !== 'g');
    if (cur && cur.type !== 'mask') {
      const pos = (cur.type === 'truck_find' || cur.type === 'truck_stop') && s.truck ? { x: s.truck.x, z: s.truck.z } : { x: cur.x, z: cur.z };
      want.set('obj', { ...pos, color: '#f2c53d', label: cur.label, scale: cur.type === 'goto' ? 1.6 : 0.8 });
    }
    if (lootStarted || (cur && cur.type === 'loot')) want.set('drop', { x: s.drop.x, z: s.drop.z, color: '#7fbf4d', label: `Drop-off: ${s.drop.label}`, scale: 1.3 });
    if (s.truck && !want.has('obj') && !s.truck.stopped) want.set('obj', { x: s.truck.x, z: s.truck.z, color: '#f2c53d', label: 'Armored truck', scale: 1 });
    for (const [k, b] of v.beacons) if (!want.has(k) || b.userData.color !== want.get(k).color) { b.removeFromParent(); v.beacons.delete(k); }
    for (const [k, w] of want) {
      let b = v.beacons.get(k);
      if (!b) { b = createBeacon(w.color); b.userData.color = w.color; scene.add(b); v.beacons.set(k, b); }
      b.position.set(w.x, 0, w.z);
      pulseBeacon(b, this.t, w.scale);
      if (markers instanceof Map) markers.set('heist:' + k, { x: w.x, z: w.z, color: w.color, label: w.label, icon: k === 'drop' ? '$' : '✖', quest: true, tracked: true });
    }
    if (markers instanceof Map) for (const k of ['obj', 'drop']) if (!want.has(k)) markers.delete('heist:' + k);
  }

  clearView() {
    const v = this.v, g = this.g;
    for (const id of v.interacts) g.interact.remove(id);
    v.interacts.clear();
    for (const m of v.bagMeshes.values()) m.removeFromParent();
    v.bagMeshes.clear();
    for (const m of v.props.values()) m.removeFromParent();
    v.props.clear();
    for (const b of v.beacons.values()) b.removeFromParent();
    v.beacons.clear();
    for (const m of v.remoteMasks.values()) m.removeFromParent();
    v.remoteMasks.clear();
    if (v.truckMirror && v.truckMirror.owner !== 'player') this.leftovers.push({ car: v.truckMirror, t: 0 });
    v.truckMirror = null;
    if (v.getaway) { v.getaway = null; }
    const markers = g.world?.markers;
    if (markers instanceof Map) { markers.delete('heist:obj'); markers.delete('heist:drop'); }
    if (this.mg) { try { this.mg.close(); } catch { /* ignore */ } this.mg = null; }
    this.applyCarry(false);
    this.hud.hide();
  }
}
