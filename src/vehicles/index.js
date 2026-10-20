import * as THREE from 'three';
import { CARS, MPH } from '../data/cars.js';
import { angleLerp, clamp, uid as makeUid, pick } from '../core/util.js';
import { Car } from './car.js';
import { createCarMesh, animateCarMesh, sharedMats, getBuild } from './models.js';
import { VehicleFX } from './fx.js';
import { CarAudio } from './audio.js';
import { Traffic } from './traffic.js';
import { installShops } from './shops.js';
import { installRace } from './race.js';
import { PoliceFleet } from './police.js';

// Vehicles: ownership, enter/exit, driving input, camera, HUD, collisions with
// people and other cars, explosions, traffic, dealer / chop shop / drag strip.
// game.vehicles API (see DESIGN.md + bottom of this file).

const MAX_STOLEN = 5;

export async function installVehicles(game) {
  const vm = new VehicleManager(game);
  game.vehicles = vm;
  game.addSystem({ name: 'vehicles', update: (dt) => vm.update(dt) });
  try { installShops(vm); } catch (e) { console.error('[vehicles] shops failed', e); }
  try { installRace(vm); } catch (e) { console.error('[vehicles] race failed', e); }
  return vm;
}

class VehicleManager {
  constructor(game) {
    this.game = game;
    this.CARS = CARS;
    this.cars = [];
    this.fx = new VehicleFX(game);
    this.audio = new CarAudio(game);
    this.traffic = new Traffic(this);
    this.police = new PoliceFleet(this);
    this.scareT = 0;
    this._current = null;
    this.nightLevel = 0;
    this.recentHits = new Map();
    this.hudT = 0;
    this.camIdle = 0;
    this.playerHitCd = 0;
    this.heatCd = 0;
    this.hurtCd = 0;
    this.pendingEnter = null;
    this.baseFov = null;
    this.race = null;
    // Co-op hooks (src/coop sets this): { tryHopIn(nearCar) -> bool, onPassengerF(), prompt(nearCar) -> html|null }
    // Riding shotgun in a friend's car sets player.vehicle to a seat proxy while _current stays null.
    this.coop = null;

    // One spotlight for the player's ride at night; always in the scene so the
    // light count never changes (no shader recompiles).
    this.spot = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.5, 1);
    this.spot.castShadow = false;
    this.spot.position.set(0, -50, 0);
    game.scene.add(this.spot, this.spot.target);

