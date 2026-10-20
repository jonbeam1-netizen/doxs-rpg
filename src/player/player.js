import * as THREE from 'three';
import { createStickman, lookToStickman } from '../entities/stickman.js';
import { angleLerp, clamp, lerp } from '../core/util.js';

// Warm edge light that makes the local player pop out of a crowd of identical
// stick figures (strength is retuned every frame for day / night).
const PLAYER_RIM = { color: 0xffdcae, strength: 0.4 };

// Local player: on-foot movement, jumping, collisions, animation.
// While `vehicle` is set, the vehicle module drives and the stickman is hidden.
export class Player {
  constructor(game) {
    this.game = game;
    this.name = 'player';
    this.model = createStickman({ color: 0x101010, rim: PLAYER_RIM });
    this.group = this.model.group;
    game.scene.add(this.group);
    this.radius = 0.45;
    this.walkSpeed = 5.2;
    this.runSpeed = 9.5;
    this.speedMult = 1;       // drugs / items can tweak
    this.facing = 0;
    this.faceOverride = null; // combat sets a yaw to face while attacking
    this.vy = 0;
    this.vel = new THREE.Vector2();
    this.speed = 0;
    this.vehicle = null;
    this.dead = false;
    this.moveLocked = false;  // cutscenes, arrests, etc.
    this.aiming = false;      // combat sets when holding a gun
    this.combatMove = 1;      // combat slows you while blocking / charging
    this.dash = null;         // combat dodge roll: { x, z, speed, t } overrides steering while t > 0
    this.softFace = null;     // combat: a yaw to drift toward while standing still (nearest enemy in front)
    this.combatStance = 0;    // combat: 0..1 loose fight stance for the stick figure
    this.moveDir = { x: 0, z: 0, len: 0 }; // this frame's world-space steering input (unit, len 0 = none)

    // Soft light that follows the player so a black stick figure stays readable
    // against dark grimy walls and at night.
    this.glow = new THREE.PointLight(0xffe2b0, 6, 7, 1.6);
    this.glow.castShadow = false;
    game.scene.add(this.glow);

    // Outfit changes (clothing store, loading a save) rebuild the stick figure.
    // Anything attached to the old model (weapon meshes) should re-attach on 'player:model-rebuilt'.
    const rebuild = () => this.applyLook(game.state.p.look);
    game.bus.on('look:change', rebuild);
    game.bus.on('state:reset', rebuild);
  }

  applyLook(look = {}) {
    const old = this.model;
    const model = createStickman({ ...lookToStickman({ color: 0x101010, ...(look || {}) }), rim: PLAYER_RIM });
    model.group.position.copy(old.group.position);
    model.group.rotation.y = this.facing;
    model.group.visible = old.group.visible;
    this.game.scene.add(model.group);
    old.dispose();
    this.model = model;
    this.group = model.group;
    if (this.game.cameraRig?.target === old.group) this.game.cameraRig.target = model.group;
    this.game.bus.emit('player:model-rebuilt', { model });
  }

  get pos() { return this.group.position; }

  spawn(x, z, facing = 0) {
    this.group.position.set(x, 0, z);
    this.facing = facing;
    this.vy = 0;
    this.vel.set(0, 0);
    this.group.rotation.y = facing;
  }

  update(dt) {
    const g = this.game;
    const gp = this.vehicle ? this.vehicle.group.position : this.group.position;
    this.glow.position.set(gp.x, gp.y + 2.6, gp.z + 0.3);
    const dark = 1 - g.time.daylight;
    this.glow.intensity = this.vehicle ? 0 : 3 + 6 * dark;
    this.model.setRim?.(0.26 + 0.42 * dark);
    if (this.vehicle) { this.group.visible = false; return; }
    this.group.visible = true;

    const inp = g.input;
    let fx = 0, fz = 0;
    const canMove = !g.controlsLocked && !this.dead && !this.moveLocked;
    if (canMove) {
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) fz += 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) fz -= 1;
      if (inp.isDown('KeyA')) fx -= 1;
      if (inp.isDown('KeyD')) fx += 1;
    }
    const yaw = g.cameraRig.yaw;
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
    let mx = fwdX * fz + rX * fx, mz = fwdZ * fz + rZ * fx;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    this.moveDir.x = mx; this.moveDir.z = mz; this.moveDir.len = len > 0 ? 1 : 0;

    const running = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const perkMult = g.perks ? g.perks.mult(running ? 'runSpeed' : 'walkSpeed') : 1;
    const target = (running ? this.runSpeed : this.walkSpeed) * this.speedMult * perkMult * (this.aiming ? 0.6 : 1);
    const accel = 1 - Math.exp(-12 * dt);
    if (this.dash && this.dash.t > 0 && !this.dead) {
      this.dash.t -= dt;
      this.vel.set(this.dash.x * this.dash.speed, this.dash.z * this.dash.speed);
      if (this.dash.t <= 0) this.dash = null;
    } else {
      this.dash = null;
      this.vel.x = lerp(this.vel.x, mx * target * this.combatMove, accel);
      this.vel.y = lerp(this.vel.y, mz * target * this.combatMove, accel);
    }

    const p = this.group.position;
    const res = g.physics.resolveCircle(p.x + this.vel.x * dt, p.z + this.vel.y * dt, this.radius);
    p.x = res.x; p.z = res.z;
    this.speed = Math.hypot(this.vel.x, this.vel.y);

    // Jump + gravity (world is flat, ground at y = 0).
    if (canMove && inp.wasPressed('Space') && p.y <= 0.001) this.vy = 6.5;
    this.vy -= 20 * dt;
    p.y += this.vy * dt;
    if (p.y < 0) { p.y = 0; this.vy = 0; }

    // turning: snap-ish toward an attack direction, eased toward the steering direction, and a
    // lazy drift toward the nearest enemy in front while standing your ground
    if (this.faceOverride != null) this.facing = angleLerp(this.facing, this.faceOverride, 1 - Math.exp(-(this.aiming ? 20 : 16) * dt));
    else if (len > 0) this.facing = angleLerp(this.facing, Math.atan2(mx, mz), 1 - Math.exp(-(this.speed > 6 ? 9 : 12) * dt));
    else if (this.softFace != null) this.facing = angleLerp(this.facing, this.softFace, 1 - Math.exp(-5 * dt));
    this.group.rotation.y = this.facing;

    this.model.animate(dt, this.speed, { airborne: p.y > 0.05, aim: this.aiming, swingStyle: this.swingStyle, stance: this.combatStance });
  }
}

