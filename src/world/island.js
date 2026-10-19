import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';
import { WorldGeo, lin, mulCol, mixCol } from './geo.js';
import { fbm } from './roads.js';
import * as P from './props.js';
import { locSign } from './landmarks.js';
import { mass } from './buildings.js';
import {
  ISLE, ISLE_X0, ISLE_MAX_X, coastR, coastPoint, isLand, COVE_TH, LAND_X, BRIDGE, TOLL_X, SPOTS, DECKS, PEN_X, RING_N,
} from './island-layout.js';

// Blackwater Isle geometry: ground, shoreline/cliffs, the drawbridge, Funland,
// the prison, lighthouse, fishing village, piers, cove and the sea collision.
// Everything static goes through the shared WorldGeo (merged per chunk); only
// the Ferris wheel, its gondolas and the lighthouse beam are live objects.

const PI = Math.PI, TAU = PI * 2;
const angDist = (a, b) => { let d = Math.abs(a - b) % TAU; return d > PI ? TAU - d : d; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Facing helpers: rotation that turns local +Z (the "front") toward a world direction.
const FACE = { s: 0, e: PI / 2, n: PI, w: -PI / 2 };

// 1 = rocky cliff shore (north + east), 0 = beach/mud (south + west)
function cliffness(th) {
  return smooth(-2.95, -2.65, th) * (1 - smooth(0.1, 0.4, th));
}

// Up-facing quad with per-vertex colors; fixes the winding so the normal points up.
function upQuad(g, mat, a, b, c, d, cols, uvScale = 10) {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
  const ny = uz * vx - ux * vz;
  if (ny >= 0) g.quad(mat, a, b, c, d, 'world', null, { uvScale, colors: cols });
  else g.quad(mat, d, c, b, a, 'world', null, { uvScale, colors: [cols[3], cols[2], cols[1], cols[0]] });
}

export function buildIsland(C) {
  const g = C.geo;
  const prevR = C.rng;
  C.rng = mulberry32(0x15_1A_4D ^ 0xB1AC);
  const doors = {};
  const live = [];
  g.reset();
  try {
    ground(C);
    shore(C);
    bridge(C);
    tollPlaza(C);
    ferries(C);
    stiltVillage(C);
    doors.funland_arcade = funland(C, live);
    doors.blackwater_pen = prison(C);
    doors.blackwater_light = lighthouse(C, live);
    doors.rusty_hook = rustyHook(C);
    doors.driftwood_shack = beachShack(C);
    doors.blackwater_pier = fishingPier(C);
    doors.smugglers_cove = cove(C);
    beachJunk(C);
    benches(C);
    seaCollision(C);
  } catch (e) { console.error('[world] island build failed', e); }
  g.reset();
  C.rng = prevR;
  return { doors, live };
}

// ------------------------------------------------------------------ ground
const NA = 192, NR = 14;
function ground(C) {
  const g = C.geo; g.identity();
  const { cx, cz } = ISLE;
  const pts = [];
  for (let i = 0; i <= NA; i++) {
    const th = -PI + (i / NA) * TAU;
    const R = coastR(th), cl = cliffness(th);
    const row = [];
    for (let k = 0; k <= NR; k++) {
      const f = k / NR;
      // denser rings near the coast
      const rr = R * (1 - (1 - f) * (1 - f));
      const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
      const edge = R - rr;
      const n = fbm(x / 45, z / 45);
      let col = mixCol('#4c4a36', '#5a4e3a', n);
      const shoreBand = 1 - smooth(4, 20, edge);
      col = mixCol(col, cl > 0.5 ? '#55514a' : '#8a7c5c', shoreBand);
      const k2 = 0.8 + fbm(x / 13, z / 13) * 0.4;
      row.push({ p: [x, 0, z], c: [col[0] * k2, col[1] * k2, col[2] * k2] });
    }
    pts.push(row);
  }
  for (let i = 0; i < NA; i++) for (let k = 0; k < NR; k++) {
    const a = pts[i][k], b = pts[i + 1][k], c = pts[i + 1][k + 1], d = pts[i][k + 1];
    upQuad(g, 'ground', a.p, b.p, c.p, d.p, [a.c, b.c, c.c, d.c]);
  }
}

// ------------------------------------------------------------------ shoreline: beaches, mud, cliffs, crags
function shore(C) {
  const g = C.geo, r = C.rng;
  const N = 240;
  for (let i = 0; i < N; i++) {
    const t0 = -PI + (i / N) * TAU, t1 = -PI + ((i + 1) / N) * TAU;
    const tm = (t0 + t1) / 2, cl = cliffness(tm);
    const [x0, z0] = coastPoint(t0), [x1, z1] = coastPoint(t1);
    g.identity();
    if (cl < 0.5) {
      // sloping sand / mud into the oily water
      const out = 11;
      const [ox0, oz0] = coastPoint(t0, out), [ox1, oz1] = coastPoint(t1, out);
      const wet = lin('#3a3428'), sand = lin(angDist(tm, PI) < 0.6 ? '#5e5442' : '#7e6f52');
      upQuad(g, 'ground', [x0, 0, z0], [x1, 0, z1], [ox1, -2.6, oz1], [ox0, -2.6, oz0], [sand, sand, wet, wet], 8);
    } else {
      // vertical rock face + boulders on the rim + sea crags
      const yt = 0.25, yb = -6;
      const nx = Math.cos(tm), nz = Math.sin(tm);
      const A = [x0 + nx * 0.6, yb, z0 + nz * 0.6], B = [x1 + nx * 0.6, yb, z1 + nz * 0.6], Ct = [x1, yt, z1], D = [x0, yt, z0];
      // ensure the face normal points outward: n = (B-A) x (Ct-A)
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [Ct[0] - A[0], Ct[1] - A[1], Ct[2] - A[2]];
      const flip = (u[1] * v[2] - u[2] * v[1]) * nx + (u[0] * v[1] - u[1] * v[0]) * nz < 0;
      const rock = '#4e4a44';
      if (!flip) g.quad('props', A, B, Ct, D, [0, 0, 1, 0, 1, 1, 0, 1], rock); else g.quad('props', B, A, D, Ct, [0, 0, 1, 0, 1, 1, 0, 1], rock);
      if (r() < 0.22) P.rock(C, x0 - nx * 1.2 + (r() - 0.5) * 2, z0 - nz * 1.2 + (r() - 0.5) * 2, 0.9 + r() * 1.4);
      if (r() < 0.5) {
        // big crag in the water
        const d = 3 + r() * 10, s = 3 + r() * 6 * cl;
        const cx = x0 + nx * d, cz = z0 + nz * d;
        g.frame(cx, cz, r() * 6); g.rotX((r() - 0.5) * 0.4);
        g.sphere('props', 0, -1.5, 0, s, 7, 5, { color: r() < 0.5 ? '#3e3a34' : '#4a443c', sy: 0.8 + r() * 1.3 });
        if (r() < 0.35) { g.frame(cx + (r() - 0.5) * 3, cz + (r() - 0.5) * 3, r() * 6); g.sphere('props', 0, s * 0.7, 0, s * 0.55, 6, 4, { color: '#36332e', sy: 1.6 }); }
      }
    }
  }
  // Tall sea stacks off the north cliffs (silhouettes from the city)
  for (const th of [-2.0, -1.55, -1.2, -0.75, -0.35]) {
    const [x, z] = coastPoint(th, 18 + r() * 14);
    g.frame(x, z, r() * 6);
    const h = 9 + r() * 9;
    g.cyl('props', 0, h / 2 - 2, 0, 2 + r() * 2, 5 + r() * 3, h + 4, 7, { color: '#3a3630' });
    g.sphere('props', 0, h - 2, 0, 2.6, 6, 3, { color: '#33302a', half: true });
  }
}

// ------------------------------------------------------------------ the rusty drawbridge
function bridge(C) {
  const g = C.geo;
  const x0 = 620, x1 = LAND_X + 1, W = BRIDGE.hw * 2 + 0.6;
  g.identity();
  for (let x = x0; x < x1; x += 30) {
    const xe = Math.min(x1, x + 30), cx = (x + xe) / 2, L = xe - x;
    g.identity();
    g.box('w_concrete', cx, -0.75, 0, L, 1.5, W, { faces: 'all', uvScale: [12, 14], color: '#6e6a62' });
    // rails (metal) + kick curbs
    for (const s of [-1, 1]) {
      g.box('metal', cx, 1.05, s * (BRIDGE.hw - 0.2), L, 0.12, 0.12, { color: '#5a3a26' });
      g.box('metal', cx, 0.6, s * (BRIDGE.hw - 0.2), L, 0.08, 0.08, { color: '#5a3a26' });
      g.box('props', cx, 0.15, s * (BRIDGE.hw - 0.25), L, 0.3, 0.4, { color: '#6a665e' });
    }
  }
  for (let x = x0; x < x1; x += 2) for (const s of [-1, 1]) g.box('metal', x, 0.55, s * (BRIDGE.hw - 0.2), 0.08, 1.1, 0.08, { color: '#4a3020' });
  // physics rails (water blocks the rest)
  for (const s of [-1, 1]) C.solid(x0, s > 0 ? BRIDGE.hw - 0.45 : -BRIDGE.hw, x1, s > 0 ? BRIDGE.hw : -BRIDGE.hw + 0.45, 1.1);
  // piers into the water
  for (let x = x0 + 22; x < x1 - 8; x += 36) {
    for (const s of [-1, 1]) g.cyl('w_concrete', x, -6, s * 6, 1.3, 1.6, 9.5, 8, { uvScale: 12, color: '#5a564e' });
    g.box('w_concrete', x, -1.9, 0, 2.2, 1.2, 15, { uvScale: [12, 14], color: '#5a564e' });
  }
  // steel truss along both sides
  const rust = '#6a3a22';
  const ty = 5.2;
  for (const s of [-1, 1]) {
    const zz = s * (BRIDGE.hw + 0.5);
    for (let x = x0; x < x1 - 1; x += 30) {
      const L = Math.min(30, x1 - x);
      g.box('rust', x + L / 2, ty, zz, L, 0.6, 0.6, { color: rust, uvScale: 3 });
      g.box('rust', x + L / 2, 0.3, zz, L, 0.5, 0.6, { color: rust, uvScale: 3 });
    }
    let k = 0;
    for (let x = x0; x <= x1 - 6; x += 6, k++) {
      g.box('rust', x, ty / 2 + 0.2, zz, 0.4, ty, 0.4, { color: rust });
      g.push(); g.translate(x + 3, ty / 2 + 0.25, zz); g.rotZ((k % 2 ? 1 : -1) * Math.atan2(6, ty)); g.box('rust', 0, 0, 0, 0.3, Math.hypot(6, ty) - 0.4, 0.3, { color: mulCol(rust, 0.85) }); g.pop();
    }
  }
  // overhead cross beams
  for (let x = x0 + 3; x < x1; x += 12) g.box('rust', x, ty + 0.1, 0, 0.4, 0.4, BRIDGE.hw * 2 + 1, { color: rust });
  // drawbridge towers in the middle
  const mid = 742;
  for (const tx of [mid - 22, mid + 22]) for (const s of [-1, 1]) {
    const tz = s * (BRIDGE.hw + 3.2);
    g.identity();
    g.box('w_brick_dirty', tx, 5, tz, 5, 16, 5, { uvScale: [12, 14], color: '#a89080' });
    g.box('rust', tx, 14, tz, 5.6, 2.6, 5.6, { color: '#5a3a2a', uvScale: 3 });
    g.box('roof', tx, 15.35, tz, 5.8, 0.1, 5.8, { faces: 't' });
    g.box('glassdark', tx, 10.5, tz - s * 2.52, 2.4, 1.6, 0.06, { color: '#4a5a60', faces: 'fb' });
    g.sphere('beacon', tx, 16.2, tz, 0.35, 6, 4, {});
    C.solid(tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5, 16);
  }
  // counterweight gantry + the "OPEN" seam
  for (const tx of [mid - 22, mid + 22]) {
    g.box('rust', tx, 17.5, 0, 3, 3, BRIDGE.hw * 2 + 9, { color: '#4a2e1e', uvScale: 3 });
    g.box('metal', tx, 13, 0, 1.2, 6, 1.2, { color: '#2a2622' });
  }
  for (let z = -BRIDGE.hw + 0.5; z < BRIDGE.hw; z += 1) g.box('metal', mid, 0.07, z, 0.5, 0.04, 0.9, { color: '#2e2a26' });
  // control house on the north tower
  g.box('w_corrugated_rust', mid - 22, 18.4, -(BRIDGE.hw + 3.2), 4, 2.4, 4, { uvScale: [12, 14] });
  // welcome gantry at the city end
  g.frame(632, 0, PI / 2);
  for (const s of [-1, 1]) g.box('metal', s * (BRIDGE.hw + 0.8), 4, 0, 0.5, 8, 0.5, { color: '#2a2622' });
  g.box('metal', 0, 7.6, 0, BRIDGE.hw * 2 + 2.2, 0.5, 0.4, { color: '#2a2622' });
  locSign(C, { d: 0 }, 'isle_gantry', 'BLACKWATER ISLE · TOLL $5 · NO LIFEGUARD (EVER)', { w: 14, h: 1.6, y: 6.6, z: 0.25, bg: '#1e2a22', fg: '#e8e2c8', border: '#0a0f0c', double: true, gain: 1.4, font: 'Barlow Condensed' });
  // and a "welcome" from the island side
  g.frame(LAND_X - 6, 0, -PI / 2);
  for (const s of [-1, 1]) g.box('metal', s * (BRIDGE.hw + 0.8), 4, 0, 0.5, 8, 0.5, { color: '#2a2622' });
  g.box('metal', 0, 7.6, 0, BRIDGE.hw * 2 + 2.2, 0.5, 0.4, { color: '#2a2622' });
  locSign(C, { d: 0 }, 'isle_gantry2', 'ROTWELL — GOOD LUCK OUT THERE', { w: 12, h: 1.5, y: 6.6, z: 0.25, bg: '#2a2218', fg: '#d8c890', double: true, gain: 1.2, font: 'Barlow Condensed' });
  C.emit(mid - 22, 19, -(BRIDGE.hw + 3.2), 'smoke');
}

// ------------------------------------------------------------------ toll plaza (west landing)
function tollPlaza(C) {
  const g = C.geo;
  const { x, z } = SPOTS.tollBooth; // north shoulder
  g.frame(x, z, 0);
  g.box('props', 0, 0.12, 0, 4.4, 0.24, 3.6, { color: '#8a7a3a' });
  g.box('w_corrugated_rust', 0, 1.6, 0, 3, 2.8, 2.4, { uvScale: [12, 14] });
  g.box('glassdark', 0, 1.9, 1.22, 2.2, 1.1, 0.04, { faces: 'f', color: '#5a6a70' });
  g.box('corr', 0, 3.15, 0, 3.8, 0.15, 3.2, { color: '#7a6a5a', uvScale: 3 });
  g.box('lamp_flk', 0, 3.05, 1.2, 1.4, 0.04, 0.4, { color: '#ffd080', faces: 'u' });
  // striped barrier arm, stuck half-raised
  g.push(); g.translate(1.9, 1.1, 1.6); g.rotZ(-0.55);
  for (let i = 0; i < 7; i++) g.box('props', -i * 1.1 - 0.55, 0, 0, 1.1, 0.18, 0.18, { color: i % 2 ? '#d8d0c0' : '#b02a1a' });
  g.pop();
  g.box('metal', 1.9, 0.55, 1.6, 0.4, 1.1, 0.4, { color: '#c0a020' });
  C.solid(x - 1.6, z - 1.3, x + 1.6, z + 1.3, 3);
  C.light(x, 3, z + 1.6, '#ffd080', 'flicker');
  g.frame(x - 6, z - 1, 0);
  g.box('metal', 0, 2, 0, 0.2, 4, 0.2, { color: '#333' });
  locSign(C, { d: 0 }, 'isle_toll', 'TOLL $5 · PAY THE TROLL', { w: 4.6, h: 1.3, y: 3.6, z: 0.15, bg: '#c8b030', fg: '#1a1612', double: true, gain: 0.6, font: 'Barlow Condensed' });
}

// ------------------------------------------------------------------ ferry piers (island + Rustyards)
function woodDeck(C, x0, z0, x1, z1, { piles = true } = {}) {
  const g = C.geo; g.identity();
  const along = x1 - x0 > z1 - z0;
  const L = along ? x1 - x0 : z1 - z0;
  for (let s = 0; s < L; s += 24) {
    const e = Math.min(L, s + 24);
    if (along) g.box('wood', x0 + (s + e) / 2, -0.22, (z0 + z1) / 2, e - s, 0.56, z1 - z0, { faces: 'all', uvScale: 3, color: '#6a5a46' });
    else g.box('wood', (x0 + x1) / 2, -0.22, z0 + (s + e) / 2, x1 - x0, 0.56, e - s, { faces: 'all', uvScale: 3, color: '#6a5a46' });
  }
  if (piles) for (let s = 1; s < L; s += 4) for (const side of [0, 1]) {
    if (along) g.cyl('wood', x0 + s, -2.6, side ? z1 - 0.3 : z0 + 0.3, 0.25, 0.25, 4.8, 6, { color: '#3e3022' });
    else g.cyl('wood', side ? x1 - 0.3 : x0 + 0.3, -2.6, z0 + s, 0.25, 0.25, 4.8, 6, { color: '#3e3022' });
  }
}
function ferryBoat(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('rust', 0, -0.4, 0, 6, 2.4, 16, { faces: 'all', uvScale: 3, color: '#3a4a52' });
  g.box('w_corrugated', 0, 1.8, -1, 4.6, 2.2, 7, { uvScale: [12, 14], color: '#c8c0b0' });
  g.box('glassdark', 0, 2.2, 2.52, 4, 0.9, 0.05, { faces: 'f', color: '#5a6a70' });
  g.cyl('rust', 0, 4, -3, 0.5, 0.5, 2.4, 8, { color: '#8a2a1a' });
  g.box('metal', 0, 0.9, 7.8, 5.6, 0.1, 0.4, { color: '#2a2622' });
  locSign(C, { d: 0 }, 'ferry_name' + Math.round(x), 'S.S. SEASICK', { w: 4, h: 0.7, y: 0.4, z: 8.02, bg: '#d8d0c0', fg: '#2a2a2a', board: false, gain: 0, font: 'Barlow Condensed' });
  C.emit(x - Math.sin(rot) * 3, 5.2, z - Math.cos(rot) * 3, 'smoke');
}
function ferries(C) {
  const g = C.geo;
  const F = SPOTS.ferry;
  woodDeck(C, F.x0, F.z - F.w / 2, F.x1, F.z + F.w / 2);
  // shelter at the end
  g.frame(F.x0 + 5, F.z, PI / 2);
  for (const s of [-1, 1]) for (const t of [-1.6, 1.6]) g.box('metal', s * 2.2, 1.4, t, 0.15, 2.8, 0.15, { color: '#3a3a36' });
  g.box('corr', 0, 2.9, 0, 5.2, 0.12, 4, { color: '#7a6e60', uvScale: 3 });
  locSign(C, { d: 0 }, 'ferry_isle', 'FERRY TO RUSTYARDS · $10', { w: 4.2, h: 1, y: 3.6, z: 0, bg: '#1a2a3a', fg: '#e8e0c8', double: true, gain: 1.4, font: 'Barlow Condensed' });
  C.light(F.x0 + 5, 2.6, F.z, '#e8f0ff', 'street');
  ferryBoat(C, F.x0 - 4, F.z + 8, 0);
  // city side: pier at z = -170 already exists; add a booth + boat
  const cf = SPOTS.cityFerry;
  g.frame(cf.x - 11, cf.z + 3, PI);
  g.box('w_wood', 0, 1.3, 0, 2.4, 2.6, 2, { uvScale: [12, 14], color: '#9a8a70' });
  g.box('corr', 0, 2.7, 0, 3, 0.12, 2.6, { color: '#7a6e60', uvScale: 3 });
  locSign(C, { d: 0 }, 'ferry_city', 'BLACKWATER FERRY · $10', { w: 3.6, h: 0.9, y: 3.3, z: 0, bg: '#1a2a3a', fg: '#e8e0c8', double: true, gain: 1.4, font: 'Barlow Condensed' });
  C.solid(cf.x - 12.2, cf.z + 2, cf.x - 9.8, cf.z + 4, 3);
  ferryBoat(C, cf.x + 6, cf.z + 12, PI / 2);
}

// ------------------------------------------------------------------ shacks (stilts, village lots)
function shack(C, x, z, rot, { w = 7, d = 6, h = 3, stilts = 0, facade = 'wood', tint = '#c8b8a0', roofCol = '#7a6a5a', porch = true, door = true, blank = null } = {}) {
  const g = C.geo, r = C.rng;
  g.frame(x, z, rot);
  if (stilts > 0) for (const s of [-1, 1]) for (const t of [-1, 1]) g.cyl('wood', s * (w / 2 - 0.3), -stilts / 2 + 0.1, t * (d / 2 - 0.3), 0.2, 0.22, stilts + 0.4, 5, { color: '#3a2e22' });
  g.box('wood', 0, 0.12, 0.6, w + 0.4, 0.24, d + 2.6, { color: '#5a4a38', uvScale: 3 });
  r();
  const dx = door ? (r() - 0.5) * (w - 3) : 0;
  mass(C, { W: w, D: d, H: h, y0: 0.24, facade, tint, parapet: 0, doors: door ? [{ x: dx, w: 1.1, h: 2.1 }] : blank });
  g.push(); g.translate(0, 0.24 + h, 0); g.rotY(PI / 2); g.gable('corr', 0, 0, 0, d + 0.8, 1.2, w + 0.8, { color: roofCol, uvScale: 3, endMat: 'w_' + facade, endColor: tint }); g.pop();
  if (door) { g.push(); g.translate(0, 0.24, d / 2); P.doorway(C, dx, 1.1, 2.1, [0, 1, 5][(r() * 3) | 0], { lamp: r() < 0.5, lampColor: '#ffb070' }); g.pop(); }
  if (r() < 0.4) g.cyl('metal', w / 2 - 0.6, 0.24 + h + 1.4, -d / 4, 0.12, 0.12, 1.6, 5, { color: '#2a2622' }); // stovepipe
}

function stiltVillage(C) {
  const r = C.rng;
  const angles = [2.55, 2.68, 2.8, -2.9, -2.78, -2.66, 2.42];
  for (const th of angles) {
    const out = 7 + r() * 5;
    const [x, z] = coastPoint(th, out);
    if (Math.abs(z - SPOTS.ferry.z) < 12 || Math.abs(z) < 16) continue;
    const rot = Math.atan2(ISLE.cx - x, ISLE.cz - z) + (r() - 0.5) * 0.3; // front faces the shore
    shack(C, x, z, rot, { w: 6 + r() * 2, d: 5 + r(), h: 2.6 + r() * 0.6, stilts: 4, tint: ['#a89880', '#8a9a90', '#b0a090', '#9a8070'][(r() * 4) | 0] });
    // plank walkway to shore
    const [sx, sz] = coastPoint(th, -2);
    const g = C.geo; g.identity();
    g.strip('wood', sx, sz, x, z, 1.4, 0.05, { color: '#5a4a36' });
  }
}

// ------------------------------------------------------------------ Funland
function clownHead(C, x, y, z, rot, s = 1) {
  const g = C.geo; g.frame(x, z, rot);
  g.sphere('props', 0, y, 0, 2.2 * s, 10, 7, { color: '#d8d0c0' });
  g.sphere('beacon', 0, y - 0.1 * s, 2.15 * s, 0.45 * s, 6, 4, {});
  for (const sx of [-0.8, 0.8]) { g.sphere('props', sx * s, y + 0.55 * s, 1.85 * s, 0.38 * s, 6, 4, { color: '#141414' }); g.sphere('lamp_flk', sx * s, y + 0.55 * s, 2.1 * s, 0.12 * s, 5, 3, { color: '#ff3020' }); }
  g.box('props', 0, y - 0.95 * s, 1.95 * s, 2.0 * s, 0.35 * s, 0.3 * s, { color: '#8a1010' });
  for (const sx of [-1, 1]) g.sphere('props', sx * 2.1 * s, y + 0.6 * s, -0.2 * s, 1.0 * s, 7, 5, { color: '#c8501a' });
  g.cyl('props', 0, y + 2.3 * s, 0, 0.1, 1.2 * s, 1.6 * s, 8, { color: '#2a5a8a' });
}

function funland(C, live) {
  const g = C.geo, r = C.rng;
  const F = SPOTS.funland;
  // perimeter fence with a gate and the arcade in the west side
  const A = SPOTS.arcade;
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 24) {
      const t0 = s / L, t1 = Math.min(1, (s + 24) / L);
      P.chainFence(C, x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, { h: 2.8, razor: r() < 0.5, mat: 'chain_d' });
    }
  };
  const fx = F.x0;
  fence(fx, F.z0, fx, A.cz - A.w / 2);
  fence(fx, A.cz + A.w / 2, fx, -6);
  fence(fx, 6, fx, F.z1);
  fence(fx, F.z0, F.x1, F.z0);
  fence(F.x1, F.z0, F.x1, F.z1);
  fence(fx, F.z1, F.x1, F.z1);
  // cracked asphalt midway
  g.identity();
  g.plane('asphalt', F.x0 + 1, F.z0 + 1, F.x1 - 1, F.z1 - 1, 0.03, { uv: 'world', uvScale: 14, color: '#8a867c' });

  // ---- main gate arch with a clown head
  g.frame(SPOTS.gate.x, SPOTS.gate.z, -PI / 2);
  for (const s of [-1, 1]) {
    g.box('props', s * 6.3, 4.5, 0, 1.4, 9, 1.4, { color: '#b02a2a' });
    g.box('chase', s * 6.3, 4.5, 0.72, 0.5, 8.6, 0.04, { faces: 'f', uvScale: [0.5, 8.6] });
    C.obb(SPOTS.gate.x, SPOTS.gate.z + s * 6.3, -PI / 2, 1.4, 1.4, 9);
  }
  g.box('props', 0, 9.6, 0, 14, 1.4, 1.2, { color: '#d8b030' });
  locSign(C, { d: 0 }, 'funland_arch', 'FUNLAND', { w: 10, h: 2.2, y: 11.4, z: 0.2, bg: '#c82a2a', fg: '#ffe8a0', border: '#5a0a0a', neon: '#ff40a0', flicker: true, double: true, gain: 2.2, font: 'Barlow Condensed' });
  g.frame(SPOTS.gate.x, SPOTS.gate.z, -PI / 2);
  g.box('chase', 0, 9.6, 0.62, 13.6, 0.6, 0.04, { faces: 'f', uvScale: [8, 0.6] });
  clownHead(C, SPOTS.gate.x, 15.2, SPOTS.gate.z, -PI / 2, 1.15);
  g.frame(SPOTS.gate.x - 0.5, -9, -PI / 2);
  locSign(C, { d: 0 }, 'funland_rules', 'NO REFUNDS · NO RUNNING · NO WITNESSES', { w: 6, h: 0.9, y: 2.6, z: 0, bg: '#e8e0c8', fg: '#8a1010', double: true, gain: 0.4, font: 'Barlow Condensed' });
  g.frame(SPOTS.gate.x - 0.5, -9, -PI / 2); g.box('metal', 0, 1.2, 0, 0.15, 2.4, 0.15, { color: '#333' });

  // ---- arcade (gatehouse). Front faces west onto Pen Rd.
  const acx = fx + A.d / 2;
  g.frame(acx, A.cz, FACE.w);
  const top = mass(C, { W: A.w, D: A.d, H: 6.5, facade: 'stucco_pink', tint: '#c89090', parapet: 0.8, doors: [{ x: 0, w: 2.2, h: 2.8 }] });
  g.frame(acx, A.cz, FACE.w);
  g.translate(0, 0, A.d / 2);
  P.doorway(C, 0, 2.2, 2.8, 4, { lamp: true, lampColor: '#ff80c0', awning: '#8a1a4a' });
  g.box('chase', 0, 4.4, 0.12, A.w - 1, 0.7, 0.04, { faces: 'f', uvScale: [8, 0.7] });
  g.frame(acx, A.cz, FACE.w);
  locSign(C, { d: A.d }, 'funland_arcade', 'FUNLAND ARCADE', { w: 12, h: 2, y: 6.2, bg: '#1a0a2a', fg: '#ffd040', neon: '#40e0ff', flicker: true, gain: 2.4, font: 'Barlow Condensed' });
  C.obb(acx, A.cz, FACE.w, A.w, A.d, top);
  const doorX = fx - 1.6, doorZ = A.cz;
  g.identity(); g.plane('glow', doorX - 4, doorZ - 4, doorX + 4, doorZ + 4, 0.09, { color: '#ff80c0' });
  C.light(doorX, 3.2, doorZ, '#ff80c0', 'door');

  // ---- Ferris wheel supports (the wheel itself is live)
  const FW = SPOTS.ferris;
  for (const s of [-1, 1]) {
    const lx = FW.x + s * 3.2;
    for (const t of [-1, 1]) {
      g.frame(lx, FW.z + t * 9, 0);
      g.push(); g.translate(0, FW.hub / 2, -t * 4.5); g.rotX(t * Math.atan2(9, FW.hub)); g.box('rust', 0, 0, 0, 0.8, Math.hypot(9, FW.hub) + 1, 0.8, { color: '#6a4030' }); g.pop();
      C.solid(lx - 0.6, FW.z + t * 9 - 0.6, lx + 0.6, FW.z + t * 9 + 0.6, FW.hub);
    }
  }
  g.identity();
  g.box('rust', FW.x, FW.hub, FW.z, 7.4, 1.2, 1.2, { color: '#4a2a1e' });
  g.box('w_concrete', FW.x, 0.3, FW.z, 10, 0.6, 24, { uvScale: [12, 14], color: '#7a766c' });
  g.box('w_wood', FW.x - 6, 1.5, FW.z + 6, 3, 3, 3, { uvScale: [12, 14], color: '#b04040' }); // operator booth
  C.solid(FW.x - 7.5, FW.z + 4.5, FW.x - 4.5, FW.z + 7.5, 3);
  live.push(ferrisWheel(C, FW));

  // ---- roller coaster skeleton
  const CO = SPOTS.coaster;
  const N = 84;
  const H = (t) => 4 + 7 * (0.5 + 0.5 * Math.sin(t * 3 + 0.4)) + 17 * Math.max(0, Math.sin(t + 0.6)) ** 3;
  const P3 = (t) => [CO.cx + Math.cos(t) * CO.rx, H(t), CO.cz + Math.sin(t) * CO.rz];
  const broken = (i) => i >= 52 && i <= 55;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * TAU, t1 = ((i + 1) / N) * TAU;
    const a = P3(t0), b = P3(t1);
    // support column (every other sample) with a crossbar
    if (i % 2 === 0) {
      g.frame(a[0], a[2], 0);
      g.box('metal', 0, a[1] / 2, 0, 0.35, a[1], 0.35, { color: '#6a5a50' });
      if (a[1] > 7) { g.box('metal', 0, a[1] * 0.5, 0, 2.4, 0.2, 0.2, { color: '#5a4a40' }); }
      C.solid(a[0] - 0.3, a[2] - 0.3, a[0] + 0.3, a[2] + 0.3, a[1]);
    }
    if (broken(i)) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), pitch = -Math.atan2(dy, L);
    g.frame((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, ang, (a[1] + b[1]) / 2);
    g.rotX(pitch);
    const SL = Math.hypot(L, dy) + 0.1;
    for (const s of [-0.6, 0.6]) g.box('metal', s, 0.2, 0, 0.14, 0.14, SL, { color: '#8a4a2a' });
    g.box('wood', 0, 0.05, 0, 1.6, 0.1, 0.3, { color: '#4a3a2a' });
  }
  // dangling rails at the break + a derailed car on the ground
  { const a = P3((52 / N) * TAU); g.frame(a[0], a[2], 0.5, a[1]); g.rotX(1.1); g.box('metal', 0.6, 0, 1.5, 0.14, 0.14, 3, { color: '#8a4a2a' }); }
  { const a = P3((54 / N) * TAU); g.frame(a[0] + 2, a[2] + 3, 2.1); g.rotZ(1.3);
    g.box('props', 0, 0.9, 0, 1.6, 0.9, 2.6, { color: '#b02a2a' }); g.box('props', 0, 1.5, -0.8, 1.6, 0.6, 0.3, { color: '#d8b030' });
    C.solid(a[0] + 0.5, a[2] + 1.5, a[0] + 3.5, a[2] + 4.5, 1.6); }
  // station
  { const a = P3(PI * 1.5); g.frame(a[0], a[2] + 3.5, 0);
    g.box('wood', 0, 1.6, 0, 12, 3.2, 3, { color: '#7a5a40', uvScale: 3 });
    g.box('corr', 0, 6.4, 0, 13, 0.15, 6, { color: '#8a3030', uvScale: 3 });
    locSign(C, { d: 0 }, 'coaster', 'THE GUT-WRENCHER (CLOSED BY COURT ORDER)', { w: 9, h: 1.1, y: 7.2, z: 0, bg: '#2a0a0a', fg: '#ffd040', double: true, gain: 1.6, font: 'Barlow Condensed' });
    C.solid(a[0] - 6, a[2] + 2, a[0] + 6, a[2] + 5, 3.2); }

  // ---- carousel
  const CA = SPOTS.carousel;
  g.frame(CA.x, CA.z, 0);
  g.cyl('wood', 0, 0.3, 0, CA.r, CA.r, 0.6, 16, { color: '#6a4a3a' });
  g.cyl('props', 0, 3.2, 0, 0.6, 0.6, 5.2, 8, { color: '#d8b030' });
  g.cyl('props', 0, 6.4, 0, 0.3, CA.r + 1, 2.2, 16, { color: '#a02a4a' });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU, px = Math.sin(a) * (CA.r - 1.4), pz = Math.cos(a) * (CA.r - 1.4);
    g.frame(CA.x + px, CA.z + pz, a + PI / 2);
    g.cyl('metal', 0, 3, 0, 0.06, 0.06, 5, 4, { color: '#d8c890' });
    if (i % 3 === 2) { g.push(); g.translate(0, 0.9, 0); g.rotZ(1.4); g.box('props', 0, 0, 0, 0.4, 1.2, 1.6, { color: '#e8e0d0' }); g.pop(); continue; } // fallen horse
    g.box('props', 0, 1.6, 0, 0.4, 0.8, 1.6, { color: ['#e8e0d0', '#2a2a2a', '#8a4a2a'][i % 3] });
    g.box('props', 0, 2.2, 0.75, 0.3, 0.8, 0.4, { color: ['#e8e0d0', '#2a2a2a', '#8a4a2a'][i % 3] });
  }
  C.solid(CA.x - CA.r * 0.8, CA.z - CA.r * 0.8, CA.x + CA.r * 0.8, CA.z + CA.r * 0.8, 6);
  C.light(CA.x, 5, CA.z, '#ff90c0', 'flicker');

  // ---- bumper car pavilion
  { const bx = 1090, bz = -20;
    g.frame(bx, bz, 0);
    g.box('props', 0, 0.15, 0, 22, 0.3, 14, { color: '#3a3a40' });
    for (const s of [-10.5, 10.5]) for (const t of [-6.5, 6.5]) { g.box('metal', s, 2.6, t, 0.3, 5.2, 0.3, { color: '#c0a020' }); C.solid(bx + s - 0.3, bz + t - 0.3, bx + s + 0.3, bz + t + 0.3, 5); }
    g.box('chain_d', 0, 5.3, 0, 22, 0.1, 14, { faces: 'u', uvScale: 0.5, color: '#888' });
    g.box('props', 0, 5.6, 0, 22.4, 0.5, 14.4, { color: '#2a5a8a', faces: 'fbrlt' });
    for (let i = 0; i < 7; i++) {
      g.frame(bx + (r() - 0.5) * 18, bz + (r() - 0.5) * 10, r() * 6);
      g.box('props', 0, 0.55, 0, 1.4, 0.5, 2, { color: ['#c02a2a', '#2a8a3a', '#d8b030', '#3a5ac0'][i % 4] });
      g.cyl('metal', 0, 2.9, -0.6, 0.03, 0.03, 4.6, 3, { color: '#888' });
    }
    g.frame(bx, bz - 7.4, PI); locSign(C, { d: 0 }, 'bumper', 'BUMPER CARS · WHIPLASH INCLUDED', { w: 8, h: 1, y: 6.4, z: 0, bg: '#2a5a8a', fg: '#ffe8a0', double: true, gain: 1.6, font: 'Barlow Condensed' });
  }
  // ---- food stand + clown billboard + dead lamps
  { const sx = 1068, sz = 52;
    g.frame(sx, sz, PI / 2);
    g.box('w_wood', 0, 1.5, 0, 6, 3, 4, { uvScale: [12, 14], color: '#d8c090' });
    g.box('props', 0, 3.4, 1.2, 7, 0.2, 2.6, { color: '#c03030' });
    locSign(C, { d: 4 }, 'fried', 'FRIED EVERYTHING', { w: 5, h: 0.9, y: 4.0, bg: '#c03030', fg: '#fff0c0', gain: 1.4, font: 'Barlow Condensed' });
    C.obb(sx, sz, PI / 2, 6, 4, 3);
  }
  { const bx = 1176, bz = 70; // tall clown sign facing Funland Dr
    g.frame(bx, bz, PI / 2);
    g.box('metal', 0, 7, 0, 0.6, 14, 0.6, { color: '#2a2622' });
    locSign(C, { d: 0 }, 'funland_pole', 'FUNLAND: WHERE THE FUN NEVER LEAVES', { w: 9, h: 2.4, y: 13, z: 0.4, bg: '#e8e0c8', fg: '#a01010', neon: '#ff3060', flicker: true, double: true, gain: 1.8, font: 'Barlow Condensed' });
    clownHead(C, bx, 17.4, bz, PI / 2, 0.9);
    C.solid(bx - 0.5, bz - 0.5, bx + 0.5, bz + 0.5, 14);
  }
  // funhouse with a clown mouth door (decorative)
  { const hx = 1165, hz = -88;
    g.frame(hx, hz, 0);
    mass(C, { W: 18, D: 10, H: 7, facade: 'stucco', tint: '#a0c0a0', parapet: 0.6, doors: [{ x: 0, w: 4.5, h: 3.4 }] });
    g.frame(hx, hz, 0);
    g.box('props', 0, 1.6, 5.05, 4, 3.2, 0.1, { color: '#0a0606', faces: 'f' });
    g.box('props', 0, 3.6, 5.1, 5, 0.6, 0.2, { color: '#c02020' });
    g.box('props', 0, -0.0 + 0.3, 5.1, 5, 0.6, 0.2, { color: '#c02020' });
    locSign(C, { d: 10 }, 'funhouse', 'MR. GIGGLES\' FUNHOUSE', { w: 9, h: 1.4, y: 6, bg: '#1a3a1a', fg: '#e8ff80', neon: '#80ff40', flicker: true, gain: 2, font: 'Special Elite' });
    clownHead(C, hx, 9.6, hz, 0, 1.0);
    C.obb(hx, hz, 0, 18, 10, 7);
  }
  // lamps, trash, puddles, dead trees inside the park
  for (const [lx, lz] of [[1045, 12], [1060, -55], [1100, -90], [1130, 0], [1170, 10], [1060, 90], [1150, 92]]) P.streetlight(C, lx, lz, r() * 6, { flicker: r() < 0.6, color: '#ff9adf', h: 6.5, arm: 1.6 });
  for (let i = 0; i < 14; i++) {
    const x = F.x0 + 4 + r() * (F.x1 - F.x0 - 8), z = F.z0 + 4 + r() * (F.z1 - F.z0 - 8);
    const k = r();
    if (Math.hypot(x - FW.x, z - FW.z) < 14 || Math.hypot(x - CA.x, z - CA.z) < 10) continue;
    if (x > 1076 && x < 1104 && z > -30 && z < -10) continue;
    if (k < 0.4) P.puddle(C, x, z, 1 + r() * 2, r() * 6);
    else if (k < 0.75) P.deadTree(C, x, z, 0.8);
    else P.trashPile(C, x, z, 3);
  }
  return { x: acx, z: A.cz, doorX, doorZ, facing: FACE.w };
}

