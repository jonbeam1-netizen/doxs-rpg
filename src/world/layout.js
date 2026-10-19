import { mulberry32 } from '../core/util.js';
import { LOCATIONS } from '../data/locations.js';
import { ISLE_X0, ISLE_KINDS, ISLE_SEGMENTS, ISLE_RESERVED, ISLE_FILL, isleLotOk } from './island-layout.js';

// Deterministic city layout (pure data, no THREE). Every co-op client builds
// the identical Rotwell from WORLD_SEED.
//
// Coordinates: +X = east, -Z = north. Downtown is the square inside the Ring
// (|x|,|z| <= 240). Outside it, four diagonal avenues split the map into
// wedges: Hilltop (north), Rustyards (east, docks/water at x >= 620),
// Gutterside (south, start) and the Dustbowl (west desert).

export const WORLD_SEED = 0xD0C5_2077;
export const HALF = 700;
export const BOUND = 690;
export const WATER_X = 620;
export const RING = 240;

export function districtAt(x, z) {
  if (x > ISLE_X0) return 'blackwater';
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax <= 252 && az <= 252) return 'downtown';
  if (ax > az) return x > 0 ? 'rustyards' : 'dustbowl';
  return z < 0 ? 'hilltop' : 'gutterside';
}

// Road kinds: half width (hw), sidewalk width (sw), lane offsets (from centerline, per direction)
export const KINDS = {
  ring: { hw: 11, sw: 5, lanes: [2.6, 7.4], marks: 'ring', light: 30 },
  main: { hw: 8, sw: 5, lanes: [2.6], park: 6.3, marks: 'double', light: 28 },
  street: { hw: 7, sw: 5, lanes: [2.6], park: 5.4, marks: 'double', light: 26 },
  slum: { hw: 6.2, sw: 4, lanes: [2.6], park: 4.8, marks: 'faded', light: 36 },
  hill: { hw: 6.5, sw: 4, lanes: [2.6], park: 5, marks: 'dashwhite', light: 34 },
  yard: { hw: 8, sw: 3.5, lanes: [3.0], park: 6.4, marks: 'double', light: 40 },
  dock: { hw: 8, sw: 4, lanes: [3.0], park: 6.4, marks: 'double', light: 34 },
  diag: { hw: 9, sw: 4, lanes: [2.6, 6.4], marks: 'ring', light: 34 },
  desert: { hw: 6.5, sw: 0, lanes: [2.6], marks: 'faded', light: 80 },
  drag: { hw: 9, sw: 0, lanes: [2.6, 6.4], marks: 'drag', light: 40 },
  ...ISLE_KINDS,
};

function buildSegments() {
  const S = [];
  const r = (x1, z1, x2, z2, kind, name) => S.push({ x1, z1, x2, z2, kind, name, ...KINDS[kind] });
  // The Ring
  r(-RING, -RING, RING, -RING, 'ring', 'The Ring'); r(RING, -RING, RING, RING, 'ring', 'The Ring');
  r(RING, RING, -RING, RING, 'ring', 'The Ring'); r(-RING, RING, -RING, -RING, 'ring', 'The Ring');
  // Main St (N-S through everything) and Rust Ave / Route 9 (E-W)
  r(0, -620, 0, 640, 'main', 'Main St');
  r(-690, 0, 580, 0, 'main', 'Route 9');
  // Downtown grid
  for (const v of [-160, -80, 80, 160]) {
    r(v, -RING, v, RING, 'street', 'Downtown');
    r(-RING, v, RING, v, 'street', 'Downtown');
  }
  // Diagonal avenues (district borders)
  r(RING, RING, 580, 580, 'diag', 'Southeast Blvd'); r(RING, -RING, 580, -580, 'diag', 'Northeast Blvd');
  r(-RING, -RING, -620, -620, 'diag', 'Northwest Hwy'); r(-RING, RING, -640, 640, 'diag', 'Southwest Hwy');
  // Gutterside (south): tight slum grid
  for (const z of [320, 400, 480, 560]) r(-z, z, z, z, 'slum', 'Gutterside');
  r(-640, 640, 580, 640, 'slum', 'Bottom St');
  for (const x of [-80, 80, -160, 160]) r(x, RING, x, 640, 'slum', 'Gutterside');
  for (const x of [-320, 320, -400, 400, -480, 480, -560, 560]) r(x, Math.abs(x), x, 640, 'slum', 'Gutterside');
  // Hilltop (north): big estate blocks
  r(-360, -360, 360, -360, 'hill', 'Hilltop'); r(-480, -480, 480, -480, 'hill', 'Hilltop');
  r(-620, -620, 580, -620, 'hill', 'Crest Rd');
  for (const x of [-120, 120]) r(x, -RING, x, -620, 'hill', 'Hilltop');
  for (const x of [-240, 240, -360, 360]) r(x, -360, x, -620, 'hill', 'Hilltop');
  for (const x of [-480, 480]) r(x, -480, x, -620, 'hill', 'Hilltop');
  // Rustyards (east)
  for (const z of [-120, 120]) r(RING, z, 580, z, 'yard', 'Rustyards');
  for (const z of [-360, 360]) r(360, z, 580, z, 'yard', 'Rustyards');
  for (const z of [-480, 480]) r(480, z, 580, z, 'yard', 'Rustyards');
  r(340, -340, 340, 340, 'yard', 'Rustyards'); r(460, -460, 460, 460, 'yard', 'Rustyards');
  r(580, -620, 580, 640, 'dock', 'Dock Rd');
  // Dustbowl (west)
  r(-360, -360, -360, 360, 'desert', 'Old Mill Rd');
  r(-540, -420, -540, 120, 'desert', 'Bunker Rd');
  r(-360, 120, -540, 120, 'desert', 'Trailer Row');
  r(-360, -200, -540, -200, 'desert', 'Scrap Ln');
  r(-360, 260, -680, 260, 'drag', 'Drag Strip');
  // Blackwater Isle (appended last so the city's node/edge order is unchanged)
  for (const [x1, z1, x2, z2, kind, name] of ISLE_SEGMENTS) r(x1, z1, x2, z2, kind, name);
  return S;
}