// Third-person orbit camera. Follows `target` (any Object3D).
export class CameraRig {
  constructor(game) {
    this.game = game;
    this.name = 'camera';
    this.yaw = Math.PI;      // camera sits behind a player facing +Z
    this.pitch = 0.32;
    this.dist = 7.5;
    this.minDist = 2.5;
    this.maxDist = 28;
    this.target = null;
    this.height = 1.6;
    this.distOverride = null;
    this.curDist = this.dist;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this._look = new THREE.Vector3();
    // Mouse sensitivity multiplier (1 = default) and invert-Y, set from the phone's Settings app.
    this.sensitivity = 1;
    this.invertY = false;
    try {
      const sv = Number(localStorage.getItem('doxsrpg_sens'));
      if (sv > 0) this.sensitivity = sv;
      this.invertY = localStorage.getItem('doxsrpg_invy') === '1';
    } catch { /* ignore */ }
    this._fly = 0;
    // Story-moment framing (src/present): { pos:{x,y,z}, look:{x,y,z}, w:0..1 }. w blends the
    // follow camera toward the framed shot; the present module eases w in and out.
    this.cine = null;
    this._cv = new THREE.Vector3();
  }

  setSensitivity(v) {
    this.sensitivity = clamp(Number(v) || 1, 0.2, 3);
    try { localStorage.setItem('doxsrpg_sens', String(this.sensitivity)); } catch { /* ignore */ }
  }

  setInvertY(on) {
    this.invertY = !!on;
    try { localStorage.setItem('doxsrpg_invy', on ? '1' : '0'); } catch { /* ignore */ }
  }

