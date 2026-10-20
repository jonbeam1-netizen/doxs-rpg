import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rotwell PD on wheels (and rotors): pursuit cruisers, roadblocks with spike
// strips, the police helicopter, sirens, light bars and the pooled lights.
//
// Host (game.net.isAuthority) simulates everything and broadcasts
//   police:snap   host -> all   { c:[cruisers], h:[helis], b:[roadblocks] } ~10Hz
// Clients mirror it (replica Cars / heli meshes) and report back:
//   police:hit    client -> host  { id, dmg }          rammed / shot a cruiser
//   police:steal  client -> host  { id }               carjacked a cruiser
//   police:tire   host -> client  { dmg, pop }         a cop shot your car
// Wanted targets come from game.police.wanted() (src/npc/police.js), which
// already merges the local player's heat with every client's reported heat.

const MAX_CRUISERS = 6;
const MAX_HELIS = 2;
const MAX_BLOCKS = 2;
const CRUISERS_FOR_HEAT = [0, 0, 2, 3, 4, 5];
const COP_SHIRT = 0x1d2a4a;
const LANE = 2.6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v) => Math.round(v * 100) / 100;

const RAM_BARKS = ['PULL OVER, DIRTBAG!', 'Stop the vehicle! ...please?', 'You\'re only making this worse! And longer! I have a DATE!', 'This is Rotwell PD! We are VERY mad!', 'Pull over or I\'m telling your mom!'];
const SPIKE_TOASTS = ['<b>SPIKE STRIP!</b> Your tires are confetti now.', '<b>SPIKES!</b> Pop goes the weasel. The weasel is you.', '<b>SPIKE STRIP!</b> Riding on rims like a true Rotwell native.'];
const TIRE_TOASTS = ['They shot out a tire! The car pulls like a drunk shopping cart.', 'BANG — flat tire. Cops: 1, your rims: 0.', 'A cop just introduced a bullet to your tire. They did not hit it off.'];