// ------------------------------------------------------------------ graph
function buildGraph(segs) {
  const cuts = segs.map(() => [0, 1]);
  const EPS = 0.6;
  for (let i = 0; i < segs.length; i++) {
    const A = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const B = segs[j];
      const rx = A.x2 - A.x1, rz = A.z2 - A.z1, sx = B.x2 - B.x1, sz = B.z2 - B.z1;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) > 1e-6) {
        const qx = B.x1 - A.x1, qz = B.z1 - A.z1;
        const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
        const la = Math.hypot(rx, rz), lb = Math.hypot(sx, sz);
        if (t > -EPS / la && t < 1 + EPS / la && u > -EPS / lb && u < 1 + EPS / lb) {
          cuts[i].push(Math.max(0, Math.min(1, t))); cuts[j].push(Math.max(0, Math.min(1, u)));
        }
      }
    }
  }
  const nodes = [];
  const grid = new Map();
  const nodeAt = (x, z) => {
    const kx = Math.round(x / 2), kz = Math.round(z / 2);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = grid.get((kx + a) + ',' + (kz + b));
      if (arr) for (const id of arr) if (Math.hypot(nodes[id].x - x, nodes[id].z - z) < 1.2) return id;
    }
    const id = nodes.length;
    nodes.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, edges: [], links: [] });
    const k = kx + ',' + kz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
    return id;
  };
  const edges = [];
  const edgeInfo = [];
  segs.forEach((s, si) => {
    const ts = [...new Set(cuts[si].map((t) => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b);
    let prev = null;
    for (const t of ts) {
      const id = nodeAt(s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t);
      if (prev != null && prev !== id) {
        const A = nodes[prev], B = nodes[id];
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        if (len > 1) {
          const ei = edges.length;
          edges.push([prev, id]);
          const dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
          const axis = Math.abs(dx) < 1e-4 ? 'z' : Math.abs(dz) < 1e-4 ? 'x' : null;
          edgeInfo.push({ a: prev, b: id, seg: si, kind: s.kind, name: s.name, hw: s.hw, sw: s.sw, lanes: s.lanes, park: s.park, marks: s.marks, light: s.light, len, dx, dz, axis, district: districtAt((A.x + B.x) / 2, (A.z + B.z) / 2) });
          A.edges.push(ei); B.edges.push(ei); A.links.push(id); B.links.push(prev);
        }
      }
      prev = id;
    }
  });
  return { nodes, edges, edgeInfo };
}

// Per edge end: how far back from the node the curbs (per side) and markings must stop.
function computeClearances(G) {
  const { nodes, edgeInfo } = G;
  for (const e of edgeInfo) {
    e.clear = [null, null]; // [atA, atB] each { mark, curbL, curbR }
    for (let end = 0; end < 2; end++) {
      const nId = end === 0 ? e.a : e.b;
      const N = nodes[nId];
      // direction from node along this edge
      const ux = end === 0 ? e.dx : -e.dx, uz = end === 0 ? e.dz : -e.dz;
      let mark = 0, curb = [0, 0]; // side 0 = left (+perp), 1 = right
      for (const oi of N.edges) {
        if (edgeInfo[oi] === e) continue;
        const f = edgeInfo[oi];
        const fx = f.a === nId ? f.dx : -f.dx, fz = f.a === nId ? f.dz : -f.dz;
        const cos = ux * fx + uz * fz;
        const sin = ux * fz - uz * fx; // >0: f is to the left (perp = (-uz, ux))
        if (Math.abs(sin) < 0.2) continue; // collinear continuation
        const as = Math.abs(sin);
        mark = Math.max(mark, (f.hw + f.sw * 0.6 + e.hw * Math.abs(cos)) / as + 1.0);
        const side = sin > 0 ? 0 : 1;
        curb[side] = Math.max(curb[side], (f.hw + e.hw * cos) / as);
      }
      e.clear[end] = { mark: Math.min(mark, 45), curb: [Math.max(0, Math.min(curb[0], 45)), Math.max(0, Math.min(curb[1], 45))], deg: N.edges.length };
    }
  }
}

// ------------------------------------------------------------------ geometry helpers
function segRectDist(x1, z1, x2, z2, r) {
  // distance between segment and axis-aligned rect r {x0,z0,x1,z1}
  const inside = (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  if (inside(x1, z1) || inside(x2, z2)) return 0;
  // segment-rect edge intersection
  const edges = [[r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0]];
  for (const [a, b, c, d] of edges) if (segsIntersect(x1, z1, x2, z2, a, b, c, d)) return 0;
  let m = Infinity;
  for (const [a, b] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) m = Math.min(m, pointSegDist(a, b, x1, z1, x2, z2));
  m = Math.min(m, pointRectDist(x1, z1, r), pointRectDist(x2, z2, r));
  return m;
}
function pointRectDist(x, z, r) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); return Math.hypot(dx, dz); }
export function pointSegDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1; const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - x1) * dx + (pz - z1) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}
function segsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}