  // Slow moody flyover of the city while the title screen is up.
  _titleFlyover(dt) {
    const g = this.game, cam = g.camera;
    const b = g.world?.bounds || { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    // Orbit the mainland (bounds may stretch east to cover the island district).
    const maxX = Math.min(b.maxX, -b.minX);
    const cx = (b.minX + maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const r = Math.max(60, Math.min(maxX - b.minX, b.maxZ - b.minZ) * 0.22);
    this._fly += dt * 0.022;
    const t = this._fly;
    cam.position.set(cx + Math.sin(t) * r, 42 + Math.sin(t * 0.7) * 14, cz + Math.cos(t) * r);
    const lr = r * 0.35;
    this._look.set(cx + Math.sin(t + 1.1) * lr, 4, cz + Math.cos(t + 1.1) * lr);
    cam.lookAt(this._look);
  }

  follow(obj, { height = 1.6, dist = null } = {}) {
    this.target = obj;
    this.height = height;
    this.distOverride = dist;
  }

  shake(amount = 0.3, time = 0.25) { this.shakeAmp = amount; this.shakeT = time; }

  get forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  update(dt) {
    const g = this.game, inp = g.input;
    if (!g.started) { this._titleFlyover(dt); return; }
    if (!g.controlsLocked) {
      const sens = 0.0028 * this.sensitivity;
      this.yaw -= inp.mouse.dx * sens;
      this.pitch = clamp(this.pitch + inp.mouse.dy * sens * (this.invertY ? -1 : 1), -0.15, 1.35);
      if (inp.isDown('ArrowLeft')) this.yaw += 2.2 * dt;
      if (inp.isDown('ArrowRight')) this.yaw -= 2.2 * dt;
      if (inp.mouse.wheel) this.dist = clamp(this.dist + inp.mouse.wheel * 1.2, this.minDist, this.maxDist);
    }
    const t = this.target;
    if (!t) return;
    const tp = t.position;
    // Teleports / target swaps snap; otherwise the look point eases vertically so
    // jumps, curbs and car suspension don't jitter the whole view.
    const jumped = this._lt !== t || !this._lp || Math.hypot(tp.x - this._lp.x, tp.z - this._lp.z) > 12;
    if (jumped) { this._lt = t; this._lp = { x: tp.x, z: tp.z }; this._ly = tp.y; this.lift = 0; this._ceil = null; this.curDist = this.distOverride ?? this.dist; }
    this._lp.x = tp.x; this._lp.z = tp.z;
    const inCar = t !== g.player?.group;
    this._ly += (tp.y - this._ly) * (1 - Math.exp(-(inCar ? 9 : 22) * dt));
    const look = this._look.set(tp.x, this._ly + this.height, tp.z);
    const want = this.distOverride ?? this.dist;

    // When the camera is squeezed (back to a wall, tight alley) it rises over the
    // player's shoulder instead of burying itself in the wall behind them.
    const lift = this.lift ?? 0;
    const pitch = this.pitch + lift * Math.max(0, 1.25 - this.pitch);
    const cp = Math.cos(pitch);
    const dx = Math.sin(this.yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(this.yaw) * cp;
    const d = this._probe(look, dx, dy, dz, want);
    let dBase = d;
    if (lift > 0.01) { const cb = Math.cos(this.pitch); dBase = this._probe(look, Math.sin(this.yaw) * cb, Math.sin(this.pitch), Math.cos(this.yaw) * cb, want); }
    let liftWant = want > 2.4 ? clamp((2.4 - dBase) / 1.4, 0, 1) : 0;
    // Under a ceiling (gas canopy, overpass, porch roof) rising only buries the camera in it and ends in a
    // top-down view of the player's scalp: if the lifted ray is shorter than the level one, settle back down.
    // (remembered until the player moves on a couple of metres, so it can't flutter frame to frame)
    if (lift > 0.01 && d < dBase - 0.25) this._ceil = { x: tp.x, z: tp.z };
    if (this._ceil && Math.hypot(tp.x - this._ceil.x, tp.z - this._ceil.z) > 2.5) this._ceil = null;
    const ceiling = !!this._ceil;
    if (ceiling) liftWant = 0;
    this.lift = lift + (liftWant - lift) * (1 - Math.exp(-(liftWant > lift ? 6 : ceiling ? 8 : 2.5) * dt));
    // pull in instantly (never show the inside of a wall), ease back out
    this.curDist = d < this.curDist ? d : lerp(this.curDist, d, 1 - Math.exp(-3.2 * dt));

    const cam = g.camera;
    const P = this._pp || (this._pp = [0, 0, 0]);
    P[0] = look.x + dx * this.curDist; P[1] = Math.max(0.35, look.y + dy * this.curDist); P[2] = look.z + dz * this.curDist;
    // slide around poles, posts and braces instead of sitting inside them
    try { g.world?.camPushOut?.(P[0], P[1], P[2], 0.24, P); } catch { /* ignore */ }
    cam.position.set(P[0], P[1], P[2]);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 4;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
    const cine = this.cine;
    const cw = cine && cine.w > 0.0005 ? Math.min(1, cine.w) : 0;
    if (cw) {
      cam.position.lerp(this._cv.set(cine.pos.x, cine.pos.y, cine.pos.z), cw);
      look.lerp(this._cv.set(cine.look.x, cine.look.y, cine.look.z), cw);
    }
    cam.lookAt(look);
    // a camera squeezed right up against the player fades them out instead of
    // filling the screen with the back of their head
    if (cw > 0.05 && !inCar) { try { g.player?.model?.setOpacity?.(1); } catch { /* ignore */ } }
    else if (!inCar) {
      const near = cam.position.distanceTo(look);
      try { g.player?.model?.setOpacity?.(clamp((near - 0.55) / 0.9, 0.12, 1)); } catch { /* ignore */ }
    }
  }

  // Free distance (m) along a direction from the look point: visible geometry
  // (world camera colliders) plus physics boxes tall enough at that height.
  _probe(look, dx, dy, dz, want) {
    const g = this.game, ph = g.physics;
    let f = 1;
    try { if (g.world?.camCast) f = g.world.camCast(look.x, look.y, look.z, look.x + dx * want, look.y + dy * want, look.z + dz * want, 0.28); } catch { /* ignore */ }
    const n = Math.max(1, Math.ceil(want * f / 0.3));
    for (let i = 1; i <= n; i++) {
      const s = (i / n) * want * f;
      const x = look.x + dx * s, y = look.y + dy * s, z = look.z + dz * s;
      // look a little beyond the sample so the near plane stays clear of the wall
      const b = ph.pointBlocked(x + dx * 0.25, z + dz * 0.25, Math.max(0, y - 0.3));
      if (!b || b.tag === 'water') continue;
      if (b.maxX - b.minX < 0.8 && b.maxZ - b.minZ < 0.8) continue; // poles: handled by camPushOut
      f = Math.min(f, ((i - 1) / n) * f);
      break;
    }
    return Math.max(0.3, want * f - 0.12);
  }
}
