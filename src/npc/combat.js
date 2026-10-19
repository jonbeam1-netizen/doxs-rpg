import * as THREE from 'three';
import { WEAPONS, AMMO } from '../data/weapons.js';
import { clamp, rand, randInt, pick, chance, fmtMoney, esc, angleLerp } from '../core/util.js';
import { weaponDef, weaponMesh, MUZZLE } from './weapons-mesh.js';
import { DEATH_SUBS, KO_SUBS, TAUNTS } from './names.js';

// Player combat.
//   LMB tap ......... 3-hit light combo (3rd hit is a knockdown-y finisher)
//   LMB hold ........ charged heavy (breaks guards, launches people)
//   RMB tap / B ..... kick (knocks down, breaks guards)
//   C (hold) ........ block; tap C just before a hit lands = PARRY (opens them up for a riposte crit)
//   Z / double-tap .. dodge roll (i-frames, 2 charges)
//   Y ............... quick-heal with your best healing item
//   MMB tap ......... lock on / off
// Guns: soft aim assist, recoil + bloom, headshots, hit markers.

const CRITS = ['CRIT!', 'NUT SHOT!', 'BONK!', 'WHAP!', 'FACE!', 'SPLAT!', 'KAPOW!', 'OOF!'];
const ROLE_REWARD = {
  ped: { xp: 6, cash: [2, 25] }, worker: { xp: 8, cash: [5, 30] }, snob: { xp: 6, cash: [30, 150] }, shady: { xp: 10, cash: [10, 60] },
  hobo: { xp: 4, cash: [0, 4] }, drunk: { xp: 8, cash: [1, 15] }, thug: { xp: 18, cash: [5, 45] }, gang: { xp: 22, cash: [10, 70] },
  cop: { xp: 25, cash: [0, 20] }, swat: { xp: 45, cash: [0, 0] }, fighter: { xp: 15, cash: [0, 10] }, dealer: { xp: 20, cash: [40, 160] },
  static: { xp: 0, cash: [0, 0] },
};
const INNOCENT = new Set(['ped', 'worker', 'snob', 'shady', 'hobo', 'drunk', 'dealer', 'static']);
const ITEM_CANDIDATES = ['beer', 'cigarettes', 'cigs', 'bandage', 'energy_drink', 'donut', 'chips', 'lottery_ticket', 'scratcher', 'condom', 'gum', 'hotdog', 'whiskey', 'painkillers'];

const STYLES = { fists: ['jab', 'cross', 'uppercut'], blade: ['slash', 'jab', 'hook'], blunt: ['slash', 'hook', 'overhead'] };
const COMBO_DMG = [1, 1.05, 1.6];
const COMBO_KB = [1, 1, 2.4];
const KICK = { name: 'Kick', kind: 'melee', damage: 7, range: 1.9, rate: 0.9 };
const PARRY_WINDOW = 0.25;   // seconds after pressing block in which a hit is parried
const ROLL_MAX = 2;          // dodge charges
const ROLL_REGEN = 1.15;     // seconds per charge
const RECOIL = { pistol: 0.022, revolver: 0.05, shotgun: 0.06, smg: 0.011, rifle: 0.035, goldengun: 0.03 };
const HEAL_PREF = ['first_aid', 'painkillers', 'bandage', 'steak', 'diner_special', 'pizza_slice', 'holy_water'];

