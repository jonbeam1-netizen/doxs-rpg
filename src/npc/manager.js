import * as THREE from 'three';
import { createStickman } from '../entities/stickman.js';
import { clamp, rand, pick, chance, angleLerp } from '../core/util.js';
import { weaponDef, weaponMesh, MUZZLE } from './weapons-mesh.js';
import { genName, line, HURT, FLEE, TAUNTS, COP_YELL, WARNINGS } from './names.js';

// Per-role defaults. `role` refines `kind` (e.g. kind 'ped' + role 'snob').
export const ROLES = {
  ped:     { kind: 'ped',    hp: 40,  walk: 1.5, run: 6.0, fight: 0.15, dmg: 0.55, colors: ['#1a1a1a', '#2b2b33', '#3a2e26', '#2d3a2a', '#3b2a33', '#26303a', '#40342e', '#4a3f35'], hats: [null, null, null, 'cap', 'beanie', 'fedora'] },
  worker:  { kind: 'ped',    hp: 55,  walk: 1.6, run: 6.2, fight: 0.45, dmg: 0.65, colors: ['#4a3b1c', '#3a3f2a', '#2f2f2f'], hats: ['hardhat', 'hardhat', 'cap'], hatColors: ['#c9a227', '#d0731a', '#c9a227'] },
  snob:    { kind: 'ped',    hp: 30,  walk: 1.3, run: 5.5, fight: 0.05, dmg: 0.4,  colors: ['#d8d0c0', '#8c8270', '#6b6b75', '#7a1f2b'], hats: ['tophat', 'fedora', null], hatColors: ['#141414', '#e6dfcf'] },
  shady:   { kind: 'ped',    hp: 45,  walk: 1.2, run: 6.5, fight: 0.5,  dmg: 0.6,  colors: ['#1b1b1b', '#2a2420'], hats: ['fedora'], hatColors: ['#161210'], weapons: ['knife'] },
  hobo:    { kind: 'hobo',   hp: 35,  walk: 0.9, run: 4.5, fight: 0.3,  dmg: 0.5,  colors: ['#4a4030', '#3d3628', '#52473a'], hats: ['beanie', 'beanie', null], hatColors: ['#5a2a1a', '#3a4a2a'] },
  drunk:   { kind: 'drunk',  hp: 50,  walk: 1.1, run: 4.6, fight: 0.85, dmg: 0.55, colors: ['#3a3a52', '#4a2a2a', '#2a3a3a'], hats: [null, 'cap'], weapons: ['fists', 'fists', 'bottle'], nonLethal: true },
  thug:    { kind: 'thug',   hp: 70,  walk: 1.6, run: 6.6, fight: 1,    dmg: 0.6,  colors: ['#3a0f0f', '#1a1414', '#2a1a10'], hats: ['beanie', 'cap', null], hatColors: ['#111', '#5a0a0a'], weapons: ['fists', 'knife', 'bat', 'bottle', 'knife', 'pistol'] },
  gang:    { kind: 'gang',   hp: 80,  walk: 1.6, run: 6.8, fight: 1,    dmg: 0.62, colors: ['#2f3d14'], hats: ['beanie'], weapons: ['knife', 'bat', 'fists', 'pistol'] },
  cop:     { kind: 'cop',    hp: 90,  walk: 1.6, run: 7.4, fight: 1,    dmg: 0.6,  colors: ['#1d2a4a'], hats: ['cop'], hatColors: ['#141c30'], weapons: ['baton'] },
  swat:    { kind: 'cop',    hp: 170, walk: 1.8, run: 7.0, fight: 1,    dmg: 0.55, colors: ['#0c0c10'], hats: ['hardhat'], hatColors: ['#0a0a0a'], weapons: ['smg'] },
  fighter: { kind: 'fighter', hp: 80, walk: 1.6, run: 6.4, fight: 1,    dmg: 0.7,  colors: ['#5a1a12', '#3a2a1a', '#1a1a1a'], hats: [null], weapons: ['fists'], nonLethal: true },
  dealer:  { kind: 'dealer', hp: 60,  walk: 1.0, run: 6.5, fight: 1,    dmg: 0.6,  colors: ['#22201c'], hats: ['cap', 'fedora', 'beanie'], hatColors: ['#a5c234', '#161210'], weapons: ['knife'] },
  static:  { kind: 'static', hp: 100, walk: 1.2, run: 5,   fight: 0,    dmg: 0.5,  colors: ['#1a1a1a'], hats: [null] },
};
export const FACTIONS = {
  rats:      { name: 'Gutter Rats', color: '#2f3d14', hat: 'beanie', hatColor: '#6a8a1a' },
  syndicate: { name: 'Velvet Syndicate', color: '#2a1030', hat: 'fedora', hatColor: '#141414' },
  bikers:    { name: 'Dustbowl Bikers', color: '#3b2a1a', hat: 'cap', hatColor: '#111111', weapons: ['crowbar', 'bat', 'knife', 'fists'], scale: 1.12, hp: 95 },
};

let nextId = 1;
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

