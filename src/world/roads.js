import { lin, mulCol } from './geo.js';
import { districtAt, WATER_X, HALF } from './layout.js';
import * as P from './props.js';
import { mulberry32 } from '../core/util.js';

const { Y } = P;

// Island edges draw from their own RNG so adding Blackwater never reshuffles the city.
const isleRng = mulberry32(0xB1AC_3A7E);
function withRng(C, e, fn) {
  if (e.district !== 'blackwater') return fn();
  const prev = C.rng; C.rng = isleRng;
  try { return fn(); } finally { C.rng = prev; }
}

// Ground, road surfaces, sidewalks, curbs, lane markings, crosswalks and the
// street furniture that lines every road.
//
// Layering (no two surfaces share a height): ground 0 · sidewalks 0.03 ·
// road strips 0.05 (diagonals 0.052) · intersection patches 0.056 ·
// decals 0.066 · markings 0.07 · puddles 0.075. Road strips are trimmed at
// axis-aligned intersections and one patch covers the junction, so overlapping
// coplanar asphalt never z-fights; sidewalks are trimmed so corners never overlap.

export const GROUND_COL = {
  downtown: '#6b675f', gutterside: '#4f473b', hilltop: '#5a5838', rustyards: '#4b463f', dustbowl: '#a68e64', blackwater: '#4e4a3c',
};
export const ASPHALT_TINT = { downtown: '#d8d4cc', gutterside: '#c8c0b4', hilltop: '#d0ccc4', rustyards: '#b8b4ac', dustbowl: '#d8c8b0', blackwater: '#aca69a' };
const WALK_TINT = { downtown: '#e0dcd4', gutterside: '#b8ae9c', hilltop: '#d8d4c4', rustyards: '#a8a298', dustbowl: '#c8b498', blackwater: '#9e9688' };

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5, z * 2.1 + 9) * 0.3 + vnoise(x * 4.3 + 1, z * 4.3 + 3) * 0.15; }

function groundColor(x, z) {
  const d = districtAt(x, z);
  let c = lin(GROUND_COL[d]);
  const n = fbm(x / 60, z / 60);
  const k = 0.75 + n * 0.5;
  c = [c[0] * k, c[1] * k, c[2] * k];
  const d2 = districtAt(x + 18, z + 18);
  if (d2 !== d) { const c2 = lin(GROUND_COL[d2]); c = [(c[0] + c2[0] * k) / 2, (c[1] + c2[1] * k) / 2, (c[2] + c2[2] * k) / 2]; }
  return c;
}

export function buildGround(C) {
  const g = C.geo; g.identity();
  const S = 10;
  for (let x = -HALF; x < HALF; x += S) {
    if (x >= WATER_X) continue;
    for (let z = -HALF; z < HALF; z += S) {
      const x1 = Math.min(x + S, WATER_X);
      const cols = [groundColor(x, z + S), groundColor(x1, z + S), groundColor(x1, z), groundColor(x, z)];
      g.quad('ground', [x, 0, z + S], [x1, 0, z + S], [x1, 0, z], [x, 0, z], 'world', null, { uvScale: 10, colors: cols });
    }
  }
  // dock apron (concrete) and quay wall
  g.plane('sidewalk', 591, -HALF, WATER_X, HALF, 0.02, { uv: 'world', uvScale: 6, color: '#9a968c' });
  g.frame(WATER_X, 0, Math.PI / 2);
  g.box('w_concrete', 0, -2.2, 0, HALF * 2, 4.6, 0.6, { faces: 'f', color: '#7a766c', uvScale: [12, 14] });
  g.identity();
  g.plane('water', WATER_X, -2600, 2600, 2600, -1.3, {});
}

// Per-node junction data shared by roads, street props and signals.
export function junctions(L) {
  if (L._junctions) return L._junctions;
  const { nodes, edgeInfo } = L;
  const J = nodes.map((N, i) => {
    const es = N.edges.map((ei) => edgeInfo[ei]);
    const axisOnly = es.every((e) => e.axis);
    let hx = 0, hz = 0;
    for (const e of es) { if (e.axis === 'z') hx = Math.max(hx, e.hw); else if (e.axis === 'x') hz = Math.max(hz, e.hw); }
    const patch = N.edges.length > 1 && axisOnly && hx > 0 && hz > 0;
    return { i, deg: N.edges.length, axisOnly, patch, hx, hz, district: districtAt(N.x, N.z) };
  });
  L._junctions = J;
  return J;
}