// Ferris wheel: separate geometry rotating around the X axis; gondolas are instanced.
function ferrisWheel(C, FW) {
  const sub = new WorldGeo({ chunkSize: 400, min: -200, max: 200 });
  const SEG = 32;
  for (const s of [-1.6, 1.6]) {
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU, am = (a0 + a1) / 2;
      const chord = 2 * FW.r * Math.sin(PI / SEG);
      sub.identity(); sub.rotX(am); sub.translate(s, FW.r * Math.cos(PI / SEG), 0);
      sub.box('rust', 0, 0, 0, 0.35, 0.35, chord + 0.1, { color: '#8a3a26' });
      // inner ring
      sub.identity(); sub.rotX(am); sub.translate(s, FW.r * 0.82, 0);
      sub.box('rust', 0, 0, 0, 0.22, 0.22, chord * 0.82 + 0.1, { color: '#7a3424' });
    }
    for (let i = 0; i < 16; i++) {
      sub.identity(); sub.rotX((i / 16) * TAU); sub.translate(s, FW.r / 2, 0);
      sub.box('rust', 0, 0, 0, 0.2, FW.r, 0.2, { color: '#6a3020' });
    }
  }
  // cross bars between the two rims + bulbs
  for (let i = 0; i < 16; i++) {
    sub.identity(); sub.rotX((i / 16) * TAU); sub.translate(0, FW.r, 0);
    sub.box('metal', 0, 0, 0, 3.6, 0.18, 0.18, { color: '#5a4a40' });
    if (i % 2 === 0) sub.sphere('lamp_flk', 0, 0.3, 0, 0.25, 5, 3, { color: '#ff70c0' });
  }
  sub.identity(); sub.cyl('rust', 0, 0, 0, 1.2, 1.2, 4, 10, { color: '#4a2a1e' });
  const { chunks } = sub.finalize(C.mats.M);
  const wheel = new THREE.Group();
  for (const c of chunks) for (const m of [...c.children]) { m.castShadow = false; wheel.add(m); }
  wheel.position.set(FW.x, FW.hub, FW.z);
  wheel.rotation.order = 'XYZ';
  // gondolas
  const gsub = new WorldGeo({ chunkSize: 100, min: -50, max: 50 });
  gsub.identity();
  gsub.box('rust', 0, -1.5, 0, 2.2, 1.6, 2.0, { color: '#b03a2a', faces: 'all' });
  gsub.box('rust', 0, -0.4, 0, 2.4, 0.15, 2.2, { color: '#d8b030', faces: 'all' });
  gsub.box('metal', 0, -0.2, 0, 0.12, 0.6, 0.12, { color: '#333' });
  const gch = gsub.finalize(C.mats.M).chunks;
  const gmesh = gch[0].children.find((m) => m.isMesh);
  const NG = 16;
  const inst = new THREE.InstancedMesh(gmesh.geometry, gmesh.material, NG);
  inst.castShadow = true; inst.frustumCulled = false;
  const group = new THREE.Group();
  group.add(wheel, inst);
  group.name = 'ferris';
  const m4 = new THREE.Matrix4();
  let ang = 0;
  return {
    object: group, x: FW.x, z: FW.z, range: 520,
    update(dt) {
      ang += dt * 0.07; // creaky slow spin
      wheel.rotation.x = ang;
      for (let i = 0; i < NG; i++) {
        const a = ang + (i / NG) * TAU;
        const swing = Math.sin(ang * 6 + i) * 0.06;
        m4.makeRotationX(swing);
        m4.setPosition(FW.x, FW.hub + Math.cos(a) * FW.r, FW.z + Math.sin(a) * FW.r);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ Blackwater Pen
function prison(C) {
  const g = C.geo, r = C.rng;
  const S = SPOTS.prison;
  const H = 8;
  const wall = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 30) {
      const t0 = s / L, t1 = Math.min(1, (s + 30) / L);
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      P.wallRun(C, ax, az, bx, bz, { h: H, t: 1.2, mat: 'w_concrete', color: '#b0aca0', cap: '#6a665e' });
    }
  };
  // chain fence posts sit at y=0; lift the razor fence visually by putting it on the wall top
  const gate = PEN_X, gw = 7;
  wall(S.x0, S.z0, S.x1, S.z0);
  wall(S.x0, S.z0, S.x0, S.z1);
  wall(S.x1, S.z0, S.x1, S.z1);
  wall(S.x0, S.z1, gate - gw, S.z1);
  wall(gate + gw + 18, S.z1, S.x1, S.z1);
  // razor coils on top of the walls
  g.identity();
  for (const [x0, z0, x1, z1] of [[S.x0, S.z0, S.x1, S.z0], [S.x0, S.z0, S.x0, S.z1], [S.x1, S.z0, S.x1, S.z1], [S.x0, S.z1, gate - gw, S.z1], [gate + gw + 18, S.z1, S.x1, S.z1]]) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < L; s += 1.2) {
      const x = x0 + (x1 - x0) * s / L, z = z0 + (z1 - z0) * s / L;
      g.frame(x, z, Math.atan2(x1 - x0, z1 - z0)); g.translate(0, H + 0.65, 0); g.rotX(PI / 2);
      g.cyl('metal_d', 0, 0, 0, 0.5, 0.5, 0.06, 6, { color: '#9a9a90', capTop: false });
    }
  }
  // gate: big barred doors (locked) between two pillars
  g.identity();
  for (const s of [-1, 1]) { g.box('w_concrete', gate + s * (gw + 0.8), H / 2 + 1, S.z1, 1.6, H + 2, 2, { uvScale: [12, 14], color: '#9a968a' }); C.solid(gate + s * (gw + 0.8) - 0.8, S.z1 - 1, gate + s * (gw + 0.8) + 0.8, S.z1 + 1, H + 2); }
  for (let x = gate - gw + 0.3; x < gate + gw; x += 0.45) g.box('metal', x, 3.2, S.z1, 0.09, 6.4, 0.09, { color: '#2a2a2a' });
  for (const y of [0.3, 3.2, 6.2]) g.box('metal', gate, y, S.z1, gw * 2, 0.25, 0.2, { color: '#3a3a3a' });
  g.box('beacon', gate, H + 2.3, S.z1, 0.5, 0.5, 0.5, {});
  C.solid(gate - gw, S.z1 - 0.3, gate + gw, S.z1 + 0.3, 6.4);
  g.frame(gate, S.z1 + 1.2, 0);
  locSign(C, { d: 0 }, 'pen_sign', 'BLACKWATER PENITENTIARY · MAXIMUM SECURITY, MINIMUM DIGNITY', { w: 16, h: 1.4, y: H + 1.2, z: 0, bg: '#202428', fg: '#d8d8d0', border: '#0a0a0a', gain: 1.2, font: 'Barlow Condensed' });
  // visiting gatehouse to the east of the gate; door faces south onto the end of Pen Rd
  const vx = gate + gw + 9.6, vz = S.z1 + 2;
  g.frame(vx, vz, FACE.s);
  const top = mass(C, { W: 16, D: 10, H: 5, facade: 'concrete', tint: '#c0bcb0', parapet: 0.5, doors: [{ x: -3, w: 1.6, h: 2.6 }] });
  g.frame(vx, vz, FACE.s); g.translate(0, 0, 5);
  P.doorway(C, -3, 1.6, 2.6, 3, { lamp: true, lampColor: '#e8f0ff' });
  g.frame(vx, vz, FACE.s);
  locSign(C, { d: 10 }, 'pen_visit', 'VISITING · NO CONTACT · NO CAKE WITH FILES', { w: 9, h: 1.1, y: 4.3, bg: '#e0dcd0', fg: '#1a1a1a', gain: 0.6, font: 'Barlow Condensed' });
  C.obb(vx, vz, FACE.s, 16, 10, top);
  const doorX = vx - 3, doorZ = vz + 5 + 1.5;
  g.identity(); g.plane('glow', doorX - 3.5, doorZ - 3.5, doorX + 3.5, doorZ + 3.5, 0.09, { color: '#e8f0ff' });
  C.light(doorX, 3.1, doorZ, '#e8f0ff', 'door');
  // inside: cell blocks, yard, chow hall
  const blocks = [[985, -186, 40, 14], [1040, -186, 40, 14], [1100, -184, 34, 18], [985, -163, 22, 12]];
  for (const [bx, bz, w, d] of blocks) {
    g.frame(bx, bz, 0);
    const t = 10.5;
    g.box('w_concrete', 0, t / 2, 0, w, t, d, { faces: 'fbrl', uvScale: [12, 14], color: '#c8c4b8' });
    g.box('roof', 0, t - 0.01, 0, w, 0.02, d, { faces: 't', uvScale: 8 });
    g.box('props', 0, t + 0.3, 0, w + 0.2, 0.6, d + 0.2, { faces: 'fbrl', color: '#6a665e' });
    for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += 2.5) for (let y = 2; y < 10; y += 3.2) g.box('props', x, y, d / 2 + 0.05, 0.5, 1.0, 0.06, { color: '#0a0a0a', faces: 'f' });
    C.obb(bx, bz, 0, w, d, t);
  }
  // yard: hoop + benches + inmates' weights (visual)
  g.frame(1060, -160, 0);
  g.plane('asphalt', -20, -8, 20, 8, 0.03, { uv: 'world', uvScale: 14, color: '#9a968c' });
  g.box('metal', 14, 2, 0, 0.2, 4, 0.2, { color: '#333' }); g.box('props', 14, 3.8, 0.6, 1.4, 1, 0.1, { color: '#d8d0c0' });
  for (let i = 0; i < 3; i++) { g.box('metal', -12 + i * 4, 0.5, 3, 2.2, 0.1, 0.5, { color: '#555' }); }
  // guard towers with searchlights
  for (const [tx, tz] of [[S.x0, S.z0], [S.x1, S.z0], [S.x0, S.z1], [S.x1, S.z1]]) {
    g.frame(tx, tz, 0);
    for (const s of [-1.6, 1.6]) for (const t of [-1.6, 1.6]) g.box('metal', s, 7, t, 0.4, 14, 0.4, { color: '#4a4a46' });
    g.box('w_concrete', 0, 14.5, 0, 5, 3, 5, { uvScale: [12, 14], color: '#a8a49a' });
    g.box('glassdark', 0, 15.2, 0, 5.1, 1.2, 5.1, { faces: 'fbrl', color: '#40505a' });
    g.box('roof', 0, 16.05, 0, 5.6, 0.1, 5.6, { faces: 't' });
    g.box('lamp', 2.6, 15.6, 2.6, 0.6, 0.5, 0.6, { color: '#f0f4ff' });
    g.cyl('beam', 0, 8, 6, 0.4, 4, 16, 10, { color: '#f0f4ff', capTop: false, uvScale: 16 });
    C.solid(tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5, 16);
    C.light(tx + 2.6, 15, tz + 2.6, '#f0f4ff', 'street');
  }
  // north side: the cliff edge behind the walls gets a few warning signs
  for (const sx of [S.x0 + 20, S.x1 - 20]) { g.frame(sx, S.z1 + 6, 0); g.box('metal', 0, 1, 0, 0.1, 2, 0.1, { color: '#333' }); locSign(C, { d: 0 }, 'pen_warn' + sx, 'DO NOT FEED THE INMATES', { w: 3, h: 0.8, y: 2.2, z: 0.06, bg: '#d8c020', fg: '#1a1a1a', gain: 0.4, font: 'Barlow Condensed' }); }
  return { x: vx, z: vz, doorX, doorZ, facing: FACE.s, gate: { x: gate, z: S.z1 + 2 } };
}

