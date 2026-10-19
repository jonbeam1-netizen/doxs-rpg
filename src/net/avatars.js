import * as THREE from 'three';
import { createStickman, lookToStickman } from '../entities/stickman.js';
import { angleLerp, clamp } from '../core/util.js';
import { WEAPONS } from '../data/weapons.js';
import { makeNameTag, makeBubble } from './labels.js';

// Remote co-op players: stick figures (or their cars) driven by 'ps' packets,
// plus emote poses and speech bubbles (also used on the local player).

export const EMOTES = {
  wave: { dur: 2.2, verb: 'waves', barks: ['Yo!', 'Over here, dumbass!', 'Sup.', "Hi. Don't make it weird."] },
  dance: { dur: 3.6, verb: 'busts a move', barks: ['Watch these hips, Rotwell.', 'Uh, uh, UH.', 'Dance like the rent is due.', 'I learned this in county.'] },
  flip: { dur: 0.95, verb: 'does a sick backflip', barks: ['PARKOUR!', 'Ten out of ten.', 'My spine said no.', 'Nailed it. Kinda.'] },
};

// Overlay an emote pose on a stickman AFTER its animate() ran this frame.
export function poseEmote(model, em) {
  const { armL, armR, legL, legR, hips, torso } = model.parts;
  const t = em.t;
  if (em.kind === 'wave') {
    armR.upper.rotation.set(0, 0, -2.75);
    armR.lower.rotation.set(0, 0, Math.sin(t * 14) * 0.55);
  } else if (em.kind === 'dance') {
    const b = Math.sin(t * 9);
    hips.position.y = 0.95 + Math.abs(b) * 0.12;
    armL.upper.rotation.set(0, 0, 2.3 + b * 0.5);
    armL.lower.rotation.set(0, 0, 0.5 * b);
    armR.upper.rotation.set(0, 0, -2.3 + b * 0.5);
    armR.lower.rotation.set(0, 0, 0.5 * b);
    torso.rotation.y = Math.sin(t * 4.5) * 0.5;
    legL.upper.rotation.x = -Math.max(0, b) * 0.8;
    legR.upper.rotation.x = -Math.max(0, -b) * 0.8;
    legL.lower.rotation.x = Math.max(0, b) * 1.3;
    legR.lower.rotation.x = Math.max(0, -b) * 1.3;
  } else if (em.kind === 'flip') {
    const k = clamp(t / EMOTES.flip.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    const th = -e * Math.PI * 2;
    model.body.rotation.x = th;
    // rotate around the hips instead of the feet, plus a hop
    model.body.position.set(0, 0.95 * (1 - Math.cos(th)) + Math.sin(k * Math.PI) * 1.3, -0.95 * Math.sin(th));
    legL.upper.rotation.x = -1.3; legR.upper.rotation.x = -1.3;
    legL.lower.rotation.x = 2.0; legR.lower.rotation.x = 2.0;
    armL.upper.rotation.set(-2.6, 0, 0.3); armR.upper.rotation.set(-2.6, 0, -0.3);
  }
}

// Undo the bits of an emote pose that animate() doesn't reset on its own.
export function endEmote(model) {
  const { armL, armR } = model.parts;
  armL.lower.rotation.set(armL.lower.rotation.x, 0, 0);
  armR.lower.rotation.set(armR.lower.rotation.x, 0, 0);
  if (!model.dead) { model.body.rotation.x = 0; model.body.position.set(0, 0, 0); }
}

const lookKey = (l) => `${l?.color ?? ''}|${l?.hat ?? ''}|${l?.hatColor ?? ''}|${l?.skin ?? ''}|${l?.build ?? ''}`;

let gunGeo, gunMat, goldMat, clubGeo, clubMat;
function weaponMesh(id) {
  const w = WEAPONS[id];
  if (!w || id === 'fists' || id === 'brass') return null;
  if (w.kind === 'gun') {
    gunGeo ||= new THREE.BoxGeometry(0.07, 0.3, 0.13).translate(0, -0.1, 0.03);
    gunMat ||= new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.6, roughness: 0.4 });
    goldMat ||= new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.35 });
    return new THREE.Mesh(gunGeo, id === 'goldengun' ? goldMat : gunMat);
  }
  clubGeo ||= new THREE.CylinderGeometry(0.03, 0.045, 0.75, 6).translate(0, -0.33, 0);
  clubMat ||= new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 });
  return new THREE.Mesh(clubGeo, clubMat);
}

function fallbackCar(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color ?? 0x555555), roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), m); body.position.y = 0.6; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2), m); cab.position.set(0, 1.2, -0.2); g.add(cab);
  return g;
}

export class Avatars {
  constructor(game) {
    this.game = game;
    this.map = game.net.remotePlayers;
    this.bubbles = [];
    this.localEmote = null;
    this._v = new THREE.Vector3();
  }

  // ---------------- remote players ----------------
  get(id) { return this.map.get(id); }