// Distance from node along edge e where the road strip starts.
function stripTrim(J, e, nId) { const j = J[nId]; if (!j.patch || !e.axis) return 0; return e.axis === 'x' ? j.hx : j.hz; }

// Per side sidewalk trim at one end of an edge.
function walkTrim(L, J, e, end) {
  const { nodes, edgeInfo } = L;
  const nId = end === 0 ? e.a : e.b;
  const N = nodes[nId];
  const ux = end === 0 ? e.dx : -e.dx, uz = end === 0 ? e.dz : -e.dz;
  const t = [0, 0];
  for (const oi of N.edges) {
    const f = edgeInfo[oi];
    if (f === e) continue;
    const fx = f.a === nId ? f.dx : -f.dx, fz = f.a === nId ? f.dz : -f.dz;
    const sin = ux * fz - uz * fx, cos = ux * fx + uz * fz;
    if (Math.abs(sin) < 0.2) continue;
    const side = sin > 0 ? 0 : 1;
    const v = J[nId].axisOnly ? (e.axis === 'z' ? f.hw + f.sw : f.hw) : Math.max(0, (f.hw + e.hw * cos) / Math.abs(sin));
    t[side] = Math.max(t[side], Math.min(v, 45));
  }
  return t;
}

export function buildRoads(C) {
  const L = C.layout, g = C.geo;
  const { nodes, edgeInfo } = L;
  const J = junctions(L);
  for (const e of edgeInfo) {
    const A = nodes[e.a], B = nodes[e.b];
    const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
    const tint = lin(ASPHALT_TINT[e.district] ?? '#d0d0d0');
    const ta = stripTrim(J, e, e.a), tb = stripTrim(J, e, e.b);
    g.identity();
    if (e.len - ta - tb > 0.05) {
      g.strip('asphalt', A.x + dx * ta, A.z + dz * ta, B.x - dx * tb, B.z - dz * tb, e.hw * 2, e.axis ? Y.road : Y.road + 0.002, { uv: 'world', uvScale: 14, color: e.kind === 'desert' ? mulCol('#c8b8a0', 0.95) : tint });
    }
    if (e.kind === 'desert' || e.kind === 'drag') {
      for (const s of [1, -1]) {
        const o = (e.hw + 1.2) * s;
        g.strip('decal_dark', A.x + px * o, A.z + pz * o, B.x + px * o, B.z + pz * o, 2.4, 0.025, { uv: 'world', uvScale: 10, color: '#8a7a5a' });
      }
    }
    if (e.sw > 0) {
      const wt = lin(WALK_TINT[e.district] ?? '#d0d0d0');
      const tA = walkTrim(L, J, e, 0), tB = walkTrim(L, J, e, 1);
      for (const s of [1, -1]) {
        const o = (e.hw + e.sw / 2) * s;
        const ea = tA[s === 1 ? 0 : 1], eb = tB[s === 1 ? 1 : 0];
        if (e.len - ea - eb > 0.3) g.strip('sidewalk', A.x + dx * ea + px * o, A.z + dz * ea + pz * o, B.x - dx * eb + px * o, B.z - dz * eb + pz * o, e.sw, Y.walk, { uv: 'world', uvScale: 6, color: wt });
        // curb
        const ca = e.clear[0].curb[s === 1 ? 0 : 1], cb = e.clear[1].curb[s === 1 ? 1 : 0];
        const cl = e.len - ca - cb;
        if (cl > 0.5) {
          const oc = (e.hw + 0.15) * s;
          const sx = A.x + dx * ca + px * oc, sz = A.z + dz * ca + pz * oc;
          g.frame(sx, sz, Math.atan2(dx, dz));
          g.box('props', 0, 0.08, cl / 2, 0.3, 0.16, cl, { color: e.district === 'downtown' ? '#8a867e' : '#6a665e', uvScale: 2 });
          g.identity();
        }
      }
    }
    withRng(C, e, () => markings(C, e, A, B));
  }
  // one asphalt patch per axis-aligned junction
  g.identity();
  for (const j of J) {
    if (!j.patch) continue;
    const N = nodes[j.i];
    g.plane('asphalt', N.x - j.hx, N.z - j.hz, N.x + j.hx, N.z + j.hz, Y.patch, { uv: 'world', uvScale: 14, color: lin(ASPHALT_TINT[j.district] ?? '#d0d0d0') });
  }
}