export class NPCManager {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.map = new Map();
    this.snapSeq = 0;
    this.t = 0;
  }

  // ------------------------------------------------------------ public API
  spawn(spec = {}) {
    try { return this._spawn(spec); } catch (e) { console.error('[npc] spawn failed', spec, e); return null; }
  }

  _spawn(spec) {
    const g = this.game;
    const kind = spec.kind || (spec.role && ROLES[spec.role]?.kind) || 'ped';
    const role = spec.role || kind;
    const R = ROLES[role] || ROLES[kind] || ROLES.ped;
    const fac = spec.faction ? FACTIONS[spec.faction] : null;
    const id = spec.id ?? ('n' + (nextId++) + (g.net?.isAuthority ? '' : 'c'));
    if (this.map.has(id)) this.remove(id);

    const color = spec.color ?? fac?.color ?? pick(R.colors);
    const hat = spec.hat !== undefined ? spec.hat : (fac?.hat ?? pick(R.hats));
    const hatColor = spec.hatColor ?? fac?.hatColor ?? (R.hatColors ? pick(R.hatColors) : pick(['#2a2420', '#3a2a1a', '#1a1a1a', '#4a1a1a', '#2a3a4a']));
    const scale = spec.scale ?? fac?.scale ?? (role === 'fighter' ? rand(1.05, 1.2) : rand(0.9, 1.1));
    const model = createStickman({ color, hat, hatColor, scale });
    const group = model.group;
    group.position.set(spec.x ?? 0, 0, spec.z ?? 0);
    group.rotation.y = spec.facing ?? Math.random() * TAU;
    g.scene.add(group);

    const weapons = fac?.weapons ?? R.weapons;
    const weapon = spec.weapon !== undefined ? spec.weapon : (weapons ? pick(weapons) : 'fists');
    const hp = spec.hp ?? Math.round((fac?.hp ?? R.hp) * rand(0.9, 1.1));
    const npc = {
      id, kind, role, faction: spec.faction || null,
      name: spec.name || genName(role === 'gang' && spec.faction === 'bikers' ? 'biker' : role),
      model, group, pos: group.position, facing: group.rotation.y,
      hp, maxHp: spec.maxHp ?? hp, dead: false, ko: false,
      hostile: !!spec.hostile, wander: spec.wander ?? (kind !== 'static' && kind !== 'dealer'),
      networked: !!spec.networked, persistent: !!spec.persistent, replica: !!spec._replica,
      data: spec.data || {}, spec,
      color, hat, hatColor, scale,
      weapon, weaponObj: null,
      R, nonLethal: spec.nonLethal ?? !!R.nonLethal, mortal: kind !== 'static' || !!spec.mortal,
      dmgMult: spec.dmgMult ?? R.dmg, walk: R.walk * rand(0.85, 1.15), run: (spec.runSpeed ?? R.run) * rand(0.92, 1.08),
      state: spec.hostile ? 'hunt' : (kind === 'static' || kind === 'dealer' ? 'idle' : 'wander'),
      stateT: 0, idleFor: rand(1, 4), target: null, goal: null, home: { x: spec.x ?? 0, z: spec.z ?? 0 }, leash: spec.leash ?? (kind === 'dealer' ? 6 : 0),
      vx: 0, vz: 0, kbx: 0, kbz: 0, speed: 0, radius: 0.4 * scale,
      cd: rand(0.3, 0.9), pendingHit: 0, stun: 0, knockdown: 0, avoidT: 0, avoidSign: 1, deadT: 0,
      acc: 0, near: true, dist: 0, losT: 0, sawPlayer: false, barkCd: rand(3, 10), punchSeq: 0, shotSeq: 0,
      brawlId: spec.brawlId ?? null, lastAttacker: null, giveUpT: 0, shadowOn: true, provoked: false,
      net: null,
      remove: () => this.remove(npc),
    };
    if (role === 'drunk') npc.drunkWobble = 0.1 + Math.random() * 6;
    this.map.set(id, npc);
    this._attachWeapon(npc);

    if (!npc.replica && kind !== 'static') this._addTalk(npc);
    else if (kind === 'static' && spec.onTalk) this._addTalk(npc);
    return npc;
  }

  get(id) { return this.map.get(id) || null; }
  list() { return [...this.map.values()]; }
  count(pred) { let n = 0; for (const v of this.map.values()) if (!pred || pred(v)) n++; return n; }

  near(x, z, r, includeDead = false) {
    const out = [];
    const r2 = r * r;
    for (const n of this.map.values()) {
      if (n.dead && !includeDead) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z;
      if (dx * dx + dz * dz <= r2) out.push(n);
    }
    return out;
  }

  remove(npcOrId) {
    const npc = typeof npcOrId === 'string' || typeof npcOrId === 'number' ? this.map.get(npcOrId) : npcOrId;
    if (!npc || !this.map.has(npc.id)) return;
    this.map.delete(npc.id);
    this.game.interact.remove('npc:' + npc.id);
    try { npc.model.dispose(); } catch { npc.group.removeFromParent(); }
    npc.removed = true;
  }

  // Damage from anyone. attackerId: 'local' (this machine's player), a peer id, or an npc id.
  // Returns { dealt, killed } (on clients, for networked NPCs, killed is a guess).
  damage(id, amount, attackerId = 'local', opts = {}) {
    const npc = typeof id === 'object' ? id : this.map.get(id);
    if (!npc || npc.dead) return { dealt: 0, killed: false };
    const net = this.game.net;
    if (npc.networked && !net.isAuthority) {
      // Show feedback now, let the host decide the outcome.
      this._hitFeedback(npc, amount, opts, attackerId === 'local');
      try { net.sendToHost({ t: 'npc:damage', id: npc.id, dmg: Math.round(amount), kx: opts.dir?.x ?? 0, kz: opts.dir?.z ?? 0, heavy: !!opts.heavy, kb: opts.kb ?? 0 }); } catch { /* ignore */ }
      npc.predictedHp = (npc.predictedHp ?? npc.hp) - amount;
      return { dealt: amount, killed: npc.predictedHp <= 0 };
    }
    return this._applyDamage(npc, amount, attackerId, opts);
  }

  // ------------------------------------------------------------ talk hookup
  _addTalk(npc) {
    const g = this.game;
    g.interact.add({
      id: 'npc:' + npc.id,
      radius: 2.3,
      getPos: () => (npc.dead || npc.removed ? null : npc.pos),
      prompt: () => npc.spec.talkPrompt || (npc.kind === 'dealer' ? `Talk to ${npc.name} <small>(dealer)</small>` : `Talk to ${npc.name}`),
      enabled: () => !npc.dead && !npc.hostile && !npc.knockdown && npc.state !== 'flee' && npc.state !== 'warn',
      onInteract: () => this.ctx.talk?.talk(npc),
    });
  }

  // ------------------------------------------------------------ weapons
  _attachWeapon(npc) {
    if (npc.weaponObj) { npc.weaponObj.removeFromParent(); npc.weaponObj = null; }
    const m = weaponMesh(npc.weapon);
    if (m) { npc.model.rightHand.add(m); npc.weaponObj = m; }
    npc.wdef = weaponDef(npc.weapon);
  }

  setWeapon(npc, id) { npc.weapon = id; this._attachWeapon(npc); }

  // ------------------------------------------------------------ damage
  _hitFeedback(npc, amount, opts, local) {
    const fx = this.ctx.fx;
    npc.model.flash();
    const dir = opts.dir || null;
    const amt = clamp(amount / 20, 0.5, 2.5);
    fx.blood(npc.pos.x, npc.pos.z, amt, dir, 1.1 * npc.scale);
    if (opts.heavy && chance(0.35)) fx.tooth(npc.pos.x, 1.4 * npc.scale, npc.pos.z, dir);
    if (local) fx.number(npc.pos.x, 2.1 * npc.scale, npc.pos.z, String(Math.round(amount)), amount >= 30 ? 'big' : '');
    if (dir) {
      const kb = opts.kb ?? 4;
      npc.kbx += dir.x * kb; npc.kbz += dir.z * kb;
    }
    if (chance(0.5)) fx.sfx.play('grunt', { pos: npc.pos, vol: 0.7 });
  }

  _applyDamage(npc, amount, attackerId, opts = {}) {
    if (npc.dead) return { dealt: 0, killed: false };
    const fx = this.ctx.fx;
    if (!npc.mortal) {
      npc.model.flash();
      if (npc.barkCd <= 0) { fx.say(npc.group, pick(['Hey! Watch it!', 'Do you MIND?', 'I will sue you into the dirt.']), { kind: 'angry' }); npc.barkCd = 3; }
      return { dealt: 0, killed: false };
    }
    amount = Math.max(0, amount);
    npc.hp -= amount;
    npc.predictedHp = undefined;
    npc.lastAttacker = attackerId;
    this._hitFeedback(npc, amount, opts, attackerId === 'local');
    npc.stun = Math.max(npc.stun, opts.heavy ? 0.45 : 0.25);
    npc.pendingHit = 0; // interrupt their swing — combos feel good
    if (npc.hp <= 0) {
      this._kill(npc, attackerId, opts);
      return { dealt: amount, killed: true };
    }
    if (opts.heavy && amount >= 18 && chance(0.4)) {
      npc.knockdown = 1.2;
      npc.model.setDead(true);
    }
    if (npc.barkCd <= 0 && chance(0.4)) {
      fx.say(npc.group, pick(HURT), { ttl: 1.2, kind: 'angry' });
      npc.barkCd = 2.5;
    }
    this._provoke(npc, attackerId);
    return { dealt: amount, killed: false };
  }

  _targetFromAttacker(attackerId) {
    if (attackerId === 'local' || attackerId === this.game.net.localId) return { type: 'player' };
    if (this.game.net.remotePlayers?.has?.(attackerId)) return { type: 'remote', id: attackerId };
    return null;
  }

  _provoke(npc, attackerId) {
    const tgt = this._targetFromAttacker(attackerId);
    if (!tgt) return;
    const fx = this.ctx.fx;
    const lowHp = npc.hp < npc.maxHp * 0.3;
    if (npc.kind === 'cop' || npc.kind === 'static') {
      if (npc.kind === 'cop') this._goHostile(npc, tgt);
      return;
    }
    if (lowHp && !npc.brawlId && !npc.fleeRolled) {
      npc.fleeRolled = true;
      const p = npc.kind === 'ped' ? 0.9 : npc.kind === 'drunk' ? 0.5 : npc.kind === 'gang' ? 0.25 : 0.35;
      if (chance(p)) { this._flee(npc, tgt); return; }
    }
    if (lowHp && npc.brawlId && npc.kind === 'drunk' && !npc.fleeRolled) {
      npc.fleeRolled = true;
      if (chance(0.3)) { this._flee(npc, tgt); return; }
    }
    if (npc.hostile) { if (!npc.target || chance(0.5)) npc.target = tgt; return; }
    if (!npc.provoked) {
      npc.provoked = true;
      npc.willFight = chance(npc.R.fight);
    }
    if (npc.willFight) {
      this._goHostile(npc, tgt);
      if (npc.barkCd <= 0) { fx.say(npc.group, pick(TAUNTS), { kind: 'angry' }); npc.barkCd = 3; }
    } else this._flee(npc, tgt);
    // gang members rally their homies
    if (npc.faction) {
      for (const o of this.near(npc.pos.x, npc.pos.z, 24)) {
        if (o !== npc && o.faction === npc.faction && !o.hostile && !o.replica) this._goHostile(o, tgt);
      }
    }
  }

  _goHostile(npc, tgt) {
    npc.hostile = true;
    npc.target = tgt;
    npc.state = 'chase';
    npc.stateT = 0;
    npc.giveUpT = 0;
    if (npc.wdef.kind !== 'gun' && npc.weapon === 'fists' && npc.kind === 'gang' && chance(0.3)) this.setWeapon(npc, pick(['knife', 'bat']));
  }

  _flee(npc, tgt) {
    npc.state = 'flee';
    npc.stateT = 0;
    npc.hostile = false;
    npc.fleeFrom = tgt;
    if (npc.barkCd <= 0) { this.ctx.fx.say(npc.group, pick(FLEE), { ttl: 1.8 }); npc.barkCd = 4; }
  }

  _kill(npc, attackerId, opts = {}) {
    const g = this.game;
    npc.dead = true;
    npc.hp = 0;
    npc.ko = npc.nonLethal;
    npc.state = 'dead';
    npc.deadT = 0;
    npc.knockdown = 0;
    npc.wasHostile = npc.hostile;
    npc.hostile = false;
    npc.model.setDead(true);
    npc.group.rotation.y += rand(-0.6, 0.6);
    g.interact.remove('npc:' + npc.id);
    this.ctx.fx.blood(npc.pos.x, npc.pos.z, 2.2, opts.dir || null, 0.4);
    if (npc.ko) this.ctx.fx.say(npc.group, pick(['zzz...', '*snore*', 'mommy...', '...ok you win']), { ttl: 2.5, height: 0.9 });
    try { this.ctx.combat?.onNpcDown(npc, attackerId, opts); } catch (e) { console.error('[npc] onNpcDown failed', e); }
  }

  // ------------------------------------------------------------ targets
  _targetPos(t) {
    if (!t) return null;
    const g = this.game;
    if (t.type === 'player') {
      const p = g.player;
      if (!p || p.dead || this.ctx.combat?.isDown) return null;
      return p.vehicle ? p.vehicle.group?.position ?? p.vehicle.pos ?? p.group.position : p.group.position;
    }
    if (t.type === 'remote') {
      const r = g.net.remotePlayers?.get?.(t.id);
      if (!r || r.dead || r.down || (r.hp != null && r.hp <= 0)) return null;
      return r.pos || r.group?.position || null;
    }
    if (t.type === 'npc') {
      const n = this.map.get(t.id);
      return n && !n.dead ? n.pos : null;
    }
    return null;
  }

  _targetInVehicle(t) {
    if (t?.type === 'player') return !!this.game.player?.vehicle;
    if (t?.type === 'remote') return !!this.game.net.remotePlayers?.get?.(t.id)?.vehicle;
    return false;
  }

  // Every player position this machine knows about (for authority AI).
  _players() {
    const g = this.game;
    const out = [];
    const p = g.player;
    if (p && !p.dead && !this.ctx.combat?.isDown) out.push({ t: { type: 'player' }, pos: p.vehicle ? (p.vehicle.group?.position ?? p.group.position) : p.group.position, inCar: !!p.vehicle });
    if (g.net.connected && g.net.isAuthority) {
      for (const [id, r] of g.net.remotePlayers || []) {
        const pos = r.pos || r.group?.position;
        if (pos && !r.dead && !r.down) out.push({ t: { type: 'remote', id }, pos, inCar: !!r.vehicle });
      }
    }
    return out;
  }

  los(ax, az, bx, bz) {
    return this.game.physics.raycast(ax, az, bx, bz, 0.8, 1.2) >= 1;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    this.t += dt;
    const lp = g.player?.group?.position;
    if (!lp) return;
    const cam = g.camera.position;
    const auth = g.net.isAuthority;
    const players = this._players();
    const active = this._active || (this._active = []);
    active.length = 0;

    for (const npc of this.map.values()) {
      try {
        const dx = npc.pos.x - lp.x, dz = npc.pos.z - lp.z;
        let d = Math.sqrt(dx * dx + dz * dz);
        npc.dist = d;
        // authority sims networked NPCs at full rate near ANY player
        let simD = d;
        if (npc.networked && players && players.length > 1) {
          for (const pl of players) simD = Math.min(simD, Math.hypot(npc.pos.x - pl.pos.x, npc.pos.z - pl.pos.z));
        }
        npc.barkCd -= dt;

        if (npc.replica) { this._updateReplica(npc, dt); }
        else if (npc.dead) { this._updateDead(npc, dt); }
        else {
          const interval = simD < 40 ? 0 : simD < 80 ? 0.1 : 0.3;
          npc.acc += dt;
          if (npc.acc >= interval) {
            const step = Math.min(npc.acc, 0.35);
            npc.acc = 0;
            this._think(npc, step, players);
            this._move(npc, step);
          }
          if (simD < 50) active.push(npc);
        }

        // render LOD
        const vis = d < 140;
        if (npc.group.visible !== vis) npc.group.visible = vis;
        if (vis && d < 75 && !npc.dead) {
          npc.model.animate(dt, npc.speed, { aim: npc.aiming, swingStyle: npc.wdef?.swing, airborne: false });
          if (npc.drunkWobble) npc.model.parts.hips.rotation.z = Math.sin(this.t * 2.3 + npc.drunkWobble) * 0.12;
        } else if (npc.dead) npc.model.animate(dt, 0, {});
        const wantShadow = d < 35;
        if (wantShadow !== npc.shadowOn) {
          npc.shadowOn = wantShadow;
          npc.group.traverse((o) => { if (o.isMesh) o.castShadow = wantShadow; });
        }
      } catch (e) {
        if (!npc._errLogged) { console.error('[npc] update failed', npc.id, e); npc._errLogged = true; }
      }
    }

    // separation between nearby NPCs
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = a.radius + b.radius + 0.1;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
      // and keep them out of the local player
      if (!g.player.vehicle && !g.player.dead) {
        const dx = a.pos.x - lp.x, dz = a.pos.z - lp.z;
        const rr = a.radius + 0.45;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          a.pos.x += (dx / d) * (rr - d); a.pos.z += (dz / d) * (rr - d);
        }
      }
    }
  }

  _updateDead(npc, dt) {
    npc.deadT += dt;
    npc.speed = 0;
    // sliding from the knockback
    if (Math.abs(npc.kbx) + Math.abs(npc.kbz) > 0.05) {
      const r = this.game.physics.resolveCircle(npc.pos.x + npc.kbx * dt, npc.pos.z + npc.kbz * dt, npc.radius);
      npc.pos.x = r.x; npc.pos.z = r.z;
      const f = Math.exp(-6 * dt);
      npc.kbx *= f; npc.kbz *= f;
    }
    if (npc.ko && !npc.networked && npc.deadT > 9 && !npc.gotUp) {
      // KO'd brawlers/drunks peel themselves off the floor and limp away
      npc.gotUp = true;
      npc.dead = false; npc.hp = Math.max(5, npc.maxHp * 0.15);
      npc.model.setDead(false);
      npc.hostile = false; npc.target = null; npc.brawlId = null;
      npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' };
      npc.leaving = true;
      this.ctx.fx.say(npc.group, pick(['I meant to do that.', 'This isn\'t over! ...it\'s over.', 'Where\'s my other shoe?']), { ttl: 2.5 });
      return;
    }
    if (npc.ko && npc.networked && npc.deadT > 9 && !npc.gotUp && this.game.net.isAuthority) {
      npc.gotUp = true;
      npc.dead = false; npc.hp = Math.max(5, npc.maxHp * 0.15);
      npc.model.setDead(false);
      npc.hostile = false; npc.target = null; npc.brawlId = null;
      npc.state = 'flee'; npc.stateT = 0; npc.leaving = true;
      return;
    }
    if (npc.deadT > 27) npc.group.position.y = -(npc.deadT - 27) * 0.25;
    if (npc.deadT > 30) this.remove(npc);
  }

  // ------------------------------------------------------------ brain
  _think(npc, dt, players) {
    const g = this.game;
    npc.stateT += dt;
    npc.aiming = false;
    if (npc.knockdown > 0) {
      npc.knockdown -= dt;
      npc.vx = npc.vz = 0;
      if (npc.knockdown <= 0) npc.model.setDead(false);
      return;
    }
    if (npc.stun > 0) { npc.stun -= dt; npc.vx *= 0.5; npc.vz *= 0.5; }
    npc.cd -= dt;

    // pending melee hit (wind-up finished?)
    if (npc.pendingHit > 0) {
      npc.pendingHit -= dt;
      if (npc.pendingHit <= 0) this._resolveNpcMelee(npc);
    }

    switch (npc.state) {
      case 'idle': this._sIdle(npc, dt, players); break;
      case 'wander': this._sWander(npc, dt, players); break;
      case 'warn': this._sWarn(npc, dt); break;
      case 'hunt': this._sHunt(npc, dt, players); break;
      case 'chase': this._sChase(npc, dt); break;
      case 'flee': this._sFlee(npc, dt); break;
      default: npc.state = 'idle';
    }
  }

  _sIdle(npc, dt, players) {
    npc.vx = npc.vz = 0;
    if (npc.hostile) { npc.state = 'hunt'; return; }
    if (npc.kind === 'dealer' || npc.kind === 'static') {
      // fidget & face the player when close
      const lp = this.game.player.group.position;
      if (npc.dist < 6) npc.faceTo = Math.atan2(lp.x - npc.pos.x, lp.z - npc.pos.z);
      if (npc.leash && npc.stateT > rand(4, 9)) {
        npc.stateT = 0;
        const a = Math.random() * TAU, r = Math.random() * npc.leash;
        npc.goal = { x: npc.home.x + Math.cos(a) * r, z: npc.home.z + Math.sin(a) * r };
        npc.state = 'wander';
      }
      if (npc.dist < 9 && npc.barkCd <= 0 && chance(0.02)) {
        this.ctx.fx.say(npc.group, npc.kind === 'dealer' ? pick(['Psst.', 'Psst! Over here.', 'You lookin\'?', 'Candy for grown-ups.']) : line(npc.role, npc.kind), { ttl: 2.2 });
        npc.barkCd = 12;
      }
      return;
    }
    if (npc.wander && npc.stateT > npc.idleFor) { npc.state = 'wander'; npc.stateT = 0; npc.goal = null; }
    this._maybeMug(npc, players);
  }

  _pickGoal(npc) {
    const g = this.game;
    const phys = g.physics;
    if (npc.leash) {
      const a = Math.random() * TAU, r = Math.random() * npc.leash;
      return { x: npc.home.x + Math.cos(a) * r, z: npc.home.z + Math.sin(a) * r };
    }
    // try a sidewalk point nearby; otherwise pick a clear direction
    const w = g.world;
    if (w?.randomSidewalkPoint && chance(0.6)) {
      for (let i = 0; i < 4; i++) {
        let p = null;
        try { p = w.randomSidewalkPoint(w.districtAt?.(npc.pos.x, npc.pos.z)); } catch { p = null; }
        if (p && Math.hypot(p.x - npc.pos.x, p.z - npc.pos.z) < 40 && this.los(npc.pos.x, npc.pos.z, p.x, p.z)) return p;
      }
    }
    for (let i = 0; i < 6; i++) {
      // prefer continuing roughly forward (people walk along sidewalks)
      const a = npc.facing + rand(-1.2, 1.2) + (i > 3 ? Math.PI : 0);
      const r = rand(8, 22);
      const x = npc.pos.x + Math.sin(a) * r, z = npc.pos.z + Math.cos(a) * r;
      if (!phys.pointBlocked(x, z) && this.los(npc.pos.x, npc.pos.z, x, z)) return { x, z };
    }
    return null;
  }

  _sWander(npc, dt, players) {
    if (npc.hostile) { npc.state = 'hunt'; return; }
    if (!npc.goal) {
      npc.goal = this._pickGoal(npc);
      if (!npc.goal) { npc.state = 'idle'; npc.stateT = 0; npc.idleFor = rand(1, 3); return; }
    }
    const dx = npc.goal.x - npc.pos.x, dz = npc.goal.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 || npc.stateT > 25 || npc.stuckT > 1.2) {
      npc.goal = null; npc.stuckT = 0;
      if (chance(0.45) || npc.leash) { npc.state = 'idle'; npc.stateT = 0; npc.idleFor = rand(1, 5); }
      return;
    }
    const sp = npc.walk * (npc.leaving ? 1.6 : 1);
    npc.vx = (dx / d) * sp; npc.vz = (dz / d) * sp;
    if (npc.barkCd <= 0 && npc.dist < 10 && chance(0.004)) {
      this.ctx.fx.say(npc.group, line(npc.role, npc.kind), { ttl: 2.6 });
      npc.barkCd = 15;
    }
    this._maybeMug(npc, players);
  }

  // Night-time muggers: pick a player, bark a warning, then attack.
  _maybeMug(npc, players) {
    if (!npc.data?.mugger || !players || npc.mugCd > this.t) return;
    for (const pl of players) {
      if (pl.inCar) continue;
      const d = Math.hypot(pl.pos.x - npc.pos.x, pl.pos.z - npc.pos.z);
      if (d < 13 && this.los(npc.pos.x, npc.pos.z, pl.pos.x, pl.pos.z)) {
        npc.state = 'warn';
        npc.stateT = 0;
        npc.target = pl.t;
        npc.mugCd = this.t + 40;
        this.ctx.fx.say(npc.group, pick(WARNINGS), { ttl: 2.6, kind: 'angry' });
        if (pl.t.type === 'player') this.ctx.fx.sfx.play('whoosh', { vol: 0.3 });
        return;
      }
    }
  }

  _sWarn(npc, dt) {
    const tp = this._targetPos(npc.target);
    if (!tp) { npc.state = 'wander'; npc.target = null; return; }
    const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    npc.faceTo = Math.atan2(dx, dz);
    // swagger closer
    if (d > 3) { npc.vx = (dx / d) * npc.walk * 1.3; npc.vz = (dz / d) * npc.walk * 1.3; } else { npc.vx = npc.vz = 0; }
    if (d > 26) { npc.state = 'wander'; npc.target = null; this.ctx.fx.say(npc.group, pick(['Yeah, run!', 'Next time, twig.']), { ttl: 2 }); return; }
    if (npc.stateT > 2.4) {
      this._goHostile(npc, npc.target);
      this.ctx.fx.say(npc.group, pick(TAUNTS), { ttl: 1.6, kind: 'angry' });
    }
  }

  _sHunt(npc, dt, players) {
    // hostile without a target: find the nearest player
    npc.vx = npc.vz = 0;
    if (!players || !players.length) return;
    let best = null, bd = Infinity;
    for (const pl of players) {
      const d = Math.hypot(pl.pos.x - npc.pos.x, pl.pos.z - npc.pos.z);
      if (d < bd) { bd = d; best = pl; }
    }
    const range = npc.brawlId ? 200 : npc.kind === 'cop' ? 120 : 22;
    if (best && bd < range) { npc.target = best.t; npc.state = 'chase'; npc.stateT = 0; }
    else if (!npc.brawlId && npc.kind !== 'cop' && npc.stateT > 8) {
      npc.hostile = false; npc.state = 'wander';
    }
  }

  _sChase(npc, dt) {
    const tp = this._targetPos(npc.target);
    const fx = this.ctx.fx;
    if (!tp) {
      npc.target = null;
      if (npc.brawlId || npc.kind === 'cop') { npc.state = 'hunt'; npc.stateT = 0; return; }
      npc.hostile = false; npc.state = 'wander'; npc.goal = null; return;
    }
    const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const ux = dx / d, uz = dz / d;
    const def = npc.wdef;
    const inCar = this._targetInVehicle(npc.target);

    // give up chasing if they ran far (not cops/brawlers)
    if (!npc.brawlId && npc.kind !== 'cop') {
      if (d > 45 || inCar) npc.giveUpT += dt; else npc.giveUpT = 0;
      if (npc.giveUpT > 4) {
        npc.hostile = false; npc.target = null; npc.state = 'wander'; npc.goal = null;
        if (npc.dist < 30) fx.say(npc.group, pick(['Yeah, keep running!', 'Coward!', 'I\'ll remember that face! ...What face?']), { ttl: 2 });
        return;
      }
    }

    npc.faceTo = Math.atan2(dx, dz);
    if (def.kind === 'gun') {
      const shootRange = Math.min(def.range * 0.55, 24);
      const seen = d < shootRange && this._losCached(npc, tp);
      if (seen && d > 2.5) {
        npc.aiming = true;
        // strafe a little while shooting
        const side = Math.sin(this.t * 0.9 + npc.punchSeq) > 0 ? 1 : -1;
        const want = d < 6 ? -1 : d > 14 ? 0.6 : 0;
        npc.vx = (ux * want + -uz * side * 0.5) * npc.walk * 1.2;
        npc.vz = (uz * want + ux * side * 0.5) * npc.walk * 1.2;
        if (npc.cd <= 0 && npc.stun <= 0 && !inCar) this._npcShoot(npc, tp, d);
        else if (npc.cd <= 0 && inCar && npc.kind === 'cop') this._npcShoot(npc, tp, d);
        return;
      }
    }
    const reach = def.kind === 'gun' ? 1.5 : def.range * 0.8 + 0.25;
    if (d <= reach + 0.15) {
      npc.vx *= 0.3; npc.vz *= 0.3;
      if (npc.cd <= 0 && npc.stun <= 0 && npc.pendingHit <= 0 && !inCar) {
        npc.model.punch(0.3);
        npc.punchSeq++;
        npc.pendingHit = 0.17;
        npc.cd = (def.rate || 0.5) * 1.7 + rand(0.15, 0.6) + (npc.kind === 'drunk' ? 0.5 : 0);
        if (chance(0.15) && npc.barkCd <= 0) {
          fx.say(npc.group, pick(npc.kind === 'cop' ? COP_YELL : TAUNTS), { ttl: 1.4, kind: npc.kind === 'cop' ? 'cop' : 'angry' });
          npc.barkCd = 4;
        }
      }
      // cops "cuff" you if you stand still next to them (handled by police)
      return;
    }
    // close in with simple obstacle avoidance
    let mx = ux, mz = uz;
    if (npc.avoidT > 0) {
      npc.avoidT -= dt;
      const a = npc.avoidSign * 1.1;
      const c = Math.cos(a), s = Math.sin(a);
      mx = ux * c - uz * s; mz = ux * s + uz * c;
    }
    const sp = (d < 3 ? npc.walk * 1.6 : npc.run) * (npc.stun > 0 ? 0.3 : 1);
    npc.vx = mx * sp; npc.vz = mz * sp;
    if (npc.stuckT > 0.35) { npc.avoidT = 0.7; npc.avoidSign = chance(0.5) ? 1 : -1; npc.stuckT = 0; }
  }

  _losCached(npc, tp) {
    npc.losT -= 1;
    if (npc.losT <= 0) { npc.losT = 6; npc.losOk = this.los(npc.pos.x, npc.pos.z, tp.x, tp.z); }
    return npc.losOk;
  }

  _sFlee(npc, dt) {
    const from = this._targetPos(npc.fleeFrom) || this.game.player.group.position;
    let dx = npc.pos.x - from.x, dz = npc.pos.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (npc.avoidT > 0) {
      npc.avoidT -= dt;
      const a = npc.avoidSign * 1.3, c = Math.cos(a), s = Math.sin(a);
      const nx = dx * c - dz * s, nz = dx * s + dz * c; dx = nx; dz = nz;
    }
    if (npc.stuckT > 0.3) { npc.avoidT = 0.8; npc.avoidSign = chance(0.5) ? 1 : -1; npc.stuckT = 0; }
    npc.vx = dx * npc.run; npc.vz = dz * npc.run;
    if ((npc.stateT > 7 && d > 25) || npc.stateT > 14) {
      npc.state = 'wander'; npc.stateT = 0; npc.goal = null; npc.fleeRolled = false;
      if (npc.brawlId) npc.state = 'hunt';
    }
  }

  _resolveNpcMelee(npc) {
    const tp = this._targetPos(npc.target);
    if (!tp || npc.dead) return;
    const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    const def = npc.wdef;
    if (d > def.range * 0.8 + 0.8) { this.ctx.fx.sfx.play('whoosh', { pos: npc.pos, vol: 0.5 }); return; }
    if (this._targetInVehicle(npc.target)) return;
    const dmg = Math.max(2, Math.round(def.damage * npc.dmgMult * rand(0.8, 1.2) * (npc.tierMult || 1)));
    const sfx = def.swing === 'overhead' || npc.weapon === 'bat' || npc.weapon === 'baton' ? 'smack' : (npc.weapon === 'knife' || npc.weapon === 'machete' || npc.weapon === 'bottle') ? 'slash' : 'punch';
    this.ctx.fx.sfx.play(sfx, { pos: npc.pos });
    this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: dx / (d || 1), z: dz / (d || 1) }, melee: true });
  }

  _npcShoot(npc, tp, d) {
    const fx = this.ctx.fx;
    const def = npc.wdef;
    npc.cd = Math.max(def.rate, 0.12) * (npc.weapon === 'smg' ? 1.3 : 2.2) + rand(0.1, 0.6);
    if (npc.weapon === 'smg' && (npc.burst = (npc.burst || 0) + 1) % 5 === 0) npc.cd += 1.2;
    npc.shotSeq++;
    const muzzle = this.muzzlePos(npc);
    fx.muzzle(muzzle.x, muzzle.y, muzzle.z, 0.5);
    fx.sfx.play(npc.weapon === 'smg' ? 'smg' : npc.weapon === 'rifle' || npc.weapon === 'revolver' ? 'biggun' : 'gun', { pos: npc.pos, vol: 0.8 });
    const moving = this._targetMoving(npc.target);
    const p = clamp(0.8 - d / 45 - (moving ? 0.25 : 0) + (npc.kind === 'cop' && npc.role === 'swat' ? 0.1 : 0), 0.12, 0.85);
    const hit = chance(p);
    const ox = hit ? 0 : rand(-1.6, 1.6), oz = hit ? 0 : rand(-1.6, 1.6);
    fx.tracer(muzzle.x, muzzle.y, muzzle.z, tp.x + ox, 1.2, tp.z + oz);
    if (hit) {
      const dmg = Math.round(def.damage * npc.dmgMult * rand(0.8, 1.15) * (npc.tierMult || 1));
      this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: (tp.x - npc.pos.x) / d, z: (tp.z - npc.pos.z) / d }, gun: true });
    }
    try { this.game.net.connected && this.game.net.broadcast({ t: 'combat:shot', x: muzzle.x, y: muzzle.y, z: muzzle.z, x2: tp.x + ox, z2: tp.z + oz, w: npc.weapon, n: 1 }); } catch { /* ignore */ }
  }

  _targetMoving(t) {
    if (t?.type === 'player') return (this.game.player?.speed ?? 0) > 3;
    return true;
  }

  muzzlePos(npc) {
    const hand = npc.model.rightHand;
    _v.set(0, -(MUZZLE[npc.weapon] ?? 0.25), 0);
    hand.updateWorldMatrix(true, false);
    return hand.localToWorld(_v.clone());
  }

  _move(npc, dt) {
    const phys = this.game.physics;
    const kbDecay = Math.exp(-8 * dt);
    let vx = npc.vx + npc.kbx, vz = npc.vz + npc.kbz;
    npc.kbx *= kbDecay; npc.kbz *= kbDecay;
    const ox = npc.pos.x, oz = npc.pos.z;
    const nx = ox + vx * dt, nz = oz + vz * dt;
    const r = phys.resolveCircle(nx, nz, npc.radius);
    npc.pos.x = r.x; npc.pos.z = r.z;
    const want = Math.hypot(vx, vz) * dt;
    const got = Math.hypot(r.x - ox, r.z - oz);
    if (want > 0.01 && got < want * 0.35) npc.stuckT = (npc.stuckT || 0) + dt; else npc.stuckT = 0;
    npc.speed = got / Math.max(dt, 1e-4);
    if (npc.leash && Math.hypot(npc.pos.x - npc.home.x, npc.pos.z - npc.home.z) > npc.leash * 2.5 && !npc.hostile) {
      npc.goal = { x: npc.home.x, z: npc.home.z }; npc.state = 'wander';
    }
    // face
    let want2 = npc.faceTo;
    if (want2 == null && npc.speed > 0.2) want2 = Math.atan2(vx, vz);
    if (want2 != null) {
      npc.facing = angleLerp(npc.facing, want2, 1 - Math.exp(-10 * dt));
      npc.group.rotation.y = npc.facing;
    }
    npc.faceTo = null;
  }

  // ------------------------------------------------------------ networking
  // Host -> clients. Only networked NPCs. Meta (look/name) every 10th snapshot.
  serialize(forceMeta = false) {
    const meta = (this.snapSeq++ % 10) === 0 || forceMeta;
    const n = [];
    for (const npc of this.map.values()) {
      if (!npc.networked || npc.replica) continue;
      const flags = (npc.dead ? 1 : 0) | (npc.hostile ? 2 : 0) | (npc.aiming ? 4 : 0) | (npc.ko ? 8 : 0) | (npc.knockdown > 0 ? 16 : 0);
      const rec = [npc.id, Math.round(npc.pos.x * 50) / 50, Math.round(npc.pos.z * 50) / 50, Math.round(npc.facing * 100) / 100,
        Math.round(npc.hp), flags, npc.punchSeq, npc.shotSeq];
      if (meta || !npc.metaSent) {
        npc.metaSent = true;
        rec.push({ k: npc.kind, r: npc.role, nm: npc.name, c: npc.color, h: npc.hat, hc: npc.hatColor, s: npc.scale, w: npc.weapon, m: npc.maxHp, f: npc.faction, b: npc.brawlId });
      }
      n.push(rec);
    }
    return { t: 'npc:snap', n, full: true };
  }

  applySnapshot(snap) {
    if (!snap?.n || this.game.net.isAuthority) return;
    const seen = new Set();
    for (const rec of snap.n) {
      const [id, x, z, f, hp, flags, ps, ss, meta] = rec;
      seen.add(id);
      let npc = this.map.get(id);
      if (!npc) {
        if (!meta) continue;
        npc = this.spawn({ id, kind: meta.k, role: meta.r, name: meta.nm, color: meta.c, hat: meta.h ?? null, hatColor: meta.hc, scale: meta.s,
          weapon: meta.w, hp, maxHp: meta.m, faction: meta.f, networked: true, _replica: true, x, z, facing: f, brawlId: meta.b });
        if (!npc) continue;
        npc.punchSeq = ps; npc.shotSeq = ss;
      } else if (meta && meta.w !== npc.weapon) this.setWeapon(npc, meta.w);
      if (meta) npc.brawlId = meta.b ?? npc.brawlId;
      npc.net = npc.net || { x, z, f };
      npc.net.x = x; npc.net.z = z; npc.net.f = f;
      if (hp < npc.hp && !(flags & 1)) npc.model.flash();
      npc.hp = hp;
      npc.predictedHp = undefined;
      npc.hostile = !!(flags & 2);
      npc.aiming = !!(flags & 4);
      const dead = !!(flags & 1);
      const kd = !!(flags & 16);
      if (dead !== npc.dead) {
        npc.dead = dead;
        npc.ko = !!(flags & 8);
        npc.model.setDead(dead);
        if (dead) { npc.deadT = 0; this.ctx.fx.blood(npc.pos.x, npc.pos.z, 2, null, 0.4); this.ctx.combat?.onReplicaDown?.(npc); }
      } else if (!dead && kd !== !!npc.kdShown) {
        npc.kdShown = kd;
        npc.model.setDead(kd);
      }
      if (ps !== npc.punchSeq) { npc.punchSeq = ps; npc.model.punch(0.3); }
      if (ss !== npc.shotSeq) {
        npc.shotSeq = ss;
        const m = this.muzzlePos(npc);
        this.ctx.fx.muzzle(m.x, m.y, m.z, 0.5);
      }
    }
    if (snap.full) {
      for (const npc of [...this.map.values()]) if (npc.replica && !seen.has(npc.id)) this.remove(npc);
    }
  }

  _updateReplica(npc, dt) {
    const n = npc.net;
    if (!n) return;
    const k = 1 - Math.exp(-12 * dt);
    const ox = npc.pos.x, oz = npc.pos.z;
    const dx = n.x - ox, dz = n.z - oz;
    if (dx * dx + dz * dz > 100) { npc.pos.x = n.x; npc.pos.z = n.z; }
    else { npc.pos.x += dx * k; npc.pos.z += dz * k; }
    npc.speed = npc.speed * 0.8 + (Math.hypot(npc.pos.x - ox, npc.pos.z - oz) / Math.max(dt, 1e-4)) * 0.2;
    npc.facing = angleLerp(npc.facing, n.f, k);
    npc.group.rotation.y = npc.facing;
    if (npc.dead) {
      npc.deadT += dt;
      if (npc.deadT > 27) npc.group.position.y = -(npc.deadT - 27) * 0.25;
    }
  }
}
