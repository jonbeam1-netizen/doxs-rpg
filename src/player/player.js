import * as THREE from 'three';
import { createStickman } from '../entities/stickman.js';
import { angleLerp, clamp, lerp } from '../core/util.js';

// Local player: on-foot movement, jumping, collisions, animation.
// While `vehicle` is set, the vehicle module drives and the stickman is hidden.
export class Player {
  constructor(game) {
    this.game = game;
    this.name = 'player';
    this.model = createStickman({ color: 0x101010 });
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

    // Outfit changes (clothing store, loading a save) rebuild the stick figure.
    // Anything attached to the old model (weapon meshes) should re-attach on 'player:model-rebuilt'.
    const rebuild = () => this.applyLook(game.state.p.look);
    game.bus.on('look:change', rebuild);
    game.bus.on('state:reset', rebuild);
  }

  applyLook(look = {}) {
    const old = this.model;
    const model = createStickman({
      color: look.color ?? 0x101010,
      hat: look.hat ?? null,
      hatColor: look.hatColor ?? 0x2a2420,
    });
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

    const running = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const target = (running ? this.runSpeed : this.walkSpeed) * this.speedMult * (this.aiming ? 0.6 : 1);
    const accel = 1 - Math.exp(-12 * dt);
    this.vel.x = lerp(this.vel.x, mx * target, accel);
    this.vel.y = lerp(this.vel.y, mz * target, accel);

    const p = this.group.position;
    const res = g.physics.resolveCircle(p.x + this.vel.x * dt, p.z + this.vel.y * dt, this.radius);
    p.x = res.x; p.z = res.z;
    this.speed = Math.hypot(this.vel.x, this.vel.y);

    // Jump + gravity (world is flat, ground at y = 0).
    if (canMove && inp.wasPressed('Space') && p.y <= 0.001) this.vy = 6.5;
    this.vy -= 20 * dt;
    p.y += this.vy * dt;
    if (p.y < 0) { p.y = 0; this.vy = 0; }

    if (this.faceOverride != null) this.facing = angleLerp(this.facing, this.faceOverride, 1 - Math.exp(-20 * dt));
    else if (len > 0) this.facing = angleLerp(this.facing, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    this.group.rotation.y = this.facing;

    this.model.animate(dt, this.speed, { airborne: p.y > 0.05, aim: this.aiming, swingStyle: this.swingStyle });
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
    if (!g.controlsLocked) {
      const sens = 0.0028;
      this.yaw -= inp.mouse.dx * sens;
      this.pitch = clamp(this.pitch + inp.mouse.dy * sens, -0.15, 1.35);
      if (inp.isDown('ArrowLeft')) this.yaw += 2.2 * dt;
      if (inp.isDown('ArrowRight')) this.yaw -= 2.2 * dt;
      if (inp.mouse.wheel) this.dist = clamp(this.dist + inp.mouse.wheel * 1.2, this.minDist, this.maxDist);
    }
    const t = this.target;
    if (!t) return;
    const look = this._look.set(t.position.x, t.position.y + this.height, t.position.z);
    const want = this.distOverride ?? this.dist;
    const dx = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * Math.cos(this.pitch);

    // Pull the camera in when a building is between it and the target.
    let d = want;
    const frac = g.physics.raycast(look.x, look.z, look.x + dx * want, look.z + dz * want, 0.4, look.y + dy * want);
    if (frac < 1) d = Math.max(1.5, want * frac - 0.4);
    this.curDist = d < this.curDist ? d : lerp(this.curDist, d, 1 - Math.exp(-4 * dt));

    const cam = g.camera;
    cam.position.set(look.x + dx * this.curDist, Math.max(0.4, look.y + dy * this.curDist), look.z + dz * this.curDist);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 4;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
    cam.lookAt(look);
  }
}