function markings(C, e, A, B) {
  const g = C.geo; g.identity();
  const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
  const c0 = e.clear[0].mark, c1 = e.len - e.clear[1].mark;
  const Yc = '#c9a232', W = '#d8d4c8';
  const fade = e.district === 'gutterside' || e.district === 'dustbowl' || e.district === 'blackwater' ? 0.6 : e.district === 'rustyards' ? 0.72 : 0.9;
  const line = (off, s0, s1, w, col) => {
    if (s1 - s0 < 0.3) return;
    g.strip('marking', A.x + dx * s0 + px * off, A.z + dz * s0 + pz * off, A.x + dx * s1 + px * off, A.z + dz * s1 + pz * off, w, Y.mark, { color: mulCol(col, fade) });
  };
  const dashed = (off, w, col, dash = 3, gap = 6) => { for (let s = c0 + 1; s < c1 - dash; s += dash + gap) line(off, s, s + dash, w, col); };
  const solid = (off, w, col) => line(off, c0, c1, w, col);
  switch (e.marks) {
    case 'ring':
      solid(0.18, 0.13, Yc); solid(-0.18, 0.13, Yc);
      for (const s of [1, -1]) { dashed(s * (e.hw / 2 + 0.1), 0.14, W); solid(s * (e.hw - 0.5), 0.14, W); }
      break;
    case 'double':
      solid(0.16, 0.12, Yc); solid(-0.16, 0.12, Yc);
      if (e.park) for (const s of [1, -1]) dashed(s * (e.park - 1.1), 0.12, W, 1.2, 5.2);
      break;
    case 'faded': dashed(0, 0.14, Yc, 3, 6); break;
    case 'dashwhite': dashed(0, 0.13, W, 3, 7); break;
    case 'drag': {
      solid(0, 0.18, W); for (const s of [1, -1]) solid(s * (e.hw - 0.4), 0.18, W);
      const st = 35, fin = e.len - 20;
      for (const at of [st, fin]) {
        for (let k = -e.hw + 0.5; k < e.hw - 0.5; k += 1) {
          for (let r = 0; r < 2; r++) {
            const col = ((Math.round(k + e.hw) + r) % 2) ? '#e8e4dc' : '#151515';
            const sx = A.x + dx * (at + r * 1.0) + px * (k + 0.5), sz = A.z + dz * (at + r * 1.0) + pz * (k + 0.5);
            g.strip('marking', sx - dx * 0.5, sz - dz * 0.5, sx + dx * 0.5, sz + dz * 0.5, 1, Y.mark, { color: col });
          }
        }
      }
      for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
        const o = s * (3.3 + (C.rng() - 0.5) * 1.5), s0 = st + 2 + C.rng() * 10, s1 = s0 + 15 + C.rng() * 50;
        g.strip('decal_dark', A.x + dx * s0 + px * o, A.z + dz * s0 + pz * o, A.x + dx * s1 + px * o, A.z + dz * s1 + pz * o, 0.35, Y.decal, { color: '#1a1816' });
      }
      break;
    }
  }
  // crosswalks: complete zebra bars at every 3+ way junction in town
  if (['downtown', 'gutterside', 'hilltop', 'rustyards'].includes(e.district) && e.kind !== 'desert' && e.kind !== 'drag') {
    for (let end = 0; end < 2; end++) {
      const cl = e.clear[end];
      if (cl.deg < 3 || cl.mark < 5) continue;
      const at = end === 0 ? cl.mark - 2 : e.len - cl.mark + 2;
      for (let k = -e.hw + 0.8; k <= e.hw - 0.8; k += 1.1) {
        const sx = A.x + dx * at + px * k, sz = A.z + dz * at + pz * k;
        g.strip('marking', sx - dx * 1.4, sz - dz * 1.4, sx + dx * 1.4, sz + dz * 1.4, 0.55, Y.mark, { color: mulCol(W, fade) });
      }
    }
  }
}

// Street furniture along every road (signals are built in signals.js).
export function buildStreetProps(C) {
  const L = C.layout;
  const { nodes, edgeInfo } = L;
  edgeInfo.forEach((e, ei) => withRng(C, e, () => edgeProps(C, e, nodes, ei)));
}

