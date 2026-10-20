import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUND_Y, bez, bezD, makePath, pathClear, colored, rnd, angTo } from './common.js';
import { SFX } from './sfx.js';

// Pigeons (sidewalk flocks + the odd one on a lamp or bus-stop roof), crows (Dustbowl
// pole tops, by day) and gulls (circling the docks / island piers, perched on bollards).
// One shared bird rig drawn with three InstancedMeshes (body, left wing, right wing).

const MAX = 80;
const PI = Math.PI;
const KIND = {
  pigeon: { s: 1, speed: 8.5, walk: 0.42, fear: 1, cols: [[0.29, 0.3, 0.34], [0.24, 0.25, 0.29], [0.37, 0.37, 0.4], [0.18, 0.17, 0.19], [0.34, 0.29, 0.26], [0.27, 0.28, 0.32]] },
  crow: { s: 1.3, span: 1.2, speed: 8, walk: 0.55, fear: 1.5, cols: [[0.07, 0.07, 0.08], [0.1, 0.1, 0.11]] },
  gull: { s: 1.5, span: 1.75, speed: 9, walk: 0.5, fear: 1.3, cols: [[0.88, 0.88, 0.86], [0.8, 0.82, 0.82]] },
};
// ground pigeon flocks wanted around the player, by district
const PIGEON_FLOCKS = { downtown: 4, gutterside: 3, rustyards: 2, hilltop: 2, dustbowl: 1, blackwater: 0 };
const CROW_POLES = { dustbowl: 5, rustyards: 2, gutterside: 1 };
const PIERS = [-420, -170, 160, 410];

function buildGeo() {
  const body = mergeGeometries([
    colored(new THREE.SphereGeometry(0.09, 10, 7).scale(1, 0.85, 1.55).translate(0, 0.135, 0), [1, 1, 1]),
    colored(new THREE.SphereGeometry(0.052, 8, 6).translate(0, 0.225, 0.115), [0.72, 0.74, 0.8]),
    colored(new THREE.ConeGeometry(0.014, 0.045, 5).rotateX(PI / 2).translate(0, 0.218, 0.178), [0.85, 0.65, 0.25]),
    colored(new THREE.BoxGeometry(0.075, 0.014, 0.12).rotateX(-0.25).translate(0, 0.14, -0.17), [0.75, 0.75, 0.78]),
    colored(new THREE.BoxGeometry(0.012, 0.07, 0.012).translate(0.028, 0.035, 0.01), [0.8, 0.45, 0.42]),
    colored(new THREE.BoxGeometry(0.012, 0.07, 0.012).translate(-0.028, 0.035, 0.01), [0.8, 0.45, 0.42]),
  ]);
  // left wing spans +x from the shoulder, swept back and tapered, dark tips
  const wl = new THREE.BoxGeometry(0.21, 0.01, 0.11, 3, 1, 1).translate(0.105, 0, -0.03);
  const pos = wl.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), k = x / 0.21;
    pos.setZ(i, pos.getZ(i) * (1 - 0.45 * k) - 0.03 * k);
    const c = 0.82 - 0.5 * Math.max(0, k - 0.55) / 0.45;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  wl.setAttribute('color', new THREE.BufferAttribute(col, 3));
  wl.computeVertexNormals();
  const wr = wl.clone().scale(-1, 1, 1);
  return { body, wl, wr };
}

const _sp = new THREE.Vector3();
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _x = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const P = { x: 0, y: 0, z: 0 }, D = { x: 0, y: 0, z: 0 };

