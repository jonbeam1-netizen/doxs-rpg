import { lin, mixCol, mulCol } from './geo.js';
import { districtAt, WATER_X, HALF } from './layout.js';
import * as P from './props.js';

// Ground, road surfaces, sidewalks, curbs, lane markings, crosswalks and the
// street furniture that lines every road.

export const GROUND_COL = {
  downtown: '#6b675f', gutterside: '#4f473b', hilltop: '#5a5838', rustyards: '#4b463f', dustbowl: '#a68e64',
};
const ASPHALT_TINT = { downtown: '#d8d4cc', gutterside: '#c8c0b4', hilltop: '#d0ccc4', rustyards: '#b8b4ac', dustbowl: '#d8c8b0' };
const WALK_TINT = { downtown: '#e0dcd4', gutterside: '#b8ae9c', hilltop: '#d8d4c4', rustyards: '#a8a298', dustbowl: '#c8b498' };

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
  // soften the district seams with a neighbor sample
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
      // per-vertex colors -> emit as 4 single-color quads? use 2 tris with averaged color; cheaper: one quad w/ center color
      const cols = [groundColor(x, z + S), groundColor(x1, z + S), groundColor(x1, z), groundColor(x, z)];
      g.quad('ground', [x, 0, z + S], [x1, 0, z + S], [x1, 0, z], [x, 0, z], 'world', null, { uvScale: 10, colors: cols });
    }
  }
  // dock apron (concrete) and quay wall
  g.plane('sidewalk', 591, -HALF, WATER_X, HALF, 0.02, { uv: 'world', uvScale: 6, color: '#9a968c' });
  g.frame(WATER_X, 0, Math.PI / 2);
  g.box('f_concrete', 0, -2.2, 0, HALF * 2, 4.6, 0.6, { faces: 'f', color: '#7a766c', uvScale: [12, 14] });
  // water
  g.identity();
  g.plane('water', WATER_X, -2600, 2600, 2600, -1.3, {});
}

// Physics for water is added per pier gap in districts.js (piers punch holes).

