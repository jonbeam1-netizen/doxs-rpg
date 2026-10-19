import { clamp, rand, pick, chance, fmtMoney, esc } from '../core/util.js';
import { COP_YELL } from './names.js';

// Heat (state.p.heat 0..5), line-of-sight evasion, on-foot cop spawning,
// busts & arrests. Cruisers, roadblocks and the helicopter live in
// src/vehicles/police.js (game.vehicles.police) and read game.police.wanted().
//
// Evasion: whenever no cop / cruiser / chopper can see you, a search timer
// runs; fill it (faster outside the search zone, much faster hiding indoors)
// and you drop a star — "LOST THEM". Getting spotted resets it.
const CRIME_HEAT = { assault: 0.4, assaultCop: 0.7, murder: 1.0, copKill: 2.0, gunfire: 0.2, steal: 0.5, vandalism: 0.2, stealCop: 2.2 };
const FOOT_COPS_FOR_HEAT = [0, 2, 2, 2, 2, 3];
const BUSTED_SUBS = ['Hands behind your back, sweetheart.', 'You have the right to remain smelly.', 'Anything you say will be laughed at in court.', 'The cuffs are tight. The cop is tighter.'];
const DRAGGED_SUBS = ['Dragged out by the collar like a sack of wet laundry.', 'Yanked through the window. Your dignity stayed in the car.', 'Face, meet hood. Hood, meet face.'];
const LOST_TOASTS = ['They\'re checking the dumpsters. You\'re not in the dumpsters. This time.', 'Dispatch is confused. Dispatch is always confused.', 'The cops lost your trail. Somebody is getting yelled at.'];
const CLEAN_TOASTS = ['You lost the cops. They went for donuts instead.', 'Heat\'s off. Rotwell PD has moved on to harassing a hot dog cart.', 'Clean getaway. Somewhere a sergeant is throwing a stapler.'];

export class Police {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.lastSeen = 99;
    this.seenT = 0;
    this.spawnT = 0;
    this.decayAcc = 0;
    this.bustT = 0;
    this.bustNeed = 1.8;
    this.arresting = false;
    this.remoteHeat = new Map(); // peerId -> { heat, seen, lk, hid }
    this.gunT = 0;
    this.sirenT = 0;
    this.searchT = 0;
    this.lastKnown = null;
    this.knownCar = null;
    this.hiding = false;
    this.hudT = 0;
    this.sendT = 0;
    this.recogT = 0;
    this._mm = null;
    this._mmDirty = false;

    const root = document.getElementById('ui-root') || document.body;
    this.bustEl = document.createElement('div');
    this.bustEl.id = 'npc-busted';
    this.bustEl.innerHTML = '<span>GETTING CUFFED — RUN!</span> <b></b>';
    root.appendChild(this.bustEl);
    this.bustBar = this.bustEl.querySelector('b');
    this.bustLbl = this.bustEl.querySelector('span');

