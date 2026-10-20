import * as THREE from 'three';
import { CARS, MPH } from '../data/cars.js';
import { WEAPONS } from '../data/weapons.js';
import { createStickman, lookToStickman } from '../entities/stickman.js';
import { getBuild, passengerSeat, posePassenger, PASSENGER_SCALE } from '../vehicles/models.js';
import { clamp, esc, rand, chance, pick } from '../core/util.js';

// Ride shotgun: hop into a friend's car (F at their passenger door), get rendered seated in it on
// every screen, lean out and shoot with your own gun (LMB), F to hop out.
//
// The DRIVER owns seat assignment. The passenger's own 'ps' packets carry r:{d,s} so every screen
// (late joiners too) seats them in the driver's car as that screen sees it.
//   ride:req    passenger -> driver   {}                        knock on the window
//   ride:ok     driver -> passenger   {s, c}                    seat number + car id
//   ride:no     driver -> passenger   {why}                     full / moving / bike / nocar / far
//   ride:leave  passenger -> driver   {}                        hopped out
//   ride:end    driver -> passenger   {why: 'exit'|'boom'}      driver got out / the car blew up
// Locally, riding sets game.player.vehicle to a seat proxy (group/x/z/speed/heading/vel/dims) while
// game.vehicles.current stays null, so "in a car" checks everywhere keep working.

const HOP_RANGE = 3.4;        // m from a passenger door
const MAX_HOP_SPEED = 7;      // m/s
const LOST_GRACE = 0.9;       // s without seeing the driver's car before we tumble out

const seatsOf = (carId) => {
  const def = CARS[carId];
  if (!def || def.kind === 'bike' || def.kind === 'moto') return 1;
  try { if (getBuild(carId).bike) return 1; } catch { return 1; }
  return clamp(Math.floor(def.seats || 1), 1, 8);
};
const lookKey = (l) => `${l?.color ?? ''}|${l?.hat ?? ''}|${l?.hatColor ?? ''}|${l?.skin ?? ''}|${l?.build ?? ''}`;

let gunGeo = null, gunMat = null;
function gunMesh() {
  gunGeo ||= new THREE.BoxGeometry(0.07, 0.3, 0.13).translate(0, -0.1, 0.03);
  gunMat ||= new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.6, roughness: 0.4 });
  return new THREE.Mesh(gunGeo, gunMat);
}