export function buildRoads(C) {
  const L = C.layout, g = C.geo;
  const { nodes, edgeInfo } = L;
  for (const e of edgeInfo) {
    const A = nodes[e.a], B = nodes[e.b];
    const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
    const otherHw = (nId) => { let m = 0; for (const oi of nodes[nId].edges) { const f = edgeInfo[oi]; if (f !== e) m = Math.max(m, f.hw); } return m; };
    const degA = nodes[e.a].edges.length, degB = nodes[e.b].edges.length;
    const extA = degA > 1 ? otherHw(e.a) : 0, extB = degB > 1 ? otherHw(e.b) : 0;
    const tint = lin(ASPHALT_TINT[e.district] ?? '#d0d0d0');
    g.identity();
    // road surface (overlaps at intersections; world UV hides seams)
    g.strip('asphalt', A.x - dx * extA, A.z - dz * extA, B.x + dx * extB, B.z + dz * extB, e.hw * 2, 0.04, { uv: 'world', uvScale: 14, color: e.kind === 'desert' ? mulCol('#c8b8a0', 0.95) : tint });
    if (e.kind === 'desert' || e.kind === 'drag') {
      // dusty shoulders
      for (const s of [1, -1]) {
        const o = (e.hw + 1.2) * s;
        g.strip('decal_dark', A.x + px * o, A.z + pz * o, B.x + px * o, B.z + pz * o, 2.4, 0.025, { uv: 'world', uvScale: 10, color: '#8a7a5a' });
      }
    }
    if (e.sw > 0) {
      const wt = lin(WALK_TINT[e.district] ?? '#d0d0d0');
      for (const s of [1, -1]) {
        const o = (e.hw + e.sw / 2) * s;
        const ea = degA > 1 ? 0 : -e.sw * 0, eb = degB > 1 ? 0 : 0;
        g.strip('sidewalk', A.x - dx * ea + px * o, A.z - dz * ea + pz * o, B.x + dx * eb + px * o, B.z + dz * eb + pz * o, e.sw, 0.02, { uv: 'world', uvScale: 6, color: wt });
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
    markings(C, e, A, B);
  }
}

function markings(C, e, A, B) {
  const g = C.geo; g.identity();
  const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
  const c0 = e.clear[0].mark, c1 = e.len - e.clear[1].mark;
  const Y = '#c9a232', W = '#d8d4c8';
  const fade = e.district === 'gutterside' || e.district === 'dustbowl' ? 0.55 : e.district === 'rustyards' ? 0.7 : 0.9;
  const line = (off, s0, s1, w, col) => {
    if (s1 - s0 < 0.3) return;
    g.strip('marking', A.x + dx * s0 + px * off, A.z + dz * s0 + pz * off, A.x + dx * s1 + px * off, A.z + dz * s1 + pz * off, w, 0.06, { color: mulCol(col, fade * (0.8 + C.rng() * 0.25)) });
  };
  const dashed = (off, w, col, dash = 3, gap = 6, wear = 0) => {
    for (let s = c0 + 1; s < c1 - dash; s += dash + gap) if (C.rng() > wear) line(off, s, s + dash, w, col);
  };
  const solid = (off, w, col, wear = 0) => {
    if (wear <= 0) { line(off, c0, c1, w, col); return; }
    for (let s = c0; s < c1; s += 8) if (C.rng() > wear) line(off, s, Math.min(c1, s + 8), w, col);
  };
  switch (e.marks) {
    case 'ring':
      solid(0.18, 0.13, Y); solid(-0.18, 0.13, Y);
      for (const s of [1, -1]) { dashed(s * (e.hw / 2 + 0.1), 0.14, W); solid(s * (e.hw - 0.5), 0.14, W, 0.1); }
      break;
    case 'double':
      solid(0.16, 0.12, Y, e.district === 'downtown' ? 0.05 : 0.15); solid(-0.16, 0.12, Y, e.district === 'downtown' ? 0.05 : 0.15);
      if (e.park) for (const s of [1, -1]) dashed(s * (e.park - 1.1), 0.12, W, 1.2, 5.2, 0.2);
      break;
    case 'faded': dashed(0, 0.14, Y, 3, 6, 0.35); break;
    case 'dashwhite': dashed(0, 0.13, W, 3, 7, 0.1); break;
    case 'drag': {
      solid(0, 0.18, W); for (const s of [1, -1]) solid(s * (e.hw - 0.4), 0.18, W);
      // start / finish lines and burnt rubber
      const st = 35, fin = e.len - 20;
      for (const at of [st, fin]) {
        for (let k = -e.hw + 0.5; k < e.hw - 0.5; k += 1) {
          for (let r = 0; r < 2; r++) {
            const col = ((Math.round(k + e.hw) + r) % 2) ? '#e8e4dc' : '#151515';
            const sx = A.x + dx * (at + r * 1.0) + px * (k + 0.5), sz = A.z + dz * (at + r * 1.0) + pz * (k + 0.5);
            g.strip('marking', sx - dx * 0.5, sz - dz * 0.5, sx + dx * 0.5, sz + dz * 0.5, 1, 0.065, { color: col });
          }
        }
      }
      for (const s of [1, -1]) for (let i = 0; i < 8; i++) {
        const o = s * (3.3 + (C.rng() - 0.5) * 1.5), s0 = st + 2 + C.rng() * 10, s1 = s0 + 15 + C.rng() * 50;
        g.strip('decal_dark', A.x + dx * s0 + px * o, A.z + dz * s0 + pz * o, A.x + dx * s1 + px * o, A.z + dz * s1 + pz * o, 0.35, 0.058, { color: '#1a1816' });
      }
      break;
    }
  }
  // crosswalks
  if (['downtown', 'gutterside', 'hilltop'].includes(e.district) && e.kind !== 'desert') {
    for (let end = 0; end < 2; end++) {
      const cl = e.clear[end];
      if (cl.deg < 3 || cl.mark < 5) continue;
      const at = end === 0 ? cl.mark - 2 : e.len - cl.mark + 2;
      for (let k = -e.hw + 0.8; k <= e.hw - 0.8; k += 1.1) {
        if (C.rng() < (e.district === 'gutterside' ? 0.3 : 0.06)) continue;
        const sx = A.x + dx * at + px * k, sz = A.z + dz * at + pz * k;
        g.strip('marking', sx - dx * 1.5, sz - dz * 1.5, sx + dx * 1.5, sz + dz * 1.5, 0.55, 0.062, { color: mulCol(W, fade) });
      }
    }
  }
}

// Street furniture along every road.
export function buildStreetProps(C) {
  const L = C.layout;
  const { nodes, edgeInfo } = L;
  const rng = C.rng;
  for (const e of edgeInfo) {
    const A = nodes[e.a];
    const dx = e.dx, dz = e.dz, px = -dz, pz = dx;
    const at = (s, off) => [A.x + dx * s + px * off, A.z + dz * s + pz * off];
    const c0 = e.clear[0].mark + 3, c1 = e.len - e.clear[1].mark - 3;
    if (c1 - c0 < 6) continue;
    const dist = e.district;
    const slum = dist === 'gutterside';
    const desert = e.kind === 'desert' || e.kind === 'drag';
    // --- lights
    const sp = e.light;
    let k = 0;
    for (let s = c0 + rng() * 6; s < c1; s += sp, k++) {
      const sides = (e.kind === 'ring' || e.kind === 'main') ? [1, -1] : [k % 2 ? 1 : -1];
      for (const side of sides) {
        if (desert) {
          if (side === 1 && k % 2 === 0) { const [x, z] = at(s, (e.hw + 3) * side); P.woodPole(C, x, z, Math.atan2(-px * side, -pz * side), { lamp: true }); }
          continue;
        }
        const [x, z] = at(s, (e.hw + 0.6) * side);
        const rot = Math.atan2(-px * side, -pz * side);
        if (slum && rng() < 0.12) { // dead pole
          C.geo.frame(x, z, rot); C.geo.cyl('metal', 0, 3.7, 0, 0.09, 0.13, 7.4, 6, { color: '#3a3632' }); C.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 7);
          continue;
        }
        P.streetlight(C, x, z, rot, { flicker: rng() < (slum ? 0.28 : dist === 'rustyards' ? 0.2 : 0.08), color: dist === 'hilltop' ? '#ffd9a0' : dist === 'downtown' && rng() < 0.3 ? '#e8f0ff' : '#ffaa55', arm: e.kind === 'ring' ? 3.4 : 2.4, h: e.kind === 'ring' ? 8.5 : 7.2 });
      }
    }
    // --- power lines (one side, near building line)
    if ((slum || dist === 'rustyards' || dist === 'dustbowl') && e.kind !== 'drag') {
      let prev = null;
      const off = desert ? -(e.hw + 4.5) : -(e.hw + e.sw - 0.5);
      for (let s = c0 + 8; s < c1; s += 38) {
        const [x, z] = at(s, off);
        const pts = P.woodPole(C, x, z, Math.atan2(dx, dz) + Math.PI / 2, {});
        if (prev) for (let i = 0; i < 3; i++) if (rng() < 0.92) P.wire(C, prev[i], pts[i], 0.8 + rng() * 1.2);
        prev = pts;
      }
    }
    if (desert) continue;
    // --- clutter on sidewalks
    const bOff = e.hw + e.sw - 0.7, cOff = e.hw + 0.9;
    for (const side of [1, -1]) {
      for (let s = c0 + rng() * 10; s < c1; s += 9 + rng() * 14) {
        const r = rng();
        const rotRoad = Math.atan2(-px * side, -pz * side);
        if (r < (slum ? 0.3 : 0.12)) { const [x, z] = at(s, bOff * side); P.trashPile(C, x, z, 2 + (rng() * 4 | 0)); }
        else if (r < 0.36) { const [x, z] = at(s, (e.hw + 1.2) * side); P.puddle(C, x, z, 0.8 + rng() * 1.4, rng() * 6); }
        else if (r < 0.42 && e.sw >= 4) { const [x, z] = at(s, bOff * side - 0.0); P.bench(C, x, z, rotRoad); }
        else if (r < 0.46 && dist !== 'hilltop') { const [x, z] = at(s, (bOff - 0.2) * side); P.newsBoxes(C, x, z, rotRoad); }
        else if (r < 0.49 && dist !== 'hilltop') { const [x, z] = at(s, (bOff - 0.1) * side); P.phoneBooth(C, x, z, rotRoad); }
        else if (r < 0.52 && e.sw >= 5) { const [x, z] = at(s, (bOff - 0.4) * side); P.busStop(C, x, z, rotRoad); s += 6; }
        else if (r < 0.58) { const [x, z] = at(s, cOff * side); P.hydrant(C, x, z); }
        else if (r < 0.66 && dist === 'hilltop') { const [x, z] = at(s, (e.hw + e.sw / 2) * side); P.deadTree(C, x, z, 0.9); }
        else if (r < 0.7 && slum) { const [x, z] = at(s, bOff * side); P.fireBarrel(C, x, z); }
        else if (r < 0.74 && slum) { const [x, z] = at(s, bOff * side); P.shoppingCart(C, x, z, rng() * 6); }
        else if (r < 0.8) { const [x, z] = at(s, (e.hw + e.sw / 2) * side); P.litter(C, x, z, 1.5, 4); }
        // parked wrecks in the parking lane
        if (e.park && rng() < (slum ? 0.12 : dist === 'downtown' ? 0.05 : 0.07)) {
          const [x, z] = at(s + 4, e.park * side);
          if (!C.layout.nearNode || true) P.wreck(C, x, z, Math.atan2(dx * side, dz * side) + (rng() - 0.5) * 0.08, { burnt: slum && rng() < 0.25, blocks: rng() < 0.2 });
        }
      }
    }
    // --- manholes / drains / road puddles
    for (let s = c0 + 10 + rng() * 20; s < c1 - 5; s += 45 + rng() * 40) {
      const [x, z] = at(s, (rng() - 0.5) * e.hw * 0.8);
      P.manhole(C, x, z, (dist === 'downtown' || slum) && rng() < 0.4);
    }
    for (let s = c0 + rng() * 20; s < c1; s += 20 + rng() * 30) {
      const side = rng() < 0.5 ? 1 : -1;
      const [x, z] = at(s, (e.hw - 1.0 - rng() * 1.5) * side);
      P.puddle(C, x, z, 0.8 + rng() * 2.2, rng() * 6);
    }
    // --- graffiti/oil stains on asphalt
    for (let s = c0 + rng() * 15; s < c1; s += 25 + rng() * 35) {
      const [x, z] = at(s, (rng() - 0.5) * e.hw * 1.4);
      C.geo.frame(x, z, rng() * 6);
      C.geo.disc('decal_dark', 0, 0.055, 0, 0.6 + rng() * 1.6, 8, { color: '#141210' });
    }
  }
  // traffic lights at downtown/hilltop intersections (blinking amber forever — the city stopped paying)
  for (const e of edgeInfo) {
    if (!['downtown', 'hilltop'].includes(e.district) || e.kind === 'desert') continue;
    for (let end = 0; end < 2; end++) {
      const cl = e.clear[end];
      if (cl.deg < 3) continue;
      const N = nodes[end === 0 ? e.a : e.b];
      const ux = end === 0 ? e.dx : -e.dx, uz = end === 0 ? e.dz : -e.dz;
      // pole on the right side of traffic approaching the node
      const rx = uz, rz = -ux; // right of the approaching direction (-u)
      const s = Math.max(cl.curb[0], cl.curb[1]) + 1.2;
      const x = N.x + ux * s + rx * (e.hw + 0.7), z = N.z + uz * s + rz * (e.hw + 0.7);
      P.trafficLight(C, x, z, Math.atan2(-rx, -rz));
    }
  }
}