class RectIndex {
  constructor(cell = 40) { this.cell = cell; this.map = new Map(); this.list = []; }
  _keys(r, fn) { const c = this.cell; for (let x = Math.floor(r.x0 / c); x <= Math.floor(r.x1 / c); x++) for (let z = Math.floor(r.z0 / c); z <= Math.floor(r.z1 / c); z++) fn(x + ',' + z); }
  add(r) { this.list.push(r); this._keys(r, (k) => { let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(r); }); }
  hits(r, margin = 0) {
    let hit = null;
    const q = { x0: r.x0 - margin, z0: r.z0 - margin, x1: r.x1 + margin, z1: r.z1 + margin };
    this._keys(q, (k) => { if (hit) return; const a = this.map.get(k); if (a) for (const o of a) if (o.x0 < q.x1 && o.x1 > q.x0 && o.z0 < q.z1 && o.z1 > q.z0) { hit = o; return; } });
    return hit;
  }
}

// ------------------------------------------------------------------ location specs
// w = frontage, d = depth, anchor = where we'd like it, setback = gap to sidewalk
export const LOC_SPECS = {
  roach_motel: { w: 36, d: 16, ax: 30, az: 330, setback: 2.4 },
  greasy_spoon: { w: 21, d: 14, ax: -40, az: 330 },
  gutter_liquor: { w: 15, d: 14, ax: 120, az: 400 },
  ink_stinks: { w: 12, d: 14, ax: -120, az: 400 },
  madame_ooze: { w: 12, d: 12, ax: -200, az: 480 },
  hobo_camp: { open: true },
  lucky_larrys: { w: 15, d: 14, ax: 200, az: 330 },
  rats_clubhouse: { w: 24, d: 22, ax: -60, az: 545 },

  rusty_nail: { w: 18, d: 16, ax: -120, az: 40 },
  iron_lung: { w: 30, d: 24, ax: 40, az: -40 },
  first_bank: { w: 30, d: 24, ax: 40, az: 120 },
  st_mercy: { w: 51, d: 40, ax: -120, az: -120 },
  rotwell_pd: { w: 42, d: 32, ax: 120, az: -120 },
  gas_n_gulp: { w: 36, d: 30, ax: 200, az: 200 },
  pizza_butt: { w: 15, d: 14, ax: -40, az: 200 },
  lemon_lot: { w: 48, d: 34, ax: -200, az: 200 },
  bang_bros: { w: 15, d: 16, ax: 120, az: 40 },
  threads: { w: 18, d: 16, ax: -40, az: 120 },
  library: { w: 42, d: 30, ax: -200, az: -40 },
  city_hall: { w: 51, d: 46, ax: -40, az: -40 },
  skid_row_apts: { w: 24, d: 20, ax: 200, az: 40 },

  rotwell_u: { w: 72, d: 50, ax: -180, az: -420 },
  golden_tooth: { w: 78, d: 54, ax: 60, az: -300 },
  club_velvet: { w: 30, d: 24, ax: -60, az: -300 },
  grimco: { w: 36, d: 36, ax: 180, az: -420 },
  holy_rebate: { w: 30, d: 40, ax: -60, az: -540 },
  syndicate_lounge: { w: 30, d: 26, ax: 300, az: -540 },
  hilltop_penthouse: { w: 30, d: 30, ax: 60, az: -540 },
  hilltop_mansion: { w: 80, d: 70, ax: -300, az: -500, setback: 0.6 },

  meat_plant: { w: 80, d: 60, ax: 400, az: -200 },
  chop_chop: { w: 30, d: 24, ax: 300, az: 60 },
  the_pit: { w: 36, d: 30, ax: 400, az: 180 },
  dock_loft: { w: 30, d: 24, ax: 520, az: -60 },
  fuel_fumes: { w: 36, d: 30, ax: 300, az: -60 },
  warehouse_13: { w: 48, d: 36, ax: 520, az: 300 },

  double_wide: { w: 24, d: 20, ax: -450, az: 135 },
  dirty_spur: { w: 30, d: 24, ax: -300, az: -30 },
  junkyard: { w: 70, d: 60, ax: -440, az: -70 },
  drag_strip: { special: 'drag' },
  bunker: { w: 100, d: 96, ax: -600, az: -420, setback: 2 },
  dusty_pump: { w: 36, d: 30, ax: -620, az: 20 },
};

