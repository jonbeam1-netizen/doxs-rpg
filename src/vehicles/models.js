import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grimMaterial } from '../core/materials.js';
import { createStickman } from '../entities/stickman.js';
import { CARS } from '../data/cars.js';

// Procedural vehicle models. Every car is built once per model id from a side
// profile (extruded, bevelled body with real wheel arches) plus bolted-on
// detail boxes, then merged per material so an instance costs ~10 draw calls.
// Front of every vehicle = +Z, driver sits on the left (+X).

const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- materials
const M = {};
function mats() {
  if (M.trim) return M;
  M.trim = grimMaterial('#1d1b19', { rough: 0.8, grime: 0.5 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xe6e2da, metalness: 0.8, roughness: 0.2 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xe0b032, metalness: 0.85, roughness: 0.22, emissive: 0x2a1c00, emissiveIntensity: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0b1115, metalness: 0.5, roughness: 0.07, transparent: true, opacity: 0.58, depthWrite: false });
  M.head = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, emissive: 0xfff0c0, emissiveIntensity: 0.3, roughness: 0.3 });
  M.tailBase = new THREE.MeshStandardMaterial({ color: 0x4a0806, emissive: 0xff1a0a, emissiveIntensity: 0.4, roughness: 0.4 });
  M.rust = grimMaterial('#6b3a1e', { rough: 1, grime: 1 });
  M.primer = grimMaterial('#77746c', { rough: 1, grime: 0.7 });
  M.oxide = grimMaterial('#7a3b2c', { rough: 1, grime: 0.8 });
  M.interior = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.95 });
  M.seat = grimMaterial('#2a1f18', { rough: 0.7, grime: 0.6 });
  M.stripe = grimMaterial('#d8d2c2', { rough: 0.5, grime: 0.35 });
  M.plate = grimMaterial('#cfc8a8', { rough: 0.6, grime: 0.6 });
  M.curtain = grimMaterial('#3c2240', { rough: 1, grime: 0.4 });
  M.mattress = grimMaterial('#c9c0a0', { rough: 1, grime: 1 });
  M.lbRed = new THREE.MeshStandardMaterial({ color: 0x600000, emissive: 0xff1010, emissiveIntensity: 1.5 });
  M.lbBlue = new THREE.MeshStandardMaterial({ color: 0x000060, emissive: 0x1030ff, emissiveIntensity: 1.5 });
  M.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  M.charred = grimMaterial('#151210', { rough: 1, grime: 1 });
  M.charredWheel = new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 });
  return M;
}
export function sharedMats() { return mats(); }

const paintCache = new Map();
export function paintMaterial(color, tier = 'mid') {
  const key = color + '|' + tier;
  let m = paintCache.get(key);
  if (m) return m;
  if (tier === 'junk') m = grimMaterial(color, { rough: 0.85, metal: 0.1, grime: 0.95 });
  else if (tier === 'rich') m = grimMaterial(color, { rough: 0.26, metal: 0.45, grime: 0.12, streaks: false });
  else m = grimMaterial(color, { rough: 0.55, metal: 0.25, grime: 0.5 });
  paintCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------- geometry helpers
const _m4 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function nonIdx(g) { return g.index ? g.toNonIndexed() : g; }

function colorize(geo, hex) {
  geo = nonIdx(geo);
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function scaleUV(geo, k) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
}

class Parts {
  constructor() { this.g = {}; }
  add(k, geo) { (this.g[k] ||= []).push(geo); return geo; }
  _xf(g, x, y, z, rx, ry, rz) {
    if (rx || ry || rz) g.applyMatrix4(_m4.makeRotationFromEuler(_e.set(rx, ry, rz)));
    g.translate(x, y, z);
    return g;
  }
  box(k, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(k, this._xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz)); }
  cyl(k, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(k, this._xf(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz)); }
  sphere(k, sx, sy, sz, x, y, z) {
    const g = new THREE.SphereGeometry(1, 14, 10);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    return this.add(k, g);
  }
  torus(k, R, r, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(k, this._xf(new THREE.TorusGeometry(R, r, 6, 16), x, y, z, rx, ry, rz)); }
  // Box following a segment in the side (u = z, v = y) plane at lateral offset x.
  seg(k, u1, v1, u2, v2, x, tx, th) {
    const du = u2 - u1, dv = v2 - v1, len = Math.hypot(du, dv);
    const g = new THREE.BoxGeometry(tx, th, len);
    g.rotateX(-Math.atan2(dv, du));
    g.translate(x, (v1 + v2) / 2, (u1 + u2) / 2);
    return this.add(k, g);
  }
  tube(k, a, b, r, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    _q.setFromUnitVectors(_up, d.normalize());
    g.applyQuaternion(_q);
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return this.add(k, g);
  }
  build() {
    const out = {};
    for (const [k, list] of Object.entries(this.g)) {
      const prepared = list.map((g) => { const n = nonIdx(g); if (n !== g) g.dispose(); return n; });
      const merged = mergeGeometries(prepared, false);
      prepared.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      out[k] = merged;
    }
    return out;
  }
}

