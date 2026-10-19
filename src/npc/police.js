import { clamp, rand, pick, chance, fmtMoney, esc } from '../core/util.js';
import { COP_YELL } from './names.js';

// Heat (state.p.heat 0..5), cop spawning & pursuit, busts and arrests.
const CRIME_HEAT = { assault: 0.4, assaultCop: 0.7, murder: 1.0, copKill: 2.0, gunfire: 0.2, steal: 0.5, vandalism: 0.2 };
const COPS_FOR_HEAT = [0, 2, 3, 4, 6, 8];
const BUSTED_SUBS = ['Hands behind your back, sweetheart.', 'You have the right to remain smelly.', 'Anything you say will be laughed at in court.', 'The cuffs are tight. The cop is tighter.'];

export class Police {
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.lastSeen = 99;
    this.seenT = 0;
    this.spawnT = 0;
    this.decayAcc = 0;
    this.bustT = 0;
    this.arresting = false;
    this.remoteHeat = new Map();
    this.gunT = 0;
    this.sirenT = 0;

    const root = document.getElementById('ui-root') || document.body;
    this.bustEl = document.createElement('div');
    this.bustEl.id = 'npc-busted';
    this.bustEl.innerHTML = 'GETTING CUFFED — RUN! <b></b>';
    root.appendChild(this.bustEl);
    this.bustBar = this.bustEl.querySelector('b');