// Generic fill styles per district
const FILL = {
  downtown: { w: [15, 33], d: [21, 30], gapP: 0.18, gap: [3, 5], setback: [0.4, 0.8] },
  gutterside: { w: [12, 24], d: [12, 24], gapP: 0.4, gap: [2, 5], setback: [0.4, 1.2] },
  hilltop: { w: [36, 60], d: [32, 54], gapP: 1, gap: [4, 10], setback: [0.6, 0.6] },
  rustyards: { w: [30, 66], d: [24, 50], gapP: 1, gap: [4, 10], setback: [0.6, 3] },
  dustbowl: { w: [14, 30], d: [12, 26], gapP: 1, gap: [12, 45], setback: [3, 10] },
  blackwater: ISLE_FILL,
};

// ------------------------------------------------------------------ main
export function buildLayout() {
  const rng = mulberry32(WORLD_SEED);
  const rr = (a, b) => a + rng() * (b - a);
  const snap3 = (v) => Math.max(3, Math.round(v / 3) * 3);

  const segs = buildSegments();
  const G = buildGraph(segs);
  computeClearances(G);
  const { nodes, edgeInfo } = G;

  // Spatial index of edges for clearance checks
  const ecell = 50, egrid = new Map();
  edgeInfo.forEach((e, i) => {
    const A = nodes[e.a], B = nodes[e.b];
    const pad = e.hw + e.sw + 2;
    const x0 = Math.min(A.x, B.x) - pad, x1 = Math.max(A.x, B.x) + pad, z0 = Math.min(A.z, B.z) - pad, z1 = Math.max(A.z, B.z) + pad;
    for (let x = Math.floor(x0 / ecell); x <= Math.floor(x1 / ecell); x++) for (let z = Math.floor(z0 / ecell); z <= Math.floor(z1 / ecell); z++) {
      const k = x + ',' + z; if (!egrid.has(k)) egrid.set(k, []); egrid.get(k).push(i);
    }
  });
  const nearEdges = (r) => {
    const out = new Set();
    for (let x = Math.floor(r.x0 / ecell); x <= Math.floor(r.x1 / ecell); x++) for (let z = Math.floor(r.z0 / ecell); z <= Math.floor(r.z1 / ecell); z++) {
      const a = egrid.get(x + ',' + z); if (a) for (const i of a) out.add(i);
    }
    return out;
  };
  const roadClear = (r, extra = 0.3) => {
    for (const i of nearEdges(r)) {
      const e = edgeInfo[i], A = nodes[e.a], B = nodes[e.b];
      if (segRectDist(A.x, A.z, B.x, B.z, r) < e.hw + Math.max(e.sw, 1.5) + extra - 0.05) return false;
    }
    return true;
  };

  const occupied = new RectIndex(40);
  const reserved = [];
  const reserve = (x0, z0, x1, z1, tag) => { const r = { x0, z0, x1, z1, tag, reserved: true }; occupied.add(r); reserved.push(r); return r; };

  // ---- special zones
  reserve(591, -700, 700, 700, 'docks');                    // dock apron + water
  reserve(-420, 424, 420, 456, 'overpass');                 // elevated highway corridor (gutterside)
  reserve(-680, 236, -380, 248.5, 'bleachers');             // drag strip stands (north side)
  reserve(-680, 271.5, -400, 282, 'dragpits');              // pit area south side
  reserve(-680, 183, -368, 207, 'track'); reserve(-686, 183, -650, 236, 'track'); reserve(-392, 200, -368, 236, 'track'); // race loop
  reserve(-1000, -1000, 1000, -BOUND, 'edge'); reserve(-1000, BOUND, 1000, 1000, 'edge');
  reserve(-1000, -1000, -BOUND, 1000, 'edge');
  for (const [x0, z0, x1, z1, tag] of ISLE_RESERVED) reserve(x0, z0, x1, z1, tag);

  const inBounds = (r) => (r.x0 > ISLE_X0 ? isleLotOk(r) : (r.x0 > -BOUND + 1 && r.x1 < BOUND - 1 && r.z0 > -BOUND + 1 && r.z1 < BOUND - 1));

  // Frontage rect for an axis-aligned edge e, side s (+1/-1), along-position s0 (left edge), width w, depth d.
  // Returns rect + facing data. n = unit normal from road toward the lot.
  const frontRect = (e, side, s0, w, d, setback) => {
    const A = nodes[e.a];
    const nx = -e.dz * side, nz = e.dx * side;
    const f = e.hw + e.sw + setback;
    const cx = A.x + e.dx * (s0 + w / 2) + nx * (f + d / 2), cz = A.z + e.dz * (s0 + w / 2) + nz * (f + d / 2);
    const halfX = Math.abs(e.dx) * w / 2 + Math.abs(nx) * d / 2, halfZ = Math.abs(e.dz) * w / 2 + Math.abs(nz) * d / 2;
    return {
      x0: cx - halfX, z0: cz - halfZ, x1: cx + halfX, z1: cz + halfZ, cx, cz, w, d,
      fx: -nx, fz: -nz, rot: Math.atan2(-nx, -nz), // front normal (toward road) + rotation of local +Z
      facadeX: A.x + e.dx * (s0 + w / 2) + nx * f, facadeZ: A.z + e.dz * (s0 + w / 2) + nz * f,
      edge: e, setback,
    };
  };
  const fits = (r) => inBounds(r) && !occupied.hits(r, 0.01) && roadClear(r);

  const axisEdges = edgeInfo.filter((e) => e.axis && e.kind !== 'drag' && e.kind !== 'bridge');

  // ---- locations
  const placed = [];
  const locSpots = {};
  for (const L of LOCATIONS) {
    const spec = LOC_SPECS[L.id];
    if (!spec || spec.open || spec.special) continue;
    let best = null, bestD = Infinity;
    for (const e of axisEdges) {
      const A = nodes[e.a];
      // quick reject far edges
      if (pointSegDist(spec.ax, spec.az, A.x, A.z, nodes[e.b].x, nodes[e.b].z) > 160) continue;
      for (const side of [1, -1]) for (let s0 = 0; s0 + spec.w <= e.len; s0 += 2) {
        const r = frontRect(e, side, s0, spec.w, spec.d, spec.setback ?? (e.sw < 2 ? 2.5 : 0.6));
        const dd = Math.hypot(r.facadeX - spec.ax, r.facadeZ - spec.az);
        if (dd >= bestD) continue;
        if (districtAt(r.cx, r.cz) !== L.district) continue;
        if (!fits(r)) continue;
        best = r; bestD = dd;
      }
    }
    if (!best) { console.warn('[world] could not place', L.id); continue; }
    best.kind = 'location'; best.loc = L; best.district = L.district;
    occupied.add(best); placed.push(best); locSpots[L.id] = best;
  }

  // ---- generic lots
  const lots = [];
  const sortedEdges = [...axisEdges].sort((a, b) => (a.seg - b.seg) || (a.a - b.a));
  for (const e of sortedEdges) {
    for (const side of [1, -1]) {
      let s0 = rr(0, 4);
      while (s0 < e.len - 6) {
        // district of the lot side
        const A = nodes[e.a];
        const px = A.x + e.dx * s0 - e.dz * side * (e.hw + e.sw + 10), pz = A.z + e.dz * s0 + e.dx * side * (e.hw + e.sw + 10);
        const dist = districtAt(px, pz);
        const F = FILL[dist];
        let w = snap3(rr(F.w[0], F.w[1]));
        const setback = rr(F.setback[0], F.setback[1]);
        let ok = null;
        for (let tries = 0; tries < 3 && !ok; tries++) {
          for (let d = snap3(rr(F.d[0], F.d[1])); d >= Math.min(F.d[0], 12); d -= 3) {
            const r = frontRect(e, side, s0, w, d, setback);
            if (fits(r)) { ok = r; break; }
          }
          if (!ok) w = snap3(w * 0.7);
          if (w < 9) break;
        }
        if (ok) {
          ok.district = districtAt(ok.cx, ok.cz);
          ok.kind = 'lot';
          ok.seed = Math.floor(rng() * 1e9);
          occupied.add(ok); lots.push(ok);
          s0 += ok.w + (rng() < F.gapP ? rr(F.gap[0], F.gap[1]) : 0);
        } else s0 += 3;
      }
    }
  }

  // Assign lot types
  for (const l of lots) {
    const r = rng();
    const big = l.w * l.d;
    switch (l.district) {
      case 'downtown': l.type = r < 0.07 ? 'parking' : r < 0.11 ? 'plaza' : 'building'; break;
      case 'gutterside': l.type = r < 0.13 ? 'vacant' : r < 0.19 ? 'burnt' : r < 0.24 ? 'parking' : 'building'; break;
      case 'hilltop': l.type = r < 0.14 ? 'park' : r < 0.3 ? 'apartments' : 'mansion'; break;
      case 'rustyards': l.type = r < 0.22 ? 'containers' : r < 0.34 ? 'tanks' : r < 0.4 ? 'vacant' : 'warehouse'; break;
      case 'dustbowl': l.type = r < 0.45 ? 'trailer' : r < 0.65 ? 'shack' : r < 0.8 ? 'junk' : 'empty'; break;
      case 'blackwater': l.type = r < 0.5 ? 'isle_shack' : r < 0.68 ? 'isle_bait' : r < 0.84 ? 'isle_nets' : 'isle_boathouse'; break;
      default: l.type = 'building';
    }
    if (l.type === 'building' && big < 120) l.type = l.district === 'gutterside' ? 'vacant' : 'parking';
  }

  // ---- open scatter points (in empty ground away from roads & lots)
  const isFree = (x, z, rad = 2) => {
    const r = { x0: x - rad, z0: z - rad, x1: x + rad, z1: z + rad };
    return inBounds(r) && !occupied.hits(r) && roadClear(r, 0.5);
  };

  // ---- sidewalk strips (for NPC spawning)
  const walks = [];
  for (const e of edgeInfo) {
    if (e.sw < 2) continue;
    const A = nodes[e.a];
    const c0 = e.clear[0].mark + 2, c1 = e.len - e.clear[1].mark - 2;
    if (c1 - c0 < 4) continue;
    for (const side of [1, -1]) {
      const off = (e.hw + e.sw / 2) * side;
      walks.push({ x1: A.x + e.dx * c0 - e.dz * off, z1: A.z + e.dz * c0 + e.dx * off, x2: A.x + e.dx * c1 - e.dz * off, z2: A.z + e.dz * c1 + e.dx * off, len: c1 - c0, width: e.sw, district: e.district });
    }
  }

  return {
    seed: WORLD_SEED, segs, nodes, edges: G.edges, edgeInfo, lots, placed, locSpots, reserved, walks,
    occupied, isFree, roadClear, nearEdges, fits, rng,
  };
}