export class PoliceFleet {
  constructor(vm) {
    this.vm = vm;
    this.game = vm.game;
    this.cruisers = new Map();   // id -> Car (host: simulated, client: replica)
    this.helis = new Map();      // id -> heli state
    this.blocks = new Map();     // id -> roadblock
    this.seq = 1;
    this.manageT = 0;
    this.snapT = 0;
    this.blockCd = new Map();
    this.leaveT = new Map();
    this.scareT = 0;
    this.audio = new PoliceAudio(this.game);
    this._wanted = [];
    this._losT = 0;

    // Pooled lights: always in the scene so the light count never changes.
    const scene = this.game.scene;
    this.flash = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff2020, 0, 24, 1.3);
      l.castShadow = false;
      l.position.set(0, -60, 0);
      scene.add(l);
      return l;
    });
    this.heliSpot = new THREE.SpotLight(0xfff0d0, 0, 110, 0.22, 0.45, 1);
    this.heliSpot.castShadow = false;
    this.heliSpot.position.set(0, -80, 0);
    scene.add(this.heliSpot, this.heliSpot.target);

    const net = this.game.net;
    net.on('police:snap', (msg) => { if (!net.isAuthority) this.applySnap(msg); });
    net.on('police:hit', (msg) => {
      if (!net.isAuthority) return;
      const c = this.cruisers.get(msg.id);
      if (c && !c.removed) c.damage(clamp(Number(msg.dmg) || 0, 0, 120), 'player');
    });
    net.on('police:steal', (msg, from) => { if (net.isAuthority) this.onRemoteSteal(msg.id, from); });
    net.on('police:tire', (msg) => this.hitLocalCar(clamp(Number(msg.dmg) || 0, 0, 60), !!msg.pop));
    this.game.bus.on('net:disconnected', () => { for (const c of [...this.cruisers.values()]) if (c.replica) this._dropCruiser(c, true); this._clearReplicaHelis(); this._clearBlocks(true); });
    this.game.bus.on('state:reset', () => this.clearAll());
    this.game.bus.on('player:arrested', () => this._onLocalCaught());
    this.game.bus.on('player:respawned', () => this._onLocalCaught());
  }

  get auth() { return this.game.net.isAuthority; }

  // ---------------------------------------------------------------- queries
  wanted() { return this._wanted; }

  // Who can see what: { x, z, r, los, heli }. Used by src/npc/police.js on every machine.
  spotters() {
    const out = [];
    for (const c of this.cruisers.values()) {
      if (c.removed || c.exploded || c.dead) continue;
      const crew = c.replica ? c.netFlags & 2 : (c.police?.crew > 0);
      if (crew) out.push({ x: c.x, z: c.z, r: 62, los: true, car: c });
    }
    for (const h of this.helis.values()) if (!h.leaving) out.push({ x: h.x, z: h.z, r: 62, los: false, heli: true });
    return out;
  }

  isCruiser(car) { return !!car && (!!car.police || car.owner === 'police'); }

  // Any siren within r of (x,z)? Returns {car, d} or null. Traffic uses this to pull over.
  sirenNear(x, z, r = 36) {
    let best = null, bd = r;
    for (const c of this.vm.cars) {
      if (!c.sirenOn || c.sirenMute || c.removed || c.exploded || c.speed < 3) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { car: best, d: bd } : null;
  }

  // ---------------------------------------------------------------- per frame
  // Called by the VehicleManager before cars are integrated.
  update(dt) {
    const g = this.game;
    if (!g.started) return;
    try { this._wanted = g.police?.wanted?.() || []; } catch (e) { this._wanted = []; if (!this._we) { console.error('[police] wanted failed', e); this._we = true; } }
    if (this.auth) {
      this.manageT -= dt;
      if (this.manageT <= 0) { this.manageT = 0.5; try { this._manage(); } catch (e) { if (!this._me) { console.error('[police] manage failed', e); this._me = true; } } }
      for (const c of [...this.cruisers.values()]) {
        if (c.removed) { this.cruisers.delete(c.police?.id ?? c.netId); continue; }
        try { this._drive(c, dt); } catch (e) { if (!c._perr) { console.error('[police] drive failed', e); c._perr = true; } }
      }
      for (const h of [...this.helis.values()]) { try { this._flyHeli(h, dt); } catch (e) { if (!h._err) { console.error('[police] heli failed', e); h._err = true; } } }
      this._updateBlocks(dt);
      if (g.net.connected && g.net.isHost) {
        this.snapT -= dt;
        if (this.snapT <= 0) {
          this.snapT = 0.1;
          try {
            const snap = this.snapshot();
            // nothing on the streets: a 1 Hz empty keep-alive is enough (clients drop stale replicas on it)
            const empty = !snap.c.length && !snap.h.length && !snap.b.length;
            if (empty) this.snapT = 1;
            if (!empty || !this._lastSnapEmpty || (this._emptyN = (this._emptyN || 0) + 1) % 3 === 0) g.net.broadcast(snap);
            this._lastSnapEmpty = empty;
          } catch (e) { if (!this._se) { console.error('[police] snap failed', e); this._se = true; } }
        }
      }
    } else {
      for (const h of this.helis.values()) this._lerpHeli(h, dt);
    }
    for (const h of this.helis.values()) this._animHeli(h, dt);
    this._spikeCheck();
    this._scarePeds(dt);
    this._updateLights();
    this._updateAudio();
  }

  // ---------------------------------------------------------------- host: spawning
  _manage() {
    const g = this.game;
    const wanted = this._wanted;
    const per = new Map();
    for (const c of this.cruisers.values()) {
      const P = c.police;
      if (!P || P.state === 'block' || P.state === 'leave') continue;
      per.set(P.tkey, (per.get(P.tkey) || 0) + 1);
    }
    const byKey = new Map(wanted.map((w) => [w.key, w]));
    // retire cruisers whose suspect cooled off / vanished
    for (const c of [...this.cruisers.values()]) {
      const P = c.police;
      if (!P) continue;
      if (c.exploded || (c.dead && P.state !== 'leave')) {
        if (!P.deadT) P.deadT = g.elapsed;
        if (g.elapsed - P.deadT > 20 && this._farFromPlayers(c.x, c.z, 50)) this._dropCruiser(c);
        continue;
      }
      if (P.state === 'block') continue;
      const w = byKey.get(P.tkey);
      if (!w || w.heat < 2) {
        P.coolT = (P.coolT || 0) + 0.5;
        if (P.coolT > 4 && P.state !== 'leave' && P.state !== 'parked') this._leave(c);
      } else P.coolT = 0;
      if (P.state === 'leave') {
        P.leaveT = (P.leaveT || 0) + 0.5;
        if (this._farFromPlayers(c.x, c.z, 90) || P.leaveT > 30) this._dropCruiser(c);
      }
      if (P.state === 'parked') this._manageParked(c, w);
      // hopelessly far behind and out of sight? recycle it so a closer one can spawn
      if (w && P.state === 'route' && Math.hypot(c.x - w.pos.x, c.z - w.pos.z) > 175 && this._farFromPlayers(c.x, c.z, 120)) { this._dropCruiser(c); continue; }
      if (P.state === 'abandoned' && this._farFromPlayers(c.x, c.z, 90)) this._dropCruiser(c);
    }
    let total = 0;
    for (const c of this.cruisers.values()) if (c.police && c.police.state !== 'block') total++;
    for (const w of wanted) {
      const lvl = Math.floor(w.heat);
      const want = CRUISERS_FOR_HEAT[clamp(lvl, 0, 5)];
      if ((per.get(w.key) || 0) < want && total < MAX_CRUISERS) {
        if (this._spawnCruiser(w)) { total++; per.set(w.key, (per.get(w.key) || 0) + 1); }
      }
      // roadblocks at 4 stars when they're driving somewhere fast
      if (lvl >= 4 && w.inCar && w.speed > 9 && this.blocks.size < MAX_BLOCKS && !this._hasBlockFor(w.key) && (this.blockCd.get(w.key) || 0) < g.elapsed) {
        this.blockCd.set(w.key, g.elapsed + 8);
        if (this._spawnBlock(w)) this.blockCd.set(w.key, g.elapsed + 28);
      }
    }
    // helicopter at 5 stars
    for (const w of wanted) {
      let has = null;
      for (const h of this.helis.values()) if (h.tkey === w.key) has = h;
      if (w.heat >= 5) { this.leaveT.delete(w.key); if (!has && this.helis.size < MAX_HELIS) this._spawnHeli(w); }
      else if (has && !has.leaving) {
        const t = (this.leaveT.get(w.key) || 0) + 0.5;
        this.leaveT.set(w.key, t);
        if (t > 6) has.leaving = true;
      }
    }
    for (const h of this.helis.values()) if (!byKey.has(h.tkey)) h.leaving = true;
  }

  _farFromPlayers(x, z, r) {
    const g = this.game;
    const p = g.player?.group?.position;
    if (p && Math.hypot(p.x - x, p.z - z) < r) return false;
    for (const rp of g.net.remotePlayers?.values?.() || []) if (rp.pos && Math.hypot(rp.pos.x - x, rp.pos.z - z) < r) return false;
    return true;
  }

  _graph() { return this.vm.traffic.graph(); }

  _spawnCruiser(w) {
    const G = this._graph();
    if (!G) return null;
    const g = this.game;
    const ph = g.physics;
    let best = null;
    for (let i = 0; i < 26 && !best; i++) {
      const e = G.edges[(Math.random() * G.edges.length) | 0];
      const A = G.nodes[e[0]], B = G.nodes[e[1]];
      if (!A || !B) continue;
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      if (len < 24) continue;
      const t = rand(0.3, 0.7);
      const mx = A.x + (B.x - A.x) * t, mz = A.z + (B.z - A.z) * t;
      const d = Math.hypot(mx - w.pos.x, mz - w.pos.z);
      if (d < 70 || d > 135) continue;
      if (!this._farFromPlayers(mx, mz, 55)) continue;
      // fleeing in a car? cut them off up ahead
      if (i < 14 && w.inCar && w.speed > 8 && (mx - w.pos.x) * Math.sin(w.heading) + (mz - w.pos.z) * Math.cos(w.heading) < 20) continue;
      // prefer to pop in out of sight
      if (i < 18 && ph.raycast(mx, mz, w.pos.x, w.pos.z, 2, 1.2) >= 1) continue;
      // drive toward the suspect along this edge
      const toB = Math.hypot(B.x - w.pos.x, B.z - w.pos.z) < Math.hypot(A.x - w.pos.x, A.z - w.pos.z);
      const [F, T] = toB ? [A, B] : [B, A];
      const ux = (T.x - F.x) / len, uz = (T.z - F.z) / len;
      const x = mx - uz * LANE, z = mz + ux * LANE;
      if (ph.pointBlocked(x, z) || this.vm.carNear(x, z, 8)) continue;
      best = { x, z, rot: Math.atan2(ux, uz) };
    }
    if (!best) return null;
    const car = this.vm.spawnCar('interceptor', { x: best.x, z: best.z, rot: best.rot, owner: 'police', driver: true, driverColor: COP_SHIRT, hat: 'cop' });
    const id = 'pc' + (this.seq++);
    car.netId = id;
    car.police = {
      id, tkey: w.key, t: w.t, state: 'route', path: null, pi: 0, pathT: 0, crew: 2, cops: [],
      stuckT: 0, backT: 0, shootT: rand(1.5, 3), losT: 0, los: false, barkT: rand(2, 5), searchPt: null, side: chance(0.5) ? 1 : -1,
    };
    car.setSiren(true);
    car.vel.set(Math.sin(best.rot) * 14, Math.cos(best.rot) * 14);
    this.cruisers.set(id, car);
    return car;
  }

  _leave(c) {
    const P = c.police;
    P.state = 'leave'; P.leaveT = 0; P.path = null;
    c.setSiren(false);
  }

  _dropCruiser(c, silent = false) {
    const id = c.police?.id ?? c.netId;
    this.cruisers.delete(id);
    if (c.police) for (const nid of c.police.cops || []) { const n = this.game.npcs?.get?.(nid); if (n && !n.dead) { n.leaving = true; } }
    if (!c.removed && (c.owner === 'police' || c.replica)) this.vm.removeCar(c);
  }

  clearAll() {
    for (const c of [...this.cruisers.values()]) this._dropCruiser(c, true);
    this.cruisers.clear();
    for (const h of [...this.helis.values()]) this._removeHeli(h);
    this._clearBlocks(true);
  }

  // The local player got arrested / died: everyone chasing them goes home.
  _onLocalCaught() {
    if (!this.auth) return;
    for (const c of this.cruisers.values()) if (c.police?.tkey === 'player' && c.police.state !== 'block') this._leave(c);
    for (const h of this.helis.values()) if (h.tkey === 'player') h.leaving = true;
  }

  // ---------------------------------------------------------------- host: driving
  _aimFor(c, w) {
    // Cops chase what they can see; otherwise they sweep the last known spot.
    const P = c.police;
    if (w.seen || !w.lastKnown) { P.searchPt = null; return { x: w.pos.x, z: w.pos.z, live: true }; }
    const lk = w.lastKnown;
    const pickPt = () => { const a = Math.random() * Math.PI * 2, r = rand(10, 25 + w.heat * 9); return { x: lk.x + Math.sin(a) * r, z: lk.z + Math.cos(a) * r }; };
    if (!P.searchPt) {
      if (Math.hypot(c.x - lk.x, c.z - lk.z) > 14) return { x: lk.x, z: lk.z, live: false };
      P.searchPt = pickPt();
    }
    if (Math.hypot(c.x - P.searchPt.x, c.z - P.searchPt.z) < 14) P.searchPt = pickPt();
    return { x: P.searchPt.x, z: P.searchPt.z, live: false };
  }

  _drive(c, dt) {
    const P = c.police, inp = c.input;
    inp.nitro = false; inp.handbrake = false; inp.noReverse = false; inp.throttle = 0; inp.reverse = 0;
    if (!P || c.dead || c.exploded) { inp.handbrake = true; return; }
    if (P.state === 'block' || P.state === 'parked' || P.state === 'abandoned') { inp.handbrake = true; inp.steer = 0; return; }
    const g = this.game;
    const w = this._wanted.find((x) => x.key === P.tkey);
    let tx, tz, desired = 32;
    const p = c.group.position;
    P.losT -= dt;
    let aim = null, d = 999;
    if (P.state === 'leave' || !w) {
      // cruise off along the road graph, sirens off
      if (!P.path || P.pi >= P.path.length) this._routeTo(c, p.x + Math.sin(c.heading) * 200, p.z + Math.cos(c.heading) * 200);
      if (P.path && P.pi < P.path.length) { const r = this._followPath(c); tx = r.x; tz = r.z; desired = Math.min(16, r.speed); }
      else { tx = p.x + Math.sin(c.heading) * 20; tz = p.z + Math.cos(c.heading) * 20; desired = 10; }
    } else {
      aim = this._aimFor(c, w);
      d = Math.hypot(aim.x - p.x, aim.z - p.z);
      if (P.losT <= 0) { P.losT = 0.3; P.los = g.physics.raycast(p.x, p.z, aim.x, aim.z, 1.5, 1.2) >= 1; }
      const stopped = !w.inCar || w.speed < 2;
      const close = d < 42 && P.los;
      if (aim.live && stopped && d < 16) {
        // pull up and bail out
        tx = aim.x; tz = aim.z;
        desired = d < 9 ? 0 : clamp((d - 8) * 1.4, 0, 14);
        if (c.speed < 1.6 && d < 17) { this._deploy(c, w); return; }
      } else if (close || (!P.path && d < 60)) {
        P.path = null;
        const lead = clamp(d / 35, 0, 0.9);
        tx = aim.x + (aim.live ? w.vx * lead : 0); tz = aim.z + (aim.live ? w.vz * lead : 0);
        desired = d > 25 ? 40 : (w.inCar ? w.speed + 9 : 12);
        if (aim.live && w.inCar && d < 16 && w.speed > 4) {
          // PIT: aim for the suspect's rear quarter and steer into it
          const hx = Math.sin(w.heading), hz = Math.cos(w.heading);
          const rx = -hz, rz = hx;
          const side = ((p.x - aim.x) * rx + (p.z - aim.z) * rz) >= 0 ? 1 : -1;
          const k = d < 6 ? 0.3 : 1;
          tx = aim.x - hx * 1.8 * k + rx * side * 1.3 * k + w.vx * 0.25;
          tz = aim.z - hz * 1.8 * k + rz * side * 1.3 * k + w.vz * 0.25;
          desired = w.speed + 7;
          P.barkT -= dt;
          if (P.barkT <= 0 && d < 12) { P.barkT = rand(5, 9); try { g.npcs?.say?.(c.group, RAM_BARKS[(Math.random() * RAM_BARKS.length) | 0], { ttl: 2.2, kind: 'cop', height: 2.4 }); } catch { /* ignore */ } }
        }
        c.aiSpeedMul = d > 70 ? 1.18 : 1.04;
      } else {
        P.pathT -= dt;
        if (!P.path || P.pathT <= 0 || P.pi >= P.path.length) { this._routeTo(c, aim.x, aim.z); P.pathT = 1.6; }
        if (P.path && P.pi < P.path.length) {
          const r = this._followPath(c, d > 80 ? 1.3 : 1.12);
          tx = r.x; tz = r.z; desired = r.speed;
        } else { tx = aim.x; tz = aim.z; desired = 26; }
        c.aiSpeedMul = d > 90 ? 1.2 : 1.05;
      }
      // drive-by: the passenger leans out at 3+ stars
      if (aim.live && w.heat >= 3 && P.crew > 1) {
        P.shootT -= dt;
        if (P.shootT <= 0 && d < 30 && P.los) { P.shootT = rand(1.1, 2.2) / (w.heat >= 5 ? 1.5 : 1); this._carShoot(c, w, d); }
      }
    }
    // swerve around slowpokes in the lane
    const f = c.forward;
    P.avT = (P.avT || 0) - dt;
    if (P.avT <= 0) {
      P.avT = 0.2; P.avSide = 0;
      for (const o of this.vm.cars) {
        if (o === c || o.removed || o === this.vm.current) continue;
        const ox = o.x - p.x, oz = o.z - p.z;
        if (Math.abs(ox) > 20 || Math.abs(oz) > 20) continue;
        const fw = ox * f.x + oz * f.z;
        if (fw < 2 || fw > 8 + c.speed * 0.4) continue;
        const lt = ox * -f.z + oz * f.x;
        if (Math.abs(lt) < 2.6) { P.avSide = lt > 0 ? -1 : 1; break; }
      }
    }
    if (P.avSide) { tx += -f.z * P.avSide * 4.5; tz += f.x * P.avSide * 4.5; }
    // steering toward the carrot
    const dx = tx - p.x, dz = tz - p.z;
    const fwd = dx * f.x + dz * f.z, lat = dx * -f.z + dz * f.x;
    const ang = Math.atan2(lat, fwd);
    inp.steer = clamp(-ang * 2.4, -1, 1);
    if (Math.abs(ang) > 0.5 && c.speed > 14) desired *= clamp(1.2 - Math.abs(ang) * 0.55, 0.35, 1);
    if (fwd < 0 && Math.hypot(dx, dz) < 10 && c.speed < 6) { inp.steer = -inp.steer; desired = -6; }
    const v = c.vf;
    if (desired < 0) { inp.reverse = 1; inp.noReverse = false; }
    else if (v < desired - 0.5) inp.throttle = clamp((desired - v) / 4, 0.3, 1);
    else if (v > desired + 1.5) { inp.reverse = clamp((v - desired) / 5, 0.2, 1); inp.noReverse = true; }
    else inp.throttle = desired > 0.5 ? 0.25 : 0;
    if (desired < 0.3 && desired >= 0 && Math.abs(v) < 1) { inp.handbrake = true; inp.throttle = 0; inp.reverse = 0; }
    // unstick: back up and swing the other way
    if (c.speed < 1.2 && desired > 3) P.stuckT += dt; else P.stuckT = Math.max(0, P.stuckT - dt * 2);
    if (P.stuckT > 1.4 && P.backT <= 0) { P.backT = 1.1; P.stuckT = 0; P.path = null; }
    if (P.backT > 0) {
      P.backT -= dt;
      inp.throttle = 0; inp.reverse = 1; inp.noReverse = false; inp.steer = -inp.steer || 1; inp.handbrake = false;
    }
  }

  // A* over the road graph from the car's nearest node to the one nearest (x,z).
  _routeTo(c, x, z) {
    const G = this._graph();
    const P = c.police;
    if (!G) { P.path = null; return; }
    const near = (px, pz, ahead) => {
      let best = -1, bd = Infinity;
      const f = c.forward;
      for (let i = 0; i < G.nodes.length; i++) {
        const n = G.nodes[i];
        const dx = n.x - px, dz = n.z - pz;
        let d = dx * dx + dz * dz;
        if (ahead && dx * f.x + dz * f.z < -4) d *= 3; // prefer nodes in front of the bumper
        if (d < bd && G.adj[i].length) { bd = d; best = i; }
      }
      return best;
    };
    const s = near(c.x, c.z, true), goal = near(x, z, false);
    if (s < 0 || goal < 0) { P.path = null; return; }
    const N = G.nodes.length;
    const gs = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (i) => Math.hypot(G.nodes[i].x - G.nodes[goal].x, G.nodes[i].z - G.nodes[goal].z);
    gs[s] = 0;
    const open = [s];
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) { const f = gs[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k; } }
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      closed[cur] = 1;
      for (const nb of G.adj[cur]) {
        if (closed[nb]) continue;
        const ng = gs[cur] + Math.hypot(G.nodes[nb].x - G.nodes[cur].x, G.nodes[nb].z - G.nodes[cur].z);
        if (ng < gs[nb]) { gs[nb] = ng; from[nb] = cur; if (!open.includes(nb)) open.push(nb); }
      }
    }
    if (from[goal] < 0 && goal !== s) { P.path = null; return; }
    const path = [];
    for (let i = goal; i >= 0; i = from[i]) { path.push(i); if (i === s) break; }
    path.reverse();
    P.path = path; P.pi = 0;
    // skip the first node if it's behind us
    if (path.length > 1) {
      const n0 = G.nodes[path[0]], f = c.forward;
      if ((n0.x - c.x) * f.x + (n0.z - c.z) * f.z < 0 && Math.hypot(n0.x - c.x, n0.z - c.z) < 20) P.pi = 1;
    }
  }

  _followPath(c, boost = 1) {
    const G = this._graph(), P = c.police;
    const path = P.path;
    const p = c.group.position;
    let i = P.pi;
    const nodeAt = (k) => G.nodes[path[k]];
    const laneAt = (k) => {
      const N = nodeAt(k);
      const prev = k > 0 ? nodeAt(k - 1) : { x: p.x, z: p.z };
      const dx = N.x - prev.x, dz = N.z - prev.z, l = Math.hypot(dx, dz) || 1;
      return { x: N.x - (dz / l) * LANE, z: N.z + (dx / l) * LANE, ux: dx / l, uz: dz / l };
    };
    let T = laneAt(i);
    let dn = Math.hypot(T.x - p.x, T.z - p.z);
    if (dn < Math.max(7, c.speed * 0.32) && i < path.length - 1) { P.pi = ++i; T = laneAt(i); dn = Math.hypot(T.x - p.x, T.z - p.z); }
    else if (dn < 6 && i === path.length - 1) { P.pi = path.length; }
    const top = 35 * boost;
    let speed = top;
    if (i < path.length - 1) {
      const N = nodeAt(i), M = nodeAt(i + 1);
      const ox = M.x - N.x, oz = M.z - N.z, ol = Math.hypot(ox, oz) || 1;
      const dot = (ox / ol) * T.ux + (oz / ol) * T.uz;
      const turnK = (1 - dot) / 2;
      const corner = clamp(36 - 40 * turnK, 12, 36);
      speed = Math.min(top, corner + Math.max(0, dn - 8) * 1.1);
    }
    // aim a touch past the node so we don't overshoot the corner
    return { x: T.x, z: T.z, speed };
  }

  _deploy(c, w) {
    const P = c.police;
    if (P.crew <= 0) { P.state = 'abandoned'; return; }
    const g = this.game;
    const lvl = Math.max(1, Math.floor(w.heat));
    const f = c.forward;
    const lx = f.z, lz = -f.x;
    const half = c.dims.W / 2 + 0.75;
    const seats = [[lx * half, lz * half], [-lx * half, -lz * half]];
    P.cops = [];
    for (let i = 0; i < P.crew; i++) {
      const [ox, oz] = seats[i % 2];
      const n = g.police?.spawnCopAt?.(w, lvl, c.x + ox + f.x * 0.3, c.z + oz + f.z * 0.3, { cruiser: P.id });
      if (n) P.cops.push(n.id);
    }
    P.crew = 0;
    P.state = 'parked';
    P.parkT = 0;
    c.sirenMute = true;
    c.setDriverVisible(false);
    c.input.throttle = 0; c.input.handbrake = true;
  }

  // Parked cruiser: cops re-board and resume the chase if the suspect drives off.
  _manageParked(c, w) {
    const P = c.police;
    const npcs = this.game.npcs;
    P.parkT = (P.parkT || 0) + 0.5;
    const alive = P.cops.map((id) => npcs?.get?.(id)).filter((n) => n && !n.dead && !n.removed);
    if (!alive.length) { P.state = 'abandoned'; c.setSiren(P.parkT < 30); return; }
    if (!w) {
      if (alive.every((n) => Math.hypot(n.pos.x - c.x, n.pos.z - c.z) < 30) && P.parkT > 3) this._reboard(c, alive);
      else if (P.parkT > 20 && this._farFromPlayers(c.x, c.z, 70)) this._dropCruiser(c);
      return;
    }
    const far = Math.hypot(w.pos.x - c.x, w.pos.z - c.z);
    if (w.inCar && far > 32 && P.parkT > 2) {
      const near = alive.filter((n) => Math.hypot(n.pos.x - c.x, n.pos.z - c.z) < 26);
      if (near.length === alive.length) this._reboard(c, alive);
    }
  }

  _reboard(c, cops) {
    const P = c.police;
    for (const n of cops) this.game.npcs.remove(n);
    P.crew = Math.min(2, cops.length);
    P.cops = [];
    P.state = 'route'; P.path = null;
    c.sirenMute = false;
    c.setDriverVisible(true, COP_SHIRT);
  }

  _carShoot(c, w, d) {
    const g = this.game;
    const fx = g.combat?.fx;
    const f = c.forward;
    const sx = c.x - f.z * 0.9, sz = c.z + f.x * 0.9; // passenger window
    const hit = chance(clamp(0.55 - d / 60 - (w.speed > 15 ? 0.15 : 0), 0.12, 0.5));
    const ox = hit ? 0 : rand(-1.8, 1.8), oz = hit ? 0 : rand(-1.8, 1.8);
    try {
      fx?.tracer(sx, 1.35, sz, w.pos.x + ox, 1.0, w.pos.z + oz);
      fx?.muzzle(sx, 1.35, sz, 0.5);
      g.combat?.sfx?.('gun', { pos: { x: sx, z: sz }, vol: 0.8 });
      if (g.net.connected) g.net.broadcast({ t: 'combat:shot', x: sx, y: 1.35, z: sz, x2: w.pos.x + ox, z2: w.pos.z + oz, w: 'pistol', n: 1 });
    } catch { /* cosmetic */ }
    if (!hit) return;
    this.shootTarget(w.t, 9, w.inCar ? 0.3 : 0, 'Officer in a cruiser');
  }

  // Bullets meant for a wanted player: car damage + tire chance in a car, HP on foot.
  shootTarget(t, dmg, tireChance = 0.25, source = 'a cop') {
    const g = this.game;
    if (t?.type === 'player') {
      if (g.player?.vehicle && this.vm.current) this.hitLocalCar(dmg, chance(tireChance));
      else g.combat?.hurtPlayer?.(dmg, { cop: true, gun: true, lethal: true, source });
    } else if (t?.type === 'remote') {
      const r = g.net.remotePlayers?.get?.(t.id);
      try {
        if (r?.vehicle) g.net.sendTo(t.id, { t: 'police:tire', dmg, pop: chance(tireChance) });
        else g.net.sendTo(t.id, { t: 'combat:hitPlayer', dmg, lethal: true, cop: true, gun: true, src: source });
      } catch { /* ignore */ }
    }
  }

  hitLocalCar(dmg, pop) {
    const car = this.vm.current;
    if (!car || car.dead) return;
    car.damage(dmg, 'cops');
    this.vm.fx.sparks(car.x, 0.8, car.z, 5, 0.6);
    if (pop && car.popTire(1)) {
      this.audio.pop(1);
      this.game.ui.toast(TIRE_TOASTS[(Math.random() * TIRE_TOASTS.length) | 0], 'bad', 2600);
      this.game.cameraRig?.shake?.(0.25, 0.2);
    }
  }

  // ---------------------------------------------------------------- stealing a cruiser
  // Called from VehicleManager.carjack before the car becomes the player's.
  onStolen(car) {
    const g = this.game;
    if (car.replica) {
      const id = car.netId;
      this.cruisers.delete(id);
      car.replica = false; car.net = null; car.owner = 'civil';
      car.setSiren(false);
      try { g.net.sendToHost({ t: 'police:steal', id }); } catch { /* ignore */ }
    } else if (car.police) {
      const P = car.police;
      this.cruisers.delete(P.id);
      const crew = P.crew;
      car.police = null;
      car.setSiren(false);
      if (crew > 0) this._yankCops(car, { t: { type: 'player' }, key: 'player', heat: Math.max(3, g.state.p.heat || 0), pos: car.group.position }, crew);
    }
    g.ui.bigText('GRAND THEFT AUTO', 'You stole a COP CAR. Every badge in Rotwell just felt a disturbance.', 2600);
    try { g.combat?.crime?.('stealCop', car.x, car.z); } catch { /* ignore */ }
  }

  onRemoteSteal(id, from) {
    const car = this.cruisers.get(id);
    if (!car) return;
    const P = car.police;
    this.cruisers.delete(id);
    if (P?.crew > 0) this._yankCops(car, { t: { type: 'remote', id: from }, key: from, heat: 4, pos: car.group.position }, P.crew);
    car.police = null;
    this.vm.removeCar(car);
  }

  _yankCops(car, w, n) {
    const f = car.forward;
    const lx = f.z, lz = -f.x;
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? 1 : -1;
      const cop = this.game.police?.spawnCopAt?.(w, Math.max(3, Math.floor(w.heat)), car.x + lx * s * (car.dims.W / 2 + 1.1), car.z + lz * s * (car.dims.W / 2 + 1.1), { yanked: true });
      if (cop) { cop.kbx = lx * s * 6; cop.kbz = lz * s * 6; cop.knockdown = 1.1; cop.model.setDead(true); }
    }
  }

  // ---------------------------------------------------------------- collisions (from VehicleManager.collideCars)
  onCollide(a, b, impact) {
    const g = this.game, cur = this.vm.current;
    const cop = this.isCruiser(a) ? a : this.isCruiser(b) ? b : null;
    if (!cop) return;
    const other = cop === a ? b : a;
    if (other !== cur) return;
    // PIT kick: cops ramming the player's rear quarter spin them out
    const P = cop.police;
    const ramming = (P && P.state === 'route') || cop.replica;
    if (ramming && impact > 3 && cop.speed > cur.speed * 0.6) {
      const f = cur.forward;
      const rel = (cop.x - cur.x) * f.x + (cop.z - cur.z) * f.z;
      if (rel < 0.5) {
        const lat = (cop.x - cur.x) * -f.z + (cop.z - cur.z) * f.x;
        cur.angVel = clamp(cur.angVel + Math.sign(lat || 1) * clamp(impact * 0.13, 0.4, 2.4), -4.5, 4.5);
        g.cameraRig?.shake?.(0.35, 0.3);
      }
    }
    if (cop.replica && impact > 5) { try { g.net.sendToHost({ t: 'police:hit', id: cop.netId, dmg: Math.round((impact - 4) * 1.3) }); } catch { /* ignore */ } }
    // ramming the fuzz is a crime (they take it personally)
    if (impact > 8 && cur.speed >= cop.speed * 0.8) this.vm.crime('assaultCop', cop.x, cop.z);
  }

  // ---------------------------------------------------------------- roadblocks & spike strips
  _hasBlockFor(key) { for (const b of this.blocks.values()) if (b.tkey === key) return true; return false; }

  _spawnBlock(w) {
    const G = this._graph();
    if (!G) return null;
    const info = this.game.world?.roads?.info;
    const hx = Math.sin(w.heading), hz = Math.cos(w.heading);
    // the edge the suspect is driving along
    let best = null, bd = 16;
    for (let ei = 0; ei < G.edges.length; ei++) {
      const [a, b] = G.edges[ei];
      const A = G.nodes[a], B = G.nodes[b];
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ux = dx / len, uz = dz / len;
      const al = ux * hx + uz * hz;
      if (Math.abs(al) < 0.7) continue;
      const s = (w.pos.x - A.x) * ux + (w.pos.z - A.z) * uz;
      if (s < -4 || s > len + 4) continue;
      const lat = Math.abs((w.pos.x - A.x) * -uz + (w.pos.z - A.z) * ux);
      if (lat < bd) { bd = lat; best = al > 0 ? { from: a, to: b, s, len, ei } : { from: b, to: a, s: len - s, len, ei }; }
    }
    if (!best) return null;
    let need = clamp(55 + w.speed * 1.2, 65, 110);
    let { from, to, s, len, ei } = best;
    for (let hop = 0; hop < 5; hop++) {
      const A = G.nodes[from], B = G.nodes[to];
      const ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
      const remain = len - s;
      if (remain - 16 > need && s + need > 14) {
        const px = A.x + ux * (s + need), pz = A.z + uz * (s + need);
        const hw = info?.[ei]?.hw ?? 10;
        return this._placeBlock(w, px, pz, ux, uz, hw);
      }
      need = Math.max(20, need - remain);
      // continue straight-ish through the intersection
      let nb = -1, bal = 0.35;
      for (const c of G.adj[to]) {
        if (c === from) continue;
        const C = G.nodes[c];
        const l = Math.hypot(C.x - B.x, C.z - B.z) || 1;
        const al = ((C.x - B.x) / l) * ux + ((C.z - B.z) / l) * uz;
        if (al > bal) { bal = al; nb = c; }
      }
      if (nb < 0) return null;
      from = to; to = nb; s = 0;
      const C = G.nodes[to];
      len = Math.hypot(C.x - B.x, C.z - B.z);
      ei = G.edges.findIndex((e) => (e[0] === from && e[1] === to) || (e[0] === to && e[1] === from));
    }
    return null;
  }

  _placeBlock(w, px, pz, ux, uz, hw) {
    const g = this.game;
    if (!this._farFromPlayers(px, pz, 45)) return null;
    const rx = -uz, rz = ux;
    const id = 'rb' + (this.seq++);
    const roadW = clamp(hw * 0.95, 6, 12);
    const cars = [];
    const offs = roadW > 8 ? [-0.62, 0.05, 0.68] : [-0.45, 0.5];
    for (const k of offs) {
      const x = px + rx * roadW * k, z = pz + rz * roadW * k;
      if (g.physics.pointBlocked(x, z)) continue;
      const rot = Math.atan2(rx, rz) + (k < 0 ? 0.4 : -0.4) + Math.PI * (Math.random() < 0.5 ? 1 : 0);
      const car = this.vm.spawnCar('interceptor', { x, z, rot, owner: 'police', driver: false });
      const cid = 'pc' + (this.seq++);
      car.netId = cid;
      car.police = { id: cid, tkey: w.key, t: w.t, state: 'block', crew: 0, cops: [], stuckT: 0, backT: 0, block: id };
      car.setSiren(true);
      car.sirenMute = true;
      this.cruisers.set(cid, car);
      cars.push(cid);
    }
    if (!cars.length) return null;
    // spike strip on the suspect's side of the cars
    const sx = px - ux * 9, sz = pz - uz * 9;
    const b = { id, tkey: w.key, x: sx, z: sz, ux, uz, len: roadW * 2 - 1, cars, born: g.elapsed, cx: px, cz: pz };
    b.mesh = spikeMesh(b.len);
    b.mesh.position.set(sx, 0.02, sz);
    b.mesh.rotation.y = Math.atan2(ux, uz);
    g.scene.add(b.mesh);
    this.blocks.set(id, b);
    // a couple of cops crouched behind the cars
    const lvl = Math.max(3, Math.floor(w.heat));
    for (let i = 0; i < 2; i++) {
      const k = i ? 0.35 : -0.3;
      const n = g.police?.spawnCopAt?.(w, lvl, px + rx * roadW * k + ux * 3.5, pz + rz * roadW * k + uz * 3.5, { roadblock: id });
      if (n) b.cops = [...(b.cops || []), n.id];
    }
    return b;
  }

  _updateBlocks() {
    const g = this.game;
    for (const b of [...this.blocks.values()]) {
      const w = this._wanted.find((x) => x.key === b.tkey);
      const age = g.elapsed - b.born;
      const passed = w ? Math.hypot(w.pos.x - b.cx, w.pos.z - b.cz) : 999;
      if ((age > 50 || (!w && age > 8) || (passed > 140 && age > 10)) && this._farFromPlayers(b.cx, b.cz, 60)) this._removeBlock(b);
      else if (age > 120) this._removeBlock(b);
    }
  }

  _removeBlock(b, replicaOnly = false) {
    this.blocks.delete(b.id);
    b.mesh?.removeFromParent();
    if (replicaOnly) return;
    for (const cid of b.cars || []) { const c = this.cruisers.get(cid); if (c) this._dropCruiser(c); }
    for (const nid of b.cops || []) { const n = this.game.npcs?.get?.(nid); if (n && !n.dead) { n.leaving = true; n.hostile = false; n.target = null; n.state = 'wander'; n.data.pursuit = false; } }
  }

  _clearBlocks(replicaOnly) { for (const b of [...this.blocks.values()]) this._removeBlock(b, replicaOnly); }

  // Each machine checks its own car (and nearby traffic) against the strips.
  _spikeCheck() {
    if (!this.blocks.size) return;
    const cur = this.vm.current;
    for (const b of this.blocks.values()) {
      const rx = -b.uz, rz = b.ux;
      for (const c of this.vm.cars) {
        if (c.removed || c.exploded || this.isCruiser(c) || c._spiked === b.id) continue;
        if (c !== cur && !c.ai) continue;
        const dx = c.x - b.x, dz = c.z - b.z;
        if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
        const across = dx * rx + dz * rz, along = dx * b.ux + dz * b.uz;
        if (Math.abs(across) > b.len / 2 + 0.3 || Math.abs(along) > c.dims.L / 2 + 0.25) continue;
        c._spiked = b.id;
        if (c.popTire(4)) {
          this.vm.fx.sparks(c.x, 0.3, c.z, 12, 0.8);
          if (c === cur) {
            this.audio.pop(1.4);
            this.game.ui.toast(SPIKE_TOASTS[(Math.random() * SPIKE_TOASTS.length) | 0], 'bad', 3000);
            this.game.cameraRig?.shake?.(0.5, 0.35);
          } else if (c.ai) c.ai.stunned = 3;
        }
      }
    }
  }

  // ---------------------------------------------------------------- helicopter
  _spawnHeli(w) {
    const a = Math.random() * Math.PI * 2;
    const id = 'ph' + (this.seq++);
    const h = this._makeHeli(id);
    h.tkey = w.key; h.t = w.t;
    h.x = w.pos.x + Math.sin(a) * 150; h.z = w.pos.z + Math.cos(a) * 150; h.y = 42;
    h.yaw = Math.atan2(w.pos.x - h.x, w.pos.z - h.z);
    h.orbit = a + Math.PI;
    this.game.ui.toast('<b>CHOPPER INBOUND.</b> Rotwell PD rented a helicopter. With YOUR taxes.', 'bad', 3200);
    return h;
  }

  _makeHeli(id) {
    const mesh = heliMesh();
    this.game.scene.add(mesh);
    const cone = new THREE.Mesh(heliAssets().coneGeo, heliAssets().coneMat);
    cone.visible = false;
    cone.frustumCulled = false;
    this.game.scene.add(cone);
    const h = { id, mesh, cone, x: 0, y: 40, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0, orbit: 0, spotX: 0, spotZ: 0, spotOn: false, leaving: false, shootT: rand(3, 5), net: null, sweep: 0 };
    this.helis.set(id, h);
    return h;
  }

  _removeHeli(h) {
    this.helis.delete(h.id);
    h.mesh.removeFromParent();
    h.cone.removeFromParent();
  }

  _clearReplicaHelis() { for (const h of [...this.helis.values()]) if (h.net) this._removeHeli(h); }

  _flyHeli(h, dt) {
    const g = this.game;
    const w = this._wanted.find((x) => x.key === h.tkey);
    let ax, az, alt = 27;
    if (h.leaving || !w) {
      h.leaving = true;
      const l = Math.hypot(h.vx, h.vz) || 1;
      ax = h.x + (h.vx / l) * 100 + 1; az = h.z + (h.vz / l) * 100; alt = 55;
      if (this._farFromPlayers(h.x, h.z, 190)) { this._removeHeli(h); return; }
    } else {
      const seen = w.seen || !w.lastKnown;
      const tp = seen ? w.pos : w.lastKnown;
      h.orbit += dt * (seen ? 0.32 : 0.55);
      const R = seen ? 17 : 32;
      ax = tp.x + Math.sin(h.orbit) * R + (seen ? w.vx * 0.8 : 0);
      az = tp.z + Math.cos(h.orbit) * R + (seen ? w.vz * 0.8 : 0);
      // spotlight: locked on when seen, sweeping the area when not
      h.sweep += dt;
      const sx = seen ? w.pos.x : tp.x + Math.sin(h.sweep * 0.9) * 18, sz = seen ? w.pos.z : tp.z + Math.cos(h.sweep * 0.7) * 18;
      const k = 1 - Math.exp(-(seen ? 6 : 2) * dt);
      h.spotX += (sx - h.spotX) * k; h.spotZ += (sz - h.spotZ) * k;
      h.lookX = tp.x; h.lookZ = tp.z;
      // the gunner (SWAT sniper) takes potshots at 5 stars
      h.shootT -= dt;
      const d = Math.hypot(w.pos.x - h.x, w.pos.z - h.z);
      if (seen && h.shootT <= 0 && d < 55 && w.heat >= 5) {
        h.shootT = rand(2.2, 3.6);
        this._heliShoot(h, w);
      }
    }
    const dx = ax - h.x, dz = az - h.z, dist = Math.hypot(dx, dz) || 1;
    const maxSpd = h.leaving ? 30 : 33;
    const want = Math.min(maxSpd, dist * 0.9);
    const tvx = (dx / dist) * want, tvz = (dz / dist) * want;
    const k = Math.min(1, dt * 1.1);
    h.vx += (tvx - h.vx) * k; h.vz += (tvz - h.vz) * k;
    h.x += h.vx * dt; h.z += h.vz * dt;
    h.y += ((alt + Math.sin(g.elapsed * 0.5 + h.orbit) * 1.5) - h.y) * Math.min(1, dt * 0.8);
    const look = h.lookX != null && !h.leaving ? Math.atan2(h.lookX - h.x, h.lookZ - h.z) : Math.atan2(h.vx, h.vz);
    h.yaw += wrapA(look - h.yaw) * Math.min(1, dt * 1.6);
    const fv = h.vx * Math.sin(h.yaw) + h.vz * Math.cos(h.yaw);
    const lv = h.vx * -Math.cos(h.yaw) + h.vz * Math.sin(h.yaw);
    h.pitch += (clamp(fv * 0.011, -0.28, 0.28) - h.pitch) * Math.min(1, dt * 2);
    h.roll += (clamp(-lv * 0.012, -0.3, 0.3) - h.roll) * Math.min(1, dt * 2);
    h.spotOn = !h.leaving;
  }

  _heliShoot(h, w) {
    const g = this.game;
    const hit = chance(w.inCar ? 0.45 : 0.32);
    const ox = hit ? 0 : rand(-2, 2), oz = hit ? 0 : rand(-2, 2);
    const sx = h.x - Math.cos(h.yaw) * 1.4, sz = h.z + Math.sin(h.yaw) * 1.4;
    try {
      g.combat?.fx?.tracer(sx, h.y - 0.6, sz, w.pos.x + ox, 1.0, w.pos.z + oz);
      g.combat?.sfx?.('biggun', { pos: { x: h.x, z: h.z }, vol: 1 });
      if (g.net.connected) g.net.broadcast({ t: 'combat:shot', x: sx, y: h.y - 0.6, z: sz, x2: w.pos.x + ox, z2: w.pos.z + oz, w: 'rifle', n: 1 });
    } catch { /* cosmetic */ }
    if (hit) this.shootTarget(w.t, 14, 0.4, 'the SWAT sniper upstairs');
  }

  _lerpHeli(h, dt) {
    const n = h.net;
    if (!n) return;
    const k = 1 - Math.exp(-6 * dt);
    h.x += (n.x - h.x) * k; h.y += (n.y - h.y) * k; h.z += (n.z - h.z) * k;
    h.yaw += wrapA(n.yaw - h.yaw) * k;
    h.pitch += (n.pitch - h.pitch) * k; h.roll += (n.roll - h.roll) * k;
    h.spotX += (n.sx - h.spotX) * k; h.spotZ += (n.sz - h.spotZ) * k;
    h.spotOn = n.on;
  }

  _animHeli(h, dt) {
    const m = h.mesh, v = m.userData;
    m.position.set(h.x, h.y, h.z);
    m.rotation.set(h.pitch, h.yaw, h.roll, 'YXZ');
    h.rotor += dt * 26;
    v.rotor.rotation.y = h.rotor;
    v.tail.rotation.x = h.rotor * 1.7;
    const t = this.game.elapsed;
    v.beacon.material = (t * 1.6) % 1 < 0.12 ? heliAssets().beaconOn : heliAssets().beaconOff;
    // spotlight cone (night only)
    const night = this.vm.nightLevel ?? 0;
    const on = h.spotOn && night > 0.15;
    h.cone.visible = on;
    if (on) {
      const ox = h.x + Math.sin(h.yaw) * 1.6, oy = h.y - 1.1, oz = h.z + Math.cos(h.yaw) * 1.6;
      const dx = h.spotX - ox, dy = -oy, dz = h.spotZ - oz;
      const len = Math.hypot(dx, dy, dz);
      h.cone.position.set(ox, oy, oz);
      _dir.set(dx / len, dy / len, dz / len);
      h.cone.quaternion.setFromUnitVectors(_down, _dir);
      const rad = len * 0.16;
      h.cone.scale.set(rad, len, rad);
      h.cone.material.opacity = 0.025 + night * 0.035;
    }
  }

  // ---------------------------------------------------------------- client mirror
  snapshot() {
    const c = [], h = [], b = [];
    for (const car of this.cruisers.values()) {
      if (car.removed) continue;
      const P = car.police;
      const flags = (car.sirenOn ? 1 : 0) | (P && P.crew > 0 ? 2 : 0) | (car.dead ? 4 : 0) | (car.exploded ? 8 : 0) | (car.hasDriver ? 16 : 0) | (car.sirenMute ? 32 : 0);
      c.push([car.netId, r2(car.x), r2(car.z), Math.round(car.heading * 1000) / 1000, Math.round(car.vf * 10) / 10, Math.round(car.steer * 100) / 100,
        Math.round(car.vel.x * 10) / 10, Math.round(car.vel.y * 10) / 10, flags, car.tires, Math.round((car.hp / car.maxHp) * 100)]);
    }
    for (const x of this.helis.values()) {
      h.push([x.id, r2(x.x), r2(x.y), r2(x.z), r2(x.yaw), r2(x.pitch), r2(x.roll), r2(x.spotX), r2(x.spotZ), x.spotOn ? 1 : 0]);
    }
    for (const x of this.blocks.values()) b.push([x.id, r2(x.x), r2(x.z), r2(x.ux), r2(x.uz), r2(x.len)]);
    return { t: 'police:snap', c, h, b };
  }

  applySnap(msg) {
    const g = this.game;
    const seen = new Set();
    for (const rec of msg.c || []) {
      const [id, x, z, rot, vf, steer, vx, vz, flags, tires, hpPct] = rec;
      seen.add(id);
      let car = this.cruisers.get(id);
      if (!car) {
        if (flags & 8) continue; // don't materialise husks
        car = this.vm.spawnCar('interceptor', { x, z, rot, owner: 'police', driver: !!(flags & 16), driverColor: COP_SHIRT, hat: 'cop' });
        car.replica = true; car.netId = id;
        this.cruisers.set(id, car);
      }
      car.net = { x, z, rot, vf, steer, vx, vz, at: g.elapsed };
      car.netFlags = flags;
      car.sirenMute = !!(flags & 32);
      if (!!(flags & 1) !== car.sirenOn) car.setSiren(!!(flags & 1));
      if (!!(flags & 16) !== car.hasDriver) car.setDriverVisible(!!(flags & 16), COP_SHIRT);
      if (tires > car.tires) car.popTire(tires - car.tires);
      car.hp = car.maxHp * (hpPct / 100);
      if ((flags & 8) && !car.exploded) this._replicaExplode(car);
    }
    for (const [id, car] of [...this.cruisers]) if (car.replica && !seen.has(id)) { this.cruisers.delete(id); this.vm.removeCar(car); }

    const hs = new Set();
    for (const rec of msg.h || []) {
      const [id, x, y, z, yaw, pitch, roll, sx, sz, on] = rec;
      hs.add(id);
      let h = this.helis.get(id);
      if (!h) { h = this._makeHeli(id); Object.assign(h, { x, y, z, yaw, spotX: sx, spotZ: sz }); }
      h.net = { x, y, z, yaw, pitch, roll, sx, sz, on: !!on };
    }
    for (const h of [...this.helis.values()]) if (h.net && !hs.has(h.id)) this._removeHeli(h);

    const bs = new Set();
    for (const rec of msg.b || []) {
      const [id, x, z, ux, uz, len] = rec;
      bs.add(id);
      if (this.blocks.has(id)) continue;
      const b = { id, x, z, ux, uz, len, replica: true };
      b.mesh = spikeMesh(len);
      b.mesh.position.set(x, 0.02, z);
      b.mesh.rotation.y = Math.atan2(ux, uz);
      g.scene.add(b.mesh);
      this.blocks.set(id, b);
    }
    for (const b of [...this.blocks.values()]) if (b.replica && !bs.has(b.id)) this._removeBlock(b, true);
  }

  _replicaExplode(car) {
    const vm = this.vm;
    car.exploded = true; car.dead = true;
    const pp = this.game.player.group.position;
    const dist = Math.hypot(car.x - pp.x, car.z - pp.z);
    try {
      vm.fx.explosion(car.x, car.z, [car.vis.paintMat]);
      vm.audio.explosion(dist);
      car.char();
      if (dist < 60) this.game.cameraRig.shake(Math.max(0.2, 1.4 * (1 - dist / 60)), 0.6);
    } catch { /* cosmetic */ }
  }

  // ---------------------------------------------------------------- juice
  _scarePeds(dt) {
    this.scareT -= dt;
    if (this.scareT > 0) return;
    this.scareT = 0.25;
    const npcs = this.game.npcs;
    if (!npcs?.scare) return;
    for (const c of this.vm.cars) {
      if (!c.sirenOn || c.removed || c.speed < 8) continue;
      if (!this.vm.nearPlayer(c, 70)) continue;
      const f = c.forward;
      for (const n of npcs.near(c.x + f.x * 10, c.z + f.z * 10, 11)) {
        const dx = n.pos.x - c.x, dz = n.pos.z - c.z;
        const fw = dx * f.x + dz * f.z, lat = Math.abs(dx * -f.z + dz * f.x);
        if (fw > 1 && fw < 22 && lat < 3 + fw * 0.12) npcs.scare(n, c.x, c.z, { dir: { x: f.x, z: f.z } });
      }
    }
  }

  _updateLights() {
    const pp = this.game.player?.group?.position;
    if (!pp) return;
    const night = this.vm.nightLevel ?? 0;
    // two nearest flashing cars get the two pooled point lights
    let a = null, ad = 85, b = null, bd = 85;
    for (const c of this.vm.cars) {
      if (!c.sirenOn || c.removed || !c.lb) continue;
      const d = Math.abs(c.x - pp.x) + Math.abs(c.z - pp.z);
      if (d < ad) { b = a; bd = ad; a = c; ad = d; } else if (d < bd) { b = c; bd = d; }
    }
    [a, b].forEach((c, i) => {
      const l = this.flash[i];
      if (!c) { if (l.intensity !== 0) { l.intensity = 0; l.position.set(0, -60, 0); } return; }
      const red = c.lb.red.emissiveIntensity > 1, blue = c.lb.blue.emissiveIntensity > 1;
      l.position.set(c.x, 2.4, c.z);
      if (red || blue) { l.color.setHex(red ? 0xff1a10 : 0x1a40ff); l.intensity = 18 + night * 40; } else l.intensity = 0;
    });
    // one pooled spotlight for the nearest heli
    let hb = null, hd = 140;
    for (const h of this.helis.values()) {
      if (!h.cone.visible) continue;
      const d = Math.hypot(h.x - pp.x, h.z - pp.z);
      if (d < hd) { hd = d; hb = h; }
    }
    const s = this.heliSpot;
    if (!hb) { if (s.intensity !== 0) { s.intensity = 0; s.position.set(0, -80, 0); } }
    else {
      s.position.set(hb.cone.position.x, hb.cone.position.y, hb.cone.position.z);
      s.target.position.set(hb.spotX, 0, hb.spotZ);
      s.target.updateMatrixWorld();
      s.intensity = 260 * night;
    }
  }

  _updateAudio() {
    const pp = this.game.player?.group?.position;
    const a = this.audio;
    if (!pp || !a.ready()) return;
    const cur = this.vm.current;
    const lvx = cur ? cur.vel.x : (this.game.player.vel?.x || 0), lvz = cur ? cur.vel.y : (this.game.player.vel?.y || 0);
    // loudest siren wins (with a fake doppler shift)
    let best = null, bd = 150;
    for (const c of this.vm.cars) {
      if (!c.sirenOn || c.sirenMute || c.removed || c.exploded) continue;
      const d = c === cur ? 0 : Math.hypot(c.x - pp.x, c.z - pp.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      let dop = 1;
      if (best !== cur && bd > 0.5) {
        const nx = (best.x - pp.x) / bd, nz = (best.z - pp.z) / bd;
        const vr = (best.vel.x - lvx) * nx + (best.vel.y - lvz) * nz; // + = moving away
        dop = clamp(80 / (80 + vr), 0.72, 1.35);
      }
      const yelp = bd < 28 && best.police?.state === 'route';
      a.siren(clamp(1 - bd / 150, 0, 1) ** 1.6 * (best === cur ? 0.6 : 1), dop, yelp || (best.replica && bd < 28));
    } else a.siren(0, 1, false);
    let hdist = 200;
    for (const h of this.helis.values()) hdist = Math.min(hdist, Math.hypot(h.x - pp.x, h.z - pp.z, h.y));
    a.rotor(clamp(1 - hdist / 170, 0, 1) ** 1.4);
  }
}