    game.bus.on('heat:change', ({ heat, before }) => {
      if (game.net.isClient) { try { game.net.sendToHost({ t: 'police:heat', heat }); } catch { /* ignore */ } }
      if (Math.floor(heat) > Math.floor(before)) {
        this.ctx.fx.sfx.play('siren', { vol: 0.8 });
        if (Math.floor(heat) === 1 && Math.floor(before) === 0) game.ui.toast('The cops are onto you. Lose them or face the music (it\'s mostly kazoo).', 'bad', 3000);
        if (Math.floor(heat) === 5) game.ui.toast('★★★★★ SWAT is coming. They brought the BIG sticks.', 'bad', 3500);
      }
    });
  }

  get heat() { return this.game.state.p.heat || 0; }

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
      amt *= type === 'assaultCop' || type === 'copKill' ? 1.25 : 2;
      if (this.heat + amt < 1) amt = 1 - this.heat;
      if (!cop.replica && !cop.hostile) {
        this.ctx.npcs._goHostile(cop, { type: 'player' });
        cop.data.pursuit = true;
        this.ctx.fx.say(cop.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
      }
      this.lastSeen = 0;
    }
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

  clearHeat(silent = false) {
    const g = this.game;
    if (this.heat > 0) g.state.addHeat(-5);
    this.bustT = 0;
    this.lastSeen = 99;
    for (const n of this.ctx.npcs.map.values()) {
      if (n.kind === 'cop' && !n.replica && n.target?.type === 'player') this._standDown(n);
    }
    if (!silent) g.ui.toast('Your record is squeaky clean. Well. Clean-ish.', 'good');
  }

  _standDown(n) {
    n.hostile = false; n.target = null; n.data.pursuit = false;
    n.state = 'wander'; n.goal = null; n.leaving = !!n.data.spawnedByHeat;
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    if (!g.started || !pl) return;
    const heat = this.heat;

    // --- do cops see the local player? (4Hz)
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.25;
      const pp = pl.vehicle ? (pl.vehicle.group?.position ?? pl.pos) : pl.pos;
      let seen = false;
      for (const n of this.ctx.npcs.near(pp.x, pp.z, 45)) {
        if (n.kind !== 'cop' || n.dead || n.knockdown > 0) continue;
        if (this.ctx.npcs.los(n.pos.x, n.pos.z, pp.x, pp.z)) {
          seen = true;
          // ambient patrol cops join the chase when they spot a wanted player
          if (heat >= 1 && !n.hostile && !n.replica && Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 35) {
            this.ctx.npcs._goHostile(n, { type: 'player' });
            n.data.pursuit = true;
            this.ctx.fx.say(n.group, pick(COP_YELL), { ttl: 2, kind: 'cop' });
          }
        }
      }
      this.lastSeen = seen ? 0 : this.lastSeen + 0.25;
    }

    // --- heat decays when no cop has eyes on you
    if (heat > 0 && this.lastSeen > 6 && !this.arresting && !pl.dead) {
      this.decayAcc += dt * (pl.vehicle ? 0.075 : 0.055);
      if (this.decayAcc >= 0.1) {
        g.state.addHeat(-this.decayAcc);
        this.decayAcc = 0;
        if (this.heat <= 0) {
          g.ui.toast('You lost the cops. They went for donuts instead.', 'good', 2600);
          for (const n of this.ctx.npcs.map.values()) if (n.kind === 'cop' && !n.replica && n.target?.type === 'player') this._standDown(n);
        }
      }
    }

    // --- getting cuffed: a cop on top of you while you stand around at low heat
    this._updateBust(dt, heat);

    // --- authority: spawn / manage pursuit cops for every wanted player
    if (g.net.isAuthority) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 1.2; this._manageCops(); }
    }
  }

  _updateBust(dt, heat) {
    const g = this.game, pl = g.player;
    let near = false;
    if (heat >= 1 && heat < 3 && !pl.vehicle && !pl.dead && !this.arresting && !this.ctx.combat.isDown) {
      for (const n of this.ctx.npcs.near(pl.pos.x, pl.pos.z, 1.9)) {
        if (n.kind === 'cop' && n.hostile && !n.dead && !(n.knockdown > 0) && !n.kdShown) { near = true; break; }
      }
    }
    if (near && pl.speed < 3) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 0.6);
    if (this.bustT > 0.05) {
      this.bustEl.style.display = 'block';
      this.bustBar.style.width = `${clamp(this.bustT / 1.8, 0, 1) * 100}%`;
    } else if (this.bustEl.style.display !== 'none') this.bustEl.style.display = 'none';
    if (this.bustT >= 1.8) { this.bustT = 0; this.bustEl.style.display = 'none'; this.arrest({ caught: true }); }
  }

  _manageCops() {
    const g = this.game;
    const npcs = this.ctx.npcs;
    const wanted = [];
    const pl = g.player;
    if (pl && !pl.dead && !this.arresting) wanted.push({ t: { type: 'player' }, heat: this.heat, pos: pl.vehicle ? (pl.vehicle.group?.position ?? pl.pos) : pl.pos });
    for (const [id, h] of this.remoteHeat) {
      const r = g.net.remotePlayers?.get?.(id);
      if (!r) { this.remoteHeat.delete(id); continue; }
      const pos = r.pos || r.group?.position;
      if (pos) wanted.push({ t: { type: 'remote', id }, heat: h, pos });
    }
    let total = 0;
    const per = new Map();
    for (const n of npcs.map.values()) {
      if (n.kind !== 'cop' || n.dead || n.replica) continue;
      if (n.data.spawnedByHeat) total++;
      // cops whose target cooled off go home
      if (n.data.pursuit && n.target) {
        const key = n.target.type === 'player' ? 'player' : n.target.id;
        const h = n.target.type === 'player' ? this.heat : (this.remoteHeat.get(n.target.id) ?? 0);
        if (h < 1) { this._standDown(n); continue; }
        per.set(key, (per.get(key) || 0) + 1);
        // escalate: draw pistols at 3 stars
        if (h >= 3 && n.weapon === 'baton' && chance(0.5)) npcs.setWeapon(n, 'pistol');
      }
      // despawn idle heat-cops once nobody is around
      if (n.data.spawnedByHeat && !n.data.pursuit) {
        n.data.idleT = (n.data.idleT || 0) + 1.2;
        let far = true;
        for (const w of wanted) if (Math.hypot(w.pos.x - n.pos.x, w.pos.z - n.pos.z) < 60) far = false;
        if (far || n.data.idleT > 45) npcs.remove(n);
      }
    }
    for (const w of wanted) {
      const lvl = Math.floor(w.heat);
      if (lvl < 1) continue;
      const key = w.t.type === 'player' ? 'player' : w.t.id;
      const have = per.get(key) || 0;
      if (have < COPS_FOR_HEAT[lvl] && total < 16) {
        this._spawnCop(w, lvl);
        total++;
      }
    }
  }

  _spawnCop(w, lvl) {
    const g = this.game;
    let x = null, z = null;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(38, 55);
      const tx = w.pos.x + Math.sin(a) * r, tz = w.pos.z + Math.cos(a) * r;
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
    g.ui.bigText('BUSTED', esc(pick(BUSTED_SUBS)), 1800);
    const lvl = Math.max(1, Math.ceil(this.heat));
    const fine = 100 + 150 * lvl;
    const bribe = Math.round(fine * 0.55);
    const hours = 4 + 5 * lvl;
    const bribeChance = clamp(0.3 + (p.cha || 0) * 0.012, 0.3, 0.92);
    const hadDrugs = g.state.totalDrugs?.() > 0;
    p.drugs = {};
    g.state.changed('drugs');
    if (pl.vehicle) { try { g.vehicles?.exit?.(true); g.vehicles?.exitVehicle?.(true); } catch { /* ignore */ } }
    const cop = this.ctx.npcs.near(pl.pos.x, pl.pos.z, 8).find((n) => n.kind === 'cop');
    await new Promise((r) => setTimeout(r, 900));

    let method = 'jail';
    let result = null;
    try {
      result = await g.ui.dialog({
        title: 'Rotwell PD — You\'re Nicked',
        speaker: cop ? esc(cop.name) : 'Officer Grubb',
        closable: false,
        text: `"Well, well, well. Look what crawled outta the gutter."\n\nCharges: being a menace (${lvl}★).${hadDrugs ? '\nYour stash has been "confiscated as evidence". The evidence will be smoked by Friday.' : ''}\n\nHow do you wanna do this?`,
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
    pl.moveLocked = false;
    this.arresting = false;
    g.state.changed('totals');
    g.bus.emit('player:arrested', { method, fine, bribe, hours, beaten: !!opts.beaten });
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

  // Host: a cop caught a remote player.
  onRemoteHeat(msg, from) { this.remoteHeat.set(from, clamp(Number(msg.heat) || 0, 0, 5)); }
}