// ------------------------------------------------------------------ lighthouse + keeper's cottage
function lighthouse(C, live) {
  const g = C.geo;
  const L = SPOTS.lighthouse;
  const H = 26;
  g.frame(L.x, L.z, 0);
  g.cyl('w_concrete', 0, 0.6, 0, 6, 6.5, 1.2, 14, { uvScale: 12, color: '#7a766c' });
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = 1.2 + i * (H / bands), r0 = 4 - (i / bands) * 1.2, r1 = 4 - ((i + 1) / bands) * 1.2;
    g.cyl('props', 0, y0 + H / bands / 2, 0, r1, r0, H / bands, 14, { color: i % 2 ? '#a02a22' : '#d8d0c0', capTop: false });
  }
  const top = 1.2 + H;
  g.cyl('metal', 0, top + 0.2, 0, 4, 4, 0.4, 14, { color: '#2a2622' });
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; g.box('metal', Math.sin(a) * 3.8, top + 0.9, Math.cos(a) * 3.8, 0.06, 1, 0.06, { color: '#222' }); }
  g.cyl('glassdark', 0, top + 2, 0, 2.2, 2.2, 3, 10, { color: '#6a7a70', capTop: false });
  g.sphere('lamp', 0, top + 2, 0, 1.0, 8, 6, { color: '#fff4c0' });
  g.cyl('metal', 0, top + 4.2, 0, 0.3, 2.6, 1.6, 10, { color: '#1a1a18' });
  g.sphere('beacon', 0, top + 5.2, 0, 0.3, 6, 4, {});
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; g.box('glassdark', Math.sin(a) * (3.9 - i * 0.18), 4 + i * 3.8, Math.cos(a) * (3.9 - i * 0.18), 0.6, 0.9, 0.6, { color: '#202428' }); }
  C.solid(L.x - 4, L.z - 4, L.x + 4, L.z + 4, top);
  C.light(L.x, top + 2, L.z, '#fff0c0', 'street');
  // keeper's cottage (the location door)
  const cx = L.x + 14, cz = L.z + 6;
  shack(C, cx, cz, FACE.s, { w: 9, d: 7, h: 3, facade: 'wood', tint: '#d8d0c0', roofCol: '#4a5a6a', door: false, blank: [{ x: 0, w: 1.2, h: 2.2 }] });
  g.frame(cx, cz, FACE.s); g.translate(0, 0.24, 3.5);
  P.doorway(C, 0, 1.2, 2.2, 1, { lamp: true, lampColor: '#ffd090' });
  g.frame(cx, cz, FACE.s);
  locSign(C, { d: 7 }, 'lighthouse', 'BLACKWATER LIGHT · KEEPER: KNOCK LOUD', { w: 6, h: 0.9, y: 3.2, bg: '#1a2a3a', fg: '#e8e0c8', gain: 1.2, font: 'Barlow Condensed' });
  C.obb(cx, cz, FACE.s, 9, 7, 4.5);
  const doorX = cx, doorZ = cz + 3.5 + 1.6;
  C.light(doorX, 2.8, doorZ, '#ffd090', 'door');
  g.identity(); g.plane('glow', doorX - 3, doorZ - 3, doorX + 3, doorZ + 3, 0.09, { color: '#ffd090' });
  P.fireBarrel(C, cx + 7, cz + 4);
  // rotating beam (live)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.ConeGeometry(9, 150, 16, 1, true);
  cone.translate(0, -75, 0);
  cone.rotateZ(PI / 2);
  const beam = new THREE.Group();
  for (const s of [0, PI]) { const m = new THREE.Mesh(cone, beamMat); m.rotation.y = s; m.frustumCulled = false; m.renderOrder = 3; beam.add(m); }
  beam.position.set(L.x, top + 2, L.z);
  beam.rotation.order = 'YXZ';
  live.push({
    object: beam, x: L.x, z: L.z, range: 1400, beam: true,
    update(dt, env) {
      beam.rotation.y += dt * 0.9;
      beam.rotation.z = -0.06;
      const want = Math.min(0.5, 0.015 + env.night * 0.28 + (env.fog ?? 0) * 0.2);
      beamMat.opacity += (want - beamMat.opacity) * Math.min(1, dt * 2);
    },
  });
  return { x: cx, z: cz, doorX, doorZ, facing: FACE.s, tower: { x: L.x, z: L.z, y: top + 2 } };
}

