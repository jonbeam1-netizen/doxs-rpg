import * as THREE from 'three';
import { CARS } from '../data/cars.js';
import { fmtMoney, pick, clamp } from '../core/util.js';

// Dustbowl Drag Strip: bet, race an AI rival through checkpoint gates.
// Track: world.raceTrack ([{x,z}], first = start) if the world provides one,
// else a long run along the road graph out of the Dustbowl, else a loop of
// gates in the open around the strip.

const RIVALS = [
  {
    name: "Dusty 'Two-Teeth' McGraw", color: '#a8561f', hat: 'cap',
    intro: "Heh. You wanna race ME? I've got two teeth and both of 'em are faster than you.",
    win: ["Eat my dust! It's mostly dust out here anyway!", 'Tell your mama I said hi. She was in the stands cheering for ME.'],
    lose: ['Aw, crap. That was my rent money. And my teeth money.', "I let you win. My truck's got a cold."],
    taunt: ['You drive like a shopping cart with a lazy wheel!', 'See ya at the finish, slowpoke!', 'Smell that? That\'s my exhaust, buddy!'],
  },
  {
    name: 'Velma Burnout', color: '#4b2a52', hat: null,
    intro: "Hope you brought a fire extinguisher, sweetie. For your ego.",
    win: ['Aww, did the big bad road scare you?', 'I\'ve seen faster parked cars. I\'ve seen faster PARKING TICKETS.'],
    lose: ['Fine. FINE. Rematch. Bring cash and a helmet.', "Ugh. My nails were drying, that's my excuse."],
    taunt: ['Brake pedal is the OTHER one, sweetie!', 'Try to keep up!', 'Is that your car or a cry for help?'],
  },
  {
    name: 'The Reverend Torque', color: '#151414', hat: 'tophat',
    intro: 'The Lord giveth horsepower and the Lord taketh your money. Let us pray. For you.',
    win: ['Blessed are the slow, for they shall pay me.', 'Your soul AND your cash. A good day for the ministry.'],
    lose: ['The Lord works in mysterious ways. This one\'s just insulting.', 'I shall pray for the strength not to key your car.'],
    taunt: ['Repent, slowpoke!', 'I see the light! It\'s my taillights, in your eyes!', 'Hallelujah, I\'m lapping you!'],
  },
  {
    name: "Lil' Ricky Nitro", color: '#2f6b66', hat: 'beanie',
    intro: "Yo yo yo. I've won forty races. Thirty-nine were against my mom. Let's GO.",
    win: ["That's forty-one, baby! MOM, DID YOU SEE THAT?", 'Get wrecked, nerd!'],
    lose: ["Nah nah nah, that doesn't count, my seat was too high.", "I'm telling my mom."],
    taunt: ['Beep beep, loser!', 'You call that a car? I call that a sad lunchbox!', 'Nitro go BRRRR!'],
  },
];

function rivalCar(bet) {
  if (bet < 300) return pick(['rustbucket', 'puddlejumper', 'dirtwagon']);
  if (bet < 1500) return pick(['puddlejumper', 'commuter', 'hearse']);
  if (bet < 6000) return pick(['thunderhog', 'widowmaker']);
  return 'vendetta';
}

export function installRace(vm) {
  const race = new Race(vm);
  vm.race = race;
  vm.game.locations.register('race', (game, loc) => race.open(loc));
  vm.game.addSystem({ name: 'vehicles:race', update: (dt) => race.update(dt) });
}

class Race {
  constructor(vm) {
    this.vm = vm;
    this.game = vm.game;
    this.active = false;
    this.gates = null;
  }

  // ---------------------------------------------------------------- UI
  open(loc) {
    const g = this.game;
    if (this.active) { g.ui.toast('A race is already on. Focus!', 'bad'); return; }
    const rival = pick(RIVALS);
    const dx = loc.doorX ?? loc.x, dz = loc.doorZ ?? loc.z;
    let near = null, nd = 150;
    for (const c of this.vm.cars) {
      if (c.owner !== 'player' || !c.uid || c.dead || c.removed) continue;
      const d = Math.hypot(c.x - dx, c.z - dz);
      if (d < nd) { nd = d; near = c; }
    }
    const money = g.state.p.money;
    g.ui.dialog({
      title: loc.name || 'Dustbowl Drag Strip', speaker: rival.name,
      text: `"${rival.intro}"\n\nMinimum bet $50. Win and you double it. Lose and, well, you're out here eating sand.`,
      options: [
        near ? { label: `Race your ${near.def.name}`, hint: 'it gets towed to the start line', onSelect: () => this.askBet(loc, rival, near, false) }
          : { label: 'Race your own ride', disabled: true, hint: 'park a car you own nearby' },
        { label: 'Borrow the track junker', hint: 'free · smells like feet', onSelect: () => this.askBet(loc, rival, null, true) },
        { label: 'Leave', hint: money < 50 ? 'you can\'t afford the minimum anyway' : '' },
      ],
    });
  }