// ---------------------------------------------------------------- car specs
// u = along length (front +), v = height. top = roof/hood line from nose to tail.
// cabs = greenhouse trapezoids (glass) {a rear-base, b front-base, c rear-roof, d front-roof, belt, roof, w}.
export const SPECS = {
  sedan: {
    L: 4.5, W: 1.86, c: 0.28, R: 0.34, tw: 0.24, axles: [1.42, -1.38],
    top: [[2.25, 0.6], [2.16, 0.84], [1.6, 0.95], [0.72, 1.0], [-1.25, 1.0], [-1.95, 0.98], [-2.22, 0.88], [-2.25, 0.62]],
    cabs: [{ a: -1.22, b: 0.76, c: -0.86, d: 0.12, belt: 0.98, roof: 1.47, w: 0.9 }],
    seat: { u: -0.18, y: 0.5 }, hl: [0.74, 0.3], tl: 0.8, doors: 4,
  },
  hatch: {
    L: 3.85, W: 1.74, c: 0.26, R: 0.31, tw: 0.22, axles: [1.2, -1.2],
    top: [[1.92, 0.58], [1.84, 0.8], [1.35, 0.9], [0.58, 0.97], [-1.86, 0.97], [-1.92, 0.85], [-1.92, 0.6]],
    cabs: [{ a: -1.86, b: 0.6, c: -1.7, d: -0.02, belt: 0.95, roof: 1.5, w: 0.9 }],
    seat: { u: -0.3, y: 0.48 }, hl: [0.74, 0.28], tl: 0.82, doors: 2,
  },
  pickup: {
    L: 5.0, W: 1.98, c: 0.42, R: 0.4, tw: 0.3, axles: [1.62, -1.55],
    top: [[2.5, 0.82], [2.42, 1.1], [1.95, 1.18], [0.72, 1.22], [-0.42, 1.22], [-0.42, 1.0], [-2.5, 1.0]],
    cabs: [{ a: -0.4, b: 0.74, c: -0.36, d: 0.22, belt: 1.2, roof: 1.85, w: 0.9 }],
    seat: { u: 0.0, y: 0.72 }, hl: [0.95, 0.3], tl: 1.08, doors: 2,
    bed: { front: -0.42, back: -2.5, floor: 1.0, wall: 0.42 },
  },
  van: {
    L: 4.9, W: 2.0, c: 0.32, R: 0.36, tw: 0.26, axles: [1.62, -1.6],
    top: [[2.45, 0.72], [2.38, 1.0], [2.0, 1.12], [1.45, 1.2], [0.42, 1.2], [0.42, 2.08], [-2.45, 2.08], [-2.45, 0.6]],
    cabs: [{ a: 0.42, b: 1.46, c: 0.42, d: 1.0, belt: 1.18, roof: 2.04, w: 0.94 }],
    seat: { u: 0.72, y: 0.64 }, hl: [0.9, 0.3], tl: 1.2, doors: 1, cargo: true,
  },
  hearse: {
    L: 5.6, W: 1.96, c: 0.28, R: 0.36, tw: 0.25, axles: [1.85, -1.75],
    top: [[2.8, 0.64], [2.7, 0.9], [2.1, 1.0], [1.15, 1.05], [-2.5, 1.05], [-2.76, 0.98], [-2.8, 0.66]],
    cabs: [{ a: -2.72, b: 1.18, c: -2.58, d: 0.52, belt: 1.03, roof: 1.66, w: 0.9 }],
    seat: { u: 0.3, y: 0.52 }, hl: [0.76, 0.3], tl: 0.85, doors: 2,
  },
  limo: {
    L: 7.2, W: 1.96, c: 0.26, R: 0.35, tw: 0.25, axles: [2.6, -2.55],
    top: [[3.6, 0.6], [3.5, 0.84], [2.95, 0.95], [1.95, 1.0], [-2.85, 1.0], [-3.38, 0.98], [-3.58, 0.88], [-3.6, 0.62]],
    cabs: [{ a: -2.82, b: 1.98, c: -2.42, d: 1.28, belt: 0.98, roof: 1.44, w: 0.9 }],
    seat: { u: 1.1, y: 0.48 }, hl: [0.74, 0.3], tl: 0.8, doors: 6,
  },
  muscle: {
    L: 4.8, W: 1.96, c: 0.26, R: 0.36, tw: 0.32, axles: [1.55, -1.5],
    top: [[2.4, 0.6], [2.33, 0.86], [1.9, 0.94], [0.58, 0.99], [-1.28, 0.99], [-2.25, 0.97], [-2.4, 0.85], [-2.4, 0.6]],
    cabs: [{ a: -1.3, b: 0.6, c: -0.98, d: 0.0, belt: 0.97, roof: 1.39, w: 0.88 }],
    seat: { u: -0.36, y: 0.44 }, hl: [0.74, 0.32], tl: 0.8, doors: 2,
  },
  sports: {
    L: 4.5, W: 2.02, c: 0.2, R: 0.34, tw: 0.32, axles: [1.45, -1.42],
    top: [[2.25, 0.46], [2.16, 0.64], [1.6, 0.82], [0.5, 0.9], [-1.05, 0.92], [-1.95, 0.92], [-2.22, 0.86], [-2.25, 0.55]],
    cabs: [{ a: -1.1, b: 0.52, c: -0.6, d: -0.08, belt: 0.89, roof: 1.23, w: 0.84 }],
    seat: { u: -0.4, y: 0.3 }, hl: [0.6, 0.36], tl: 0.76, doors: 2,
  },
  military: {
    L: 6.2, W: 2.4, c: 0.62, R: 0.58, tw: 0.42, axles: [2.05, -0.7, -2.15],
    top: [[3.1, 1.25], [3.02, 1.62], [2.3, 1.78], [1.28, 1.82], [0.36, 1.82], [0.36, 2.78], [-3.1, 2.78], [-3.1, 1.2]],
    cabs: [{ a: 0.36, b: 1.3, c: 0.36, d: 0.95, belt: 1.8, roof: 2.62, w: 0.9 }],
    seat: { u: 0.72, y: 1.3 }, hl: [1.4, 0.35], tl: 1.45, doors: 2, cargo: true,
  },
};

// Side outline of the lower body with arches cut around each wheel.
export function bodyOutline(s) {
  const pts = [];
  const L2 = s.L / 2, c = s.c;
  const archR = s.R + 0.1;
  pts.push([-L2, c + 0.14], [-L2 + 0.14, c]);
  const axles = [...s.axles].sort((a, b) => a - b);
  for (const ax of axles) {
    const a0 = Math.asin(clamp((c - s.R) / archR, -1, 1));
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = (PI - a0) + ((a0) - (PI - a0)) * (i / N);
      pts.push([ax + archR * Math.cos(t), s.R + archR * Math.sin(t)]);
    }
  }
  pts.push([L2 - 0.14, c], [L2, c + 0.14]);
  for (const p of s.top) pts.push(p);
  return pts;
}

function topAt(s, u) {
  const t = s.top;
  for (let i = 0; i < t.length - 1; i++) {
    const [u1, v1] = t[i], [u2, v2] = t[i + 1];
    if ((u <= u1 && u >= u2) && u1 !== u2) return v1 + (v2 - v1) * ((u - u1) / (u2 - u1));
  }
  return t[0][1];
}

function extrudeSide(points, width, bev) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const depth = Math.max(0.01, width - bev * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 3, steps: 1,
  });
  g.rotateY(-PI / 2);
  g.translate(depth / 2, 0, 0);
  scaleUV(g, 0.35);
  return g;
}

// ---------------------------------------------------------------- wheels
function carWheelGeo(R, tw, rims = 'steel', hubcaps = false) {
  const list = [];
  const tire = new THREE.CylinderGeometry(R, R, tw, 22, 1);
  tire.rotateZ(PI / 2);
  list.push(colorize(tire, '#141312'));
  const wall = new THREE.TorusGeometry(R * 0.86, R * 0.12, 5, 22);
  for (const sx of [-1, 1]) {
    const w = wall.clone(); w.rotateY(PI / 2); w.translate(sx * tw * 0.42, 0, 0);
    list.push(colorize(w, '#1b1a19'));
  }
  const rimCol = { steel: '#4f4b46', chrome: '#d8d3ca', black: '#1f1f21', gold: '#d9a92c' }[rims] || '#4f4b46';
  const rim = new THREE.CylinderGeometry(R * 0.6, R * 0.6, tw + 0.02, 16);
  rim.rotateZ(PI / 2);
  list.push(colorize(rim, hubcaps ? '#b9b5ad' : rimCol));
  const spokes = rims === 'steel' && !hubcaps ? 2 : 5;
  for (let k = 0; k < spokes; k++) {
    const sp = new THREE.BoxGeometry(tw + 0.04, R * 1.12, rims === 'steel' ? 0.05 : 0.08);
    sp.rotateX((k * PI) / spokes);
    list.push(colorize(sp, rims === 'steel' ? '#2a2826' : rimCol === '#1f1f21' ? '#3a3a3c' : rimCol));
  }
  const hub = new THREE.CylinderGeometry(R * 0.16, R * 0.16, tw + 0.06, 8);
  hub.rotateZ(PI / 2);
  list.push(colorize(hub, rims === 'gold' ? '#f0c040' : '#77726a'));
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  wall.dispose();
  return g;
}