// ------------------------------------------------------------------ The Rusty Hook (seafood shack)
function rustyHook(C) {
  const g = C.geo;
  const R = SPOTS.rustyHook;
  g.frame(R.cx, R.cz, FACE.w);
  const top = mass(C, { W: R.w, D: R.d, H: 4.6, facade: 'wood', tint: '#a8a090', parapet: 0, doors: [{ x: -4, w: 1.6, h: 2.5 }] });
  g.frame(R.cx, R.cz, FACE.w);
  g.push(); g.translate(0, top, 0); g.rotY(PI / 2); g.gable('corr', 0, 0, 0, R.d + 1, 2, R.w + 1, { color: '#6a3a2a', uvScale: 3, endMat: 'w_wood', endColor: '#a8a090' }); g.pop();
  g.translate(0, 0, R.d / 2);
  P.doorway(C, -4, 1.6, 2.5, 2, { lamp: true, lampColor: '#ffb060', awning: '#2a4a6a' });
  g.frame(R.cx, R.cz, FACE.w);
  locSign(C, { d: R.d }, 'rusty_hook', 'THE RUSTY HOOK · SEAFOOD · BAIT · REGRET', { w: 13, h: 1.6, y: 5.2, bg: '#1a2a3a', fg: '#ffd890', neon: '#40c0ff', flicker: true, gain: 2, font: 'Special Elite' });
  // giant fish on the roof with a hook through its lip
  g.frame(R.cx, R.cz, FACE.w);
  g.push(); g.translate(0, top + 3.4, 0); g.rotY(PI / 2);
  g.sphere('props', 0, 0, 0, 1.4, 10, 6, { color: '#6a8a7a', sy: 0.7 });
  g.box('props', 0, 0, 0, 7, 1.6, 1.0, { color: '#6a8a7a' });
  g.push(); g.translate(-4, 0, 0); g.rotZ(PI / 4); g.box('props', 0, 0, 0, 1.8, 1.8, 0.3, { color: '#5a7a6a' }); g.pop();
  g.sphere('props', 3.2, 0.3, 0.55, 0.25, 5, 3, { color: '#f0f0e0' });
  g.box('metal', 3.6, 1.6, 0, 0.12, 3, 0.12, { color: '#8a8a8a' });
  g.pop();
  C.obb(R.cx, R.cz, FACE.w, R.w, R.d, top + 2);
  // nets, crates, ice chest, crab pots out front-ish (side)
  const r = C.rng;
  for (let i = 0; i < 2; i++) { const x = R.cx - 2 + (r() - 0.5) * 8, z = R.cz + R.w / 2 + 2 + r() * 4; g.frame(x, z, r() * 6); g.box('wood', 0, 0.4, 0, 1.2, 0.8, 0.9, { color: '#7a6a4a' }); C.solid(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.8); }
  P.oilDrums(C, R.cx + 4, R.cz - R.w / 2 - 2.5, 2);
  const doorX = R.cx - R.d / 2 - 1.6, doorZ = R.cz - 4;
  g.identity(); g.plane('glow', doorX - 3.5, doorZ - 3.5, doorX + 3.5, doorZ + 3.5, 0.09, { color: '#ffb060' });
  C.light(doorX, 3, doorZ, '#ffb060', 'door');
  return { x: R.cx, z: R.cz, doorX, doorZ, facing: FACE.w };
}

