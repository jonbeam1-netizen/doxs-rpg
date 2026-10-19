// Skateboarding (skate agent). An on-foot riding mode — NOT a vehicle.
//
//   G            hop on / off (on foot, owning a board)
//   W / Shift+W  push / push harder (e-board: motor while battery lasts)
//   S            brake (+A/D at speed = powerslide)      A / D  carve
//   Space        ollie          Left click  kickflip (+D heelflip, +S pop shove-it, +A varial flip)
//   E            still interacts normally (entering a building / opening a dialog auto-dismounts)
//
// Save data: state.p.skate = { owned:[ids], board, unlocked, battery, quest:{stage,district,x,z},
//                              stats:{ landed, bails, bestCombo, tricks:{name:n}, chaBank, hinted } }
// Net message: { t:'skate', on, board, trick? }  — mount/dismount/trick; receivers put a board under the avatar.
// Bus events emitted: skate:mount {board}, skate:dismount {reason}, skate:trick {name, score, combo}, skate:unlocked
import { BOARDS, DECK_TOP, WHEEL_R, createBoardMesh, disposeBoardMesh } from './boards.js';
import { poseRider, resetRider } from './pose.js';
import { SkateAudio } from './audio.js';
import { SkateVendor } from './vendor.js';
import { clamp, lerp, pick, angleLerp, chance } from '../core/util.js';

const GRAV = 18;
const TRICKS = {
  ollie:    { label: 'OLLIE', score: 10 },
  kickflip: { label: 'KICKFLIP', score: 50, roll: 1 },
  heelflip: { label: 'HEELFLIP', score: 55, roll: -1 },
  shoveit:  { label: 'POP SHOVE-IT', score: 40, yaw: Math.PI },
  varial:   { label: 'VARIAL FLIP', score: 80, roll: 1, yaw: Math.PI },
};
const CHA_PER_TRICK = 0.03;  // banked; Charm only moves in 0.1 steps
const CHA_COOLDOWN = 8;      // seconds between trick Charm payouts
const BAIL_LINES = [
  'You kiss the pavement. The pavement does not kiss back.',
  'Bailed. A pigeon saw everything and is telling its friends.',
  'Face, meet concrete. Concrete, meet face. You two will be seeing a lot of each other.',
  'You eat it so hard a nearby hobo applauds.',
  'Your board keeps going without you. It deserves better, honestly.',
  'That one\'s going on a "fails" compilation. Monetized. Not by you.',
];

function defaults() {
  return {
    owned: [], board: null, unlocked: false, battery: 100,
    quest: { stage: 'none', district: null, x: null, z: null },
    stats: { landed: 0, bails: 0, bestCombo: 0, tricks: {}, chaBank: 0, hinted: false },
  };
}

