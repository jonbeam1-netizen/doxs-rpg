import * as THREE from 'three';
import { createStickman } from '../entities/stickman.js';
import { clamp, rand, pick, chance, angleLerp } from '../core/util.js';
import { weaponDef, weaponMesh, MUZZLE } from './weapons-mesh.js';
import { genName, line, HURT, FLEE, TAUNTS, COP_YELL, WARNINGS } from './names.js';
import { clearPose, gesture, cartArms } from './crowd.js';

const POSE_BARKS = {
  lie: ['zzz...', 'Five more minutes, ma.', 'This is my GOOD cardboard.', 'Spare change? Spare kidney?', 'Mmmf. Go away.'],
  ground: ['Spare a buck for a guy with a dream?', 'Nice shoes. I used to have feet.', "Don't step on the cardboard. It's load-bearing.", 'I was a CEO once. Of this curb.'],
  sit: ['This bench is my therapist.', 'Bus is late. Bus is always late.', "I'm saving this seat for my emotional baggage.", 'Pigeons respect me here.'],
  lean: ['*cough*', 'Yeah. Yeah. No. Yeah.', 'Can I help you?', 'Wall holds me up. I hold the wall up. Teamwork.'],
};

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

// Fighting styles. Every attack is telegraphed (wind-up pose + glow + "!"), so fights are learnable.
//   wind: wind-up seconds   recover: vulnerable time after swinging   dmg: damage mult
//   block / dodge: base chance to guard / sidestep a player attack (grows with tier)
//   poise: light hits don't interrupt them (kick / charged heavy does)
export const ARCH = {
  brawler: { wind: 0.5,  recover: 0.5,  dmg: 1,    reach: 1,    block: 0.06, dodge: 0,    style: null },
  rusher:  { wind: 0.36, recover: 0.75, dmg: 0.95, reach: 1,    block: 0,    dodge: 0.12, style: 'slash', lunge: 7.5, startReach: 2.7 },
  slugger: { wind: 0.72, recover: 0.75, dmg: 1.3,  reach: 1.1,  block: 0.05, dodge: 0,    style: 'overhead', heavy: true },
  heavy:   { wind: 0.66, recover: 0.6,  dmg: 1.25, reach: 1.05, block: 0.4,  dodge: 0,    style: 'heavy', heavy: true, poise: true },
  gunner:  { wind: 0.5,  recover: 0.5,  dmg: 1,    reach: 1,    block: 0,    dodge: 0.1,  style: null },
  cop:     { wind: 0.5,  recover: 0.6,  dmg: 1,    reach: 1,    block: 0.12, dodge: 0,    style: 'overhead', taser: true },
  boss:    { wind: 0.55, recover: 0.5,  dmg: 1.2,  reach: 1.1,  block: 0.3,  dodge: 0,    style: 'heavy', heavy: true, poise: true },
};
const TELE = { normal: 0xff9a1a, heavy: 0xff3a12, taser: 0x3ad0ff };