// ------------------------------------------------------------------ Driftwood Beach Shack (home for sale)
function beachShack(C) {
  const g = C.geo;
  const B = SPOTS.beachShack;
  shack(C, B.cx, B.cz, FACE.n, { w: B.w, d: B.d, h: 3.2, stilts: 1.2, facade: 'wood', tint: '#b8a888', roofCol: '#4a6a7a', door: false, blank: [{ x: 0, w: 1.3, h: 2.3 }] });
  g.frame(B.cx, B.cz, FACE.n); g.translate(0, 0.24, B.d / 2);
  P.doorway(C, 0, 1.3, 2.3, 0, { lamp: true, lampColor: '#ffc080' });
  g.frame(B.cx, B.cz, FACE.n);
  locSign(C, { d: B.d }, 'driftwood', 'DRIFTWOOD SHACK · OCEAN VIEW (SMELL INCLUDED)', { w: 9, h: 0.9, y: 3.8, bg: '#3a5a6a', fg: '#f0e8d0', gain: 0.8, font: 'Barlow Condensed' });
  // hammock + tiki torches + a beached rowboat out back
  g.frame(B.cx, B.cz - 0, FACE.n);
  for (const s of [-1, 1]) { g.box('wood', s * 4, 1.2, -B.d / 2 - 3, 0.2, 2.4, 0.2, { color: '#4a3a28' }); }
  g.box('props', 0, 1.0, -B.d / 2 - 3, 7.6, 0.06, 1.2, { color: '#c8a070' });
  for (const s of [-1, 1]) { const tx = B.cx + s * (B.w / 2 + 1.5), tz = B.cz - B.d / 2 - 1.5; g.frame(tx, tz, 0); g.cyl('wood', 0, 1, 0, 0.06, 0.08, 2, 5, { color: '#5a4a30' }); for (let i = 0; i < 2; i++) { g.push(); g.rotY(i * PI / 2); g.wall('flame', -0.25, 2, 0.25, 2.7, 0, {}); g.pop(); } C.light(tx, 2.5, tz, '#ff8a3a', 'fire'); }
  C.obb(B.cx, B.cz, FACE.n, B.w, B.d, 4.5);
  const doorX = B.cx, doorZ = B.cz - B.d / 2 - 1.8;
  C.light(doorX, 2.7, doorZ + 0.6, '#ffc080', 'door');
  return { x: B.cx, z: B.cz, doorX, doorZ, facing: FACE.n };
}

