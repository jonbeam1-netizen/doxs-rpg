import * as THREE from 'three';
import { CARS, MPH } from '../data/cars.js';
import { createCarMesh, animateCarMesh, charCarMesh, setCarPaint } from './models.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const MASS = { bike: 0.3, moto: 0.5, car: 1, truck: 1.7 };

// One vehicle in the world: player-owned, traffic, parked civilian or race AI.
// Arcade model: velocity is a world vector; each step it's split into forward
// and lateral parts. Lateral slip decays by tire grip (less with the handbrake,
// which is what makes drifts), heading turns like a bicycle model.
export class Car {
  constructor(vm, carId, opts = {}) {
    this.vm = vm;
    this.game = vm.game;
    this.carId = CARS[carId] ? carId : 'rustbucket';
    this.def = CARS[this.carId];
    this.color = opts.color || this.def.color;
    this.owner = opts.owner || 'civil';     // 'player' | 'traffic' | 'civil' | 'race'
    this.uid = opts.uid || null;
    this.stolen = !!opts.stolen;
    this.upgrades = opts.upgrades || { engine: 0, handling: 0, armor: 0, nitro: false, tires: false };
    this.group = createCarMesh(this.carId, this.color, { driver: !!opts.driver, driverColor: opts.driverColor ?? 0x1a1a1a, hat: opts.hat ?? null });
    this.vis = this.group.userData.vis;
    this.isBike = this.vis.bike;
    this.dims = this.vis.build.dims;
    this.group.position.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = opts.rot ?? 0;
    this.group.rotation.y = this.heading;
    this.vel = new THREE.Vector2();
    this.angVel = 0;
    this.steer = 0;
    this.vf = 0; this.vl = 0; this.yawRate = 0; this.speed = 0;
    this.gripMul = 1;
    this.roll = 0; this.pitch = 0; this.lastVf = 0; this.accSmooth = 0;
    this.input = { throttle: 0, reverse: 0, steer: 0, handbrake: false, nitro: false };
    this.frozen = false;
    this.nitroT = 0; this.nitroCharge = 1;
    this.dead = false; this.burnT = 0; this.exploded = false; this.removed = false;
    this.smokeAcc = 0; this.exhaustAcc = 0;
    this.skid = 0;
    this.lastSkid = [null, null];
    this.impactCd = 0;
    this.tires = 0;            // popped tires (0..4): spikes, cop bullets
    this.sirenOn = false;      // light bar + siren (interceptors)
    this.replica = false;      // host-simulated police car mirrored on a client
    this.lb = null;
    if (this.def.features?.lightbar) {
      // Per-car light bar materials so each cruiser flashes on its own.
      const red = [], blue = [];
      for (const m of this.vis.meshes) {
        if (m.userData.key === 'lbRed') red.push(m);
        else if (m.userData.key === 'lbBlue') blue.push(m);
      }
      if (red.length && blue.length) {
        const rm = red[0].material.clone(), bm = blue[0].material.clone();
        rm.emissiveIntensity = 0.15; bm.emissiveIntensity = 0.15;
        for (const m of red) m.material = rm;
        for (const m of blue) m.material = bm;
        this.lb = { red: rm, blue: bm };
      }
    }
    this.applyStats();
    this.hp = opts.hp != null ? clamp(opts.hp, 1, this.maxHp) : this.maxHp;
    // Collision circles along the length.
    const W = this.dims.W, L = this.dims.L;
    this.radius = this.isBike ? 0.42 : W * 0.5;
    const n = this.isBike ? 2 : Math.max(2, Math.ceil(L / (W * 0.95)));
    const span = L / 2 - this.radius;
    this.circles = [];
    for (let i = 0; i < n; i++) this.circles.push(n === 1 ? 0 : -span + (2 * span * i) / (n - 1));
    this.game.scene.add(this.group);
  }

  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  get hasDriver() { return this.vis.driver.group.visible; }

