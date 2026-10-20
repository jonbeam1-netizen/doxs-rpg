import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUND_Y, colored, rnd, angTo } from './common.js';
import { SFX } from './sfx.js';

// Stray dogs of Gutterside and the Dustbowl. They trot the sidewalks, sniff, bark at you,
// tag along for a bit, and can be petted (E). They are not NPCs: nothing can hurt them.

const MAX = 3;
const PI = Math.PI;
const WANT = { gutterside: 3, dustbowl: 2 };
const COATS = ['#5a4632', '#7a6a52', '#2e2a26', '#5e5a52', '#6a4a30', '#8a7a62'];
const NAMES = ['Sir Fleas', 'Chunk', 'Biscuit', 'Lieutenant Drool', 'Mange', 'Kibbles', 'Two-Tooth', 'Sausage', 'Rufus the Unwashed', 'Princess'];
const PET_LINES = [
  'licks your hand, then its own butt, then your hand again. Circle of life.',
  'leans into the ear scratch and farts with gratitude.',
  'rolls over. Belly full of fleas and one (1) cigarette butt.',
  'humps your leg briefly, out of respect.',
  'stares at you like you are the first decent person in Rotwell. Low bar. You cleared it.',
  'sneezes directly into your palm. A blessing, probably.',
  'smells like a wet ashtray and loves you unconditionally. Best deal in town.',
  'tries to eat your sleeve. Mostly affection.',
];
const CHARM_LINES = ['Somebody across the street saw that. "Aww." +Charm, you shameless dog-petter.', 'A passing lady clocks you petting a stray. You look like a decent human for one second.'];

let G = null;
function geos() {
  if (G) return G;
  const W = [1, 1, 1], dark = [0.08, 0.07, 0.07], muzzle = [1.12, 1.08, 1.02];
  G = {
    body: colored(new THREE.BoxGeometry(0.27, 0.27, 0.64).translate(0, 0.565, 0), W),
    head: mergeGeometries([
      colored(new THREE.BoxGeometry(0.22, 0.2, 0.24).translate(0, 0.08, 0.1), W),
      colored(new THREE.BoxGeometry(0.12, 0.1, 0.16).translate(0, 0.03, 0.28), muzzle),
      colored(new THREE.BoxGeometry(0.05, 0.04, 0.03).translate(0, 0.07, 0.36), dark),
      colored(new THREE.BoxGeometry(0.06, 0.11, 0.035).rotateZ(0.25).translate(0.085, 0.2, 0.05), W),
      colored(new THREE.BoxGeometry(0.06, 0.11, 0.035).rotateZ(-0.25).translate(-0.085, 0.2, 0.05), W),
      colored(new THREE.BoxGeometry(0.03, 0.03, 0.01).translate(0.055, 0.12, 0.222), dark),
      colored(new THREE.BoxGeometry(0.03, 0.03, 0.01).translate(-0.055, 0.12, 0.222), dark),
    ]),
    tail: colored(new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(0, 0, -0.15), W),
    leg: colored(new THREE.BoxGeometry(0.075, 0.46, 0.075).translate(0, -0.23, 0), [0.85, 0.85, 0.85]),
  };
  return G;
}
const MATS = new Map();
function coat(hex) {
  if (!MATS.has(hex)) MATS.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 1, vertexColors: true }));
  return MATS.get(hex);
}

function buildDog(hex, scale) {
  const g = geos(), m = coat(hex);
  const root = new THREE.Group(); root.name = 'life:dog';
  const bodyP = new THREE.Group(); root.add(bodyP);
  const body = new THREE.Mesh(g.body, m); body.castShadow = true; bodyP.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.66, 0.3); bodyP.add(head);
  head.add(new THREE.Mesh(g.head, m));
  const tail = new THREE.Group(); tail.position.set(0, 0.65, -0.31); bodyP.add(tail);
  tail.add(new THREE.Mesh(g.tail, m));
  const legs = [];
  for (const [x, z] of [[0.09, 0.24], [-0.09, 0.24], [0.09, -0.25], [-0.09, -0.25]]) {
    const p = new THREE.Group(); p.position.set(x, 0.47, z); bodyP.add(p);
    p.add(new THREE.Mesh(g.leg, m)); legs.push(p);
  }
  root.scale.setScalar(scale);
  return { root, bodyP, head, tail, legs };
}

