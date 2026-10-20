import * as THREE from 'three';
import { clamp, rand, pick, chance, fmtMoney, esc } from '../core/util.js';
import { COP_YELL } from './names.js';

// Heat (state.p.heat 0..5), line-of-sight evasion, on-foot cop spawning,
// busts & arrests. Cruisers, roadblocks and the helicopter live in
// src/vehicles/police.js (game.vehicles.police) and read game.police.wanted().
//
// Evasion: whenever no cop / cruiser / chopper can see you, a search timer
// runs; fill it (faster outside the search zone, much faster hiding indoors)
// and you drop a star — "LOST THEM". Getting spotted resets it.
//
// Heat pacing (balance pass 8 — "0 to 5 stars instantly" fix):
//   civ  = heat when only bystanders saw it, cop = when a cop saw it, blind = nobody saw it.
//   cap  = the most heat this kind of crime can push you to on its own (minor stuff tops out at ★★,
//          ★★★★-★★★★★ need cop kills / a sustained shootout / heist alarms).
//   Crime heat lands in a pending pool that is paid out with at most one new star per STAR_CD
//   seconds (the first star can come right away), and the HUD shows the partial star filling.
const CRIME_HEAT = {
  vandalism:  { civ: 0.15, cop: 0.35, blind: 0,    cap: 1.6 },
  assault:    { civ: 0.2,  cop: 0.5,  blind: 0,    cap: 2.0 },
  steal:      { civ: 0.25, cop: 0.5,  blind: 0,    cap: 2.0 },
  gunfire:    { civ: 0.12, cop: 0.3,  blind: 0,    cap: 3.95 },  // per burst (1.2 s); ★★★★★ only in a sustained shootout
  assaultCop: { civ: 0.5,  cop: 0.55, blind: 0.5,  cap: 3.5 },
  murder:     { civ: 0.5,  cop: 1.0,  blind: 0.2,  cap: 3.95 },
  stealCop:   { civ: 0.8,  cop: 1.0,  blind: 0.8,  cap: 3.5 },
  copKill:    { civ: 1.2,  cop: 1.5,  blind: 0.7,  cap: 5 },
};
const STAR_CD = 9;          // seconds between star increases from crimes
const SHOOTOUT_FOR_5 = 25;  // seconds of cop-witnessed gunfire (at ★★★+) before gunfire alone can reach ★★★★★
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
    this.taser = new TaserRig(game, ctx);
    this.pendHeat = 0; this.pendCap = 0; this.lastCrimeT = -99; this.starAt = -99; this.shootoutT = 0;
    this.witT = 0; this.witBy = null; this._hudShown = false;

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
      if (heat < before) { this.pendHeat = 0; if (heat < 3) this.shootoutT = 0; } // lost a star / paid off: pending rumours go too
      this.hudT = 0;
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

  // A crime happened at (x,z) by the LOCAL player. Only witnessed crimes count (serious ones a
  // little even unseen); the heat goes into a pending pool paid out by _payHeat (star pacing).
  crime(type, x, z, victim = null) {
    const g = this.game;
    if (this.arresting || g.player?.dead) return;
    const C = CRIME_HEAT[type] || { civ: 0.15, cop: 0.3, blind: 0, cap: 1.6 };
    if (type === 'gunfire') {
      if (this.gunT > g.elapsed) return;
      this.gunT = g.elapsed + 1.2;
    }
    const cop = this._copWitness(x, z, victim);
    const civ = cop ? true : this._civWitness(x, z, victim);
    let amt = cop ? C.cop : civ ? C.civ : C.blind;
    if (type === 'gunfire' && cop && this.heat >= 3) this.shootoutT = (this.shootoutT || 0) + 1.2;
    let cap = C.cap;
    if (type === 'gunfire' && (this.shootoutT || 0) >= SHOOTOUT_FOR_5) cap = 5;
    // already counted: the same crime type piling up while you're already that hot adds less
    const cur = this.heat + this.pendHeat;
    if (cur >= cap) amt = 0;
    else amt = Math.min(amt, cap - cur);
    if (amt > 0) {
      this.pendHeat += amt;
      this.pendCap = Math.max(this.pendCap, cap);
      this.lastCrimeT = g.elapsed;
      this._witnessed(cop ? 'cop' : civ ? 'civ' : null);
    }
    if (cop) {
      // a cop saw it: they come for you once it's worth a star (or if it was them you hit)
      const willStar = this.heat + this.pendHeat >= 1 || type === 'assaultCop' || type === 'copKill';
      if (!cop.replica && !cop.hostile && willStar) {
        this.ctx.npcs._goHostile(cop, { type: 'player' });
        cop.data.pursuit = true;
        this.ctx.fx.say(cop.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
      } else if (!cop.replica && !cop.hostile && (cop.barkCd ?? 0) <= 0) {
        this.ctx.fx.say(cop.group, pick(['Hey! Knock it off!', 'I SAW that.', 'Easy, pal. I\'m watching you.', 'One more and you\'re wearing bracelets.']), { ttl: 2, kind: 'cop' });
        cop.barkCd = 4;
      }
      this._spotted();
    }
    if (type === 'stealCop') this._spotted();
    this._payHeat(0);
    if (type === 'murder' || type === 'copKill') this.ctx.ambient?.panic(x, z, 40);
  }

  // Any bystander (not a cop, not in the fight) within sight of (x,z)?
  _civWitness(x, z, victim) {
    let checks = 0;
    for (const n of this.ctx.npcs.near(x, z, 20)) {
      if (n === victim || n.dead || n.kind === 'cop' || n.kind === 'static' || n.brawlId || (n.hostile && n.target?.type === 'player')) continue;
      if (Math.hypot(n.pos.x - x, n.pos.z - z) < 6 || this.ctx.npcs.los(n.pos.x, n.pos.z, x, z)) return true;
      if (++checks > 6) break;
    }
    return false;
  }

  // Release pending crime heat into real heat: one star at a time, STAR_CD apart.
  _payHeat(dt) {
    const g = this.game;
    if (this.pendHeat <= 0) return;
    if (dt > 0 && this.lastSeen > 4 && g.elapsed - this.lastCrimeT > 6) {
      // nobody's chasing it up: unreported rumours fade
      this.pendHeat = Math.max(0, this.pendHeat - dt * 0.05);
    }
    const heat = this.heat;
    const star = Math.floor(heat);
    const canStar = star === 0 || g.elapsed - this.starAt >= STAR_CD;
    const ceil = Math.min(this.pendCap, canStar ? star + 1.6 : star + 0.97);
    const want = Math.min(heat + this.pendHeat, ceil);
    if (want <= heat + 0.001) return;
    this.pendHeat -= want - heat;
    if (Math.floor(want) > star) this.starAt = g.elapsed;
    g.state.addHeat(want - heat);
  }

  // brief "WITNESSED" flag in the heat HUD
  _witnessed(who) {
    if (!who) return;
    this.witT = this.game.elapsed + 1.8;
    this.witBy = who;
    this.hudT = 0;
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
        if (h.heat < 1 || h.ar || r.dead || r.down || !r.pos) continue;
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

  // Where should a cop chasing `t` look? null = they can see them (chase for real).
  searchPointFor(t) {
    if (t?.type === 'player') return this.heat >= 1 && this.lastSeen > 1.25 && this.lastKnown ? this.lastKnown : null;
    if (t?.type === 'remote') { const h = this.remoteHeat.get(t.id); return h && !h.seen && h.heat >= 1 && h.lk ? h.lk : null; }
    return null;
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
    try { this.taser.update(dt); } catch (e) { if (!this._tzErr) { this._tzErr = true; console.error('[police] taser failed', e); } }
    this._payHeat(dt);
    if (g.net.isAuthority) {
      this.justiceT = (this.justiceT || 0) - dt;
      if (this.justiceT <= 0) { this.justiceT = 0.25; try { this._streetJustice(); } catch (e) { if (!this._sjErr) { this._sjErr = true; console.error('[police] street justice failed', e); } } }
    }
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

  // ------------------------------------------------------------ street justice (authority, 4 Hz)
  // Muggers & street thugs don't jump a player in front of a cop: they back off and tail you at a
  // distance until you're out of the cop's sight. Caught mid-attack, they bolt (or get taken down).
  // Patrol cops who see an NPC attacking a player or a bystander step in and fight / cuff them.
  // Organised fights (brawlId: bar fights, The Pit, gang jobs, heists) are left alone.
  _copSees(x, z, r = 35, exclude = null) {
    const npcs = this.ctx.npcs;
    let best = null, bd = r;
    for (const c of npcs.near(x, z, r)) {
      if (c.kind !== 'cop' || c.dead || c === exclude || c.knockdown > 0) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bd && npcs.los(c.pos.x, c.pos.z, x, z)) { bd = d; best = c; }
    }
    return best;
  }

  _streetCrook(n) {
    // an unprovoked street attacker (not an organised fight, not someone the player picked a fight with)
    return n && !n.dead && !n.replica && !n.brawlId && n.kind !== 'cop' && n.kind !== 'static' && !n.talk
      && !!n.aggressor && (n.data?.mugger || n.kind === 'thug' || n.kind === 'gang' || n.kind === 'drunk');
  }

  _streetJustice() {
    const g = this.game, npcs = this.ctx.npcs, fx = this.ctx.fx;
    const now = npcs.t ?? g.elapsed;
    for (const n of npcs.map.values()) {
      if (n.kind === 'cop' && n.data?.collar) { this._collar(n); continue; }
      if (!this._streetCrook(n)) continue;
      const t = n.target;
      const onPlayer = t && (t.type === 'player' || t.type === 'remote' || (t.type === 'npc' && npcs.get(t.id)?.kind !== 'cop'));
      const sizingUp = n.state === 'warn' && onPlayer;
      const attacking = n.hostile && onPlayer && (n.state === 'chase' || n.atk);
      if (!sizingUp && !attacking) {
        // tailing: once the coast is clear, let them try again
        if (n.data?.tail && now > n.data.tail.until) n.data.tail = null;
        else if (n.data?.tail && !n.hostile && n.state === 'wander') {
          const tp = npcs._targetPos(n.data.tail.t);
          if (tp) {
            const dx = n.pos.x - tp.x, dz = n.pos.z - tp.z, d = Math.hypot(dx, dz) || 1;
            n.goal = { x: tp.x + dx / d * 11, z: tp.z + dz / d * 11 };
            // out of the cops' sight and close enough: the mugger's own logic can trigger again
            if (d < 14 && !this._copSees(n.pos.x, n.pos.z) && !this._copSees(tp.x, tp.z)) { n.mugCd = now; n.data.tail = null; }
          }
        }
        continue;
      }
      const tp = npcs._targetPos(t);
      if (!tp) continue;
      const cop = this._copSees(n.pos.x, n.pos.z) || this._copSees(tp.x, tp.z);
      if (!cop) continue;
      if (sizingUp) {
        // "...not here." back off and tail them
        n.state = 'wander'; n.stateT = 0; n.hostile = false; n.target = null; n.goal = null;
        n.mugCd = now + 12;
        n.data.tail = { t, until: now + 45 };
        if (n.barkCd <= 0 || chance(0.5)) { fx.say(n.group, pick(['...not here.', 'Tch. Cops.', 'Later, twig. Later.', 'Another time, sweetheart.']), { ttl: 2, kind: 'angry' }); n.barkCd = 6; }
        continue;
      }
      // caught in the act: the cop steps in; the crook usually runs
      this._intervene(cop, n, t);
    }
  }

  _intervene(cop, crook, victimT) {
    const npcs = this.ctx.npcs, fx = this.ctx.fx;
    if (cop.replica) return;
    const busyWithPlayer = cop.hostile && (cop.target?.type === 'player' || cop.target?.type === 'remote') && this._heatOf(cop.target) >= 1;
    if (busyWithPlayer) return; // a wanted player is still the priority
    if (cop.target?.type === 'npc' && cop.target.id === crook.id) return; // already on it
    npcs._goHostile(cop, { type: 'npc', id: crook.id });
    cop.data.collar = { id: crook.id, since: npcs.t ?? this.game.elapsed };
    cop.aggressor = true;
    fx.say(cop.group, pick(['Hey! Drop it!', 'POLICE! Back off!', 'Leave \'em alone, scumbag!', 'Not on my beat!']), { ttl: 2.2, kind: 'cop' });
    if (!crook.data.copSaw) {
      crook.data.copSaw = true;
      if (chance(crook.kind === 'gang' ? 0.45 : 0.65)) {
        npcs._flee(crook, { type: 'npc', id: cop.id });
        crook.data.mugger = false; // spooked for good
      } else {
        // turns on the cop
        crook.target = { type: 'npc', id: cop.id };
        fx.say(crook.group, pick(['Pig!', 'You want some too?!', 'Mind your business, badge!']), { ttl: 1.8, kind: 'angry' });
      }
    }
  }

  // A cop dealing with a street crook: cuff them once they're down, give up if they got away.
  _collar(cop) {
    const npcs = this.ctx.npcs, fx = this.ctx.fx;
    const c = cop.data.collar;
    const crook = npcs.get(c.id);
    const now = npcs.t ?? this.game.elapsed;
    const done = () => {
      cop.data.collar = null;
      if (cop.target?.type === 'npc') { cop.hostile = false; cop.target = null; cop.state = 'wander'; cop.goal = null; npcs._cancelAttack?.(cop); }
    };
    if (cop.dead || (cop.target && cop.target.type !== 'npc')) { cop.data.collar = null; return; }
    if (!crook || crook.dead) { done(); return; }
    const d = Math.hypot(crook.pos.x - cop.pos.x, crook.pos.z - cop.pos.z);
    if (d > 45 || now - c.since > 40) { if (d < 30) fx.say(cop.group, pick(['...and STAY gone!', 'Yeah, keep running.']), { ttl: 2, kind: 'cop' }); done(); return; }
    if ((crook.knockdown > 0 || crook.hp < crook.maxHp * 0.25) && d < 2.2) {
      fx.say(cop.group, pick(['You\'re under arrest, genius.', 'Cuffs on. Lights out.', 'Tell it to the judge.']), { ttl: 2.2, kind: 'cop' });
      fx.sfx.play('bust', { pos: crook.pos, vol: 0.5 });
      npcs.remove(crook);
      done();
    }
  }

  _sendHeat() {
    const g = this.game;
    try {
      const lk = this.lastKnown;
      g.net.sendToHost({ t: 'police:heat', heat: Math.round(this.heat * 100) / 100, seen: this.lastSeen < 1, lx: lk ? Math.round(lk.x) : null, lz: lk ? Math.round(lk.z) : null, hid: this.hiding, ar: this.arresting ? 1 : 0 });
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
    const wit = this.witT > g.elapsed;
    const show = heat > 0.01 || this.pendHeat > 0.01 || wit;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      let html = '';
      if (show) {
        const blink = searching && Math.floor(g.elapsed * 3) % 2 === 0;
        // the next star fills up as heat builds (pending heat shows as a paler band ahead of it)
        const frac = heat - lvl, pend = clamp(this.pendHeat, 0, 1 - frac);
        let stars = `<span style="opacity:${blink ? 0.35 : 1}">${'★'.repeat(lvl)}</span>`;
        if (lvl < 5) {
          const a = Math.round(frac * 100), b = Math.round((frac + pend) * 100);
          stars += `<span style="background:linear-gradient(90deg,#e2402f ${a}%,rgba(226,64,47,.45) ${a}%,rgba(226,64,47,.45) ${b}%,rgba(255,255,255,.22) ${b}%);-webkit-background-clip:text;background-clip:text;color:transparent">★</span>`;
          stars += `<span style="opacity:.25">${'★'.repeat(4 - lvl)}</span>`;
        }
        html = stars;
        if (wit) html += `<div style="font-size:11px;letter-spacing:2px;font-weight:700;color:${this.witBy === 'cop' ? '#ff5a3a' : '#e8c34a'};animation:none">${this.witBy === 'cop' ? 'COP SAW THAT' : 'WITNESSED'} ▲</div>`;
        else if (searching) {
          const sf = clamp(this.searchT / this._need(heat), 0, 1);
          html += `<div style="height:3px;width:86px;margin:2px auto 0;background:rgba(0,0,0,.5)"><i style="display:block;height:100%;width:${Math.round(sf * 100)}%;background:${this.hiding ? '#7fbf4d' : '#5f8bff'}"></i></div>`;
        }
      }
      this._hudHtml = show ? html : '';
      if (!show && this._hudShown) { this._hudShown = false; g.ui.setHud('heat', ''); }
      this._hudShown = show;
      this._wasSearching = searching;
    }
    // src/ui/ui.js redraws plain whole stars on every state change; keep ours on top (setHud skips no-ops)
    if (this._hudShown && this._hudHtml) g.ui.setHud('heat', this._hudHtml);
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
    if (g.net.isClient) this._sendHeat(); // tell the host we're cuffed so its cops stop swinging
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
    const ar = !!msg.ar;
    this.remoteHeat.set(from, { heat: clamp(Number(msg.heat) || 0, 0, 5), seen: msg.seen !== false, lk, hid: !!msg.hid, ar });
    if (ar) {
      // that client is being booked: the cops on them stand down
      for (const n of this.ctx.npcs.map.values()) {
        if (n.kind === 'cop' && !n.replica && n.target?.type === 'remote' && n.target.id === from) this._standDown(n);
      }
    }
  }
}

// ============================================================ taser
// Cops telegraph every taser shot so it can be read and dodged:
//   draw  — a yellow/black taser comes out of the holster (the nightstick goes away)
//   wind  — 0.8 s braced aim: crackling blue sparks at the prongs, an electric "!" over the
//           cop's head, a red laser sight tracking you, crackle audio
//   lock  — the last 0.3 s the aim freezes (laser blinks hard): sidestep or roll out of the line
//   fire  — two dart wires fly out (range 8.5 m); a hit locks you up briefly, a block takes a
//           small jolt, a roll's i-frames or stepping out of the line makes it miss
// The manager starts the attack (only from 2.8-8 m, with a 7-10 s cooldown); this rig drives the
// release instead of the manager's instant strike. Host-authoritative; clients get 'police:taser'.
const TZ = { wind: 0.8, lock: 0.3, range: 8.5, width: 0.75, dartSpeed: 40, dmg: 3, cd: [7, 10] };
const TZ_BLUE = 0x3ad0ff;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(200,235,255,0.9)');
  gr.addColorStop(0.6, 'rgba(80,170,255,0.35)'); gr.addColorStop(1, 'rgba(40,120,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// "!" flanked by two little lightning bolts: reads as "about to get zapped"
function markerTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const bolt = (ox, s) => {
    x.beginPath();
    x.moveTo(ox + 6 * s, 22); x.lineTo(ox - 10 * s, 66); x.lineTo(ox + 2 * s, 66); x.lineTo(ox - 6 * s, 106);
    x.lineTo(ox + 14 * s, 56); x.lineTo(ox + 2 * s, 56); x.lineTo(ox + 12 * s, 22); x.closePath();
    x.fillStyle = '#7fd8ff'; x.fill(); x.lineWidth = 4; x.strokeStyle = '#0a1a2a'; x.stroke();
  };
  bolt(26, 1); bolt(102, -1);
  x.font = '900 92px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = '#101010'; x.strokeText('!', 64, 68);
  x.fillStyle = '#ffd21a'; x.fillText('!', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- synth fallbacks (used when src/audio has no preset of that name yet)
const _noiseBufs = new WeakMap();
function noiseBuf(ctx) {
  let b = _noiseBufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    _noiseBufs.set(ctx, b);
  }
  return b;
}
function zNoise(ctx, dest, t, dur, vol, type, f, q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx);
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function zOsc(ctx, dest, t, dur, vol, type, f0, f1, am = 0) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  let tail = g;
  if (am > 0) { // buzzing tremolo
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = am;
    const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain);
    lfo.start(t); lfo.stop(t + dur + 0.02); g.connect(trem); tail = trem;
  }
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
  o.connect(g); tail.connect(hp); hp.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}