  ensure(id, name = 'Stranger') {
    let rp = this.map.get(id);
    if (rp) return rp;
    const root = new THREE.Group();
    root.name = 'remote:' + id;
    this.game.scene.add(root);
    const tag = makeNameTag();
    tag.sprite.position.y = 2.45;
    root.add(tag.sprite);
    rp = {
      id, name, group: root, pos: root.position, facing: 0, hp: 100, maxHp: 100, vehicle: null,
      look: null, dead: false, weapon: 'fists', aiming: false, speed: 0, ping: null, lastSeen: performance.now(),
      _model: null, _tag: tag, _t: { x: 0, y: 0, z: 0, f: 0 }, _last: { x: 0, z: 0 }, _vel: { x: 0, z: 0 }, _age: 0, _fresh: true,
      _cars: new Map(), _car: null, _carKey: null, _emote: null, _swing: null, _weaponMesh: null, _weaponId: null,
    };
    this._buildModel(rp, null);
    root.visible = false; // until the first state packet
    this.map.set(id, rp);
    return rp;
  }

  _buildModel(rp, look) {
    const old = rp._model;
    const model = createStickman(lookToStickman({ color: 0x141414, hatColor: 0x2a2420, ...(look || {}) }));
    if (old) { old.dispose(); }
    rp.group.add(model.group);
    rp._model = model;
    rp._lookKey = lookKey(look);
    rp._weaponId = null; rp._weaponMesh = null;
    if (rp.dead) model.setDead(true);
  }

  onState(id, m) {
    const rp = this.ensure(id, m.name);
    const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
    const x = num(m.x), y = num(m.y), z = num(m.z), f = num(m.f);
    const now = performance.now();
    const dtp = (now - rp.lastSeen) / 1000;
    const L = rp._last;
    const jump = Math.hypot(x - L.x, z - L.z);
    if (!rp._fresh && dtp > 0.02 && dtp < 0.5 && jump < 6) {
      rp._vel.x = clamp((x - L.x) / dtp, -45, 45);
      rp._vel.z = clamp((z - L.z) / dtp, -45, 45);
    } else { rp._vel.x = 0; rp._vel.z = 0; }
    L.x = x; L.z = z;
    rp._t.x = x; rp._t.y = y; rp._t.z = z; rp._t.f = f; rp._age = 0;
    rp.lastSeen = now;
    if (rp._fresh) {
      rp._fresh = false;
      rp.group.position.set(x, y, z);
      rp.facing = f;
      rp.group.visible = true;
    }
    if (typeof m.name === 'string') rp.name = m.name.slice(0, 16) || rp.name;
    rp.speed = clamp(num(m.s), 0, 80);
    rp.aiming = !!m.a;
    rp.hp = num(m.hp, rp.hp);
    rp.maxHp = Math.max(1, num(m.maxHp, rp.maxHp));
    rp.weapon = typeof m.w === 'string' ? m.w : 'fists';
    rp.vehicle = m.v && typeof m.v === 'object' ? m.v : null;
    const look = m.look && typeof m.look === 'object' ? m.look : null;
    if (lookKey(look) !== rp._lookKey) { rp.look = look; this._buildModel(rp, look); }
    const dead = !!m.d;
    if (dead !== rp.dead) {
      rp.dead = dead;
      rp._emote = null;
      endEmote(rp._model);
      rp._model.setDead(dead);
    }
  }

  punch(id, m) {
    const rp = this.map.get(id);
    if (!rp || rp.dead || rp.vehicle) return;
    rp._swing = typeof m.ss === 'string' && /^[a-z_]{1,16}$/.test(m.ss) ? m.ss : null;
    rp._model.punch(clamp(Number(m.d) || 0.28, 0.1, 1.2));
  }

  emote(id, kind) {
    if (!EMOTES[kind]) return;
    if (id === 'local') { this.localEmote = { kind, t: 0 }; return; }
    const rp = this.map.get(id);
    if (!rp || rp.dead || rp.vehicle) return;
    if (rp._emote) endEmote(rp._model);
    rp._emote = { kind, t: 0 };
  }