function bikeWheelGeo(R, thick) {
  const list = [];
  const tire = new THREE.TorusGeometry(R - thick, thick, 8, 26);
  tire.rotateY(PI / 2);
  list.push(colorize(tire, '#151413'));
  const rim = new THREE.TorusGeometry(R - thick * 2.1, 0.016, 4, 26);
  rim.rotateY(PI / 2);
  list.push(colorize(rim, '#8d8a84'));
  for (let k = 0; k < 8; k++) {
    const sp = new THREE.BoxGeometry(0.012, (R - thick * 2) * 2, 0.012);
    sp.rotateX((k * PI) / 8);
    list.push(colorize(sp, '#a5a29c'));
  }
  const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.11, 8);
  hub.rotateZ(PI / 2);
  list.push(colorize(hub, '#555'));
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g;
}

// ---------------------------------------------------------------- car builder
function buildCar(s, f) {
  const P = new Parts();
  const L2 = s.L / 2, W = s.W, W2 = W / 2;
  const cab = s.cabs[0];

  // Lower body.
  P.add('paint', extrudeSide(bodyOutline(s), W, 0.07));
  // Dark underside pan so you don't see daylight under the arches.
  P.box('trim', W - 0.2, 0.06, s.L - 0.5, 0, s.c + 0.04, 0);

  // Greenhouse.
  for (const cb of s.cabs) {
    const cw = W * (cb.w ?? 0.88);
    P.add('glass', extrudeSide([[cb.a, cb.belt - 0.04], [cb.b, cb.belt - 0.04], [cb.d, cb.roof], [cb.c, cb.roof]], cw, 0.03));
    P.box('paint', cw + 0.07, 0.08, (cb.d - cb.c) + 0.14, 0, cb.roof + 0.035, (cb.c + cb.d) / 2);
    for (const sx of [-1, 1]) {
      const x = sx * (cw / 2 + 0.012);
      P.seg('paint', cb.b, cb.belt, cb.d, cb.roof, x, 0.07, 0.09);
      P.seg('paint', cb.a, cb.belt, cb.c, cb.roof + 0.02, x, 0.07, s.cargo ? 0.06 : 0.16);
      const nb = s.cargo ? 0 : (f.pillars ?? (s.doors >= 4 ? 1 : 0));
      for (let i = 1; i <= nb; i++) {
        const t = i / (nb + 1);
        P.seg('paint', cb.a + (cb.b - cb.a) * t, cb.belt, cb.c + (cb.d - cb.c) * t, cb.roof, x, 0.07, 0.1);
      }
      // window frame bottom (belt trim)
      P.box(f.chromeTrim ? 'chrome' : 'trim', 0.03, 0.035, cb.b - cb.a, sx * (W2 + 0.005), cb.belt - 0.01, (cb.a + cb.b) / 2);
    }
    // windshield header
    P.box('paint', cw + 0.04, 0.06, 0.08, 0, cb.roof - 0.01, cb.d - 0.02);
  }

  // Interior: dash, seats, steering wheel (visible through the glass).
  const sx0 = W * 0.22;
  P.box('interior', W * 0.82, 0.22, 0.4, 0, cab.belt - 0.06, cab.b - 0.22);
  P.box('seat', 0.5, 0.14, 0.5, sx0, s.seat.y - 0.06, s.seat.u);
  P.box('seat', 0.5, 0.62, 0.12, sx0, s.seat.y + 0.24, s.seat.u - 0.3, -0.15);
  P.box('seat', 0.5, 0.14, 0.5, -sx0, s.seat.y - 0.06, s.seat.u);
  P.box('seat', 0.5, 0.62, 0.12, -sx0, s.seat.y + 0.24, s.seat.u - 0.3, -0.15);
  if (!s.cargo && s.doors >= 4 && cab.a < s.seat.u - 1.2) {
    P.box('seat', W * 0.8, 0.14, 0.5, 0, s.seat.y - 0.06, s.seat.u - 1.0);
    P.box('seat', W * 0.8, 0.55, 0.12, 0, s.seat.y + 0.2, s.seat.u - 1.3, -0.15);
  }
  const wheelU = s.seat.u + 0.5, wheelY = s.seat.y + 0.42;
  P.torus('trim', 0.17, 0.025, sx0, wheelY, wheelU, -0.5, 0, 0);
  P.tube('trim', [sx0, wheelY - 0.05, wheelU + 0.05], [sx0, cab.belt - 0.05, cab.b - 0.3], 0.025);

  // Nose & tail.
  const hy = s.hl[0], hx = W2 - s.hl[1];
  const noseZ = L2 + 0.07, tailZ = -L2 - 0.07;
  for (const sx of [-1, 1]) {
    P.box('head', 0.34, 0.14, 0.05, sx * hx, hy, noseZ + 0.005);
    P.box(f.chromeBumpers || f.chromeTrim ? 'chrome' : 'trim', 0.42, 0.2, 0.03, sx * hx, hy, noseZ - 0.012);
    P.box('tail', 0.3, 0.13, 0.05, sx * hx, s.tl, tailZ - 0.005);
  }
  P.box('trim', W * 0.4, 0.17, 0.04, 0, hy - 0.02, noseZ);
  if (f.chromeTrim || f.chromeBumpers) for (let i = -2; i <= 2; i++) P.box('chrome', 0.025, 0.15, 0.05, i * 0.13, hy - 0.02, noseZ + 0.005);
  const bk = f.chromeBumpers ? 'chrome' : 'trim';
  P.box(bk, W + 0.08, 0.17, 0.2, 0, s.c + 0.17, L2 + 0.08);
  P.box(bk, W + 0.08, 0.17, 0.2, 0, s.c + 0.17, -L2 - 0.08);
  P.box('plate', 0.44, 0.14, 0.02, 0, s.c + 0.4, tailZ - 0.01);
  P.box('plate', 0.44, 0.13, 0.02, 0, s.c + 0.17, L2 + 0.19);

  // Mirrors, door seams, handles.
  for (const sx of [-1, 1]) {
    P.box('paint', 0.16, 0.12, 0.08, sx * (W2 + 0.1), cab.belt + 0.08, cab.b - 0.25);
    P.box('trim', 0.12, 0.03, 0.03, sx * (W2 + 0.03), cab.belt + 0.04, cab.b - 0.22);
    const seams = [];
    if (s.cargo) seams.push(cab.b - 0.02, cab.a + 0.04);
    else if (s.doors >= 4) seams.push(cab.b - 0.05, (cab.a + cab.b) / 2 - 0.05, cab.a + 0.25);
    else seams.push(cab.b - 0.05, cab.a + 0.35);
    if (s.doors >= 6) seams.push((cab.a + cab.b) / 2 + 0.9, (cab.a + cab.b) / 2 - 1.0);
    const sh = cab.belt - s.c - 0.12;
    for (const u of seams) P.box('trim', 0.012, sh, 0.022, sx * (W2 + 0.002), s.c + 0.08 + sh / 2, u);
    for (let i = 0; i < seams.length - 1; i += s.cargo ? 2 : 1) {
      P.box(f.chromeTrim || f.chromeBumpers ? 'chrome' : 'trim', 0.03, 0.04, 0.16, sx * (W2 + 0.012), cab.belt - 0.14, seams[i] - 0.3);
    }
    if (f.chromeTrim) P.box('chrome', 0.02, 0.04, s.L * 0.8, sx * (W2 + 0.006), s.c + 0.3, 0);
  }

  // Exhaust.
  const ex = f.exhaust ?? 1;
  for (let i = 0; i < ex; i++) {
    const x = ex === 1 ? -W2 * 0.55 : (i ? -1 : 1) * W2 * 0.55;
    P.cyl(f.junk ? 'rust' : 'chrome', 0.05, 0.055, 0.32, 8, x, s.c + 0.04, -L2 - 0.08, PI / 2);
  }

  // ---- features ----
  if (f.junk) {
    // Primer patches, rust blooms, a mismatched door from the junkyard.
    const hoodU = Math.min(L2 - 0.6, (cab.b + L2) / 2 + 0.2);
    P.box('primer', 0.62, 0.014, 0.56, 0.25, topAt(s, hoodU) + 0.008, hoodU, 0, 0.2, 0);
    P.box('primer', 0.014, 0.28, 0.55, -(W2 + 0.006), s.c + 0.4, -L2 + 0.9);
    P.box('rust', 0.014, 0.16, 0.45, W2 + 0.006, s.c + 0.16, L2 - 0.75);
    P.box('rust', 0.014, 0.2, 0.3, -(W2 + 0.006), s.c + 0.18, -L2 + 0.35);
    P.box('rust', W * 0.5, 0.014, 0.3, -0.2, topAt(s, -L2 + 0.4) + 0.008, -L2 + 0.4);
    if (f.mismatchedDoor) {
      const du = (cab.b - cab.a) / 2;
      P.box('oxide', 0.016, cab.belt - s.c - 0.2, du - 0.06, W2 + 0.008, (s.c + 0.12 + cab.belt - 0.08) / 2, cab.b - du / 2 - 0.06);
    }
  }
  if (f.stripes) {
    for (const sx of [-0.22, 0.22]) {
      for (let i = 1; i < s.top.length - 1; i++) {
        const [u1, v1] = s.top[i - 1], [u2, v2] = s.top[i];
        if (u1 - u2 < 0.05) continue;
        P.seg('stripe', u1, v1 + 0.008, u2, v2 + 0.008, sx, 0.2, 0.016);
      }
      P.box('stripe', 0.2, 0.012, cab.d - cab.c + 0.1, sx, cab.roof + 0.08, (cab.c + cab.d) / 2);
    }
  }
  if (f.scoop) {
    const u = (cab.b + L2) / 2;
    const v = topAt(s, u);
    P.box('paint', 0.62, 0.14, 0.85, 0, v + 0.05, u, -0.04);
    P.box('trim', 0.5, 0.08, 0.03, 0, v + 0.08, u + 0.43);
  }
  if (f.spoiler === 'wing') {
    const v = topAt(s, -L2 + 0.3);
    for (const sx of [-0.62, 0.62]) P.box('trim', 0.06, 0.28, 0.14, sx, v + 0.12, -L2 + 0.3);
    P.box('paint', W * 0.92, 0.04, 0.34, 0, v + 0.28, -L2 + 0.24, 0.08);
    for (const sx of [-1, 1]) P.box('paint', 0.03, 0.16, 0.38, sx * W * 0.46, v + 0.26, -L2 + 0.24);
  } else if (f.spoiler === 'lip') {
    const v = topAt(s, -L2 + 0.15);
    P.box('paint', W * 0.86, 0.06, 0.16, 0, v + 0.04, -L2 + 0.13, 0.2);
  }
  if (f.sideIntakes) {
    for (const sx of [-1, 1]) P.box('trim', 0.03, 0.2, 0.55, sx * (W2 + 0.006), s.c + 0.38, cab.a + 0.1);
    P.box('trim', W * 0.7, 0.1, 0.05, 0, s.c + 0.18, L2 + 0.18);
  }
  if (f.lightbar) {
    const u = (cab.c + cab.d) / 2;
    P.box('trim', 1.3, 0.08, 0.26, 0, cab.roof + 0.11, u);
    P.box('lbRed', 0.55, 0.11, 0.22, 0.32, cab.roof + 0.19, u);
    P.box('lbBlue', 0.55, 0.11, 0.22, -0.32, cab.roof + 0.19, u);
  }
  if (f.pushbar) {
    for (const sx of [-0.45, 0.45]) P.box('trim', 0.07, 0.6, 0.07, sx, s.c + 0.35, L2 + 0.3);
    P.box('trim', 1.1, 0.07, 0.07, 0, s.c + 0.62, L2 + 0.3);
    P.box('trim', 1.1, 0.07, 0.07, 0, s.c + 0.2, L2 + 0.3);
  }
  if (f.twoTone) {
    const du = cab.b - cab.a;
    for (const sx of [-1, 1]) P.box('paint2', 0.016, cab.belt - s.c - 0.2, du * 0.92, sx * (W2 + 0.008), (s.c + 0.12 + cab.belt - 0.08) / 2, (cab.a + cab.b) / 2);
    P.box('paint2', W * 0.8, 0.012, 0.9, 0, cab.roof + 0.08, (cab.c + cab.d) / 2 - 0.6);
  }
  if (f.landau) {
    const cw = W * (cab.w ?? 0.88);
    for (const sx of [-1, 1]) {
      P.box('paint', 0.05, cab.roof - cab.belt + 0.02, 1.55, sx * (cw / 2 + 0.03), (cab.belt + cab.roof) / 2, cab.a + 0.95);
      P.seg('chrome', cab.a + 0.6, cab.belt + 0.25, cab.a + 0.95, cab.belt + 0.42, sx * (cw / 2 + 0.06), 0.03, 0.05);
      P.seg('chrome', cab.a + 0.95, cab.belt + 0.42, cab.a + 1.3, cab.belt + 0.25, sx * (cw / 2 + 0.06), 0.03, 0.05);
    }
  }
  if (f.curtains) {
    const cw = W * (cab.w ?? 0.88);
    P.box('curtain', cw - 0.12, cab.roof - cab.belt - 0.08, 0.04, 0, (cab.belt + cab.roof) / 2, s.seat.u - 0.45);
    for (const sx of [-1, 1]) P.box('curtain', 0.03, cab.roof - cab.belt - 0.12, 1.4, sx * (cw / 2 - 0.08), (cab.belt + cab.roof) / 2, s.seat.u - 1.3);
    // A coffin-shaped lump in the back. Don't ask.
    P.box('interior', 0.6, 0.35, 1.9, 0, cab.belt + 0.05, cab.a + 1.1);
  }
  if (s.bed) {
    const b = s.bed, bl = b.front - b.back, bm = (b.front + b.back) / 2;
    for (const sx of [-1, 1]) {
      P.box('paint', 0.08, b.wall, bl, sx * (W2 - 0.04), b.floor + b.wall / 2, bm);
      P.box('trim', 0.12, 0.04, bl, sx * (W2 - 0.04), b.floor + b.wall + 0.02, bm);
    }
    P.box('paint', W, b.wall, 0.08, 0, b.floor + b.wall / 2, b.front - 0.04);
    P.box('paint', W, b.wall, 0.08, 0, b.floor + b.wall / 2, b.back + 0.04);
    P.box(f.junk ? 'rust' : 'trim', W - 0.16, 0.02, bl - 0.12, 0, b.floor + 0.012, bm);
    if (f.mattress) P.box('mattress', 1.3, 0.16, 1.5, 0.05, b.floor + 0.32, bm + 0.1, 0.18, 0.12, 0.06);
  }
  if (f.roofRack) {
    const top = s.top.reduce((m, p) => Math.max(m, p[1]), 0);
    const u0 = s.cargo ? -L2 + 0.3 : cab.c, u1 = s.cargo ? 0.3 : cab.d;
    for (const sx of [-0.7, 0.7]) P.box('trim', 0.05, 0.05, u1 - u0, sx, top + 0.18, (u0 + u1) / 2);
    for (let u = u0 + 0.1; u < u1; u += 0.45) P.box('trim', 1.4, 0.04, 0.04, 0, top + 0.18, u);
    for (const u of [u0 + 0.1, u1 - 0.1]) for (const sx of [-0.7, 0.7]) P.box('trim', 0.04, 0.16, 0.04, sx, top + 0.1, u);
  }
  if (f.armor) {
    for (const sx of [-1, 1]) {
      P.box('paint', 0.07, 0.75, 3.1, sx * (W2 + 0.035), 2.0, -1.4);
      P.box('trim', 0.05, 0.08, 3.2, sx * (W2 + 0.06), 1.62, -1.4);
      for (let u = -2.8; u <= 0; u += 0.5) P.cyl('trim', 0.035, 0.035, 0.03, 6, sx * (W2 + 0.08), 2.25, u, 0, 0, PI / 2);
      // jerry cans
      P.box('paint', 0.18, 0.4, 0.3, sx * (W2 + 0.12), 1.5, -2.6);
    }
    // bull bar
    for (const sx of [-0.85, -0.3, 0.3, 0.85]) P.box('trim', 0.08, 0.9, 0.08, sx, 1.05, L2 + 0.32);
    P.box('trim', 2.0, 0.09, 0.09, 0, 1.45, L2 + 0.32);
    P.box('trim', 2.0, 0.09, 0.09, 0, 0.75, L2 + 0.32);
    // roof hatch & spare tire
    P.cyl('trim', 0.38, 0.4, 0.14, 12, 0, 2.86, -0.8);
    P.cyl('trim', 0.12, 0.12, 0.5, 8, 0, 3.05, -0.8, 0, 0, PI / 2);
    P.cyl('trim', 0.5, 0.5, 0.3, 14, 0, 1.75, -L2 - 0.2, PI / 2);
    // headlight cages
    for (const sx of [-1, 1]) P.box('trim', 0.42, 0.04, 0.12, sx * hx, hy + 0.12, noseZ + 0.06);
  }

  const R = s.R;
  const wheels = [];
  const front = Math.max(...s.axles);
  for (const u of s.axles) {
    for (const sx of [-1, 1]) wheels.push({ x: sx * (W2 - s.tw / 2 + 0.03), y: R, u, R, steer: u === front });
  }
  const seat = { x: sx0, y: s.seat.y, u: s.seat.u };
  const pedals = { y: s.c + 0.22, u: s.seat.u + 0.95 };
  const hands = { y: wheelY + 0.02, u: wheelU - 0.05 };
  return {
    geos: P.build(), wheels, wheelGeo: carWheelGeo(R, s.tw, f.rims || 'steel', f.hubcaps),
    seat, pedals, hands, dims: { L: s.L + 0.3, W: s.W }, bike: false, cab,
    lights: { head: [[hx, hy, noseZ + 0.1], [-hx, hy, noseZ + 0.1]], tail: [[hx, s.tl, tailZ], [-hx, s.tl, tailZ]], nose: noseZ, tailZ, hoodY: topAt(s, L2 - 0.6) },
  };
}