function edgeProps(C, e, nodes, ei) {
  const rng = C.rng, L = C.layout;
  const A = nodes[e.a];
  const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
  const at = (s, off) => [A.x + dx * s + px * off, A.z + dz * s + pz * off];
  const c0 = e.clear[0].mark + 3, c1 = e.len - e.clear[1].mark - 3;
  if (c1 - c0 < 6) return;
  const dist = e.district;
  if (e.kind === 'bridge') {
    for (let s = c0 + 8, k = 0; s < c1; s += e.light, k++) for (const side of [1, -1]) {
      const [x, z] = at(s, (e.hw + 0.3) * side);
      P.streetlight(C, x, z, Math.atan2(-px * side, -pz * side), { flicker: (k + (side > 0 ? 1 : 0)) % 5 === 0, color: '#ffb060', arm: 2.2, h: 7.6 });
    }
    return;
  }
  const slum = dist === 'gutterside';
  const desert = e.kind === 'desert' || e.kind === 'drag';
  // slot bookkeeping along each side so nothing on the sidewalk overlaps
  const used = { 1: [], '-1': [] };
  const ok = (side, s, r) => s - r >= c0 - 2 && s + r <= c1 + 2 && used[side].every(([a, b]) => Math.abs(a - s) >= r + b);
  const take = (side, s, r) => used[side].push([s, r]);
  // keep the space in front of location entrances clear
  const nearLoc = (x, z, m) => L.placed.some((r) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);

  // --- streetlights at a regular spacing
  const sp = e.light;
  const n = Math.max(1, Math.floor((c1 - c0) / sp) + 1);
  const off0 = c0 + ((c1 - c0) - (n - 1) * sp) / 2;
  // location entrances on this edge (lot centres): keep lamp posts out of their way
  const locFronts = L.placed.filter((r) => r.edge === e).map((r) => ({ s: (r.cx - A.x) * dx + (r.cz - A.z) * dz, side: Math.sign((r.cx - A.x) * px + (r.cz - A.z) * pz) }));
  for (let k = 0; k < n; k++) {
    const s0 = off0 + k * sp;
    const sides = (e.kind === 'ring' || e.kind === 'main') ? [1, -1] : [k % 2 ? 1 : -1];
    for (const side of sides) {
      const lf = locFronts.find((f) => f.side === side && Math.abs(f.s - s0) < 3);
      const s = lf ? (s0 < lf.s ? lf.s - 3.5 : lf.s + 3.5) : s0;
      if (desert) {
        if (side === 1 && k % 2 === 0) { const [x, z] = at(s, (e.hw + 2.2) * side); P.woodPole(C, x, z, Math.atan2(-px * side, -pz * side), { lamp: true }); }
        continue;
      }
      const [x, z] = at(s, (e.hw + 0.6) * side);
      const rot = Math.atan2(-px * side, -pz * side);
      P.streetlight(C, x, z, rot, { flicker: rng() < (slum ? 0.12 : dist === 'rustyards' ? 0.08 : 0.03), color: dist === 'hilltop' ? '#ffd9a0' : dist === 'downtown' && k % 3 === 1 ? '#e8f0ff' : '#ffaa55', arm: e.kind === 'ring' ? 3.4 : 2.4, h: e.kind === 'ring' ? 8.5 : 7.2 });
      take(side, s, 0.8);
    }
  }
  // --- power lines (one side, near the building line)
  if ((slum || dist === 'rustyards' || dist === 'dustbowl' || dist === 'blackwater') && e.kind !== 'drag') {
    let prev = null;
    const off = desert ? -(e.hw + 2.2) : -(e.hw + e.sw - 0.5);
    for (let s0 = c0 + 8; s0 < c1; s0 += 38) {
      const lf = locFronts.find((f) => f.side === -1 && Math.abs(f.s - s0) < 4);
      const s = lf ? (s0 < lf.s ? lf.s - 4.5 : lf.s + 4.5) : s0;
      const [x, z] = at(s, off);
      if (!desert && nearLoc(x, z, 0.8)) { prev = null; continue; }
      const pts = P.woodPole(C, x, z, Math.atan2(dx, dz) + Math.PI / 2, {});
      if (prev) for (let i = 0; i < 3; i++) P.wire(C, prev[i], pts[i], 0.8 + rng() * 0.6);
      prev = pts;
    }
  }
  if (desert || dist === 'blackwater') return;
  const curbOff = e.hw + 0.75, backOff = e.hw + e.sw - 0.75;

  // --- hydrant near one corner
  {
    const side = ei % 2 ? 1 : -1, s = c0 + 1.5;
    if (ok(side, s, 0.6)) { const [x, z] = at(s, curbOff * side); P.hydrant(C, x, z); take(side, s, 0.6); }
  }
  // --- bus stop (one per longer edge on busy roads), with a news box downtown
  if (e.sw >= 4 && ['ring', 'main', 'street', 'slum', 'hill'].includes(e.kind) && c1 - c0 > 50) {
    const side = (ei >> 1) % 2 ? 1 : -1;
    for (const f of [0.3, 0.5, 0.7]) {
      const s = c0 + (c1 - c0) * f;
      const [x, z] = at(s, (e.hw + e.sw - 1.0) * side);
      if (!ok(side, s, 2.4) || nearLoc(x, z, 4)) continue;
      P.busStop(C, x, z, Math.atan2(-px * side, -pz * side)); take(side, s, 2.4);
      if (dist === 'downtown' && ok(side, s + 3.4, 0.9)) { const [nx, nz] = at(s + 3.4, (e.hw + e.sw - 0.6) * side); if (!nearLoc(nx, nz, 1.2)) { P.newsBoxes(C, nx, nz, Math.atan2(-px * side, -pz * side)); take(side, s + 3.4, 0.9); } }
      break;
    }
  }
  // --- one trash can per side at mid-block (by the curb)
  for (const side of [1, -1]) {
    if ((dist === 'hilltop' || dist === 'rustyards') && side === -1) continue;
    for (const s of [(c0 + c1) / 2 + 2 * side, (c0 + c1) / 2 + 6 * side]) {
      if (!ok(side, s, 0.6)) continue;
      const [x, z] = at(s, curbOff * side); P.trashCan(C, x, z); take(side, s, 0.6); break;
    }
  }
  // --- hilltop: a bench per side facing the road
  if (dist === 'hilltop' && e.sw >= 4) for (const side of [1, -1]) {
    const s = c0 + (c1 - c0) * (side > 0 ? 0.62 : 0.38);
    const [x, z] = at(s, backOff * side);
    if (ok(side, s, 1.2) && !nearLoc(x, z, 1.5)) { P.bench(C, x, z, Math.atan2(-px * side, -pz * side)); take(side, s, 1.2); }
  }
  // --- gutterside grime: a pile of bags against the building line, the odd fire barrel
  if (slum) for (const side of [1, -1]) {
    if (rng() < 0.5) continue;
    const s = c0 + (c1 - c0) * (0.2 + rng() * 0.6);
    const [x, z] = at(s, backOff * side);
    if (ok(side, s, 1.2) && !nearLoc(x, z, 2)) { P.trashPile(C, x, z, 3); take(side, s, 1.2); }
  }
  if (slum && rng() < 0.2) {
    const side = rng() < 0.5 ? 1 : -1, s = c0 + (c1 - c0) * (0.3 + rng() * 0.4);
    const [x, z] = at(s, backOff * side);
    if (ok(side, s, 0.8) && !nearLoc(x, z, 2)) { P.fireBarrel(C, x, z); take(side, s, 0.8); }
  }
  // --- parked cars in the parking lane (kept clear of bus stops and corners)
  if (e.park) {
    const p = slum ? 0.45 : dist === 'downtown' ? 0.35 : 0.3;
    for (const side of [1, -1]) {
      for (let s = c0 + 4; s < c1 - 4; s += 9) {
        if (rng() > p * 0.35) continue;
        if (used[side].some(([a, b]) => Math.abs(a - s) < b + 3.5)) continue;
        const [x, z] = at(s, e.park * side);
        C.ctx = 'parked';
        P.wreck(C, x, z, Math.atan2(dx * side, dz * side), { burnt: slum && rng() < 0.2, blocks: slum && rng() < 0.15 });
        C.ctx = 'street';
        s += 6;
      }
    }
  }
  // --- one manhole, one puddle in the gutter
  if (c1 - c0 > 30) { const [x, z] = at((c0 + c1) / 2, (ei % 3 - 1) * e.hw * 0.35); P.manhole(C, x, z, (dist === 'downtown' || slum) && ei % 4 === 0); }
  if (rng() < 0.5 && (slum || dist === 'rustyards')) { const side = rng() < 0.5 ? 1 : -1, s = c0 + (c1 - c0) * (0.2 + rng() * 0.6); const [x, z] = at(s, (e.hw - 1.4) * side); P.puddle(C, x, z, 0.8 + rng() * 1.2, rng() * 6); }
}