function archFor(npc) {
  if (npc.spec?.arch && ARCH[npc.spec.arch]) return npc.spec.arch;
  if (npc.boss) return 'boss';
  const w = npc.weapon;
  if (npc.wdef?.kind === 'gun') return 'gunner';
  if (npc.kind === 'cop') return 'cop';
  if (w === 'knife' || w === 'bottle' || w === 'machete') return 'rusher';
  if (w === 'bat' || w === 'crowbar' || w === 'sledge') return 'slugger';
  if (npc.scale >= 1.12 || npc.faction === 'bikers' || (npc.role === 'fighter' && (npc.tier || 0) >= 2)) return 'heavy';
  return 'brawler';
}

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
    this.attackers = new Map(); // target key -> npcs currently winding up / swinging at it (turn-taking)
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
      tier: spec.tier ?? 0, arch: null, A: null, atk: null, guard: 0, guardCd: rand(0.5, 2), dodgeCd: 0,
      hitChain: 0, chainT: -9, poiseT: 0, circleSide: chance(0.5) ? 1 : -1, circleT: rand(1.5, 4), taserCd: rand(1, 3),
      boss: null, bossName: spec.bossName ?? null, windSeq: 0, airVy: null, riposteUntil: 0,
      net: null,
      remove: () => this.remove(npc),
    };
    if (role === 'drunk') npc.drunkWobble = 0.1 + Math.random() * 6;
    if (spec.boss) {
      const B = spec.boss;
      npc.boss = { name: B.name || npc.name, tag: B.tag || 'BOSS', moves: new Set(B.moves || ['combo']), enraged: false, summoned: false, chargeCd: rand(2, 4), slamCd: rand(3, 5) };
      npc.name = npc.boss.name;
      npc.bossName = npc.boss.name;
    }
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
      try {
        net.sendToHost({ t: 'npc:damage', id: npc.id, dmg: Math.round(amount), kx: opts.dir?.x ?? 0, kz: opts.dir?.z ?? 0, heavy: !!opts.heavy, kb: opts.kb ?? 0,
          kd: opts.knockdown === true ? 1 : opts.knockdown === false ? 0 : undefined, gb: opts.guardBreak ? 1 : 0, pw: opts.power || 0, bl: opts.blocked ? 1 : 0 });
      } catch { /* ignore */ }
      npc.predictedHp = (npc.predictedHp ?? npc.hp) - amount;
      return { dealt: amount, killed: npc.predictedHp <= 0 };
    }
    return this._applyDamage(npc, amount, attackerId, opts);
  }

  // Something dangerous is coming from (x,z) (a speeding car if opts.dir is its
  // heading, otherwise gunfire / a siren). Bystanders dive aside and run.
  // Called by vehicles (speeding cars, horns, sirens) and police.
  scare(npcOrId, x, z, opts = {}) {
    const npc = typeof npcOrId === 'object' ? npcOrId : this.map.get(npcOrId);
    if (!npc || npc.dead || npc.replica || npc.brawlId || npc.knockdown > 0) return false;
    if (npc.kind === 'cop' || npc.kind === 'static') return false;
    if (npc.dodge && npc.dodge.t > 0.15) return false;
    let ax = npc.pos.x - x, az = npc.pos.z - z;
    const dir = opts.dir;
    if (dir) {
      // sideways out of the car's path
      const rx = -dir.z, rz = dir.x;
      const side = ax * rx + az * rz >= 0 ? 1 : -1;
      ax = rx * side + dir.x * 0.15; az = rz * side + dir.z * 0.15;
    }
    const l = Math.hypot(ax, az) || 1;
    npc.dodge = { x: ax / l, z: az / l, t: opts.t ?? (dir ? 0.65 : 0.4) };
    const tough = npc.hostile || npc.kind === 'thug' || npc.kind === 'gang' || npc.kind === 'dealer';
    if (!tough && npc.state !== 'flee') {
      this._flee(npc, null);
      npc.fleePoint = { x, z };
    }
    if (npc.barkCd <= 0 && npc.dist < 30 && chance(0.35)) {
      this.ctx.fx.say(npc.group, pick(dir ? ['WHOA!', 'Jesus, watch it!', 'MY HIP!', 'Not today, Satan!', 'AAAH!', 'Learn to DRIVE!'] : FLEE), { ttl: 1.4, kind: tough ? 'angry' : '' });
      npc.barkCd = 3;
    }
    return true;
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
    this._setArch(npc);
  }

  _setArch(npc) {
    npc.arch = archFor(npc);
    const base = ARCH[npc.arch] || ARCH.brawler;
    const t = npc.tier || 0;
    npc.A = {
      ...base,
      wind: base.wind * Math.max(0.72, 1 - 0.04 * t),
      recover: base.recover * Math.max(0.7, 1 - 0.04 * t),
      block: Math.min(0.6, base.block + (t >= 1 ? 0.05 * t : 0) + (npc.boss?.moves.has('block') ? 0.2 : 0)),
      dodge: Math.min(0.35, base.dodge + 0.05 * Math.max(0, t - 1)),
    };
  }

  setWeapon(npc, id) { npc.weapon = id; this._attachWeapon(npc); }

  // ------------------------------------------------------------ damage
  _hitFeedback(npc, amount, opts, local) {
    const fx = this.ctx.fx;
    const dir = opts.dir || null;
    if (opts.blocked) {
      if (local) fx.number(npc.pos.x, 2.1 * npc.scale, npc.pos.z, 'BLOCKED', 'block');
      if (dir) { npc.kbx += dir.x * 1.5; npc.kbz += dir.z * 1.5; }
      return;
    }
    npc.model.flash();
    if (dir && npc.model.hitReact) {
      // which side got hit (for the flinch lean)
      const fx2 = Math.cos(npc.facing), fz2 = -Math.sin(npc.facing);
      npc.model.hitReact(Math.sign(dir.x * fx2 + dir.z * fz2) || 0);
    }
    const amt = clamp(amount / 20, 0.5, 2.5);
    fx.blood(npc.pos.x, npc.pos.z, amt, dir, 1.1 * npc.scale);
    if (opts.heavy && chance(0.35)) fx.tooth(npc.pos.x, 1.4 * npc.scale, npc.pos.z, dir);
    if (local) {
      const cls = opts.crit ? 'crit' : amount >= 35 ? 'big' : amount >= 16 ? 'med' : '';
      fx.number(npc.pos.x, 2.1 * npc.scale, npc.pos.z, String(Math.round(amount)), cls);
    }
    if (dir) {
      const kb = (opts.kb ?? 4) * (npc.boss ? 0.35 : npc.A?.poise ? 0.6 : 1);
      npc.kbx += dir.x * kb; npc.kbz += dir.z * kb;
    }
    if (chance(0.5)) fx.sfx.play('grunt', { pos: npc.pos, vol: 0.7 });
  }

  // ---- attacks & reactions -------------------------------------------------
  _cancelAttack(npc) {
    if (!npc.atk) return;
    npc.atk = null;
    npc.pendingHit = 0;
    npc.model.cancelWindup?.();
    this.ctx.fx.clearAlert(npc.group);
  }

  _setGuard(npc, t) {
    npc.guard = t;
    npc.model.setBlock?.(t > 0);
  }

  // Knock someone flat: they face the hit, get launched a little and fall away from it.
  _knockDown(npc, dir, kb = 5, dur = 1.3) {
    this._cancelAttack(npc);
    if (npc.guard > 0) this._setGuard(npc, 0);
    npc.knockdown = dur;
    npc.stun = 0;
    npc.dodge = null;
    if (dir) { npc.facing = Math.atan2(-dir.x, -dir.z); npc.group.rotation.y = npc.facing; }
    npc.model.setDead(true, { fall: true });
    npc.airVy = clamp(1.6 + kb * 0.18, 2, 4.6);
    this._settleBody(npc);
  }

  // A lying body extends ~1.9m behind the feet: turn / nudge it so it never pokes through a wall.
  _settleBody(npc) {
    const phys = this.game.physics;
    const len = 1.9 * npc.scale;
    const test = (ry) => phys.raycast(npc.pos.x, npc.pos.z, npc.pos.x - Math.sin(ry) * len, npc.pos.z - Math.cos(ry) * len, 0.25, 0);
    const ry = npc.group.rotation.y;
    let bf = test(ry);
    if (bf >= 1) return;
    let best = ry;
    for (const off of [0.5, -0.5, 1.1, -1.1, Math.PI / 2, -Math.PI / 2, 2.2, -2.2, Math.PI]) {
      const f = test(ry + off);
      if (f > bf) { bf = f; best = ry + off; if (f >= 1) break; }
    }
    npc.facing = best;
    npc.group.rotation.y = best;
    if (bf < 1) {
      const r = phys.resolveCircle(npc.pos.x + Math.sin(best) * (1 - bf) * len, npc.pos.z + Math.cos(best) * (1 - bf) * len, npc.radius);
      npc.pos.x = r.x; npc.pos.z = r.z;
    }
  }

  // Launch arc after a knockdown / kill. Returns true while airborne.
  _air(npc, dt) {
    if (npc.airVy == null) return false;
    npc.pos.y += npc.airVy * dt;
    npc.airVy -= 22 * dt;
    if (npc.pos.y <= 0) { npc.pos.y = 0; npc.airVy = null; this._settleBody(npc); return false; }
    return true;
  }

  // The player parried this NPC's swing: wide open for a riposte.
  parried(npc) {
    if (!npc || npc.dead) return;
    if (npc.networked && !this.game.net.isAuthority) {
      try { this.game.net.sendToHost({ t: 'npc:parried', id: npc.id }); } catch { /* ignore */ }
      npc.riposteUntil = this.game.elapsed + 1.6;
      return;
    }
    this._cancelAttack(npc);
    this._setGuard(npc, 0);
    npc.stun = npc.boss ? 0.9 : 1.4;
    npc.riposteUntil = this.game.elapsed + 1.6;
    npc.kbx -= Math.sin(npc.facing) * 3; npc.kbz -= Math.cos(npc.facing) * 3;
    npc.model.hitReact?.(0);
    this.ctx.fx.alert(npc.group, 'stun', npc.stun, 2.55 * npc.scale);
    npc.cd = Math.max(npc.cd, npc.stun + 0.3);
  }

  // The local player started an attack from (x,z) toward (dx,dz): nearby fighters may guard or sidestep.
  onPlayerAttack(x, z, dx, dz, kind = 'light') {
    for (const n of this.near(x, z, 3.8)) {
      if (n.replica || !n.hostile || n.knockdown > 0 || n.stun > 0.3 || n.state !== 'chase' || n.target?.type !== 'player') continue;
      if (n.atk && n.atk.phase !== 'wind') continue;
      const rx = n.pos.x - x, rz = n.pos.z - z, d = Math.hypot(rx, rz) || 1;
      if ((rx * dx + rz * dz) / d < 0.2) continue; // not aimed at them
      const facing = (-rx * Math.sin(n.facing) - rz * Math.cos(n.facing)) / d;
      if (facing < 0.3) continue; // can't see it coming
      const A = n.A || ARCH.brawler;
      const big = kind === 'heavy' || kind === 'kick' || kind === 'charge';
      if (big && A.dodge > 0 && n.dodgeCd <= 0 && chance(A.dodge * 1.6)) {
        this._cancelAttack(n);
        const side = chance(0.5) ? 1 : -1;
        const bx = rx / d * 0.7 + (-rz / d) * side * 0.7, bz = rz / d * 0.7 + (rx / d) * side * 0.7;
        const l = Math.hypot(bx, bz) || 1;
        n.dodge = { x: bx / l, z: bz / l, t: 0.3 };
        n.dodgeCd = 2.5;
      } else if (!big && !n.atk && n.guard <= 0 && n.guardCd <= 0 && chance(A.block)) {
        this._setGuard(n, rand(0.6, 1.0));
        n.guardCd = rand(1.8, 3.2);
      }
    }
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
    if (npc.hp <= 0) {
      this._kill(npc, attackerId, opts);
      return { dealt: amount, killed: true };
    }
    const A = npc.A || ARCH.brawler;
    const breaker = !!(opts.guardBreak || opts.power >= 0.5);
    if (opts.blocked) {
      // they ate it on the forearms: no stagger, and they'll counter quickly
      npc.cd = Math.min(npc.cd, 0.35);
    } else {
      if (npc.guard > 0 && breaker) {
        this._setGuard(npc, 0);
        npc.stun = Math.max(npc.stun, 0.9);
        this.ctx.fx.alert(npc.group, 'stun', 0.9, 2.55 * npc.scale);
        if (attackerId === 'local') this.ctx.fx.number(npc.pos.x, 2.5 * npc.scale, npc.pos.z, 'GUARD BREAK', 'crit');
      }
      // combo pressure: after a quick string of hits, fighters stop flinching and respond
      if (this.t - npc.chainT < 1.2) npc.hitChain++; else npc.hitChain = 1;
      npc.chainT = this.t;
      const poised = npc.poiseT > 0 || ((A.poise || npc.boss) && !breaker);
      if (poised) {
        npc.stun = Math.max(npc.stun, 0.06);
      } else {
        npc.stun = Math.max(npc.stun, opts.heavy || breaker ? 0.5 : 0.28);
        this._cancelAttack(npc); // interrupt their swing — combos feel good
      }
      if (!npc.boss && npc.hitChain >= 3 + Math.min(2, Math.floor((npc.tier || 0) / 3)) && !breaker) {
        npc.hitChain = 0;
        if (A.block > 0 && npc.guardCd <= 0 && chance(A.block + 0.25)) { npc.stun = 0; this._setGuard(npc, 0.8); npc.guardCd = 2.5; }
        else if (A.dodge > 0 && chance(0.6)) {
          npc.stun = 0;
          const d = opts.dir || { x: -Math.sin(npc.facing), z: -Math.cos(npc.facing) };
          npc.dodge = { x: d.x, z: d.z, t: 0.32 };
        } else if ((npc.tier || 0) >= 1 || chance(0.4)) { npc.poiseT = 0.9; npc.stun = 0; npc.cd = 0; }
      }
      // knockdowns: kicks, finishers, charged heavies, car hits
      const kdWanted = opts.knockdown === true || (opts.knockdown === undefined && opts.heavy && amount >= 18 && chance(0.4));
      if (kdWanted && npc.knockdown <= 0) {
        const ok = npc.boss ? opts.power >= 0.85 : (A.poise ? (opts.power >= 0.7 || chance(0.35)) : true);
        if (ok) this._knockDown(npc, opts.dir, opts.kb ?? 5, npc.boss ? 0.9 : 1.3);
        else npc.stun = Math.max(npc.stun, 0.6);
      }
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
    this._cancelAttack(npc);
    npc.cross = null;
    if (npc.guard > 0) this._setGuard(npc, 0);
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
    this._cancelAttack(npc);
    npc.guard = 0;
    if (opts.dir) npc.facing = Math.atan2(-opts.dir.x, -opts.dir.z) + rand(-0.3, 0.3);
    else npc.facing += rand(-0.6, 0.6);
    npc.group.rotation.y = npc.facing;
    npc.model.setDead(true, { fall: true });
    npc.airVy = opts.dir ? clamp(1.5 + (opts.kb ?? 4) * 0.2, 1.8, 5) : null;
    this._settleBody(npc);
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

  // Is (x,z) somewhere a pedestrian should stroll (i.e. not the middle of a road)?
  // Uses world.onSidewalk when the world provides it, else a road-graph distance test.
  walkable(x, z) {
    const w = this.game.world;
    if (typeof w?.onSidewalk === 'function') { try { return !!w.onSidewalk(x, z); } catch { return true; } }
    const r = w?.roads;
    if (!r?.nodes || !r.edges) return true;
    const N = r.nodes, info = r.info;
    for (let i = 0; i < r.edges.length; i++) {
      const A = N[r.edges[i][0]], B = N[r.edges[i][1]];
      if (!A || !B) continue;
      const e = info?.[i];
      const hw = e?.hw ? e.hw - 0.3 : e?.lanes ? Math.max(...e.lanes) + 2.4 : 9;
      if (x < Math.min(A.x, B.x) - hw || x > Math.max(A.x, B.x) + hw || z < Math.min(A.z, B.z) - hw || z > Math.max(A.z, B.z) + hw) continue;
      const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - A.x) * dx + (z - A.z) * dz) / L2, 0, 1);
      if (Math.hypot(A.x + dx * t - x, A.z + dz * t - z) < hw) return false;
    }
    return true;
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
    // who is currently swinging at whom (turn-taking)
    const atk = this.attackers;
    atk.clear();
    for (const n of this.map.values()) {
      if (n.atk && n.target && !n.dead && n.atk.kind !== 'taser') { const k = this._tkey(n.target); atk.set(k, (atk.get(k) || 0) + 1); }
    }

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
          const posed = npc.state === 'pose';
          const interval = posed ? 0.4 : simD < 40 ? 0 : simD < 80 ? 0.1 : 0.3;
          npc.acc += dt;
          if (npc.acc >= interval) {
            const step = Math.min(npc.acc, posed ? 0.6 : 0.35);
            npc.acc = 0;
            this._think(npc, step, players);
            if (npc.state !== 'pose') this._move(npc, step);
          }
          if (simD < 50 && npc.state !== 'pose') active.push(npc);
        }

        // render LOD
        const vis = d < 140;
        if (npc.group.visible !== vis) npc.group.visible = vis;
        // ambient body language: drop the pose the moment they do anything else
        if (npc.pose && (npc.dead || (npc.pose.walking ? !(npc.state === 'wander' || npc.state === 'idle') : npc.state !== 'pose'))) clearPose(npc);
        if (npc.pose && !npc.pose.walking) {
          if (vis && d < 45) gesture(npc, dt);
        } else if (vis && d < 75 && !npc.dead) {
          npc.model.animate(dt, npc.speed, { aim: npc.aiming, swingStyle: npc.wdef?.swing, airborne: false });
          if (npc.drunkWobble) npc.model.parts.hips.rotation.z = Math.sin(this.t * 2.3 + npc.drunkWobble) * 0.12;
          if (npc.pose?.walking) cartArms(npc);
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
    const flying = this._air(npc, dt);
    // sliding from the knockback
    if (Math.abs(npc.kbx) + Math.abs(npc.kbz) > 0.05) {
      const r = this.game.physics.resolveCircle(npc.pos.x + npc.kbx * dt, npc.pos.z + npc.kbz * dt, npc.radius);
      npc.pos.x = r.x; npc.pos.z = r.z;
      const f = Math.exp((flying ? -2 : -6) * dt);
      npc.kbx *= f; npc.kbz *= f;
      if (Math.abs(npc.kbx) + Math.abs(npc.kbz) <= 0.05) this._settleBody(npc);
    }
    if (npc.ko && !npc.networked && npc.deadT > 9 && !npc.gotUp) {
      // KO'd brawlers/drunks peel themselves off the floor and limp away
      npc.gotUp = true;
      npc.dead = false; npc.hp = Math.max(5, npc.maxHp * 0.15);
      npc.model.setDead(false, { fall: true });
      npc.hostile = false; npc.target = null; npc.brawlId = null;
      npc.state = 'flee'; npc.stateT = 0; npc.fleeFrom = { type: 'player' };
      npc.leaving = true;
      this.ctx.fx.say(npc.group, pick(['I meant to do that.', 'This isn\'t over! ...it\'s over.', 'Where\'s my other shoe?']), { ttl: 2.5 });
      return;
    }
    if (npc.ko && npc.networked && npc.deadT > 9 && !npc.gotUp && this.game.net.isAuthority) {
      npc.gotUp = true;
      npc.dead = false; npc.hp = Math.max(5, npc.maxHp * 0.15);
      npc.model.setDead(false, { fall: true });
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
      this._air(npc, dt);
      if (npc.knockdown <= 0) { npc.model.setDead(false, { fall: true }); npc.pos.y = 0; npc.airVy = null; npc.stun = 0.45; }
      return;
    }
    if (npc.stun > 0) { npc.stun -= dt; npc.vx *= 0.5; npc.vz *= 0.5; }
    npc.cd -= dt;
    npc.guardCd -= dt; npc.dodgeCd -= dt; npc.taserCd -= dt; npc.poiseT -= dt;
    if (npc.boss) { npc.boss.chargeCd -= dt; npc.boss.slamCd -= dt; }
    if (npc.guard > 0) { npc.guard -= dt; if (npc.guard <= 0) { this._setGuard(npc, 0); if (chance(0.5)) npc.cd = Math.min(npc.cd, 0.1); } }
    if (npc.dodge) {
      // diving out of the way beats whatever else they were doing
      const d = npc.dodge;
      d.t -= dt;
      const sp = npc.run * 1.25;
      npc.vx = d.x * sp; npc.vz = d.z * sp;
      npc.faceTo = Math.atan2(d.x, d.z);
      if (d.t <= 0) npc.dodge = null;
      return;
    }

    // pending melee hit (arm is extending)
    if (npc.pendingHit > 0) {
      npc.pendingHit -= dt;
      if (npc.pendingHit <= 0) this._resolveNpcMelee(npc);
    }
    if (npc.atk) {
      if (npc.stun > 0 && npc.atk.phase === 'wind' && !(npc.A?.poise || npc.boss)) this._cancelAttack(npc);
      else if (this._updateAttack(npc, dt)) return; // a charge is steering them
    }

    switch (npc.state) {
      case 'idle': this._sIdle(npc, dt, players); break;
      case 'wander': this._sWander(npc, dt, players); break;
      case 'warn': this._sWarn(npc, dt); break;
      case 'hunt': this._sHunt(npc, dt, players); break;
      case 'chase': this._sChase(npc, dt); break;
      case 'flee': this._sFlee(npc, dt); break;
      case 'pose': this._sPose(npc, dt, players); break;
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
    const w = g.world;
    const civilian = !npc.hostile && npc.state !== 'flee';
    // now and then cross the street properly: walk to a signalized corner, wait for WALK, cross
    if (civilian && w?.signals?.list?.length && chance(npc.data?.purpose ? 0.35 : 0.2)) { const c = this._planCrossing(npc); if (c) return c; }
    if (civilian && npc.data?.purpose) { const p = this._purposeGoal(npc); if (p) return p; }
    // civilians stick to sidewalks; crossing the road straight across is fine now and then
    if (civilian && typeof w?.sidewalkPointNear === 'function') {
      for (let i = 0; i < 4; i++) {
        let p = null;
        try { p = w.sidewalkPointNear(npc.pos.x, npc.pos.z, 4, 30); } catch { p = null; }
        if (!p || !this.los(npc.pos.x, npc.pos.z, p.x, p.z)) continue;
        const mx = (p.x + npc.pos.x) / 2, mz = (p.z + npc.pos.z) / 2;
        if (!this.walkable(mx, mz) && (w.signals?.list?.length || !chance(0.05))) continue; // cross at crosswalks, not mid-block
        if (this._crowded(p.x, p.z, npc)) continue;
        return p;
      }
    }
    // try a sidewalk point nearby; otherwise pick a clear direction
    if (w?.randomSidewalkPoint && typeof w.sidewalkPointNear !== 'function' && chance(0.6)) {
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
      if (civilian && (!this.walkable(x, z) || !this.walkable((x + npc.pos.x) / 2, (z + npc.pos.z) / 2))) continue;
      if (!phys.pointBlocked(x, z) && this.los(npc.pos.x, npc.pos.z, x, z)) return { x, z };
    }
    return null;
  }

  // Somewhere 40-120m away along the sidewalks, or a door to disappear into.
  _purposeGoal(npc) {
    const g = this.game, w = g.world;
    const ok = (p) => p && this.los(npc.pos.x, npc.pos.z, p.x, p.z) && !this._crowded(p.x, p.z, npc)
      && this.walkable((p.x + npc.pos.x) / 2, (p.z + npc.pos.z) / 2);
    if (chance(0.3)) {
      const doors = [];
      for (const l of g.locations?.list || []) {
        const dx = (l.doorX ?? l.x) - npc.pos.x, dz = (l.doorZ ?? l.z) - npc.pos.z;
        const dd = dx * dx + dz * dz;
        if (dd > 400 && dd < 120 * 120) doors.push(l);
      }
      for (let i = 0; i < 4 && doors.length; i++) {
        const l = doors[(Math.random() * doors.length) | 0];
        const p = { x: l.doorX ?? l.x, z: l.doorZ ?? l.z, door: l.id };
        if (ok(p)) return p;
      }
    }
    if (typeof w?.sidewalkPointNear !== 'function') return null;
    for (let i = 0; i < 8; i++) {
      let p = null;
      try { p = w.sidewalkPointNear(npc.pos.x, npc.pos.z, i < 5 ? 40 : 15, i < 5 ? 120 : 45); } catch { p = null; }
      if (ok(p)) return p;
    }
    return null;
  }

  // Anti-horde: too many people already standing around there (or it's on top of the player)?
  _crowded(x, z, self) {
    const lp = this.game.player?.group?.position;
    if (lp && !self.hostile && Math.hypot(lp.x - x, lp.z - z) < 8) return true;
    let n = 0;
    for (const o of this.map.values()) {
      if (o === self || o.dead) continue;
      const gx = o.goal ? o.goal.x : o.pos.x, gz = o.goal ? o.goal.z : o.pos.z;
      if (Math.abs(gx - x) < 5 && Math.abs(gz - z) < 5 && ++n >= 2) return true;
    }
    return false;
  }

  // Pick a crosswalk at a nearby signalized junction: returns the corner to walk to (and sets npc.cross).
  // Route: corner (wait) -> curb at the zebra -> across -> far curb -> far corner. The zebra sits
  // between the junction box and the stop line, so waiting cars never block it.
  _planCrossing(npc) {
    const w = this.game.world, sig = w.signals, roads = w.roads;
    let best = null, bd = 60 * 60;
    for (const j of sig.list) {
      const d = (j.x - npc.pos.x) ** 2 + (j.z - npc.pos.z) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (!best) return null;
    const N = roads?.nodes?.[best.node];
    if (!N) return null;
    const opts = [];
    for (const ax of best.axes) for (const h of [ax, ax + Math.PI]) {
      let sl = null;
      try { sl = sig.stopLine(best.node, h); } catch { sl = null; }
      if (!sl) continue;
      const e = roads.info?.[sl.edge];
      const road = e?.lanes?.length ? Math.max(...e.lanes) + 1.6 : (e?.hw ?? 8) - 1.5;
      const ux = -Math.sin(h), uz = -Math.cos(h); // from the node out along the approach
      const rx = uz, rz = -ux;
      const P = (along, lat) => ({ x: N.x + ux * along + rx * lat, z: N.z + uz * along + rz * lat });
      // a corner spot that's sidewalk on BOTH sides of this road
      let wait = null;
      for (const da of [0.5, 1.3, 2.2, 3.2, 4.5]) {
        for (const dl of [0.6, 1.2, 2, 3, 4]) {
          const a = P(sl.dist + da, road + dl), b = P(sl.dist + da, -(road + dl));
          if (this.walkable(a.x, a.z) && this.walkable(b.x, b.z) && !this.game.physics.pointBlocked(a.x, a.z) && !this.game.physics.pointBlocked(b.x, b.z)) { wait = { da, dl }; break; }
        }
        if (wait) break;
      }
      if (!wait) continue;
      const zebra = Math.max(2, sl.dist - 2);
      const side = ((npc.pos.x - N.x) * rx + (npc.pos.z - N.z) * rz) >= 0 ? 1 : -1;
      const pts = [P(sl.dist + wait.da, side * (road + wait.dl)), P(zebra, side * (road + 0.4)), P(zebra, -side * (road + 0.4)), P(sl.dist + wait.da, -side * (road + wait.dl))];
      opts.push({ pts, d: Math.hypot(pts[0].x - npc.pos.x, pts[0].z - npc.pos.z) });
    }
    opts.sort((p, q) => p.d - q.d);
    for (const o of opts.slice(0, 2)) {
      if (!this.los(npc.pos.x, npc.pos.z, o.pts[0].x, o.pts[0].z)) continue;
      const h = Math.atan2(o.pts[2].x - o.pts[1].x, o.pts[2].z - o.pts[1].z);
      npc.cross = { node: best.node, pts: o.pts, i: 0, h, phase: 'approach', t: 0, react: rand(0.2, 0.9) };
      return { x: o.pts[0].x, z: o.pts[0].z };
    }
    return null;
  }

  // Crosswalk routine. Returns true while it's steering the NPC.
  _crossStep(npc, dt) {
    const c = npc.cross;
    const sig = this.game.world?.signals;
    if (!sig) { npc.cross = null; return false; }
    c.t += dt;
    const go = (pt, sp) => {
      const dx = pt.x - npc.pos.x, dz = pt.z - npc.pos.z, d = Math.hypot(dx, dz) || 1;
      npc.vx = (dx / d) * sp; npc.vz = (dz / d) * sp;
      return d;
    };
    if (c.phase === 'approach') {
      if (go(c.pts[0], npc.walk) < 0.7) { c.phase = 'wait'; c.t = 0; npc.vx = npc.vz = 0; return true; }
      if (c.t > 40 || npc.stuckT > 1.5) { npc.cross = null; npc.goal = null; return false; }
      return true;
    }
    if (c.phase === 'wait') {
      npc.vx = npc.vz = 0;
      npc.faceTo = c.h;
      let walk = true;
      try { walk = sig.walkAt(c.node, c.h); } catch { walk = true; }
      c.green = walk ? (c.green || 0) + dt : 0;
      if (c.green > c.react) { c.phase = 'cross'; c.t = 0; c.i = 1; }
      else if (c.t > 45) { npc.cross = null; npc.goal = null; return false; }
      return true;
    }
    // crossing: brisk walk over the zebra, then step up onto the far corner
    if (go(c.pts[c.i], npc.walk * 1.35) < 0.6) {
      c.i++;
      if (c.i >= c.pts.length) { npc.cross = null; npc.goal = null; npc.stateT = 0; npc.vx = npc.vz = 0; return false; }
    }
    if (c.t > 25) { npc.cross = null; npc.goal = null; return false; }
    return true;
  }

  _sWander(npc, dt, players) {
    if (npc.hostile) { npc.state = 'hunt'; npc.cross = null; return; }
    if (npc.cross) { if (this._crossStep(npc, dt)) { npc.onRoad = false; return; } }
    if (!npc.goal) {
      npc.goal = this._pickGoal(npc);
      if (!npc.goal) { npc.state = 'idle'; npc.stateT = 0; npc.idleFor = rand(1, 3); return; }
    }
    const dx = npc.goal.x - npc.pos.x, dz = npc.goal.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8 || npc.stateT > (npc.data.purpose ? 90 : 25) || npc.stuckT > 1.2) {
      // walkers with somewhere to be: duck into the door, or head off somewhere else
      if (npc.data.purpose && npc.goal?.door && d < 1.5 && npc.dist > 12) { this.remove(npc); return; }
      npc.goal = null; npc.stuckT = 0;
      if (npc.data.purpose) { npc.stateT = 0; if (d < 1.5) this.ctx.ambient?.onArrive?.(npc); return; }
      if (chance(0.45) || npc.leash) { npc.state = 'idle'; npc.stateT = 0; npc.idleFor = rand(1, 5); }
      return;
    }
    // jaywalkers hustle across the road instead of strolling down the middle of it
    npc.roadT = (npc.roadT ?? 0) - dt;
    if (npc.roadT <= 0) { npc.roadT = 0.5; npc.onRoad = !npc.hostile && !this.walkable(npc.pos.x, npc.pos.z); }
    const sp = npc.walk * (npc.leaving ? 1.6 : 1) * (npc.onRoad ? 2.4 : 1) * (npc.pose?.kind === 'cart' ? 0.6 : npc.data.purpose ? 1.1 : 1);
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

  // Sitting, lying, leaning, chatting. Ambient only; stands up when the timer runs out.
  _sPose(npc, dt) {
    npc.vx = npc.vz = 0;
    if (npc.hostile) { npc.state = 'hunt'; return; }
    const d = npc.data;
    if (d.poseT != null) {
      d.poseT -= dt;
      if (d.poseT <= 0) {
        d.poseT = null;
        d.purpose = true;
        npc.state = 'wander'; npc.stateT = 0; npc.goal = null;
        return;
      }
    }
    if (npc.dist < 6 && npc.barkCd <= 0 && chance(0.06)) {
      const k = npc.pose?.kind;
      const lines = POSE_BARKS[k];
      this.ctx.fx.say(npc.group, lines ? pick(lines) : line(npc.role, npc.kind), { ttl: 2.4, height: k === 'lie' ? 0.9 : k === 'sit' || k === 'ground' ? 1.7 : 2.35 });
      npc.barkCd = 14;
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
    // cops who lost sight of a wanted suspect sweep the area they were last seen in
    if (tp && npc.kind === 'cop' && !npc.brawlId) {
      const lk = this.ctx.police?.searchPointFor?.(npc.target);
      if (lk) { this._copSearch(npc, lk, dt); return; }
      npc.searchPt = null;
    }
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
    // a wanted driver who stopped: walk up and drag them out (src/npc/police.js runs the bust)
    if (npc.kind === 'cop' && inCar && this._targetCarSpeed(npc.target) < 2.5 && (this.ctx.police?._heatOf?.(npc.target) ?? 0) < 5) {
      if (d > 3.2) {
        const sp = d < 8 ? npc.run * 0.8 : npc.run;
        npc.vx = ux * sp; npc.vz = uz * sp;
        if (npc.stuckT > 0.35) { npc.avoidT = 0.6; npc.avoidSign = chance(0.5) ? 1 : -1; npc.stuckT = 0; }
        if (npc.avoidT > 0) { npc.avoidT -= dt; const a = npc.avoidSign * 1.1, c = Math.cos(a), s2 = Math.sin(a); npc.vx = (ux * c - uz * s2) * sp; npc.vz = (ux * s2 + uz * c) * sp; }
      } else {
        npc.vx = npc.vz = 0;
        if (npc.barkCd <= 0 && chance(0.3)) { fx.say(npc.group, pick(['OUT OF THE CAR!', "Hands where I can see 'em!", 'Step out of the vehicle, dirtbag!', "Unlock the door or I'm coming through the window!"]), { ttl: 1.6, kind: 'cop' }); npc.barkCd = 3; }
      }
      return;
    }
    if (def.kind === 'gun') {
      const shootRange = Math.min(def.range * 0.55, 24);
      const seen = d < shootRange && this._losCached(npc, tp);
      if (seen && d > 2.5) {
        npc.aiming = true;
        // strafe a little while shooting; back off if you get close
        const side = Math.sin(this.t * 0.9 + npc.punchSeq) > 0 ? 1 : -1;
        const want = d < 7 ? -1.2 : d > 14 ? 0.6 : 0;
        npc.vx = (ux * want + -uz * side * 0.5) * npc.walk * 1.3;
        npc.vz = (uz * want + ux * side * 0.5) * npc.walk * 1.3;
        // telegraph: a glint + "!" before the first shot of every volley
        if (!npc.sightT) {
          npc.sightT = this.t;
          npc.cd = Math.max(npc.cd, 0.6);
          this.ctx.fx.alert(npc.group, 'warn', 0.6, 2.55 * npc.scale);
          npc.model.windup?.(0.6, 'taser', TELE.normal);
        }
        if (npc.cd <= 0 && npc.stun <= 0 && !inCar) this._npcShoot(npc, tp, d);
        else if (npc.cd <= 0 && inCar && npc.kind === 'cop') this._npcShoot(npc, tp, d);
        return;
      }
      npc.sightT = 0;
    }
    const A = npc.A || ARCH.brawler;
    const reach = (def.kind === 'gun' ? 1.5 : def.range * 0.8 + 0.25) * (A.reach || 1);
    // mid-attack: hold still (wind-up tracks the target, a charge steers itself)
    if (npc.atk) {
      const a = npc.atk;
      if (a.phase === 'wind' && d > reach * 0.9 && a.kind !== 'slam' && a.kind !== 'taser' && a.kind !== 'charge') {
        const sp = npc.walk * (a.kind === 'lunge' ? 0.4 : 0.9);
        npc.vx = ux * sp; npc.vz = uz * sp;
      } else { npc.vx *= 0.3; npc.vz *= 0.3; }
      return;
    }
    if (npc.guard > 0) {
      // turtle up and shuffle in
      const sp = d > reach ? npc.walk * 0.6 : 0;
      npc.vx = ux * sp; npc.vz = uz * sp;
      return;
    }
    const ready = npc.cd <= 0 && npc.stun <= 0 && npc.pendingHit <= 0 && !inCar;
    // bosses: signature moves from range
    if (npc.boss && ready && !this._bossMove(npc, d, tp)) { /* fall through to normal fighting */ }
    if (npc.atk) return;
    // cops: taser from a few metres out
    if (A.taser && ready && npc.taserCd <= 0 && d > 2.8 && d < 8 && (this.ctx.police?._heatOf?.(npc.target) ?? 0) < 4 && this._losCached(npc, tp)) {
      this._beginAttack(npc, 'taser');
      return;
    }
    const tkey = this._tkey(npc.target);
    const busy = this.attackers.get(tkey) || 0;
    const myTurn = npc.boss || busy < this._maxAttackers(npc);
    const startReach = Math.max(reach, A.startReach || 0);
    if (d <= startReach + 0.15) {
      if (ready && myTurn) {
        const kind = A.lunge && d > reach * 0.9 ? 'lunge' : 'swing';
        this._beginAttack(npc, kind);
        this.attackers.set(tkey, busy + 1);
        if (chance(0.15) && npc.barkCd <= 0) {
          fx.say(npc.group, pick(npc.kind === 'cop' ? COP_YELL : TAUNTS), { ttl: 1.4, kind: npc.kind === 'cop' ? 'cop' : 'angry' });
          npc.barkCd = 4;
        }
        return;
      }
      if (!myTurn && npc.kind !== 'cop') { this._circle(npc, d, ux, uz, dt); return; }
      npc.vx *= 0.3; npc.vz *= 0.3;
      // cops "cuff" you if you stand still next to them (handled by police)
      return;
    }
    // waiting for a turn: circle at a respectful distance instead of piling on
    if (!myTurn && npc.kind !== 'cop' && d < 4.2 && !inCar) { this._circle(npc, d, ux, uz, dt); return; }
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

  _tkey(t) { return !t ? '-' : t.type === 'player' ? 'p' : t.type + ':' + t.id; }

  // How many of a group may swing at the same target at once.
  _maxAttackers(npc) {
    const t = npc.tier || 0;
    return t <= 1 ? 1 : t <= 4 ? 2 : 3;
  }

  // Waiting for a turn: strafe around the target at a ring distance, facing them.
  _circle(npc, d, ux, uz, dt) {
    npc.circleT -= dt;
    if (npc.circleT <= 0 || npc.stuckT > 0.3) { npc.circleSide *= -1; npc.circleT = rand(1.5, 3.5); npc.stuckT = 0; }
    const ring = 2.7 + (npc.punchSeq % 3) * 0.25;
    const radial = clamp(d - ring, -1, 1);
    const side = npc.circleSide * (d < ring + 1 ? 0.75 : 0.3);
    const sp = npc.walk * 1.5;
    npc.vx = (ux * radial + -uz * side) * sp;
    npc.vz = (uz * radial + ux * side) * sp;
    if (npc.barkCd <= 0 && npc.dist < 14 && chance(0.01)) { this.ctx.fx.say(npc.group, pick(TAUNTS), { ttl: 1.6, kind: 'angry' }); npc.barkCd = 6; }
  }

  // Start a telegraphed attack. kind: 'swing' | 'lunge' | 'combo' | 'charge' | 'slam' | 'taser'
  _beginAttack(npc, kind) {
    const A = npc.A || ARCH.brawler;
    const fx = this.ctx.fx;
    const enr = npc.boss?.enraged ? 0.8 : 1;
    let wind = A.wind * enr;
    let style = A.style || (npc.wdef?.swing === 'overhead' ? 'overhead' : null);
    if (style === 'heavy' && npc.wdef?.swing === 'overhead') style = 'overhead';
    let color = A.heavy ? TELE.heavy : TELE.normal;
    let alert = A.heavy ? 'danger' : 'warn';
    if (kind === 'charge') { wind = 0.85 * enr; style = 'charge'; color = TELE.heavy; alert = 'danger'; }
    else if (kind === 'slam') { wind = 0.95 * enr; style = 'slam'; color = TELE.heavy; alert = 'danger'; fx.dangerRing(npc.pos.x, npc.pos.z, 3.1, wind, 0xff3a12, npc.group); }
    else if (kind === 'combo') { wind = A.wind * 0.9 * enr; }
    else if (kind === 'taser') { wind = 0.65; style = 'taser'; color = TELE.taser; alert = 'warn'; }
    else if (kind === 'lunge') { style = 'slash'; }
    npc.atk = { kind, phase: 'wind', t: wind, style, hits: kind === 'combo' ? 3 : 1, hit: false };
    npc.windSeq++;
    npc.model.windup?.(wind, style, color);
    fx.alert(npc.group, alert, wind, 2.55 * npc.scale);
    if (npc.dist < 18) fx.sfx.play('tell', { pos: npc.pos, vol: kind === 'charge' || kind === 'slam' ? 1 : 0.6 });
    if (kind === 'charge' && npc.dist < 30) fx.say(npc.group, pick(['RAAAAH!', 'HERE I COME!', 'TIMBERRR!', 'OUTTA MY WAY!']), { ttl: 1.2, kind: 'angry' });
  }

  // Boss signature moves. Returns true if one started.
  _bossMove(npc, d, tp) {
    const B = npc.boss;
    if (B.moves.has('summon') && !B.summoned && npc.hp < npc.maxHp * 0.55) {
      B.summoned = true;
      try { this.ctx.combat?._summon?.(npc); } catch (e) { console.error('[npc] summon failed', e); }
      this.ctx.fx.say(npc.group, pick(['BOYS! GET IN HERE!', 'Somebody HELP me hit this guy!', 'Backup! BACKUP!']), { ttl: 2, kind: 'angry' });
    }
    if (!B.enraged && npc.hp < npc.maxHp * 0.4) {
      B.enraged = true;
      npc.run *= 1.15; npc.walk *= 1.15;
      npc.model.windup?.(0.01, null, TELE.heavy);
      this.ctx.fx.say(npc.group, pick(['NOW I\'M MAD.', 'You made me spill my dignity!', 'THAT\'S IT!', 'No more Mr. Nice Goon!']), { ttl: 2, kind: 'angry' });
      this.ctx.fx.sfx.play('bell', { vol: 0.5 });
    }
    if (B.moves.has('charge') && B.chargeCd <= 0 && d > 4.5 && d < 18 && this._losCached(npc, tp)) {
      B.chargeCd = rand(6, 9) * (B.enraged ? 0.7 : 1);
      this._beginAttack(npc, 'charge');
      return true;
    }
    if (B.moves.has('slam') && B.slamCd <= 0 && d < 3.2 && chance(0.5)) {
      B.slamCd = rand(6.5, 9.5) * (B.enraged ? 0.75 : 1);
      this._beginAttack(npc, 'slam');
      return true;
    }
    const reach = (npc.wdef.range * 0.8 + 0.25) * (npc.A?.reach || 1);
    if (d <= reach + 0.15) {
      this._beginAttack(npc, B.moves.has('combo') && chance(0.45) ? 'combo' : 'swing');
      return true;
    }
    return false;
  }

  // Advance an attack. Returns true when it controls movement this tick (charging).
  _updateAttack(npc, dt) {
    const a = npc.atk;
    const A = npc.A || ARCH.brawler;
    a.t -= dt;
    const tp = this._targetPos(npc.target);
    if (!tp && a.phase === 'wind') { this._cancelAttack(npc); return false; }
    if (a.phase === 'wind') {
      if (tp && a.kind !== 'charge') npc.faceTo = Math.atan2(tp.x - npc.pos.x, tp.z - npc.pos.z);
      if (tp && a.kind === 'charge') { a.dir = { x: tp.x - npc.pos.x, z: tp.z - npc.pos.z }; npc.faceTo = Math.atan2(a.dir.x, a.dir.z); }
      if (a.t <= 0) this._strike(npc, a, tp);
      return false;
    }
    if (a.phase === 'strike') {
      if (a.kind === 'charge') return this._chargeStep(npc, a, tp, dt);
      if (a.kind === 'slam' && !a.hit && a.t < 0.25) { a.hit = true; this._slamHit(npc); }
      if (a.t <= 0) {
        if (a.hits > 1 && npc.stun <= 0) {
          a.hits--;
          a.t = 0.3;
          npc.model.punch(0.24, a.hits === 1 ? 'uppercut' : (a.hits % 2 ? 'jab' : 'cross'));
          npc.punchSeq++;
          npc.pendingHit = 0.08;
          if (tp) npc.faceTo = Math.atan2(tp.x - npc.pos.x, tp.z - npc.pos.z);
        } else { a.phase = 'recover'; a.t = A.recover; }
      }
      return false;
    }
    if (a.t <= 0) {
      npc.atk = null;
      npc.cd = (npc.wdef?.rate || 0.5) * 1.1 + rand(0.25, 0.8) + (npc.kind === 'drunk' ? 0.5 : 0) + (npc.boss ? -0.2 : 0);
    }
    return false;
  }

  _strike(npc, a, tp) {
    const fx = this.ctx.fx;
    a.phase = 'strike';
    fx.clearAlert(npc.group);
    if (a.kind === 'taser') {
      npc.taserCd = rand(7, 10);
      a.phase = 'recover'; a.t = 0.7;
      npc.model.cancelWindup?.();
      if (!tp) return;
      const m = this.muzzlePos(npc);
      const d = Math.hypot(tp.x - npc.pos.x, tp.z - npc.pos.z);
      fx.sfx.play('taser', { pos: npc.pos });
      const hit = d < 9.5 && this.los(npc.pos.x, npc.pos.z, tp.x, tp.z);
      fx.tracer(m.x, m.y, m.z, tp.x + (hit ? 0 : rand(-1, 1)), 1.1, tp.z + (hit ? 0 : rand(-1, 1)));
      if (hit) this.ctx.combat?.hurtTarget(npc, npc.target, 3, { dir: { x: (tp.x - npc.pos.x) / (d || 1), z: (tp.z - npc.pos.z) / (d || 1) }, taser: true });
      return;
    }
    if (a.kind === 'charge') {
      const l = Math.hypot(a.dir?.x || 0, a.dir?.z || 0) || 1;
      a.dir = { x: (a.dir?.x || Math.sin(npc.facing)) / l, z: (a.dir?.z || Math.cos(npc.facing)) / l };
      a.t = 1.0;
      fx.sfx.play('whoosh', { pos: npc.pos, vol: 1 });
      return;
    }
    if (a.kind === 'slam') {
      npc.model.punch(0.4, 'slam');
      npc.punchSeq++;
      a.t = 0.4;
      return;
    }
    npc.model.punch(a.kind === 'combo' ? 0.24 : 0.28, a.style || null);
    npc.punchSeq++;
    npc.pendingHit = 0.09;
    a.t = a.kind === 'combo' ? 0.3 : 0.22;
    if (a.kind === 'lunge' && tp) {
      const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z, d = Math.hypot(dx, dz) || 1;
      const L = Math.min(npc.A?.lunge || 6, d * 3.2);
      npc.kbx += dx / d * L; npc.kbz += dz / d * L;
    }
  }

  // Bull rush: straight line, unblockable, knocks you flat. Smacks into walls and gets dazed.
  _chargeStep(npc, a, tp, dt) {
    const sp = 13 * (npc.boss?.enraged ? 1.1 : 1);
    npc.vx = a.dir.x * sp; npc.vz = a.dir.z * sp;
    npc.faceTo = Math.atan2(a.dir.x, a.dir.z);
    if (!a.hit && tp && Math.hypot(tp.x - npc.pos.x, tp.z - npc.pos.z) < 1.25 + npc.radius) {
      a.hit = true;
      const def = npc.wdef;
      const dmg = Math.max(4, Math.round(def.damage * npc.dmgMult * 1.7 * (npc.tierMult || 1)));
      this.ctx.fx.sfx.play('heavy', { pos: npc.pos });
      this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: a.dir.x, z: a.dir.z }, melee: true, unblockable: true, knockdown: true, heavyHit: true });
      a.phase = 'recover'; a.t = 0.9; npc.vx = npc.vz = 0;
      return false;
    }
    if (a.t < 0.85 && npc.stuckT > 0.04) {
      // wall!
      npc.atk = null; npc.vx = npc.vz = 0;
      npc.stun = 1.8;
      npc.cd = 2;
      npc.kbx = -a.dir.x * 3; npc.kbz = -a.dir.z * 3;
      this.ctx.fx.sfx.play('smack', { pos: npc.pos });
      this.ctx.fx.alert(npc.group, 'stun', 1.8, 2.55 * npc.scale);
      if (npc.dist < 30) { this.ctx.fx.say(npc.group, pick(['ow. my everything.', '*sees birds*', 'Who put a WALL there?!']), { ttl: 1.8 }); this.game.cameraRig?.shake?.(0.2, 0.2); }
      return true;
    }
    if (a.t <= 0) { a.phase = 'recover'; a.t = 0.6; }
    return true;
  }

  _slamHit(npc) {
    const fx = this.ctx.fx;
    fx.sfx.play('slam', { pos: npc.pos });
    for (let k = 0; k < 10; k++) fx._gib(npc.pos.x + rand(-1.5, 1.5), 0.1, npc.pos.z + rand(-1.5, 1.5), null, 0x6a6258, 0.9);
    if (npc.dist < 14) this.game.cameraRig?.shake?.(0.35, 0.3);
    const tp = this._targetPos(npc.target);
    if (!tp) return;
    const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z, d = Math.hypot(dx, dz);
    if (d > 3.1 || this._targetInVehicle(npc.target)) return;
    const dmg = Math.max(4, Math.round(npc.wdef.damage * npc.dmgMult * 1.5 * (npc.tierMult || 1)));
    this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: dx / (d || 1), z: dz / (d || 1) }, melee: true, heavyHit: true, knockdown: true });
  }

  _copSearch(npc, lk, dt) {
    if (!npc.searchPt || Math.hypot(npc.searchPt.x - npc.pos.x, npc.searchPt.z - npc.pos.z) < 3 || npc.stuckT > 1) {
      const first = !npc.searchPt && Math.hypot(lk.x - npc.pos.x, lk.z - npc.pos.z) > 6;
      const a = Math.random() * TAU, r = rand(4, 22);
      npc.searchPt = first ? { x: lk.x, z: lk.z } : { x: lk.x + Math.sin(a) * r, z: lk.z + Math.cos(a) * r };
      npc.stuckT = 0;
    }
    const dx = npc.searchPt.x - npc.pos.x, dz = npc.searchPt.z - npc.pos.z, d = Math.hypot(dx, dz) || 1;
    const sp = npc.run * 0.6;
    npc.vx = (dx / d) * sp; npc.vz = (dz / d) * sp;
    if (npc.barkCd <= 0 && npc.dist < 30 && chance(0.01)) { this.ctx.fx.say(npc.group, pick(["Where'd he go?!", 'Check the dumpsters!', 'I swear he was right here.', 'Dispatch, we lost visual.']), { ttl: 2, kind: 'cop' }); npc.barkCd = 8; }
  }

  _losCached(npc, tp) {
    npc.losT -= 1;
    if (npc.losT <= 0) { npc.losT = 6; npc.losOk = this.los(npc.pos.x, npc.pos.z, tp.x, tp.z); }
    return npc.losOk;
  }

  _sFlee(npc, dt) {
    const from = npc.fleePoint || this._targetPos(npc.fleeFrom) || this.game.player.group.position;
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
      npc.state = 'wander'; npc.stateT = 0; npc.goal = null; npc.fleeRolled = false; npc.fleePoint = null;
      if (npc.brawlId) npc.state = 'hunt';
    }
  }

  _resolveNpcMelee(npc) {
    const tp = this._targetPos(npc.target);
    if (!tp || npc.dead) return;
    const dx = tp.x - npc.pos.x, dz = tp.z - npc.pos.z;
    const d = Math.hypot(dx, dz);
    const def = npc.wdef;
    if (d > (def.range * 0.8 + 0.8) * ((npc.A?.reach) || 1)) { this.ctx.fx.sfx.play('whoosh', { pos: npc.pos, vol: 0.5 }); return; }
    if (this._targetInVehicle(npc.target)) return;
    const A = npc.A || ARCH.brawler;
    const last = npc.atk?.kind === 'combo' && npc.atk.hits <= 1;
    const dmg = Math.max(2, Math.round(def.damage * npc.dmgMult * (A.dmg || 1) * (last ? 1.3 : 1) * rand(0.85, 1.15) * (npc.tierMult || 1)));
    const sfx = def.swing === 'overhead' || npc.weapon === 'bat' || npc.weapon === 'baton' ? 'smack' : (npc.weapon === 'knife' || npc.weapon === 'machete' || npc.weapon === 'bottle') ? 'slash' : 'punch';
    this.ctx.fx.sfx.play(sfx, { pos: npc.pos });
    this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: dx / (d || 1), z: dz / (d || 1) }, melee: true, heavyHit: !!A.heavy || last });
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
      const fleet = this.game.vehicles?.police;
      if (npc.kind === 'cop' && fleet && this._targetInVehicle(npc.target)) {
        // cops aim for the tires (and the paint job)
        fleet.shootTarget(npc.target, Math.round(dmg * 0.6), 0.3, npc.name);
      } else this.ctx.combat?.hurtTarget(npc, npc.target, dmg, { dir: { x: (tp.x - npc.pos.x) / d, z: (tp.z - npc.pos.z) / d }, gun: true });
    }
    if (chance(0.35)) this.ctx.ambient?.panic(npc.pos.x, npc.pos.z, 22);
    try { this.game.net.connected && this.game.net.broadcast({ t: 'combat:shot', x: muzzle.x, y: muzzle.y, z: muzzle.z, x2: tp.x + ox, z2: tp.z + oz, w: npc.weapon, n: 1 }); } catch { /* ignore */ }
  }

  _targetCarSpeed(t) {
    if (t?.type === 'player') return this.game.player?.vehicle?.speed ?? 0;
    if (t?.type === 'remote') return Math.abs(Number(this.game.net.remotePlayers?.get?.(t.id)?.vehicle?.speed) || 0);
    return 0;
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
      const flags = (npc.dead ? 1 : 0) | (npc.hostile ? 2 : 0) | (npc.aiming ? 4 : 0) | (npc.ko ? 8 : 0) | (npc.knockdown > 0 ? 16 : 0)
        | (npc.atk?.phase === 'wind' ? 32 : 0) | (npc.guard > 0 ? 64 : 0) | (npc.boss?.enraged ? 128 : 0);
      const rec = [npc.id, Math.round(npc.pos.x * 50) / 50, Math.round(npc.pos.z * 50) / 50, Math.round(npc.facing * 100) / 100,
        Math.round(npc.hp), flags, npc.punchSeq, npc.shotSeq];
      if (meta || !npc.metaSent) {
        npc.metaSent = true;
        rec.push({ k: npc.kind, r: npc.role, nm: npc.name, c: npc.color, h: npc.hat, hc: npc.hatColor, s: npc.scale, w: npc.weapon, m: npc.maxHp, f: npc.faction, b: npc.brawlId, bo: npc.boss?.name || undefined, ar: npc.arch, ti: npc.tier || 0 });
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
          weapon: meta.w, hp, maxHp: meta.m, faction: meta.f, networked: true, _replica: true, x, z, facing: f, brawlId: meta.b,
          bossName: meta.bo || null, arch: meta.ar, tier: meta.ti });
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
        npc.model.setDead(dead, { fall: true });
        if (dead) { npc.deadT = 0; this.ctx.fx.blood(npc.pos.x, npc.pos.z, 2, null, 0.4); this.ctx.combat?.onReplicaDown?.(npc); }
      } else if (!dead && kd !== !!npc.kdShown) {
        npc.kdShown = kd;
        npc.model.setDead(kd, { fall: true });
      }
      // telegraphs & guard on replicas
      const wind = !!(flags & 32), guard = !!(flags & 64);
      npc.enragedRep = !!(flags & 128);
      if (wind && !npc.windRep && !dead) {
        const A = ARCH[npc.arch] || ARCH.brawler;
        npc.model.windup?.(A.wind, A.style, A.heavy ? TELE.heavy : TELE.normal);
        this.ctx.fx.alert(npc.group, A.heavy ? 'danger' : 'warn', A.wind, 2.55 * npc.scale);
      }
      npc.windRep = wind;
      if (guard !== !!npc.guardRep) { npc.guardRep = guard; npc.model.setBlock?.(guard); }
      if (ps !== npc.punchSeq) { npc.punchSeq = ps; npc.model.punch(0.3, (ARCH[npc.arch] || ARCH.brawler).style); }
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