// ---------------------------------------------------------------- bikes
function buildBMX() {
  const P = new Parts(), F = new Parts(), C = new Parts();
  const R = 0.31;
  const bb = [0, 0.3, 0.0], seatT = [0, 0.8, -0.24], headT = [0, 0.86, 0.38], headB = [0, 0.64, 0.42];
  P.tube('paint', bb, seatT, 0.026);
  P.tube('paint', seatT, headT, 0.026);
  P.tube('paint', bb, headB, 0.03);
  P.tube('paint', headB, headT, 0.034);
  for (const sx of [-0.06, 0.06]) {
    P.tube('paint', [sx, R, -0.52], [sx * 0.4, 0.3, 0.0], 0.016);
    P.tube('paint', [sx, R, -0.52], [sx * 0.4, 0.78, -0.22], 0.016);
  }
  P.tube('chrome', [0, 0.8, -0.24], [0, 0.9, -0.28], 0.02);
  P.box('seat', 0.13, 0.05, 0.3, 0, 0.93, -0.29);
  for (const sx of [-0.11, 0.11]) P.cyl('chrome', 0.03, 0.03, 0.1, 6, sx, R, -0.52, 0, 0, PI / 2);
  P.cyl('chrome', 0.09, 0.09, 0.015, 14, -0.07, 0.3, 0, 0, 0, PI / 2);
  P.tube('trim', [-0.07, 0.3, 0], [-0.07, R, -0.52], 0.008);
  P.box('tail', 0.06, 0.04, 0.02, 0, 0.84, -0.42);
  // Front assembly (relative to the head-tube pivot).
  const fy = R - headT[1], fz = 0.52 - headT[2];
  for (const sx of [-0.05, 0.05]) F.tube('chrome', [sx, 0, 0], [sx, fy, fz], 0.016);
  F.tube('trim', [0, 0, 0], [0, 0.13, -0.02], 0.022);
  F.tube('chrome', [-0.3, 0.2, -0.04], [0.3, 0.2, -0.04], 0.016);
  for (const sx of [-0.12, 0.12]) F.tube('chrome', [sx, 0.11, -0.02], [sx * 1.25, 0.2, -0.04], 0.014);
  for (const sx of [-0.27, 0.27]) F.cyl('trim', 0.026, 0.026, 0.1, 6, sx, 0.2, -0.04, 0, 0, PI / 2);
  F.box('head', 0.07, 0.05, 0.03, 0, 0.08, 0.05);
  // Crank (spins with pedaling).
  C.box('trim', 0.02, 0.17, 0.03, 0.09, -0.085, 0);
  C.box('trim', 0.02, 0.17, 0.03, -0.09, 0.085, 0);
  C.box('trim', 0.1, 0.02, 0.07, 0.14, -0.17, 0);
  C.box('trim', 0.1, 0.02, 0.07, -0.14, 0.17, 0);
  const wg = bikeWheelGeo(R, 0.04);
  return {
    geos: P.build(), front: { pivot: headT, geos: F.build(), wheel: [0, fy, fz] }, crank: { pos: bb, geos: C.build() },
    wheels: [{ x: 0, y: R, u: -0.52, R, steer: false }], frontR: R, wheelGeo: wg,
    seat: { x: 0, y: 0.97, u: -0.28 }, tilt: 0.42, bike: true, pedal: true,
    hands: { L: [0.25, 0.2, -0.04], R: [-0.25, 0.2, -0.04] }, dims: { L: 1.75, W: 0.62 },
    lights: { head: [[0, 0.95, 0.45]], tail: [[0, 0.84, -0.45]], nose: 0.7, tailZ: -0.8, hoodY: 0.9 },
  };
}