    const bus = game.bus;
    bus.on('game:start', () => this.onGameStart());
    bus.on('state:reset', () => this.despawnAll());
    bus.on('state:before-save', () => this.saveCars());
    bus.on('player:died', () => { if (this._current) this.exit(true); });
    bus.on('player:arrested', () => { if (this._current) this.exit(true); });
    bus.on('player:model-rebuilt', () => { if (this._current) this.game.player.group.visible = false; });
  }

  // ---------------------------------------------------------------- public API
  get current() { return this._current; }
  get list() { return this.cars; }
  owned() { return this.game.state.p.cars || []; }
  createCarMesh(carId, color, opts) { return createCarMesh(carId, color, opts); }
  animateMesh(group, speed, steer, dt) { animateCarMesh(group, speed, steer, dt); }
  exitVehicle(force) { this.exit(force); }

  netState() {
    const c = this._current;
    if (!c) return null;
    return {
      carId: c.carId, color: c.color,
      x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100,
      rot: Math.round(c.heading * 1000) / 1000, speed: Math.round(c.vf * 10) / 10,
      steer: Math.round(c.steer * 100) / 100,
    };
  }

  spawnCar(carId, opts = {}) {
    const car = new Car(this, carId, opts);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    if (!car) return;
    if (car === this._current) this.exit(true);
    this.traffic.release(car);
    car.dispose();
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (car.uid) this.game.world?.markers?.delete?.('car:' + car.uid);
  }

  entry(uid) { return this.owned().find((e) => e.uid === uid) || null; }
  carByUid(uid) { return this.cars.find((c) => c.uid === uid && c.owner === 'player' && !c.removed) || null; }

  // Give the player a car (quests, rewards). Spawns near the player. Returns uid.
  giveCar(carId, color = null, opts = {}) {
    if (!CARS[carId]) { console.warn('[vehicles] unknown car', carId); return null; }
    const pp = this.game.player.group.position;
    const spot = opts.x != null ? { x: opts.x, z: opts.z, rot: opts.rot ?? 0 } : this.findSpot(pp.x, pp.z, carId, 4, 30);
    const e = this.addOwned(carId, color || CARS[carId].color, spot, opts);
    if (!opts.silent) this.game.ui.toast(`🚗 You got a <b>${CARS[carId].name}</b>! It's parked nearby.`, 'good', 4000);
    this.game.bus.emit('car:given', { carId, uid: e.uid });
    return e.uid;
  }

  addOwned(carId, color, spot, { stolen = false, upgrades = null } = {}) {
    const e = {
      uid: makeUid(), carId, color, x: spot.x, z: spot.z, rot: spot.rot ?? 0, hp: null,
      upgrades: upgrades || { engine: 0, handling: 0, armor: 0, nitro: false, tires: false }, stolen, destroyed: false,
    };
    this.owned().push(e);
    this.spawnOwned(e.uid);
    this.game.state.changed('cars');
    return e;
  }

  spawnOwned(uid) {
    const e = this.entry(uid);
    if (!e || e.destroyed) return null;
    const existing = this.carByUid(uid);
    if (existing) return existing;
    if (!CARS[e.carId]) return null;
    e.upgrades ||= { engine: 0, handling: 0, armor: 0, nitro: false, tires: false };
    let x = e.x, z = e.z, rot = e.rot ?? 0;
    if (x == null || z == null || !Number.isFinite(x)) {
      const pp = this.game.player.group.position;
      ({ x, z, rot } = this.findSpot(pp.x, pp.z, e.carId, 4, 30));
    }
    const car = this.spawnCar(e.carId, { x, z, rot, color: e.color, owner: 'player', uid, upgrades: e.upgrades, hp: e.hp, stolen: e.stolen });
    this.setMarker(car);
    return car;
  }

  removeOwned(uid) {
    const list = this.owned();
    const i = list.findIndex((e) => e.uid === uid);
    if (i >= 0) list.splice(i, 1);
    const c = this.carByUid(uid);
    if (c) this.removeCar(c);
    this.game.world?.markers?.delete?.('car:' + uid);
    if (this.game.state.p.activeCar === uid) this.game.state.p.activeCar = null;
    this.game.state.changed('cars');
  }

  setMarker(car) {
    const m = this.game.world?.markers;
    if (!m?.set || !car.uid) return;
    m.set('car:' + car.uid, { x: car.x, z: car.z, color: car.stolen ? '#ff8a5c' : '#5fc8ff', label: car.def.name, kind: 'car' });
  }

  // Free parking spot around (x,z) for a car of this type.
  findSpot(x, z, carId, minR = 5, maxR = 26) {
    const B = getBuild(carId);
    const L = B.dims.L, W = B.dims.W;
    const phys = this.game.physics;
    for (let r = minR; r <= maxR; r += 2.5) {
      const n = Math.max(8, Math.round(r * 1.2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r * 0.37;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const rot = Math.round((a + Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
        const fx = Math.sin(rot), fz = Math.cos(rot);
        let ok = true;
        for (const u of [-L / 2 + W / 2, 0, L / 2 - W / 2]) {
          const cx = px + fx * u, cz = pz + fz * u;
          const res = phys.resolveCircle(cx, cz, W / 2 + 0.3);
          if (res.hit || Math.abs(res.x - cx) + Math.abs(res.z - cz) > 0.01) { ok = false; break; }
        }
        if (ok && this.carNear(px, pz, Math.max(5, L * 0.9))) ok = false;
        if (ok) return { x: px, z: pz, rot };
      }
    }
    return { x: x + minR, z, rot: 0 };
  }

  carNear(x, z, r) {
    for (const c of this.cars) if (!c.removed && Math.hypot(c.x - x, c.z - z) < r) return c;
    return null;
  }

  nearPlayer(car, r) {
    const p = this.game.player?.group?.position;
    if (!p) return false;
    return Math.abs(car.x - p.x) < r && Math.abs(car.z - p.z) < r;
  }

  // Which car (if any) has a body circle at (x,z)? For bullets / melee.
  hitTest(x, z, r = 0) {
    for (const c of this.cars) {
      if (c.removed) continue;
      if (Math.abs(c.x - x) > c.dims.L && Math.abs(c.z - z) > c.dims.L) continue;
      const f = c.forward;
      for (const u of c.circles) if (Math.hypot(c.x + f.x * u - x, c.z + f.z * u - z) < c.radius + r) return c;
    }
    return null;
  }

  damageNear(x, z, r, amount, source = 'explosion') {
    for (const c of [...this.cars]) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r) c.damage(amount * (1 - d / r), source);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  onGameStart() {
    this.despawnAll();
    const p = this.game.state.p;
    p.cars ||= [];
    for (const e of p.cars) {
      e.upgrades ||= { engine: 0, handling: 0, armor: 0, nitro: false, tires: false };
      if (e.destroyed == null) e.destroyed = false;
      if (!e.destroyed) this.spawnOwned(e.uid);
    }
    this.pendingEnter = p.drivingCar || null;
    this.traffic.initial = true;
    this.traffic.spawnT = 0.5;
  }

  despawnAll() {
    if (this._current) this.exit(true);
    try { this.police.clearAll(); } catch (e) { console.error('[vehicles] police clear failed', e); }
    this.race?.abort?.(true);
    this.traffic.clear();
    for (const c of [...this.cars]) this.removeCar(c);
    this.cars = [];
  }

  saveCars() {
    const p = this.game.state.p;
    for (const c of this.cars) {
      if (c.owner !== 'player' || !c.uid) continue;
      const e = this.entry(c.uid);
      if (!e) continue;
      this.syncEntry(c, e);
    }
    p.drivingCar = this._current?.owner === 'player' ? this._current.uid : null;
  }

  syncEntry(car, e = this.entry(car.uid)) {
    if (!e) return;
    e.x = Math.round(car.x * 10) / 10;
    e.z = Math.round(car.z * 10) / 10;
    e.rot = Math.round(car.heading * 100) / 100;
    e.hp = Math.round(car.hp);
    e.color = car.color;
    e.stolen = car.stolen;
    this.setMarker(car);
  }

  // ---------------------------------------------------------------- enter / exit
  doorPos(car) {
    const f = car.forward;
    const lx = f.z, lz = -f.x;
    const u = car.vis.build.seat.u;
    const off = car.isBike ? 0.8 : car.dims.W / 2 + 0.75;
    return { x: car.x + lx * off + f.x * u, z: car.z + lz * off + f.z * u };
  }

  findEnterable() {
    const pp = this.game.player.group.position;
    let best = null, bd = Infinity;
    for (const c of this.cars) {
      if (c.removed || c.exploded) continue;
      if (Math.abs(c.x - pp.x) > 9 || Math.abs(c.z - pp.z) > 9) continue;
      if (this.race?.active && c === this.race.ai) continue;
      const door = this.doorPos(c);
      let d = Math.hypot(door.x - pp.x, door.z - pp.z);
      if (d > 3) {
        const f = c.forward;
        for (const u of c.circles) d = Math.min(d, Math.hypot(c.x + f.x * u - pp.x, c.z + f.z * u - pp.z) - c.radius + 1.4);
      }
      if (d <= 3 && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  tryEnter() {
    const g = this.game;
    if (g.player.vehicle) return false;
    const car = this.findEnterable();
    try { if (this.coop?.tryHopIn?.(car)) return true; } catch (e) { console.error('[vehicles] coop hop-in failed', e); }
    if (!car) return false;
    if (car.dead) { g.ui.toast("It's on fire. Even you have standards.", 'bad'); return true; }
    if (car.owner === 'player') { this.enter(car); return true; }
    if (car.speed > 3.5) { g.ui.toast("It's moving. You're not an action hero. Yet.", 'bad'); return true; }
    this.carjack(car);
    return true;
  }

  carjack(car) {
    const g = this.game;
    const hadDriver = car.hasDriver;
    const cop = this.police.isCruiser(car);
    if (cop) {
      try { this.police.onStolen(car); } catch (e) { console.error('[vehicles] police steal failed', e); }
      car.owner = 'civil';
      if (hadDriver) car.setDriverVisible(false);
      else this.audio.glass();
    } else if (hadDriver) this.traffic.yank(car);
    else {
      this.audio.glass();
      g.ui.toast('You elbow the window in and hotwire it with a paperclip. Classy.', 'info', 3000);
    }
    this.traffic.release(car);
    if (!cop) this.crime('steal', car.x, car.z);
    const e = {
      uid: makeUid(), carId: car.carId, color: car.color, x: car.x, z: car.z, rot: car.heading, hp: Math.round(car.hp),
      upgrades: car.upgrades, stolen: true, destroyed: false,
    };
    this.owned().push(e);
    car.owner = 'player'; car.uid = e.uid; car.stolen = true;
    this.capStolen(e.uid);
    this.enter(car);
    if (cop) g.ui.toast('Stole a <b>Rotwell PD Interceptor</b>. <kbd>H</kbd> toggles the siren. Lose the heat and it\'s yours to keep.', 'bad', 4500);
    else g.ui.toast(`Stole a <b>${car.def.name}</b>. The chop shop in the Rustyards pays cash, no questions.`, 'bad', 3800);
    g.bus.emit('car:stolen', { carId: car.carId, uid: e.uid });
  }

  crime(type, x, z) {
    const g = this.game;
    if (this.heatCd > 0 && type !== 'steal') return;
    this.heatCd = 2;
    try {
      if (g.combat?.crime) { g.combat.crime(type, x, z); return; }
    } catch (e) { console.error('[vehicles] crime failed', e); }
    g.state.addHeat(type === 'steal' ? 1 : 0.5);
  }

  capStolen(keepUid) {
    const stolen = this.owned().filter((e) => e.stolen && !e.destroyed && e.uid !== keepUid);
    while (stolen.length >= MAX_STOLEN) {
      const e = stolen.shift();
      const c = this.carByUid(e.uid);
      if (c === this._current) continue;
      this.removeOwned(e.uid);
      this.game.ui.toast(`Your stolen ${CARS[e.carId]?.name || 'car'} got towed. Easy come, easy go.`, 'info');
    }
  }

  enter(car) {
    const g = this.game, pl = g.player;
    if (!car || car.removed || car.exploded || this._current) return;
    this._current = car;
    pl.vehicle = car;
    if (car.ai) this.traffic.release(car);
    if (car.owner === 'player' && car.uid) g.state.p.activeCar = car.uid;
    car.frozen = false;
    car.setDriverVisible(true, g.state.p.look?.color ?? 0x101010);
    pl.group.visible = false;
    const rig = g.cameraRig;
    rig.follow(car.group, { height: car.isBike ? 1.7 : 2.2, dist: car.isBike ? 7 : 9.5 });
    rig.yaw = car.heading + Math.PI;
    this.baseFov = g.camera.fov;
    this.camIdle = 2;
    this.audio.startEngine(car.def);
    g.bus.emit('car:entered', { carId: car.carId, uid: car.uid });
  }

  // exit(true) = forced (death, arrest, explosion): no speed checks.
  exit(opts = {}) {
    const force = opts === true || !!opts?.force;
    const g = this.game, pl = g.player;
    const car = this._current;
    if (!car) return;
    const speed = car.speed;
    this._current = null;
    pl.vehicle = null;
    car.setDriverVisible(false);
    car.input.throttle = 0; car.input.reverse = 0; car.input.steer = 0; car.input.nitro = false; car.input.handbrake = true;
    const spot = this.exitSpot(car);
    pl.spawn(spot.x, spot.z, car.heading);
    pl.group.visible = true;
    g.cameraRig.follow(pl.group);
    if (this.baseFov) { g.camera.fov = this.baseFov; g.camera.updateProjectionMatrix(); }
    this.audio.stopEngine();
    this.audio.horn(false);
    if (car.owner === 'player' && car.uid) this.syncEntry(car);
    g.ui.setHud('vehicle', '');
    if (!force && speed > 12) {
      const dmg = Math.round(Math.min(40, (speed - 12) * 1.4));
      g.state.damage(dmg, 'bail');
      g.ui.toast(`You tuck and roll. Mostly roll. <b>-${dmg} HP</b>`, 'bad');
      g.cameraRig.shake(0.4, 0.3);
    }
    g.bus.emit('car:exited', { carId: car.carId, uid: car.uid });
    this.race?.onExit?.(car);
  }

  exitSpot(car) {
    const f = car.forward;
    const lx = f.z, lz = -f.x;
    const half = car.isBike ? 0.9 : car.dims.W / 2 + 0.8;
    const u = car.vis.build.seat.u;
    const cands = [
      [lx * half + f.x * u, lz * half + f.z * u], [-lx * half + f.x * u, -lz * half + f.z * u],
      [-f.x * (car.dims.L / 2 + 1), -f.z * (car.dims.L / 2 + 1)], [f.x * (car.dims.L / 2 + 1), f.z * (car.dims.L / 2 + 1)],
    ];
    for (const [dx, dz] of cands) {
      const x = car.x + dx, z = car.z + dz;
      const r = this.game.physics.resolveCircle(x, z, 0.45);
      if (Math.hypot(r.x - x, r.z - z) < 0.3 && !this.insideCar(r.x, r.z, 0.45)) return r;
    }
    const r = this.game.physics.resolveCircle(car.x + cands[0][0], car.z + cands[0][1], 0.45);
    return r;
  }

  insideCar(x, z, r) {
    for (const c of this.cars) {
      if (c.removed) continue;
      const f = c.forward;
      for (const u of c.circles) if (Math.hypot(c.x + f.x * u - x, c.z + f.z * u - z) < c.radius + r) return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- damage hooks
  onCarDying(car) {
    if (car === this._current) {
      this.game.ui.bigText('IT\'S ON FIRE', 'Bail out! Press F!', 2200);
    }
  }

  onCarImpact(car, impact) {
    const g = this.game;
    if (car !== this._current) return;
    if (car.isBike && impact > 11) {
      this.exit(true);
      const dmg = Math.round(Math.min(40, 8 + (impact - 11) * 1.2));
      g.state.damage(dmg, 'crash');
      g.ui.toast(`You yeet over the handlebars like a lawn dart. <b>-${dmg} HP</b>`, 'bad');
      g.cameraRig.shake(0.6, 0.4);
      return;
    }
    if (impact > 17 && this.hurtCd <= 0) {
      this.hurtCd = 1;
      const dmg = Math.round(Math.min(35, (impact - 17) * 0.8));
      if (dmg > 0) {
        g.state.damage(dmg, 'crash');
        if (dmg > 6) g.ui.toast(`Your face meets the steering wheel. <b>-${dmg} HP</b>`, 'bad', 2200);
      }
    }
  }

  onNitro(car) {
    if (car === this._current) {
      this.audio.whoosh();
      this.game.cameraRig.shake(0.15, 0.4);
    }
  }

  sfxAt(type, x, z, s = 0.5) {
    const pp = this.game.player.group.position;
    const d = Math.hypot(x - pp.x, z - pp.z);
    if (type === 'crash') this.audio.crash(s, d);
  }

  explode(car) {
    if (car.exploded || car.removed) return;
    const g = this.game;
    car.exploded = true;
    car.dead = true;
    const x = car.x, z = car.z;
    const pp = g.player.group.position;
    const dist = Math.hypot(x - pp.x, z - pp.z);
    const M = sharedMats();
    this.fx.explosion(x, z, [car.vis.paintMat, M.trim, M.charred]);
    this.audio.explosion(dist);
    car.char();
    car.vel.multiplyScalar(0.3);
    car.angVel += (Math.random() - 0.5) * 3;
    if (dist < 60) g.cameraRig.shake(Math.max(0.2, 1.4 * (1 - dist / 60)), 0.6);
    if (this._current === car) {
      this.exit(true);
      g.state.damage(55, 'explosion');
      g.ui.toast("You were INSIDE the fireball. Bold strategy. <b>-55 HP</b>", 'bad', 3500);
    } else if (dist < 8) {
      if (this._current) this._current.damage(60 * (1 - dist / 8), 'explosion');
      else g.state.damage(Math.round(10 + 60 * (1 - dist / 8)), 'explosion');
    }
    try {
      const list = g.npcs?.near?.(x, z, 8) || [];
      for (const n of list) {
        if (n.dead) continue;
        const d = Math.hypot(n.pos.x - x, n.pos.z - z);
        const dir = d > 0.01 ? { x: (n.pos.x - x) / d, z: (n.pos.z - z) / d } : { x: 1, z: 0 };
        g.npcs.damage(n.id, Math.round(20 + 120 * (1 - d / 8)), 'local', { dir, heavy: true, kb: 9 });
      }
    } catch (e) { console.error('[vehicles] explosion npc damage', e); }
    for (const o of [...this.cars]) {
      if (o === car || o.removed) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < 9) {
        o.damage(70 * (1 - d / 9), 'explosion');
        const k = (9 - d) * 0.9 / o.mass;
        o.vel.x += ((o.x - x) / Math.max(d, 0.5)) * k;
        o.vel.y += ((o.z - z) / Math.max(d, 0.5)) * k;
        o.angVel += (Math.random() - 0.5) * 2;
      }
    }
    if (car.owner === 'player' && car.uid) {
      const e = this.entry(car.uid);
      if (e) {
        if (e.stolen) this.removeOwnedEntry(car.uid);
        else { e.destroyed = true; e.hp = 0; e.x = Math.round(x); e.z = Math.round(z); }
      }
      g.world?.markers?.delete?.('car:' + car.uid);
      g.ui.toast(`Your ${car.def.name} is now modern art.${car.stolen ? '' : ' Lemon Lot\'s impound can resurrect it. For a fee.'}`, 'bad', 4500);
      g.state.changed('cars');
    }
    this.traffic.release(car);
    car.removeAt = g.elapsed + 40;
    g.bus.emit('car:destroyed', { carId: car.carId, uid: car.uid, owner: car.owner });
  }

  removeOwnedEntry(uid) {
    const list = this.owned();
    const i = list.findIndex((e) => e.uid === uid);
    if (i >= 0) list.splice(i, 1);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game;
    if (!g.started || !g.player) return;
    const pl = g.player;
    const t = g.time;
    this.nightLevel = clamp((0.4 - t.daylight) / 0.3, 0, 1);
    const M = sharedMats();
    M.head.emissiveIntensity = 0.25 + this.nightLevel * 2.6;
    if (this.heatCd > 0) this.heatCd -= dt;
    if (this.hurtCd > 0) this.hurtCd -= dt;
    if (this.playerHitCd > 0) this.playerHitCd -= dt;

    // Resume driving after a reload.
    if (this.pendingEnter) {
      const c = this.carByUid(this.pendingEnter);
      this.pendingEnter = null;
      if (c && !pl.vehicle) { c.group.position.x = pl.group.position.x; c.group.position.z = pl.group.position.z; this.enter(c); }
    }

    // Sanity: something else cleared player.vehicle behind our back.
    if (this._current && pl.vehicle !== this._current) {
      const c = this._current;
      this._current = null;
      c.setDriverVisible(false);
      this.audio.stopEngine();
      g.cameraRig.follow(pl.group);
      g.ui.setHud('vehicle', '');
    }

    // F to enter / exit.
    const locked = g.controlsLocked;
    if (!locked && g.input.wasPressed('KeyF') && !pl.dead) {
      if (this._current) {
        if (!this._current.frozen || this._current.dead) this.exit();
      } else if (pl.vehicle) {
        try { this.coop?.onPassengerF?.(); } catch (e) { console.error('[vehicles] coop passenger F failed', e); }
      } else if (!pl.moveLocked) this.tryEnter();
    }

    // Player's car input.
    const cur = this._current;
    if (cur) {
      const inp = g.input, ci = cur.input;
      const can = !locked && !pl.dead && !pl.moveLocked;
      ci.throttle = can && (inp.isDown('KeyW') || inp.isDown('ArrowUp')) ? 1 : 0;
      ci.reverse = can && (inp.isDown('KeyS') || inp.isDown('ArrowDown')) ? 1 : 0;
      ci.steer = can ? (inp.isDown('KeyA') ? 1 : 0) - (inp.isDown('KeyD') ? 1 : 0) : 0;
      ci.handbrake = !can || inp.isDown('Space');
      ci.nitro = can && inp.wasPressed('KeyN');
      ci.noReverse = false;
      if (can && inp.wasPressed('KeyN') && !cur.upgrades.nitro) g.ui.toast('No nitro installed. Chop Chop Customs can fix that.', 'info', 2000);
      if (cur.lb) {
        // interceptors: H toggles the light bar & siren instead of the horn
        if (can && inp.wasPressed('KeyH')) {
          cur.setSiren(!cur.sirenOn);
          g.ui.toast(cur.sirenOn ? 'WEE-OOO. Traffic parts like you\'re important.' : 'Siren off. Back to being a regular criminal.', 'info', 1800);
        }
      } else {
        this.audio.horn(can && inp.isDown('KeyH'), cur.carId === 'puddlejumper' || cur.carId === 'moped');
        if (can && inp.wasPressed('KeyH')) this.scarePeds(cur);
      }
    }

    this.traffic.update(dt);
    try { this.police.update(dt); } catch (e) { if (!this._polErr) { console.error('[vehicles] police failed', e); this._polErr = true; } }

    for (const c of this.cars) {
      if (c.removed) continue;
      if (c.replica) { try { c.updateReplica(dt); } catch (e) { if (!c._err) { console.error('[vehicles] replica update failed', e); c._err = true; } } continue; }
      if (c !== cur && !c.ai && !c.police) {
        c.input.throttle = 0; c.input.reverse = 0; c.input.steer = 0; c.input.nitro = false; c.input.handbrake = true;
        if (!c.dead && c.vel.lengthSq() < 1e-4 && Math.abs(c.angVel) < 1e-3 && c.hp / c.maxHp > 0.45) { c.vf = 0; c.vl = 0; c.speed = 0; continue; }
      }
      try { c.update(dt); } catch (e) { if (!c._err) { console.error('[vehicles] car update failed', e); c._err = true; } }
    }
    this.collideCars();
    // Clean up burnt husks.
    for (const c of [...this.cars]) if (c.removeAt && g.elapsed > c.removeAt && !this.nearPlayer(c, 40)) this.removeCar(c);

    if (cur && !cur.removed) {
      pl.group.position.set(cur.x, 0, cur.z);
      pl.facing = cur.heading;
      pl.group.visible = false;
      pl.speed = cur.speed;
      this.hitPeds(cur, dt);
      this.warnPeds(cur, dt);
      this.updateCamera(cur, dt);
      this.updateAudio(cur);
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; g.ui.setHud('vehicle', this.hudHtml(cur)); }
    } else {
      this.pushPlayer();
    }
    this.updateSpot(cur);
    this.updatePrompt();
    for (const [id, tt] of this.recentHits) if (g.elapsed > tt) this.recentHits.delete(id);
    this.fx.update(dt);
  }

  updateCamera(car, dt) {
    const g = this.game, rig = g.cameraRig;
    if (g.input.mouse.dx || g.input.mouse.dy || g.input.isDown('ArrowLeft') || g.input.isDown('ArrowRight')) this.camIdle = 0;
    else this.camIdle += dt;
    if (this.camIdle > 0.9 && (Math.abs(car.vf) > 2.5 || this.camIdle < 1.5)) {
      const target = car.heading + Math.PI;
      rig.yaw = angleLerp(rig.yaw, target, 1 - Math.exp(-(car.speed > 25 ? 3.2 : 2.2) * dt));
    }
    rig.distOverride = (car.isBike ? 7 : 9.5) + Math.min(car.speed * 0.05, 3.5) + (car.dims.L > 6 ? 2.5 : 0);
    if (this.baseFov) {
      const want = this.baseFov + Math.min(car.speed * 0.13, 11) + (car.nitroT > 0 ? 8 : 0);
      if (Math.abs(g.camera.fov - want) > 0.05) {
        g.camera.fov += (want - g.camera.fov) * Math.min(1, dt * 3);
        g.camera.updateProjectionMatrix();
      }
    }
  }

  updateAudio(car) {
    const r = Math.abs(car.vf) / Math.max(1, car.vmax);
    const gears = car.isBike ? 4 : 5;
    let rpm;
    if (r < 0.02) rpm = 0.08 + car.input.throttle * 0.15;
    else {
      const x = r * gears * 1.02;
      const gear = Math.min(gears - 1, Math.floor(x));
      rpm = 0.22 + (x - gear) * 0.72 + (gear === gears - 1 ? (x - gear) * 0.1 : 0);
    }
    if (car.skid > 0.3 && car.input.throttle) rpm = Math.min(1, rpm + 0.25);
    car._gear = r < 0.02 ? (car.vf < -0.5 ? 'R' : 'N') : car.vf < 0 ? 'R' : String(Math.min(gears, Math.floor(r * gears * 1.02) + 1));
    this.audio.updateEngine(clamp(rpm, 0, 1), car.input.throttle, car.skid, this.game.controlsLocked, car.def);
  }

  updateSpot(car) {
    const s = this.spot;
    if (!car || car.dead || this.nightLevel < 0.15) {
      if (s.intensity !== 0) { s.intensity = 0; s.position.set(0, -50, 0); }
      return;
    }
    const f = car.forward;
    const L2 = car.dims.L / 2;
    s.intensity = 45 * this.nightLevel;
    s.position.set(car.x + f.x * (L2 - 0.3), car.isBike ? 1.1 : 0.9, car.z + f.z * (L2 - 0.3));
    s.target.position.set(car.x + f.x * (L2 + 22), 0, car.z + f.z * (L2 + 22));
    s.target.updateMatrixWorld();
  }

  hudHtml(car) {
    const mph = Math.round(Math.abs(car.vf) / MPH);
    const hp = car.hp / car.maxHp;
    const hpCol = hp > 0.5 ? '#7fbf4d' : hp > 0.2 ? '#d6b33c' : '#e2402f';
    const n = car.upgrades?.nitro;
    const nitroBar = n ? `<div style="height:4px;background:#1d1915;margin-top:3px"><i style="display:block;height:100%;width:${Math.round((car.nitroT > 0 ? car.nitroT / 2.6 : car.nitroCharge) * 100)}%;background:${car.nitroT > 0 ? '#ff9a3c' : '#6b8fb8'}"></i></div>` : '';
    return `<div style="display:inline-block;background:rgba(10,8,6,.72);border:1px solid #3a3128;padding:6px 10px 5px;min-width:200px;text-align:left;margin-top:6px">
      <div style="font-size:15px;color:#c9bfae;white-space:nowrap">${car.def.name}${car.stolen ? ' <span style="color:#e2402f;font-weight:800">HOT</span>' : ''}</div>
      <div style="font-size:40px;font-weight:800;line-height:1;color:#e6dfcf">${mph}<span style="font-size:14px;color:#a9a291"> MPH</span><span style="float:right;font-size:22px;color:#b0672a;margin-top:12px">${car._gear || 'N'}</span></div>
      <div style="height:6px;background:#1d1915;margin-top:4px"><i style="display:block;height:100%;width:${Math.round(hp * 100)}%;background:${hpCol}"></i></div>
      ${nitroBar}
      ${car.tires ? `<div style="font-size:13px;color:#e2402f;font-weight:800;margin-top:3px">FLAT TIRES ×${car.tires} <span style="font-weight:400;color:#8f8676">(chop shop fixes it)</span></div>` : ''}
      <div style="font-size:12px;color:#8f8676;margin-top:3px">F exit · Space handbrake · H ${car.lb ? `siren${car.sirenOn ? ' <b style="color:#5f8bff">ON</b>' : ''}` : 'horn'}${n ? ' · N nitro' : ''}</div></div>`;
  }

  updatePrompt() {
    const g = this.game, ui = g.ui;
    let text = null;
    const pl = g.player;
    if (!this._current && pl.vehicle && !g.controlsLocked && !pl.dead) {
      try { text = this.coop?.prompt?.(null) || null; } catch { text = null; }
    } else if (!this._current && !g.controlsLocked && !pl.dead && !g.interact.current) {
      const c = this.findEnterable();
      try { text = this.coop?.prompt?.(c) || null; } catch { text = null; }
      if (!text && c && !c.dead) {
        if (c.owner === 'player') text = `<kbd>F</kbd>${c.isBike ? 'Ride' : 'Drive'} your ${c.def.name}`;
        else if (c.speed <= 3.5) text = `<kbd>F</kbd>${c.hasDriver ? 'Carjack' : 'Steal'} ${c.def.name}`;
      }
    }
    if (text) {
      if (this._prompt !== text || ui.promptEl.classList.contains('hidden')) { ui.setPrompt(text); this._prompt = text; }
    } else if (this._prompt) {
      if (!g.interact.current) ui.setPrompt(null);
      this._prompt = null;
    }
  }

  // ---------------------------------------------------------------- people vs cars
  hitPeds(car, dt) {
    const g = this.game;
    if (car.speed < 3 || !g.npcs?.near) return;
    let list;
    try { list = g.npcs.near(car.x, car.z, car.dims.L / 2 + 1.5); } catch { return; }
    const f = car.forward;
    for (const n of list) {
      if (!n || n.dead || !n.pos || this.recentHits.has(n.id)) continue;
      const dx = n.pos.x - car.x, dz = n.pos.z - car.z;
      const fw = dx * f.x + dz * f.z, lat = dx * -f.z + dz * f.x;
      if (Math.abs(fw) > car.dims.L / 2 + 0.35 || Math.abs(lat) > car.dims.W / 2 + 0.45) continue;
      this.recentHits.set(n.id, g.elapsed + 1.2);
      const v = car.speed;
      const dmg = Math.round(clamp(v * 2.4 * Math.sqrt(car.mass), 8, 250));
      const mvx = car.vel.x, mvz = car.vel.y, ml = Math.hypot(mvx, mvz) || 1;
      try { g.npcs.damage(n.id, dmg, 'local', { dir: { x: mvx / ml, z: mvz / ml }, heavy: true, kb: Math.min(14, v * 0.5) }); } catch (e) { console.error('[vehicles] npc damage', e); }
      this.audio.thud();
      g.cameraRig.shake(0.15, 0.15);
      const slow = car.isBike ? 0.7 : 0.92;
      car.vel.multiplyScalar(slow);
      if (car.isBike && v > 10) {
        this.onCarImpact(car, 12);
      }
      this.crime('assault', n.pos.x, n.pos.z);
    }
  }

  // Pedestrians dive out of the way of a speeding car.
  warnPeds(car, dt) {
    this.scareT -= dt;
    if (this.scareT > 0 || car.speed < 11) return;
    this.scareT = 0.2;
    const npcs = this.game.npcs;
    if (!npcs?.scare) return;
    const f = car.forward;
    const reach = 8 + car.speed * 0.6;
    try {
      for (const n of npcs.near(car.x + f.x * reach * 0.5, car.z + f.z * reach * 0.5, reach * 0.6)) {
        const dx = n.pos.x - car.x, dz = n.pos.z - car.z;
        const fw = dx * f.x + dz * f.z, lat = Math.abs(dx * -f.z + dz * f.x);
        if (fw > 1 && fw < reach && lat < 2.5 + fw * 0.12) npcs.scare(n, car.x, car.z, { dir: { x: f.x, z: f.z } });
      }
    } catch { /* optional */ }
  }

  scarePeds(car) {
    // Honking makes people jump out of the way (if the NPC module supports it).
    try {
      const list = this.game.npcs?.near?.(car.x, car.z, 14) || [];
      for (const n of list) this.game.npcs?.scare?.(n, car.x, car.z);
    } catch { /* optional */ }
  }

  pushPlayer() {
    const g = this.game, pl = g.player;
    if (pl.dead || pl.vehicle) return;
    const p = pl.group.position;
    for (const c of this.cars) {
      if (c.removed) continue;
      if (Math.abs(c.x - p.x) > c.dims.L || Math.abs(c.z - p.z) > c.dims.L) continue;
      const f = c.forward;
      for (const u of c.circles) {
        const cx = c.x + f.x * u, cz = c.z + f.z * u;
        const dx = p.x - cx, dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        const min = c.radius + 0.45;
        if (d >= min) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        p.x = cx + nx * min; p.z = cz + nz * min;
        if (c.speed > 6 && this.playerHitCd <= 0 && (c.vel.x * -nx + c.vel.y * -nz) > 3) {
          this.playerHitCd = 1.2;
          const dmg = Math.round(clamp(c.speed * 1.3 * c.mass, 5, 90));
          g.state.damage(dmg, 'roadkill');
          g.ui.toast(`Flattened by a ${c.def.name}. Look both ways, dumbass. <b>-${dmg} HP</b>`, 'bad');
          g.cameraRig.shake(0.5, 0.3);
          this.audio.thud();
          p.x += nx * 1.5 + c.vel.x * 0.08; p.z += nz * 1.5 + c.vel.y * 0.08;
          c.vel.multiplyScalar(0.85);
          if (c.ai) c.ai.stunned = 1.5;
        }
      }
    }
  }

  collideCars() {
    const cars = this.cars;
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const a = cars[i];
      if (a.removed) continue;
      for (let j = i + 1; j < n; j++) {
        const b = cars[j];
        if (b.removed) continue;
        const reach = (a.dims.L + b.dims.L) / 2 + 0.3;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
        const aMoving = a.vel.lengthSq() > 0.01 || a === this._current, bMoving = b.vel.lengthSq() > 0.01 || b === this._current;
        if (!aMoving && !bMoving) continue;
        const fa = a.forward, fb = b.forward;
        let best = 0, nx = 0, nz = 0, hx = 0, hz = 0;
        for (const ua of a.circles) {
          const ax = a.x + fa.x * ua, az = a.z + fa.z * ua;
          for (const ub of b.circles) {
            const bx = b.x + fb.x * ub, bz = b.z + fb.z * ub;
            const dx = bx - ax, dz = bz - az;
            const d = Math.hypot(dx, dz);
            const ov = a.radius + b.radius - d;
            if (ov > best) { best = ov; nx = d > 1e-4 ? dx / d : 1; nz = d > 1e-4 ? dz / d : 0; hx = (ax + bx) / 2; hz = (az + bz) / 2; }
          }
        }
        if (best <= 0) continue;
        const ma = a.mass, mb = b.mass, tm = ma + mb;
        a.group.position.x -= nx * best * (mb / tm); a.group.position.z -= nz * best * (mb / tm);
        b.group.position.x += nx * best * (ma / tm); b.group.position.z += nz * best * (ma / tm);
        const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * nz;
        if (vn >= 0) continue;
        const e = 0.3;
        const jimp = (-(1 + e) * vn) / (1 / ma + 1 / mb);
        a.vel.x -= (nx * jimp) / ma; a.vel.y -= (nz * jimp) / ma;
        b.vel.x += (nx * jimp) / mb; b.vel.y += (nz * jimp) / mb;
        const impact = -vn;
        // spin from off-center contact
        const spin = (car, sign) => {
          const rx = hx - car.x, rz = hz - car.z;
          const tq = (rz * nx - rx * nz) * sign;
          car.angVel = clamp(car.angVel + tq * impact * 0.05 / car.mass, -4, 4);
        };
        spin(a, -1); spin(b, 1);
        if (impact > 4) {
          const s = clamp(impact / 25, 0, 1);
          this.sfxAt('crash', hx, hz, s);
          if (impact > 8) this.fx.sparks(hx, 0.6, hz, Math.round(5 + s * 12), 0.7 + s);
          a.damage((impact - 4) * 1.3 * (mb / tm) * 2, 'crash');
          b.damage((impact - 4) * 1.3 * (ma / tm) * 2, 'crash');
          try { this.police.onCollide(a, b, impact); } catch (e) { console.error('[vehicles] police collide', e); }
          for (const c of [a, b]) {
            if (c.ai && c.ai.cruise) { c.ai.stunned = 1.5 + Math.random() * 1.5; }
            if (c === this._current) { this.game.cameraRig.shake(0.1 + s * 0.4, 0.25); this.onCarImpact(c, impact); }
          }
        }
      }
    }
  }
}
