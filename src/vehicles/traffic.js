import { createStickman } from '../entities/stickman.js';
import { TRAFFIC_COLORS } from '../data/cars.js';
import { weightedPick, pick } from '../core/util.js';

// Local-only ambient traffic. Cars follow the world's road graph in the right
// lane (pure-pursuit on a carrot point), slow for corners, stop for whatever is
// in front of them, honk at you, and despawn when far away. Also keeps a few
// parked civilian cars near the player for stealing.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MIX = {
  downtown: [['commuter', 4], ['puddlejumper', 3], ['rustbucket', 2], ['wanda', 1.2], ['dirtwagon', 1], ['thunderhog', 0.5], ['vendetta', 0.25], ['stretch', 0.25], ['hearse', 0.2], ['widowmaker', 0.4], ['moped', 0.3]],
  hilltop: [['commuter', 3], ['vendetta', 1.4], ['stretch', 0.9], ['puddlejumper', 1], ['thunderhog', 0.8], ['hearse', 0.4], ['widowmaker', 0.3]],
  gutterside: [['rustbucket', 5], ['puddlejumper', 2], ['wanda', 2], ['dirtwagon', 1], ['moped', 0.7], ['commuter', 0.6]],
  rustyards: [['dirtwagon', 3], ['wanda', 3], ['rustbucket', 2], ['commuter', 1], ['puddlejumper', 0.8]],
  dustbowl: [['dirtwagon', 4], ['rustbucket', 3], ['widowmaker', 1], ['thunderhog', 1], ['hearse', 0.3], ['moped', 0.4]],
  blackwater: [['rustbucket', 4], ['dirtwagon', 3], ['wanda', 2], ['moped', 0.8], ['puddlejumper', 0.6]],
};
const DENSITY = { downtown: 13, hilltop: 8, rustyards: 8, gutterside: 7, dustbowl: 5, blackwater: 3 };
const DRIVER_COLORS = [0x1a1a1a, 0x2a1a12, 0x101820, 0x2b2b20, 0x301818, 0x141414];
const HATS = [null, null, null, 'cap', 'beanie', 'fedora', 'hardhat'];

const HONK_BARKS = [
  'MOVE IT, STICK-BRAIN!',
  'Get outta the road, you lumpy coat rack!',
  "I'm walkin' here! ...wait, no, I'm DRIVING here!",
  'Nice parking job, did you lose a bet?',
  'Some of us have parole meetings, jackass!',
  'Your mother drives better and she\'s a mailbox!',
];
const YANK_BARKS = [
  '"MY CAR! I just finished paying it off!"',
  '"Not again! That\'s the third time this WEEK!"',
  '"Take it! The brakes are optional anyway!"',
  '"I\'m calling the cops! ...after I finish crying."',
  '"Hey! My emotional support burrito is in there!"',
  '"You\'ll be hearing from my lawyer! He\'s also my cousin!"',
];

export class Traffic {
  constructor(vm) {
    this.vm = vm;
    this.game = vm.game;
    this.cars = [];
    this.parked = [];
    this.ragdolls = [];
    this.spawnT = 0;
    this.barkT = 0;
    this._g = null;
    this.enabled = true;
  }

  graph() {
    const r = this.game.world?.roads;
    if (!r || !Array.isArray(r.nodes) || r.nodes.length < 2 || !r.edges?.length) return null;
    if (this._g && this._g.src === r && this._g.n === r.nodes.length && this._g.e === r.edges.length) return this._g;
    const adj = r.nodes.map(() => []);
    for (const e of r.edges) {
      const [a, b] = e;
      if (adj[a] && adj[b] && a !== b) { adj[a].push(b); adj[b].push(a); }
    }
    this._g = { src: r, n: r.nodes.length, e: r.edges.length, nodes: r.nodes, edges: r.edges, adj };
    return this._g;
  }

  laneOffset() {
    const w = this.game.world;
    return w?.roads?.laneOffset ?? w?.laneOffset ?? (w?.roads?.width ? w.roads.width / 4 : w?.roadWidth ? w.roadWidth / 4 : 2.4);
  }