function buildMoped() {
  const P = new Parts(), F = new Parts();
  const R = 0.25;
  P.box('trim', 0.34, 0.07, 0.66, 0, 0.3, -0.02);
  P.sphere('paint', 0.23, 0.25, 0.46, 0, 0.56, -0.5);
  P.box('paint', 0.24, 0.3, 0.36, 0, 0.44, -0.24);
  P.box('seat', 0.28, 0.1, 0.58, 0, 0.82, -0.4);
  P.box('paint', 0.46, 0.64, 0.05, 0, 0.62, 0.3, -0.22);
  P.box('tail', 0.14, 0.06, 0.04, 0, 0.66, -0.96);
  P.box('plate', 0.16, 0.1, 0.02, 0, 0.5, -0.97);
  P.tube('chrome', [-0.13, 0.26, -0.3], [-0.13, 0.3, -0.8], 0.03);
  P.box('trim', 0.18, 0.06, 0.22, 0, 0.73, -0.98);
  const pv = [0, 0.98, 0.36];
  const fy = R - pv[1], fz = 0.66 - pv[2];
  for (const sx of [-0.07, 0.07]) F.tube('trim', [sx, -0.12, 0.04], [sx, fy, fz], 0.025);
  F.tube('paint', [0, 0, 0], [0, -0.5, 0.12], 0.045);
  F.box('paint', 0.5, 0.1, 0.17, 0, 0.04, -0.02);
  F.box('head', 0.15, 0.1, 0.06, 0, 0.04, 0.08);
  for (const sx of [-0.29, 0.29]) F.cyl('trim', 0.026, 0.026, 0.12, 6, sx, 0.04, -0.03, 0, 0, PI / 2);
  for (const sx of [-0.2, 0.2]) {
    F.tube('chrome', [sx, 0.06, -0.02], [sx * 1.3, 0.28, -0.06], 0.01);
    F.box('chrome', 0.09, 0.06, 0.02, sx * 1.3, 0.3, -0.06);
  }
  F.box('paint', 0.16, 0.04, 0.42, 0, fy + R + 0.06, fz);
  return {
    geos: P.build(), front: { pivot: pv, geos: F.build(), wheel: [0, fy, fz] },
    wheels: [{ x: 0, y: R, u: -0.55, R, steer: false }], frontR: R, wheelGeo: carWheelGeo(R, 0.11, 'steel'),
    seat: { x: 0, y: 0.9, u: -0.42 }, tilt: 0.06, bike: true,
    feet: { L: [0.12, 0.36, 0.08], R: [-0.12, 0.36, 0.08] },
    hands: { L: [0.27, 0.06, -0.03], R: [-0.27, 0.06, -0.03] }, dims: { L: 1.7, W: 0.62 },
    lights: { head: [[0, 1.0, 0.5]], tail: [[0, 0.66, -0.98]], nose: 0.75, tailZ: -1.0, hoodY: 0.8 },
  };
}