export class Dogs {
  constructor(ctx) {
    this.ctx = ctx;
    this.dogs = [];
    this.streamT = 1.5;
    this.nid = 0;
    this.barkT = rnd(10, 25);
    this.karmaDay = -1; this.karmaN = 0;
  }

  clear() { for (const d of this.dogs.slice()) this.remove(d); }

  spawn(x, z) {
    if (this.dogs.length >= MAX) return null;
    const hex = COATS[(Math.random() * COATS.length) | 0];
    const scale = rnd(0.82, 1.12);
    const rig = buildDog(hex, scale);
    const id = 'life_dog_' + (++this.nid);
    const used = new Set(this.dogs.map((d) => d.name));
    const names = NAMES.filter((n) => !used.has(n));
    const d = {
      id, rig, x, z, yaw: Math.random() * PI * 2, scale, name: names[(Math.random() * names.length) | 0],
      state: 'idle', t: rnd(0.5, 2), tx: x, tz: z, v: 0, ph: 0, wag: 2, wagAmp: 0.4, tailUp: 1, stuck: 0,
      barkCD: rnd(3, 8), barkN: 0, barkT: 0, friend: false, followT: 0, petted: false, cross: false, look: 0,
    };
    rig.root.position.set(x, GROUND_Y, z);
    this.ctx.game.scene.add(rig.root);
    this.dogs.push(d);
    const game = this.ctx.game;
    game.interact.add({
      id, radius: 1.8,
      prompt: () => `Pet ${d.name} (stray)`,
      getPos: () => (d.state === 'flee' || d.gone ? null : { x: d.x, z: d.z }),
      onInteract: () => this.pet(d),
    });
    return d;
  }

  remove(d) {
    d.gone = true;
    const i = this.dogs.indexOf(d);
    if (i >= 0) this.dogs.splice(i, 1);
    d.rig.root.removeFromParent();
    try { this.ctx.game.interact.remove(d.id); } catch { /* ignore */ }
  }

  pet(d) {
    const game = this.ctx.game, F = this.ctx.focus;
    d.state = 'happy'; d.t = 2.6; d.v = 0;
    d.yaw = Math.atan2(F.x - d.x, F.z - d.z);
    d.friend = true; d.followT = rnd(25, 50);
    game.ui.toast(`<b>${d.name}</b> ${PET_LINES[(Math.random() * PET_LINES.length) | 0]}`, 'info', 4200);
    SFX.bark(game, d.x, d.z, 1.35, 1);
    if (!d.petted) {
      d.petted = true;
      const day = game.time?.day ?? 0;
      if (day !== this.karmaDay) { this.karmaDay = day; this.karmaN = 0; }
      if (this.karmaN < 3) {
        this.karmaN++;
        try { game.state.addStat('karma', 1, 'stray dog'); } catch { /* ignore */ }
        if (Math.random() < 0.25) {
          setTimeout(() => { try { game.ui.toast(CHARM_LINES[(Math.random() * CHARM_LINES.length) | 0], 'stat', 3500); game.state.addStat('cha', 0.2, 'stray dog'); } catch { /* ignore */ } }, 1400);
        }
      }
    }
  }