export class Birds {
  constructor(ctx) {
    this.ctx = ctx;
    const g = ctx.game;
    const { body, wl, wr } = buildGeo();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const wmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
    this.meshes = [new THREE.InstancedMesh(body, mat, MAX), new THREE.InstancedMesh(wl, wmat, MAX), new THREE.InstancedMesh(wr, wmat, MAX)];
    for (const m of this.meshes) {
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.setRGB(1, 1, 1));
      m.name = 'life:birds';
      g.scene.add(m);
    }
    this.birds = [];
    this.flocks = [];
    this.taken = new Set(); // occupied perch keys
    this.streamT = 0.5;
    this.cawT = rnd(6, 14);
    this.gullT = rnd(5, 12);
    this.colorDirty = false;
  }

  clear() {
    this.birds.length = 0; this.flocks.length = 0; this.taken.clear();
    for (const m of this.meshes) m.count = 0;
  }

  // ------------------------------------------------------------ spawning
  add(kind, x, y, z, state) {
    if (this.birds.length >= MAX) return null;
    const K = KIND[kind];
    const b = {
      kind, K, x, y, z, yaw: Math.random() * PI * 2, pitch: 0, roll: 0, fold: state === 'fly' || state === 'circle' ? 0 : 1,
      ph: Math.random() * 6, amp: 0, hz: 0, dih: 0, state, act: 'idle', actT: rnd(0.2, 2), tx: x, tz: z, fast: 1, pecks: 0, peckT: 0,
      path: null, land: null, delay: 0, flock: null, perch: null, circ: null, flapT: rnd(0, 6), legs: 0,
      s: K.s * rnd(0.92, 1.08), col: K.cols[(Math.random() * K.cols.length) | 0], ext: 0,
    };
    this.birds.push(b);
    this.colorDirty = true;
    return b;
  }

  remove(b) {
    const i = this.birds.indexOf(b);
    if (i >= 0) { this.birds[i] = this.birds[this.birds.length - 1]; this.birds.pop(); this.colorDirty = true; }
    if (b.flock) { const a = b.flock.birds, j = a.indexOf(b); if (j >= 0) a.splice(j, 1); b.flock = null; }
    if (b.perch) { this.taken.delete(b.perch.key); b.perch = null; }
  }

  walkable(surface, x, z) {
    const c = this.ctx;
    if (surface === 'walk' && !c.onWalk(x, z)) return false;
    if (surface === 'pier' && c.game.world.isWater?.(x, z)) return false;
    return c.free(x, z, 0.12);
  }

  spawnFlock(kind, x, z, n, surface = 'walk') {
    const f = { kind, cx: x, cz: z, r: kind === 'pigeon' ? 2.2 : 3, surface, birds: [], cooT: rnd(3, 10), npcT: rnd(0, 0.5) };
    for (let i = 0; i < n; i++) {
      let px = x, pz = z;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * f.r;
        const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
        if (this.walkable(surface, qx, qz)) { px = qx; pz = qz; break; }
      }
      const b = this.add(kind, px, GROUND_Y, pz, 'ground');
      if (!b) break;
      b.flock = f; f.birds.push(b);
    }
    if (f.birds.length) this.flocks.push(f);
    return f;
  }

  perchAt(kind, spot) {
    if (this.taken.has(spot.key)) return null;
    const b = this.add(kind, spot.x, spot.y, spot.z, 'perch');
    if (!b) return null;
    b.perch = spot; this.taken.add(spot.key);
    b.yaw = spot.yaw ?? b.yaw;
    return b;
  }

  // gull circling a zone centre
  circleGull(z0, start = false) {
    const c = { cx: z0.x + rnd(-6, 6), cz: z0.z + rnd(-6, 6), cy: rnd(11, 19), R: rnd(9, 20), w: (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.42), ang: Math.random() * PI * 2, seed: Math.random() * 9 };
    const x = c.cx + Math.cos(c.ang) * c.R, z = c.cz + Math.sin(c.ang) * c.R;
    if (start && !this.ctx.hidden(x, c.cy, z, 2, 110)) {
      // in plain view: glide in from far out over the water instead of popping in
      const cam = this.ctx.game.camera.position;
      let dx = c.cx - cam.x, dz = c.cz - cam.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const sx = c.cx + dx * 110, sz = c.cz + dz * 110, sy = c.cy + 14;
      const b = this.add('gull', sx, sy, sz, 'fly');
      if (!b) return null;
      b.circ = c; b.land = 'circle';
      b.path = makePath({}, sx, sy, sz, x, c.cy, z, 1);
      return b;
    }
    const b = this.add('gull', x, c.cy, z, 'circle');
    if (b) b.circ = c;
    return b;
  }

  // ------------------------------------------------------------ perch spots
  lampSpots() {
    const out = [];
    for (const L of this.ctx.props.lamps) out.push({ key: 'l' + L.x.toFixed(1) + ',' + L.z.toFixed(1), x: L.x, y: L.h, z: L.z, yaw: Math.random() * PI * 2 });
    return out;
  }
  busRoofSpots() {
    const out = [], F = this.ctx.focus;
    for (const s of this.ctx.game.world.seats ?? []) {
      if (s.kind !== 'busstop') continue;
      if (Math.abs(s.x - F.x) > 75 || Math.abs(s.z - F.z) > 75) continue;
      const f = s.facing, cx = s.x + Math.sin(f) * 0.45, cz = s.z + Math.cos(f) * 0.45;
      const ax = Math.cos(f), az = -Math.sin(f); // roof's long axis
      for (const t of [-1.2, -0.35, 0.6, 1.35]) {
        const n = rnd(-0.4, 0.35);
        out.push({ key: 'b' + cx.toFixed(1) + ',' + cz.toFixed(1) + t, x: cx + ax * t + Math.sin(f) * n, y: 2.55, z: cz + az * t + Math.cos(f) * n, yaw: f + (Math.random() < 0.5 ? 0 : PI) + rnd(-0.6, 0.6), group: cx + ',' + cz });
      }
    }
    return out;
  }
  poleSpots() {
    return this.ctx.props.poles.map((L) => ({ key: 'p' + L.x.toFixed(1) + ',' + L.z.toFixed(1), x: L.x, y: L.h, z: L.z, yaw: Math.random() * PI * 2 }));
  }
  bollardSpots() {
    const out = [], F = this.ctx.focus;
    if (F.x < 540 || F.x > 760) return out;
    for (const pz of PIERS) {
      if (Math.abs(pz - F.z) > 120) continue;
      for (let x = 624; x < 688; x += 8) for (const s of [-1, 1]) out.push({ key: 'g' + x + ',' + pz + s, x, y: 0.7, z: pz + s * 4.5, yaw: Math.random() * PI * 2 });
    }
    return out;
  }
  gullZones() {
    const out = [];
    for (const pz of PIERS) out.push({ x: 662, z: pz });
    const isl = this.ctx.game.world.island?.spots;
    if (isl?.pier) out.push({ x: isl.pier.x + 8, z: isl.pier.z1 + 6 });
    if (isl?.ferry) out.push({ x: (isl.ferry.x0 + isl.ferry.x1) / 2, z: isl.ferry.z - 12 });
    return out;
  }

  // ------------------------------------------------------------ streaming
  stream() {
    const c = this.ctx, F = c.focus, d = c.district;
    const dayish = c.night < 0.55;
    // drop far / surplus stuff that nobody can see
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      if (!f.birds.length) { this.flocks.splice(i, 1); continue; }
      const dist = c.distFocus(f.cx, f.cz);
      const gone = dist > 130 || (dist > 40 && (!dayish || (c.rain && Math.random() < 0.15)));
      if (gone && f.birds.every((b) => b.state === 'ground' && c.hidden(b.x, 0.2, b.z, 1, 90))) { for (const b of f.birds.slice()) this.remove(b); this.flocks.splice(i, 1); }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      if (b.flock || b.state === 'fly') continue;
      const ox = b.circ ? b.circ.cx : b.x, oz = b.circ ? b.circ.cz : b.z;
      const dist = c.distFocus(ox, oz);
      const far = b.state === 'circle' ? 240 : 120;
      const offShift = (b.kind === 'crow' && !dayish) || (b.kind === 'gull' && b.state === 'perch' && !dayish);
      if ((dist > far || (offShift && dist > 30)) && c.hidden(b.x, b.y, b.z, 1.5, b.state === 'circle' ? 140 : 90)) this.remove(b);
    }

    let n = 0;
    // pigeon flocks on sidewalks / by benches
    let want = dayish ? (PIGEON_FLOCKS[d] ?? 1) : 0;
    if (c.rain) want = Math.round(want * 0.34);
    else if (c.weather === 'fog' || c.weather === 'smog') want = Math.max(0, want - 1);
    n = this.flocks.filter((f) => f.kind === 'pigeon' && c.distFocus(f.cx, f.cz) < 110).length;
    if (n < want) this.trySpawnPigeons();
    // perched pigeons (they roost on lamps at night and sit out the rain up there)
    want = d === 'blackwater' ? 0 : dayish ? (c.rain ? 3 : 2) : 1;
    n = this.birds.filter((b) => b.kind === 'pigeon' && b.state === 'perch' && c.distFocus(b.x, b.z) < 100).length;
    if (n < want) {
      const spots = (Math.random() < 0.45 ? this.busRoofSpots() : this.lampSpots()).filter((s) => { const dd = c.distFocus(s.x, s.z); return dd > 14 && dd < 75 && !this.taken.has(s.key) && c.hidden(s.x, s.y, s.z, 1, 70); });
      if (spots.length) {
        const s = spots[(Math.random() * spots.length) | 0];
        this.perchAt('pigeon', s);
        if (s.group) for (const s2 of spots) if (s2.group === s.group && s2 !== s && Math.random() < 0.5) this.perchAt('pigeon', s2);
      }
    }
    // crows on pole tops (Dustbowl by day) + a little ground gang
    want = dayish ? (CROW_POLES[d] ?? 0) : 0;
    if (c.rain) want = Math.ceil(want / 2);
    n = this.birds.filter((b) => b.kind === 'crow' && b.state === 'perch' && c.distFocus(b.x, b.z) < 110).length;
    if (n < want) {
      const spots = this.poleSpots().filter((s) => { const dd = c.distFocus(s.x, s.z); return dd > 12 && dd < 85 && !this.taken.has(s.key) && c.hidden(s.x, s.y, s.z, 1, 75); });
      if (spots.length) this.perchAt('crow', spots[(Math.random() * spots.length) | 0]);
    }
    if (d === 'dustbowl' && dayish && !c.rain) {
      n = this.flocks.filter((f) => f.kind === 'crow' && c.distFocus(f.cx, f.cz) < 110).length;
      if (n < 1) {
        const p = c.game.world.sidewalkPointNear(F.x, F.z, 25, 70);
        if (p && c.hidden(p.x, 0.3, p.z, 3, 70) && this.farFromFlocks(p.x, p.z)) this.spawnFlock('crow', p.x, p.z, 3 + (Math.random() * 3 | 0));
      }
    }
    // gulls over the water
    const zones = this.gullZones().filter((zz) => c.distFocus(zz.x, zz.z) < 230);
    if (zones.length) {
      want = Math.min(8, zones.length * (dayish ? (c.rain ? 1 : 3) : 1));
      n = this.birds.filter((b) => b.kind === 'gull' && (b.state === 'circle' || (b.state === 'fly' && b.land === 'circle'))).length;
      if (n < want) { zones.sort((a, b) => c.distFocus(a.x, a.z) - c.distFocus(b.x, b.z)); this.circleGull(zones[(Math.random() * Math.min(3, zones.length)) | 0], true); }
    }
    if (dayish && !c.rain) {
      const spots = this.bollardSpots();
      if (spots.length) {
        n = this.birds.filter((b) => b.kind === 'gull' && b.state === 'perch').length;
        if (n < 3) {
          const ok = spots.filter((s) => !this.taken.has(s.key) && c.distFocus(s.x, s.z) > 12 && c.hidden(s.x, s.y, s.z, 1, 70));
          if (ok.length) this.perchAt('gull', ok[(Math.random() * ok.length) | 0]);
        }
      }
    }
  }

  farFromFlocks(x, z, r = 16) { return this.flocks.every((f) => Math.hypot(f.cx - x, f.cz - z) > r); }

  trySpawnPigeons() {
    const c = this.ctx, F = c.focus, w = c.game.world;
    let p = null;
    if (Math.random() < 0.55) {
      const seats = (w.seats ?? []).filter((s) => { const dd = Math.hypot(s.x - F.x, s.z - F.z); return dd > 22 && dd < 75; });
      for (let k = 0; k < 4 && seats.length && !p; k++) {
        const s = seats[(Math.random() * seats.length) | 0];
        const dd = rnd(1.3, 2.4), a = s.facing + rnd(-0.5, 0.5);
        const x = s.x + Math.sin(a) * dd, z = s.z + Math.cos(a) * dd;
        if (this.walkable('walk', x, z)) p = { x, z };
      }
    }
    if (!p) p = w.sidewalkPointNear(F.x, F.z, 22, 75);
    if (!p || !c.hidden(p.x, 0.3, p.z, 3, 70) || !this.farFromFlocks(p.x, p.z)) return;
    if (c.districtAt(p.x, p.z) === 'blackwater') return;
    this.spawnFlock('pigeon', p.x, p.z, 4 + (Math.random() * 6 | 0));
  }

  // ------------------------------------------------------------ fleeing
  // Whole flock bolts from (tx, tz): relocate along the street, or leave for good.
  scatter(f, tx, tz, leave = false) {
    if (!f.birds.length) return;
    const c = this.ctx, w = c.game.world;
    let dest = null, apex = 0;
    if (!leave) {
      const ax = f.cx - tx, az = f.cz - tz, al = Math.hypot(ax, az) || 1;
      for (let k = 0; k < 7 && !dest; k++) {
        const p = w.sidewalkPointNear(f.cx + (ax / al) * 25, f.cz + (az / al) * 25, 0, 30);
        if (!p) continue;
        const dd = Math.hypot(p.x - f.cx, p.z - f.cz);
        if (dd < 14 || ((p.x - tx) * ax + (p.z - tz) * az) < 0) continue;
        if (c.threat(p.x, p.z, 3) > 0) continue;
        for (const ap of [3 + dd * 0.12, 7 + dd * 0.2, 14 + dd * 0.25]) {
          const path = makePath({}, f.cx, 0.2, f.cz, p.x, GROUND_Y, p.z, ap);
          if (pathClear(c, path)) { dest = p; apex = ap; break; }
        }
      }
    }
    const g = dest ? { kind: f.kind, cx: dest.x, cz: dest.z, r: f.r, surface: f.surface, birds: [], cooT: rnd(5, 12), npcT: 0 } : null;
    if (g) this.flocks.push(g);
    for (const b of f.birds.slice()) {
      b.flock = null;
      b.delay = rnd(0, 0.3);
      if (g) {
        let px = dest.x, pz = dest.z;
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * g.r;
          const qx = dest.x + Math.cos(a) * r, qz = dest.z + Math.sin(a) * r;
          if (this.walkable(g.surface, qx, qz)) { px = qx; pz = qz; break; }
        }
        b.path = makePath(b.path ?? {}, b.x, b.y, b.z, px, GROUND_Y, pz, apex * rnd(0.9, 1.15));
        b.state = 'fly'; b.land = 'ground'; b.flock = g; g.birds.push(b);
      } else this.flyLeave(b, tx, tz);
    }
    const nb = f.birds.length;
    f.birds.length = 0;
    SFX.flap(c.game, f.cx, f.cz, nb);
  }

  // fly up and away out of the area for good
  flyLeave(b, tx, tz) {
    const c = this.ctx;
    let ax = b.x - tx, az = b.z - tz, al = Math.hypot(ax, az);
    if (al < 0.5) { const a = Math.random() * PI * 2; ax = Math.cos(a); az = Math.sin(a); al = 1; }
    const a = Math.atan2(ax, az) + rnd(-0.6, 0.6), dist = rnd(55, 75);
    const ex = b.x + Math.sin(a) * dist, ez = b.z + Math.cos(a) * dist;
    let ey = rnd(24, 34);
    const path = makePath(b.path ?? {}, b.x, b.y, b.z, ex, ey, ez, 4);
    if (!pathClear(c, path, 6)) { ey += 30; makePath(path, b.x, b.y, b.z, ex, ey, ez, 6); }
    b.path = path; b.state = 'fly'; b.land = 'leave'; b.ext = 0;
    if (b.perch) { this.taken.delete(b.perch.key); b.perch = null; }
    if (b.flock) { const arr = b.flock.birds, j = arr.indexOf(b); if (j >= 0) arr.splice(j, 1); b.flock = null; }
  }

  // short flutter hop to dodge feet
  hop(b) {
    const f = b.flock; if (!f) return;
    const F = this.ctx.focus;
    let ax = b.x - F.x, az = b.z - F.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    for (let k = 0; k < 5; k++) {
      const a = Math.atan2(ax, az) + rnd(-0.9, 0.9), d = rnd(1.8, 3.2);
      const x = b.x + Math.sin(a) * d, z = b.z + Math.cos(a) * d;
      if (!this.walkable(f.surface, x, z)) continue;
      b.path = makePath(b.path ?? {}, b.x, b.y, b.z, x, GROUND_Y, z, rnd(0.5, 0.9));
      b.state = 'fly'; b.land = 'ground'; b.delay = 0; b.hopping = true;
      return;
    }
    this.scatter(f, F.x, F.z);
  }

  // perched bird bolts: pigeons/crows find another perch or leave, gulls take to the sky
  bolt(b, tx, tz, loud = false) {
    const c = this.ctx;
    if (b.kind === 'gull') {
      const zs = this.gullZones().sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      const circ = { cx: zs[0].x, cz: zs[0].z, cy: rnd(11, 17), R: rnd(9, 18), w: (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.4), ang: 0, seed: Math.random() * 9 };
      circ.ang = Math.atan2(b.z - circ.cz, b.x - circ.cx);
      const ex = circ.cx + Math.cos(circ.ang) * circ.R, ez = circ.cz + Math.sin(circ.ang) * circ.R;
      if (b.perch) { this.taken.delete(b.perch.key); b.perch = null; }
      b.path = makePath(b.path ?? {}, b.x, b.y, b.z, ex, circ.cy, ez, 2);
      b.state = 'fly'; b.land = 'circle'; b.circ = circ; b.delay = rnd(0, 0.2);
      return;
    }
    if (!loud && b.kind === 'crow') {
      const spots = this.poleSpots().filter((s) => { const dd = Math.hypot(s.x - b.x, s.z - b.z); return dd > 20 && dd < 75 && !this.taken.has(s.key) && Math.hypot(s.x - tx, s.z - tz) > 15; });
      for (let k = 0; k < 3 && spots.length; k++) {
        const s = spots.splice((Math.random() * spots.length) | 0, 1)[0];
        const path = makePath({}, b.x, b.y, b.z, s.x, s.y, s.z, 3);
        if (!pathClear(c, path, 6)) continue;
        if (b.perch) this.taken.delete(b.perch.key);
        b.perch = s; this.taken.add(s.key);
        b.path = path; b.state = 'fly'; b.land = 'perch'; b.delay = rnd(0, 0.25);
        SFX.caw(c.game, b.x, b.z);
        return;
      }
    }
    this.flyLeave(b, tx, tz);
    if (b.kind === 'crow') SFX.caw(c.game, b.x, b.z);
  }

  // event scare (gunshot, a body dropping, an explosion)
  scare(x, z, r, kind) {
    const loud = kind === 'gun' || kind === 'boom';
    for (const f of this.flocks.slice()) {
      if (!f.birds.length || Math.hypot(f.cx - x, f.cz - z) > r) continue;
      this.scatter(f, x, z, loud && Math.random() < 0.55);
    }
    for (const b of this.birds.slice()) {
      if (b.state !== 'perch' || Math.hypot(b.x - x, b.z - z) > r * (loud ? 1 : 0.6)) continue;
      this.bolt(b, x, z, loud);
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const c = this.ctx;
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 0.8; this.stream(); }
    // NPC feet: pigeons waddle out of pedestrians' way
    const npcs = c.game.npcs;
    for (const f of this.flocks) {
      f.npcT -= dt;
      if (f.npcT > 0 || !f.birds.length || c.distFocus(f.cx, f.cz) > 80) continue;
      f.npcT = 0.45;
      let near = null;
      try { near = npcs?.near?.(f.cx, f.cz, f.r + 2.5); } catch { near = null; }
      if (near?.length) for (const b of f.birds) {
        if (b.state !== 'ground') continue;
        for (const n of near) {
          const dx = b.x - n.pos.x, dz = b.z - n.pos.z, dd = Math.hypot(dx, dz);
          if (dd > 1.0) continue;
          const tx = b.x + (dx / (dd || 1)) * 1.1, tz = b.z + (dz / (dd || 1)) * 1.1;
          if (this.walkable(f.surface, tx, tz)) { b.act = 'walk'; b.tx = tx; b.tz = tz; b.fast = 2.4; b.actT = 1.5; }
          else if (dd < 0.6) this.hop(b);
          break;
        }
      }
      // the odd coo when you're standing around them
      f.cooT -= 0.45;
      if (f.cooT <= 0) { f.cooT = rnd(5, 13); if (f.kind === 'pigeon' && c.distFocus(f.cx, f.cz) < 12) SFX.coo(c.game, f.cx, f.cz); }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      if (!b) continue;
      switch (b.state) {
        case 'ground': this.ground(b, dt); break;
        case 'fly': this.fly(b, dt); break;
        case 'perch': this.perched(b, dt); break;
        case 'circle': this.circle(b, dt); break;
      }
    }
    // the odd caw / gull cry
    this.cawT -= dt;
    if (this.cawT <= 0) {
      this.cawT = rnd(7, 18);
      const crows = this.birds.filter((b) => b.kind === 'crow');
      if (crows.length) { const b = crows[(Math.random() * crows.length) | 0]; SFX.caw(c.game, b.x, b.z); b.callT = 0.8; }
    }
    this.gullT -= dt;
    if (this.gullT <= 0) {
      this.gullT = rnd(4, 11);
      const gulls = this.birds.filter((b) => b.kind === 'gull');
      if (gulls.length) { const b = gulls[(Math.random() * gulls.length) | 0]; SFX.gull(c.game, b.x, b.z); }
    }
    this.write();
  }

  ground(b, dt) {
    const c = this.ctx, f = b.flock;
    b.fold += (1 - b.fold) * Math.min(1, dt * 8);
    b.amp *= Math.max(0, 1 - dt * 10);
    const lv = c.threat(b.x, b.z, b.K.fear);
    if (lv === 2 && f) { if (c.distFocus(b.x, b.z) < 1.4 && !c.inCar && c.speed < 6.8 && Math.random() < 0.6) this.hop(b); else this.scatter(f, c.focus.x, c.focus.z); return; }
    if (lv === 1 && b.fast < 2 && f) {
      const dx = b.x - c.focus.x, dz = b.z - c.focus.z, d = Math.hypot(dx, dz) || 1;
      const tx = b.x + (dx / d) * 1.4, tz = b.z + (dz / d) * 1.4;
      if (this.walkable(f.surface, tx, tz)) { b.act = 'walk'; b.tx = tx; b.tz = tz; b.fast = 2.6; b.actT = 2; }
      else { this.hop(b); return; }
    }
    b.actT -= dt;
    if (b.act === 'walk') {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      const v = b.K.walk * b.fast;
      if (d < 0.04) { b.act = 'idle'; b.actT = rnd(0.2, 1.2); b.fast = 1; }
      else {
        b.yaw += angTo(b.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
        const st = Math.min(d, v * dt);
        b.x += (dx / d) * st; b.z += (dz / d) * st;
        b.legs += dt * v * 30;
        b.pitch = 0.06 + Math.sin(b.legs) * 0.07; // head bob
        if (b.actT < -3) { b.act = 'idle'; b.fast = 1; }
      }
    } else if (b.act === 'peck') {
      b.peckT += dt;
      const k = Math.min(1, b.peckT / 0.26);
      b.pitch = Math.sin(k * PI) * 0.6;
      if (k >= 1) { if (b.pecks-- > 0) { b.peckT = -rnd(0.05, 0.3); } else { b.act = 'idle'; b.actT = rnd(0.3, 1.6); } }
      if (b.peckT < 0) b.pitch = 0;
    } else {
      b.pitch *= Math.max(0, 1 - dt * 8);
      if (b.actT <= 0 && f) {
        const r = Math.random();
        if (r < 0.45) { b.act = 'peck'; b.pecks = Math.random() * 3 | 0; b.peckT = 0; }
        else if (r < 0.8) {
          const a = Math.random() * PI * 2, rr = Math.sqrt(Math.random()) * f.r;
          const tx = f.cx + Math.cos(a) * rr, tz = f.cz + Math.sin(a) * rr;
          if (Math.hypot(tx - b.x, tz - b.z) < 2.5 && this.walkable(f.surface, tx, tz)) { b.act = 'walk'; b.tx = tx; b.tz = tz; b.fast = 1; b.actT = 0; }
          else b.actT = rnd(0.3, 1);
        } else { b.yaw += rnd(-1.2, 1.2); b.actT = rnd(0.5, 2); }
      }
    }
    b.y = GROUND_Y;
    b.roll = 0;
  }

  fly(b, dt) {
    const c = this.ctx, p = b.path;
    if (b.delay > 0) {
      b.delay -= dt;
      b.fold += (0 - b.fold) * Math.min(1, dt * 12);
      b.amp = 0.6; b.hz = 9; b.dih = 0.2; b.ph += dt * b.hz * PI * 2;
      return;
    }
    bezD(p, p.s, D);
    const sp = Math.hypot(D.x, D.y, D.z) || 1;
    const landing = b.land === 'ground' || b.land === 'perch';
    let v = (b.hopping ? 3 : b.K.speed) * (0.5 + 0.5 * Math.min(1, p.s * 5));
    if (landing && p.s > 0.75) v *= 1 - 0.5 * (p.s - 0.75) / 0.25;
    p.s = Math.min(1, p.s + (v * dt) / sp);
    bez(p, p.s, P);
    b.x = P.x; b.y = P.y; b.z = P.z;
    const hl = Math.hypot(D.x, D.z);
    if (hl > 0.01) b.yaw += angTo(b.yaw, Math.atan2(D.x, D.z)) * Math.min(1, dt * 9);
    b.pitch += (-Math.atan2(D.y, hl) * 0.55 - b.pitch) * Math.min(1, dt * 6);
    b.roll *= Math.max(0, 1 - dt * 4);
    b.fold += (0 - b.fold) * Math.min(1, dt * 12);
    const climb = D.y / sp;
    if (b.hopping || climb > 0.12 || p.s < 0.18 || (landing && p.s > 0.82)) { b.amp = 1.05; b.hz = b.kind === 'gull' ? 5 : 10; b.dih = 0.15; }
    else { b.amp += (0.1 - b.amp) * Math.min(1, dt * 5); b.hz = 2.5; b.dih = 0.18; }
    b.ph += dt * b.hz * PI * 2;
    if (p.s < 1) return;
    b.hopping = false;
    if (b.land === 'ground') { b.state = 'ground'; b.act = 'idle'; b.actT = rnd(0.3, 1.2); b.fast = 1; b.pitch = 0; }
    else if (b.land === 'perch') { b.state = 'perch'; b.pitch = 0; b.actT = rnd(1, 3); if (b.perch) { b.x = b.perch.x; b.y = b.perch.y; b.z = b.perch.z; } }
    else if (b.land === 'circle') { b.state = 'circle'; }
    else {
      // leaving: keep going until nobody can see us, then vanish
      if (b.ext > 3 || c.hidden(b.x, b.y, b.z, 1, 70)) { this.remove(b); return; }
      b.ext++;
      const yaw = b.yaw;
      makePath(p, b.x, b.y, b.z, b.x + Math.sin(yaw) * 45, b.y + 8, b.z + Math.cos(yaw) * 45, 1);
    }
  }

  perched(b, dt) {
    const c = this.ctx;
    b.fold += (1 - b.fold) * Math.min(1, dt * 8);
    b.pitch *= Math.max(0, 1 - dt * 6);
    b.amp *= Math.max(0, 1 - dt * 10);
    b.roll = 0;
    b.actT -= dt;
    if (b.actT <= 0) { b.actT = rnd(1.2, 4.5); b.yaw += rnd(-1, 1); }
    if (b.callT > 0) { b.callT -= dt; b.pitch = -0.25 + Math.sin(b.callT * 20) * 0.1; }
    // low perches (bollards) spook like the ground; lamps and poles only for gunfire
    const hy = b.y < 3 ? 1 : 0.55;
    const lv = c.threat(b.x, b.z, b.K.fear * hy);
    if (lv === 2 && (b.y < 3 || b.kind === 'crow')) this.bolt(b, c.focus.x, c.focus.z);
  }

  circle(b, dt) {
    const k = b.circ;
    k.ang += k.w * dt;
    const t = this.ctx.t;
    const y = k.cy + Math.sin(t * 0.25 + k.seed) * 2.2;
    const x = k.cx + Math.cos(k.ang) * k.R, z = k.cz + Math.sin(k.ang) * k.R;
    const vx = -Math.sin(k.ang) * k.w, vz = Math.cos(k.ang) * k.w;
    b.x = x; b.y = y; b.z = z;
    b.yaw = Math.atan2(vx, vz);
    // bank into the turn (inner wing down)
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    const side = rx * (k.cx - x) + rz * (k.cz - z);
    b.roll += ((side > 0 ? -0.32 : 0.32) - b.roll) * Math.min(1, dt * 2);
    b.pitch = 0.02;
    b.fold = 0;
    b.flapT -= dt;
    if (b.flapT < 0) { if (b.flapT < -1.3) b.flapT = rnd(4, 9); b.amp = 0.9; b.hz = 4.2; }
    else { b.amp += (0.06 - b.amp) * Math.min(1, dt * 3); b.hz = 1.2; }
    b.dih = 0.14;
    b.ph += dt * b.hz * PI * 2;
  }

  write() {
    const [body, wl, wr] = this.meshes, n = this.birds.length;
    for (let i = 0; i < n; i++) {
      const b = this.birds[i];
      _e.set(b.pitch, b.yaw, b.roll); _q.setFromEuler(_e);
      _p.set(b.x, b.y, b.z); _s.setScalar(b.s);
      _m.compose(_p, _q, _s);
      body.setMatrixAt(i, _m);
      const flap = b.amp * Math.sin(b.ph) + b.dih;
      const fz = flap * (1 - b.fold) - 0.18 * b.fold, fy = 1.42 * b.fold, fx = -1.35 * b.fold, sx = 0.055 + 0.015 * b.fold;
      _x.makeRotationX(fx);
      _sp.set(1 + ((b.K.span ?? 1) - 1) * (1 - 0.45 * b.fold), 1, 1);
      _t.makeRotationY(fy).multiply(_r.makeRotationZ(fz)).multiply(_x).scale(_sp).setPosition(sx, 0.175, 0.03);
      wl.setMatrixAt(i, _w.multiplyMatrices(_m, _t));
      _t.makeRotationY(-fy).multiply(_r.makeRotationZ(-fz)).multiply(_x).scale(_sp).setPosition(-sx, 0.175, 0.03);
      wr.setMatrixAt(i, _w.multiplyMatrices(_m, _t));
      if (this.colorDirty) { _c.setRGB(b.col[0], b.col[1], b.col[2], THREE.SRGBColorSpace); body.setColorAt(i, _c); wl.setColorAt(i, _c); wr.setColorAt(i, _c); }
    }
    for (const m of this.meshes) {
      m.count = n; m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true;
      if (this.colorDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.colorDirty = false;
  }
}