function buildMoto() {
  const P = new Parts(), F = new Parts();
  const R = 0.34;
  P.box('trim', 0.34, 0.36, 0.5, 0, 0.5, 0.05);
  for (const sx of [-0.2, 0.2]) P.cyl('chrome', 0.1, 0.12, 0.2, 10, sx, 0.64, 0.14, 0, 0, PI / 2);
  P.sphere('paint', 0.24, 0.17, 0.44, 0, 0.94, 0.24);
  P.box('seat', 0.3, 0.1, 0.62, 0, 0.9, -0.33);
  P.box('paint', 0.26, 0.14, 0.44, 0, 0.98, -0.72, 0.18);
  P.box('tail', 0.13, 0.05, 0.04, 0, 0.98, -0.95);
  P.tube('trim', [0, 0.98, 0.58], [0, 0.56, -0.25], 0.035);
  P.tube('trim', [0, 0.66, 0.55], [0, 0.34, 0.15], 0.035);
  for (const sx of [-0.1, 0.1]) P.tube('trim', [sx, 0.42, -0.15], [sx, R, -0.74], 0.03);
  P.tube('chrome', [-0.18, 0.36, 0.22], [-0.2, 0.33, -0.48], 0.045);
  P.cyl('chrome', 0.06, 0.075, 0.42, 10, -0.2, 0.42, -0.72, PI / 2 + 0.25);
  P.box('paint', 0.18, 0.03, 0.36, 0, 0.77, -0.86, -0.3);
  for (const sx of [-0.18, 0.18]) P.cyl('trim', 0.02, 0.02, 0.12, 6, sx, 0.42, -0.12, 0, 0, PI / 2);
  const pv = [0, 1.02, 0.62];
  const fy = R - pv[1], fz = 0.94 - pv[2];
  for (const sx of [-0.08, 0.08]) F.tube('chrome', [sx, 0, 0], [sx, fy, fz], 0.03);
  F.sphere('paint', 0.27, 0.22, 0.24, 0, 0.0, 0.1);
  F.cyl('head', 0.09, 0.09, 0.05, 14, 0, -0.02, 0.32, PI / 2);
  F.box('glass', 0.32, 0.22, 0.02, 0, 0.2, 0.12, -0.5);
  F.tube('trim', [-0.33, 0.06, -0.12], [0.33, 0.06, -0.12], 0.017);
  F.box('paint', 0.14, 0.03, 0.42, 0, fy + R + 0.06, fz);
  return {
    geos: P.build(), front: { pivot: pv, geos: F.build(), wheel: [0, fy, fz] },
    wheels: [{ x: 0, y: R, u: -0.74, R, steer: false }], frontR: R, wheelGeo: carWheelGeo(R, 0.17, 'black'),
    seat: { x: 0, y: 0.97, u: -0.34 }, tilt: 0.6, bike: true,
    feet: { L: [0.2, 0.44, -0.1], R: [-0.2, 0.44, -0.1] },
    hands: { L: [0.3, 0.06, -0.12], R: [-0.3, 0.06, -0.12] }, dims: { L: 2.2, W: 0.72 },
    lights: { head: [[0, 1.0, 1.0]], tail: [[0, 0.98, -0.97]], nose: 1.05, tailZ: -1.0, hoodY: 0.95 },
  };
}

// ---------------------------------------------------------------- build cache
const BUILDS = new Map();
export function getBuild(carId) {
  const id = CARS[carId] ? carId : 'rustbucket';
  let b = BUILDS.get(id);
  if (b) return b;
  mats();
  const def = CARS[id];
  if (def.model === 'bmx') b = buildBMX();
  else if (def.model === 'moped') b = buildMoped();
  else if (def.model === 'moto') b = buildMoto();
  else b = buildCar(SPECS[def.model] || SPECS.sedan, def.features || {});
  BUILDS.set(id, b);
  return b;
}

function matFor(key, ctx) {
  switch (key) {
    case 'paint': return ctx.paint;
    case 'paint2': return ctx.paint2;
    case 'tail': return ctx.tail;
    case 'chrome': return ctx.gold ? M.gold : M.chrome;
    default: return M[key] || M.trim;
  }
}