  district(x, z) {
    try { return this.game.world?.districtAt?.(x, z) || 'downtown'; } catch { return 'downtown'; }
  }

  desiredCount() {
    const p = this.game.player?.group?.position;
    if (!p) return 0;
    let n = DENSITY[this.district(p.x, p.z)] ?? 8;
    const t = this.game.time;
    if (t.isBetween(1, 5)) n *= 0.35;
    else if (t.isNight) n *= 0.7;
    else if (t.isBetween(7, 9) || t.isBetween(17, 19)) n *= 1.25; // rush hour
    return Math.round(n);
  }

  // Find a lane spot within [minD, maxD] of the player.
  _laneSpot(minD, maxD, curb = false) {
    const G = this.graph();
    const pp = this.game.player.group.position;
    const w = this.game.world;
    for (let tries = 0; tries < 14; tries++) {
      let x, z, rot, ai;
      if (G) {
        const e = G.edges[(Math.random() * G.edges.length) | 0];
        const [a, b] = Math.random() < 0.5 ? [e[0], e[1]] : [e[1], e[0]];
        const A = G.nodes[a], B = G.nodes[b];
        if (!A || !B) continue;
        const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
        if (len < 10) continue;
        const t = 0.15 + Math.random() * 0.7, ux = dx / len, uz = dz / len;
        const lane = this.laneOffset() * (curb ? 1.85 : 1);
        x = A.x + dx * t - uz * lane; z = A.z + dz * t + ux * lane;
        rot = Math.atan2(ux, uz);
        ai = { from: a, to: b };
      } else {
        let p = null;
        try { p = w?.randomRoadPoint?.(); } catch { p = null; }
        if (!p) return null;
        rot = p.dir ?? (((Math.random() * 4) | 0) * Math.PI) / 2;
        x = p.x; z = p.z;
        if (curb) { x += -Math.cos(rot) * 2.5; z += Math.sin(rot) * 2.5; }
        ai = { dir: rot };
      }
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d < minD || d > maxD) continue;
      if (this.game.physics.pointBlocked(x, z)) continue;
      const r = this.game.physics.resolveCircle(x, z, 1.1);
      if (r.hit) continue;
      if (this.vm.carNear(x, z, curb ? 7 : 13)) continue;
      return { x, z, rot, ai };
    }
    return null;
  }

  spawnTraffic(minD = 70, maxD = 150) {
    const s = this._laneSpot(minD, maxD);
    if (!s) return null;
    const mix = MIX[this.district(s.x, s.z)] || MIX.downtown;
    const carId = weightedPick(mix);
    const car = this.vm.spawnCar(carId, {
      x: s.x, z: s.z, rot: s.rot, color: pick(TRAFFIC_COLORS), owner: 'traffic', driver: true,
      driverColor: pick(DRIVER_COLORS), hat: pick(HATS),
    });
    const dist = this.district(s.x, s.z);
    car.ai = {
      ...s.ai, cruise: (8 + Math.random() * 5) * (dist === 'dustbowl' ? 1.5 : dist === 'hilltop' ? 1.15 : 1),
      sense: Math.random() * 0.2, obst: 99, obstType: null, wait: 0, honkT: 0, stunned: 0, ignoreT: 0, stuckT: 0, backT: 0, scanT: 0,
    };
    car.vel.set(Math.sin(s.rot) * car.ai.cruise * 0.7, Math.cos(s.rot) * car.ai.cruise * 0.7);
    this.cars.push(car);
    return car;
  }

  spawnParked(minD = 45, maxD = 140) {
    const s = this._laneSpot(minD, maxD, true);
    if (!s) return null;
    const mix = MIX[this.district(s.x, s.z)] || MIX.downtown;
    const car = this.vm.spawnCar(weightedPick(mix), { x: s.x, z: s.z, rot: s.rot, color: pick(TRAFFIC_COLORS), owner: 'civil', driver: false });
    this.parked.push(car);
    return car;
  }

  release(car) {
    let i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
    car.ai = null;
  }

  clear() {
    for (const c of [...this.cars, ...this.parked]) this.vm.removeCar(c);
    this.cars = []; this.parked = [];
    for (const r of this.ragdolls) r.sm.dispose();
    this.ragdolls = [];
  }

  update(dt) {
    const g = this.game;
    const pp = g.player?.group?.position;
    if (!pp || !g.started) return;
    this.barkT -= dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enabled) {
      this.spawnT = 0.4;
      const want = this.desiredCount();
      // Despawn far / stuck cars.
      for (const c of [...this.cars]) {
        const d = Math.hypot(c.x - pp.x, c.z - pp.z);
        if (d > 200 || (c.ai?.stuckT > 25 && d > 60)) this.vm.removeCar(c);
      }
      for (const c of [...this.parked]) if (Math.hypot(c.x - pp.x, c.z - pp.z) > 180) this.vm.removeCar(c);
      if (this.cars.length > want + 2) {
        // thin out the farthest one
        let far = null, fd = 0;
        for (const c of this.cars) { const d = Math.hypot(c.x - pp.x, c.z - pp.z); if (d > fd && d > 60) { fd = d; far = c; } }
        if (far) this.vm.removeCar(far);
      } else if (this.cars.length < want) {
        this.spawnTraffic(this.initial ? 25 : 70, 150);
        if (this.initial && this.cars.length < want) this.spawnTraffic(25, 150);
      }
      if (this.parked.length < 5) this.spawnParked(this.initial ? 15 : 45, 140);
      if (this.cars.length >= want && this.parked.length >= 5) this.initial = false;
    }
    for (const c of this.cars) {
      if (c.removed) continue;
      try { this.drive(c, dt); } catch (e) { if (!this._err) { console.error('[traffic] drive failed', e); this._err = true; } }
    }
    this.updateRagdolls(dt);
  }

  // ---------------------------------------------------------------- AI driving
  drive(car, dt) {
    const ai = car.ai, inp = car.input;
    inp.nitro = false; inp.handbrake = false; inp.noReverse = true;
    if (!ai || car.dead) return;
    if (ai.stunned > 0) {
      ai.stunned -= dt;
      inp.throttle = 0; inp.reverse = 0; inp.steer = 0; inp.handbrake = car.speed < 3;
      if (ai.stunned <= 0) this.honk(car, true);
      return;
    }
    const G = this.graph();
    const p = car.group.position;
    let tx, tz, desired = ai.cruise;
    // sirens behind you? pull over to the curb and let them by
    ai.sirT = (ai.sirT ?? Math.random() * 0.3) - dt;
    if (ai.sirT <= 0) {
      ai.sirT = 0.3;
      const s = this.vm.police?.sirenNear?.(p.x, p.z, 40);
      if (s && s.car !== car) ai.yieldT = 2.5 + Math.random();
    }
    if (ai.yieldT > 0) { ai.yieldT -= dt; desired = Math.min(desired, 2.5); }
    if (G && ai.to != null && G.nodes[ai.to] && G.nodes[ai.from]) {
      const A = G.nodes[ai.from], B = G.nodes[ai.to];
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
      const lane = this.laneOffset() * (ai.yieldT > 0 ? 2.3 : 1);
      const ax = A.x - uz * lane, az = A.z + ux * lane;
      const along = (p.x - ax) * ux + (p.z - az) * uz;
      if (ai.nextFor !== ai.to) {
        const opts = G.adj[ai.to].filter((n) => n !== ai.from);
        ai.next = opts.length ? opts[(Math.random() * opts.length) | 0] : ai.from;
        ai.nextFor = ai.to;
      }
      if (along > len - lane - 1.5) {
        ai.from = ai.to; ai.to = ai.next; ai.nextFor = null;
        return;
      }
      const look = Math.min(len - lane, along + 6 + car.speed * 0.45);
      tx = ax + ux * look; tz = az + uz * look;
      const remain = len - along;
      if (remain < 16) {
        const C = G.nodes[ai.next];
        if (C) {
          const ex = C.x - B.x, ez = C.z - B.z, el = Math.hypot(ex, ez) || 1;
          const dot = (ex / el) * ux + (ez / el) * uz;
          desired *= 1 - 0.6 * clamp(1 - dot, 0, 1) * clamp((16 - remain) / 10, 0, 1);
          if (dot < -0.5) desired = Math.min(desired, 3); // U-turn at a dead end
        }
      }
    } else {
      // No road graph: drive straight along a lane heading, turn at walls.
      if (ai.dir == null) ai.dir = car.heading;
      tx = p.x + Math.sin(ai.dir) * 12; tz = p.z + Math.cos(ai.dir) * 12;
      ai.scanT -= dt;
      if (ai.scanT <= 0) {
        ai.scanT = 0.5;
        const ph = this.game.physics;
        if (ph.raycast(p.x, p.z, p.x + Math.sin(ai.dir) * 14, p.z + Math.cos(ai.dir) * 14, 1) < 1) {
          const opts = [ai.dir + Math.PI / 2, ai.dir - Math.PI / 2].sort(() => Math.random() - 0.5);
          const ok = opts.find((d) => ph.raycast(p.x, p.z, p.x + Math.sin(d) * 14, p.z + Math.cos(d) * 14, 1) >= 1);
          ai.dir = ok ?? ai.dir + Math.PI;
        }
      }
    }
    const f = car.forward;
    const dx = tx - p.x, dz = tz - p.z;
    const fwd = dx * f.x + dz * f.z, lat = dx * -f.z + dz * f.x;
    inp.steer = clamp(-Math.atan2(lat, fwd) * 2.2, -1, 1);

    ai.sense -= dt;
    if (ai.sense <= 0) {
      ai.sense = 0.12 + Math.random() * 0.06;
      const o = this.sense(car);
      ai.obst = o.d; ai.obstType = o.type;
    }
    if (ai.ignoreT > 0) ai.ignoreT -= dt;
    else if (ai.obst < 99) desired = ai.obst < 4 ? 0 : Math.min(desired, (ai.obst - 4) * 1.1);

    if (desired < 0.5 && car.speed < 1) ai.wait += dt; else ai.wait = Math.max(0, ai.wait - dt * 2);
    ai.honkT -= dt;
    if (ai.wait > 1.2 && ai.obstType === 'player' && ai.honkT <= 0) {
      ai.honkT = 2.5 + Math.random() * 3;
      this.honk(car, ai.wait > 5);
    }
    if (ai.wait > 4 && ai.obstType !== 'player') { ai.ignoreT = 2.2; ai.wait = 0; }

    const v = car.vf;
    if (v < desired - 0.6) { inp.throttle = clamp((desired - v) / 4, 0.25, 1); inp.reverse = 0; }
    else if (v > desired + 1.2) { inp.throttle = 0; inp.reverse = clamp((v - desired) / 5, 0.2, 1); }
    else { inp.throttle = desired > 0.5 ? 0.18 : 0; inp.reverse = 0; }
    if (desired < 0.3 && v < 0.8) { inp.throttle = 0; inp.reverse = 0; inp.handbrake = true; }

    if (car.speed < 0.6 && desired > 2) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 2.5 && ai.backT <= 0) { ai.backT = 1.3; ai.stuckT = 0.5; }
    if (ai.backT > 0) {
      ai.backT -= dt;
      inp.throttle = 0; inp.reverse = 1; inp.noReverse = false; inp.steer = -inp.steer; inp.handbrake = false;
    }
  }

  // Distance to the nearest thing in this car's lane ahead.
  sense(car) {
    const g = this.game;
    const f = car.forward, p = car.group.position;
    let best = 99, type = null;
    const half = car.dims.L / 2;
    const check = (x, z, r, t) => {
      const dx = x - p.x, dz = z - p.z;
      const fw = dx * f.x + dz * f.z;
      if (fw <= 0 || fw > 26) return;
      const lat = Math.abs(dx * -f.z + dz * f.x);
      if (lat > 1.4 + r + fw * 0.03) return;
      const d = fw - r - half;
      if (d < best) { best = d; type = t; }
    };
    const pl = g.player;
    if (pl && !pl.vehicle) check(pl.group.position.x, pl.group.position.z, 0.5, 'player');
    for (const o of this.vm.cars) {
      if (o === car || o.removed) continue;
      if (Math.abs(o.x - p.x) > 32 || Math.abs(o.z - p.z) > 32) continue;
      const of = o.forward;
      for (const u of o.circles) check(o.x + of.x * u, o.z + of.z * u, o.radius, o === this.vm.current ? 'player' : 'car');
    }
    try {
      const list = g.npcs?.near?.(p.x + f.x * 9, p.z + f.z * 9, 10);
      if (list) for (const n of list) if (!n.dead && n.pos) check(n.pos.x, n.pos.z, 0.45, 'ped');
    } catch { /* npc module not ready */ }
    const rp = g.net?.remotePlayers;
    if (rp) for (const r of rp.values()) if (r.pos) check(r.pos.x, r.pos.z, r.vehicle ? 1.2 : 0.5, 'player');
    return { d: best, type };
  }

  honk(car, angry = false) {
    const pp = this.game.player.group.position;
    const d = Math.hypot(car.x - pp.x, car.z - pp.z);
    this.vm.audio.honk(d, angry);
    if (d < 18 && this.barkT <= 0 && Math.random() < 0.35) {
      this.barkT = 9;
      this.game.ui.toast(`<i>Driver:</i> "${pick(HONK_BARKS)}"`, 'info', 2600);
    }
  }

  // ---------------------------------------------------------------- carjack ragdolls
  yank(car) {
    const sm0 = car.vis.driver;
    const f = car.forward;
    const lx = f.z, lz = -f.x; // left of the car (driver side)
    const seatU = car.vis.build.seat.u;
    const x = car.x + lx * (car.dims.W / 2 + 0.7) + f.x * seatU;
    const z = car.z + lz * (car.dims.W / 2 + 0.7) + f.z * seatU;
    const sm = createStickman({ color: sm0.mat.color.getHex() });
    sm.group.position.set(x, 0, z);
    sm.group.rotation.y = Math.atan2(lx, lz);
    sm.setDead(true);
    this.game.scene.add(sm.group);
    car.setDriverVisible(false);
    this.ragdolls.push({ sm, t: 0, vx: lx * 6, vz: lz * 6, spin: (Math.random() - 0.5) * 8, up: false, face: 0 });
    this.game.ui.toast(`<i>Ex-driver:</i> ${pick(YANK_BARKS)}`, 'info', 3200);
  }

  updateRagdolls(dt) {
    const pp = this.game.player.group.position;
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const r = this.ragdolls[i];
      r.t += dt;
      const g = r.sm.group;
      if (r.t < 1.4) {
        g.position.x += r.vx * dt; g.position.z += r.vz * dt;
        r.vx *= Math.exp(-3.5 * dt); r.vz *= Math.exp(-3.5 * dt);
        g.rotation.y += r.spin * dt * Math.max(0, 1 - r.t);
        const res = this.game.physics.resolveCircle(g.position.x, g.position.z, 0.4);
        g.position.x = res.x; g.position.z = res.z;
      } else if (!r.up) {
        r.up = true;
        r.sm.setDead(false);
        r.face = Math.atan2(g.position.x - pp.x, g.position.z - pp.z);
      } else {
        g.rotation.y = r.face;
        const nx = g.position.x + Math.sin(r.face) * 6.5 * dt, nz = g.position.z + Math.cos(r.face) * 6.5 * dt;
        const res = this.game.physics.resolveCircle(nx, nz, 0.4);
        if (res.hit) r.face += (Math.random() - 0.5) * 2;
        g.position.x = res.x; g.position.z = res.z;
        r.sm.animate(dt, 7);
        if (r.t > 9) { r.sm.dispose(); this.ragdolls.splice(i, 1); }
      }
    }
  }
}