// ------------------------------------------------------------------ Pier Zero (fishing)
function fishingPier(C) {
  const g = C.geo;
  const Pr = SPOTS.pier;
  woodDeck(C, Pr.x - Pr.w / 2, Pr.z0, Pr.x + Pr.w / 2, Pr.z1);
  for (let z = Pr.z0 + 2; z < Pr.z1; z += 3) for (const s of [-1, 1]) g.box('wood', Pr.x + s * (Pr.w / 2 - 0.1), 0.55, z, 0.12, 1.1, 0.12, { color: '#4a3a2a' });
  for (const s of [-1, 1]) for (let z = Pr.z0; z < Pr.z1; z += 30) g.box('wood', Pr.x + s * (Pr.w / 2 - 0.1), 1.05, z + 15, 0.1, 0.1, 30, { color: '#5a4a36' });
  // the end: bait shed, rods, bucket, a bench and a light
  const ez = Pr.z1 - 4;
  g.frame(Pr.x - 1.6, ez - 3, 0);
  g.box('w_wood', 0, 1.1, 0, 2, 2.2, 1.8, { uvScale: [12, 14], color: '#8a7a60' });
  g.box('corr', 0, 2.3, 0, 2.4, 0.1, 2.2, { color: '#6a5a4a', uvScale: 3 });
  C.solid(Pr.x - 2.7, ez - 4, Pr.x - 0.5, ez - 2, 2.2);
  for (let i = 0; i < 3; i++) { g.frame(Pr.x + 2.6, ez - 1 + i * 1.2, 0); g.rotX(-0.5); g.cyl('metal', 0, 1.4, 0, 0.02, 0.03, 2.8, 3, { color: '#2a2a2a' }); }
  g.frame(Pr.x + 1.2, ez + 1.5, 0); g.cyl('props', 0, 0.3, 0, 0.3, 0.25, 0.6, 8, { color: '#d8d0c0', capTop: false });
  P.streetlight(C, Pr.x - 2.4, ez + 2.5, PI / 2, { flicker: true, color: '#ffd8a0', h: 5, arm: 1.4 });
  g.frame(Pr.x, Pr.z0 + 8, 0);
  locSign(C, { d: 0 }, 'pier_sign', 'PIER ZERO · FISH AT OWN RISK · DO NOT EAT THE GLOWING ONES', { w: 7, h: 1, y: 3.2, z: 0, bg: '#2a3a4a', fg: '#e8e0c8', double: true, gain: 1, font: 'Barlow Condensed' });
  for (const s of [-1, 1]) g.box('wood', s * 3.3, 1.6, 0, 0.25, 3.2, 0.25, { color: '#4a3a2a' });
  return { x: Pr.x, z: Pr.z1 - 6, doorX: Pr.x, doorZ: Pr.z1 - 5, facing: 0, open: true };
}