// ---------------------------------------------------------------- stick-figure IK
function ik2(limb, dy, dz, l1, l2, bend) {
  const d = clamp(Math.hypot(dy, dz), 0.05, l1 + l2 - 1e-3);
  const dir = Math.atan2(-dz, -dy);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const b = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  limb.upper.rotation.set(dir - bend * a, 0, 0);
  limb.lower.rotation.set(bend * (PI - b), 0, 0);
}

// Pose the driver/rider so hands/feet reach targets given in body space.
function poseFigure(v, feetL, feetR, handL, handR) {
  const sm = v.driver, s = v.dScale, P = sm.parts, tilt = v.tilt;
  P.hips.rotation.set(tilt, 0, 0);
  P.hips.position.y = 0.95;
  P.torso.rotation.set(0, 0, 0);
  const r = v.driverRoot;
  const hy = r.y + 0.95 * s, hz = r.z;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const loc = (p) => {
    const dy = (p[1] - hy) / s, dz = (p[2] - hz) / s;
    return [dy * ct + dz * st, -dy * st + dz * ct];
  };
  let q = loc(feetL); ik2(P.legL, q[0], q[1], 0.45, 0.47, 1);
  q = loc(feetR); ik2(P.legR, q[0], q[1], 0.45, 0.47, 1);
  q = loc(handL); ik2(P.armL, q[0] - 0.62, q[1], 0.45, 0.47, -1);
  q = loc(handR); ik2(P.armR, q[0] - 0.62, q[1], 0.45, 0.47, -1);
  P.armL.upper.rotation.z = 0.12; P.armR.upper.rotation.z = -0.12;
  P.legL.upper.rotation.z = 0.06; P.legR.upper.rotation.z = -0.06;
}

// ---------------------------------------------------------------- public: mesh
// Returns a Group facing +Z. group.userData.vis holds animation handles.
export function createCarMesh(carId, color, { driver = true, driverColor = 0x1a1a1a, hat = null } = {}) {
  const id = CARS[carId] ? carId : 'rustbucket';
  const def = CARS[id];
  const B = getBuild(id);
  const col = color || def.color;
  const group = new THREE.Group();
  group.name = 'car:' + id;
  const body = new THREE.Group();
  group.add(body);
  const ctx = {
    paint: paintMaterial(col, def.tier),
    paint2: def.features?.twoTone ? paintMaterial(def.features.twoTone, 'mid') : paintMaterial(col, def.tier),
    tail: M.tailBase.clone(),
    gold: !!def.features?.gold,
  };
  const meshes = [];
  const addMeshes = (geos, parent) => {
    for (const [k, geo] of Object.entries(geos)) {
      const m = new THREE.Mesh(geo, matFor(k, ctx));
      m.userData.key = k;
      m.castShadow = k === 'paint' || k === 'trim';
      m.receiveShadow = k === 'paint';
      parent.add(m);
      meshes.push(m);
    }
  };
  addMeshes(B.geos, body);

  const wheels = [];
  const wheelParent = B.bike ? body : group;
  for (const w of B.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.u);
    const spin = new THREE.Mesh(B.wheelGeo, M.wheel);
    spin.castShadow = true;
    pivot.add(spin);
    wheelParent.add(pivot);
    wheels.push({ pivot, spin, R: w.R, steer: w.steer, ang: 0 });
    meshes.push(spin);
  }
  let front = null, crank = null;
  if (B.front) {
    front = new THREE.Group();
    front.position.set(...B.front.pivot);
    body.add(front);
    addMeshes(B.front.geos, front);
    const spin = new THREE.Mesh(B.wheelGeo, M.wheel);
    spin.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(...B.front.wheel);
    pivot.add(spin);
    front.add(pivot);
    wheels.push({ pivot, spin, R: B.frontR, steer: false, ang: 0 });
    meshes.push(spin);
  }
  if (B.crank) {
    crank = new THREE.Group();
    crank.position.set(...B.crank.pos);
    body.add(crank);
    addMeshes(B.crank.geos, crank);
  }

  // Driver / rider.
  const dScale = B.bike ? 1 : 0.8;
  const sm = createStickman({ color: driverColor, scale: dScale, eyes: B.bike, hat });
  sm.group.traverse((o) => { if (o.isMesh) o.castShadow = B.bike; });
  const driverRoot = new THREE.Vector3(B.seat.x, B.seat.y - 0.95 * dScale, B.seat.u);
  sm.group.position.copy(driverRoot);
  body.add(sm.group);
  sm.group.visible = !!driver;

  const vis = {
    id, def, body, wheels, front, crank, driver: sm, dScale, driverRoot, tilt: B.bike ? B.tilt : -0.12,
    tailMat: ctx.tail, paintMat: ctx.paint, meshes, bike: B.bike, build: B, pedalAng: 0, steerVis: 0, color: col,
  };
  group.userData.vis = vis;
  poseDriver(vis, 0);
  return group;
}

function poseDriver(v, steer) {
  const B = v.build;
  if (!B.bike) {
    const x = B.seat.x;
    const s = Math.sin(steer) * 0.12;
    poseFigure(v,
      [x + 0.12, B.pedals.y, B.pedals.u], [x - 0.12, B.pedals.y, B.pedals.u],
      [x + 0.15, B.hands.y + s, B.hands.u], [x - 0.15, B.hands.y - s, B.hands.u]);
    return;
  }
  const pv = B.front.pivot;
  const hand = (h) => {
    const c = Math.cos(steer), sn = Math.sin(steer);
    return [pv[0] + h[0] * c + h[2] * sn, pv[1] + h[1], pv[2] - h[0] * sn + h[2] * c];
  };
  let fl, fr;
  if (B.pedal) {
    const a = v.pedalAng, bb = B.crank.pos;
    fl = [0.14, bb[1] - 0.17 * Math.cos(a), bb[2] - 0.17 * Math.sin(a)];
    fr = [-0.14, bb[1] + 0.17 * Math.cos(a), bb[2] + 0.17 * Math.sin(a)];
  } else { fl = B.feet.L; fr = B.feet.R; }
  poseFigure(v, fl, fr, hand(B.hands.L), hand(B.hands.R));
}

// ---------------------------------------------------------------- co-op passengers
// Seat i of a car in body space (0 = driver, 1 = front passenger, 2/3 = back row). null for bikes.
export function passengerSeat(carId, i) {
  const B = getBuild(carId);
  if (B.bike || !(i >= 1)) return null;
  const s = B.seat;
  const x = (i % 2 === 1 ? -1 : 1) * s.x;
  return { x, y: s.y, u: i >= 2 ? s.u - 1.0 : s.u };
}