const TZ_SOUNDS = {
  // wind-up: the taser arms (rising electric whine + crackle)
  taserArm(ctx, d, t) {
    zOsc(ctx, d, t, 0.75, 0.035, 'sawtooth', 380, 1250, 38);
    zOsc(ctx, d, t, 0.75, 0.02, 'square', 60, 64, 0);
    for (let i = 0; i < 6; i++) zNoise(ctx, d, t + 0.05 + Math.random() * 0.65, 0.02, 0.07, 'highpass', 3500);
  },
  // crackle tick while the prongs arc
  taserCrackle(ctx, d, t) {
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) zNoise(ctx, d, t + Math.random() * 0.12, 0.012 + Math.random() * 0.015, 0.06, 'highpass', 2800 + Math.random() * 2500);
    zOsc(ctx, d, t, 0.09, 0.012, 'square', 120, 118, 0);
  },
  // aim locks: a short tight double beep
  taserLock(ctx, d, t) {
    zOsc(ctx, d, t, 0.05, 0.03, 'square', 2100, 2100, 0);
    zOsc(ctx, d, t + 0.07, 0.05, 0.03, 'square', 2100, 2100, 0);
  },
  // the cartridge pops and the darts fly
  taserFire(ctx, d, t) {
    zNoise(ctx, d, t, 0.07, 0.16, 'lowpass', 1800);
    zNoise(ctx, d, t, 0.18, 0.05, 'bandpass', 4200, 3);
  },
  // connected: the 50 kV ride
  taserZap(ctx, d, t, o = {}) {
    const dur = o.dur || 0.8;
    zOsc(ctx, d, t, dur, 0.05, 'sawtooth', 55, 52, 22);
    zOsc(ctx, d, t, dur, 0.025, 'square', 1700, 1500, 30);
    for (let i = 0; i < 10; i++) zNoise(ctx, d, t + Math.random() * dur, 0.015, 0.08, 'highpass', 3000 + Math.random() * 3000);
  },
};