  applyStats() {
    const d = this.def, u = this.upgrades || {};
    this.mass = (MASS[d.kind] || 1) * (d.model === 'military' ? 1.8 : d.model === 'limo' ? 1.4 : 1) * (1 + (u.armor || 0) * 0.08);
    this.vmax = d.topSpeed * MPH * (1 + (u.engine || 0) * 0.07);
    this.accel = (2.8 + d.accel * 1.35) * (1 + (u.engine || 0) * 0.13) / Math.sqrt(Math.max(0.6, this.mass * (d.kind === 'truck' ? 0.8 : 1)));
    if (this.isBike) this.accel *= 1.2;
    this.brakeDecel = 20 + d.handling * 0.8;
    const h = d.handling + (u.handling || 0) * 1.3;
    this.grip = (this.isBike ? 10 : 5) + h * 0.85;
    this.maxSteer = (this.isBike ? 0.55 : 0.5) + h * 0.018;
    this.maxYaw = 1.7 + h * 0.09;
    this.latMax = (this.isBike ? 26 : 20) + h * 2;
    this.steerFalloff = 16 + h * 1.5;
    this.wheelbase = this.isBike ? 1.1 : Math.max(2.2, this.dims.L * 0.6);
    const prevMax = this.maxHp;
    this.maxHp = d.hp * (1 + (u.armor || 0) * 0.35);
    if (prevMax && this.hp != null) this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - prevMax));
  }

  setDriverVisible(on, color = null, hat = undefined) {
    const sm = this.vis.driver;
    sm.group.visible = on;
    if (color != null) sm.setColor(color);
  }

  repaint(color) {
    this.color = color;
    setCarPaint(this.group, color);
  }

  // ---------------------------------------------------------------- simulation
  update(dt) {
    if (this.removed) return;
    if (this.dead || this.frozen) {
      this.input.throttle = 0; this.input.reverse = 0; this.input.nitro = false;
      this.input.handbrake = true;
      if (this.dead) this.input.steer = 0;
    }
    if (this.nitroT > 0) this.nitroT -= dt;
    else if (this.nitroCharge < 1) this.nitroCharge = Math.min(1, this.nitroCharge + dt / 12);
    if (this.input.nitro && this.upgrades.nitro && this.nitroCharge >= 1 && this.nitroT <= 0 && !this.dead) {
      this.nitroT = 2.6; this.nitroCharge = 0;
      this.vm.onNitro?.(this);
    }
    const spd = this.vel.length();
    const steps = clamp(Math.ceil((spd * dt) / 0.5), 1, 8);
    const h = dt / steps;
    let hitMax = 0;
    for (let i = 0; i < steps; i++) hitMax = Math.max(hitMax, this.step(h));
    if (this.impactCd > 0) this.impactCd -= dt;
    if (hitMax > 0) this.onImpact(hitMax);
    this.speed = Math.abs(this.vf);

    // Visual: body roll & pitch, wheels, lights.
    this.group.rotation.y = this.heading;
    const latAcc = this.vf * this.yawRate;
    const longAcc = (this.vf - this.lastVf) / Math.max(dt, 1e-4);
    this.lastVf = this.vf;
    this.accSmooth += (clamp(longAcc, -40, 40) - this.accSmooth) * Math.min(1, dt * 6);
    const tRoll = this.isBike ? clamp(-latAcc * 0.03, -0.65, 0.65) : clamp(latAcc * 0.0042 + this.vl * 0.004, -0.09, 0.09);
    const tPitch = this.isBike ? 0 : clamp(-this.accSmooth * 0.0045, -0.055, 0.055);
    this.roll += (tRoll - this.roll) * Math.min(1, dt * 7);
    this.pitch += (tPitch - this.pitch) * Math.min(1, dt * 7);
    this.vis.body.rotation.set(this.pitch, 0, this.roll);
    if (this.dead && this.exploded) this.vis.body.rotation.set(0.04, 0, 0.06);
    if (!this.exploded) animateCarMesh(this.group, this.vf, this.steer, dt);
    const tail = this.vis.tailMat;
    const night = this.vm.nightLevel ?? 0;
    const brake = (this.braking || this.input.reverse > 0) && !this.exploded && !this.dead;
    tail.emissiveIntensity = this.exploded ? 0 : (brake ? 2.6 : 0.35 + night * 0.9);
    this.effects(dt);
    this.updateLightbar();

    if (this.dead && !this.exploded) {
      this.burnT -= dt;
      if (this.burnT <= 0) this.vm.explode(this);
    }
  }

  step(dt) {
    const inp = this.input;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = this.vel.x * fx + this.vel.y * fz;
    let vl = this.vel.x * rx + this.vel.y * rz;
    const boost = this.nitroT > 0;
    const flat = this.tires > 0 ? 1 - this.tires * 0.13 : 1;
    const vmax = this.vmax * (boost ? 1.3 : 1) * (this.aiSpeedMul ?? 1) * flat;
    const acc = this.accel * (boost ? 1.9 : 1) * (this.aiSpeedMul ?? 1) * flat;
    let braking = false;
    const thr = inp.throttle, rev = inp.reverse;
    if (thr > 0) {
      if (vf < -0.6) { vf = toward(vf, 0, this.brakeDecel * dt * thr); braking = true; }
      else vf += acc * thr * Math.max(0, 1 - (Math.max(0, vf) / vmax) ** 2) * dt;
    }
    if (rev > 0) {
      if (vf > 0.6 || inp.noReverse) { vf = toward(vf, 0, this.brakeDecel * dt * rev); braking = true; }
      else {
        const rmax = Math.min(vmax * 0.35, 12);
        vf -= acc * 0.6 * rev * Math.max(0, 1 - (Math.max(0, -vf) / rmax) ** 2) * dt;
      }
    }
    if (!thr && !rev) vf = toward(vf, 0, (1.4 + Math.abs(vf) * 0.035) * dt);
    if (vf > vmax) vf = toward(vf, vmax, 9 * dt);
    const hb = inp.handbrake;
    if (hb) { vf = toward(vf, 0, (this.isBike ? 12 : thr > 0 ? 3.5 : 6.5) * dt); braking = braking || Math.abs(vf) > 1; }

    // Steering (speed-sensitive).
    // Flat tires drag the wheel around.
    const wob = this.tires > 0 && Math.abs(vf) > 3 ? Math.sin((this.game.elapsed || 0) * 9 + this.tires) * 0.09 * this.tires + 0.05 * this.tires : 0;
    const st = clamp(inp.steer + wob, -1, 1);
    const rate = st === 0 ? 6 : Math.sign(st) !== Math.sign(this.steer) ? 8 : 3.6;
    this.steer = toward(this.steer, st, dt * rate);
    const sf = 1 / (1 + Math.abs(vf) / this.steerFalloff);
    const ang = this.steer * this.maxSteer * (0.25 + 0.75 * sf);
    let yaw = (vf * Math.tan(ang)) / this.wheelbase;
    // Cap lateral acceleration so high-speed steering stays sane.
    const latCap = this.latMax * (hb && !this.isBike ? 1.7 : 1) / Math.max(1, Math.abs(vf));
    const maxYaw = Math.min(this.maxYaw * (hb && !this.isBike ? 1.35 : 1), latCap);
    yaw = clamp(yaw, -maxYaw, maxYaw);
    if (hb && !this.isBike && Math.abs(vf) > 5) yaw *= 1.15;

    // Grip: the handbrake kills rear grip, it comes back gradually.
    this.gripMul = toward(this.gripMul, hb && !this.isBike ? 0.13 : 1, dt * (hb ? 7 : 1.5));
    const before = Math.abs(vl);
    vl *= Math.exp(-this.grip * this.gripMul * (this.tires > 0 ? 1 - this.tires * 0.1 : 1) * dt);
    // Some sideways energy turns back into forward speed when you power out of a drift.
    if (thr > 0 && vf > 0) vf += (before - Math.abs(vl)) * 0.22;

    this.heading += (yaw + this.angVel) * dt;
    this.angVel *= Math.exp(-3.5 * dt);
    this.vel.set(fx * vf + rx * vl, fz * vf + rz * vl);
    const p = this.group.position;
    p.x += this.vel.x * dt;
    p.z += this.vel.y * dt;
    this.vf = vf; this.vl = vl; this.yawRate = yaw; this.braking = braking;
    return this.collideWorld();
  }

  // Push the car's circles out of world boxes. Returns the hardest impact speed.
  collideWorld() {
    const phys = this.game.physics;
    const p = this.group.position;
    let impact = 0;
    for (let it = 0; it < 2; it++) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      let best = 0, px = 0, pz = 0, hu = 0;
      for (const u of this.circles) {
        const cx = p.x + fx * u, cz = p.z + fz * u;
        const r = phys.resolveCircle(cx, cz, this.radius);
        const dx = r.x - cx, dz = r.z - cz;
        const m = dx * dx + dz * dz;
        if (m > best) { best = m; px = dx; pz = dz; hu = u; }
      }
      if (best < 1e-8) break;
      const m = Math.sqrt(best);
      p.x += px; p.z += pz;
      const nx = px / m, nz = pz / m;
      const vn = this.vel.x * nx + this.vel.y * nz;
      if (vn < 0) {
        const rest = 0.28;
        this.vel.x -= (1 + rest) * vn * nx;
        this.vel.y -= (1 + rest) * vn * nz;
        // Scrape along the wall.
        const k = Math.max(0.55, 1 - (-vn) * 0.02);
        this.vel.x *= k; this.vel.y *= k;
        // Off-center hits spin the car.
        const rxv = fx * hu, rzv = fz * hu;
        const torque = rzv * nx - rxv * nz;
        this.angVel = clamp(this.angVel + torque * (-vn) * 0.09 / this.mass, -4, 4);
        impact = Math.max(impact, -vn);
        this._hitX = p.x + fx * hu - nx * this.radius;
        this._hitZ = p.z + fz * hu - nz * this.radius;
      }
    }
    return impact;
  }

  onImpact(impact) {
    if (impact < 3) return;
    const vm = this.vm;
    if (this.impactCd <= 0) {
      this.impactCd = 0.25;
      const s = clamp(impact / 25, 0, 1);
      vm.sfxAt?.('crash', this.x, this.z, s);
      if (impact > 7) vm.fx.sparks(this._hitX ?? this.x, 0.6, this._hitZ ?? this.z, Math.round(4 + s * 14), 0.6 + s);
      if (this === vm.current) this.game.cameraRig?.shake(0.1 + s * 0.45, 0.2 + s * 0.2);
    }
    // (police cruisers have reinforced bumpers — and terrible drivers)
    if (impact > 6) this.damage((impact - 6) * 1.7 * (this.isBike ? 0.6 : 1) * (this.police ? 0.35 : 1), 'crash');
    vm.onCarImpact?.(this, impact);
  }

  damage(n, source = '') {
    if (this.dead || this.removed || n <= 0 || this.replica) return;
    const armor = this.upgrades?.armor || 0;
    this.hp -= n * (1 - armor * 0.1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.burnT = this.isBike ? 0.4 : 4.5;
      this.vm.onCarDying?.(this, source);
    }
  }

  repair() { this.hp = this.maxHp; this.fixTires(); }

  // ---------------------------------------------------------------- tires & lights
  popTire(n = 1) {
    if (this.isBike && this.tires >= 2) return false;
    const max = this.isBike ? 2 : 4;
    if (this.tires >= max) return false;
    this.tires = Math.min(max, this.tires + n);
    // squash the wheels that went flat
    const ws = this.vis.wheels;
    for (let i = 0; i < ws.length; i++) ws[i].pivot.scale.set(1, i < this.tires ? 0.78 : 1, i < this.tires ? 1.06 : 1);
    return true;
  }

  fixTires() {
    if (!this.tires) return;
    this.tires = 0;
    for (const w of this.vis.wheels) w.pivot.scale.set(1, 1, 1);
  }

  setSiren(on) {
    this.sirenOn = !!on && !!this.lb;
    if (!this.sirenOn) this.updateLightbar(true);
  }

  updateLightbar(force = false) {
    const lb = this.lb;
    if (!lb || (!this.sirenOn && !force)) return;
    if (!this.sirenOn || this.exploded) { lb.red.emissiveIntensity = 0.15; lb.blue.emissiveIntensity = 0.15; return; }
    // wig-wag with a double strobe
    const t = (this.game.elapsed || 0) * 3.2 + (this._lbPhase ??= Math.random() * 4);
    const ph = t % 2, k = (ph % 1) < 0.22 || ((ph % 1) > 0.36 && (ph % 1) < 0.58);
    lb.red.emissiveIntensity = ph < 1 && k ? 6 : 0.1;
    lb.blue.emissiveIntensity = ph >= 1 && k ? 6 : 0.1;
  }

  // Client mirror of a host-simulated car: chase the snapshot pose.
  updateReplica(dt) {
    const n = this.net;
    if (!n || this.removed) return;
    const p = this.group.position;
    const k = 1 - Math.exp(-10 * dt);
    // extrapolate a little along the reported velocity
    const age = Math.min(0.25, (this.game.elapsed || 0) - n.at);
    const tx = n.x + n.vx * age, tz = n.z + n.vz * age;
    const ox = p.x, oz = p.z;
    if ((tx - ox) ** 2 + (tz - oz) ** 2 > 400) { p.x = tx; p.z = tz; } else { p.x += (tx - ox) * k; p.z += (tz - oz) * k; }
    let dh = n.rot - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * k;
    this.vel.set(n.vx, n.vz);
    this.vf = n.vf; this.speed = Math.abs(n.vf); this.steer = n.steer;
    this.group.rotation.y = this.heading;
    if (!this.exploded) animateCarMesh(this.group, this.vf, this.steer, dt);
    this.vis.tailMat.emissiveIntensity = this.exploded ? 0 : 0.35 + (this.vm.nightLevel ?? 0) * 0.9;
    this.effects(dt);
    this.updateLightbar();
  }

  effects(dt) {
    const fx = this.vm.fx;
    const near = this.vm.nearPlayer(this, 120);
    if (!near) return;
    const f = this.forward;
    const p = this.group.position;
    const L2 = this.dims.L / 2;
    // Tire skids (rear wheels).
    const slip = Math.abs(this.vl);
    const hardBrake = this.braking && this.speed > 9 && !this.isBike;
    const skidding = !this.exploded && ((slip > 2.4 && this.speed > 3) || (this.input.handbrake && this.speed > 4 && !this.dead) || hardBrake || (this.nitroT > 0 && this.speed < 18));
    this.skid = skidding ? clamp(Math.max(slip / 9, hardBrake ? 0.5 : 0.35), 0, 1) : 0;
    const wheels = this.isBike ? [0] : [-1, 1];
    const rearU = this.isBike ? -0.6 : -(this.vis.build.wheels ? Math.abs(Math.min(...this.vis.build.wheels.map((w) => w.u))) : L2 * 0.6);
    const halfTrack = this.isBike ? 0 : this.dims.W / 2 - 0.2;
    wheels.forEach((side, i) => {
      const wx = p.x + f.x * rearU + -f.z * halfTrack * side;
      const wz = p.z + f.z * rearU + f.x * halfTrack * side;
      if (skidding) {
        const last = this.lastSkid[i];
        if (last) fx.skids.add(last[0], last[1], wx, wz, this.isBike ? 0.12 : 0.24);
        this.lastSkid[i] = [wx, wz];
        if (Math.random() < 0.35 * this.skid + 0.05) fx.tireSmoke(wx, wz, 0.6 + this.skid * 0.8);
      } else this.lastSkid[i] = null;
    });
    // Riding on the rims.
    if (this.tires >= 2 && this.speed > 8 && !this.dead && Math.random() < 0.25) {
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.sparks(p.x - f.x * L2 * 0.5 + -f.z * side * this.dims.W * 0.45, 0.15, p.z - f.z * L2 * 0.5 + f.x * side * this.dims.W * 0.45, 2, 0.4);
    }
    // Exhaust puffs (junkers smoke like chimneys).
    if (this.def.kind !== 'bike' && !this.dead) {
      this.exhaustAcc += dt * (this.def.tier === 'junk' ? 6 : 2.5) * (0.4 + this.input.throttle);
      if (this.exhaustAcc > 1) {
        this.exhaustAcc = 0;
        fx.exhaust(p.x - f.x * (L2 + 0.1), 0.25, p.z - f.z * (L2 + 0.1), -f.x * 1.5 + this.vel.x * 0.5, -f.z * 1.5 + this.vel.y * 0.5, this.def.tier === 'junk');
      }
    }
    if (this.nitroT > 0) {
      for (let k = 0; k < 2; k++) fx.nitro(p.x - f.x * (L2 + 0.15), 0.3, p.z - f.z * (L2 + 0.15), -f.x * 8 + this.vel.x, -f.z * 8 + this.vel.y);
    }
    // Damage smoke / fire from the engine bay.
    const frac = this.hp / this.maxHp;
    if ((frac < 0.45 || this.dead) && !this.exploded || (this.exploded && this.burnLeft > 0)) {
      const hx = p.x + f.x * (L2 * 0.55), hz = p.z + f.z * (L2 * 0.55);
      const hy = (this.vis.build.lights?.hoodY ?? 0.9) + 0.1;
      this.smokeAcc += dt * (this.dead ? 22 : frac < 0.2 ? 14 : 7);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        fx.puff(hx, hy, hz, frac < 0.2 || this.dead ? 0.9 : 0.25, this.dead ? 1.4 : 1);
      }
      if (frac < 0.2 || this.dead) {
        const n = this.dead ? 4 : 1;
        for (let i = 0; i < n; i++) if (Math.random() < 0.8) fx.flame(hx, hy, hz, this.dead ? 1.6 : 0.8);
      }
    }
    if (this.exploded && this.burnLeft > 0) this.burnLeft -= dt;
  }

  char() {
    charCarMesh(this.group);
    this.burnLeft = 12;
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.group.removeFromParent();
    this.vis.tailMat.dispose();
    this.vis.driver.mat.dispose();
    if (this.lb) { this.lb.red.dispose(); this.lb.blue.dispose(); }
  }
}
