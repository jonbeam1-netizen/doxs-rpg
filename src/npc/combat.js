import * as THREE from 'three';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { clamp, rand, randInt, pick, chance, fmtMoney, esc } from '../core/util.js';
import { weaponDef, weaponMesh, MUZZLE } from './weapons-mesh.js';
import { DEATH_SUBS, KO_SUBS, TAUNTS } from './names.js';

const CRITS = ['CRIT!', 'NUT SHOT!', 'BONK!', 'WHAP!', 'FACE!', 'SPLAT!', 'KAPOW!', 'OOF!'];
const GUN_CRITS = ['HEADSHOT!', 'RIGHT IN THE DIGNITY!', 'BULLSEYE!', 'DOUBLE TAP!'];
const ROLE_REWARD = {
  ped: { xp: 6, cash: [2, 25] }, worker: { xp: 8, cash: [5, 30] }, snob: { xp: 6, cash: [30, 150] }, shady: { xp: 10, cash: [10, 60] },
  hobo: { xp: 4, cash: [0, 4] }, drunk: { xp: 8, cash: [1, 15] }, thug: { xp: 18, cash: [5, 45] }, gang: { xp: 22, cash: [10, 70] },
  cop: { xp: 25, cash: [0, 20] }, swat: { xp: 45, cash: [0, 0] }, fighter: { xp: 15, cash: [0, 10] }, dealer: { xp: 20, cash: [40, 160] },
  static: { xp: 0, cash: [0, 0] },
};
const INNOCENT = new Set(['ped', 'worker', 'snob', 'shady', 'hobo', 'drunk', 'dealer', 'static']);
const ITEM_CANDIDATES = ['beer', 'cigarettes', 'cigs', 'bandage', 'energy_drink', 'donut', 'chips', 'lottery_ticket', 'scratcher', 'condom', 'gum', 'hotdog', 'whiskey', 'painkillers'];

export class Combat {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.cd = 0;
    this.swing = null;
    this.faceT = 0;
    this.reloadT = 0;
    this.isDown = false;
    this.deathT = 0;
    this.downT = 0;
    this.brawls = new Map();
    this.pendingBrawls = new Map();
    this.brawlSeq = 1;
    this._wObj = null; this._wId = null; this._wModel = null;
    this._aim = { x: 0, z: 0, npc: null, y: 1.25 };
    this._v = new THREE.Vector3();
    this.ITEMS = null; this.DRUGS = null;
    import('../data/items.js').then((m) => { this.ITEMS = m.ITEMS || m.default || null; }).catch(() => {});
    import('../data/drugs.js').then((m) => { this.DRUGS = m.DRUGS || m.default || null; }).catch(() => {});

    // crosshair
    const root = document.getElementById('ui-root') || document.body;
    this.cross = document.createElement('div');
    this.cross.id = 'npc-crosshair';
    this.cross.innerHTML = '<i class="h l"></i><i class="h r"></i><i class="v t"></i><i class="v b"></i><i class="d"></i>';
    root.appendChild(this.cross);