  async askBet(loc, rival, car, loaner) {
    const g = this.game;
    const max = Math.min(g.state.p.money, 50000);
    if (max < 50) { g.ui.toast('Fifty bucks minimum. Go sell a kidney or something.', 'bad'); return; }
    const bet = await g.ui.promptNumber({ title: 'Place your bet', text: `How much are you putting on yourself? (max ${fmtMoney(max)})`, min: 50, max, initial: Math.min(max, 200) });
    if (bet == null || bet < 50) return;
    if (!g.state.spend(bet, 'race bet')) return;
    try { this.start(loc, rival, car, loaner, bet); } catch (e) {
      console.error('[race] start failed', e);
      g.state.addMoney(bet, 'race refund');
      g.ui.toast('The race got cancelled (bug). Bet refunded.', 'bad');
    }
  }

  // ---------------------------------------------------------------- track
  buildTrack(loc) {
    const g = this.game, w = g.world;
    const dx = loc.doorX ?? loc.x, dz = loc.doorZ ?? loc.z;
    if (Array.isArray(w?.raceTrack) && w.raceTrack.length >= 3) {
      const t = w.raceTrack;
      return { start: t[0], cps: t.slice(1), lane: 2.5 };
    }
    const G = this.vm.traffic.graph();
    if (G && G.nodes.length > 4) {
      let cur = null;
      try { cur = w.nearestRoadNode?.(dx, dz); } catch { cur = null; }
      if (cur == null || !G.nodes[cur]) {
        let bd = Infinity;
        G.nodes.forEach((n, i) => { const d = Math.hypot(n.x - dx, n.z - dz); if (d < bd) { bd = d; cur = i; } });
      }
      const path = [cur];
      const visited = new Set([cur]);
      let prev = null, total = 0;
      while (path.length < 14 && total < 1100) {
        const nb = G.adj[cur].filter((n) => !visited.has(n));
        if (!nb.length) break;
        const A = G.nodes[cur];
        let best = null, bs = -Infinity;
        for (const n of nb) {
          const B = G.nodes[n];
          const len = Math.hypot(B.x - A.x, B.z - A.z) || 1;
          const dir = { x: (B.x - A.x) / len, z: (B.z - A.z) / len };
          let s = Math.min(len, 120) * 0.02 + Math.random() * 0.8;
          if (prev) s += (dir.x * prev.x + dir.z * prev.z) * 1.2;
          try { if (w.districtAt?.(B.x, B.z) === 'dustbowl') s += 0.8; } catch { /* */ }
          if (s > bs) { bs = s; best = { n, dir, len }; }
        }
        visited.add(best.n);
        path.push(best.n);
        total += best.len;
        prev = best.dir;
        cur = best.n;
      }
      if (path.length >= 4 && total > 200) {
        const pts = path.map((i) => ({ x: G.nodes[i].x, z: G.nodes[i].z }));
        return { start: pts[0], cps: pts.slice(1), lane: this.vm.traffic.laneOffset() };
      }
    }
    // Fallback: a loop of gates in the most open direction.
    const ph = g.physics;
    let bestA = 0, bf = -1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const f = ph.raycast(dx, dz, dx + Math.sin(a) * 160, dz + Math.cos(a) * 160, 2);
      if (f > bf) { bf = f; bestA = a; }
    }
    const R = 60;
    const cx = dx + Math.sin(bestA) * (R + 14), cz = dz + Math.cos(bestA) * (R + 14);
    const a0 = Math.atan2(dx - cx, dz - cz);
    const cps = [];
    for (let i = 1; i <= 10; i++) {
      const a = a0 + (i / 10) * Math.PI * 2;
      const r = ph.resolveCircle(cx + Math.sin(a) * R, cz + Math.cos(a) * R, 5);
      cps.push({ x: r.x, z: r.z });
    }
    const s = ph.resolveCircle(cx + Math.sin(a0) * R, cz + Math.cos(a0) * R, 5);
    return { start: { x: s.x, z: s.z }, cps, lane: 2.6 };
  }

  makeGates() {
    if (this.gates) return this.gates;
    const scene = this.game.scene;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 32;
    const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#eee'; x.fillRect(i * 8, j * 8, 8, 8); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 });
    const bannerMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x222222, emissiveMap: tex });
    const mk = (bright) => {
      const grp = new THREE.Group();
      const post = new THREE.CylinderGeometry(0.15, 0.18, 6, 8);
      for (const s of [-1, 1]) { const m = new THREE.Mesh(post, postMat); m.position.set(s * 7, 3, 0); m.castShadow = true; grp.add(m); }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.2), bannerMat);
      banner.position.y = 5.6;
      grp.add(banner);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 70, 10, 1, true), new THREE.MeshBasicMaterial({
        color: bright ? 0xffd23c : 0xff7a2a, transparent: true, opacity: bright ? 0.32 : 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      beam.position.y = 35;
      grp.add(beam);
      grp.visible = false;
      scene.add(grp);
      return grp;
    };
    this.gates = [mk(true), mk(false)];
    return this.gates;
  }

  placeGate(gate, i) {
    const cps = this.track.cps;
    const cp = cps[i];
    if (!cp) { gate.visible = false; return; }
    const prev = i === 0 ? this.track.start : cps[i - 1];
    gate.position.set(cp.x, 0, cp.z);
    gate.rotation.y = Math.atan2(cp.x - prev.x, cp.z - prev.z);
    gate.visible = true;
  }

  // ---------------------------------------------------------------- flow
  start(loc, rival, car, loaner, bet) {
    const g = this.game, vm = this.vm;
    const track = this.buildTrack(loc);
    this.track = track;
    const s = track.start, n = track.cps[0];
    const len = Math.hypot(n.x - s.x, n.z - s.z) || 1;
    const ux = (n.x - s.x) / len, uz = (n.z - s.z) / len;
    const rot = Math.atan2(ux, uz);
    const lane = Math.max(2.2, track.lane || 2.4);
    if (loaner) {
      car = vm.spawnCar('rustbucket', { x: s.x, z: s.z, rot, color: '#6b6a66', owner: 'player' });
      this.loaner = car;
    } else this.loaner = null;
    // Player on the right, rival on the left.
    const place = (c, side) => {
      c.group.position.set(s.x - uz * lane * side, 0, s.z + ux * lane * side);
      c.heading = rot; c.group.rotation.y = rot;
      c.vel.set(0, 0); c.angVel = 0; c.steer = 0;
    };
    place(car, 1);
    if (vm.current !== car) { if (vm.current) vm.exit(true); vm.enter(car); }
    g.cameraRig.yaw = rot + Math.PI;
    const ai = vm.spawnCar(rivalCar(bet), { x: s.x, z: s.z, rot, color: rival.color, owner: 'race', driver: true, hat: rival.hat });
    place(ai, -1);
    ai.ai = { mode: 'race', idx: 0, stuckT: 0, backT: 0 };
    ai.aiSkill = clamp(0.86 + bet / 30000, 0.86, 1.02);
    car.frozen = true; ai.frozen = true;
    this.active = true;
    this.phase = 'countdown';
    this.t = 3.99;
    this.lastShown = null;
    this.bet = bet; this.rival = rival; this.car = car; this.ai = ai;
    this.idx = 0; this.elapsed = 0; this.tauntT = 6; this.lastLead = null;
    const gates = this.makeGates();
    this.placeGate(gates[0], 0); this.placeGate(gates[1], 1);
    g.ui.toast(`<b>${rival.name}</b> is in a ${ai.def.name}. Bet: ${fmtMoney(bet)}. Follow the beacons!`, 'info', 4000);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game, vm = this.vm;
    if (this.ai.removed || this.car.removed) { this.finish(this.ai.removed, 'Something exploded. Race over.'); return; }
    if (this.phase === 'countdown') {
      this.t -= dt;
      const sec = Math.ceil(this.t);
      if (sec !== this.lastShown) {
        this.lastShown = sec;
        if (sec > 0) { g.ui.bigText(String(sec), 'Hold it... hold it...', 900); vm.audio.beep(520, 0.18); }
      }
      if (this.t <= 0) {
        this.phase = 'go';
        this.car.frozen = false; this.ai.frozen = false;
        g.ui.bigText('GO!', 'Floor it!', 900);
        vm.audio.beep(880, 0.4, 0.16);
      }
      this.hud();
      return;
    }
    if (this.phase === 'done') {
      this.doneT -= dt;
      this.driveAI(dt);
      if (this.doneT <= 0) this.cleanup();
      return;
    }
    this.elapsed += dt;
    const cps = this.track.cps;
    // Player checkpoints.
    const pc = cps[this.idx];
    if (pc && Math.hypot(this.car.x - pc.x, this.car.z - pc.z) < 10) {
      this.idx++;
      vm.audio.beep(this.idx >= cps.length ? 990 : 760, 0.12);
      if (this.idx >= cps.length) { this.finish(true); return; }
      this.placeGate(this.gates[0], this.idx);
      this.placeGate(this.gates[1], this.idx + 1);
    }
    this.driveAI(dt);
    if (this.ai.ai.idx >= cps.length) { this.finish(false); return; }
    if (this.elapsed > 300) { this.finish(false, 'Too slow. The rival went home, had dinner, came back and won.'); return; }
    if (this.car.dead) { this.finish(false, 'Your ride is on fire. That\'s a forfeit, champ.'); return; }
    // Trash talk on lead changes.
    const lead = this.progress(this.car, this.idx) >= this.progress(this.ai, this.ai.ai.idx);
    this.tauntT -= dt;
    if (this.lastLead !== null && lead !== this.lastLead && this.tauntT <= 0) {
      this.tauntT = 6;
      if (!lead) g.ui.toast(`<b>${this.rival.name}:</b> "${pick(this.rival.taunt)}"`, 'info', 2600);
    }
    this.lastLead = lead;
    const m = g.world?.markers;
    if (m?.set && cps[this.idx]) m.set('race:next', { x: cps[this.idx].x, z: cps[this.idx].z, color: '#ffd23c', label: 'Checkpoint' });
    this.hud(lead);
  }

  progress(car, idx) {
    const cp = this.track.cps[idx];
    if (!cp) return idx * 10000;
    return idx * 10000 - Math.hypot(car.x - cp.x, car.z - cp.z);
  }

  hud(lead = true) {
    const n = this.track.cps.length;
    const t = this.elapsed;
    this.game.ui.setHud('extra', `<div style="background:rgba(10,8,6,.72);border:1px solid #3a3128;padding:6px 10px;font-size:18px">
      <b style="color:#ffd23c">DRAG RACE</b> · ${fmtMoney(this.bet)} on the line<br>
      Checkpoint <b>${Math.min(this.idx + 1, n)}/${n}</b> · ${this.phase === 'countdown' ? 'get ready' : `<b style="color:${lead ? '#7fbf4d' : '#e2402f'}">${lead ? '1st' : '2nd'}</b>`} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</div>`);
  }

  driveAI(dt) {
    const car = this.ai;
    if (!car || car.removed || car.dead) return;
    const ai = car.ai, inp = car.input, cps = this.track.cps;
    inp.noReverse = false; inp.nitro = false;
    if (this.phase === 'done' || ai.idx >= cps.length) {
      inp.throttle = 0; inp.reverse = 0; inp.handbrake = car.speed < 6; inp.steer = 0;
      return;
    }
    const cp = cps[ai.idx];
    const d = Math.hypot(car.x - cp.x, car.z - cp.z);
    if (d < 8.5) { ai.idx++; return; }
    const next = cps[ai.idx + 1];
    let tx = cp.x, tz = cp.z;
    let sharp = 0;
    if (next) {
      const k = clamp((22 - d) / 22, 0, 1) * 0.55;
      tx += (next.x - cp.x) * k; tz += (next.z - cp.z) * k;
      const ax = cp.x - car.x, az = cp.z - car.z, al = Math.hypot(ax, az) || 1;
      const bx = next.x - cp.x, bz = next.z - cp.z, bl = Math.hypot(bx, bz) || 1;
      sharp = clamp(1 - (ax * bx + az * bz) / (al * bl), 0, 2) / 2;
    }
    const f = car.forward;
    const dx = tx - car.x, dz = tz - car.z;
    const fw = dx * f.x + dz * f.z, lat = dx * -f.z + dz * f.x;
    const ang = Math.atan2(lat, fw);
    inp.steer = clamp(-ang * 2.6, -1, 1);
    // Rubber band (gentle).
    const gap = this.progress(car, ai.idx) - this.progress(this.car, this.idx);
    car.aiSpeedMul = clamp(ai.skillBase ?? car.aiSkill ?? 0.95, 0.7, 1.1) * (gap > 60 ? 0.86 : gap < -60 ? 1.12 : 1);
    let desired = car.vmax * (car.aiSpeedMul || 1);
    if (d < 30) desired *= 1 - 0.6 * sharp * clamp((30 - d) / 20, 0, 1);
    if (Math.abs(ang) > 0.9) desired = Math.min(desired, 10);
    const v = car.vf;
    inp.handbrake = Math.abs(ang) > 1.1 && v > 12;
    if (v < desired - 0.5) { inp.throttle = 1; inp.reverse = 0; }
    else if (v > desired + 2) { inp.throttle = 0; inp.reverse = clamp((v - desired) / 6, 0.2, 1); inp.noReverse = true; }
    else { inp.throttle = 0.4; inp.reverse = 0; }
    // Unstick.
    if (car.speed < 1.2 && this.phase === 'go') ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt);
    if (ai.stuckT > 1.8 && ai.backT <= 0) { ai.backT = 1.2; ai.stuckT = 0; ai.unstuck = (ai.unstuck || 0) + 1; }
    if (ai.backT > 0) {
      ai.backT -= dt;
      inp.throttle = 0; inp.reverse = 1; inp.noReverse = false; inp.steer = -inp.steer; inp.handbrake = false;
    }
    if ((ai.unstuck || 0) > 3) {
      // Teleport the rival back on track (off camera, hopefully).
      ai.unstuck = 0;
      const prev = ai.idx > 0 ? cps[ai.idx - 1] : this.track.start;
      const r = this.game.physics.resolveCircle(prev.x, prev.z, 2);
      car.group.position.set(r.x, 0, r.z);
      car.heading = Math.atan2(cp.x - r.x, cp.z - r.z);
      car.vel.set(0, 0);
    }
  }

  finish(won, why = '') {
    const g = this.game;
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.doneT = 5;
    const r = this.rival, bet = this.bet;
    if (won) {
      g.state.addMoney(bet * 2, 'race');
      g.state.addXP?.(20 + Math.min(80, Math.round(bet / 200)));
      g.ui.bigText('YOU WIN', `+${fmtMoney(bet * 2)} · ${r.name}: "${pick(r.lose)}"`, 4200);
      g.bus.emit('race:won', { bet });
    } else {
      g.ui.bigText('YOU LOST', why || `${r.name}: "${pick(r.win)}"`, 4200);
      g.bus.emit('race:lost', { bet });
    }
    for (const gate of this.gates || []) gate.visible = false;
    g.world?.markers?.delete?.('race:next');
    g.ui.setHud('extra', '');
    if (this.car) this.car.frozen = false;
  }

  cleanup() {
    this.active = false;
    if (this.ai && !this.ai.removed) {
      if (this.vm.nearPlayer(this.ai, 45)) { this.ai.owner = 'traffic'; this.ai.removeAt = this.game.elapsed + 25; this.ai.ai = null; }
      else this.vm.removeCar(this.ai);
    }
    if (this.loaner && this.loaner !== this.vm.current && !this.loaner.removed) this.loaner.removeAt = this.game.elapsed + 20;
    this.ai = null;
  }

  onExit(car) {
    if (car === this.loaner) car.removeAt = this.game.elapsed + 20;
    if (this.active && this.phase !== 'done' && car === this.car) this.finish(false, 'You bailed out of the race. Forfeit. The crowd boos.');
  }

  abort(silent = false) {
    if (!this.active) return;
    if (this.phase !== 'done' && !silent) this.finish(false);
    for (const gate of this.gates || []) gate.visible = false;
    this.game.ui.setHud('extra', '');
    this.active = false;
    this.phase = 'done';
  }
}