// ------------------------------------------------------------------ Smugglers' Cove
function cove(C) {
  const g = C.geo, r = C.rng;
  // a beach spot just inside the cove shore
  const th = COVE_TH;
  const [sx, sz] = coastPoint(th, -12);
  // tarp shack against a dead container, front facing the island
  const face = Math.atan2(ISLE.cx - sx, ISLE.cz - sz);
  P.container(C, sx - Math.sin(face) * 4.5, 0, sz - Math.cos(face) * 4.5, face + PI / 2, '#3a4a3a');
  g.frame(sx, sz, face);
  g.box('props', 0, 2.9, 0, 9, 0.08, 7, { color: '#2a4a6a' }); // tarp roof
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.box('wood', s * 4.2, 1.45, t * 3.2 + 2, 0.2, 2.9, 0.2, { color: '#4a3a2a' });
  g.box('wood', 0, 0.5, 4, 3.2, 1, 1, { color: '#6a5a40' }); // counter
  g.box('lamp_flk', 0, 2.82, 2, 0.6, 0.06, 0.6, { color: '#ffb060', faces: 'u' });
  g.frame(sx, sz, face);
  locSign(C, { d: 0 }, 'cove_sign', 'NOTHING TO SEE HERE', { w: 4.5, h: 0.9, y: 3.6, z: 3.6, bg: '#2a2218', fg: '#c8b890', gain: 0.6, font: 'Special Elite' });
  C.light(sx + Math.sin(face) * 2, 2.6, sz + Math.cos(face) * 2, '#ffb060', 'flicker');
  // crates, barrels, rowboats
  for (let i = 0; i < 8; i++) {
    const a = face + (r() - 0.5) * 2.6, d = 7 + r() * 9;
    const x = sx + Math.sin(a) * d, z = sz + Math.cos(a) * d;
    if (!isLand(x, z, 2)) continue;
    const k = r();
    g.frame(x, z, r() * 6);
    if (k < 0.55) { const n = 1 + (r() * 3 | 0); for (let j = 0; j < n; j++) g.box('wood', (r() - 0.5) * 0.3, 0.6 + j * 1.2, 0, 1.4, 1.2, 1.2, { color: ['#7a6040', '#6a5a3a', '#8a7050'][j % 3] }); C.solid(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 1.2 * n); }
    else if (k < 0.8) P.oilDrums(C, x, z, 2 + (r() * 2 | 0));
    else { g.box('wood', 0, 0.4, 0, 1.6, 0.6, 4.2, { color: '#5a6a5a' }); g.box('wood', 0, 0.65, 0, 1.3, 0.1, 3.8, { color: '#3a2a1a' }); }
  }
  // a speedboat in the water
  const [wx, wz] = coastPoint(th, 10);
  g.frame(wx, wz, th);
  g.box('props', 0, -0.6, 0, 2.6, 1.2, 8, { color: '#e8e0d0', faces: 'all' });
  g.box('props', 0, 0.05, 1.6, 2.4, 0.1, 3, { color: '#a02a2a' });
  g.box('glassdark', 0, 0.6, -0.5, 2.2, 0.8, 0.1, { color: '#405060' });
  // rocky arms around the cove
  for (const d of [-0.32, -0.26, 0.26, 0.32]) {
    const [x, z] = coastPoint(th + d, 2);
    for (let i = 0; i < 3; i++) { g.frame(x + (r() - 0.5) * 6, z + (r() - 0.5) * 6, r() * 6); g.sphere('props', 0, 0, 0, 2.5 + r() * 2.5, 7, 4, { color: '#3e3a34', sy: 1.3 }); }
  }
  const doorX = sx + Math.sin(face) * 5.2, doorZ = sz + Math.cos(face) * 5.2;
  return { x: sx, z: sz, doorX, doorZ, facing: face };
}

// ------------------------------------------------------------------ a few benches (boardwalk, Funland, pier)
function benches(C) {
  // Boardwalk south sidewalk, looking out over the beach
  for (const x of [930, 1000, 1080, 1130, 1170]) P.bench(C, x, 125.4, 0);
  // Funland: by the carousel and the food stand
  P.bench(C, SPOTS.carousel.x + 11, SPOTS.carousel.z, PI / 2);
  P.bench(C, 1060, 64, PI);
  // end of the pier, facing the sea
  P.bench(C, SPOTS.pier.x + 1.5, SPOTS.pier.z1 - 2, 0);
}