  remove(id) {
    const rp = this.map.get(id);
    if (!rp) return;
    this.map.delete(id);
    for (const b of this.bubbles) if (b.owner === id) b.life = 0;
    rp._tag.dispose();
    rp._model?.dispose();
    for (const car of rp._cars.values()) car.removeFromParent();
    rp.group.removeFromParent();
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  _carFor(rp, v) {
    const carId = v.carId ?? v.id ?? v.type ?? 'car';
    const color = v.color ?? 0x555555;
    const key = `${carId}|${color}`;
    if (rp._carKey === key && rp._car) return rp._car;
    if (rp._car) rp._car.visible = false;
    let car = rp._cars.get(key);
    if (!car) {
      try { car = this.game.vehicles?.createCarMesh?.(carId, color) || null; } catch (e) { console.warn('[net] createCarMesh failed', e); car = null; }
      if (!car) car = fallbackCar(color);
      rp._cars.set(key, car);
      rp.group.add(car);
    }
    car.visible = true;
    rp._car = car; rp._carKey = key;
    return car;
  }

  _syncWeapon(rp) {
    const want = rp.vehicle || rp.dead ? null : rp.weapon;
    if (want === rp._weaponId) return;
    rp._weaponMesh?.removeFromParent();
    rp._weaponMesh = want ? weaponMesh(want) : null;
    if (rp._weaponMesh) rp._model.rightHand.add(rp._weaponMesh);
    rp._weaponId = want;
  }

  // ---------------- bubbles ----------------
  // owner: 'local' or a peer id. Replaces that owner's current bubble.
  bubble(owner, text, opts = {}) {
    if (!text) return;
    for (const b of this.bubbles) if (b.owner === owner) b.life = Math.min(b.life, 0);
    const bub = makeBubble(String(text).slice(0, 140), opts);
    this.game.scene.add(bub.sprite);
    this.bubbles.push({ owner, bub, life: opts.ms ? opts.ms / 1000 : 4.5, age: 0 });
  }

  _ownerPos(owner) {
    const g = this.game;
    if (owner === 'local') {
      const p = g.player;
      if (!p) return null;
      const veh = p.vehicle;
      const src = veh?.group?.position || p.group.position;
      return this._v.set(src.x, src.y + (veh ? 2.4 : 2.65), src.z);
    }
    const rp = this.map.get(owner);
    if (!rp) return null;
    return this._v.set(rp.pos.x, rp.pos.y + (rp.vehicle ? 2.6 : 2.85), rp.pos.z);
  }

  // ---------------- per frame ----------------
  update(dt) {
    const now = performance.now();
    for (const rp of [...this.map.values()]) {
      try { this._updateOne(rp, dt, now); } catch (e) {
        if (!rp._err) { console.error('[net] avatar update failed', e); rp._err = true; }
      }
    }
    this._updateLocalEmote(dt);
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.age += dt;
      const pos = this._ownerPos(b.owner);
      if (b.age >= b.life || !pos) { b.bub.dispose(); this.bubbles.splice(i, 1); continue; }
      b.bub.sprite.position.copy(pos);
      b.bub.mat.opacity = Math.min(1, (b.life - b.age) / 0.4, b.age / 0.12);
    }
  }

  _updateOne(rp, dt, now) {
    if (rp._fresh) return;
    const t = rp._t;
    // a little dead-reckoning between packets (max ~0.2 s), then smooth toward the target
    if (rp._age < 0.2) { t.x += rp._vel.x * dt; t.z += rp._vel.z * dt; }
    rp._age += dt;
    const p = rp.group.position;
    const dx = t.x - p.x, dz = t.z - p.z;
    if (dx * dx + dz * dz > 30 * 30) p.set(t.x, t.y, t.z);
    else {
      const k = 1 - Math.exp(-14 * dt);
      p.x += dx * k; p.z += dz * k; p.y += (t.y - p.y) * k;
    }
    rp.facing = angleLerp(rp.facing, t.f, 1 - Math.exp(-14 * dt));
    rp.group.rotation.y = rp.facing;

    const model = rp._model;
    if (rp.vehicle) {
      model.group.visible = false;
      this._carFor(rp, rp.vehicle);
      rp._tag.sprite.position.y = 2.9;
      if (rp._emote) { endEmote(model); rp._emote = null; }
    } else {
      if (rp._car) { rp._car.visible = false; rp._car = null; rp._carKey = null; }
      model.group.visible = true;
      rp._tag.sprite.position.y = 2.45;
      const moving = rp._age < 0.5 ? rp.speed : 0;
      model.animate(dt, moving, { aim: rp.aiming, airborne: p.y > 0.05, swingStyle: rp._swing });
      if (rp._emote && !rp.dead) {
        rp._emote.t += dt;
        if (rp._emote.t >= EMOTES[rp._emote.kind].dur) { endEmote(model); rp._emote = null; } else poseEmote(model, rp._emote);
      }
    }
    this._syncWeapon(rp);
    rp.ping = this.game.net.ping?.get?.(rp.id) ?? null;
    rp._tag.set(rp.name, rp.hp, rp.maxHp, { dead: rp.dead, host: rp.id === this.game.net.hostId });
    // forget ghosts that went silent for a long time without a proper goodbye
    if (now - rp.lastSeen > 45000) this.remove(rp.id);
  }

  _updateLocalEmote(dt) {
    const em = this.localEmote;
    if (!em) return;
    const pl = this.game.player;
    const model = pl?.model;
    if (!model) { this.localEmote = null; return; }
    if (pl.vehicle || pl.dead || model.dead || em.model && em.model !== model) {
      if (em.model === model) endEmote(model);
      this.localEmote = null;
      return;
    }
    em.model = model;
    em.t += dt;
    if (em.t >= EMOTES[em.kind].dur) { endEmote(model); this.localEmote = null; return; }
    poseEmote(model, em);
  }
}