// ---------------------------------------------------------------- audio
class PoliceAudio {
  constructor(game) { this.game = game; this.s = null; this.r = null; }
  get ctx() { const a = this.game.audio; return a?.ctx && a.ctx.state === 'running' ? a.ctx : null; }
  ready() { return !!(this.ctx && this.game.audio?.sfx); }

  _noise(ctx) {
    if (this._nb && this._nb.sampleRate === ctx.sampleRate) return this._nb;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.92 + (Math.random() * 2 - 1) * 0.08; d[i] = last * 4; }
    this._nb = b;
    return b;
  }

  siren(vol, dop, yelp) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.s && this.s.ctx !== ctx) this.s = null;
    if (!this.s) {
      if (vol < 0.01) return;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'square'; o2.type = 'sawtooth';
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.game.audio.sfx);
      o1.start(); o2.start();
      this.s = { o1, o2, g, t0: ctx.currentTime, ctx };
    }
    const s = this.s, t = ctx.currentTime;
    const tt = t - s.t0;
    // wail (slow sweep) far away, yelp (fast warble) up close
    const sweep = yelp ? 0.5 - 0.5 * Math.cos(tt * Math.PI * 2 / 0.32) : 0.5 - 0.5 * Math.cos(tt * Math.PI * 2 / 3.6);
    const fr = (620 + 760 * sweep) * dop;
    s.o1.frequency.setTargetAtTime(fr, t, 0.02);
    s.o2.frequency.setTargetAtTime(fr * 1.005, t, 0.02);
    s.g.gain.setTargetAtTime(vol * 0.075, t, 0.08);
  }

  rotor(vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.r && this.r.ctx !== ctx) this.r = null;
    if (!this.r) {
      if (vol < 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = this._noise(ctx); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
      const chop = ctx.createGain(); chop.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
      const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(chop.gain);
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(chop); chop.connect(g); g.connect(this.game.audio.sfx);
      src.start(); lfo.start();
      this.r = { g, ctx };
    }
    this.r.g.gain.setTargetAtTime(vol * 0.5, ctx.currentTime, 0.2);
  }

  pop(vol = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const s = ctx.createBufferSource(); s.buffer = this._noise(ctx);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + i * 500; f.Q.value = 0.9;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0.5 * vol, st); g.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
      s.connect(f); f.connect(g); g.connect(this.game.audio.sfx);
      s.start(st, Math.random()); s.stop(st + 0.3);
    }
  }
}