  // ------------------------------------------------------------ streaming
  stream() {
    const c = this.ctx, F = c.focus;
    for (const d of this.dogs.slice()) {
      const dist = c.distFocus(d.x, d.z);
      if (d.state === 'follow' && dist < 40) continue;
      if (dist > 120 && c.hidden(d.x, 0.5, d.z, 1, 80)) this.remove(d);
    }
    let want = WANT[c.district] ?? 0;
    if (c.rain) want = Math.min(want, 1);
    if (this.dogs.length >= Math.min(MAX, want)) return;
    const p = c.game.world.sidewalkPointNear(F.x, F.z, 40, 80);
    if (!p || !c.hidden(p.x, 0.5, p.z, 1.2, 75) || !c.free(p.x, p.z, 0.4)) return;
    if (!WANT[c.districtAt(p.x, p.z)]) return;
    if (this.dogs.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < 25)) return;
    this.spawn(p.x, p.z);
  }

  pickTarget(d) {
    const c = this.ctx, w = c.game.world, ph = c.game.physics;
    const cross = Math.random() < 0.1;
    for (let k = 0; k < 6; k++) {
      const p = w.sidewalkPointNear(d.x, d.z, cross ? 14 : 4, cross ? 28 : 14);
      if (!p) continue;
      if (ph.raycast(d.x, d.z, p.x, p.z, 0.4) < 1) continue;
      if (!cross) {
        // stay on the sidewalk unless we mean to cross
        let ok = true;
        for (const f of [0.25, 0.5, 0.75]) if (!c.onWalk(d.x + (p.x - d.x) * f, d.z + (p.z - d.z) * f)) { ok = false; break; }
        if (!ok) continue;
      }
      d.tx = p.x; d.tz = p.z; d.cross = cross;
      return true;
    }
    return false;
  }

  scare(x, z, r, kind) {
    for (const d of this.dogs) {
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd > r * (kind === 'gun' || kind === 'boom' ? 1 : 1.2)) continue;
      if (kind === 'gun' && d.friend && dd > 6 && Math.random() < 0.5) { d.state = 'bark'; d.t = 1.6; d.barkN = 3; d.barkT = 0; continue; }
      d.state = 'flee'; d.t = rnd(2.2, 3.4); d.friend = false; d.followT = 0;
      const a = Math.atan2(d.x - x, d.z - z) + rnd(-0.4, 0.4);
      d.tx = d.x + Math.sin(a) * 18; d.tz = d.z + Math.cos(a) * 18;
      SFX.whimper(this.ctx.game, d.x, d.z);
    }
  }

  // ------------------------------------------------------------ per frame
  move(d, tx, tz, v, dt) {
    const ph = this.ctx.game.physics;
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz);
    if (dist < 0.05) { d.v = 0; return dist; }
    d.yaw += angTo(d.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
    // walk where we face (turn first, then go) so it reads as a dog, not a hovercraft
    const facing = Math.cos(angTo(d.yaw, Math.atan2(dx, dz)));
    const sp = v * Math.max(0, facing);
    const st = Math.min(dist, sp * dt);
    const nx = d.x + Math.sin(d.yaw) * st, nz = d.z + Math.cos(d.yaw) * st;
    const r = ph.resolveCircle(nx, nz, 0.32 * d.scale);
    const moved = Math.hypot(r.x - d.x, r.z - d.z);
    d.x = r.x; d.z = r.z;
    d.v = moved / Math.max(dt, 1e-4);
    if (st > 0.001 && moved < st * 0.3) d.stuck += dt; else d.stuck = Math.max(0, d.stuck - dt);
    return dist;
  }

  update(dt) {
    const c = this.ctx, game = c.game, F = c.focus;
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 1.5; this.stream(); }
    for (const d of this.dogs) {
      d.t -= dt; d.barkCD -= dt;
      const pd = c.distFocus(d.x, d.z);
      const toP = Math.atan2(F.x - d.x, F.z - d.z);
      let wagHz = 2, wagAmp = 0.35, tailUp = 1, headX = 0, headY = 0;
      if (d.friend) { d.followT -= dt; if (d.followT <= 0 || c.inCar || pd > 30) d.friend = false; }
      // react to the player walking up
      if (!d.friend && pd < 7 && d.barkCD <= 0 && (d.state === 'wander' || d.state === 'idle' || d.state === 'sniff')) {
        d.barkCD = rnd(14, 26);
        if (Math.random() < 0.5) { d.state = 'bark'; d.t = rnd(1.4, 2.4); d.barkN = 2 + (Math.random() * 2 | 0); d.barkT = 0.2; }
        else if (!c.inCar && Math.random() < 0.6) { d.state = 'follow'; d.t = rnd(10, 22); }
      }
      if (d.friend && d.state !== 'happy' && d.state !== 'flee' && d.state !== 'bark') d.state = 'follow';
      switch (d.state) {
        case 'wander': {
          const dist = this.move(d, d.tx, d.tz, d.trot ? 2.9 : 1.4, dt);
          if (dist < 0.4 || d.stuck > 0.8 || d.t <= 0) {
            d.stuck = 0;
            const r = Math.random();
            if (r < 0.45) { d.state = 'sniff'; d.t = rnd(1.8, 4.5); } else { d.state = 'idle'; d.t = rnd(1, 3.5); }
          }
          break;
        }
        case 'sniff':
          d.v = 0; headX = 0.6 + Math.sin(c.t * 9) * 0.07; headY = Math.sin(c.t * 1.7) * 0.25; wagHz = 1.2; wagAmp = 0.2;
          if (d.t <= 0) this.next(d);
          break;
        case 'idle':
          d.v = 0; headY = Math.sin(c.t * 0.8 + d.x) * 0.5;
          if (d.t <= 0) this.next(d);
          break;
        case 'bark': {
          d.v = 0;
          d.yaw += angTo(d.yaw, toP) * Math.min(1, dt * 5);
          d.barkT -= dt;
          headX = -0.15;
          if (d.barkT <= 0 && d.barkN > 0) { d.barkN--; d.barkT = rnd(0.45, 0.7); d.barkPulse = 0.25; SFX.bark(game, d.x, d.z, 1 / d.scale, 2); }
          if (d.barkPulse > 0) { d.barkPulse -= dt; headX -= Math.sin((d.barkPulse / 0.25) * PI) * 0.35; }
          wagAmp = 0.15; tailUp = 1.3;
          if (d.t <= 0) { d.state = 'idle'; d.t = rnd(0.8, 2); }
          break;
        }
        case 'follow': {
          if (c.inCar || pd > 30 || (!d.friend && d.t <= 0)) { this.next(d); break; }
          const want = 2.2;
          if (pd > want) {
            const tx = F.x - Math.sin(toP) * want, tz = F.z - Math.cos(toP) * want;
            this.move(d, tx, tz, pd > 7 ? 6.5 : pd > 3.5 ? 4 : 1.8, dt);
            if (d.stuck > 1.2) { d.stuck = 0; d.friend = false; this.next(d); }
          } else { d.v = 0; d.yaw += angTo(d.yaw, toP) * Math.min(1, dt * 4); headX = -0.15; }
          wagHz = 7; wagAmp = 0.55;
          break;
        }
        case 'happy':
          d.v = 0; d.yaw += angTo(d.yaw, toP) * Math.min(1, dt * 6);
          wagHz = 11; wagAmp = 0.7; headX = -0.2 + Math.sin(c.t * 6) * 0.08;
          if (d.t <= 0) d.state = 'follow';
          break;
        case 'flee': {
          const dist = this.move(d, d.tx, d.tz, 6.5, dt);
          tailUp = -0.6; wagAmp = 0.05; headX = 0.15;
          if (dist < 0.6 || d.t <= 0 || d.stuck > 0.6) { d.stuck = 0; d.state = 'idle'; d.t = rnd(2, 4); }
          break;
        }
      }
      this.animate(d, dt, wagHz, wagAmp, tailUp, headX, headY);
    }
    // a bark at nothing every so often (mostly at night)
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = c.night > 0.5 ? rnd(12, 30) : rnd(25, 60);
      const d = this.dogs.find((q) => q.state === 'idle' || q.state === 'sniff');
      if (d) { d.state = 'bark'; d.t = rnd(1.2, 2); d.barkN = 2; d.barkT = 0.1; }
    }
  }

  next(d) {
    if (this.pickTarget(d)) { d.state = 'wander'; d.trot = Math.random() < 0.3 || d.cross; d.t = 12; }
    else { d.state = 'idle'; d.t = rnd(1, 3); }
  }

  animate(d, dt, wagHz, wagAmp, tailUp, headX, headY) {
    const R = d.rig, sp = Math.min(d.v, 7);
    d.ph += dt * (2 + sp * 4.2);
    const amp = Math.min(0.65, sp * 0.16);
    const s = Math.sin(d.ph) * amp;
    R.legs[0].rotation.x = s; R.legs[3].rotation.x = s;
    R.legs[1].rotation.x = -s; R.legs[2].rotation.x = -s;
    R.bodyP.position.y = Math.abs(Math.cos(d.ph)) * Math.min(0.03, sp * 0.006);
    R.bodyP.rotation.x = sp > 5 ? -0.05 : 0;
    d.wag += dt * wagHz * PI * 2;
    d.wagAmp += (wagAmp - d.wagAmp) * Math.min(1, dt * 4);
    d.tailUp += (tailUp - d.tailUp) * Math.min(1, dt * 4);
    R.tail.rotation.set(-0.55 * d.tailUp, Math.sin(d.wag) * d.wagAmp, 0);
    const k = Math.min(1, dt * 6);
    R.head.rotation.x += (headX - R.head.rotation.x) * k;
    R.head.rotation.y += (headY - R.head.rotation.y) * k;
    R.root.position.set(d.x, GROUND_Y, d.z);
    R.root.rotation.y = d.yaw;
  }
}