function meleeClass(id) {
  if (id === 'knife' || id === 'machete' || id === 'bottle') return 'blade';
  if (id === 'bat' || id === 'crowbar' || id === 'sledge' || id === 'baton') return 'blunt';
  return 'fists';
}

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

    // moves state
    this.combo = { step: 0, until: 0 };
    this.buffer = 0;          // buffered LMB press (game time it expires)
    this.holdStart = null;    // when LMB went down (melee)
    this.charge = null;       // { t, full }
    this.kickCd = 0;
    this.blocking = false; this.blockAt = -9; this.blockUpAt = -9; this.parryOk = true;
    this.rollCharges = ROLL_MAX; this.rollRegen = 0; this.rollGap = 0; this.iframes = 0;
    this.kdT = 0; this.tasedT = 0;
    this.healCd = 0;
    this.lastHurtT = -99; this.lastCombatT = -99;
    this.lock = null;
    this.bloom = 0;
    this._hmT = 0;
    this._taps = {};
    this._dtap = { k: null, t: -9 };
    this._threat = false; this._threatT = 0;
    this._regenAcc = 0;

    // crosshair
    const root = document.getElementById('ui-root') || document.body;
    this.cross = document.createElement('div');
    this.cross.id = 'npc-crosshair';
    this.cross.innerHTML = '<i class="h l"></i><i class="h r"></i><i class="v t"></i><i class="v b"></i><i class="d"></i>'
      + '<i class="x x1"></i><i class="x x2"></i><i class="x x3"></i><i class="x x4"></i>';
    root.appendChild(this.cross);

    game.bus.on('player:model-rebuilt', () => { this._wModel = null; });
    game.bus.on('player:died', (d) => this.onPlayerDied(d));
    game.bus.on('state:reset', () => { this._wModel = null; this.isDown = false; this.deathT = 0; this._resetMoves(); });
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
    this._cancelCharge();
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
    this.cd -= dt; this.kickCd -= dt; this.healCd -= dt; this.iframes -= dt; this.rollGap -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.22);
    if (this.rollCharges < ROLL_MAX) {
      this.rollRegen += dt;
      if (this.rollRegen >= ROLL_REGEN) { this.rollRegen = 0; this.rollCharges++; }
    }

    // death / knockout timers run regardless of UI
    if (this.deathT > 0) { this.deathT -= dt; if (this.deathT <= 0) this.respawn(); }
    if (this.downT > 0) { this.downT -= dt; if (this.downT <= 0) this.getUp(); }
    this._updateStatus(dt);

    const def = this.weapon;
    const id = this.weaponId;
    const canFight = g.started && !g.controlsLocked && !pl.dead && !pl.vehicle && !pl.moveLocked && !this.isDown && !(this.kdT > 0) && !(this.tasedT > 0);
    const gun = def.kind === 'gun';
    pl.aiming = canFight && gun && !this.blocking;
    pl.swingStyle = def.swing || null;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this._reloadId !== id) this.reloadT = 0;
      else if (this.reloadT <= 0) this._loadMag(id);
    }

    if (this.faceT > 0) { this.faceT -= dt; if (this.faceT <= 0 && !pl.aiming) pl.faceOverride = null; }
    if (pl.aiming) pl.faceOverride = g.cameraRig.yaw + Math.PI;
    else if (this.faceT <= 0 && pl.faceOverride != null && this._ownsFace && !this.blocking && !this.charge) { pl.faceOverride = null; }
    this._ownsFace = pl.aiming || this.faceT > 0 || this.blocking || !!this.charge;

    if (this.swing) {
      this.swing.t -= dt;
      if (this.swing.t <= 0) { const s = this.swing; this.swing = null; this._resolveSwing(s); }
    }

    // threat check (for regen, combat HUD, double-tap rolls)
    this._threatT -= dt;
    if (this._threatT <= 0) { this._threatT = 0.25; this._threat = this._computeThreat(); }
    if (this._threat) this.lastCombatT = g.elapsed;

    if (canFight) this._input(dt, def, id, gun);
    else { this._endBlock(); this._cancelCharge(); this.holdStart = null; pl.combatMove = 1; }

    this._updateLock(dt);
    this._updateRegen(dt);
    this._updateCrosshair(pl.aiming, dt);
    this._updateHud(def, id);
    this._updateBrawls(dt);
    this._updateBossBar();
    this._updateCombatHud();
  }

  _input(dt, def, id, gun) {
    const g = this.game, pl = g.player, inp = g.input;
    if (inp.wasPressed('KeyQ')) this.cycle(inp.isDown('ShiftLeft') ? -1 : 1);
    if (inp.wasPressed('KeyR')) this.startReload();
    if (inp.wasPressed('KeyY')) this.quickHeal();

    // mouse taps (RMB / MMB drag still turns the camera; a quick click without moving is a tap)
    let kickReq = inp.wasPressed('KeyB');
    if (this._tap(2)) kickReq = true;
    if (this._tap(1)) this.toggleLock();

    // dodge roll
    const roll = this._rollInput(inp);
    if (roll) this.tryRoll(roll.x, roll.z);

    // block / parry
    const wantBlock = inp.isDown('KeyC') && !pl.model.rolling && !(pl.dash?.t > 0);
    if (wantBlock && !this.blocking) this._startBlock();
    else if (!wantBlock && this.blocking) this._endBlock();
    pl.combatMove = this.blocking ? 0.45 : this.charge ? 0.55 : 1;
    if (this.blocking) {
      const t = this._faceThreat();
      if (t) { pl.faceOverride = Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z); }
      this.holdStart = null;
      return;
    }
    if (pl.model.rolling) return;

    if (kickReq && this.kickCd <= 0 && !this.swing && !this.charge) { this.doKick(); return; }

    if (gun) {
      this._cancelCharge();
      if (this.cd <= 0) {
        const trig = id === 'smg' ? inp.mouseDown(0) : inp.mouseClicked(0);
        if (trig) this.shoot(def, id);
      }
      return;
    }

    // melee: tap = combo, hold = charge
    if (inp.mouseClicked(0)) { this.buffer = g.elapsed + 0.3; this.holdStart = g.elapsed; }
    if (!inp.mouseDown(0)) {
      if (this.charge) this.releaseHeavy();
      this.holdStart = null;
    }
    if (this.buffer > g.elapsed && this.cd <= 0 && !this.charge && !this.swing) {
      this.buffer = 0;
      this.melee(def, id);
    }
    if (this.holdStart != null && inp.mouseDown(0) && !this.charge && !this.swing && this.cd <= 0.05 && g.elapsed - this.holdStart > 0.26) {
      this._startCharge(def, id);
    }
    if (this.charge) {
      this.charge.t += dt;
      const k = clamp(this.charge.t / 0.7, 0, 1);
      if (k >= 1 && !this.charge.full) { this.charge.full = true; this.ctx.fx.sfx.play('charged'); pl.model.flash?.(); }
      this.ctx.fx.setCharge(true, k, pl.pos.x, pl.pos.z);
      if (this.charge.t > 0.8) pl.model.extendWindup?.(0.45);
      const t = this._faceThreat();
      if (t) pl.faceOverride = Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z);
    }
  }

  // true on the frame a quick click (no drag) of mouse button b is released
  _tap(b) {
    const inp = this.game.input, m = inp.mouse;
    const now = performance.now();
    if (inp.mouseClicked(b)) this._taps[b] = { t: now, moved: 0 };
    const tp = this._taps[b];
    if (!tp) return false;
    if (m.buttons.has(b)) { tp.moved += Math.abs(m.dx) + Math.abs(m.dy); return false; }
    this._taps[b] = null;
    return now - tp.t < 300 && tp.moved < 14;
  }

  _rollInput(inp) {
    const g = this.game;
    const keys = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
    let fx = 0, fz = 0;
    for (const [k, [x, z]] of Object.entries(keys)) if (inp.isDown(k)) { fx += x; fz += z; }
    let want = inp.wasPressed('KeyZ');
    // double-tap a direction (only while fighting, so strolling never trips it)
    for (const k of Object.keys(keys)) {
      if (!inp.wasPressed(k)) continue;
      if (this._dtap.k === k && g.elapsed - this._dtap.t < 0.24 && g.elapsed - this.lastCombatT < 5) {
        want = true; fx = keys[k][0]; fz = keys[k][1]; this._dtap.k = null;
      } else this._dtap = { k, t: g.elapsed };
    }
    if (!want) return null;
    const yaw = g.cameraRig.yaw;
    if (!fx && !fz) fz = -1; // backstep
    const mx = -Math.sin(yaw) * fz + Math.cos(yaw) * fx, mz = -Math.cos(yaw) * fz - Math.sin(yaw) * fx;
    const l = Math.hypot(mx, mz) || 1;
    return { x: mx / l, z: mz / l };
  }

  _computeThreat() {
    if (this.inBrawl()) return true;
    const pl = this.game.player;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, 28)) {
      if (n.hostile && (n.target?.type === 'player' || n.brawlId)) return true;
    }
    return false;
  }

  // nearest enemy in front (or the lock target) — for blocking / charging facing
  _faceThreat() {
    const pl = this.game.player;
    if (this.lock && !this.lock.dead && Math.hypot(this.lock.pos.x - pl.pos.x, this.lock.pos.z - pl.pos.z) < 8) return this.lock;
    let best = null, bd = 6;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, 6)) {
      if (!n.hostile) continue;
      const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z) - (n.atk ? 1.5 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _resetMoves() {
    const pl = this.game.player;
    this.swing = null; this.charge = null; this.blocking = false; this.kdT = 0; this.tasedT = 0; this.iframes = 0;
    this.rollCharges = ROLL_MAX; this.lock = null; this.holdStart = null; this.buffer = 0;
    if (pl) { pl.combatMove = 1; pl.dash = null; try { pl.model.setBlock?.(false); } catch { /* ignore */ } }
    this.ctx.fx.setCharge(false);
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
    if (html !== this._hudHtml) { this._hudHtml = html; this.game.ui.setHud('weapon', html); }
  }

  _updateCombatHud() {
    const g = this.game, pl = g.player;
    const show = g.started && !pl.vehicle && !pl.dead && (g.elapsed - this.lastCombatT < 5 || this.blocking || this.charge || this.rollCharges < ROLL_MAX);
    if (!show || g.controlsLocked) { this.ctx.fx.combatHud(null); return; }
    let pips = '';
    for (let i = 0; i < ROLL_MAX; i++) pips += `<span class="pip${i < this.rollCharges ? '' : ' off'}"></span>`;
    const st = this.tasedT > 0 ? 'TASED!' : this.kdT > 0 ? 'GET UP!' : this.blocking ? 'GUARD' : this.charge ? (this.charge.full ? 'MAX POWER' : 'CHARGING') : 'ROLL';
    const chg = this.charge ? `<span class="chg"><b style="width:${Math.round(clamp(this.charge.t / 0.7, 0, 1) * 100)}%"></b></span>` : '';
    this.ctx.fx.combatHud(`${st} ${pips}${chg}`);
  }

  _updateBossBar() {
    const pl = this.game.player;
    let best = null, bd = 45;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.dead || !(n.boss || n.bossName)) continue;
      const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) { this.ctx.fx.bossBar(null); return; }
    this.ctx.fx.bossBar({ id: best.id, name: (best.boss?.name || best.bossName || best.name).toUpperCase(), tag: best.boss?.tag || 'BOSS',
      hp: Math.max(0, best.predictedHp ?? best.hp), maxHp: best.maxHp, enraged: best.boss?.enraged || best.enragedRep });
  }

  // ------------------------------------------------------------ aiming helpers
  _aimBase() {
    const pl = this.game.player;
    const yaw = this.game.cameraRig.yaw;
    return { ox: pl.pos.x, oz: pl.pos.z, ang: Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) };
  }

  // 2D hitscan along angle `ang` from (ox,oz). Returns { t, npc, maxT, lat } (lat = miss distance from the npc's center line).
  _cast(ox, oz, ang, range) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    // start the wall check a bit in front of the player so standing against a wall still works sideways
    const frac = this.game.physics.raycast(ox, oz, ox + dx * range, oz + dz * range, 0.4, 1.0);
    const maxT = range * frac;
    let best = null, bt = maxT, lat = 0;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.dead) continue;
      const rx = n.pos.x - ox, rz = n.pos.z - oz;
      const t = rx * dx + rz * dz;
      if (t <= 0.2 || t >= bt) continue;
      const px = rx - dx * t, pz = rz - dz * t;
      const hr = 0.42 * n.scale + 0.1;
      const l2 = px * px + pz * pz;
      if (l2 <= hr * hr) { bt = t; best = n; lat = Math.sqrt(l2); }
    }
    return { t: bt, npc: best, dx, dz, maxT, lat };
  }

  // Soft aim assist: a near-miss on a hostile gets nudged onto their body (never their head).
  _assist(ox, oz, ang, range) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    let best = null, bs = 1;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.dead || !(n.hostile || n.brawlId || n === this.lock)) continue;
      const rx = n.pos.x - ox, rz = n.pos.z - oz;
      const t = rx * dx + rz * dz;
      if (t <= 0.8 || t > range) continue;
      const cross = rx * dz - rz * dx;
      const hr = 0.42 * n.scale + 0.1;
      const miss = Math.abs(cross) - hr;
      const tol = Math.min(0.9, 0.35 + t * 0.02);
      if (miss <= 0 || miss > tol) continue;
      const sc = miss / tol;
      if (sc < bs) { bs = sc; best = { n, t, side: Math.sign(cross), hr }; }
    }
    if (!best) return null;
    const { n, t, side, hr } = best;
    const a0 = Math.atan2(n.pos.x - ox, n.pos.z - oz);
    return { ang: a0 + side * Math.atan2(hr * 0.55, t), npc: n };
  }

  _updateCrosshair(on, dt) {
    const el = this.cross;
    if (this._hmT > 0) { this._hmT -= dt; if (this._hmT <= 0) el.classList.remove('hm', 'kill'); }
    if (!on) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const def = this.weapon;
    const { ox, oz, ang } = this._aimBase();
    let c = this._cast(ox, oz, ang, def.range);
    let assist = false;
    if (!c.npc && !def.pellets) {
      const as = this._assist(ox, oz, ang, def.range);
      if (as) { const c2 = this._cast(ox, oz, as.ang, def.range); if (c2.npc) assist = true; }
    }
    const v = this._v.set(ox + c.dx * c.t, 1.25, oz + c.dz * c.t).project(this.game.camera);
    el.style.display = 'block';
    if (v.z < 1) {
      el.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px';
      el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
    }
    el.classList.toggle('hit', !!c.npc);
    el.classList.toggle('assist', assist);
    el.classList.toggle('reload', this.reloadT > 0);
    const spread = ((def.spread || 0) + this.bloom) * (this.game.player.speed > 1 ? 1.6 : 1);
    el.style.transform = `scale(${(1 + spread * 8).toFixed(2)})`;
  }

  _hitMarker(kill) {
    const el = this.cross;
    el.classList.add('hm');
    if (kill) el.classList.add('kill');
    this._hmT = kill ? 0.22 : 0.12;
    this.ctx.fx.sfx.play(kill ? 'killmark' : 'hitmark');
  }

  // ------------------------------------------------------------ lock-on
  toggleLock() {
    const pl = this.game.player;
    if (this.lock) { this.ctx.fx.clearAlert(this.lock.group, 'lock'); this.lock = null; this.ctx.fx.sfx.play('click', { vol: 0.4 }); return; }
    const f = this.game.cameraRig.forward;
    let best = null, bs = Infinity;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, 22)) {
      if (n.kind === 'static') continue;
      const rx = n.pos.x - pl.pos.x, rz = n.pos.z - pl.pos.z, d = Math.hypot(rx, rz) || 1;
      const dot = (rx * f.x + rz * f.z) / d;
      if (dot < 0.2) continue;
      const sc = d * (1.6 - dot) * (n.hostile || n.brawlId ? 0.5 : 1.5);
      if (sc < bs) { bs = sc; best = n; }
    }
    if (best) { this.lock = best; this.ctx.fx.sfx.play('click', { vol: 0.6 }); }
  }

  _updateLock(dt) {
    const n = this.lock;
    if (!n) return;
    const g = this.game, pl = g.player;
    const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z);
    if (n.dead || n.removed || !this.ctx.npcs.map.has(n.id) || d > 26 || pl.dead || pl.vehicle) { this.ctx.fx.clearAlert(n.group, 'lock'); this.lock = null; return; }
    this.ctx.fx.alert(n.group, 'lock', 0.2, 2.85 * n.scale);
    // keep them on screen: ease the camera toward them unless you're steering it yourself
    const m = g.input.mouse;
    if (!g.controlsLocked && Math.abs(m.dx) + Math.abs(m.dy) < 3 && d > 1.2) {
      const want = Math.atan2(-(n.pos.x - pl.pos.x), -(n.pos.z - pl.pos.z));
      g.cameraRig.yaw = angleLerp(g.cameraRig.yaw, want, 1 - Math.exp(-3.5 * dt));
    }
  }

  // ------------------------------------------------------------ regen & healing
  _updateRegen(dt) {
    const g = this.game, pl = g.player, p = this.p;
    if (pl.dead || this.isDown || !g.started) return;
    const calm = g.elapsed - this.lastHurtT > 8 && !this._threat;
    if (!calm || p.hp >= p.maxHp * 0.6 || p.hp <= 0) { this._regenAcc = 0; return; }
    this._regenAcc += dt * 0.5; // walk it off: slowly back to 60%
    if (this._regenAcc >= 1) { const n = Math.floor(this._regenAcc); this._regenAcc -= n; g.state.heal(n); }
  }

  quickHeal() {
    const g = this.game, p = this.p, fx = this.ctx.fx, pl = g.player;
    if (this.healCd > 0) return;
    if (p.hp >= p.maxHp) { g.ui.toast('You\'re fine. Walk it off, champ.', 'info', 1400); this.healCd = 0.8; return; }
    const ITEMS = this.ITEMS || g.items?.ITEMS;
    if (!ITEMS) return;
    const missing = p.maxHp - p.hp;
    const owned = Object.keys(p.inventory || {}).filter((id) => {
      const fxd = ITEMS[id]?.fx;
      return g.state.hasItem(id) && fxd && fxd.hp > 0 && !fxd.drunk && !fxd.time && !fxd.addiction && !(fxd.special && fxd.special !== 'holy');
    });
    if (!owned.length) { g.ui.toast('No healing items! Bandages & painkillers: any pharmacy. <kbd>Y</kbd> uses them mid-fight.', 'bad', 2600); this.healCd = 1; return; }
    const med = owned.filter((id) => ITEMS[id].cat === 'med');
    const pool = med.length ? med : owned;
    pool.sort((a, b) => {
      const ha = ITEMS[a].fx.hp, hb = ITEMS[b].fx.hp;
      const ca = ha >= missing ? ha - missing : (missing - ha) * 1.5;
      const cb = hb >= missing ? hb - missing : (missing - hb) * 1.5;
      return ca - cb || HEAL_PREF.indexOf(a) - HEAL_PREF.indexOf(b);
    });
    const id = pool[0];
    const before = p.hp;
    let ok = false;
    try { ok = g.items?.use ? g.items.use(id) : false; } catch (e) { console.error('[combat] heal failed', e); }
    if (!ok) { this.healCd = 1; return; }
    this.healCd = this._threat ? 2.5 : 0.8;
    const got = Math.round(p.hp - before);
    fx.sfx.play('heal');
    if (got > 0) fx.number(pl.pos.x, 2.3, pl.pos.z, '+' + got, 'heal');
  }

  // ------------------------------------------------------------ player melee
  _pickTarget(range, dx, dz) {
    const pl = this.game.player;
    let best = null, bd = range + 1.4;
    const L = this.lock;
    if (L && !L.dead && Math.hypot(L.pos.x - pl.pos.x, L.pos.z - pl.pos.z) < range + 1.6) return L;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, range + 1.4)) {
      const rx = n.pos.x - pl.pos.x, rz = n.pos.z - pl.pos.z;
      const d = Math.hypot(rx, rz) || 0.01;
      const dot = (rx * dx + rz * dz) / d;
      const score = d - dot * 1.2 - (n.hostile ? 0.6 : 0) - (n.atk ? 0.4 : 0);
      if (dot > 0.2 && score < bd) { bd = score; best = n; }
    }
    if (best) return best;
    // nobody in front: swing at whoever's actually fighting you, even if they're beside / behind you
    bd = range + 0.9;
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, range + 0.9)) {
      if (!(n.hostile && (n.target?.type === 'player' || n.brawlId))) continue;
      const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z) - (n.atk ? 0.5 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // melee magnetism: a short step toward a target that's just out of reach
  _stepIn(target, range) {
    if (!target) return;
    const pl = this.game.player;
    const d = Math.hypot(target.pos.x - pl.pos.x, target.pos.z - pl.pos.z) - target.radius;
    const want = range * 0.75;
    if (d <= want || d > range + 1.6) return;
    const t = 0.12;
    pl.dash = { x: (target.pos.x - pl.pos.x) / (d + target.radius), z: (target.pos.z - pl.pos.z) / (d + target.radius), speed: Math.min(12, (d - want) / t), t };
  }

  _aimDir(range) {
    const pl = this.game.player;
    const { ang } = this._aimBase();
    let dx = Math.sin(ang), dz = Math.cos(ang);
    // move direction wins if the player is running somewhere
    if (pl.speed > 2.5 && !pl.aiming) { dx = Math.sin(pl.facing); dz = Math.cos(pl.facing); }
    const best = this._pickTarget(range, dx, dz);
    if (best) {
      const rx = best.pos.x - pl.pos.x, rz = best.pos.z - pl.pos.z, d = Math.hypot(rx, rz) || 1;
      dx = rx / d; dz = rz / d;
    }
    return { dx, dz, target: best };
  }

  melee(def, id) {
    const g = this.game, pl = g.player;
    const now = g.elapsed;
    const step = now < this.combo.until ? this.combo.step : 0;
    const style = STYLES[meleeClass(id)][step];
    const fin = step === 2;
    const { dx, dz, target } = this._aimDir(def.range);
    pl.faceOverride = Math.atan2(dx, dz);
    this._stepIn(target, def.range);
    const dur = clamp(def.rate * 0.72, 0.2, 0.5) * (fin ? 1.25 : 1);
    this.cd = def.rate * (fin ? 1.2 : 0.72);
    this.faceT = Math.max(0.3, dur);
    pl.swingStyle = style;
    pl.model.punch(dur, style);
    g.bus.emit('player:attack', { duration: dur, weapon: id, swingStyle: style, combo: step });
    this.swing = { t: dur * 0.42, dx, dz, def, id, kind: fin ? 'finisher' : 'light', mult: COMBO_DMG[step], kbMult: COMBO_KB[step], step };
    this.combo = { step: (step + 1) % 3, until: now + dur + 0.6 };
    if (fin) { pl.vel.x += dx * 3; pl.vel.y += dz * 3; }
    this.ctx.npcs.onPlayerAttack?.(pl.pos.x, pl.pos.z, dx, dz, fin ? 'finisher' : 'light');
    this.ctx.fx.sfx.play('whoosh', { vol: 0.45 + def.damage / 60 + (fin ? 0.2 : 0) });
    this.lastCombatT = now;
  }

  _startCharge(def, id) {
    const pl = this.game.player;
    this.charge = { t: 0, full: false, style: meleeClass(id) === 'fists' ? 'heavy' : 'overhead' };
    pl.model.windup?.(1.4, this.charge.style === 'heavy' ? null : 'overhead');
    this.ctx.fx.sfx.play('charge');
    const { dx, dz } = this._aimDir(def.range + 1);
    this.ctx.npcs.onPlayerAttack?.(pl.pos.x, pl.pos.z, dx, dz, 'charge');
  }

  _cancelCharge() {
    if (!this.charge) return;
    this.charge = null;
    try { this.game.player.model.cancelWindup?.(); } catch { /* ignore */ }
    this.ctx.fx.setCharge(false);
  }

  releaseHeavy() {
    const g = this.game, pl = g.player;
    const c = this.charge;
    if (!c) return;
    const power = clamp(c.t / 0.7, 0, 1);
    this._cancelCharge();
    const def = this.weapon, id = this.weaponId;
    const { dx, dz } = this._aimDir(def.range + 0.8);
    pl.faceOverride = Math.atan2(dx, dz);
    this.faceT = 0.45;
    const dur = 0.34;
    pl.swingStyle = c.style;
    pl.model.punch(dur, c.style);
    g.bus.emit('player:attack', { duration: dur, weapon: id, swingStyle: c.style, heavy: true });
    this.swing = { t: 0.11, dx, dz, def, id, kind: 'heavy', mult: 1.5 + 1.4 * power, kbMult: 2 + 2.6 * power, power, reach: def.range + 0.4, guardBreak: true };
    this.cd = 0.4 + def.rate * 0.45;
    this.combo = { step: 0, until: 0 };
    pl.dash = { x: dx, z: dz, speed: 5 + 6 * power, t: 0.12 };
    this.ctx.npcs.onPlayerAttack?.(pl.pos.x, pl.pos.z, dx, dz, 'heavy');
    this.ctx.fx.sfx.play('whoosh', { vol: 1 });
    this.lastCombatT = g.elapsed;
  }

  doKick() {
    const g = this.game, pl = g.player;
    this._cancelCharge();
    const { dx, dz, target } = this._aimDir(KICK.range);
    pl.faceOverride = Math.atan2(dx, dz);
    this._stepIn(target, KICK.range);
    this.faceT = 0.45;
    this.kickCd = KICK.rate;
    this.cd = Math.max(this.cd, 0.4);
    pl.swingStyle = 'kick';
    pl.model.punch(0.42, 'kick');
    g.bus.emit('player:attack', { duration: 0.42, weapon: 'kick', swingStyle: 'kick' });
    this.swing = { t: 0.15, dx, dz, def: KICK, id: 'kick', kind: 'kick', mult: 1, kbMult: 2.3, reach: KICK.range, guardBreak: true };
    this.combo = { step: 0, until: 0 };
    this.ctx.npcs.onPlayerAttack?.(pl.pos.x, pl.pos.z, dx, dz, 'kick');
    this.ctx.fx.sfx.play('whoosh', { vol: 0.6 });
    this.lastCombatT = g.elapsed;
  }

  _npcGuarding(n) { return (n.guard > 0) || !!n.guardRep; }

  _resolveSwing(s) {
    const g = this.game, pl = g.player, p = this.p, fx = this.ctx.fx;
    if (pl.dead || this.isDown || this.kdT > 0) return;
    const { def, dx, dz } = s;
    const reach = (s.reach ?? def.range) + 0.35;
    const heavy = s.kind === 'heavy';
    const maxHits = heavy ? 3 : s.kind === 'kick' ? 2 : def.swing === 'overhead' || def.damage >= 30 ? 3 : s.id === 'fists' ? 1 : 2;
    const cands = [];
    for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, reach + 0.6)) {
      const rx = n.pos.x - pl.pos.x, rz = n.pos.z - pl.pos.z;
      const d = Math.hypot(rx, rz) || 0.01;
      if (d - n.radius > reach) continue;
      if ((rx * dx + rz * dz) / d < (heavy ? 0.15 : 0.35) && d > 0.7) continue;
      cands.push([d - (n === this.lock ? 1 : 0), n]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const str = p.str || 0;
    const strK = 1 + Math.min(1.2, str / 80);
    const weak = def.reqStr && str < def.reqStr ? 0.6 : 1;
    let hitAny = false, biggest = 0, blockedAny = false, killed = false;
    for (const [, n] of cands.slice(0, maxHits)) {
      const riposte = n.riposteUntil > g.elapsed;
      const crit = riposte || chance(0.08 + Math.min(0.1, str / 1000) + (s.kind === 'finisher' ? 0.07 : 0));
      let dmg = s.kind === 'kick' ? (KICK.damage + str * 0.3) : (def.damage + str * 0.35) * weak;
      dmg *= rand(0.9, 1.1) * s.mult;
      if (crit) dmg *= riposte ? 1.9 : 1.6;
      // guard: blocked from the front unless it's a kick / charged heavy
      const rx = pl.pos.x - n.pos.x, rz = pl.pos.z - n.pos.z, rl = Math.hypot(rx, rz) || 1;
      const facingUs = (rx * Math.sin(n.facing) + rz * Math.cos(n.facing)) / rl > 0.2;
      const blocked = !s.guardBreak && !riposte && this._npcGuarding(n) && facingUs;
      if (blocked) { dmg *= 0.15; blockedAny = true; }
      dmg = Math.max(1, Math.round(dmg));
      const kb = (3 + def.damage * 0.12) * strK * s.kbMult * (blocked ? 0.3 : 1);
      let kd = false;
      if (!blocked) {
        if (s.kind === 'kick') kd = chance(0.85);
        else if (heavy) kd = s.power >= 0.45;
        else if (s.kind === 'finisher') kd = chance(crit ? 0.55 : 0.35);
      }
      const res = this.hitNpc(n, dmg, { dir: { x: dx, z: dz }, kb, heavy: heavy || crit || def.damage >= 20 || s.kind === 'finisher', melee: true,
        knockdown: kd, guardBreak: !!s.guardBreak, power: s.power || 0, crit, blocked });
      if (crit && !blocked) fx.number(n.pos.x, 2.6 * n.scale, n.pos.z, riposte ? 'RIPOSTE!' : pick(CRITS), 'crit');
      if (riposte) n.riposteUntil = 0;
      hitAny = true;
      if (res?.killed) killed = true;
      biggest = Math.max(biggest, dmg);
    }
    if (hitAny) {
      let snd = def.swing === 'overhead' || s.id === 'bat' ? 'smack' : ['knife', 'machete', 'bottle'].includes(s.id) ? 'slash' : 'punch';
      if (s.kind === 'kick') snd = 'kick';
      if (heavy || s.kind === 'finisher') snd = blockedAny ? 'block' : 'heavy';
      if (blockedAny && !heavy && s.kind !== 'kick') snd = 'block';
      fx.sfx.play(snd);
      if (s.kind === 'finisher' && !blockedAny) fx.sfx.play(def.swing === 'overhead' ? 'smack' : 'punch', { vol: 0.7 });
      // feel: hit-stop scaled by how hard it landed, then camera shake
      const stop = blockedAny && !heavy ? 0.03 : heavy ? 0.06 + 0.07 * (s.power || 0) : s.kind === 'finisher' || s.kind === 'kick' ? 0.065 : 0.04;
      fx.hitStop(stop + (killed ? 0.04 : 0));
      g.cameraRig?.shake?.(clamp(0.06 + biggest / 200 + (heavy ? 0.12 * (s.power || 0) : 0), 0.06, 0.5), 0.18);
      if (blockedAny && !heavy && s.kind !== 'kick') { pl.vel.x -= dx * 3; pl.vel.y -= dz * 3; this.cd = Math.max(this.cd, 0.3); }
      else if (!heavy) { pl.vel.x += dx * 2.5; pl.vel.y += dz * 2.5; }
    }
  }

  // Player (local) damages an NPC; handles crimes. Returns damage() result.
  hitNpc(n, dmg, opts) {
    const g = this.game;
    // a fight breaks out: loungers & bystanders nearby get up and scram
    if (!opts?.gun && (this._fightAlarm || 0) < g.elapsed) { this._fightAlarm = g.elapsed + 1; this.ctx.ambient?.panic(n.pos.x, n.pos.z, 12); }
    const wasAggro = !!n.aggressor || n.hostile && n.target?.type === 'player';
    const res = this.ctx.npcs.damage(n.id, dmg, 'local', opts);
    if ((n.kind === 'cop' || !wasAggro) && !n.brawlId && !n.assaulted && n.kind !== 'static') {
      n.assaulted = true;
      this.ctx.police?.crime(n.kind === 'cop' ? 'assaultCop' : 'assault', n.pos.x, n.pos.z, n);
    }
    this.lastCombatT = g.elapsed;
    if (res?.killed) this._finalBlowCheck(n);
    return res;
  }

  // Last one standing in a brawl (or a boss) went down: a beat of slow-mo.
  _finalBlowCheck(n) {
    const fx = this.ctx.fx;
    if (n.boss || n.bossName) { fx.slowMo(0.2, 1.3); this.game.cameraRig?.shake?.(0.45, 0.4); return; }
    if (!n.brawlId) return;
    for (const o of this.ctx.npcs.map.values()) {
      if (o !== n && !o.dead && o.brawlId === n.brawlId && o.state !== 'flee' && !(o.predictedHp <= 0)) return;
    }
    fx.slowMo(0.25, 0.9);
    this.game.cameraRig?.shake?.(0.3, 0.3);
  }

  // ------------------------------------------------------------ dodge / block / status
  tryRoll(x, z) {
    const g = this.game, pl = g.player, fx = this.ctx.fx;
    if (this.rollGap > 0 || pl.model.rolling) return false;
    if (this.rollCharges <= 0) { fx.sfx.play('click', { vol: 0.4 }); return false; }
    this.rollCharges--;
    this.rollRegen = 0;
    this.rollGap = 0.42;
    this._endBlock(); this._cancelCharge();
    this.swing = null; this.holdStart = null; this.buffer = 0;
    pl.dash = { x, z, speed: 11, t: 0.34 };
    pl.model.roll(0.4);
    this.iframes = 0.32;
    pl.faceOverride = Math.atan2(x, z);
    this.faceT = 0.36;
    fx.sfx.play('whoosh', { vol: 0.8 });
    g.bus.emit('player:roll', { x, z });
    return true;
  }

  _startBlock() {
    const g = this.game;
    this.blocking = true;
    this.parryOk = g.elapsed - this.blockUpAt > 0.35; // no parry-mashing
    this.blockAt = g.elapsed;
    this._cancelCharge();
    this.swing = null;
    g.player.model.setBlock?.(true);
  }

  _endBlock() {
    if (!this.blocking) return;
    this.blocking = false;
    this.blockUpAt = this.game.elapsed;
    try { this.game.player.model.setBlock?.(false); } catch { /* ignore */ }
  }

  _updateStatus(dt) {
    const g = this.game, pl = g.player;
    if (this.kdT > 0) {
      this.kdT -= dt;
      if (this.kdT <= 0) {
        if (!pl.dead && !this.isDown) { pl.model.setDead(false, { fall: true }); this.iframes = 0.6; }
        this._unlockMove();
      }
    }
    if (this.tasedT > 0) {
      this.tasedT -= dt;
      if (Math.random() < 0.3) pl.model.flash?.();
      if (this.tasedT <= 0) this._unlockMove();
    }
  }

  _unlockMove() {
    const g = this.game, pl = g.player;
    if (pl.dead || this.isDown || this.ctx.police?.arresting || this.kdT > 0 || this.tasedT > 0 || g.skate?.on) return;
    pl.moveLocked = false;
  }

  _knockPlayer(dir) {
    const g = this.game, pl = g.player;
    this.kdT = 1.05;
    pl.moveLocked = true;
    this._endBlock(); this._cancelCharge(); this.swing = null;
    if (dir) { pl.faceOverride = Math.atan2(-dir.x, -dir.z); pl.facing = pl.faceOverride; pl.group.rotation.y = pl.facing; this.faceT = 1.1; pl.dash = { x: dir.x, z: dir.z, speed: 7, t: 0.22 }; }
    pl.model.setDead(true, { fall: true });
    g.cameraRig?.shake?.(0.4, 0.3);
  }

  _tase() {
    const g = this.game, pl = g.player;
    this.tasedT = 1.0;
    pl.moveLocked = true;
    this._endBlock(); this._cancelCharge(); this.swing = null;
    this.ctx.fx.alert(pl.group, 'stun', 1.0, 2.5);
    this.ctx.fx.number(pl.pos.x, 2.5, pl.pos.z, 'TASED!', 'parry');
    g.cameraRig?.shake?.(0.25, 0.8);
  }

  _parry(npc) {
    const g = this.game, fx = this.ctx.fx, pl = g.player;
    fx.sfx.play('parry');
    fx.number(pl.pos.x, 2.5, pl.pos.z, 'PARRY!', 'parry');
    fx.hitStop(0.12);
    g.cameraRig?.shake?.(0.15, 0.15);
    if (npc) this.ctx.npcs.parried?.(npc);
    this.lastCombatT = g.elapsed;
    g.bus.emit('player:parry', { npc: npc?.id });
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
    const spread = ((def.spread || 0) + this.bloom) * (pl.speed > 1 ? 1.6 : 1);
    const hits = new Map();
    const heads = new Set();
    const shots = [];
    const steady = pl.speed < 0.6;
    for (let i = 0; i < pellets; i++) {
      let a = ang + rand(-spread, spread);
      let c = this._cast(ox, oz, a, def.range);
      let assisted = false;
      if (!c.npc && pellets === 1) {
        const as = this._assist(ox, oz, a, def.range);
        if (as) { const c2 = this._cast(ox, oz, as.ang, def.range); if (c2.npc) { c = c2; a = as.ang; assisted = true; } }
      }
      const ex = ox + c.dx * c.t, ez = oz + c.dz * c.t;
      fx.tracer(muzzle.x, muzzle.y, muzzle.z, ex, 1.15 + rand(-0.15, 0.2), ez);
      shots.push([Math.round(ex * 10) / 10, Math.round(ez * 10) / 10]);
      if (c.npc) {
        const falloff = pellets > 1 ? clamp(1.15 - c.t / def.range, 0.35, 1) : 1;
        hits.set(c.npc, (hits.get(c.npc) || 0) + def.damage * falloff);
        // dead-center shots are headshots (the 2D cast can't see height; precision is the skill)
        if (pellets === 1 && !assisted && c.lat < (0.12 + (steady ? 0.06 : 0)) * c.npc.scale) heads.add(c.npc);
      } else if (c.t < c.maxT + 0.01 && c.maxT < def.range - 0.1) {
        // wall puff
        for (let k = 0; k < 3; k++) fx._gib(ex - c.dx * 0.2, rand(0.8, 1.6), ez - c.dz * 0.2, { x: -c.dx, z: -c.dz }, 0x8a8478, 0.7);
      }
    }
    let killed = false;
    for (const [n, raw] of hits) {
      const head = heads.has(n);
      const crit = !head && chance(pellets > 1 ? 0.04 : 0.05);
      const dmg = Math.round(raw * rand(0.92, 1.08) * (head ? 2.2 : crit ? 1.5 : 1));
      const kb = pellets > 1 ? 2 + raw * 0.12 : 1.2 + def.damage * 0.06;
      const dir = { x: Math.sin(ang), z: Math.cos(ang) };
      const res = this.hitNpc(n, dmg, { dir, kb, heavy: raw >= 40, gun: true, crit: head || crit, knockdown: raw >= 40 && chance(0.5) });
      if (res?.killed) killed = true;
      if (head) fx.number(n.pos.x, 2.7 * n.scale, n.pos.z, 'HEADSHOT!', 'crit');
      else if (crit) fx.number(n.pos.x, 2.6 * n.scale, n.pos.z, pick(['RIGHT IN THE DIGNITY!', 'BULLSEYE!', 'DOUBLE TAP!']), 'crit');
    }
    if (hits.size) { this._hitMarker(killed); fx.hitStop(killed ? 0.05 : 0.02); }
    const big = id === 'shotgun' || id === 'rifle' || id === 'revolver' || id === 'goldengun';
    fx.muzzle(muzzle.x, muzzle.y, muzzle.z, big ? 0.9 : 0.6);
    fx.sfx.play(id === 'shotgun' ? 'shotgun' : id === 'smg' ? 'smg' : big ? 'biggun' : 'gun');
    g.cameraRig?.shake?.(id === 'shotgun' ? 0.3 : big ? 0.22 : id === 'smg' ? 0.05 : 0.1, 0.15);
    // recoil: kick the camera up, wobble the yaw, bloom the spread
    const rc = RECOIL[id] ?? 0.02;
    g.cameraRig.pitch = clamp(g.cameraRig.pitch - rc * 0.9, -0.15, 1.35);
    g.cameraRig.yaw += rand(-1, 1) * rc * 0.35;
    this.bloom = Math.min(0.12, this.bloom + rc * 0.9);
    this.ctx.police?.crime('gunfire', ox, oz);
    this.ctx.ambient?.panic(ox, oz, 28);
    try { if (g.net.connected) g.net.broadcast({ t: 'combat:shot', x: muzzle.x, y: muzzle.y, z: muzzle.z, s: shots, w: id }); } catch { /* ignore */ }
    if (p.mags[id] === 0 && p.ammo?.[def.ammo] > 0) this.startReload();
    if (!this._magTick || this._magTick < g.elapsed) { this._magTick = g.elapsed + 1; g.state.changed('ammo'); }
    this.lastCombatT = g.elapsed;
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
  // opts: { dir, gun, melee, heavyHit, unblockable, knockdown, taser }
  hurtTarget(npc, target, dmg, opts = {}) {
    if (!target) return;
    const g = this.game;
    if (target.type === 'player') {
      this.hurtPlayer(dmg, { npc, lethal: !npc.nonLethal, cop: npc.kind === 'cop', dir: opts.dir, source: npc.name, brawlId: npc.brawlId, gun: opts.gun,
        melee: opts.melee, heavyHit: opts.heavyHit, unblockable: opts.unblockable, knockdown: opts.knockdown, taser: opts.taser });
    } else if (target.type === 'remote') {
      try {
        g.net.sendTo(target.id, { t: 'combat:hitPlayer', dmg, lethal: !npc.nonLethal, cop: npc.kind === 'cop', dx: opts.dir?.x ?? 0, dz: opts.dir?.z ?? 0, src: npc.name, b: npc.brawlId, gun: !!opts.gun, from: npc.id,
          m: !!opts.melee, hv: !!opts.heavyHit, ub: !!opts.unblockable, kd: !!opts.knockdown, tz: !!opts.taser });
      } catch { /* ignore */ }
    } else if (target.type === 'npc') {
      this.ctx.npcs.damage(target.id, dmg, npc.id, { dir: opts.dir, kb: 3 });
    }
  }

  hurtPlayer(dmg, opts = {}) {
    const g = this.game, pl = g.player, p = this.p;
    if (!pl || pl.dead || this.isDown || !g.started || this.ctx.police?.arresting) return;
    if (pl.vehicle) dmg = Math.round(dmg * (opts.gun ? 0.5 : 0));
    if (dmg <= 0) return;
    const fx = this.ctx.fx;
    this.lastHurtT = g.elapsed; this.lastCombatT = g.elapsed;
    // dodge roll i-frames beat everything
    if (this.iframes > 0 && !pl.vehicle) { fx.number(pl.pos.x, 2.3, pl.pos.z, 'DODGE', 'small'); return; }
    let blocked = false;
    if (this.blocking && !pl.vehicle && !opts.unblockable && !opts.taser) {
      const fwx = Math.sin(pl.facing), fwz = Math.cos(pl.facing);
      const front = !opts.dir || (-opts.dir.x * fwx - opts.dir.z * fwz) > 0.1;
      if (front && opts.melee) {
        if (this.parryOk && g.elapsed - this.blockAt < PARRY_WINDOW) { this._parry(opts.npc); return; }
        dmg = Math.round(dmg * (opts.heavyHit ? 0.45 : 0.15));
        blocked = true;
        fx.sfx.play('block');
        fx.number(pl.pos.x, 2.3, pl.pos.z, 'BLOCKED', 'block');
        fx.hitStop(0.03);
        g.cameraRig?.shake?.(0.08, 0.12);
        if (opts.dir) { pl.vel.x += opts.dir.x * 2.5; pl.vel.y += opts.dir.z * 2.5; }
        if (dmg < 1) return;
      } else if (front && opts.gun) dmg = Math.round(dmg * 0.7);
    }
    const heat = p.heat || 0;
    const nonLethal = opts.lethal === false;
    const copBust = opts.cop && heat < 3;
    if (copBust && p.hp - dmg <= p.maxHp * 0.2) { this.ctx.police?.arrest({ beaten: true }); return; }
    if (nonLethal && p.hp - dmg <= 1) { this.knockout(opts); return; }

    if (!blocked) {
      pl.model.flash();
      if (opts.dir) pl.model.hitReact?.(Math.sign(opts.dir.x * Math.cos(pl.facing) - opts.dir.z * Math.sin(pl.facing)) || 0);
      fx.hurtFlash(clamp(dmg / 30, 0.25, 1));
      fx.sfx.play('hurt');
      fx.blood(pl.pos.x, pl.pos.z, clamp(dmg / 20, 0.4, 1.5), opts.dir || null, 1.2);
      g.cameraRig?.shake?.(clamp(0.12 + dmg / 120, 0.12, 0.45), 0.22);
      if (opts.dir && !pl.vehicle) { pl.vel.x += opts.dir.x * (3 + dmg * 0.12); pl.vel.y += opts.dir.z * (3 + dmg * 0.12); }
      // flinch: a solid hit interrupts your swing / charge
      if (dmg >= 8 && !pl.vehicle) { this.cd = Math.max(this.cd, 0.2); if (dmg >= 14) { this._cancelCharge(); this.swing = null; } }
    }
    fx.number(pl.pos.x, 2.2, pl.pos.z, '-' + Math.round(dmg), 'hurt');
    g.state.damage(dmg, opts.source || 'beating');
    const free = !pl.vehicle && !g.skate?.on && !pl.dead && p.hp > 0 && !this.isDown;
    if (free && opts.knockdown && !blocked) this._knockPlayer(opts.dir);
    if (free && opts.taser) this._tase();
  }

  // Non-lethal loss: drunks and Pit fighters just put you to sleep.
  knockout(opts = {}) {
    const g = this.game, pl = g.player, p = this.p;
    if (this.isDown || pl.dead) return;
    this.isDown = true;
    this._resetMoves();
    pl.moveLocked = true;
    pl.aiming = false;
    pl.model.setDead(true, { fall: true });
    p.hp = Math.max(1, Math.round(p.maxHp * 0.12));
    const lost = Math.min(p.money, Math.round(p.money * rand(0.04, 0.1)));
    if (lost > 0) g.state.addMoney(-lost, 'knocked out');
    g.state.changed('hp');
    p.totals.fightsLost = (p.totals.fightsLost || 0) + 1;
    this.ctx.fx.sfx.play('punch');
    g.cameraRig?.shake?.(0.5, 0.4);
    this.ctx.fx.slowMo(0.3, 0.6);
    g.ui.bigText('KNOCKED OUT', esc(pick(KO_SUBS)) + (lost ? ` <span style="color:#e2402f">-${fmtMoney(lost)}</span>` : ''), 3000);
    this.downT = 3.2;
    this._loseBrawlsFor('player', 'ko');
    // gloating
    for (const n of this.ctx.npcs.map.values()) {
      if (n.target?.type === 'player' && n.hostile && n.nonLethal && !n.replica) {
        n.hostile = false; n.target = null; n.state = 'wander'; n.goal = null; n.brawlId = null;
        this.ctx.npcs._cancelAttack?.(n);
        if (n.dist < 20) this.ctx.fx.say(n.group, pick(['And STAY down!', 'Lights out, noodle arms.', 'Who\'s next?!', 'That\'s what I thought.']), { ttl: 2.5, kind: 'angry' });
      }
    }
    if (g.net.isClient) { try { g.net.sendToHost({ t: 'combat:down', ko: true }); } catch { /* ignore */ } }
  }

  getUp() {
    const g = this.game, pl = g.player;
    this.isDown = false;
    pl.moveLocked = false;
    pl.model.setDead(false, { fall: true });
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
    this._resetMoves();
    try { pl.model.setDead(true, { fall: true }); } catch { /* ignore */ }
    this.swing = null;
    this.ctx.fx.sfx.play('trombone');
    this.ctx.fx.blood(pl.pos.x, pl.pos.z, 2.5, null, 0.5);
    this.ctx.fx.slowMo(0.3, 0.8);
    g.cameraRig?.shake?.(0.6, 0.5);
    g.ui.bigText('WRECKED', esc(pick(DEATH_SUBS)), 3600);
    p.totals.deaths = (p.totals.deaths || 0) + 1;
    this.deathT = 3.4;
    this._loseBrawlsFor('player', 'died');
    for (const n of this.ctx.npcs.map.values()) {
      if (n.target?.type === 'player' && !n.replica) { n.target = null; this.ctx.npcs._cancelAttack?.(n); if (n.state === 'chase') n.state = 'hunt'; }
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
      wasHostile: !!npc.wasHostile, brawl: !!npc.brawlId, weapon: npc.weapon, faction: npc.faction, name: npc.name, scale: npc.scale, boss: !!npc.boss };
    if (local) this.reward(info);
    else if (attackerId && g.net.remotePlayers?.has?.(attackerId)) {
      try { g.net.sendTo(attackerId, { t: 'npc:kill', info }); } catch { /* ignore */ }
    }
    if (this.lock === npc) this.lock = null;
    g.bus.emit('npc:killed', { npc, byPlayer: local, ko: npc.ko });
    if (npc.persistent && npc.kind === 'dealer') this.ctx.ambient?.dealerDown?.(npc);
  }

  // Client: a replica we were fighting went down (host will send npc:kill if it was us).
  onReplicaDown(npc) { if (this.lock === npc) this.lock = null; this.game.bus.emit('npc:killed', { npc, byPlayer: false, ko: npc.ko, remote: true }); }

  reward(info) {
    const g = this.game, p = this.p, fx = this.ctx.fx;
    const R = ROLE_REWARD[info.role] || ROLE_REWARD[info.kind] || ROLE_REWARD.ped;
    const xp = Math.round(R.xp * (info.ko ? 0.8 : 1) * (info.boss ? 3 : 1));
    if (xp > 0) { g.state.addXP(xp); fx.number(info.x, 2.8, info.z, `+${xp} XP`, 'small'); }
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
    let droppedAmmo = false;
    if (w && WEAPONS[w] && w !== 'fists') {
      const def = WEAPONS[w];
      if (!p.weapons.includes(w) && chance(def.kind === 'gun' ? 0.35 : 0.45)) {
        fx.dropPickup(info.x, info.z, { kind: 'weapon', weapon: w, ammo: def.kind === 'gun' ? def.mag : 0, mesh: weaponMesh(w) });
      } else if (def.kind === 'gun' && chance(0.6)) {
        fx.dropPickup(info.x, info.z, { kind: 'ammo', ammoType: def.ammo, qty: Math.max(3, Math.round(def.mag * 0.6)) });
        droppedAmmo = true;
      }
    }
    // hostiles sometimes carry rounds for whatever gun YOU use
    if (!droppedAmmo && (info.aggressor || info.wasHostile) && !innocent) {
      const guns = (p.weapons || []).filter((id) => WEAPONS[id]?.kind === 'gun');
      if (guns.length && chance(info.kind === 'cop' ? 0.45 : 0.25)) {
        const cur = WEAPONS[this.weaponId]?.kind === 'gun' ? this.weaponId : pick(guns);
        const def = WEAPONS[cur];
        fx.dropPickup(info.x, info.z, { kind: 'ammo', ammoType: def.ammo, qty: Math.max(2, Math.round(def.mag * rand(0.3, 0.6))) });
      }
    }
    if (['thug', 'gang', 'dealer', 'shady'].includes(info.role) && this.DRUGS && chance(info.role === 'dealer' ? 0.8 : 0.22)) {
      const ids = Object.keys(this.DRUGS);
      if (ids.length) fx.dropPickup(info.x, info.z, { kind: 'drug', drug: pick(ids), qty: randInt(1, info.role === 'dealer' ? 5 : 2) });
    }
    if (this.ITEMS && chance(info.boss ? 1 : 0.18)) {
      const ids = (info.boss ? ['first_aid', 'painkillers'] : ITEM_CANDIDATES).filter((i) => this.ITEMS[i]);
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
  // spec: { x, z, count, kind:'drunk'|'thug'|'gang'|'fighter', label, tier, faction, onWin(game), onLose(game),
  //         boss?: true | { name, hp, moves:['combo','charge','slam','block','summon'], weapon, scale, color, hat, hatColor, dmg, tag } }
  // A boss counts as one of `count` (the rest are its goons). Without spec.boss, a lone Pit/ring 'fighter' at tier 2+
  // and "<Name> & the <Goons>" groups (count 3+, tier 2+) get a boss automatically.
  startBrawl(spec = {}) {
    const g = this.game;
    if (!g.net.isAuthority) {
      const id = 'cb' + (this.brawlSeq++) + '_' + Math.random().toString(36).slice(2, 6);
      this.pendingBrawls.set(id, spec);
      const { onWin, onLose, ...plain } = spec;
      const pp = g.player.pos;
      plain.x = plain.x ?? pp.x; plain.z = plain.z ?? pp.z;
      try { g.net.sendToHost({ t: 'combat:brawl', id, spec: JSON.parse(JSON.stringify(plain)) }); } catch (e) { console.error(e); }
      this._brawlIntro(spec, this._bossSpec(spec));
      return id;
    }
    return this._hostBrawl(spec, { type: 'player' }, null, null);
  }

  _brawlIntro(spec, boss = null) {
    const g = this.game;
    if (boss) {
      g.ui.bigText(esc(boss.name.toUpperCase()), esc(spec.label && spec.label !== boss.name ? spec.label : 'Watch for the tells. Kick breaks guards.'), 2000);
      this.ctx.fx.sfx.play('bell', { vol: 0.8 });
    } else {
      g.ui.bigText('FIGHT!', esc(spec.label || 'Put \'em up!'), 1500);
      this.ctx.fx.sfx.play('smack', { vol: 0.6 });
    }
    if (!g.state.getFlag('combat_tips')) {
      g.state.setFlag('combat_tips', true);
      setTimeout(() => g.ui.toast('<b>Fighting:</b> click = combo · hold click = heavy · right-click / <kbd>B</kbd> = kick · hold <kbd>C</kbd> = block (tap right before a hit to <b>parry</b>) · <kbd>Z</kbd> = roll · <kbd>Y</kbd> = heal · middle-click = lock on', 'info', 9000), 1600);
    }
  }

  // Resolve spec.boss (or the auto-boss heuristics) to a plain object, or null.
  _bossSpec(spec) {
    if (spec.boss === false) return null;
    const tier = spec.tier ?? 0, count = spec.count ?? 1;
    const label = String(spec.label || '');
    let b = spec.boss && typeof spec.boss === 'object' ? { ...spec.boss } : null;
    if (!b && spec.boss === true) b = {};
    if (!b && spec.kind === 'fighter' && count === 1 && tier >= 2) b = { name: label.replace(/^The Pit:\s*/i, '') };
    if (!b && count >= 3 && tier >= 2 && / & /.test(label)) b = { name: label.split(' & ')[0], moves: ['combo', 'charge', 'block'] };
    if (!b) return null;
    b.name = b.name || label.replace(/^The Pit:\s*/i, '') || 'The Big Cheese';
    if (!b.moves) {
      b.moves = ['combo'];
      if (tier >= 3) b.moves.push('charge');
      if (tier >= 4) b.moves.push('block');
      if (tier >= 5) b.moves.push('slam');
      if (spec.kind !== 'fighter' && count === 1 && tier >= 3) b.moves.push('summon');
    }
    return b;
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
    const boss = this._bossSpec(spec);
    const b = { id, label: spec.label || 'Brawl', kind, tier, lethal, npcIds: [], onWin: spec.onWin, onLose: spec.onLose, peer, reqId, target, x: cx, z: cz, done: false, t: 0, faction, boss: boss?.name || null };
    let gunners = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
      const r = rand(3, 5.5);
      let x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const res = g.physics.resolveCircle(x, z, 0.5);
      x = res.x; z = res.z;
      const isBoss = !!boss && i === 0;
      let weapon = kind === 'fighter' ? (tier >= 3 && chance(0.5) ? 'brass' : 'fists') : kind === 'drunk' ? (chance(0.3) ? 'bottle' : 'fists') : undefined;
      if (weapon === undefined) {
        // early fights stay winnable with fists: no guns below tier 2, at most one gunner below tier 4
        const pool = kind === 'gang' ? (faction === 'bikers' ? ['crowbar', 'bat', 'knife', 'fists'] : ['knife', 'bat', 'fists', 'pistol']) : ['fists', 'knife', 'bat', 'bottle', 'knife', 'pistol'];
        weapon = pick(pool);
        if (weapon === 'pistol' && (tier < 2 || (tier < 4 && gunners >= 1))) weapon = pick(['fists', 'knife', 'bat']);
        if (weapon === 'pistol') gunners++;
      }
      if (isBoss && boss.weapon) weapon = boss.weapon;
      const baseHp = ({ drunk: 45, thug: 65, gang: 75, fighter: 70 })[kind];
      let hp = Math.round(baseHp * (1 + 0.42 * tier) * rand(0.9, 1.1) * (weapon === 'knife' || weapon === 'bottle' ? 0.88 : 1));
      if (isBoss) hp = Math.round(boss.hp ?? baseHp * (1 + 0.42 * tier) * (count === 1 ? 2.5 : 1.8));
      const npc = this.ctx.npcs.spawn({
        kind: kind === 'fighter' ? 'fighter' : kind, role: kind, faction, x, z,
        facing: Math.atan2(tp.x - x, tp.z - z), hostile: true, networked: true, brawlId: id, wander: false, tier,
        weapon, hp,
        boss: isBoss ? boss : undefined,
        scale: isBoss ? (boss.scale ?? 1.22) : undefined,
        color: isBoss ? boss.color : undefined, hat: isBoss && boss.hat !== undefined ? boss.hat : undefined, hatColor: isBoss ? boss.hatColor : undefined,
        data: { brawl: true },
      });
      if (!npc) continue;
      npc.aggressor = true;
      npc.tierMult = (1 + 0.25 * tier) * (isBoss ? (boss.dmg ?? 1.1) : 1);
      if (kind === 'fighter') npc.run *= 1 + tier * 0.05;
      npc.target = target;
      npc.state = 'chase';
      npc.cd = isBoss ? rand(1.0, 1.6) : rand(0.6, 1.4) + i * 0.25;
      b.npcIds.push(npc.id);
      if (i === 0) this.ctx.fx.say(npc.group, isBoss ? pick(['You picked the wrong ring, pal.', 'I\'m gonna fold you like a lawn chair.', 'Somebody call your mama.']) : pick(TAUNTS), { ttl: 2.2, kind: 'angry' });
    }
    this.brawls.set(id, b);
    if (target.type === 'player') this._brawlIntro(spec, boss);
    return id;
  }

  // Boss move: call in two goons who join the same brawl.
  _summon(boss) {
    const b = this.brawls.get(boss.brawlId);
    if (!b || b.done) return;
    for (let i = 0; i < 2; i++) {
      const a = boss.facing + Math.PI + (i ? 1 : -1) * 0.9;
      const res = this.game.physics.resolveCircle(boss.pos.x + Math.sin(a) * 6, boss.pos.z + Math.cos(a) * 6, 0.5);
      const kind = b.kind === 'fighter' || b.kind === 'drunk' ? 'thug' : b.kind;
      const npc = this.ctx.npcs.spawn({ kind, role: kind, faction: b.faction, x: res.x, z: res.z, hostile: true, networked: true, brawlId: b.id, wander: false,
        tier: Math.max(0, b.tier - 1), weapon: pick(['fists', 'knife', 'bat']), hp: Math.round(55 * (1 + 0.3 * b.tier)), data: { brawl: true } });
      if (!npc) continue;
      npc.aggressor = true;
      npc.tierMult = 1 + 0.2 * b.tier;
      npc.target = b.target; npc.state = 'chase'; npc.cd = rand(0.8, 1.5);
      b.npcIds.push(npc.id);
    }
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
      this.ctx.npcs._cancelAttack?.(n);
      if (n.guard > 0) this.ctx.npcs._setGuard?.(n, 0);
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
      g.state.addXP(10 + 10 * (spec.tier || 0) + 3 * (spec.count || spec.npcIds?.length || 1) + (spec.boss ? 25 + 10 * (spec.tier || 0) : 0));
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
      if (n.target?.type === 'remote' && n.target.id === from) { n.target = null; this.ctx.npcs._cancelAttack?.(n); if (!n.brawlId && n.kind !== 'cop') { n.hostile = false; n.state = 'wander'; } else n.state = 'hunt'; }
    }
  }
}