// ---------------------------------------------------------------- meshes
const _dir = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
let HELI = null;
function heliAssets() {
  if (HELI) return HELI;
  const paint = new THREE.MeshStandardMaterial({ color: 0x151b2a, roughness: 0.5, metalness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1115, metalness: 0.5, roughness: 0.08, transparent: true, opacity: 0.7 });
  const beaconOn = new THREE.MeshStandardMaterial({ color: 0x600000, emissive: 0xff2010, emissiveIntensity: 4 });
  const beaconOff = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0x200000, emissiveIntensity: 0.4 });
  const green = new THREE.MeshStandardMaterial({ color: 0x003000, emissive: 0x20ff40, emissiveIntensity: 2 });
  const red = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2020, emissiveIntensity: 2 });
  const blur = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
  const g = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); return geo; };
  const body = mergeGeometries([
    g(new THREE.SphereGeometry(1.25, 16, 12).scale(1.0, 0.95, 1.65), 0, 0, 0.1),
    g(new THREE.CylinderGeometry(0.16, 0.42, 5.2, 8), 0, 0.3, -3.4, Math.PI / 2),
    g(new THREE.BoxGeometry(0.08, 1.2, 0.85), 0, 0.85, -5.7),
    g(new THREE.BoxGeometry(1.6, 0.06, 0.42), 0, 0.35, -5.3),
    g(new THREE.CylinderGeometry(0.1, 0.14, 0.55, 8), 0, 1.35, 0),
    g(new THREE.BoxGeometry(1.1, 0.45, 1.4), 0, 1.1, -0.4),
  ]);
  const stripe = mergeGeometries([
    g(new THREE.BoxGeometry(2.52, 0.26, 2.6), 0, -0.15, 0.2),
  ]);
  const skids = mergeGeometries([
    g(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), 0.9, -1.45, 0.1, Math.PI / 2),
    g(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), -0.9, -1.45, 0.1, Math.PI / 2),
    g(new THREE.BoxGeometry(0.06, 0.6, 0.06), 0.8, -1.15, 0.8, 0, 0, 0.25),
    g(new THREE.BoxGeometry(0.06, 0.6, 0.06), -0.8, -1.15, 0.8, 0, 0, -0.25),
    g(new THREE.BoxGeometry(0.06, 0.6, 0.06), 0.8, -1.15, -0.7, 0, 0, 0.25),
    g(new THREE.BoxGeometry(0.06, 0.6, 0.06), -0.8, -1.15, -0.7, 0, 0, -0.25),
    g(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), 0, -1.15, 1.6),
  ]);
  const glassGeo = g(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.05, 0.85, 1.05), 0, 0.15, 1.0, Math.PI / 2.4);
  const blades = mergeGeometries([new THREE.BoxGeometry(10, 0.05, 0.3), new THREE.BoxGeometry(0.3, 0.05, 10)]);
  const tailBlades = mergeGeometries([new THREE.BoxGeometry(0.04, 1.3, 0.14), new THREE.BoxGeometry(0.04, 0.14, 1.3)]);
  const disc = new THREE.CircleGeometry(5, 28).rotateX(-Math.PI / 2);
  // apex at the origin, base (radius 1) at y=-1: oriented with setFromUnitVectors(down, dir)
  const coneGeo = new THREE.ConeGeometry(1, 1, 22, 1, true).translate(0, -0.5, 0);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
  const lamp = new THREE.SphereGeometry(0.1, 6, 4);
  HELI = { paint, white, dark, glass, beaconOn, beaconOff, green, red, blur, body, stripe, skids, glassGeo, blades, tailBlades, disc, coneGeo, coneMat, lamp };
  return HELI;
}