class Skate {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.mode = null;          // 'ride' | 'bail'
    this.mesh = null;
    this.boardId = null;
    this.heading = 0;
    this.v = 0;
    this.airY = 0;
    this.vy = 0;
    this.steer = 0;
    this.slide = 0;
    this.pushPhase = -1;
    this.trick = null;          // { name, t, dur, roll, yaw }
    this.airTime = 0;
    this.combo = { n: 0, score: 0, last: -99 };
    this.chaReady = 0;
    this.mouseIdle = 0;
    this.motoring = false;
    this.bail = null;
    this.prevCam = null;
    this.remotes = new Map();   // peerId -> { boardId, mesh, trick, phase }
    this.audio = new SkateAudio(game);
    this.vendor = new SkateVendor(game, this);
    this._noBoardToast = -99;
    this._t = 0;
  }

  // ------------------------------------------------------------ save data
  data() {
    const p = this.game.state.p;
    if (!p.skate || typeof p.skate !== 'object') p.skate = defaults();
    const d = p.skate, def = defaults();
    for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = def[k];
    if (!Array.isArray(d.owned)) d.owned = [];
    d.owned = d.owned.filter((id) => BOARDS[id]);
    if (!d.quest || typeof d.quest !== 'object') d.quest = def.quest;
    if (!d.stats || typeof d.stats !== 'object') d.stats = def.stats;
    if (!d.stats.tricks) d.stats.tricks = {};
    if (d.board && !d.owned.includes(d.board)) d.board = d.owned[0] || null;
    if (!d.board && d.owned.length) d.board = d.owned[0];
    return d;
  }

  selectBoard(id) {
    const d = this.data();
    if (!d.owned.includes(id)) return;
    d.board = id;
    this.game.state.changed('skate');
    if (this.on && this.mode === 'ride') {
      this._swapMesh(id);
      this.audio.stop();
      this.audio.start(!!BOARDS[id].motor);
      this._broadcast({ on: true });
    }
  }

  // ------------------------------------------------------------ mount / dismount
  canMount() {
    const g = this.game, pl = g.player;
    return g.started && pl && !pl.vehicle && !pl.dead && !pl.moveLocked && !g.controlsLocked && !g.combat?.isDown && !pl.model?.dead;
  }

  mount() {
    const g = this.game, pl = g.player, d = this.data();
    if (!d.board) {
      if (g.elapsed - this._noBoardToast > 2.5) {
        this._noBoardToast = g.elapsed;
        g.ui.toast(d.unlocked ? 'Pick a board at Kev\'s first.' : 'You don\'t have a board. <b>Skidmark Kev</b> hangs out by Threads & Dreads downtown.', 'info', 3200);
      }
      return;
    }
    if (!this.canMount()) return;
    this.on = true;
    this.mode = 'ride';
    this.heading = pl.facing;
    this.v = Math.min(pl.speed || 0, 8);
    this.airY = 0; this.vy = 0; this.steer = 0; this.slide = 0; this.trick = null; this.pushPhase = -1;
    this._swapMesh(d.board);
    pl.moveLocked = true;
    pl.aiming = false;
    const rig = g.cameraRig;
    if (rig) { this.prevCam = { d: rig.distOverride, h: rig.height }; }
    this.audio.start(!!BOARDS[d.board].motor);
    this.audio.play('mount');
    if (!d.stats.hinted) {
      d.stats.hinted = true;
      g.ui.toast('<kbd>W</kbd> push · <kbd>A</kbd>/<kbd>D</kbd> carve · <kbd>Space</kbd> ollie · <kbd>Click</kbd> kickflip · <kbd>G</kbd> get off', 'info', 6500);
    }
    this._broadcast({ on: true });
    g.bus.emit('skate:mount', { board: d.board });
  }

  // reason: 'key' | 'vehicle' | 'ui' | 'dead' | 'down' | 'arrest' | 'bail' | 'reset' | ...
  dismount(reason = 'key') {
    if (!this.on) return;
    const g = this.game, pl = g.player;
    this.on = false;
    this.mode = null;
    this.bail = null;
    this.trick = null;
    const model = pl?.model;
    try {
      const down = pl.dead || g.combat?.isDown;
      if (model?.dead && !down) model.setDead(false);
      resetRider(model);
    } catch (e) { console.error('[skate] pose reset failed', e); }
    if (pl) {
      if (!pl.vehicle) pl.group.position.y = 0;
      pl.vy = 0;
      const arresting = !!g.combat?._ctx?.police?.arresting;
      if (!(pl.dead || g.combat?.isDown || arresting)) pl.moveLocked = false;
      if (reason === 'key') {
        const s = Math.min(this.v, pl.runSpeed || 9.5);
        pl.vel.set(Math.sin(this.heading) * s, Math.cos(this.heading) * s);
      }
    }
    this._removeMesh();
    this.audio.stop();
    g.ui.setHud('vehicle', '');
    const rig = g.cameraRig;
    if (rig && this.prevCam && rig.target === pl?.group) { rig.distOverride = this.prevCam.d; rig.height = this.prevCam.h; }
    this.prevCam = null;
    this.v = 0;
    this._broadcast({ on: false, bail: reason === 'bail' });
    g.bus.emit('skate:dismount', { reason });
  }

  _swapMesh(id) {
    this._removeMesh();
    this.boardId = id;
    this.mesh = createBoardMesh(id);
    this.game.scene.add(this.mesh);
  }

  _removeMesh() {
    if (this.mesh) disposeBoardMesh(this.mesh);
    this.mesh = null;
  }

  // ------------------------------------------------------------ per-frame (runs right after Player.update)
  update(dt) {
    const g = this.game, pl = g.player;
    if (!g.started || !pl) return;
    this._t += dt;
    const d = this.data();
    try { this.vendor.update(dt); } catch (e) { if (!this._ve) { console.error('[skate] vendor update', e); this._ve = true; } }

    if (!this.on) {
      const def = d.board && BOARDS[d.board];
      if (def?.motor && d.battery < def.battery && !pl.vehicle) d.battery = Math.min(def.battery, d.battery + 2 * dt);
      if (g.input.wasPressed('KeyG') && !g.controlsLocked && !pl.vehicle && !pl.dead) this.mount();
      return;
    }

    // Forced exits.
    if (pl.vehicle) return this.dismount('vehicle');
    if (pl.dead) return this.dismount('dead');
    if (g.combat?.isDown) return this.dismount('down');
    if (g.combat?._ctx?.police?.arresting) return this.dismount('arrest');
    if (g.controlsLocked) return this.dismount('ui');

    if (this.mode === 'bail') return this._updateBail(dt);

    const inp = g.input;
    if (inp.wasPressed('KeyG')) return this.dismount('key');
    if (inp.wasPressed('KeyF')) {
      // Vehicles ignore F while moveLocked; hop off and try the car ourselves.
      this.dismount('key');
      try { g.vehicles?.tryEnter?.(); } catch (e) { console.error('[skate] tryEnter failed', e); }
      return;
    }
    pl.moveLocked = true;
    this._ride(dt, d);
  }

  _ride(dt, d) {
    const g = this.game, pl = g.player, inp = g.input;
    const def = BOARDS[this.boardId] || BOARDS.plank;
    const W = inp.isDown('KeyW') || inp.isDown('ArrowUp');
    const S = inp.isDown('KeyS') || inp.isDown('ArrowDown');
    const A = inp.isDown('KeyA'), D = inp.isDown('KeyD');
    const shift = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
    const grounded = this.airY <= 0.0001;
    const sm = clamp(pl.speedMult ?? 1, 0.6, 1.3);

    // --- propulsion
    let top = def.top * sm, accel = def.push * (shift ? 1.4 : 1);
    this.motoring = false;
    if (def.motor) {
      if (W && d.battery > 0) {
        this.motoring = true;
        accel = def.motor * (shift ? 1.15 : 1);
        d.battery = Math.max(0, d.battery - def.drain * dt * (shift ? 1.4 : 1));
        if (d.battery <= 0) g.ui.toast('Battery dead. Now it\'s a 9kg plank with ambitions. Push it.', 'bad', 3500);
      } else top = Math.min(top, def.unpoweredTop * sm);
    }
    const cap = this.motoring ? top : top * (shift ? 1 : 0.86);
    const pushing = W && grounded && !this.motoring;
    if (W && grounded && this.v < cap) this.v = Math.min(cap, this.v + accel * dt * (1 - 0.45 * this.v / cap));
    // push leg animation phase
    if (pushing || (this.pushPhase >= 0 && this.pushPhase < 1)) {
      const prev = this.pushPhase < 0 ? 0 : this.pushPhase;
      this.pushPhase = prev + dt * (shift ? 2.1 : 1.6);
      if (prev < 0.15 && this.pushPhase >= 0.15) this.audio.play('push');
      if (this.pushPhase >= 1) this.pushPhase = pushing ? 0 : -1;
    }
    if (!grounded) this.pushPhase = -1;

    // --- drag / braking / powerslide
    const steerIn = (A ? 1 : 0) - (D ? 1 : 0);
    const sliding = grounded && S && steerIn !== 0 && this.v > 5;
    if (sliding && this.slide < 0.1) this.audio.play('slide');
    this.slide = lerp(this.slide, sliding ? 1 : 0, 1 - Math.exp(-8 * dt));
    if (grounded) {
      this.v -= (0.3 + 0.008 * this.v * this.v) * dt;
      if (S) this.v -= (sliding ? 13 : 8) * dt;
    } else this.v -= 0.003 * this.v * this.v * dt;
    this.v = Math.max(0, this.v);

    // --- carving
    this.steer = lerp(this.steer, steerIn, 1 - Math.exp(-8 * dt));
    const k = Math.min(this.v / def.top, 1);
    let rate = grounded ? def.turn * (1 - 0.3 * k) + (this.v < 1.2 ? 1.4 : 0) : def.turn * 0.45;
    if (sliding) rate *= 1.3;
    this.heading += this.steer * rate * dt;

    // --- move + collide
    const p = pl.group.position;
    const dirX = Math.sin(this.heading), dirZ = Math.cos(this.heading);
    const wx = p.x + dirX * this.v * dt, wz = p.z + dirZ * this.v * dt;
    const res = g.physics.resolveCircle(wx, wz, pl.radius ?? 0.45);
    if (res.hit) {
      let nx = res.x - wx, nz = res.z - wz;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-5) {
        nx /= nl; nz /= nl;
        const headOn = Math.max(0, -(dirX * nx + dirZ * nz));
        if (this.v > def.top * 0.6 && headOn > 0.45) { p.x = res.x; p.z = res.z; return this._startBail('wall'); }
        this.v *= 1 - headOn * Math.min(1, 6 * dt + headOn * 0.6);
        // glance off: steer along the wall
        if (headOn > 0.05 && headOn < 0.9) {
          const tx = dirX + nx * headOn, tz = dirZ + nz * headOn;
          this.heading = angleLerp(this.heading, Math.atan2(tx, tz), 0.5);
        }
      }
    }
    p.x = res.x; p.z = res.z;
    // plowing into a pedestrian at speed
    if (this.v > def.top * 0.6 && g.npcs?.near) {
      const hit = g.npcs.near(p.x + dirX * 0.4, p.z + dirZ * 0.4, 0.6).find((n) => !n.dead && !n.ko);
      if (hit) {
        try { g.npcs.say?.(hit, pick(['WATCH IT, TONY HAWKWARD!', 'MY SPLEEN!', 'Get a car like a normal person!', 'Sidewalks are for WALKING, freak!']), { ttl: 2.2, kind: 'angry' }); } catch { /* ignore */ }
        return this._startBail('npc');
      }
    }

    // --- jumping & tricks
    const clicked = inp.mouseClicked(0);
    if (inp.wasPressed('Space') && grounded) this._pop(def);
    if (clicked && !this.trick) {
      if (grounded) this._pop(def);
      if (this.airY > 0.12 || this.vy > 0) {
        const name = D ? 'heelflip' : S ? 'shoveit' : A ? 'varial' : 'kickflip';
        this.trick = { name, t: 0, dur: def.flip * (name === 'varial' ? 1.12 : name === 'shoveit' ? 0.85 : 1) };
        this.audio.play('flip');
        this._broadcast({ on: true, trick: name });
      }
    }
    if (!grounded || this.vy > 0) {
      this.vy -= GRAV * dt;
      this.airY += this.vy * dt;
      this.airTime += dt;
      if (this.trick) this.trick.t += dt;
      if (this.airY <= 0) { this.airY = 0; this.vy = 0; if (this._land(def, steerIn)) return; }
    }

    // --- write back to the Player
    pl.vy = 0;
    pl.vel.set(0, 0);
    pl.speed = this.v;
    pl.facing = this.heading;
    pl.group.rotation.y = this.heading;
    p.y = DECK_TOP + this.airY + (this.trick ? 0.2 * Math.sin(Math.PI * Math.min(1, this.trick.t / this.trick.dur)) : 0);

    this._placeBoard(dt);
    this._camera(dt);
    this.audio.update(this.v, this.airY <= 0, this.motoring);
    this._hud(d, def);
  }

  _pop(def) {
    this.vy = def.pop;
    this.airY = 0.001;
    this.airTime = 0;
    this.audio.play('pop');
    if (!this.trick) this._broadcast({ on: true, trick: 'ollie' });
  }

  // Returns true if the landing turned into a bail.
  _land(def, steerIn) {
    const tr = this.trick;
    this.trick = null;
    const air = this.airTime;
    this.airTime = 0;
    if (tr) {
      if (tr.t < tr.dur * 0.85) { this._startBail('flip'); return true; }
      if (Math.abs(steerIn) > 0 && this.v > def.top * 0.5 && chance(0.3)) { this._startBail('sketchy'); return true; }
      this.audio.play('land');
      this._award(tr.name);
      return false;
    }
    this.audio.play('land');
    if (air > 0.3) this._award('ollie');
    return false;
  }

  _award(name) {
    const g = this.game, d = this.data(), T = TRICKS[name];
    if (!T) return;
    const now = g.elapsed;
    if (now - this.combo.last < 3) this.combo.n++;
    else { this.combo.n = 1; this.combo.score = 0; }
    this.combo.last = now;
    const pts = T.score * this.combo.n;
    this.combo.score += pts;
    const st = d.stats;
    st.landed = (st.landed || 0) + 1;
    st.tricks[name] = (st.tricks[name] || 0) + 1;
    if (this.combo.score > (st.bestCombo || 0)) st.bestCombo = this.combo.score;
    popup(`${T.label}! +${pts}`, this.combo.n > 1 ? `COMBO ×${this.combo.n} · ${this.combo.score}` : '');
    // A tiny bit of street cred (Charm). Banked because Charm moves in 0.1 steps; cooldown stops farming.
    if (name !== 'ollie' && now >= this.chaReady) {
      this.chaReady = now + CHA_COOLDOWN;
      st.chaBank = (st.chaBank || 0) + CHA_PER_TRICK;
      if (st.chaBank >= 0.1 - 1e-6) { st.chaBank = Math.max(0, st.chaBank - 0.1); g.state.addStat('cha', 0.1, 'skateboarding'); }
    }
    g.bus.emit('skate:trick', { name, score: pts, combo: this.combo.n });
  }

  // ------------------------------------------------------------ bails
  _startBail(why) {
    const g = this.game, pl = g.player, d = this.data();
    const v = this.v;
    this.mode = 'bail';
    this.trick = null;
    const dirX = Math.sin(this.heading), dirZ = Math.cos(this.heading);
    this.bail = {
      t: 0, why,
      slide: Math.min(v * 0.45, 7),
      bx: pl.group.position.x, bz: pl.group.position.z, by: this.airY,
      bvx: dirX * (v * 0.7 + 2), bvz: dirZ * (v * 0.7 + 2), bvy: 3 + v * 0.15,
      spin: 9 + Math.random() * 8, yawSpin: (Math.random() - 0.5) * 10,
    };
    if (why === 'wall') { this.bail.bvx *= -0.4; this.bail.bvz *= -0.4; this.bail.slide = 0.5; }
    this.v = 0;
    this.airY = 0;
    pl.group.position.y = 0;
    try { resetRider(pl.model); pl.model.setDead(true); } catch { /* ignore */ }
    this.audio.update(0, true, false);
    this.audio.play('bail');
    g.cameraRig?.shake?.(0.35, 0.3);
    d.stats.bails = (d.stats.bails || 0) + 1;
    this.combo.n = 0;
    popup('BAILED', why === 'flip' ? 'Caught it with your shins' : why === 'npc' ? 'Human bowling pin' : why === 'wall' ? 'The wall won' : 'Landed sketchy');
    g.ui.toast(pick(BAIL_LINES), 'bad', 3000);
    g.ui.setHud('vehicle', '');
    this._broadcast({ on: true, trick: 'bail' });
    const dmg = Math.round(3 + Math.min(v, 20) * 0.35 + (why === 'wall' ? 3 : 0));
    try { g.state.damage(dmg, 'a skateboard bail'); } catch (e) { console.error(e); }
  }

  _updateBail(dt) {
    const g = this.game, pl = g.player, b = this.bail;
    if (!b) return this.dismount('bail');
    b.t += dt;
    pl.moveLocked = true;
    pl.vel.set(0, 0); pl.vy = 0;
    // rider skids along the ground
    if (b.slide > 0.05) {
      const p = pl.group.position;
      const r = g.physics.resolveCircle(p.x + Math.sin(this.heading) * b.slide * dt, p.z + Math.cos(this.heading) * b.slide * dt, pl.radius ?? 0.45);
      p.x = r.x; p.z = r.z;
      b.slide = Math.max(0, b.slide - 9 * dt);
    }
    pl.group.position.y = 0;
    // board flies off, tumbling
    const m = this.mesh;
    if (m) {
      b.bvy -= GRAV * dt;
      let nx = b.bx + b.bvx * dt, nz = b.bz + b.bvz * dt;
      const r = g.physics.resolveCircle(nx, nz, 0.3);
      if (r.hit) { b.bvx *= -0.5; b.bvz *= -0.5; }
      b.bx = r.x; b.bz = r.z;
      b.by += b.bvy * dt;
      if (b.by <= 0) { b.by = 0; b.bvy = Math.abs(b.bvy) > 2 ? -b.bvy * 0.35 : 0; b.bvx *= 0.6; b.bvz *= 0.6; b.spin *= 0.5; b.yawSpin *= 0.5; }
      const inner = m.userData.board;
      m.position.set(b.bx, b.by, b.bz);
      m.rotation.y += b.yawSpin * dt;
      inner.rotation.z += b.spin * dt;
      if (b.by <= 0 && b.bvy === 0) {
        // settle wheels-down or wheels-up, whichever is closer
        const z = inner.rotation.z % (Math.PI * 2);
        inner.rotation.z = lerp(z, Math.abs(z - Math.PI) < Math.PI / 2 ? Math.PI : (z > Math.PI ? Math.PI * 2 : 0), 1 - Math.exp(-10 * dt));
      }
      inner.rotation.x = 0;
      m.userData.blob.position.y = -b.by + 0.012;
    }
    if (b.t > 1.5) {
      this.dismount('bail');
      if (!pl.dead) g.ui.toast('You peel yourself up. Press <kbd>G</kbd> to get back on.', 'info', 2200);
    }
  }

  // ------------------------------------------------------------ visuals
  _placeBoard(dt) {
    const m = this.mesh, pl = this.game.player;
    if (!m) return;
    const p = pl.group.position;
    const inner = m.userData.board;
    const def = m.userData.def;
    m.position.set(p.x, this.airY, p.z);
    let yaw = this.heading + this.slide * 0.9 * Math.sign(this.steer || 1);
    let roll = -this.steer * 0.08;
    if (this.trick) {
      const T = TRICKS[this.trick.name];
      const kk = Math.min(1, this.trick.t / this.trick.dur);
      const e = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
      roll += (T.roll || 0) * Math.PI * 2 * e;
      yaw += (T.yaw || 0) * e;
    }
    m.rotation.y = yaw;
    // Nose up on the pop, level out at the peak, slight nose-down coming in.
    const pitch = this.airY > 0 ? -0.32 * clamp(this.vy / (def.pop || 6), -0.35, 1) : 0;
    inner.rotation.set(pitch, 0, roll);
    for (const w of m.userData.wheels) w.rotation.x += (this.v / WHEEL_R) * dt * (this.airY > 0 ? 0.3 : 1);
    m.userData.blob.position.y = -this.airY + 0.012;
    m.userData.blob.material.opacity = 0.35 * (1 - Math.min(1, this.airY / 1.6));
    if (m.userData.led) m.userData.led.material.color.setHex(this.data().battery > 25 ? 0x3ad06a : 0xe2402f);
  }

  _camera(dt) {
    const g = this.game, rig = g.cameraRig, pl = g.player;
    if (!rig || rig.target !== pl.group) return;
    rig.distOverride = Math.min(rig.maxDist ?? 28, (rig.dist ?? 7.5) + 1.6);
    rig.height = 1.2;
    const m = g.input.mouse;
    if (m.dx || m.dy || g.input.isDown('ArrowLeft') || g.input.isDown('ArrowRight')) this.mouseIdle = 0;
    else this.mouseIdle += dt;
    if (this.v > 4 && this.mouseIdle > 1.2) rig.yaw = angleLerp(rig.yaw, this.heading + Math.PI, 1 - Math.exp(-1.1 * dt));
  }

  _hud(d, def) {
    const mph = Math.round(this.v * 2.237);
    const batt = def.motor ? ` · <span style="color:${d.battery > 25 ? '#7fbf4d' : '#e2402f'}">⚡${Math.round(d.battery)}%</span>` : '';
    this.game.ui.setHud('vehicle', `<div class="skate-hud"><b>${def.name}</b> · ${mph} mph${batt}<br><small>Space ollie · Click kickflip · G get off</small></div>`);
  }

  // Runs after net/camera so it overrides animate() and emotes this frame.
  lateUpdate(dt) {
    const g = this.game, pl = g.player;
    if (this.on && this.mode === 'ride' && pl?.model && !pl.model.dead) {
      const tr = this.trick;
      const kk = tr ? Math.min(1, tr.t / tr.dur) : 0;
      poseRider(pl.model, {
        push: this.pushPhase, crouch: this.airY > 0 ? 0.6 : 0.25 + this.slide * 0.5 + Math.min(this.v / 20, 1) * 0.15,
        air: this.airY > 0, tuck: tr ? Math.sin(Math.PI * kk) : (this.airY > 0 ? 0.25 : 0),
        flick: tr && kk < 0.3 ? Math.sin((kk / 0.3) * Math.PI) : 0,
        steer: this.steer, wobble: this._t, slide: this.slide,
      });
    }
    this._updateRemotes(dt);
  }

  // ------------------------------------------------------------ co-op
  _broadcast(extra) {
    const net = this.game.net;
    if (!net?.connected) return;
    try { net.broadcast({ t: 'skate', board: this.boardId || this.data().board, ...extra }); } catch { /* ignore */ }
  }

  onNet(msg, from) {
    const net = this.game.net;
    if (!from || from === net.localId) return;
    if (!msg.on) { this._dropRemote(from); return; }
    const board = BOARDS[msg.board] ? msg.board : 'plank';
    let r = this.remotes.get(from);
    if (!r || r.boardId !== board) {
      this._dropRemote(from, true);
      r = { boardId: board, mesh: createBoardMesh(board), trick: null, phase: 0, bail: 0 };
      this.game.scene.add(r.mesh);
      this.remotes.set(from, r);
    }
    const tr = String(msg.trick || '');
    if (tr === 'bail') r.bail = 1.5;
    else if (TRICKS[tr] && tr !== 'ollie') r.trick = { name: tr, t: 0, dur: BOARDS[board].flip };
  }

  _dropRemote(id, keepPose = false) {
    const r = this.remotes.get(id);
    if (!r) return;
    disposeBoardMesh(r.mesh);
    this.remotes.delete(id);
    if (!keepPose) {
      const rp = this.game.net.remotePlayers.get(id);
      try { if (rp?._model) resetRider(rp._model); } catch { /* ignore */ }
    }
  }

  _updateRemotes(dt) {
    if (!this.remotes.size) return;
    const net = this.game.net;
    for (const [id, r] of this.remotes) {
      const rp = net.remotePlayers.get(id);
      if (!rp) { this._dropRemote(id, true); continue; }
      const m = r.mesh, inner = m.userData.board;
      const model = rp._model;
      const hide = !!(rp.vehicle || rp.dead);
      m.visible = !hide && r.bail <= 0;
      if (r.bail > 0) { r.bail -= dt; continue; }
      if (hide) continue;
      const gp = rp.group.position;
      const air = Math.max(0, gp.y - DECK_TOP);
      m.position.set(gp.x, air, gp.z);
      m.rotation.y = rp.facing ?? rp.group.rotation.y;
      let roll = 0, yaw = 0, kk = 0;
      if (r.trick) {
        r.trick.t += dt;
        kk = Math.min(1, r.trick.t / r.trick.dur);
        const T = TRICKS[r.trick.name];
        const e = kk < 0.5 ? 2 * kk * kk : 1 - Math.pow(-2 * kk + 2, 2) / 2;
        roll = (T.roll || 0) * Math.PI * 2 * e; yaw = (T.yaw || 0) * e;
        if (kk >= 1) r.trick = null;
      }
      m.rotation.y += yaw;
      inner.rotation.set(0, 0, roll);
      const speed = rp.speed || 0;
      for (const w of m.userData.wheels) w.rotation.x += (speed / WHEEL_R) * dt;
      m.userData.blob.position.y = -air + 0.012;
      const def = BOARDS[r.boardId];
      const pushing = speed > 0.3 && speed < def.top * 0.7 && air < 0.05 && !def.motor;
      if (pushing) r.phase = (r.phase + dt * 1.6) % 1; else r.phase = -1;
      if (model && !model.dead && model.group.visible) {
        poseRider(model, { push: r.phase, crouch: air > 0.05 ? 0.6 : 0.3, air: air > 0.05, tuck: r.trick ? Math.sin(Math.PI * kk) : 0, steer: 0, wobble: this._t + 1.3 });
      }
    }
  }

  clearRemotes() { for (const id of [...this.remotes.keys()]) this._dropRemote(id, true); }
}