    game.bus.on('player:model-rebuilt', () => { this._wModel = null; });
    game.bus.on('player:died', (d) => this.onPlayerDied(d));
    game.bus.on('state:reset', () => { this._wModel = null; this.isDown = false; this.deathT = 0; });
  }

  // ------------------------------------------------------------ weapons
  get p() { return this.game.state.p; }
  get weaponId() {
    const p = this.p;
    if (!p.weapons?.length) p.weapons = ['fists'];
    if (!p.weapons.includes('fists')) p.weapons.unshift('fists');
    return WEAPONS[p.weapon] && p.weapons.includes(p.weapon) ? p.weapon : 'fists';
  }
  get weapon() { return WEAPONS[this.weaponId]; }

  equip(id) {
    const p = this.p;
    if (!WEAPONS[id]) return false;
    if (!p.weapons.includes(id)) p.weapons.push(id);
    p.weapon = id;
    this.reloadT = 0;
    this.swing = null;
    const def = WEAPONS[id];
    if (def.kind === 'gun') {
      p.mags = p.mags || {};
      if (p.mags[id] == null) { p.mags[id] = 0; this._loadMag(id, true); }
    }
    if (def.reqStr && p.str < def.reqStr) this.game.ui.toast(`${def.name}: you're too weak to swing this properly (need ${def.reqStr} STR). Hits like a wet noodle.`, 'bad', 2600);
    this.game.state.changed('weapon');
    this.game.bus.emit('weapon:equipped', { id });
    this.ctx.fx.sfx.play(def.kind === 'gun' ? 'reload' : 'whoosh', { vol: 0.5 });
    return true;
  }

  giveWeapon(id, ammo = 0) {
    const p = this.p;
    if (!WEAPONS[id]) return false;
    if (!p.weapons.includes(id)) p.weapons.push(id);
    const def = WEAPONS[id];
    if (def.ammo && ammo) this.giveAmmo(def.ammo, ammo);
    this.game.state.changed('weapons');
    return true;
  }

  giveAmmo(type, n) {
    const p = this.p;
    p.ammo = p.ammo || {};
    p.ammo[type] = Math.max(0, (p.ammo[type] || 0) + n);
    this.game.state.changed('ammo');
  }

  cycle(dir = 1) {
    const owned = this.p.weapons.filter((w) => WEAPONS[w]);
    if (owned.length <= 1) { this.game.ui.toast('All you\'ve got is your fists. And your sparkling personality.', 'info', 1600); return; }
    const i = owned.indexOf(this.weaponId);
    this.equip(owned[(i + dir + owned.length) % owned.length]);
  }

  _loadMag(id, instant = false) {
    const def = WEAPONS[id];
    const p = this.p;
    p.mags = p.mags || {}; p.ammo = p.ammo || {};
    const have = p.mags[id] || 0;
    const take = Math.min(def.mag - have, p.ammo[def.ammo] || 0);
    if (take <= 0) return false;
    p.mags[id] = have + take;
    p.ammo[def.ammo] -= take;
    if (!instant) this.ctx.fx.sfx.play('reload');
    this.game.state.changed('ammo');
    return true;
  }

  startReload() {
    const id = this.weaponId, def = WEAPONS[id];
    if (def.kind !== 'gun' || this.reloadT > 0) return;
    const p = this.p;
    if ((p.mags?.[id] || 0) >= def.mag) return;
    if (!(p.ammo?.[def.ammo] > 0)) {
      if (!this._noAmmoT || this._noAmmoT < this.game.elapsed) {
        this.game.ui.toast(`Out of ${AMMO[def.ammo]?.name?.split('(')[0]?.trim() || 'ammo'}. Bang Bang Bros. sells more.`, 'bad', 2000);
        this._noAmmoT = this.game.elapsed + 3;
      }
      this.ctx.fx.sfx.play('click');
      return;
    }
    this.reloadT = id === 'rifle' ? 1.6 : id === 'shotgun' ? 1.0 : id === 'revolver' ? 1.4 : 1.1;
    this._reloadId = id;
    this.ctx.fx.sfx.play('click', { vol: 0.6 });
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game, pl = g.player;
    if (!pl) return;
    this._syncWeaponMesh();
    this.cd -= dt;

    // death / knockout timers run regardless of UI
    if (this.deathT > 0) { this.deathT -= dt; if (this.deathT <= 0) this.respawn(); }
    if (this.downT > 0) { this.downT -= dt; if (this.downT <= 0) this.getUp(); }

    const def = this.weapon;
    const id = this.weaponId;
    const canFight = g.started && !g.controlsLocked && !pl.dead && !pl.vehicle && !pl.moveLocked && !this.isDown;
    const gun = def.kind === 'gun';
    pl.aiming = canFight && gun;
    pl.swingStyle = def.swing || null;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this._reloadId !== id) this.reloadT = 0;
      else if (this.reloadT <= 0) this._loadMag(id);
    }

    if (this.faceT > 0) { this.faceT -= dt; if (this.faceT <= 0 && !pl.aiming) pl.faceOverride = null; }
    if (pl.aiming) pl.faceOverride = g.cameraRig.yaw + Math.PI;
    else if (this.faceT <= 0 && pl.faceOverride != null && this._ownsFace) { pl.faceOverride = null; }
    this._ownsFace = pl.aiming || this.faceT > 0;

    if (this.swing) {
      this.swing.t -= dt;
      if (this.swing.t <= 0) { const s = this.swing; this.swing = null; this._resolveSwing(s); }
    }

    if (canFight) {
      const inp = g.input;
      if (inp.wasPressed('KeyQ')) this.cycle(inp.isDown('ShiftLeft') ? -1 : 1);
      if (inp.wasPressed('KeyR')) this.startReload();
      if (this.cd <= 0) {
        const auto = id === 'smg' || def.kind === 'melee';
        const trig = auto ? inp.mouseDown(0) : inp.mouseClicked(0);
        if (trig) { if (gun) this.shoot(def, id); else this.melee(def, id); }
      }
    }

    this._updateCrosshair(pl.aiming);
    this._updateHud(def, id);
    this._updateBrawls(dt);
  }

  _syncWeaponMesh() {
    const pl = this.game.player;
    const model = pl.model;
    const id = this.weaponId;
    if (model === this._wModel && id === this._wId) return;
    if (this._wObj) this._wObj.removeFromParent();
    this._wObj = weaponMesh(id);
    if (this._wObj) model.rightHand.add(this._wObj);
    this._wModel = model; this._wId = id;
  }

  _updateHud(def, id) {
    let html;
    const n = this.p.weapons.filter((w) => WEAPONS[w]).length;
    const q = n > 1 ? ' <small style="opacity:.5;font-size:13px">[Q]</small>' : '';
    if (def.kind === 'gun') {
      const mag = this.p.mags?.[id] ?? 0;
      const pool = this.p.ammo?.[def.ammo] ?? 0;
      const rl = this.reloadT > 0 ? ' <span style="color:#d6b33c">RELOADING</span>' : mag === 0 ? ' <span style="color:#e2402f">[R]</span>' : '';
      html = `${def.name} <b style="color:${mag ? '#e6dfcf' : '#e2402f'}">${mag}/${def.mag}</b> <span style="opacity:.7">[${pool}]</span>${rl}${q}`;
    } else html = `${def.name}${q}`;
    this.game.ui.setHud('weapon', html);
  }

  // ------------------------------------------------------------ aiming helpers
  _aimBase() {
    const pl = this.game.player;
    const yaw = this.game.cameraRig.yaw;
    return { ox: pl.pos.x, oz: pl.pos.z, ang: Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) };
  }

  // 2D hitscan along angle `ang` from (ox,oz). Returns { t, npc, maxT }.
  _cast(ox, oz, ang, range) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    // start the wall check a bit in front of the player so standing against a wall still works sideways
    const frac = this.game.physics.raycast(ox, oz, ox + dx * range, oz + dz * range, 0.4, 1.0);
    const maxT = range * frac;
    let best = null, bt = maxT;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.dead) continue;
      const rx = n.pos.x - ox, rz = n.pos.z - oz;
      const t = rx * dx + rz * dz;
      if (t <= 0.2 || t >= bt) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      const hr = 0.42 * n.scale + 0.1;
      if (px * px + pz * pz <= hr * hr) { bt = t; best = n; }
    }
    return { t: bt, npc: best, dx, dz, maxT };
  }

  _updateCrosshair(on) {
    const el = this.cross;
    if (!on) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const def = this.weapon;
    const { ox, oz, ang } = this._aimBase();
    const c = this._cast(ox, oz, ang, def.range);
    const v = this._v.set(ox + c.dx * c.t, 1.25, oz + c.dz * c.t).project(this.game.camera);
    el.style.display = 'block';
    if (v.z < 1) {
      el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px';
      el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
    }
    el.classList.toggle('hit', !!c.npc);
    el.classList.toggle('reload', this.reloadT > 0);
    const spread = (def.spread || 0) * (this.game.player.speed > 1 ? 1.6 : 1);
    el.style.transform = `scale(${(1 + spread * 8).toFixed(2)})`;
  }

  // ------------------------------------------------------------ player melee
  melee(def, id) {
    const g = this.game, pl = g.player;
    this.cd = def.rate;
    const { ang } = this._aimBase();
    let dx = Math.sin(ang), dz = Math.cos(ang);
    // move direction wins if the player is running somewhere
    if (pl.speed > 2.5 && !pl.aiming) { dx = Math.sin(pl.facing); dz = Math.cos(pl.facing); }
    // soft lock-on: nearest living NPC in a wide cone
    let best = null, bd = def.range + 1.4;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, def.range + 1.4)) {
      const rx = n.pos.x - pl.pos.x, rz = n.pos.z - pl.pos.z;
      const d = Math.hypot(rx, rz) || 0.01;
      const dot = (rx * dx + rz * dz) / d;
      const score = d - dot * 1.2 - (n.hostile ? 0.6 : 0);
      if (dot > 0.2 && score < bd) { bd = score; best = n; }
    }
    if (best) {
      const rx = best.pos.x - pl.pos.x, rz = best.pos.z - pl.pos.z, d = Math.hypot(rx, rz) || 1;
      dx = rx / d; dz = rz / d;
    }
    pl.faceOverride = Math.atan2(dx, dz);
    this.faceT = Math.max(0.3, def.rate * 0.8);
    pl.swingStyle = def.swing || null;
    const dur = clamp(def.rate * 0.75, 0.22, 0.55);
    pl.model.punch(dur);
    g.bus.emit('player:attack', { duration: dur, weapon: id, swingStyle: def.swing || null });
    this.swing = { t: dur * 0.42, dx, dz, def, id };
    this.ctx.fx.sfx.play('whoosh', { vol: 0.5 + def.damage / 60 });
  }

  _resolveSwing(s) {
    const g = this.game, pl = g.player, p = this.p;
    if (pl.dead || this.isDown) return;
    const { def, dx, dz } = s;
    const reach = def.range + 0.35;
    const maxHits = def.swing === 'overhead' || def.damage >= 30 ? 3 : s.id === 'fists' ? 1 : 2;
    const cands = [];
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, reach + 0.6)) {
      const rx = n.pos.x - pl.pos.x, rz = n.pos.z - pl.pos.z;
      const d = Math.hypot(rx, rz) || 0.01;
      if (d - n.radius > reach) continue;
      if ((rx * dx + rz * dz) / d < 0.35 && d > 0.7) continue;
      cands.push([d, n]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const weak = def.reqStr && p.str < def.reqStr ? 0.6 : 1;
    let hitAny = false, biggest = 0;
    for (const [, n] of cands.slice(0, maxHits)) {
      const crit = chance(0.1 + Math.min(0.1, p.str / 1000));
      let dmg = (def.damage + p.str * 0.35) * weak * rand(0.88, 1.12);
      if (crit) dmg *= 1.6;
      dmg = Math.round(dmg);
      const heavy = crit || def.damage >= 20;
      const kb = 3 + def.damage * 0.18 + (crit ? 4 : 0);
      this.hitNpc(n, dmg, { dir: { x: dx, z: dz }, kb, heavy, melee: true });
      if (crit) this.ctx.fx.number(n.pos.x, 2.6 * n.scale, n.pos.z, pick(CRITS), 'big');
      hitAny = true;
      biggest = Math.max(biggest, dmg);
    }
    if (hitAny) {
      const snd = def.swing === 'overhead' || s.id === 'bat' ? 'smack' : ['knife', 'machete', 'bottle'].includes(s.id) ? 'slash' : 'punch';
      this.ctx.fx.sfx.play(snd);
      g.cameraRig?.shake?.(clamp(0.08 + biggest / 220, 0.08, 0.4), 0.18);
      // tiny lunge forward
      pl.vel.x += dx * 2.5; pl.vel.y += dz * 2.5;
    }
  }

  // Player (local) damages an NPC; handles crimes. Returns damage() result.
  hitNpc(n, dmg, opts) {
    const wasAggro = !!n.aggressor || n.hostile && n.target?.type === 'player';
    const res = this.ctx.npcs.damage(n.id, dmg, 'local', opts);
    if ((n.kind === 'cop' || !wasAggro) && !n.brawlId && !n.assaulted && n.kind !== 'static') {
      n.assaulted = true;
      this.ctx.police?.crime(n.kind === 'cop' ? 'assaultCop' : 'assault', n.pos.x, n.pos.z, n);
    }
    return res;
  }

  // ------------------------------------------------------------ player guns
  shoot(def, id) {
    const g = this.game, pl = g.player, p = this.p;
    if (this.reloadT > 0) return;
    p.mags = p.mags || {};
    if (!(p.mags[id] > 0)) {
      this.cd = 0.25;
      if (p.ammo?.[def.ammo] > 0) this.startReload();
      else { this.ctx.fx.sfx.play('click'); this.startReload(); }
      return;
    }
    p.mags[id]--;
    this.cd = def.rate;
    g.bus.emit('player:attack', { duration: 0.12, weapon: id, gun: true });
    const fx = this.ctx.fx;
    const { ox, oz, ang } = this._aimBase();
    const hand = pl.model.rightHand;
    hand.updateWorldMatrix(true, false);
    const muzzle = hand.localToWorld(this._v.set(0, -(MUZZLE[id] ?? 0.25), 0)).clone();
    const pellets = def.pellets || 1;
    const spread = (def.spread || 0) * (pl.speed > 1 ? 1.6 : 1);
    const hits = new Map();
    const shots = [];
    for (let i = 0; i < pellets; i++) {
      const a = ang + rand(-spread, spread);
      const c = this._cast(ox, oz, a, def.range);
      const ex = ox + c.dx * c.t, ez = oz + c.dz * c.t;
      fx.tracer(muzzle.x, muzzle.y, muzzle.z, ex, 1.15 + rand(-0.15, 0.2), ez);
      shots.push([Math.round(ex * 10) / 10, Math.round(ez * 10) / 10]);
      if (c.npc) {
        const falloff = pellets > 1 ? clamp(1.15 - c.t / def.range, 0.35, 1) : 1;
        hits.set(c.npc, (hits.get(c.npc) || 0) + def.damage * falloff);
      } else if (c.t < c.maxT + 0.01 && c.maxT < def.range - 0.1) {
        // wall puff
        for (let k = 0; k < 3; k++) fx._gib(ex - c.dx * 0.2, rand(0.8, 1.6), ez - c.dz * 0.2, { x: -c.dx, z: -c.dz }, 0x8a8478, 0.7);
      }
    }
    for (const [n, raw] of hits) {
      const crit = chance(pellets > 1 ? 0.04 : 0.1);
      const dmg = Math.round(raw * rand(0.92, 1.08) * (crit ? 1.6 : 1));
      const kb = pellets > 1 ? 2 + raw * 0.12 : 1.2 + def.damage * 0.06;
      const dir = { x: Math.sin(ang), z: Math.cos(ang) };
      this.hitNpc(n, dmg, { dir, kb, heavy: raw >= 40, gun: true });
      if (crit) fx.number(n.pos.x, 2.6 * n.scale, n.pos.z, pick(GUN_CRITS), 'big');
    }
    const big = id === 'shotgun' || id === 'rifle' || id === 'revolver' || id === 'goldengun';
    fx.muzzle(muzzle.x, muzzle.y, muzzle.z, big ? 0.9 : 0.6);
    fx.sfx.play(id === 'shotgun' ? 'shotgun' : id === 'smg' ? 'smg' : big ? 'biggun' : 'gun');
    g.cameraRig?.shake?.(id === 'shotgun' ? 0.3 : big ? 0.22 : id === 'smg' ? 0.05 : 0.1, 0.15);
    // recoil kick: twitch the camera up a hair
    g.cameraRig.pitch = clamp(g.cameraRig.pitch - (big ? 0.025 : 0.008), -0.15, 1.35);
    this.ctx.police?.crime('gunfire', ox, oz);
    this.ctx.ambient?.panic(ox, oz, 28);
    try { if (g.net.connected) g.net.broadcast({ t: 'combat:shot', x: muzzle.x, y: muzzle.y, z: muzzle.z, s: shots, w: id }); } catch { /* ignore */ }
    if (p.mags[id] === 0 && p.ammo?.[def.ammo] > 0) this.startReload();
    if (!this._magTick || this._magTick < g.elapsed) { this._magTick = g.elapsed + 1; g.state.changed('ammo'); }
  }

  // Other players' shots (cosmetic).
  remoteShot(msg) {
    const fx = this.ctx.fx;
    const shots = msg.s || [[msg.x2, msg.z2]];
    for (const [x, z] of shots) fx.tracer(msg.x, msg.y, msg.z, x, 1.2, z);
    fx.muzzle(msg.x, msg.y, msg.z, 0.6);
    fx.sfx.play(msg.w === 'shotgun' ? 'shotgun' : msg.w === 'smg' ? 'smg' : 'gun', { pos: { x: msg.x, z: msg.z } });
  }

  // ------------------------------------------------------------ NPC -> player damage
  // Authority: route an NPC's hit to whoever it was aimed at.
  hurtTarget(npc, target, dmg, opts = {}) {
    if (!target) return;
    const g = this.game;
    if (target.type === 'player') {
      this.hurtPlayer(dmg, { npc, lethal: !npc.nonLethal, cop: npc.kind === 'cop', dir: opts.dir, source: npc.name, brawlId: npc.brawlId, gun: opts.gun });
    } else if (target.type === 'remote') {
      try {
        g.net.sendTo(target.id, { t: 'combat:hitPlayer', dmg, lethal: !npc.nonLethal, cop: npc.kind === 'cop', dx: opts.dir?.x ?? 0, dz: opts.dir?.z ?? 0, src: npc.name, b: npc.brawlId, gun: !!opts.gun, from: npc.id });
      } catch { /* ignore */ }
    } else if (target.type === 'npc') {
      this.ctx.npcs.damage(target.id, dmg, npc.id, { dir: opts.dir, kb: 3 });
    }
  }

  hurtPlayer(dmg, opts = {}) {
    const g = this.game, pl = g.player, p = this.p;
    if (!pl || pl.dead || this.isDown || !g.started) return;
    if (pl.vehicle) dmg = Math.round(dmg * (opts.gun ? 0.5 : 0));
    if (dmg <= 0) return;
    const fx = this.ctx.fx;
    const heat = p.heat || 0;
    const nonLethal = opts.lethal === false;
    const copBust = opts.cop && heat < 3;
    if (copBust && p.hp - dmg <= p.maxHp * 0.2) { this.ctx.police?.arrest({ beaten: true }); return; }
    if (nonLethal && p.hp - dmg <= 1) { this.knockout(opts); return; }

    pl.model.flash();
    fx.hurtFlash(clamp(dmg / 30, 0.25, 1));
    fx.sfx.play('hurt');
    fx.blood(pl.pos.x, pl.pos.z, clamp(dmg / 20, 0.4, 1.5), opts.dir || null, 1.2);
    fx.number(pl.pos.x, 2.2, pl.pos.z, '-' + Math.round(dmg), 'hurt');
    g.cameraRig?.shake?.(clamp(0.12 + dmg / 120, 0.12, 0.45), 0.22);
    if (opts.dir && !pl.vehicle) { pl.vel.x += opts.dir.x * (3 + dmg * 0.12); pl.vel.y += opts.dir.z * (3 + dmg * 0.12); }
    g.state.damage(dmg, opts.source || 'beating');
  }

  // Non-lethal loss: drunks and Pit fighters just put you to sleep.
  knockout(opts = {}) {
    const g = this.game, pl = g.player, p = this.p;
    if (this.isDown || pl.dead) return;
    this.isDown = true;
    pl.moveLocked = true;
    pl.aiming = false;
    pl.model.setDead(true);
    p.hp = Math.max(1, Math.round(p.maxHp * 0.12));
    const lost = Math.min(p.money, Math.round(p.money * rand(0.04, 0.1)));
    if (lost > 0) g.state.addMoney(-lost, 'knocked out');
    g.state.changed('hp');
    p.totals.fightsLost = (p.totals.fightsLost || 0) + 1;
    this.ctx.fx.sfx.play('punch');
    g.cameraRig?.shake?.(0.5, 0.4);
    g.ui.bigText('KNOCKED OUT', esc(pick(KO_SUBS)) + (lost ? ` <span style="color:#e2402f">-${fmtMoney(lost)}</span>` : ''), 3000);
    this.downT = 3.2;
    this._loseBrawlsFor('player', 'ko');
    // gloating
    for (const n of this.ctx.npcs.map.values()) {
      if (n.target?.type === 'player' && n.hostile && n.nonLethal && !n.replica) {
        n.hostile = false; n.target = null; n.state = 'wander'; n.goal = null; n.brawlId = null;
        if (n.dist < 20) this.ctx.fx.say(n.group, pick(['And STAY down!', 'Lights out, noodle arms.', 'Who\'s next?!', 'That\'s what I thought.']), { ttl: 2.5, kind: 'angry' });
      }
    }
    if (g.net.isClient) { try { g.net.sendToHost({ t: 'combat:down', ko: true }); } catch { /* ignore */ } }
  }

  getUp() {
    const g = this.game, pl = g.player;
    this.isDown = false;
    pl.moveLocked = false;
    pl.model.setDead(false);
    g.time.advance(30);
    g.ui.toast('You peel yourself off the pavement. Half an hour of your life, gone.', 'bad', 3000);
  }

  // ------------------------------------------------------------ death & respawn
  onPlayerDied() {
    const g = this.game, pl = g.player, p = this.p;
    if (pl.dead || this.deathT > 0) return;
    pl.dead = true;
    pl.aiming = false;
    pl.faceOverride = null;
    try { pl.model.setDead(true); } catch { /* ignore */ }
    this.swing = null;
    this.ctx.fx.sfx.play('trombone');
    this.ctx.fx.blood(pl.pos.x, pl.pos.z, 2.5, null, 0.5);
    g.cameraRig?.shake?.(0.6, 0.5);
    g.ui.bigText('WRECKED', esc(pick(DEATH_SUBS)), 3600);
    p.totals.deaths = (p.totals.deaths || 0) + 1;
    this.deathT = 3.4;
    this._loseBrawlsFor('player', 'died');
    for (const n of this.ctx.npcs.map.values()) {
      if (n.target?.type === 'player' && !n.replica) { n.target = null; if (n.state === 'chase') n.state = 'hunt'; }
    }
    if (g.net.isClient) { try { g.net.sendToHost({ t: 'combat:down', died: true }); } catch { /* ignore */ } }
  }

  respawn() {
    const g = this.game, pl = g.player, p = this.p;
    try { if (pl.vehicle) { g.vehicles?.exit?.(true); g.vehicles?.exitVehicle?.(true); } } catch { /* ignore */ }
    const loc = g.locations.get('st_mercy');
    const sp = g.world?.spawn || { x: 0, z: 0 };
    const x = loc ? (loc.doorX ?? loc.x) : sp.x, z = loc ? (loc.doorZ ?? loc.z) : sp.z;
    pl.spawn(x, z, pl.facing);
    pl.dead = false;
    pl.moveLocked = false;
    pl.model.setDead(false);
    this.isDown = false;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.5));
    let lost = 0;
    if (!g.state.getFlag('insurance')) {
      lost = Math.floor(p.money * 0.2);
      if (lost > 0) g.state.addMoney(-lost, 'hospital bill');
    }
    g.state.changed('hp');
    g.time.advance(360);
    this.ctx.police?.clearHeat(true);
    g.cameraRig.yaw = pl.facing + Math.PI;
    g.ui.toast(lost
      ? `St. Mercy's stapled you back together. The bill: ${fmtMoney(lost)}. The lollipop was extra.`
      : 'St. Mercy\'s patched you up. Your insurance covered it. Somehow.', lost ? 'bad' : 'good', 5000);
    g.bus.emit('player:respawned', { lost, x, z });
  }

  // ------------------------------------------------------------ rewards
  // Authority side: an NPC dropped. Hand out rewards to whoever did it.
  onNpcDown(npc, attackerId) {
    const g = this.game;
    const local = attackerId === 'local' || attackerId === g.net.localId;
    const info = { id: npc.id, kind: npc.kind, role: npc.role, ko: npc.ko, x: npc.pos.x, z: npc.pos.z, aggressor: !!npc.aggressor || !!npc.brawlId,
      wasHostile: !!npc.wasHostile, brawl: !!npc.brawlId, weapon: npc.weapon, faction: npc.faction, name: npc.name, scale: npc.scale };
    if (local) this.reward(info);
    else if (attackerId && g.net.remotePlayers?.has?.(attackerId)) {
      try { g.net.sendTo(attackerId, { t: 'npc:kill', info }); } catch { /* ignore */ }
    }
    g.bus.emit('npc:killed', { npc, byPlayer: local, ko: npc.ko });
    if (npc.persistent && npc.kind === 'dealer') this.ctx.ambient?.dealerDown?.(npc);
  }

  // Client: a replica we were fighting went down (host will send npc:kill if it was us).
  onReplicaDown(npc) { this.game.bus.emit('npc:killed', { npc, byPlayer: false, ko: npc.ko, remote: true }); }

  reward(info) {
    const g = this.game, p = this.p, fx = this.ctx.fx;
    const R = ROLE_REWARD[info.role] || ROLE_REWARD[info.kind] || ROLE_REWARD.ped;
    const xp = Math.round(R.xp * (info.ko ? 0.8 : 1));
    if (xp > 0) { g.state.addXP(xp); fx.number(info.x, 2.8, info.z, `+${xp} XP`, ''); }
    if (!info.ko) p.totals.kills = (p.totals.kills || 0) + 1;
    if (info.aggressor && !info.brawl) p.totals.fightsWon = (p.totals.fightsWon || 0) + 1;
    // karma & heat
    const innocent = !info.aggressor && INNOCENT.has(info.role) || !info.aggressor && INNOCENT.has(info.kind);
    if (innocent) {
      g.state.addStat('karma', info.ko ? -1 : -3, 'violence');
      if (!info.ko) this.ctx.police?.crime('murder', info.x, info.z);
    } else if (info.kind === 'cop') {
      g.state.addStat('karma', -2, 'cop');
      if (!info.ko) this.ctx.police?.crime('copKill', info.x, info.z);
    } else if (info.aggressor && !info.brawl && chance(0.3)) g.state.addStat('karma', 1, 'self defense');
    // loot
    const cash = R.cash[1] > 0 ? randInt(R.cash[0], R.cash[1]) : 0;
    if (cash > 0) fx.dropPickup(info.x, info.z, { kind: 'cash', amount: cash });
    const w = info.weapon;
    if (w && WEAPONS[w] && w !== 'fists') {
      const def = WEAPONS[w];
      if (!p.weapons.includes(w) && chance(def.kind === 'gun' ? 0.35 : 0.45)) {
        fx.dropPickup(info.x, info.z, { kind: 'weapon', weapon: w, ammo: def.kind === 'gun' ? def.mag : 0, mesh: weaponMesh(w) });
      } else if (def.kind === 'gun' && chance(0.6)) {
        fx.dropPickup(info.x, info.z, { kind: 'ammo', ammoType: def.ammo, qty: Math.max(3, Math.round(def.mag * 0.6)) });
      }
    }
    if (['thug', 'gang', 'dealer', 'shady'].includes(info.role) && this.DRUGS && chance(info.role === 'dealer' ? 0.8 : 0.22)) {
      const ids = Object.keys(this.DRUGS);
      if (ids.length) fx.dropPickup(info.x, info.z, { kind: 'drug', drug: pick(ids), qty: randInt(1, info.role === 'dealer' ? 5 : 2) });
    }
    if (this.ITEMS && chance(0.18)) {
      const ids = ITEM_CANDIDATES.filter((i) => this.ITEMS[i]);
      if (ids.length) fx.dropPickup(info.x, info.z, { kind: 'item', item: pick(ids), qty: 1 });
    }
  }

  onPickup(data, pos) {
    const g = this.game, fx = this.ctx.fx;
    switch (data.kind) {
      case 'cash':
        g.state.addMoney(data.amount, 'loot');
        fx.sfx.play('cash');
        fx.number(pos.x, 1.6, pos.z, `+${fmtMoney(data.amount)}`, 'cash');
        break;
      case 'weapon': {
        this.giveWeapon(data.weapon, data.ammo || 0);
        fx.sfx.play('pickup');
        const def = WEAPONS[data.weapon];
        g.ui.toast(`Picked up: <b>${def.name}</b>. Press <kbd>Q</kbd> to switch.`, 'good', 3000);
        break;
      }
      case 'ammo':
        this.giveAmmo(data.ammoType, data.qty);
        fx.sfx.play('reload');
        g.ui.toast(`+${data.qty} ${AMMO[data.ammoType]?.name?.split('(')[0]?.trim() || 'ammo'}`, 'good', 1800);
        break;
      case 'drug':
        g.state.addDrug(data.drug, data.qty);
        fx.sfx.play('pickup');
        g.ui.toast(`Found ${data.qty}× ${g.market?.name?.(data.drug) ?? this.DRUGS?.[data.drug]?.name ?? data.drug}. Finders keepers.`, 'good', 2400);
        break;
      case 'item':
        g.state.addItem(data.item, data.qty || 1);
        fx.sfx.play('pickup');
        g.ui.toast(`Found: ${g.items?.name?.(data.item) ?? this.ITEMS?.[data.item]?.name ?? data.item}`, 'good', 2200);
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------ brawls
  // spec: { x, z, count, kind:'drunk'|'thug'|'gang'|'fighter', label, tier, faction, onWin(game), onLose(game) }
  startBrawl(spec = {}) {
    const g = this.game;
    if (!g.net.isAuthority) {
      const id = 'cb' + (this.brawlSeq++) + '_' + Math.random().toString(36).slice(2, 6);
      this.pendingBrawls.set(id, spec);
      const { onWin, onLose, ...plain } = spec;
      const pp = g.player.pos;
      plain.x = plain.x ?? pp.x; plain.z = plain.z ?? pp.z;
      try { g.net.sendToHost({ t: 'combat:brawl', id, spec: JSON.parse(JSON.stringify(plain)) }); } catch (e) { console.error(e); }
      this._brawlIntro(spec);
      return id;
    }
    return this._hostBrawl(spec, { type: 'player' }, null, null);
  }

  _brawlIntro(spec) {
    this.game.ui.bigText('FIGHT!', esc(spec.label || 'Put \'em up!'), 1500);
    this.ctx.fx.sfx.play('smack', { vol: 0.6 });
  }

  _hostBrawl(spec, target, peer, reqId) {
    const g = this.game;
    const id = 'b' + (this.brawlSeq++);
    const kind = ['drunk', 'thug', 'gang', 'fighter'].includes(spec.kind) ? spec.kind : 'thug';
    const tier = Math.max(0, spec.tier ?? 0);
    const count = clamp(spec.count ?? 1, 1, 12);
    const tp = this.ctx.npcs._targetPos(target) || g.player.pos;
    const cx = spec.x ?? tp.x, cz = spec.z ?? tp.z;
    const lethal = !(kind === 'drunk' || kind === 'fighter');
    const faction = spec.faction || (kind === 'gang' ? ({ gutterside: 'rats', hilltop: 'syndicate', dustbowl: 'bikers' }[g.world?.districtAt?.(cx, cz)] || 'rats') : null);
    const b = { id, label: spec.label || 'Brawl', kind, tier, lethal, npcIds: [], onWin: spec.onWin, onLose: spec.onLose, peer, reqId, target, x: cx, z: cz, done: false, t: 0 };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = rand(3, 5.5);
      let x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const res = g.physics.resolveCircle(x, z, 0.5);
      x = res.x; z = res.z;
      const npc = this.ctx.npcs.spawn({
        kind: kind === 'fighter' ? 'fighter' : kind, role: kind, faction, x, z,
        facing: Math.atan2(tp.x - x, tp.z - z), hostile: true, networked: true, brawlId: id, wander: false,
        weapon: kind === 'fighter' ? (tier >= 3 && chance(0.5) ? 'brass' : 'fists') : kind === 'drunk' ? (chance(0.3) ? 'bottle' : 'fists') : undefined,
        hp: Math.round((({ drunk: 45, thug: 65, gang: 75, fighter: 70 })[kind]) * (1 + 0.45 * tier) * rand(0.9, 1.1)),
        data: { brawl: true },
      });
      if (!npc) continue;
      npc.aggressor = true;
      npc.tierMult = 1 + 0.25 * tier;
      if (kind === 'fighter') npc.run *= 1 + tier * 0.05;
      npc.target = target;
      npc.state = 'chase';
      npc.cd = rand(0.6, 1.4);
      b.npcIds.push(npc.id);
      if (i === 0) this.ctx.fx.say(npc.group, pick(TAUNTS), { ttl: 2.2, kind: 'angry' });
    }
    this.brawls.set(id, b);
    if (target.type === 'player') this._brawlIntro(spec);
    return id;
  }

  inBrawl() {
    for (const b of this.brawls.values()) if (!b.done && b.target.type === 'player') return true;
    return this.pendingBrawls.size > 0;
  }

  _updateBrawls(dt) {
    if (!this.brawls.size) return;
    const g = this.game;
    for (const b of this.brawls.values()) {
      if (b.done) continue;
      b.t += dt;
      let left = 0;
      for (const id of b.npcIds) {
        const n = this.ctx.npcs.get(id);
        if (n && !n.dead && n.state !== 'flee' && n.brawlId === b.id) left++;
      }
      if (left === 0 && b.t > 0.5) { this._endBrawl(b, true); continue; }
      const tp = this.ctx.npcs._targetPos(b.target);
      if (b.target.type === 'remote' && !g.net.remotePlayers?.has?.(b.target.id)) { this._endBrawl(b, false); continue; }
      if (tp && Math.hypot(tp.x - b.x, tp.z - b.z) > 80) {
        if (b.target.type === 'player') g.ui.toast('You ran from the fight. The crowd boos. Someone throws a shoe.', 'bad');
        this._endBrawl(b, false);
      }
    }
    for (const [id, b] of this.brawls) if (b.done) this.brawls.delete(id);
  }

  _loseBrawlsFor(type, why, peer = null) {
    for (const b of this.brawls.values()) {
      if (b.done) continue;
      if (b.target.type === type && (type !== 'remote' || b.target.id === peer)) this._endBrawl(b, false);
    }
  }

  _endBrawl(b, won) {
    if (b.done) return;
    b.done = true;
    const g = this.game;
    // survivors stop fighting
    for (const id of b.npcIds) {
      const n = this.ctx.npcs.get(id);
      if (!n || n.dead) continue;
      n.brawlId = null; n.hostile = false; n.target = null; n.leaving = true;
      n.state = won ? 'flee' : 'wander'; n.stateT = 0; n.goal = null;
      if (!won && n.dist < 25) this.ctx.fx.say(n.group, pick(['Get wrecked!', 'Ha! Weak sauce.', 'Tell your mom I said hi.']), { ttl: 2.4, kind: 'angry' });
    }
    if (b.peer) {
      try { g.net.sendTo(b.peer, { t: 'combat:brawlResult', id: b.reqId, won }); } catch { /* ignore */ }
      return;
    }
    this._brawlResultLocal(b.id, b, won);
  }

  _brawlResultLocal(id, spec, won) {
    const g = this.game, p = this.p;
    const label = spec.label || 'Brawl';
    if (won) {
      p.totals.fightsWon = (p.totals.fightsWon || 0) + 1;
      g.state.addXP(10 + 10 * (spec.tier || 0) + 3 * (spec.count || spec.npcIds?.length || 1));
      g.ui.bigText('VICTORY', esc(pick(['Flawless. Ish.', 'Your knuckles will remember this.', 'The crowd goes mild!', 'Somebody call them a waaambulance.'])), 2200);
      g.state.changed('totals');
      g.bus.emit('brawl:won', { id, label });
      try { spec.onWin?.(g); } catch (e) { console.error('[combat] onWin failed', e); }
    } else {
      if (!this.isDown) p.totals.fightsLost = (p.totals.fightsLost || 0) + 1;
      g.state.changed('totals');
      g.bus.emit('brawl:lost', { id, label });
      try { spec.onLose?.(g); } catch (e) { console.error('[combat] onLose failed', e); }
    }
  }

  // Net handlers (wired in index.js)
  onBrawlRequest(msg, from) {
    if (!this.game.net.isAuthority) return;
    const spec = msg.spec || {};
    this._hostBrawl(spec, { type: 'remote', id: from }, from, msg.id);
  }

  onBrawlResult(msg) {
    const spec = this.pendingBrawls.get(msg.id);
    if (!spec) return;
    this.pendingBrawls.delete(msg.id);
    this._brawlResultLocal(msg.id, spec, !!msg.won);
  }

  onRemoteDown(from) {
    this._loseBrawlsFor('remote', 'down', from);
    const r = this.game.net.remotePlayers?.get?.(from);
    if (r) { r.down = true; setTimeout(() => { r.down = false; }, 6000); }
    for (const n of this.ctx.npcs.map.values()) {
      if (n.target?.type === 'remote' && n.target.id === from) { n.target = null; if (!n.brawlId && n.kind !== 'cop') { n.hostile = false; n.state = 'wander'; } else n.state = 'hunt'; }
    }
  }
}