function heliMesh() {
  const A = heliAssets();
  const root = new THREE.Group();
  root.name = 'police-heli';
  const add = (geo, mat, parent = root, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; parent.add(m); return m; };
  add(A.body, A.paint);
  add(A.stripe, A.white, root, false);
  add(A.skids, A.dark);
  add(A.glassGeo, A.glass, root, false);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.62, 0);
  add(A.blades, A.dark, rotor);
  add(A.disc, A.blur, rotor, false);
  root.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(0.12, 0.85, -5.85);
  add(A.tailBlades, A.dark, tail, false);
  root.add(tail);
  const beacon = add(A.lamp, A.beaconOff, root, false);
  beacon.position.set(0, -1.15, -0.3);
  const gl = add(A.lamp, A.green, root, false); gl.position.set(-0.8, 0.35, -5.3);
  const rl = add(A.lamp, A.red, root, false); rl.position.set(0.8, 0.35, -5.3);
  root.userData = { rotor, tail, beacon };
  return root;
}

let SPIKE = null;
function spikeMesh(len) {
  if (!SPIKE) {
    const base = new THREE.BoxGeometry(1, 0.06, 0.42);
    const parts = [base];
    // 1-unit long section with spikes; scaled along X per strip
    for (let i = 0; i < 6; i++) {
      for (const z of [-0.12, 0.12]) {
        const c = new THREE.ConeGeometry(0.035, 0.16, 4);
        c.translate(-0.42 + i * 0.17, 0.1, z + (i % 2 ? 0.04 : -0.04));
        parts.push(c);
      }
    }
    SPIKE = {
      geo: mergeGeometries(parts),
      mat: new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.7, roughness: 0.45 }),
      tape: new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0x2a2000, emissiveIntensity: 0.4, roughness: 0.8 }),
    };
  }
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(len));
  // one InstancedMesh per strip keeps it to 2 draw calls
  const inst = new THREE.InstancedMesh(SPIKE.geo, SPIKE.mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation(-len / 2 + (i + 0.5) * (len / n), 0, 0); inst.setMatrixAt(i, m); }
  inst.receiveShadow = true;
  g.add(inst);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.08), SPIKE.tape);
  tape.position.set(0, 0.04, -0.25);
  g.add(tape);
  // strip lies across the road: local X = across, local Z = along the road
  return g;
}