// ------------------------------------------------------------------ trash beach
function beachJunk(C) {
  const r = C.rng;
  for (let i = 0; i < 40; i++) {
    const th = 0.25 + r() * 2.5;
    const x0 = ISLE.cx + Math.cos(th) * (coastR(th) - 2 - r() * 26), z0 = ISLE.cz + Math.sin(th) * (coastR(th) - 2 - r() * 26);
    if (z0 < 128) continue;
    if (Math.abs(x0 - SPOTS.pier.x) < 6 || Math.hypot(x0 - SPOTS.beachShack.cx, z0 - SPOTS.beachShack.cz) < 13) continue;
    if (Math.hypot(x0 - SPOTS.cove.x, z0 - SPOTS.cove.z) < 30) continue;
    const k = r();
    if (k < 0.3) P.tires(C, x0, z0, 1 + (r() * 2 | 0));
    else if (k < 0.5) P.trashPile(C, x0, z0, 3);
    else if (k < 0.75) P.deadTree(C, x0, z0, 0.7);
    else P.rock(C, x0, z0, 0.6 + r());
  }
}

// ------------------------------------------------------------------ generic village lots
export function buildIslandLot(C, lot) {
  const prevR = C.rng;
  C.rng = mulberry32(lot.seed);
  C.geo.reset(); C.geo.lock(lot.cx, lot.cz);
  try { (ISLE_LOTS[lot.type] ?? ISLE_LOTS.isle_shack)(C, lot); } catch (e) { console.error('[world] island lot failed', lot.type, e); }
  C.geo.reset();
  C.rng = prevR;
}

const ISLE_LOTS = {
  isle_shack(C, lot) {
    const r = C.rng;
    const w = Math.min(lot.w - 2, 6 + r() * 5), d = Math.min(lot.d - 3, 5 + r() * 4);
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot), lz = lot.d / 2 - d / 2 - 2.2;
    shack(C, lot.cx + lz * sn, lot.cz + lz * cs, lot.rot, { w, d, h: 2.6 + r() * 0.8, facade: r() < 0.3 ? 'corrugated_rust' : 'wood', tint: ['#a89880', '#8a9a90', '#b0a090', '#9a8070', '#8a8a9a'][(r() * 5) | 0], roofCol: ['#6a5a4a', '#5a3a2a', '#4a5a6a'][(r() * 3) | 0] });
    C.obb(lot.cx + lz * sn, lot.cz + lz * cs, lot.rot, w, d, 4);
    if (r() < 0.4) yardJunk(C, lot, 1);
  },
  isle_bait(C, lot) {
    const r = C.rng, g = C.geo;
    const W = Math.min(lot.w - 1, 12), D = Math.min(lot.d - 2, 9);
    g.frame(lot.cx, lot.cz, lot.rot);
    const lz = lot.d / 2 - D / 2 - 0.6;
    g.translate(0, 0, lz);
    const top = mass(C, { W, D, H: 3.8, facade: r() < 0.5 ? 'wood' : 'stucco', tint: '#c0b090', parapet: 0.5, doors: [{ x: -W / 4, w: 1.3, h: 2.3 }] });
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, lz + D / 2);
    P.doorway(C, -W / 4, 1.3, 2.3, 2, { lamp: true, lampColor: '#ffb070', awning: '#3a5a6a' });
    const txt = ['LIVE BAIT · COLD BEER · WORMS (SAME FRIDGE)', 'CRAB SHACK · ALL YOU CAN CATCH', 'NETS & KNOTS · NO CASH NO FISH', 'SALTY PETE\'S TACKLE & TATTOOS', 'CHUM BUCKET · FRESH-ISH'][(r() * 5) | 0];
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, lz);
    locSign(C, { d: D }, 'isle_bait_' + lot.seed, txt, { w: Math.min(W - 1, 9), h: 1, y: 3.2, bg: '#1e2a2a', fg: '#e8dcb0', gain: 1.2, font: 'Barlow Condensed', flicker: r() < 0.4 });
    C.obb(lot.cx + lz * Math.sin(lot.rot), lot.cz + lz * Math.cos(lot.rot), lot.rot, W, D, top);
    yardJunk(C, lot, 1);
  },
  isle_nets(C, lot) {
    const r = C.rng, g = C.geo;
    g.frame(lot.cx, lot.cz, lot.rot);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * Math.min(4, lot.w / 3.5);
      g.box('wood', x - 1.6, 1.2, 0, 0.15, 2.4, 0.15, { color: '#4a3a28' }); g.box('wood', x + 1.6, 1.2, 0, 0.15, 2.4, 0.15, { color: '#4a3a28' });
      g.box('chain_d', x, 1.4, 0, 3.2, 1.8, 0.02, { faces: 'fb', uvScale: 0.6, color: '#8a9a7a' });
    }
    for (let i = 0; i < 6; i++) { const lx = (r() - 0.5) * (lot.w - 3), lzz = (r() - 0.5) * (lot.d - 3); g.frame(lot.cx, lot.cz, lot.rot); g.translate(lx, 0, lzz); g.rotY(r() * 6); g.box('chain_d', 0, 0.45, 0, 1.0, 0.9, 1.0, { faces: 'all', uvScale: 0.5, color: '#9a8a6a' }); }
    yardJunk(C, lot, 1);
  },
  isle_boathouse(C, lot) {
    const r = C.rng, g = C.geo;
    const W = Math.min(lot.w - 1, 14), D = Math.min(lot.d - 1, 12);
    g.frame(lot.cx, lot.cz, lot.rot);
    const top = mass(C, { W, D, H: 5.5, facade: 'corrugated_rust', tint: '#b0a090', parapet: 0 });
    g.frame(lot.cx, lot.cz, lot.rot);
    g.push(); g.translate(0, top, 0); g.gable('corr', 0, 0, 0, W + 0.6, 1.8, D + 0.6, { color: '#5a4a3a', uvScale: 3, endMat: 'w_corrugated_rust', endColor: '#b0a090' }); g.pop();
    g.box('props', 0, 2, D / 2 + 0.05, W * 0.6, 4, 0.06, { faces: 'f', color: '#2a2622' });
    // boat on a trailer out front
    g.translate(W / 2 - 2, 0, D / 2 + 3); g.rotY(PI / 2 + (r() - 0.5) * 0.3);
    g.box('props', 0, 0.9, 0, 1.8, 0.9, 5, { color: ['#d8d0c0', '#3a5a6a', '#a03a2a'][(r() * 3) | 0] });
    g.box('metal', 0, 0.35, 0, 1.2, 0.1, 5.4, { color: '#333' });
    C.obb(lot.cx, lot.cz, lot.rot, W, D, top);
  },
};

function yardJunk(C, lot, n) {
  const r = C.rng;
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  for (let i = 0; i < n; i++) {
    const lx = (r() - 0.5) * (lot.w - 2), lz = -lot.d / 2 + 1.5 + r() * 2;
    const x = lot.cx + lx * cs + lz * sn, z = lot.cz - lx * sn + lz * cs;
    const k = r();
    if (k < 0.5) P.oilDrums(C, x, z, 2); else P.tires(C, x, z, 2);
  }
}

// ------------------------------------------------------------------ sea collision around the island
function seaCollision(C) {
  const xa = ISLE_X0 + 40, xb = ISLE_MAX_X + 30;
  // row boundaries: fine near the island, coarse elsewhere, plus every deck edge
  const zb = new Set();
  for (let z = -720; z <= 720; z += 8) zb.add(z);
  for (let z = -262; z <= 262; z += 2) zb.add(z);
  for (const d of DECKS) { zb.add(d[1]); zb.add(d[3]); }
  const rows = [...zb].sort((a, b) => a - b);
  let open = new Map(); // key "x0|x1" -> z start
  const flush = (key, z0, z1) => { const [x0, x1] = key.split('|').map(Number); if (x1 - x0 > 0.1) C.solid(x0, z0, x1, z1, 0.3, 'water'); };
  let boxes = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const za = rows[i], zz = rows[i + 1], zm = (za + zz) / 2;
    // free (walkable) intervals in this row
    const free = [];
    if (Math.abs(zm - ISLE.cz) < 262) {
      const L = (x) => isLand(x, zm, -0.4);
      const edge = (a, b) => { const la = L(a); for (let k = 0; k < 9; k++) { const m = (a + b) / 2; if (L(m) === la) a = m; else b = m; } return (a + b) / 2; };
      let start = null, prevX = ISLE.cx - 262, prev = false;
      for (let x = ISLE.cx - 262; x <= ISLE.cx + 262; x += 3) {
        const land = L(x);
        if (land && !prev) start = edge(prevX, x);
        if (!land && prev) free.push([start, edge(prevX, x)]);
        prev = land; prevX = x;
      }
      if (prev) free.push([start, ISLE.cx + 262]);
    }
    for (const d of DECKS) if (d[1] <= za && d[3] >= zz) free.push([d[0], d[2]]);
    free.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const f of free) { const m = merged[merged.length - 1]; if (m && f[0] <= m[1]) m[1] = Math.max(m[1], f[1]); else merged.push([...f]); }
    const water = [];
    let x = xa;
    for (const [f0, f1] of merged) { if (f1 <= xa) continue; if (f0 > x) water.push([x, Math.min(f0, xb)]); x = Math.max(x, f1); }
    if (x < xb) water.push([x, xb]);
    const keys = new Set(water.map(([a, b]) => Math.round(a * 2) / 2 + '|' + Math.round(b * 2) / 2));
    const next = new Map();
    for (const k of keys) next.set(k, open.has(k) ? open.get(k) : za);
    for (const [k, z0] of open) if (!keys.has(k)) { flush(k, z0, za); boxes++; }
    open = next;
  }
  for (const [k, z0] of open) { flush(k, z0, rows[rows.length - 1]); boxes++; }
  C.islandWaterBoxes = boxes;
}

// For the minimap: coastline polygon (world coords).
export function coastPolygon(n = 180) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(coastPoint(-PI + (i / n) * TAU));
  return out;
}