export class TaserRig {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.active = new Map();  // npc -> telegraph state
    this.wires = [];          // flying / attached dart wires
    this.shocks = [];         // arcs crawling over a shocked body
    this.pending = [];        // host: dart hits waiting for the dart to arrive
    this.kits = [];           // pooled telegraph visuals
    this._v = new THREE.Vector3();
    this._r = null;
    try { game.net?.on?.('police:taser', (m) => this.onNet(m)); } catch { /* ignore */ }
  }

  // ---- shared resources
  res() {
    if (this._r) return this._r;
    this._r = {
      glow: glowTexture(),
      marker: markerTexture(),
      arcMat: new THREE.LineBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      wireMat: new THREE.LineBasicMaterial({ color: 0xd8e2ea, transparent: true, opacity: 0.9, depthWrite: false }),
      laserMat: new THREE.LineBasicMaterial({ color: 0xff2a22, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0x3a2a00, roughness: 0.5, metalness: 0.1 }),
      black: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 }),
    };
    return this._r;
  }
  sprite(color, scale = 0.3, depthTest = true) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.res().glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest }));
    s.scale.setScalar(scale); s.renderOrder = 9;
    return s;
  }
  line(n, mat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false; l.renderOrder = 9;
    return l;
  }

  // the taser itself: yellow body, black stripes / grip / cartridge. Points down the hand's -Y like the guns.
  taserMesh() {
    const r = this.res();
    const g = new THREE.Group();
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    box(0.052, 0.17, 0.08, r.yellow, 0, -0.09, 0.03);
    box(0.056, 0.02, 0.084, r.black, 0, -0.05, 0.03);
    box(0.056, 0.02, 0.084, r.black, 0, -0.11, 0.03);
    box(0.06, 0.055, 0.09, r.black, 0, -0.2, 0.03);   // cartridge
    box(0.042, 0.05, 0.11, r.black, 0, 0.01, -0.02); // grip
    const tip = new THREE.Object3D(); tip.position.set(0, -0.235, 0.03); g.add(tip);
    g.userData.tip = tip;
    return g;
  }

  kit() {
    let k = this.kits.find((q) => !q.busy);
    if (!k) {
      const r = this.res();
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: r.marker, transparent: true, depthTest: false, depthWrite: false }));
      marker.renderOrder = 11;
      k = { marker, spark: this.sprite(0x9fdcff, 0.3), dot: this.sprite(0xff3322, 0.22, false), laser: this.line(2, r.laserMat.clone()), arcs: [this.line(7, r.arcMat), this.line(7, r.arcMat), this.line(6, r.arcMat)] };
      this.kits.push(k);
    }
    k.busy = true;
    const sc = this.game.scene;
    for (const o of [k.marker, k.spark, k.dot, k.laser, ...k.arcs]) { o.visible = false; if (!o.parent) sc.add(o); }
    return k;
  }
  freeKit(k) {
    if (!k) return;
    k.busy = false;
    for (const o of [k.marker, k.spark, k.dot, k.laser, ...k.arcs]) o.visible = false;
  }

  // draw / holster the taser on a cop
  draw(n, on) {
    try {
      const hand = n.model?.rightHand;
      if (!hand) return;
      if (on) {
        if (!n._taserMesh) n._taserMesh = this.taserMesh();
        if (n._taserMesh.parent !== hand) hand.add(n._taserMesh);
        n._taserMesh.visible = true;
        if (n.weaponObj) n.weaponObj.visible = false;
      } else {
        if (n._taserMesh) n._taserMesh.visible = false;
        if (n.weaponObj) n.weaponObj.visible = true;
      }
    } catch { /* cosmetic */ }
  }
  tip(n) {
    const t = n._taserMesh?.userData?.tip;
    if (t && n._taserMesh.visible && n._taserMesh.parent) { t.updateWorldMatrix(true, false); return t.getWorldPosition(new THREE.Vector3()); }
    const p = n.pos; return new THREE.Vector3(p.x + Math.sin(n.facing || 0) * 0.6, 1.4 * (n.scale || 1), p.z + Math.cos(n.facing || 0) * 0.6);
  }

  sound(name, x, z, opts = {}) {
    const A = this.game.audio;
    if (!A?.play3D) return;
    try { A.play3D(A.presets?.[name] ? name : TZ_SOUNDS[name], x, z, { maxDist: 45, refDist: 3, ...opts }); } catch { /* ignore */ }
  }

  // ---- per frame
  update(dt) {
    const g = this.game, npcs = this.ctx.npcs;
    if (g.net.isAuthority) {
      for (const n of npcs.map.values()) {
        if (n.kind !== 'cop' || n.replica || n.dead) continue;
        const a = n.atk;
        if (a && a.kind === 'taser' && a.phase === 'wind') {
          const T = this.active.get(n);
          if (!T || T.atk !== a) this.begin(n, a);
        }
      }
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        p.t -= dt;
        if (p.t > 0) continue;
        this.pending.splice(i, 1);
        try { if (!p.n.dead) this.ctx.combat?.hurtTarget(p.n, p.target, TZ.dmg, { dir: p.dir, taser: true }); } catch (e) { console.error('[police] taser hit failed', e); }
      }
    }
    for (const [n, T] of this.active) this.step(n, T, dt);
    this.updateWires(dt);
    this.updateShocks(dt);
  }

  begin(n, a, dur = TZ.wind) {
    const old = this.active.get(n);
    if (old) this.freeKit(old.kit);
    if (a) a.t = 99; // hold the manager's wind phase; fire() releases it
    const T = { atk: a, t: 0, dur, aim: null, locked: false, fired: false, holsterT: 0, crackT: 0.05, arcT: 0, kit: this.kit(), replica: !!n.replica };
    this.active.set(n, T);
    this.draw(n, true);
    n.model.windup?.(dur, 'taser', TZ_BLUE);
    this.ctx.fx.clearAlert(n.group);
    if ((n.dist ?? 0) < 45) this.sound('taserArm', n.pos.x, n.pos.z, { vol: 1 });
    const net = this.game.net;
    if (!n.replica && net.connected && net.isAuthority) { try { net.broadcast({ t: 'police:taser', k: 'w', id: n.id, d: dur }); } catch { /* ignore */ } }
  }

  end(n, T, broadcast = false) {
    this.freeKit(T.kit); T.kit = null;
    this.active.delete(n);
    this.draw(n, false);
    if (broadcast) { const net = this.game.net; if (net.connected && net.isAuthority) { try { net.broadcast({ t: 'police:taser', k: 'c', id: n.id }); } catch { /* ignore */ } } }
  }

  step(n, T, dt) {
    const npcs = this.ctx.npcs;
    if (T.fired) {
      T.holsterT -= dt;
      if (T.holsterT <= 0 || n.dead) this.end(n, T);
      return;
    }
    const gone = n.dead || n.removed || !npcs.map.has(n.id);
    if (gone || (!T.replica && n.atk !== T.atk)) {
      // interrupted (hit, stunned, knocked down): fizzle out
      n.model.cancelWindup?.();
      this.end(n, T, !T.replica);
      return;
    }
    T.t += dt;
    const g = this.game;
    // aim: track the target, then freeze for the last beat so it can be sidestepped
    if (!T.replica) {
      const tp = npcs._targetPos(n.target);
      if (!T.locked && tp) T.aim = { x: tp.x, z: tp.z };
    } else if (!T.locked) {
      // replica: aim where the cop faces (at the local player if they're roughly in front)
      const pl = g.player.pos, f = n.facing || 0;
      const dx = pl.x - n.pos.x, dz = pl.z - n.pos.z, d = Math.hypot(dx, dz) || 1;
      const fx = Math.sin(f), fz = Math.cos(f);
      T.aim = (dx * fx + dz * fz) / d > 0.9 && d < TZ.range + 2 ? { x: pl.x, z: pl.z } : { x: n.pos.x + fx * 6, z: n.pos.z + fz * 6 };
      // a snapshot's generic wind-up may have replaced the taser pose
      if (n.model.windStyle !== 'taser') n.model.windup?.(Math.max(0.05, T.dur - T.t), 'taser', TZ_BLUE);
    }
    if (!T.locked && T.t >= T.dur - TZ.lock) {
      T.locked = true;
      if ((n.dist ?? 0) < 40) this.sound('taserLock', n.pos.x, n.pos.z, { vol: 0.9 });
    }
    if (T.locked && T.aim && !T.replica) {
      const yaw = Math.atan2(T.aim.x - n.pos.x, T.aim.z - n.pos.z);
      n.facing = yaw; n.faceTo = yaw; n.group.rotation.y = yaw;
    }
    this.visuals(n, T, dt);
    if (!T.replica && T.t >= T.dur) this.fire(n, T);
  }

  visuals(n, T, dt) {
    const k = T.kit;
    if (!k) return;
    const g = this.game;
    const tip = this.tip(n);
    const q = Math.min(1, T.t / T.dur);
    const vis = n.group.visible !== false;
    // sparks at the prongs, getting angrier
    k.spark.visible = vis;
    k.spark.position.copy(tip);
    k.spark.scale.setScalar((0.18 + 0.32 * q) * (0.6 + Math.random() * 0.6));
    k.spark.material.opacity = 0.55 + 0.45 * Math.random();
    T.arcT -= dt;
    if (T.arcT <= 0) {
      T.arcT = 0.035;
      for (const a of k.arcs) { a.visible = vis; this.jag(a, tip, 0.08 + 0.22 * q); }
    }
    // "!" marker over the head, pulsing faster as it charges
    k.marker.visible = vis;
    k.marker.position.set(n.pos.x, n.group.position.y + 2.8 * (n.scale || 1), n.pos.z);
    k.marker.scale.setScalar(0.62 * (1 + 0.18 * Math.sin(g.elapsed * (14 + 26 * q))));
    k.marker.material.opacity = T.locked ? (Math.floor(g.elapsed * 18) % 2 ? 1 : 0.55) : 0.95;
    // red laser sight from the prongs to the aim point (chest height)
    if (T.aim && vis) {
      const dx = T.aim.x - tip.x, dz = T.aim.z - tip.z, d = Math.hypot(dx, dz) || 1;
      const L = Math.min(TZ.range, d);
      const ex = tip.x + dx / d * L, ez = tip.z + dz / d * L, ey = 1.15;
      const pa = k.laser.geometry.attributes.position;
      pa.setXYZ(0, tip.x, tip.y, tip.z); pa.setXYZ(1, ex, ey, ez); pa.needsUpdate = true;
      k.laser.material.opacity = T.locked ? (Math.floor(g.elapsed * 20) % 2 ? 0.95 : 0.35) : 0.25 + 0.35 * q;
      k.dot.position.set(ex - dx / d * 0.3, ey, ez - dz / d * 0.3);
      k.dot.scale.setScalar((T.locked ? 0.3 : 0.2) * (0.85 + Math.random() * 0.3));
      k.laser.visible = k.dot.visible = true;
    } else k.laser.visible = k.dot.visible = false;
    // crackle audio
    T.crackT -= dt;
    if (T.crackT <= 0) {
      T.crackT = rand(0.13, 0.2);
      if ((n.dist ?? 0) < 35) this.sound('taserCrackle', n.pos.x, n.pos.z, { vol: 0.5 + 0.5 * q });
    }
  }

  // jagged little lightning bolt around point p
  jag(line, p, r) {
    const pa = line.geometry.attributes.position, n = pa.count;
    const x = p.x + rand(-r, r) * 0.3, y = p.y + rand(-r, r) * 0.3, z = p.z + rand(-r, r) * 0.3;
    const tx = p.x + rand(-r, r), ty = p.y + rand(-r, r), tz = p.z + rand(-r, r);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), j = i && i < n - 1 ? r * 0.35 : 0;
      pa.setXYZ(i, x + (tx - x) * u + rand(-j, j), y + (ty - y) * u + rand(-j, j), z + (tz - z) * u + rand(-j, j));
    }
    pa.needsUpdate = true;
    line.material.opacity = 0.6 + Math.random() * 0.4;
  }

  // host: release the shot
  fire(n, T) {
    const g = this.game, npcs = this.ctx.npcs, fx = this.ctx.fx;
    T.fired = true; T.holsterT = 0.9;
    n.taserCd = rand(TZ.cd[0], TZ.cd[1]);
    const a = T.atk;
    if (a && n.atk === a) { a.phase = 'recover'; a.t = 0.7; }
    n.model.cancelWindup?.();
    this.freeKit(T.kit); T.kit = null;
    const tip = this.tip(n);
    const tp = npcs._targetPos(n.target);
    const aim = T.aim || (tp ? { x: tp.x, z: tp.z } : { x: n.pos.x + Math.sin(n.facing) * 5, z: n.pos.z + Math.cos(n.facing) * 5 });
    const ox = n.pos.x, oz = n.pos.z;
    let ux = aim.x - ox, uz = aim.z - oz;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    let hit = false, along = 0;
    if (tp) {
      const rx = tp.x - ox, rz = tp.z - oz;
      along = rx * ux + rz * uz;
      const lat = Math.abs(rx * uz - rz * ux);
      hit = along > 0.3 && along <= TZ.range && lat <= TZ.width && npcs.los(ox, oz, tp.x, tp.z);
      // a dodge roll's i-frames: the darts sail through where you were
      if (hit && n.target?.type === 'player' && this.ctx.combat?.iframes > 0) { hit = false; fx.number(tp.x, 2.3, tp.z, 'DODGE', 'small'); }
    }
    let end;
    if (hit) end = new THREE.Vector3(tp.x - ux * 0.15, 1.05, tp.z - uz * 0.15);
    else {
      // miss: the darts carry on past (or fall short at max range) and drop to the street
      const L = Math.min(TZ.range, Math.max(along, ul) + 1.5);
      let frac = 1;
      try { frac = g.physics.raycast(ox, oz, ox + ux * L, oz + uz * L, 0.3, 1.0); } catch { /* ignore */ }
      end = new THREE.Vector3(ox + ux * L * frac, 0.7, oz + uz * L * frac);
    }
    const travel = Math.max(0.04, tip.distanceTo(end) / TZ.dartSpeed);
    const local = hit && n.target?.type === 'player';
    this.wire(n, tip, end, hit, travel, local ? g.player : null);
    this.sound('taserFire', ox, oz, { vol: 1 });
    if (hit) {
      this.pending.push({ t: travel, n, target: n.target, dir: { x: ux, z: uz } });
      this.sound('taserZap', tp.x, tp.z, { vol: 1, delay: travel, dur: 0.8 });
    }
    const net = g.net;
    if (net.connected && net.isAuthority) {
      const r2 = (v) => Math.round(v * 100) / 100;
      try { net.broadcast({ t: 'police:taser', k: 'f', id: n.id, p: [r2(tip.x), r2(tip.y), r2(tip.z), r2(end.x), r2(end.y), r2(end.z)], h: hit ? 1 : 0, tv: r2(travel) }); } catch { /* ignore */ }
    }
  }

  // client: mirror the host's telegraphs
  onNet(m) {
    const g = this.game;
    if (!m || g.net.isAuthority) return;
    const n = this.ctx.npcs.get(m.id);
    if (!n) return;
    const T = this.active.get(n);
    if (m.k === 'w') this.begin(n, null, clamp(Number(m.d) || TZ.wind, 0.3, 1.5));
    else if (m.k === 'c') { if (T) { n.model.cancelWindup?.(); this.end(n, T); } }
    else if (m.k === 'f' && Array.isArray(m.p) && m.p.length === 6) {
      const [x1, y1, z1, x2, y2, z2] = m.p.map(Number);
      if (![x1, y1, z1, x2, y2, z2].every(Number.isFinite)) return;
      if (T) { T.fired = true; T.holsterT = 0.9; this.freeKit(T.kit); T.kit = null; } else { this.draw(n, true); this.active.set(n, { fired: true, holsterT: 0.9, kit: null }); }
      n.model.cancelWindup?.();
      const pl = g.player;
      const tv = clamp(Number(m.tv) || 0.1, 0.03, 0.4);
      const onMe = !!m.h && Math.hypot(pl.pos.x - x2, pl.pos.z - z2) < 1.6;
      this.wire(n, new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2), !!m.h, tv, onMe ? pl : null);
      this.sound('taserFire', n.pos.x, n.pos.z, { vol: 1 });
      if (m.h) this.sound('taserZap', x2, z2, { vol: 1, delay: tv, dur: 0.8 });
    }
  }

  // ---- dart wires: two thin wires with a sag that fly out, then cling (hit) or drop (miss)
  wire(n, from, to, hit, travel, follow) {
    let w = this.wires.find((q) => !q.busy);
    if (!w) {
      const r = this.res();
      w = { lines: [this.line(12, r.wireMat), this.line(12, r.wireMat)], heads: [this.sprite(0xfff2a0, 0.12), this.sprite(0xfff2a0, 0.12)], arc: this.line(7, r.arcMat), glow: this.sprite(0x9fdcff, 0.5) };
      this.wires.push(w);
    }
    w.busy = true; w.n = n; w.from = from.clone(); w.to = to.clone(); w.hit = hit; w.travel = travel; w.t = 0;
    w.ttl = travel + (hit ? 0.85 : 0.45); w.follow = follow;
    for (const o of [...w.lines, ...w.heads, w.arc, w.glow]) { if (!o.parent) this.game.scene.add(o); o.visible = true; }
    w.arc.visible = w.glow.visible = false;
  }

  updateWires(dt) {
    for (const w of this.wires) {
      if (!w.busy) continue;
      w.t += dt;
      if (w.t >= w.ttl) { w.busy = false; for (const o of [...w.lines, ...w.heads, w.arc, w.glow]) o.visible = false; continue; }
      // the prong end follows the cop's hand while the taser is out; a hit dart rides the victim
      if (w.n && !w.n.dead && w.n._taserMesh?.visible) w.from.copy(this.tip(w.n));
      if (w.follow && w.hit) { const p = w.follow.pos; w.to.set(p.x, p.y + 1.05, p.z); }
      const k = Math.min(1, w.t / w.travel);
      const fade = w.t > w.ttl - 0.2 ? Math.max(0, (w.ttl - w.t) / 0.2) : 1;
      const dropped = !w.hit && k >= 1;
      const ex = w.from.x + (w.to.x - w.from.x) * k, ez = w.from.z + (w.to.z - w.from.z) * k;
      let ey = w.from.y + (w.to.y - w.from.y) * k;
      if (dropped) ey = Math.max(0.03, w.to.y - (w.t - w.travel) * 4);
      const len = Math.hypot(ex - w.from.x, ez - w.from.z) || 1;
      const sag = (w.hit ? 0.05 : 0.08 + (dropped ? 0.2 : 0)) * Math.min(1, len / 4);
      for (let li = 0; li < 2; li++) {
        const L = w.lines[li], pa = L.geometry.attributes.position, cnt = pa.count;
        const off = (li ? 1 : -1) * 0.035;
        const ox = off * (ez - w.from.z) / len, oz = -off * (ex - w.from.x) / len;
        for (let i = 0; i < cnt; i++) {
          const u = i / (cnt - 1);
          pa.setXYZ(i, w.from.x + (ex - w.from.x) * u + ox * u, w.from.y + (ey - w.from.y) * u - sag * Math.sin(u * Math.PI), w.from.z + (ez - w.from.z) * u + oz * u);
        }
        pa.needsUpdate = true;
        L.material.opacity = 0.9 * fade;
        const hd = w.heads[li];
        hd.position.set(ex + ox, ey, ez + oz);
        hd.material.opacity = fade;
      }
      // connected: current crawling down the line + a crackling glow on the victim
      if (w.hit && k >= 1) {
        w.arc.visible = w.glow.visible = true;
        const u = Math.random();
        const p = this._v.set(w.from.x + (w.to.x - w.from.x) * u, w.from.y + (w.to.y - w.from.y) * u - 0.05 * Math.sin(u * Math.PI), w.from.z + (w.to.z - w.from.z) * u);
        this.jag(w.arc, p, 0.18);
        w.glow.position.copy(w.to);
        w.glow.scale.setScalar((0.4 + Math.random() * 0.5) * fade);
        w.glow.material.opacity = (0.5 + Math.random() * 0.5) * fade;
      }
    }
  }

  // ---- arcs crawling over a shocked body (obj: Object3D at the feet, e.g. the player's group)
  shockFx(obj, dur = 0.85, strength = 1) {
    if (!obj) return;
    const r = this.res();
    let s = this.shocks.find((q) => !q.busy);
    if (!s) {
      s = { lines: [this.line(8, r.arcMat), this.line(8, r.arcMat), this.line(7, r.arcMat), this.line(6, r.arcMat)], glow: this.sprite(0x8fd0ff, 0.9) };
      this.shocks.push(s);
    }
    s.busy = true; s.obj = obj; s.t = 0; s.dur = dur; s.k = strength; s.arcT = 0;
    for (const o of [...s.lines, s.glow]) { if (!o.parent) this.game.scene.add(o); o.visible = true; }
  }

  updateShocks(dt) {
    for (const s of this.shocks) {
      if (!s.busy) continue;
      s.t += dt;
      if (s.t >= s.dur || !s.obj?.parent) { s.busy = false; for (const o of [...s.lines, s.glow]) o.visible = false; continue; }
      const p = s.obj.position;
      s.arcT -= dt;
      if (s.arcT <= 0) {
        s.arcT = 0.03;
        for (let li = 0; li < s.lines.length; li++) {
          const L = s.lines[li];
          const on = li < 2 || Math.random() < 0.6 * s.k;
          L.visible = on;
          if (!on) continue;
          const pa = L.geometry.attributes.position, cnt = pa.count;
          const a0 = Math.random() * Math.PI * 2, a1 = a0 + rand(-1.6, 1.6);
          const y0 = rand(0.3, 1.9), y1 = clamp(y0 + rand(-0.9, 0.9), 0.2, 2.0);
          const r0 = rand(0.12, 0.3), r1 = rand(0.12, 0.3);
          for (let i = 0; i < cnt; i++) {
            const u = i / (cnt - 1), a = a0 + (a1 - a0) * u, rr = r0 + (r1 - r0) * u, j = i && i < cnt - 1 ? 0.09 : 0;
            pa.setXYZ(i, p.x + Math.sin(a) * rr + rand(-j, j), p.y + y0 + (y1 - y0) * u + rand(-j, j), p.z + Math.cos(a) * rr + rand(-j, j));
          }
          pa.needsUpdate = true;
        }
      }
      s.glow.position.set(p.x, p.y + 1.15, p.z);
      s.glow.scale.setScalar((0.6 + Math.random() * 0.8) * s.k);
      s.glow.material.opacity = 0.3 + Math.random() * 0.5;
    }
  }
}