    game.bus.on('heat:change', ({ heat, before }) => {
      if (game.net.isClient) this._sendHeat();
      if (Math.floor(heat) > Math.floor(before)) {
        this.ctx.fx.sfx.play('siren', { vol: 0.8 });
        this.searchT = 0;
        if (Math.floor(heat) === 1 && Math.floor(before) === 0) game.ui.toast('The cops are onto you. Lose them or face the music (it\'s mostly kazoo).', 'bad', 3000);
        if (Math.floor(heat) === 2 && Math.floor(before) < 2) game.ui.toast('★★ Cruisers rolling. Break line of sight to shake them.', 'bad', 3000);
        if (Math.floor(heat) === 4 && Math.floor(before) < 4) game.ui.toast('★★★★ Roadblocks and spike strips ahead. Rotwell PD finally read the manual.', 'bad', 3500);
        if (Math.floor(heat) === 5) game.ui.toast('★★★★★ SWAT is coming. They brought the BIG sticks. And a helicopter.', 'bad', 3500);
      }
      if (heat <= 0) { this.searchT = 0; this.lastKnown = null; this.knownCar = null; }
    });
    // hiding indoors while nobody's watching
    game.bus.on('location:enter', (loc) => {
      if (this.heat >= 1 && this.lastSeen > 1.5 && !this.arresting) {
        this.hiding = true;
        game.ui.toast(`You duck into ${esc(loc?.name || 'a building')}. The cops lose your scent while you lay low.`, 'good', 2600);
      }
    });
    // switching rides while unseen throws them off
    game.bus.on('car:entered', () => {
      const car = game.player?.vehicle;
      if (this.heat >= 1 && this.lastSeen > 2 && this.knownCar && car && car !== this.knownCar) {
        this.searchT += this._need(this.heat) * 0.35;
        this.knownCar = null;
        game.ui.toast('New ride. They\'re still looking for the old one.', 'good', 2400);
      }
    });
  }

  get heat() { return this.game.state.p.heat || 0; }

  _need(heat) { return 5 + heat * 2.6; }
  searchRadius(heat = this.heat) { return 26 + heat * 13; }

  // A crime happened at (x,z) by the LOCAL player. Witnessing cops double the heat.
  crime(type, x, z, victim = null) {
    const g = this.game;
    if (this.arresting || g.player?.dead) return;
    let amt = CRIME_HEAT[type] ?? 0.3;
    if (type === 'gunfire') {
      if (this.gunT > g.elapsed) return;
      this.gunT = g.elapsed + 1.2;
      const witnesses = this.ctx.npcs.near(x, z, 32).some((n) => !n.hostile && !n.brawlId && n.kind !== 'static');
      if (!witnesses) return;
    }
    const cop = this._copWitness(x, z, victim);
    if (cop) {
      amt *= type === 'assaultCop' || type === 'copKill' || type === 'stealCop' ? 1.25 : 2;
      if (this.heat + amt < 1) amt = 1 - this.heat;
      if (!cop.replica && !cop.hostile) {
        this.ctx.npcs._goHostile(cop, { type: 'player' });
        cop.data.pursuit = true;
        this.ctx.fx.say(cop.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
      }
      this._spotted();
    }
    if (type === 'stealCop') this._spotted();
    g.state.addHeat(amt);
    if (type === 'murder' || type === 'copKill') this.ctx.ambient?.panic(x, z, 40);
  }

  _copWitness(x, z, victim) {
    let best = null, bd = 42;
    for (const n of this.ctx.npcs.near(x, z, 42)) {
      if (n.kind !== 'cop' || n.dead || n === victim && n.hp <= 0) continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < bd && (n === victim || this.ctx.npcs.los(n.pos.x, n.pos.z, x, z))) { bd = d; best = n; }
    }
    return best;
  }

  _focus() {
    const pl = this.game.player;
    return pl.vehicle ? (pl.vehicle.group?.position ?? pl.pos) : pl.pos;
  }

  _spotted() {
    const pp = this._focus();
    this.lastSeen = 0;
    this.searchT = 0;
    this.lastKnown = { x: pp.x, z: pp.z };
    this.knownCar = this.game.player?.vehicle || null;
    this.hiding = false;
  }

  clearHeat(silent = false) {
    const g = this.game;
    if (this.heat > 0) g.state.addHeat(-5);
    this.bustT = 0;
    this.lastSeen = 99;
    this.searchT = 0;
    this.lastKnown = null;
    this.knownCar = null;
    this.hiding = false;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.kind === 'cop' && !n.replica && n.target?.type === 'player') this._standDown(n);
    }
    if (!silent) g.ui.toast('Your record is squeaky clean. Well. Clean-ish.', 'good');
  }

  _standDown(n) {
    n.hostile = false; n.target = null; n.data.pursuit = false;
    n.state = 'wander'; n.goal = null; n.leaving = !!n.data.spawnedByHeat;
  }

  // ------------------------------------------------------------ public helpers (game.police)
  // Every wanted player this machine knows about. On the host this includes clients.
  wanted() {
    const g = this.game, pl = g.player;
    const out = [];
    const heat = this.heat;
    if (pl && !pl.dead && !this.arresting && !this.ctx.combat.isDown && heat >= 1) {
      const car = pl.vehicle;
      out.push({
        key: 'player', t: { type: 'player' }, heat, pos: this._focus(), inCar: !!car,
        speed: car ? car.speed : (pl.speed || 0), heading: car ? car.heading : pl.facing,
        vx: car ? car.vel.x : (pl.vel?.x || 0), vz: car ? car.vel.y : (pl.vel?.y || 0),
        seen: this.lastSeen < 1, lastKnown: this.lastKnown, hiding: this.hiding,
      });
    }
    if (g.net.isAuthority) {
      for (const [id, h] of this.remoteHeat) {
        const r = g.net.remotePlayers?.get?.(id);
        if (!r) { this.remoteHeat.delete(id); continue; }
        if (h.heat < 1 || r.dead || !r.pos) continue;
        const v = r.vehicle;
        const spd = v ? Math.abs(Number(v.speed) || 0) : (r.speed || 0);
        const hd = v ? (Number(v.rot) || 0) : (r.facing || 0);
        out.push({
          key: id, t: { type: 'remote', id }, heat: h.heat, pos: r.pos, inCar: !!v, speed: spd, heading: hd,
          vx: Math.sin(hd) * spd, vz: Math.cos(hd) * spd, seen: h.seen, lastKnown: h.lk, hiding: h.hid,
        });
      }
    }
    return out;
  }

  // Spawn a pursuit cop on foot at (x,z) after a wanted target `w` (from wanted()).
  spawnCopAt(w, lvl, x, z, data = {}) {
    const swat = lvl >= 5 && chance(0.6);
    const weapon = swat ? (chance(0.75) ? 'smg' : 'rifle') : lvl >= 3 ? (chance(0.8) ? 'pistol' : 'shotgun') : lvl >= 2 ? (chance(0.5) ? 'pistol' : 'baton') : 'baton';
    const r = this.game.physics.resolveCircle(x, z, 0.45);
    const npc = this.ctx.npcs.spawn({
      kind: 'cop', role: swat ? 'swat' : 'cop', x: r.x, z: r.z, hostile: true, networked: true, weapon, wander: false,
      facing: Math.atan2(w.pos.x - x, w.pos.z - z), data: { pursuit: true, spawnedByHeat: true, fromCruiser: true, ...data },
    });
    if (!npc) return null;
    npc.target = w.t;
    npc.state = 'chase';
    npc.aggressor = true;
    if (chance(0.6)) this.ctx.fx.say(npc.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
    return npc;
  }

  // Chop shop paint job: the cops stop recognising this car.
  onRepaint(car) {
    const g = this.game;
    const recognised = car === this.knownCar || car?.stolen || car?.carId === 'interceptor';
    if (car === this.knownCar) this.knownCar = null;
    if (car) car.paintedAt = g.elapsed;
    if (this.heat >= 1 && recognised) {
      this._loseStar('New color, who dis? The cops are looking for a totally different car now.');
    } else if (this.heat > 0 && this.heat < 1) g.state.addHeat(-this.heat);
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    const pl = g.player;
    if (!g.started || !pl) return;
    const heat = this.heat;
    if (this.hiding && (!g.ui.isBlocking?.() || heat < 1)) this.hiding = false;

    // --- does anyone in uniform see the local player? (4Hz)
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.25;
      const pp = this._focus();
      const seen = !this.hiding && !pl.dead && this._visible(pp, heat);
      if (seen) this._spotted();
      else this.lastSeen += 0.25;
    }

    // --- evasion
    if (heat > 0 && !this.arresting && !pl.dead) {
      if (heat < 1) {
        // a whiff of suspicion fades quietly
        if (this.lastSeen > 4) { this.decayAcc += dt * 0.06; if (this.decayAcc >= 0.05) { g.state.addHeat(-this.decayAcc); this.decayAcc = 0; } }
      } else if (this.lastSeen > 1.25) {
        let rate = 1;
        const lk = this.lastKnown, pp = this._focus();
        if (lk) rate *= Math.hypot(pp.x - lk.x, pp.z - lk.z) > this.searchRadius(heat) ? 1.7 : 0.75;
        if (this.hiding) rate *= 3;
        this.searchT += dt * rate;
        if (this.searchT >= this._need(heat)) this._loseStar();
      }
    }

    this._hud(dt);
    this._updateBust(dt, this.heat);

    // --- authority: spawn / manage pursuit cops for every wanted player
    if (g.net.isAuthority) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 1.2; this._manageCops(); }
    } else if (g.net.connected) {
      this.sendT -= dt;
      if (this.sendT <= 0 && (heat > 0 || this._sentHeat > 0)) { this.sendT = 0.5; this._sendHeat(); }
    }
  }

  _sendHeat() {
    const g = this.game;
    try {
      const lk = this.lastKnown;
      g.net.sendToHost({ t: 'police:heat', heat: Math.round(this.heat * 100) / 100, seen: this.lastSeen < 1, lx: lk ? Math.round(lk.x) : null, lz: lk ? Math.round(lk.z) : null, hid: this.hiding });
      this._sentHeat = this.heat;
    } catch { /* ignore */ }
  }

  _visible(pp, heat) {
    const g = this.game;
    const npcs = this.ctx.npcs;
    const car = g.player.vehicle;
    let seen = false, close = false;
    for (const n of npcs.near(pp.x, pp.z, 45)) {
      if (n.kind !== 'cop' || n.dead || n.knockdown > 0) continue;
      if (!npcs.los(n.pos.x, n.pos.z, pp.x, pp.z)) continue;
      seen = true;
      const d = Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z);
      if (d < 22) close = true;
      // ambient patrol cops join the chase when they spot a wanted player
      if (heat >= 1 && !n.hostile && !n.replica && d < 35) {
        npcs._goHostile(n, { type: 'player' });
        n.data.pursuit = true;
        this.ctx.fx.say(n.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
      }
    }
    const fleet = g.vehicles?.police;
    if (fleet) {
      for (const s of fleet.spotters()) {
        const d = Math.hypot(s.x - pp.x, s.z - pp.z);
        if (d > s.r) continue;
        if (s.los && !npcs.los(s.x, s.z, pp.x, pp.z)) continue;
        seen = true;
        if (d < 22) close = true;
      }
    }
    // a hot car gets noticed even before anyone's looking for you
    if (seen && close && car && car.stolen && !car.paintedAt && heat < 1 && this.recogT < g.elapsed) {
      const cop = car.carId === 'interceptor';
      if (chance(cop ? 0.2 : 0.05)) {
        this.recogT = g.elapsed + 6;
        g.ui.toast(cop ? '"Hey... that\'s OUR car!" Of course they recognise it. It says POLICE on it.' : '"That ride matches a stolen vehicle report!" Should\'ve got a paint job.', 'bad', 3200);
        this.crime(cop ? 'stealCop' : 'steal', pp.x, pp.z);
      }
    }
    return seen;
  }

  _loseStar(msg = null) {
    const g = this.game;
    const heat = this.heat;
    const target = Math.max(0, Math.floor(heat) - 1);
    this.searchT = 0;
    if (target <= 0) {
      g.state.addHeat(-heat);
      this.lastKnown = null; this.knownCar = null;
      for (const n of this.ctx.npcs.map.values()) if (n.kind === 'cop' && !n.replica && n.target?.type === 'player') this._standDown(n);
      g.ui.bigText('LOST THEM', esc(msg || pick(CLEAN_TOASTS)), 2400);
      this.ctx.fx.sfx.play('cash', { vol: 0.6 });
      this._keepCopCar();
    } else {
      g.state.addHeat(target - heat);
      g.ui.toast(`<b>LOST THEM</b> — down to ${'★'.repeat(target)}. ${esc(msg || pick(LOST_TOASTS))}`, 'good', 3000);
    }
  }

  // Got away clean in a stolen Interceptor? It's yours now.
  _keepCopCar() {
    const g = this.game, vm = g.vehicles;
    if (!vm?.owned) return;
    for (const e of vm.owned()) {
      if (e.carId !== 'interceptor' || !e.stolen || e.destroyed) continue;
      e.stolen = false;
      const c = vm.carByUid?.(e.uid);
      if (c) { c.stolen = false; vm.setMarker?.(c); }
      g.state.setFlag?.('keptCopCar', true);
      g.state.changed('cars');
      g.ui.toast('The <b>Rotwell PD Interceptor</b> is officially yours. Nobody at the precinct wants to admit they lost it.', 'good', 5000);
    }
  }

  // Heat stars (blinking while they search) + the minimap search zone.
  _hud(dt) {
    const g = this.game;
    this.hudT -= dt;
    const heat = this.heat, lvl = heat | 0;
    const searching = lvl >= 1 && this.lastSeen > 1.25;
    if (this.hudT <= 0 && lvl >= 1) {
      this.hudT = 0.25;
      const blink = searching && Math.floor(g.elapsed * 3) % 2 === 0;
      const frac = searching ? clamp(this.searchT / this._need(heat), 0, 1) : 0;
      g.ui.setHud('heat', `<span style="opacity:${blink ? 0.35 : 1}">${'★'.repeat(lvl)}</span><span style="opacity:.25">${'★'.repeat(5 - lvl)}</span>`
        + (searching ? `<div style="height:3px;width:86px;margin:2px auto 0;background:rgba(0,0,0,.5)"><i style="display:block;height:100%;width:${Math.round(frac * 100)}%;background:${this.hiding ? '#7fbf4d' : '#5f8bff'}"></i></div>` : ''));
      this._wasSearching = searching;
    }
    this._minimap(searching);
  }

  _minimap(searching) {
    const g = this.game;
    if (!this._mm) {
      const cv = document.getElementById('minimap');
      if (!cv) return;
      const x = cv.getContext('2d');
      if (!x) return;
      // the world module redraws the minimap every other frame starting with clearRect;
      // piggyback on that so our overlay is drawn exactly once per redraw.
      if (!x.__polHook) {
        const orig = x.clearRect;
        x.clearRect = (...a) => { this._mmDirty = true; return orig.apply(x, a); };
        x.__polHook = true;
      }
      this._mm = { cv, x };
    }
    if (!this._mmDirty) return;
    this._mmDirty = false;
    const fleet = g.vehicles?.police;
    const lk = this.lastKnown;
    const anyCops = fleet && (fleet.cruisers.size || fleet.helis.size);
    if (!(searching && lk) && !anyCops) return;
    const { cv, x } = this._mm;
    const W = cv.width, R = W / 2;
    const f = this._focus();
    const yaw = g.cameraRig?.yaw ?? 0;
    const ppm = g.player?.vehicle ? 0.55 : 0.85;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const toS = (wx, wz) => { const dx = (wx - f.x) * ppm, dz = (wz - f.z) * ppm; return [R + dx * cs - dz * sn, R + dx * sn + dz * cs]; };
    x.save();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.clip();
    const t = g.elapsed;
    if (searching && lk) {
      const [sx, sy] = toS(lk.x, lk.z);
      const rr = this.searchRadius() * ppm;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      x.fillStyle = `rgba(255,40,30,${0.08 + pulse * 0.08})`;
      x.beginPath(); x.arc(sx, sy, rr, 0, Math.PI * 2); x.fill();
      x.lineWidth = 2;
      x.strokeStyle = Math.floor(t * 2) % 2 ? 'rgba(255,60,40,0.85)' : 'rgba(80,120,255,0.85)';
      x.beginPath(); x.arc(sx, sy, rr * (0.96 + pulse * 0.04), 0, Math.PI * 2); x.stroke();
    }
    if (fleet) {
      const blink = Math.floor(t * 4) % 2;
      for (const c of fleet.cruisers.values()) {
        if (c.removed || c.exploded) continue;
        const [sx, sy] = toS(c.x, c.z);
        x.fillStyle = blink ? '#ff2a1a' : '#3a6aff';
        x.strokeStyle = '#000'; x.lineWidth = 1.5;
        x.beginPath(); x.rect(sx - 3.5, sy - 3.5, 7, 7); x.fill(); x.stroke();
      }
      for (const h of fleet.helis.values()) {
        const [sx, sy] = toS(h.x, h.z);
        x.strokeStyle = blink ? '#ff2a1a' : '#3a6aff'; x.lineWidth = 2;
        x.beginPath(); x.arc(sx, sy, 6, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.moveTo(sx - 7, sy); x.lineTo(sx + 7, sy); x.moveTo(sx, sy - 7); x.lineTo(sx, sy + 7); x.stroke();
      }
    }
    x.restore();
  }

  _updateBust(dt, heat) {
    const g = this.game, pl = g.player;
    let rate = 0, inCar = false;
    if (heat >= 1 && heat < 5 && !pl.dead && !this.arresting && !this.ctx.combat.isDown && !g.controlsLocked) {
      if (!pl.vehicle) {
        if (heat < 4 && pl.speed < 3) {
          for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, 1.9)) {
            if (n.kind === 'cop' && n.hostile && !n.dead && !(n.knockdown > 0) && !n.kdShown) { rate = 1; break; }
          }
        }
      } else {
        const car = pl.vehicle;
        inCar = true;
        if (car.speed < 2.2 && !car.isBike) {
          const reach = car.dims.L / 2 + 1.7;
          let foot = 0;
          for (const n of this.ctx.npcs.near(car.x, car.z, reach)) {
            if (n.kind === 'cop' && n.hostile && !n.dead && !(n.knockdown > 0) && !n.kdShown) foot++;
          }
          let boxed = 0;
          const fleet = g.vehicles?.police;
          if (fleet) for (const c of fleet.cruisers.values()) if (!c.removed && !c.dead && c.speed < 3 && Math.hypot(c.x - car.x, c.z - car.z) < 7.5) boxed++;
          if (foot) rate = 0.9 + Math.min(1, boxed) * 0.3;
          else if (boxed >= 2) rate = 0.4;
        } else if (car.isBike && car.speed < 2.2) {
          for (const n of this.ctx.npcs.near(car.x, car.z, 2.2)) if (n.kind === 'cop' && n.hostile && !n.dead && !(n.knockdown > 0)) { rate = 1.2; break; }
        }
      }
    }
    this.bustNeed = inCar ? 2.2 : 1.8;
    if (rate > 0) this.bustT += dt * rate;
    else this.bustT = Math.max(0, this.bustT - dt * 0.6);
    if (this.bustT > 0.05) {
      this.bustEl.style.display = 'block';
      const lbl = inCar ? 'GETTING DRAGGED OUT — FLOOR IT!' : 'GETTING CUFFED — RUN!';
      if (this.bustLbl.textContent !== lbl) this.bustLbl.textContent = lbl;
      this.bustBar.style.width = `${clamp(this.bustT / this.bustNeed, 0, 1) * 100}%`;
    } else if (this.bustEl.style.display !== 'none') this.bustEl.style.display = 'none';
    if (this.bustT >= this.bustNeed) { this.bustT = 0; this.bustEl.style.display = 'none'; this.arrest({ caught: true, dragged: inCar }); }
  }

  _heatOf(t) {
    if (!t) return 0;
    if (t.type === 'player') return this.heat;
    return this.remoteHeat.get(t.id)?.heat ?? 0;
  }

  _manageCops() {
    const g = this.game;
    const npcs = this.ctx.npcs;
    const wanted = this.wanted();
    let total = 0;
    const per = new Map();
    for (const n of npcs.map.values()) {
      if (n.kind !== 'cop' || n.dead || n.replica) continue;
      if (n.data.spawnedByHeat) total++;
      // cops whose target cooled off go home
      if (n.data.pursuit && n.target) {
        const key = n.target.type === 'player' ? 'player' : n.target.id;
        const h = this._heatOf(n.target);
        if (h < 1) { this._standDown(n); continue; }
        if (!n.data.fromCruiser) per.set(key, (per.get(key) || 0) + 1);
        // escalate: draw pistols at 3 stars
        if (h >= 3 && n.weapon === 'baton' && chance(0.5)) npcs.setWeapon(n, 'pistol');
      }
      // despawn idle heat-cops once nobody is around
      if (n.data.spawnedByHeat && !n.data.pursuit) {
        n.data.idleT = (n.data.idleT || 0) + 1.2;
        let far = true;
        for (const w of wanted) if (Math.hypot(w.pos.x - n.pos.x, w.pos.z - n.pos.z) < 60) far = false;
        const lp = g.player?.group?.position;
        if (lp && Math.hypot(lp.x - n.pos.x, lp.z - n.pos.z) < 50) far = false;
        if (far || n.data.idleT > 45) npcs.remove(n);
      }
    }
    for (const w of wanted) {
      const lvl = Math.floor(w.heat);
      if (lvl < 1) continue;
      // foot patrols converge on where they last saw you; cruisers handle the rest
      if (w.inCar && w.speed > 6 && lvl >= 2) continue;
      const have = per.get(w.key) || 0;
      if (have < FOOT_COPS_FOR_HEAT[lvl] && total < 14) {
        this._spawnCop(w, lvl);
        total++;
      }
    }
  }

  _spawnCop(w, lvl) {
    const g = this.game;
    const c = w.seen || !w.lastKnown ? w.pos : w.lastKnown;
    let x = null, z = null;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(38, 55);
      const tx = c.x + Math.sin(a) * r, tz = c.z + Math.cos(a) * r;
      const B = g.world?.bounds;
      if (B && (tx < B.minX + 2 || tx > B.maxX - 2 || tz < B.minZ + 2 || tz > B.maxZ - 2)) continue;
      if (!g.physics.pointBlocked(tx, tz)) { x = tx; z = tz; break; }
    }
    if (x == null) return;
    const swat = lvl >= 5 && chance(0.7);
    const weapon = swat ? (chance(0.75) ? 'smg' : 'rifle') : lvl >= 3 ? (chance(0.8) ? 'pistol' : 'shotgun') : 'baton';
    const npc = this.ctx.npcs.spawn({
      kind: 'cop', role: swat ? 'swat' : 'cop', x, z, hostile: true, networked: true, weapon, wander: false,
      facing: Math.atan2(w.pos.x - x, w.pos.z - z), data: { pursuit: true, spawnedByHeat: true },
    });
    if (!npc) return;
    npc.target = w.t;
    npc.state = 'chase';
    npc.aggressor = true;
    if (w.t.type === 'player' && (this.sirenT || 0) < g.elapsed) { this.sirenT = g.elapsed + 4; this.ctx.fx.sfx.play('siren', { vol: 0.5 }); }
  }

  // ------------------------------------------------------------ arrest
  async arrest(opts = {}) {
    const g = this.game, p = g.state.p, pl = g.player;
    if (this.arresting || pl.dead) return;
    this.arresting = true;
    pl.moveLocked = true;
    pl.aiming = false;
    this.bustT = 0;
    this.bustEl.style.display = 'none';
    const fx = this.ctx.fx;
    fx.sfx.play('bust');
    const dragged = !!(opts.dragged && pl.vehicle);
    g.ui.bigText('BUSTED', esc(pick(dragged ? DRAGGED_SUBS : BUSTED_SUBS)), 1800);
    const lvl = Math.max(1, Math.ceil(this.heat));
    const fine = 100 + 150 * lvl;
    const bribe = Math.round(fine * 0.55);
    const hours = 4 + 5 * lvl;
    const bribeChance = clamp(0.3 + (p.cha || 0) * 0.012, 0.3, 0.92);
    const hadDrugs = g.state.totalDrugs?.() > 0;
    p.drugs = {};
    g.state.changed('drugs');
    if (pl.vehicle) { try { g.vehicles?.exit?.(true); g.vehicles?.exitVehicle?.(true); } catch { /* ignore */ } }
    if (dragged) {
      // face-down on the asphalt for a second
      try { pl.model.setDead(true); g.cameraRig?.shake?.(0.4, 0.3); fx.sfx.play('punch'); } catch { /* ignore */ }
      setTimeout(() => { try { if (!pl.dead) pl.model.setDead(false); } catch { /* ignore */ } }, 1100);
    }
    const cop = this.ctx.npcs.near(pl.pos.x, pl.pos.z, 8).find((n) => n.kind === 'cop');
    await new Promise((r) => setTimeout(r, dragged ? 1300 : 900));

    let method = 'jail';
    let result = null;
    try {
      result = await g.ui.dialog({
        title: 'Rotwell PD — You\'re Nicked',
        speaker: cop ? esc(cop.name) : 'Officer Grubb',
        closable: false,
        text: `"Well, well, well. Look what crawled outta the gutter."\n\nCharges: being a menace (${lvl}★)${dragged ? ', resisting arrest by sitting in a car really hard' : ''}.${hadDrugs ? '\nYour stash has been "confiscated as evidence". The evidence will be smoked by Friday.' : ''}\n\nHow do you wanna do this?`,
        options: [
          { label: `Pay the fine (${fmtMoney(fine)})`, hint: g.state.canAfford(fine) ? 'Legal. Boring. Effective.' : 'You can\'t afford it.', disabled: !g.state.canAfford(fine) },
          { label: `Slip him a "donation" (${fmtMoney(bribe)})`, hint: `~${Math.round(bribeChance * 100)}% chance he takes it (Charm helps)`, disabled: !g.state.canAfford(bribe) },
          { label: `Do the time (${hours} hours)`, hint: 'Free room and board. The board is a cellmate named Tiny.' },
        ],
      });
    } catch (e) { console.error(e); }

    if (result === 0 && g.state.spend(fine, 'fine')) {
      method = 'fine';
      g.ui.toast(`Paid ${fmtMoney(fine)}. The cop counts it twice and licks his thumb. Gross.`, 'money', 3500);
    } else if (result === 1 && g.state.spend(bribe, 'bribe')) {
      if (chance(bribeChance)) {
        method = 'bribe';
        g.ui.toast('"I didn\'t see nothin\'." He pockets the cash and winks. You feel dirty. Dirtier.', 'good', 3500);
      } else {
        method = 'jail';
        g.ui.toast('He takes the bribe AND books you. Respect, honestly.', 'bad', 3500);
        this._jail(Math.round(hours * 0.6));
      }
    } else {
      method = 'jail';
      this._jail(hours);
    }
    p.totals.arrests = (p.totals.arrests || 0) + 1;
    this.clearHeat(true);
    try { pl.model.setDead(false); } catch { /* ignore */ }
    pl.moveLocked = false;
    this.arresting = false;
    g.state.changed('totals');
    g.bus.emit('player:arrested', { method, fine, bribe, hours, beaten: !!opts.beaten, dragged });
  }

  _jail(hours) {
    const g = this.game, pl = g.player;
    const pd = g.locations.get('rotwell_pd');
    if (pd) pl.spawn(pd.doorX ?? pd.x, pd.doorZ ?? pd.z, pl.facing);
    g.time.advance(hours * 60);
    g.state.addStat('str', 0.5, 'prison pushups');
    g.state.addStat('energy', -20);
    g.ui.toast(`${hours} hours in the clink. You learned to make wine in a toilet. +0.5 STR from prison pushups.`, 'bad', 4500);
  }

  // Host: a client reported their heat / whether cops can see them.
  onRemoteHeat(msg, from) {
    const lk = Number.isFinite(msg.lx) && Number.isFinite(msg.lz) ? { x: msg.lx, z: msg.lz } : null;
    this.remoteHeat.set(from, { heat: clamp(Number(msg.heat) || 0, 0, 5), seen: msg.seen !== false, lk, hid: !!msg.hid });
  }
}