export function installRide(game, U) {
  const net = game.net, vm = game.vehicles;
  let ride = null;              // local passenger: { d, s, carId, proxy, lostT, aimT, cd, last }
  let pending = null;           // { d, t }
  const passengers = new Map(); // driver side: peerId -> { s, t }
  const figures = new Map();    // 'local' | peerId -> { sm, key, parent, gun }
  let driverCar = null;         // the car we're driving (to tell 'boom' from 'exit')
  let hudT = 0, pruneT = 0, promptCache = { t: -1, best: null };
  const _v = new THREE.Vector3();

  // ------------------------------------------------------------ crosshair (combat's is hidden while "in a car")
  const xh = document.createElement('div');
  xh.id = 'coop-xhair';
  xh.style.cssText = 'position:fixed;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid rgba(255,226,170,.85);border-radius:50%;box-shadow:0 0 4px #000;pointer-events:none;z-index:25;display:none';
  xh.innerHTML = '<i style="position:absolute;left:8px;top:8px;width:4px;height:4px;background:#ffe2aa;border-radius:2px"></i>';
  document.body.appendChild(xh);
  const showXh = (on) => { const d = on ? 'block' : 'none'; if (xh.style.display !== d) xh.style.display = d; };

  // ------------------------------------------------------------ the driver's car as THIS screen sees it
  function carInfo(driverId) {
    if (!driverId) return null;
    if (driverId === net.localId || driverId === 'local') {
      const c = vm?.current;
      if (!c || c.removed) return null;
      return { mesh: c.group, carId: c.carId, x: c.x, y: c.group.position.y, z: c.z, f: c.heading, speed: c.speed, local: c };
    }
    const rp = net.remotePlayers.get(driverId);
    if (!rp || rp._fresh || !rp.vehicle) return null;
    const p = rp.group.position;
    return { mesh: rp._car || null, carId: rp.vehicle.carId, x: p.x, y: p.y, z: p.z, f: rp.group.rotation.y, speed: Math.abs(rp.vehicle.speed || 0) };
  }

  function anchor(driverId) {
    const c = carInfo(driverId);
    return c ? { x: c.x, y: c.y, z: c.z, f: c.f } : null;
  }

  // ------------------------------------------------------------ hop in
  function doorDist(c, seats, px, pz) {
    const B = getBuild(c.carId);
    const fx = Math.sin(c.f), fz = Math.cos(c.f), lx = Math.cos(c.f), lz = -Math.sin(c.f);
    let best = Infinity;
    for (let s = 1; s < seats; s++) {
      const seat = passengerSeat(c.carId, s);
      if (!seat) continue;
      const off = (B.dims.W / 2 + 0.6) * (Math.sign(seat.x) || -1);
      const dx = c.x + lx * off + fx * seat.u - px, dz = c.z + lz * off + fz * seat.u - pz;
      best = Math.min(best, Math.hypot(dx, dz));
    }
    // anywhere along the body works too, just a bit less eagerly
    best = Math.min(best, Math.hypot(c.x - px, c.z - pz) - B.dims.L / 2 + 1.2);
    return best;
  }

  function findHopTarget() {
    const t = U.elapsed();
    if (promptCache.t > t - 0.15) return promptCache.best;
    let best = null;
    const pl = game.player;
    if (net.connected && pl && !pl.vehicle && !pl.dead) {
      const pp = pl.group.position;
      for (const rp of net.remotePlayers.values()) {
        if (!rp.vehicle || rp._fresh || rp.ride || rp.dead) continue;
        const seats = seatsOf(rp.vehicle.carId);
        if (seats <= 1) continue;
        const c = carInfo(rp.id);
        if (!c || Math.abs(c.x - pp.x) > 12 || Math.abs(c.z - pp.z) > 12) continue;
        const d = doorDist(c, seats, pp.x, pp.z);
        if (d <= HOP_RANGE && (!best || d < best.d)) best = { id: rp.id, d, c, name: rp.name };
      }
    }
    promptCache = { t, best };
    return best;
  }

  function ownDoorDist(car) {
    if (!car) return Infinity;
    try {
      const door = vm.doorPos(car);
      const pp = game.player.group.position;
      return Math.hypot(door.x - pp.x, door.z - pp.z);
    } catch { return Infinity; }
  }

  function tryHopIn(nearCar) {
    if (!net.connected || ride) return false;
    const pl = game.player;
    if (!pl || pl.dead || pl.vehicle || game.controlsLocked) return false;
    const b = findHopTarget();
    if (!b) return false;
    if (nearCar && ownDoorDist(nearCar) < b.d - 0.4) return false; // a closer local car wins
    if (pending && U.elapsed() - pending.t < 2.5) return true;
    if (b.c.speed > MAX_HOP_SPEED) { U.toast(`${esc(b.name)}'s car is moving. Bang on the roof until they stop.`, 'bad', 2200); return true; }
    pending = { d: b.id, t: U.elapsed() };
    U.send(b.id, { t: 'ride:req' });
    U.toast(`You knock on <b>${esc(b.name)}</b>'s window…`, 'info', 1500);
    return true;
  }

  function prompt(nearCar) {
    const pl = game.player;
    if (ride && pl?.vehicle === ride.proxy) {
      return `<kbd>F</kbd>Hop out · <kbd>LMB</kbd>${isGun() ? 'lean out &amp; shoot' : 'shoot (equip a gun: Q)'}`;
    }
    if (pl?.vehicle) return null;
    const b = findHopTarget();
    if (!b) return null;
    if (nearCar && ownDoorDist(nearCar) < b.d - 0.4) return null;
    return `<kbd>F</kbd>Ride shotgun with <b>${esc(b.name)}</b>`;
  }

  // ------------------------------------------------------------ driver side
  function freeSeat(carId, from) {
    const seats = seatsOf(carId);
    const taken = new Set();
    for (const [pid, e] of passengers) if (pid !== from) taken.add(e.s);
    for (const rp of net.remotePlayers.values()) if (rp.id !== from && rp.ride?.d === net.localId) taken.add(rp.ride.s);
    for (let s = 1; s < seats; s++) if (!taken.has(s)) return s;
    return 0;
  }

  net.on('ride:req', (m, from) => {
    if (!U.known(from) || !U.rate(from, 'ride:req', 400)) return;
    const no = (why) => U.send(from, { t: 'ride:no', why });
    const car = vm?.current;
    if (!car || car.removed || car.dead || car.exploded) return no('nocar');
    if (seatsOf(car.carId) <= 1) return no('bike');
    const rp = net.remotePlayers.get(from);
    // newest packet (rp._t) or the smoothed position, whichever is closer
    if (!rp || Math.min(Math.hypot(rp.pos.x - car.x, rp.pos.z - car.z), Math.hypot((rp._t?.x ?? 1e9) - car.x, (rp._t?.z ?? 1e9) - car.z)) > 14) return no('far');
    if (car.speed > MAX_HOP_SPEED + 2) return no('moving');
    const have = passengers.get(from);
    const s = have?.s || freeSeat(car.carId, from);
    if (!s) return no('full');
    passengers.set(from, { s, t: U.elapsed() });
    driverCar = car;
    U.send(from, { t: 'ride:ok', s, c: car.carId });
    if (!have) U.toast(`<b>${esc(U.nameOf(from))}</b> called shotgun and hopped in.`, 'good', 2500);
  });

  net.on('ride:leave', (m, from) => {
    if (!passengers.has(from)) return;
    passengers.delete(from);
    U.toast(`<b>${esc(U.nameOf(from))}</b> hopped out.`, 'info', 1800);
  });

  function endPassengers(why) {
    for (const pid of passengers.keys()) U.send(pid, { t: 'ride:end', why });
    passengers.clear();
  }

  game.bus.on('car:exited', () => {
    if (!passengers.size) { driverCar = null; return; }
    const boom = !!(driverCar && (driverCar.exploded || driverCar.removed));
    endPassengers(boom ? 'boom' : 'exit');
    driverCar = null;
  });

  // ------------------------------------------------------------ passenger side
  net.on('ride:ok', (m, from) => {
    if (!pending || pending.d !== from) return;
    pending = null;
    const s = U.int(m.s, 1, 7), carId = U.word(m.c);
    if (!s || !carId || !CARS[carId] || s >= seatsOf(carId)) return;
    const pl = game.player;
    if (ride || !pl || pl.dead || pl.vehicle || !carInfo(from)) { U.send(from, { t: 'ride:leave' }); return; }
    enterSeat(from, s, carId);
  });

  net.on('ride:no', (m, from) => {
    if (!pending || pending.d !== from) return;
    pending = null;
    const n = esc(U.nameOf(from));
    const why = U.word(m.why);
    const msg = {
      full: `${n}'s car is full. Somebody's riding bitch already.`,
      moving: `${n} is moving. Tell them to stop first.`,
      bike: "There's no room on that. Unless you want to sit on the handlebars. You don't.",
      far: 'Get closer to the door.',
    }[why] || `${n} isn't driving anything right now.`;
    U.toast(msg, 'bad', 2400);
  });

  net.on('ride:end', (m, from) => {
    if (!ride || ride.d !== from) return;
    hopOut(m.why === 'boom' ? 'boom' : 'exit');
  });

  function makeProxy(d, s, carId) {
    const group = new THREE.Group();
    const B = getBuild(carId);
    const proxy = {
      passenger: true, driverId: d, seat: s, carId, def: CARS[carId], group, isBike: false,
      dims: { L: B.dims.L, W: B.dims.W }, speed: 0, vf: 0, heading: 0, vel: new THREE.Vector2(), aimYaw: null,
      upgrades: {}, input: { throttle: 0, reverse: 0, steer: 0, handbrake: true, nitro: false }, removed: false,
      get x() { return group.position.x; },
      get z() { return group.position.z; },
      get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; },
    };
    return proxy;
  }

  function enterSeat(d, s, carId) {
    const g = game, pl = g.player;
    const proxy = makeProxy(d, s, carId);
    ride = { d, s, carId, proxy, lostT: 0, aimT: -99, cd: 0, last: null, since: U.elapsed(), warnT: -99 };
    const c = carInfo(d);
    if (c) syncProxy(c, 0);
    pl.vehicle = proxy;
    pl.group.visible = false;
    pl.aiming = false;
    pl.faceOverride = null;
    g.cameraRig.follow(proxy.group, { height: 2.2, dist: 9.5 });
    g.cameraRig.yaw = proxy.heading + Math.PI;
    hudT = 0;
    U.toast(`Riding shotgun with <b>${esc(U.nameOf(d))}</b>. ${isGun() ? 'Hold <kbd>LMB</kbd> to lean out and shoot.' : 'Equip a gun (Q) for drive-bys.'}`, 'good', 3200);
    g.bus.emit('coop:ride', { driver: d, seat: s, on: true });
  }

  function syncProxy(c, dt) {
    const pr = ride.proxy;
    const p = pr.group.position;
    if (dt > 0) {
      const vx = (c.x - p.x) / dt, vz = (c.z - p.z) / dt;
      if (Math.hypot(vx, vz) < 120) pr.vel.set(vx, vz);
    }
    p.set(c.x, c.y || 0, c.z);
    pr.group.rotation.y = c.f;
    pr.heading = c.f;
    pr.speed = c.speed;
    pr.vf = c.speed;
    ride.last = { ...c, mesh: null, local: null };
  }

  function exitSpot(c, s) {
    const B = getBuild(c.carId);
    const seat = passengerSeat(c.carId, s) || { x: -B.seat.x, u: B.seat.u };
    const side = Math.sign(seat.x) || -1;
    const fx = Math.sin(c.f), fz = Math.cos(c.f), lx = Math.cos(c.f), lz = -Math.sin(c.f);
    const half = B.dims.W / 2 + 0.8, L2 = B.dims.L / 2 + 1;
    const cands = [[side * half, seat.u], [-side * half, seat.u], [0, -L2], [0, L2]];
    const ph = game.physics;
    for (const [dl, du] of cands) {
      const x = c.x + lx * dl + fx * du, z = c.z + lz * dl + fz * du;
      const r = ph.resolveCircle(x, z, 0.45);
      if (Math.hypot(r.x - x, r.z - z) < 0.3 && !vm?.insideCar?.(r.x, r.z, 0.45)) return r;
    }
    return ph.resolveCircle(c.x + lx * cands[0][0] + fx * seat.u, c.z + lz * cands[0][0] + fz * seat.u, 0.45);
  }

  // reason: 'key' | 'exit' | 'boom' | 'lost' | 'died' | 'reset'
  function hopOut(reason = 'key') {
    const r = ride;
    if (!r) return;
    const g = game, pl = g.player;
    ride = null;
    showXh(false);
    try { g.ui.setHud('vehicle', ''); } catch { /* ignore */ }
    const c = carInfo(r.d) || r.last;
    if (pl.vehicle === r.proxy) {
      pl.vehicle = null;
      if (reason !== 'died' && reason !== 'reset') {
        if (c) {
          const spot = exitSpot(c, r.s);
          pl.spawn(spot.x, spot.z, c.f);
        }
        pl.group.visible = true;
      }
      g.cameraRig.follow(pl.group);
    }
    if (reason === 'key' || reason === 'died' || reason === 'reset') U.send(r.d, { t: 'ride:leave' });
    const name = esc(U.nameOf(r.d));
    if (reason === 'boom') {
      g.state.damage(45, 'explosion');
      g.cameraRig?.shake?.(0.9, 0.5);
      U.toast(`${name}'s car went up in flames with you in it. <b>-45 HP</b>`, 'bad', 3500);
    } else if (reason === 'key' && c && c.speed > 12) {
      const dmg = Math.round(Math.min(40, (c.speed - 12) * 1.4));
      g.state.damage(dmg, 'bail');
      g.cameraRig?.shake?.(0.4, 0.3);
      U.toast(`You bail out of a moving car. Stunt double you are not. <b>-${dmg} HP</b>`, 'bad');
    } else if (reason === 'exit') U.toast(`${name} parked. Everybody out.`, 'info', 2000);
    else if (reason === 'lost') U.toast(`Lost your ride. You tumble out onto the curb.`, 'bad', 2500);
    g.bus.emit('coop:ride', { driver: r.d, seat: r.s, on: false, reason });
  }

  // something else took the "vehicle" slot (respawn, arrest, a script) — drop the ride quietly
  game.bus.on('player:died', () => { if (ride) hopOut('died'); });
  game.bus.on('player:arrested', () => { if (ride) hopOut('died'); });
  game.bus.on('state:reset', () => { if (ride) hopOut('reset'); passengers.clear(); });
  game.bus.on('net:disconnected', () => { if (ride) hopOut('lost'); passengers.clear(); pending = null; });
  game.bus.on('net:player-left', ({ id } = {}) => {
    passengers.delete(id);
    if (ride && ride.d === id) hopOut('lost');
  });

  // ------------------------------------------------------------ drive-by shooting
  const combatCore = () => game.combat?._ctx?.combat || null;
  function isGun() { return WEAPONS[game.combat?.weaponId]?.kind === 'gun'; }

  function aimYaw() {
    const yaw = game.cameraRig.yaw;
    return Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  }

  function shoot() {
    const g = game, cb = combatCore();
    if (!cb || !ride) return;
    const id = cb.weaponId, def = WEAPONS[id], p = g.state.p;
    if (!def || def.kind !== 'gun' || cb.reloadT > 0) return;
    p.mags = p.mags || {};
    if (!(p.mags[id] > 0)) {
      ride.cd = 0.25;
      try { cb.startReload(); } catch { /* ignore */ }
      return;
    }
    p.mags[id]--;
    ride.cd = def.rate;
    ride.aimT = U.elapsed();
    const fx = cb.ctx?.fx;
    const ang = ride.proxy.aimYaw ?? aimYaw();
    // muzzle: the seated figure's gun hand if we have one, else just above the seat
    let mx, my, mz;
    const fig = figures.get('local');
    if (fig?.sm?.group?.visible && fig.gun) {
      fig.sm.rightHand.updateWorldMatrix(true, false);
      fig.sm.rightHand.localToWorld(_v.set(0, -0.25, 0));
      mx = _v.x; my = _v.y; mz = _v.z;
    } else {
      const pp = ride.proxy.group.position;
      mx = pp.x + Math.sin(ang) * 1.2; my = 1.4; mz = pp.z + Math.cos(ang) * 1.2;
    }
    const pellets = def.pellets || 1;
    const moving = ride.proxy.speed > 3;
    const spread = ((def.spread || 0) + (cb.bloom || 0)) * (moving ? 1.9 : 1.25) + (moving ? 0.015 : 0);
    const hits = new Map();
    const shots = [];
    for (let i = 0; i < pellets; i++) {
      let a = ang + rand(-spread, spread);
      let c = cb._cast(mx, mz, a, def.range);
      if (!c.npc && pellets === 1 && cb._assist) {
        const as = cb._assist(mx, mz, a, def.range);
        if (as) { const c2 = cb._cast(mx, mz, as.ang, def.range); if (c2.npc) { c = c2; a = as.ang; } }
      }
      const ex = mx + c.dx * c.t, ez = mz + c.dz * c.t;
      fx?.tracer?.(mx, my, mz, ex, 1.15 + rand(-0.15, 0.2), ez);
      shots.push([Math.round(ex * 10) / 10, Math.round(ez * 10) / 10]);
      if (c.npc) {
        const falloff = pellets > 1 ? clamp(1.15 - c.t / def.range, 0.35, 1) : 1;
        hits.set(c.npc, (hits.get(c.npc) || 0) + def.damage * falloff);
      }
    }
    let killed = false;
    for (const [n, raw] of hits) {
      const crit = chance(0.05);
      const dmg = Math.round(raw * rand(0.92, 1.08) * (crit ? 1.5 : 1));
      const dir = { x: Math.sin(ang), z: Math.cos(ang) };
      try {
        const res = cb.hitNpc(n, dmg, { dir, kb: pellets > 1 ? 2 + raw * 0.12 : 1.2 + def.damage * 0.06, heavy: raw >= 40, gun: true, crit });
        if (res?.killed) killed = true;
      } catch (e) { console.error('[coop] drive-by hit failed', e); }
      if (crit) fx?.number?.(n.pos.x, 2.6 * (n.scale || 1), n.pos.z, pick(['DRIVE-BY!', 'DRIVE-THRU SPECIAL!', 'WINDOW SEAT!']), 'crit');
    }
    if (hits.size) { try { cb._hitMarker?.(killed); } catch { /* ignore */ } }
    const big = id === 'shotgun' || id === 'rifle' || id === 'revolver' || id === 'goldengun';
    fx?.muzzle?.(mx, my, mz, big ? 0.9 : 0.6);
    try { fx?.sfx?.play?.(id === 'shotgun' ? 'shotgun' : id === 'smg' ? 'smg' : big ? 'biggun' : 'gun'); } catch { /* ignore */ }
    g.cameraRig?.shake?.(id === 'shotgun' ? 0.25 : big ? 0.18 : 0.06, 0.12);
    cb.bloom = Math.min(0.12, (cb.bloom || 0) + 0.02);
    try { g.combat.crime('gunfire', mx, mz); } catch { /* ignore */ }
    try { cb.ctx?.ambient?.panic?.(mx, mz, 28); } catch { /* ignore */ }
    U.bcast({ t: 'combat:shot', x: Math.round(mx * 100) / 100, y: Math.round(my * 100) / 100, z: Math.round(mz * 100) / 100, s: shots, w: id });
    if (p.mags[id] === 0 && p.ammo?.[def.ammo] > 0) { try { cb.startReload(); } catch { /* ignore */ } }
    cb.lastCombatT = g.elapsed;
    g.state.changed('ammo');
  }

  function rideHud(c) {
    const cb = combatCore();
    const id = game.combat?.weaponId, def = WEAPONS[id];
    const p = game.state.p;
    let gun = '<span style="color:#8f8676">no gun — Q to switch</span>';
    if (def?.kind === 'gun') {
      const mag = p.mags?.[id] || 0, pool = p.ammo?.[def.ammo] || 0;
      gun = `${esc(def.name)} <b>${mag}</b>/${pool}${cb?.reloadT > 0 ? ' <span style="color:#d6b33c">reloading…</span>' : ''}`;
    }
    const mph = Math.round((c?.speed || 0) / MPH);
    return `<div style="display:inline-block;background:rgba(10,8,6,.72);border:1px solid #3a3128;padding:6px 10px 5px;min-width:200px;text-align:left;margin-top:6px">
      <div style="font-size:15px;color:#c9bfae;white-space:nowrap">Shotgun in <b>${esc(U.nameOf(ride.d))}</b>'s ${esc(CARS[ride.carId]?.name || 'ride')}</div>
      <div style="font-size:28px;font-weight:800;line-height:1.1;color:#e6dfcf">${mph}<span style="font-size:13px;color:#a9a291"> MPH</span></div>
      <div style="font-size:13px;color:#c9bfae">${gun}</div>
      <div style="font-size:12px;color:#8f8676;margin-top:3px">F hop out · LMB shoot · R reload · Q switch</div></div>`;
  }

  function updateRide(dt) {
    const g = game, pl = g.player;
    if (pl.vehicle !== ride.proxy) { // yanked by something else (respawn, cutscene, teleport)
      const r = ride; ride = null; showXh(false);
      U.send(r.d, { t: 'ride:leave' });
      return;
    }
    const c = carInfo(ride.d);
    if (!c) {
      ride.lostT += dt;
      if (ride.lostT > LOST_GRACE || !net.remotePlayers.has(ride.d)) hopOut('lost');
      return;
    }
    ride.lostT = 0;
    syncProxy(c, dt);
    pl.group.position.set(c.x, 0, c.z);
    pl.facing = c.f;
    pl.speed = c.speed;
    const rig = g.cameraRig;
    if (rig.target !== ride.proxy.group) rig.follow(ride.proxy.group, { height: 2.2, dist: 9.5 });
    rig.distOverride = 9.5 + Math.min(c.speed * 0.05, 3.5);

    const inp = g.input;
    const can = !g.controlsLocked && !pl.dead && !g.combat?.isDown;
    const cb = combatCore();
    if (can && inp.wasPressed('KeyQ')) { try { g.combat.cycle(inp.isDown('ShiftLeft') ? -1 : 1); } catch { /* ignore */ } }
    if (can && inp.wasPressed('KeyR')) { try { cb?.startReload(); } catch { /* ignore */ } }
    const gun = isGun();
    ride.cd -= dt;
    if (can && gun) {
      const id = g.combat.weaponId;
      const trig = id === 'smg' ? inp.mouseDown(0) : inp.mouseClicked(0);
      if (trig && ride.cd <= 0) shoot();
      if (inp.mouseDown(0)) ride.aimT = U.elapsed();
    } else if (can && inp.mouseClicked(0) && U.elapsed() - ride.warnT > 3) {
      ride.warnT = U.elapsed();
      U.toast('Drive-bys need a gun. <kbd>Q</kbd> to switch. Throwing hands out the window is just waving.', 'info', 2200);
    }
    const lean = can && gun && U.elapsed() - ride.aimT < 2.2;
    ride.proxy.aimYaw = lean ? aimYaw() : null;
    showXh(can && gun);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.2; try { g.ui.setHud('vehicle', rideHud(c)); } catch { /* ignore */ } }
  }

  // ------------------------------------------------------------ seated figures (everyone, every screen)
  function wantedFigures() {
    const out = new Map();
    if (ride && game.player.vehicle === ride.proxy) {
      out.set('local', { d: ride.d, s: ride.s, look: game.state.p.look, aim: ride.proxy.aimYaw, weapon: game.combat?.weaponId });
    }
    for (const rp of net.remotePlayers.values()) {
      if (!rp.ride || rp.dead || rp._fresh) continue;
      out.set(rp.id, { d: rp.ride.d === net.localId ? 'local' : rp.ride.d, s: rp.ride.s, look: rp.look, aim: rp.rideAim, weapon: rp.weapon });
    }
    return out;
  }

  function dropFigure(id) {
    const f = figures.get(id);
    if (!f) return;
    figures.delete(id);
    try { f.sm.dispose(); } catch { f.sm.group.removeFromParent(); }
  }

  function updateFigures() {
    const want = wantedFigures();
    for (const id of [...figures.keys()]) if (!want.has(id)) dropFigure(id);
    for (const [id, w] of want) {
      const c = carInfo(w.d);
      let f = figures.get(id);
      const body = c?.mesh?.userData?.vis?.body || null;
      if (!c || !body || w.s >= seatsOf(c.carId) || !passengerSeat(c.carId, w.s)) { if (f) f.sm.group.visible = false; continue; }
      const key = lookKey(w.look);
      if (f && f.key !== key) { dropFigure(id); f = null; }
      if (!f) {
        const sm = createStickman({ ...lookToStickman({ color: 0x141414, hatColor: 0x2a2420, ...(w.look || {}) }), scale: PASSENGER_SCALE });
        sm.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        f = { sm, key, parent: null, gun: null };
        figures.set(id, f);
      }
      if (f.parent !== body) { body.add(f.sm.group); f.parent = body; }
      f.sm.group.visible = true;
      const aimRel = w.aim != null ? w.aim - c.f : null;
      posePassenger(f.sm, c.carId, w.s, aimRel);
      const wantGun = aimRel != null && WEAPONS[w.weapon]?.kind === 'gun';
      if (wantGun && !f.gun) { f.gun = gunMesh(); f.sm.rightHand.add(f.gun); }
      else if (!wantGun && f.gun) { f.gun.removeFromParent(); f.gun = null; }
    }
  }

  // ------------------------------------------------------------ per frame
  function afterAvatars(dt) {
    if (ride) { try { updateRide(dt); } catch (e) { if (!ride?._err) { console.error('[coop] ride update failed', e); if (ride) ride._err = true; } } }
    updateFigures();
  }

  function update(dt) {
    if (pending && U.elapsed() - pending.t > 3) {
      U.toast(`${esc(U.nameOf(pending.d))} didn't unlock the door.`, 'bad', 1800);
      pending = null;
    }
    if (vm?.current) driverCar = vm.current;
    pruneT -= dt;
    if (pruneT <= 0 && passengers.size) {
      pruneT = 1;
      const t = U.elapsed();
      for (const [pid, e] of passengers) {
        const rp = net.remotePlayers.get(pid);
        if (!rp) { passengers.delete(pid); continue; }
        if (rp.ride?.d === net.localId) e.t = t;
        else if (t - e.t > 4) passengers.delete(pid);
      }
      if (!vm?.current) endPassengers('exit');
    }
  }

  // late joiners/anyone: passenger state rides along in 'ps', nothing else to send.
  const api = {
    get active() { return !!ride; },
    get driver() { return ride?.d || null; },
    get passengers() { return [...passengers.entries()].map(([id, e]) => ({ id, seat: e.s })); },
    anchor, afterAvatars, update, hopOut, tryHopIn, prompt, seatsOf,
  };
  if (vm) {
    vm.coop = {
      tryHopIn: (car) => tryHopIn(car),
      onPassengerF: () => { if (ride) hopOut('key'); },
      prompt: (car) => prompt(car),
    };
  }
  return api;
}