// Pose a stickman (scale PASSENGER_SCALE, parented to the car's vis.body) in seat i.
// aim = yaw relative to the car (radians, 0 = straight ahead) to lean out of the window and point a gun.
export const PASSENGER_SCALE = 0.8;
export function posePassenger(sm, carId, i, aim = null) {
  const B = getBuild(carId);
  const seat = passengerSeat(carId, i);
  if (!seat) return;
  const s = PASSENGER_SCALE;
  const root = new THREE.Vector3(seat.x, seat.y - 0.95 * s, seat.u);
  const v = { driver: sm, dScale: s, tilt: -0.12, driverRoot: root };
  const x = seat.x, du = seat.u - B.seat.u;
  poseFigure(v,
    [x + 0.12, B.pedals.y, B.pedals.u + du - 0.1], [x - 0.12, B.pedals.y, B.pedals.u + du - 0.1],
    [x + 0.16, seat.y + 0.2, seat.u + 0.3], [x - 0.16, seat.y + 0.2, seat.u + 0.3]);
  sm.group.position.copy(root);
  sm.group.rotation.set(0, 0, 0);
  if (aim == null) return;
  // Lean out: shift toward this side's window, rise a little, turn toward the target, arm out.
  const side = Math.sign(seat.x) || -1;
  const a = Math.atan2(Math.sin(aim), Math.cos(aim));
  sm.group.position.x += side * 0.4;
  sm.group.position.y += 0.34;
  sm.group.rotation.y = a;
  sm.group.rotation.z = -side * 0.18;
  const P = sm.parts;
  P.armR.upper.rotation.set(-Math.PI / 2 + 0.05, 0, -0.05);
  P.armR.lower.rotation.set(0, 0, 0);
  P.armL.upper.rotation.set(-0.4, 0, 0.5);
  P.armL.lower.rotation.set(-0.6, 0, 0);
}

// Spin wheels, steer, pedal. speed = signed forward speed (units/s), steer -1..1 (+ = left).
export function animateCarMesh(group, speed, steer, dt) {
  const v = group?.userData?.vis;
  if (!v) return;
  for (const w of v.wheels) {
    w.ang += (speed / w.R) * dt;
    w.spin.rotation.x = w.ang;
    if (w.steer) w.pivot.rotation.y = steer * 0.5;
  }
  v.steerVis += (steer - v.steerVis) * Math.min(1, dt * 10);
  if (v.front) v.front.rotation.y = v.steerVis * 0.45;
  if (v.crank) {
    v.pedalAng += (speed / 0.31) * dt * 0.45;
    v.crank.rotation.x = v.pedalAng;
  }
  if (v.driver.group.visible && (v.bike || Math.abs(v.steerVis) > 0.01 || v._lastSteer !== v.steerVis)) {
    poseDriver(v, v.steerVis * 0.45);
    v._lastSteer = v.steerVis;
  }
}

export function setCarPaint(group, color) {
  const v = group?.userData?.vis;
  if (!v) return;
  const m = paintMaterial(color, v.def.tier);
  for (const mesh of v.meshes) {
    if (mesh.userData.key === 'paint' || (mesh.userData.key === 'paint2' && !v.def.features?.twoTone)) mesh.material = m;
  }
  v.paintMat = m;
  v.color = color;
}

export function charCarMesh(group) {
  const v = group?.userData?.vis;
  if (!v) return;
  mats();
  for (const mesh of v.meshes) {
    const k = mesh.userData.key;
    if (k === 'glass') { mesh.visible = false; continue; }
    mesh.material = k ? M.charred : M.charredWheel;
  }
  v.driver.group.visible = false;
}

// ---------------------------------------------------------------- 2D profile (dealer UI)
export function drawCarProfile(canvas, carId, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#16130f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#221d17';
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
  const def = CARS[carId];
  if (!def) return;
  const col = color || def.color;
  const ground = H * 0.82;
  if (['bmx', 'moped', 'moto'].includes(def.model)) {
    const sc = H * 0.5;
    const cx = W / 2;
    const P = (u, v) => [cx + u * sc, ground - v * sc];
    const wheel = (u, R) => { const [x, y] = P(u, R); ctx.lineWidth = 6; ctx.strokeStyle = '#0c0b0a'; ctx.beginPath(); ctx.arc(x, y, R * sc, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#777'; ctx.stroke(); };
    const line = (a, b, w = 5, c = col) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); };
    if (def.model === 'bmx') {
      wheel(-0.52, 0.31); wheel(0.52, 0.31);
      line([0, 0.3], [-0.24, 0.8]); line([-0.24, 0.8], [0.38, 0.86]); line([0, 0.3], [0.42, 0.64]); line([-0.52, 0.31], [0, 0.3]); line([-0.52, 0.31], [-0.22, 0.78]);
      line([0.38, 0.86], [0.52, 0.31], 4, '#bbb'); line([0.38, 0.86], [0.36, 1.05], 4, '#bbb'); line([-0.36, 0.93], [-0.18, 0.93], 6, '#2a1f18');
    } else if (def.model === 'moped') {
      wheel(-0.55, 0.25); wheel(0.66, 0.25);
      line([-0.3, 0.3], [0.3, 0.3], 8, '#222'); line([-0.85, 0.55], [-0.15, 0.55], 18); line([-0.7, 0.82], [-0.12, 0.82], 8, '#2a1f18');
      line([0.3, 0.32], [0.38, 0.92], 10); line([0.36, 0.98], [0.66, 0.25], 4, '#555'); line([0.25, 1.0], [0.5, 1.0], 6);
    } else {
      wheel(-0.74, 0.34); wheel(0.94, 0.34);
      line([-0.2, 0.5], [0.3, 0.5], 22, '#222'); line([-0.05, 0.94], [0.6, 0.94], 16); line([-0.9, 0.95], [-0.05, 0.9], 8, '#2a1f18');
      line([-0.74, 0.34], [-0.1, 0.42], 5, '#222'); line([0.62, 1.02], [0.94, 0.34], 5, '#ccc'); line([0.55, 1.02], [0.85, 1.02], 14);
      line([-0.2, 0.33], [-0.85, 0.42], 6, '#ccc');
    }
    return;
  }
  const s = SPECS[def.model] || SPECS.sedan;
  const maxV = Math.max(...s.top.map((p) => p[1]), ...s.cabs.map((c) => c.roof));
  const sc = Math.min((W * 0.8) / s.L, (H * 0.7) / maxV);
  const cx = W / 2;
  const P = (u, v) => [cx + u * sc, ground - v * sc];
  const poly = (pts, fill, stroke) => {
    ctx.beginPath();
    pts.forEach(([u, v], i) => { const [x, y] = P(u, v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  for (const cb of s.cabs) poly([[cb.a, cb.belt], [cb.b, cb.belt], [cb.d, cb.roof], [cb.c, cb.roof]], '#1c262c', col);
  poly(bodyOutline(s), col, '#0b0a09');
  // shine line
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath();
  s.top.forEach(([u, v], i) => { const [x, y] = P(u, v - 0.05); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.stroke();
  const rimCol = { steel: '#4f4b46', chrome: '#d8d3ca', black: '#2a2a2c', gold: '#d9a92c' }[def.features?.rims] || '#4f4b46';
  for (const u of s.axles) {
    const [x, y] = P(u, s.R);
    ctx.fillStyle = '#0d0c0b'; ctx.beginPath(); ctx.arc(x, y, s.R * sc, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rimCol; ctx.beginPath(); ctx.arc(x, y, s.R * sc * 0.58, 0, Math.PI * 2); ctx.fill();
  }
  const [hx, hy] = P(s.L / 2 - 0.05, s.hl[0]);
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(hx - 6, hy - 4, 8, 8);
  const [tx, ty] = P(-s.L / 2, s.tl);
  ctx.fillStyle = '#d0281a'; ctx.fillRect(tx - 2, ty - 4, 6, 8);
}