// ---------------------------------------------------------------- trick popup
let popEl = null;
function popup(title, sub = '') {
  try {
    if (!popEl) {
      const st = document.createElement('style');
      st.textContent = `
        #skate-pop { position: fixed; left: 50%; top: 30%; transform: translateX(-50%); pointer-events: none; z-index: 30; text-align: center;
          font-family: var(--font-title, 'Special Elite'), monospace; text-shadow: 3px 3px 0 #000, -1px -1px 0 #000; }
        #skate-pop .t { font-size: 40px; color: #f2c230; letter-spacing: 2px; }
        #skate-pop .s { font-size: 20px; color: #e6dfcf; }
        #skate-pop.bail .t { color: #e2402f; }
        #skate-pop.go { animation: skatePop 1.3s ease-out forwards; }
        @keyframes skatePop { 0% { opacity: 0; transform: translateX(-50%) scale(.6) rotate(-6deg); } 12% { opacity: 1; transform: translateX(-50%) scale(1.12) rotate(2deg); }
          25% { transform: translateX(-50%) scale(1) rotate(0); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-30px); } }
        .skate-hud small { color: var(--bone-dim, #a59c88); }`;
      document.head.appendChild(st);
      popEl = document.createElement('div');
      popEl.id = 'skate-pop';
      document.body.appendChild(popEl);
    }
    popEl.className = title === 'BAILED' ? 'bail' : '';
    popEl.innerHTML = `<div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
    void popEl.offsetWidth;
    popEl.classList.add('go');
  } catch { /* cosmetic */ }
}

// ---------------------------------------------------------------- install
export async function installSkate(game) {
  const skate = new Skate(game);
  game.skate = skate;

  game.addSystem({ name: 'skate', update: (dt) => skate.update(dt) });

  // Posing must run after the net module's avatar animation, so this system is added at game start
  // (after every install, i.e. after 'net' and the camera).
  let lateAdded = false;
  const addLate = () => {
    if (lateAdded) return;
    lateAdded = true;
    game.addSystem({ name: 'skate-late', update: (dt) => skate.lateUpdate(dt) });
  };

  const off = (reason) => () => skate.dismount(reason);
  game.bus.on('ui:open', off('ui'));
  game.bus.on('location:enter', off('ui'));
  game.bus.on('player:died', off('dead'));
  game.bus.on('player:arrested', off('arrest'));
  game.bus.on('car:entered', off('vehicle'));
  game.bus.on('state:reset', () => { skate.dismount('reset'); skate.data(); skate.vendor.reset(); });
  game.bus.on('home:slept', () => { const d = skate.data(); d.battery = BOARDS.electric.battery; });
  game.bus.on('game:start', () => {
    addLate();
    skate.data();
    try { skate.vendor.spawn(); } catch (e) { console.error('[skate] vendor spawn failed', e); }
    skate.vendor.reset();
  });

  const net = game.net;
  net.on('skate', (msg, from) => skate.onNet(msg, from));
  game.bus.on('net:player-joined', () => { if (skate.on) skate._broadcast({ on: true }); });
  game.bus.on('net:player-left', ({ id } = {}) => skate._dropRemote(id, true));
  game.bus.on('net:disconnected', () => skate.clearRemotes());

  // Character sheet + help.
  game.ui.sheetSections?.push((g) => {
    const d = skate.data();
    if (!d.owned.length) return '';
    const st = d.stats;
    const tricks = Object.entries(st.tricks || {}).filter(([, n]) => n > 0).map(([k, n]) => `${TRICKS[k]?.label?.toLowerCase() || k} ×${n}`).join(' · ');
    return `<div class="ui-section">Skateboarding</div><div class="ui-muted">Board: ${BOARDS[d.board]?.name || '—'} · Tricks landed ${st.landed || 0} · Bails ${st.bails || 0} · Best combo ${st.bestCombo || 0}</div>${tricks ? `<div class="ui-muted">${tricks}</div>` : ''}`;
  });
  game.ui.helpKeys?.push(['G', 'Skateboard on/off (Space ollie · Click kickflip)']);
}
