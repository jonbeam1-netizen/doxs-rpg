import { mulberry32 } from '../core/util.js';
import { mulCol, mixCol, lin } from './geo.js';
import * as P from './props.js';
import { doorUV, signUV } from './textures.js';

// Generic buildings for every lot type. Local frame for a lot: origin at the
// lot center, +Z = the street-facing front, X = along the street.

const FLOOR = 3.5, STORE = 4.5;
const pick = (r, a) => a[Math.floor(r() * a.length)];

// Walls + roof + parapet for one box-shaped mass. y0 = base height.
export function mass(C, { W, D, H, y0 = 0, x = 0, z = 0, facade, store = null, tint = '#ffffff', roof = 'roof', parapet = 0.9, cornice = false, faces = 'fbrl', uo = 0 }) {
  const g = C.geo;
  const vo = Math.round(C.rng() * 3) * 0.25;
  const S = [12, 14];
  if (store != null && y0 === 0 && H > STORE + 1) {
    // storefront band on the front, regular facade above and around
    g.box('store' + store, x, STORE / 2, z, W, STORE, D, { faces: 'f', uvScale: [12, STORE], uvOff: [uo, 0], color: tint });
    g.box('f_' + facade, x, STORE + (H - STORE) / 2, z, W, H - STORE, D, { faces: 'f', uvScale: S, uvOff: [uo, vo - STORE / 14], color: tint });
    g.box('f_' + facade, x, H / 2, z, W, H, D, { faces: faces.replace('f', ''), uvScale: S, uvOff: [uo, vo], color: tint });
    g.box('props', x, STORE + 0.15, z + D / 2 + 0.15, W + 0.1, 0.3, 0.3, { color: mulCol(tint, 0.35) }); // band ledge
  } else {
    g.box('f_' + facade, x, y0 + H / 2, z, W, H, D, { faces, uvScale: S, uvOff: [uo, vo - y0 / 14], color: tint });
  }
  const top = y0 + H;
  g.box(roof, x, top - 0.01, z, W, 0.02, D, { faces: 't', uvScale: 8, color: '#ffffff' });
  if (parapet > 0) {
    const pc = mulCol(tint, 0.55), t = 0.35;
    g.box('props', x, top + parapet / 2, z + D / 2 - t / 2, W, parapet, t, { color: pc });
    g.box('props', x, top + parapet / 2, z - D / 2 + t / 2, W, parapet, t, { color: pc });
    g.box('props', x + W / 2 - t / 2, top + parapet / 2, z, t, parapet, D - 2 * t, { color: pc });
    g.box('props', x - W / 2 + t / 2, top + parapet / 2, z, t, parapet, D - 2 * t, { color: pc });
  }
  if (cornice) g.box('props', x, top - 0.25, z, W + 0.7, 0.5, D + 0.7, { color: mulCol(tint, 0.45), faces: 'fbrlu' });
  return top;
}

function rooftop(C, lot, W, D, top, { tank = 0.2, ac = 2, bulk = true, antenna = 0.1, billboard = 0 } = {}) {
  const g = C.geo, r = C.rng;
  // convert local->world helper
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wx = (lx, lz) => lot.cx + lx * cs + lz * sn, wz = (lx, lz) => lot.cz - lx * sn + lz * cs;
  for (let i = 0; i < ac; i++) { const lx = (r() - 0.5) * (W - 4), lz = (r() - 0.5) * (D - 4); P.acUnit(C, wx(lx, lz), top, wz(lx, lz), lot.rot); }
  if (bulk && W > 8 && D > 8) { g.frame(lot.cx, lot.cz, lot.rot); g.box('f_concrete', -W / 4, top + 1.4, -D / 4, 3, 2.8, 3.5, { uvScale: [12, 14], color: '#a09a90' }); g.box('roof', -W / 4, top + 2.8, -D / 4, 3, 0.02, 3.5, { faces: 't', uvScale: 8 }); }
  if (r() < tank && W > 8) { const lx = W / 4 * (r() < 0.5 ? 1 : -1), lz = (r() - 0.5) * (D / 3); P.rooftopTank(C, wx(lx, lz), top, wz(lx, lz)); }
  if (r() < antenna) P.antenna(C, wx(W / 3, -D / 3), top, wz(W / 3, -D / 3), 6 + r() * 10, true);
  if (r() < billboard && W > 14) P.billboard(C, wx(0, 0), wz(0, 0), lot.rot + (r() < 0.5 ? 0 : Math.PI / 2), { h: top + 4, w: Math.min(16, W * 0.8) });
}

function fireEscape(C, W, D, H, side = 1) {
  const g = C.geo;
  const fx = side * (W / 2 + 0.6);
  const floors = Math.floor((H - STORE) / FLOOR);
  const col = '#1e1c1a';
  const z0 = -D / 4;
  for (let f = 1; f <= floors; f++) {
    const y = STORE + (f - 1) * FLOOR + 0.2;
    g.push(); g.rotY(side > 0 ? 0 : 0);
    g.box('metal', fx, y, z0, 1.2, 0.08, 5, { color: col });
    g.box('metal', fx + side * 0.58, y + 0.5, z0, 0.04, 1.0, 5, { color: col });
    g.box('metal', fx + side * 0.58, y + 1.0, z0, 0.06, 0.06, 5, { color: col });
    g.pop();
    if (f < floors) { g.push(); g.translate(fx, y + FLOOR / 2, z0); g.rotX(Math.atan2(FLOOR, 3.6)); g.box('metal', 0, 0, 0, 0.7, 0.06, Math.hypot(FLOOR, 3.6), { color: col }); g.pop(); }
  }
}

function sideGraffiti(C, lot, W, D, n) {
  for (let i = 0; i < n; i++) {
    const g = C.geo;
    g.frame(lot.cx, lot.cz, lot.rot);
    const face = C.rng();
    const sz = 2 + C.rng() * 2.5;
    if (face < 0.5) { const x = (C.rng() - 0.5) * (W - sz); g.push(); g.translate(x, 0, D / 2 + 0.02); P.graffitiAt(C, sz, 0.3 + C.rng() * 0.6); g.pop(); }
    else { const s = face < 0.75 ? 1 : -1; g.push(); g.translate(s * (W / 2 + 0.02), 0, (C.rng() - 0.5) * (D - sz)); g.rotY(s * Math.PI / 2); P.graffitiAt(C, sz, 0.3 + C.rng() * 0.6); g.pop(); }
  }
}

// ------------------------------------------------------------------ lot builders
export function buildLot(C, lot) {
  const prevR = C.rng;
  C.rng = mulberry32(lot.seed);
  C.geo.reset(); C.geo.lock(lot.cx, lot.cz);
  try {
    (LOT[lot.type] ?? LOT.building)(C, lot);
  } catch (e) { console.error('[world] lot failed', lot.type, e); }
  C.geo.reset();
  C.rng = prevR;
}

const LOT = {
  building(C, lot) {
    const r = C.rng, g = C.geo;
    const W = lot.w, D = lot.d;
    const dist = lot.district;
    if (dist === 'downtown') {
      const c = 1 - Math.max(Math.abs(lot.cx), Math.abs(lot.cz)) / 250;
      const tower = c > 0.12 && r() < 0.4 + c * 0.55 && W >= 15 && D >= 18;
      if (tower) {
        const H = 30 + Math.round(r() * 62 * (0.35 + 0.65 * Math.min(1, c * 1.3)) / FLOOR) * FLOOR;
        const facade = pick(r, ['glass', 'glass', 'glass_green', 'concrete', 'brownstone']);
        const tint = facade.startsWith('glass') ? '#ffffff' : pick(r, ['#ffffff', '#e8e0d0', '#d8d8e0']);
        g.frame(lot.cx, lot.cz, lot.rot);
        const baseH = STORE + FLOOR * (2 + Math.floor(r() * 3));
        mass(C, { W, D, H: baseH, facade: facade.startsWith('glass') ? 'concrete' : facade, store: 0, tint: '#ddd8d0', cornice: true, parapet: 0.6 });
        let w = W - 3 - r() * 3, d = D - 3 - r() * 3, y = baseH;
        let h = H - baseH;
        const tiers = r() < 0.5 ? 2 : 1;
        for (let t = 0; t < tiers; t++) {
          const th = tiers === 2 && t === 0 ? h * (0.55 + r() * 0.2) : h;
          g.frame(lot.cx, lot.cz, lot.rot);
          mass(C, { W: w, D: d, H: th, y0: y, facade, tint, parapet: 1.1, faces: 'fbrl' });
          y += th; h -= th; w -= 4 + r() * 3; d -= 4 + r() * 3;
          if (w < 8 || d < 8) break;
        }
        rooftop(C, lot, Math.max(8, w + 4), Math.max(8, d + 4), y, { ac: 3, antenna: 0.6, tank: 0 });
        g.frame(lot.cx, lot.cz, lot.rot);
        g.translate(0, 0, D / 2); P.doorway(C, 0, 3.2, 3.2, 4, { lamp: true, awning: null }); // lobby
        // neon crown on some
        if (r() < 0.35) { g.frame(lot.cx, lot.cz, lot.rot); const nc = pick(r, ['#ff2a6a', '#2affc8', '#ffaa20', '#6a8aff']); g.box('neon', 0, y + 1.3, (d + 4) / 2 + 0.05, Math.max(6, w + 4) - 1, 0.25, 0.1, { color: nc }); }
        C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
        return;
      }
      const floors = 2 + Math.floor(r() * 5 * (0.4 + c));
      const H = STORE + floors * FLOOR;
      const facade = pick(r, ['brick_red', 'brick_dirty', 'concrete', 'brownstone', 'brick_red', 'stone']);
      const tint = pick(r, ['#ffffff', '#e8dcd0', '#d8d0c8', '#f0e8e0']);
      g.frame(lot.cx, lot.cz, lot.rot);
      const top = mass(C, { W, D, H, facade, store: r() < 0.8 ? 0 : null, tint, cornice: r() < 0.6 });
      shopFront(C, lot, W, D, 0.75);
      if (r() < 0.35) { g.frame(lot.cx, lot.cz, lot.rot); fireEscape(C, W, D, H, r() < 0.5 ? 1 : -1); }
      rooftop(C, lot, W, D, top, { tank: 0.35, ac: 2, billboard: 0.12, antenna: 0.1 });
      if (r() < 0.25) bladeSign(C, lot, W, D, H);
      sideGraffiti(C, lot, W, D, r() < 0.4 ? 1 : 0);
      C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
      return;
    }
    if (dist === 'gutterside') {
      const floors = 1 + Math.floor(r() * 4);
      const H = (r() < 0.55 ? STORE : FLOOR) + floors * FLOOR;
      const facade = pick(r, ['tenement', 'tenement', 'brick_dirty', 'brick_red', 'wood', 'industrial']);
      const tint = pick(r, ['#ffffff', '#d8ccbc', '#c8bca8', '#e0d0c0']);
      g.frame(lot.cx, lot.cz, lot.rot);
      const top = mass(C, { W, D, H, facade, store: r() < 0.55 ? 1 : null, tint, cornice: r() < 0.3, parapet: 0.7 });
      shopFront(C, lot, W, D, 0.5, true);
      if (r() < 0.55 && H > 8) { g.frame(lot.cx, lot.cz, lot.rot); fireEscape(C, W, D, H, r() < 0.5 ? 1 : -1); }
      rooftop(C, lot, W, D, top, { tank: 0.3, ac: 1 + (r() * 3 | 0), billboard: 0.08, antenna: 0.05 });
      if (r() < 0.12) bladeSign(C, lot, W, D, H);
      sideGraffiti(C, lot, W, D, 1 + (r() * 3 | 0));
      backClutter(C, lot, W, D);
      C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
      return;
    }
    // fallback
    g.frame(lot.cx, lot.cz, lot.rot);
    const H = STORE + FLOOR * (1 + Math.floor(r() * 3));
    mass(C, { W, D, H, facade: 'brick_dirty' });
    C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
  },

  burnt(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    const H = FLOOR * (2 + Math.floor(r() * 3));
    g.frame(lot.cx, lot.cz, lot.rot);
    // shell walls (thin) with no roof, blackened
    const t = 0.5, tint = '#4a4038';
    for (const [x, z, w, d] of [[0, D / 2 - t / 2, W, t], [0, -D / 2 + t / 2, W, t], [W / 2 - t / 2, 0, t, D], [-W / 2 + t / 2, 0, t, D]]) {
      g.box('f_tenement', x, H / 2, z, w, H * (0.75 + r() * 0.25), d, { uvScale: [12, 14], color: tint });
    }
    g.plane('decal_dark', -W / 2 + t, -D / 2 + t, W / 2 - t, D / 2 - t, 0.05, { color: '#1a1612', uv: 'world', uvScale: 8 });
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    for (let i = 0; i < 3; i++) { const lx = (r() - 0.5) * W * 0.5, lz = (r() - 0.5) * D * 0.5; P.junkPile(C, lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs, 0.8); }
    if (r() < 0.6) C.emit(lot.cx, 2, lot.cz, 'smoke');
    if (r() < 0.5) P.fireBarrel(C, lot.cx + cs * 2, lot.cz - sn * 2);
    // collision: the four walls
    C.obbLocal(lot, 0, D / 2 - t / 2, W, t, H); C.obbLocal(lot, 0, -D / 2 + t / 2, W, t, H);
    C.obbLocal(lot, W / 2 - t / 2, 0, t, D, H); C.obbLocal(lot, -W / 2 + t / 2, 0, t, D, H);
    g.frame(lot.cx, lot.cz, lot.rot); P.graffitiAt(C, 3, 0.5, D / 2 + 0.3);
  },

  vacant(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('decal_dark', -W / 2, -D / 2, W / 2, D / 2, 0.03, { color: '#3a3226', uv: 'world', uvScale: 8 });
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    // chain-link along the front, gap in the middle
    if (r() < 0.75) {
      const gap = 3 + r() * 3, gx = (r() - 0.5) * (W - gap - 4);
      const a = wp(-W / 2, D / 2 - 0.3), b = wp(gx - gap / 2, D / 2 - 0.3), c = wp(gx + gap / 2, D / 2 - 0.3), d = wp(W / 2, D / 2 - 0.3);
      P.chainFence(C, a[0], a[1], b[0], b[1], { razor: r() < 0.3 });
      P.chainFence(C, c[0], c[1], d[0], d[1], { razor: r() < 0.3 });
      for (const side of [-1, 1]) { const s0 = wp(side * W / 2, D / 2 - 0.3), s1 = wp(side * W / 2, -D / 2); P.chainFence(C, s0[0], s0[1], s1[0], s1[1], {}); }
    }
    const n = 2 + (r() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const [x, z] = wp((r() - 0.5) * (W - 4), (r() - 0.5) * (D - 4));
      const k = r();
      if (k < 0.25) P.junkPile(C, x, z, 0.7);
      else if (k < 0.4) P.tires(C, x, z, 2 + (r() * 3 | 0));
      else if (k < 0.55) P.mattress(C, x, z, r() * 6);
      else if (k < 0.7 && W > 8) P.wreck(C, x, z, r() * 6, { burnt: r() < 0.4, blocks: r() < 0.5 });
      else if (k < 0.82) P.fireBarrel(C, x, z);
      else if (k < 0.9) P.deadTree(C, x, z, 0.8);
      else P.tent(C, x, z, r() * 6);
    }
    weeds(C, lot, 18);
    if (r() < 0.25 && W > 12) { const [x, z] = wp(0, -D / 2 + 1.5); P.billboard(C, x, z, lot.rot, { h: 8 + r() * 4, w: Math.min(14, W - 2) }); }
  },

  parking(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('asphalt', -W / 2, -D / 2, W / 2, D / 2, 0.035, { uv: 'world', uvScale: 14, color: '#c8c4bc' });
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    for (let x = -W / 2 + 1.5; x < W / 2 - 2; x += 2.8) {
      g.frame(lot.cx, lot.cz, lot.rot);
      g.strip('marking', x, -D / 2 + 1, x, -D / 2 + 6, 0.12, 0.06, { color: '#a8a498' });
      if (r() < 0.25) { const [wx, wz] = wp(x + 1.4, -D / 2 + 3.5); P.wreck(C, wx, wz, lot.rot + Math.PI + (r() - 0.5) * 0.2, { burnt: r() < 0.15 }); }
    }
    const [bx, bz] = wp(W / 2 - 2, D / 2 - 2.5);
    g.frame(bx, bz, lot.rot); g.box('metal', 0, 1.2, 0, 1.8, 2.4, 1.8, { color: '#4a4a42' }); g.box('glassdark', 0, 1.6, 0.92, 1.4, 0.8, 0.04, { color: '#606060' });
    C.solid(bx - 1, bz - 1, bx + 1, bz + 1, 2.4);
    const [lx, lz] = wp(-W / 2 + 1, D / 2 - 1); P.streetlight(C, lx, lz, lot.rot + Math.PI, { flicker: r() < 0.4 });
    for (let i = 0; i < 3; i++) { const [x, z] = wp((r() - 0.5) * W * 0.8, (r() - 0.5) * D * 0.8); P.puddle(C, x, z, 1 + r() * 2, r() * 6); }
    if (r() < 0.4) { const [x, z] = wp(-W / 2 + 2, -D / 2 + 2); P.dumpster(C, x, z, lot.rot); }
  },

  plaza(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('sidewalk', -W / 2, -D / 2, W / 2, D / 2, 0.03, { uv: 'world', uvScale: 6, color: '#c8c0b0' });
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    // statue of the city founder, frequently pooped upon
    g.frame(lot.cx, lot.cz, lot.rot);
    g.box('f_stone', 0, 1.2, 0, 3, 2.4, 3, { uvScale: [12, 14], color: '#c8c0b0' });
    g.box('props', 0, 2.5, 0, 3.4, 0.2, 3.4, { color: '#7a7466' });
    const bronze = '#3a4a3a';
    g.box('metal', 0, 3.6, 0, 0.4, 2, 0.4, { color: bronze });
    g.sphere('metal', 0, 5, 0, 0.45, 8, 6, { color: bronze });
    g.push(); g.translate(0.3, 4.4, 0); g.rotZ(-2.2); g.box('metal', 0, 0.6, 0, 0.2, 1.4, 0.2, { color: bronze }); g.pop();
    g.push(); g.translate(-0.3, 4.4, 0); g.rotZ(0.4); g.box('metal', 0, -0.6, 0, 0.2, 1.4, 0.2, { color: bronze }); g.pop();
    g.box('props', 0, 5.48, 0, 0.6, 0.08, 0.5, { color: '#e8e4d8' });
    C.solid(lot.cx - 1.6, lot.cz - 1.6, lot.cx + 1.6, lot.cz + 1.6, 5);
    for (const [lx, lz] of [[-W / 3, D / 3], [W / 3, D / 3], [-W / 3, -D / 3], [W / 3, -D / 3]]) {
      const [x, z] = wp(lx, lz);
      g.frame(x, z, 0); g.box('f_concrete', 0, 0.4, 0, 2.2, 0.8, 2.2, { uvScale: [12, 14] }); C.solid(x - 1.1, z - 1.1, x + 1.1, z + 1.1, 0.8);
      P.deadTree(C, x, z, 0.8, { solid: false });
    }
    for (let i = 0; i < 2; i++) { const [x, z] = wp((i ? 1 : -1) * W / 5, D / 2 - 2); P.bench(C, x, z, lot.rot + Math.PI); }
    P.litter(C, lot.cx, lot.cz, Math.min(W, D) / 2.5, 10);
  },

  park(C, lot) {
    const r = C.rng, W = lot.w, D = lot.d;
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    for (let i = 0; i < 6 + (r() * 6 | 0); i++) { const [x, z] = wp((r() - 0.5) * (W - 4), (r() - 0.5) * (D - 4)); P.deadTree(C, x, z, 1 + r() * 0.5); }
    for (let i = 0; i < 2; i++) { const [x, z] = wp((r() - 0.5) * W * 0.6, D / 2 - 3); P.bench(C, x, z, lot.rot + Math.PI); }
    if (r() < 0.5) { // gazebo
      const g = C.geo; g.frame(lot.cx, lot.cz, lot.rot);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.cyl('wood', Math.cos(a) * 3, 1.5, Math.sin(a) * 3, 0.12, 0.12, 3, 5, { color: '#d8d0c0' }); }
      g.cyl('shingle', 0, 3.6, 0, 0.2, 4, 1.4, 6, {});
      g.cyl('wood', 0, 0.1, 0, 3.3, 3.3, 0.2, 6, { color: '#8a7a60' });
    }
  },

  mansion(C, lot) { mansion(C, lot, {}); },

  apartments(C, lot) {
    const r = C.rng, g = C.geo;
    const W = lot.w - 6, D = Math.min(lot.d - 6, 28);
    const floors = 4 + Math.floor(r() * 6);
    const H = STORE + floors * FLOOR;
    const facade = pick(r, ['stucco', 'brownstone', 'stucco_pink', 'stone']);
    g.frame(lot.cx, lot.cz, lot.rot);
    g.translate(0, 0, lot.d / 2 - D / 2 - 3);
    mass(C, { W, D, H, facade, cornice: true });
    for (let f = 1; f < floors; f++) for (let x = -W / 2 + 3; x < W / 2 - 2; x += 6) { // balconies
      g.box('props', x, STORE + f * FLOOR - 1.2, D / 2 + 0.6, 2.6, 0.12, 1.2, { color: '#8a8478' });
      g.box('metal', x, STORE + f * FLOOR - 0.7, D / 2 + 1.18, 2.6, 0.9, 0.05, { color: '#2a2622' });
    }
    g.push(); g.translate(0, 0, D / 2); P.doorway(C, 0, 2.6, 3, 4, { lamp: true, awning: '#4a1a1a' }); g.pop();
    const t = lot.d / 2 - D / 2 - 3;
    C.obbLocal(lot, 0, t, W, D, H);
    rooftop(C, { ...lot, cx: lot.cx + Math.sin(lot.rot) * t, cz: lot.cz + Math.cos(lot.rot) * t }, W, D, H, { ac: 3, antenna: 0.3 });
    hedgesAround(C, lot);
  },

  warehouse(C, lot) { warehouse(C, lot, {}); },

  containers(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('sidewalk', -W / 2, -D / 2, W / 2, D / 2, 0.03, { uv: 'world', uvScale: 6, color: '#8a867c' });
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    const cols = ['#8a2a1a', '#2a4a6a', '#5a6a3a', '#a06a1a', '#3a3a3a', '#6a2a4a', '#2a6a6a', '#7a7a70'];
    for (let x = -W / 2 + 3; x < W / 2 - 2.5; x += 3.2) {
      for (let z = -D / 2 + 7.5; z < D / 2 - 7; z += 13) {
        if (r() < 0.2) continue;
        const n = 1 + (r() * 3.5 | 0);
        const [wx, wz] = wp(x, z);
        for (let k = 0; k < n; k++) P.container(C, wx + (r() - 0.5) * 0.2, k * 2.6, wz, lot.rot + (r() - 0.5) * 0.03, pick(r, cols), { solid: k === 0 });
      }
    }
    // front fence with gate
    const a = wp(-W / 2, D / 2 - 0.4), b = wp(-3, D / 2 - 0.4), c = wp(3, D / 2 - 0.4), d = wp(W / 2, D / 2 - 0.4);
    P.chainFence(C, a[0], a[1], b[0], b[1], { razor: true }); P.chainFence(C, c[0], c[1], d[0], d[1], { razor: true });
    const [mx, mz] = wp(W / 2 - 1.5, D / 2 - 2);
    P.streetlight(C, mx, mz, lot.rot + Math.PI, { h: 12, arm: 1.5, color: '#e8f0ff' });
  },

  tanks(C, lot) {
    const r = C.rng, W = lot.w, D = lot.d;
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    const R = Math.min(W, D) / 4.5;
    const pts = [];
    for (let x = -W / 2 + R + 2; x < W / 2 - R - 1; x += R * 2 + 3) {
      const [tx, tz] = wp(x, (r() - 0.5) * (D - 2 * R - 6));
      P.tank(C, tx, tz, R, 6 + r() * 10, pick(r, ['#6a5a4c', '#7a6a58', '#5a5a52', '#6a4a3a']));
      pts.push([tx, tz]);
    }
    const g = C.geo;
    for (let i = 1; i < pts.length; i++) { g.identity(); const [ax, az] = pts[i - 1], [bx, bz] = pts[i]; g.frame(ax, az, Math.atan2(bx - ax, bz - az)); g.push(); g.translate(0, 3, Math.hypot(bx - ax, bz - az) / 2); g.rotX(Math.PI / 2); g.cyl('rust', 0, 0, 0, 0.35, 0.35, Math.hypot(bx - ax, bz - az), 6, { color: '#5a4a3a' }); g.pop(); }
    const a = wp(-W / 2, D / 2 - 0.4), b = wp(W / 2 - 6, D / 2 - 0.4);
    P.chainFence(C, a[0], a[1], b[0], b[1], { razor: true });
    const [sx, sz] = wp(W / 2 - 3, D / 2 - 3); C.emit(sx, 1, sz, 'steam');
  },

  trailer(C, lot) { trailer(C, lot, {}); },

  shack(C, lot) {
    const r = C.rng, g = C.geo;
    const W = Math.min(lot.w - 4, 9 + r() * 4), D = Math.min(lot.d - 4, 7 + r() * 3);
    const z = lot.d / 2 - D / 2 - 2;
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, z);
    g.box('f_wood', 0, 1.6, 0, W, 3.2, D, { faces: 'fbrl', uvScale: [12, 14], color: '#c8b8a0' });
    g.push(); g.translate(0, 3.4, 0); g.rotX(0.12); g.box('corr', 0, 0, 0, W + 1, 0.1, D + 1.2, { uvScale: 3, color: '#a89a88' }); g.pop();
    g.translate(0, 0, D / 2); P.doorway(C, -W / 4, 1.1, 2.3, 5, { lamp: r() < 0.5 });
    C.obbLocal(lot, 0, z, W, D, 3.4);
    desertJunk(C, lot, 3);
  },

  junk(C, lot) {
    const r = C.rng;
    const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
    const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
    for (let i = 0; i < 3; i++) { const [x, z] = wp((r() - 0.5) * (lot.w - 6), (r() - 0.5) * (lot.d - 6)); P.junkPile(C, x, z, 0.8 + r() * 0.6); }
    for (let i = 0; i < 2; i++) { const [x, z] = wp((r() - 0.5) * (lot.w - 6), (r() - 0.5) * (lot.d - 6)); P.wreck(C, x, z, r() * 6, { burnt: r() < 0.5, blocks: r() < 0.6 }); }
    desertJunk(C, lot, 4);
  },

  empty(C, lot) { desertJunk(C, lot, 5); },
};

function weeds(C, lot, n) {
  const g = C.geo, r = C.rng;
  for (let i = 0; i < n; i++) {
    const lx = (r() - 0.5) * lot.w, lz = (r() - 0.5) * lot.d;
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(lx, 0, lz); g.rotY(r() * 6);
    const h = 0.3 + r() * 0.6, col = r() < 0.5 ? '#4a4a2a' : '#5a4a2a';
    g.tri('props_d', [-0.3, 0, 0], [0.3, 0, 0], [0, h, 0.05], [0, 0, 1, 0, 0.5, 1], col);
    g.tri('props_d', [0, 0, -0.3], [0, 0, 0.3], [0.05, h * 0.9, 0], [0, 0, 1, 0, 0.5, 1], col);
  }
}

function hedgesAround(C, lot) {
  const r = C.rng;
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
  for (const s of [-1, 1]) { const [x, z] = wp(s * (lot.w / 2 - 1), 0); P.hedge(C, x, z, 1.4, lot.d - 4, 1.3 + r() * 0.6, lot.rot); }
}

function desertJunk(C, lot, n) {
  const r = C.rng;
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
  for (let i = 0; i < n; i++) {
    const [x, z] = wp((r() - 0.5) * (lot.w - 3), (r() - 0.5) * (lot.d - 3));
    const k = r();
    if (k < 0.35) P.cactus(C, x, z, 0.8 + r() * 0.5);
    else if (k < 0.6) P.rock(C, x, z, 0.4 + r() * 1.2);
    else if (k < 0.75) P.tires(C, x, z, 1 + (r() * 3 | 0));
    else if (k < 0.85) P.oilDrums(C, x, z, 2);
    else P.litter(C, x, z, 2, 5);
  }
}

function backClutter(C, lot, W, D) {
  const r = C.rng;
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  // behind the building (alley side) if the lot has space there: put dumpster beside the building
  if (r() < 0.5) {
    const s = r() < 0.5 ? 1 : -1;
    const lx = s * (W / 2 + 1.6), lz = D / 2 - 3;
    const x = lot.cx + lx * cs + lz * sn, z = lot.cz - lx * sn + lz * cs;
    if (C.layout.isFree(x, z, 1.4)) P.dumpster(C, x, z, lot.rot + Math.PI / 2 * s);
  }
}

// Storefront dressing: shop signs, awnings, doors.
export function shopFront(C, lot, W, D, signP = 0.6, grimy = false) {
  const g = C.geo, r = C.rng;
  g.frame(lot.cx, lot.cz, lot.rot);
  const bays = Math.max(1, Math.floor(W / 6));
  for (let i = 0; i < bays; i++) {
    const cx = -W / 2 + (i + 0.5) * (W / bays);
    if (r() < signP) P.shopSign(C, cx, 4.9, D / 2, Math.min(5.5, W / bays - 0.6));
    if (r() < (grimy ? 0.25 : 0.35)) {
      const col = pick(r, ['#5a1a1a', '#1a3a2a', '#2a2a4a', '#5a4a1a', '#3a1a3a']);
      g.push(); g.translate(cx, 4.1, D / 2); g.rotX(0.38);
      g.box('props', 0, 0, 0.75, Math.min(5.6, W / bays - 0.4), 0.06, 1.6, { color: col });
      g.pop();
    }
  }
  if (r() < 0.5) { g.push(); g.translate(0, 0, D / 2); P.doorway(C, (r() - 0.5) * (W - 4), 1.3, 2.5, grimy ? pick(r, [0, 1, 5, 1]) : pick(r, [0, 1, 2]), { lamp: r() < 0.6 }); g.pop(); }
}

function bladeSign(C, lot, W, D, H) {
  const g = C.geo, r = C.rng;
  g.frame(lot.cx, lot.cz, lot.rot);
  const s = r() < 0.5 ? 1 : -1;
  const x = s * (W / 2 - 1.2), y = STORE + 1.5 + r() * Math.max(0, H - STORE - 10), h = 6;
  const nc = pick(r, ['#ff2a5a', '#2affc0', '#ffb020', '#ff40ff', '#40a0ff']);
  g.box('metal', x, y + h / 2, D / 2 + 1.2, 0.35, h, 1.8, { color: '#1a1814' });
  g.push(); g.translate(x, y + h / 2, D / 2 + 1.2); g.rotY(Math.PI / 2); g.rotZ(Math.PI / 2);
  const uv = signUV((r() * 32) | 0);
  g.wall('signs', -h / 2, -0.75, h / 2, 0.75, 0.18, { uvRect: uv });
  g.rotY(Math.PI); g.wall('signs', -h / 2, -0.75, h / 2, 0.75, 0.18, { uvRect: uv });
  g.pop();
  g.box(r() < 0.3 ? 'neon_flk' : 'neon', x, y + h + 0.1, D / 2 + 1.2, 0.12, 0.12, 1.9, { color: nc });
  g.box('neon', x, y - 0.1, D / 2 + 1.2, 0.12, 0.12, 1.9, { color: nc });
}

// ------------------------------------------------------------------ bigger shared builders
export function mansion(C, lot, { facade = null, house = null, gateDoor = 7, name = null } = {}) {
  const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
  const fac = facade ?? pick(r, ['stucco', 'stucco_pink', 'brownstone', 'stone']);
  // perimeter wall with gate gap (front center)
  const gate = 6;
  const corners = [wp(-W / 2, D / 2), wp(-gate / 2, D / 2), wp(gate / 2, D / 2), wp(W / 2, D / 2), wp(W / 2, -D / 2), wp(-W / 2, -D / 2)];
  const wallOpts = { h: 2.4, mat: 'f_stone', color: '#b8b0a0' };
  P.wallRun(C, corners[0][0], corners[0][1], corners[1][0], corners[1][1], wallOpts);
  P.wallRun(C, corners[2][0], corners[2][1], corners[3][0], corners[3][1], wallOpts);
  P.wallRun(C, corners[3][0], corners[3][1], corners[4][0], corners[4][1], wallOpts);
  P.wallRun(C, corners[4][0], corners[4][1], corners[5][0], corners[5][1], wallOpts);
  P.wallRun(C, corners[5][0], corners[5][1], corners[0][0], corners[0][1], wallOpts);
  // gate pillars + lamps + iron gate half-open
  g.frame(lot.cx, lot.cz, lot.rot);
  for (const s of [-1, 1]) {
    g.box('f_stone', s * (gate / 2 + 0.5), 1.6, D / 2, 1.1, 3.2, 1.1, { uvScale: [12, 14], color: '#c8c0b0' });
    g.box('lamp', s * (gate / 2 + 0.5), 3.5, D / 2, 0.45, 0.5, 0.45, { color: '#ffd090' });
    g.box('metal', s * (gate / 2 + 0.5), 3.85, D / 2, 0.6, 0.1, 0.6, { color: '#111' });
    const [lx, lz] = wp(s * (gate / 2 + 0.5), D / 2 + 0.3);
    C.light(lx, 3.6, lz, '#ffc070', 'door');
  }
  g.push(); g.translate(-gate / 2, 0, D / 2); g.rotY(-0.9); g.quad('chain', [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], null);
  for (let i = 0; i <= 8; i++) g.box('metal', 0, 1.2, i * 0.32, 0.05, 2.4, 0.05, { color: '#151515' });
  g.box('metal', 0, 2.3, 1.3, 0.06, 0.08, 2.7, { color: '#151515' }); g.box('metal', 0, 0.3, 1.3, 0.06, 0.08, 2.7, { color: '#151515' });
  g.pop();
  // lawn + driveway
  g.plane('decal_dark', -W / 2 + 0.3, -D / 2 + 0.3, W / 2 - 0.3, D / 2 - 0.3, 0.02, { uv: 'world', uvScale: 8, color: '#5a5a30' });
  const HW = house?.w ?? Math.min(W - 12, 22 + r() * 14), HD = house?.d ?? Math.min(D * 0.5, 14 + r() * 6);
  const hz = -D / 2 + HD / 2 + 4;
  g.frame(lot.cx, lot.cz, lot.rot);
  g.strip('asphalt', 0, D / 2, 0, hz + HD / 2, 4.5, 0.035, { uv: 'world', uvScale: 14, color: '#b0aca4' });
  // house
  const floors = house?.floors ?? (2 + (r() < 0.3 ? 1 : 0));
  const H = floors * FLOOR + 0.6;
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, hz);
  mass(C, { W: HW, D: HD, H, facade: fac, parapet: 0, cornice: true, tint: '#ffffff' });
  g.gable('shingle', 0, H, 0, HW + 1.2, 4 + r() * 2, HD + 1.2, { color: pick(r, ['#ffffff', '#c8a8a0', '#a8b0b8']), endMat: 'f_' + fac, uvScale: 3 });
  // wings
  if (r() < 0.6 && HW > 24) for (const s of [-1, 1]) {
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(s * (HW / 2 + 4), 0, hz + 1);
    mass(C, { W: 8, D: HD - 4, H: H - FLOOR, facade: fac, parapet: 0.8, tint: '#e8e0d8' });
    C.obbLocal(lot, s * (HW / 2 + 4), hz + 1, 8, HD - 4, H - FLOOR);
  }
  // portico
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, hz + HD / 2);
  g.box('props', 0, FLOOR + 0.3, 2.2, 8, 0.4, 4.4, { color: '#c8c0b0' });
  for (const s of [-3.4, -1.2, 1.2, 3.4]) g.cyl('props', s, FLOOR / 2 + 0.1, 4, 0.3, 0.34, FLOOR, 8, { color: '#d0c8b8' });
  P.doorway(C, 0, 2.2, 3, gateDoor, { lamp: true });
  for (let i = 0; i < 3; i++) g.box('props', 0, 0.1 + i * 0.12, 0.6 + (2 - i) * 0.5, 7, 0.12 + i * 0.12, 0.5, { color: '#a8a498' });
  C.obbLocal(lot, 0, hz, HW, HD, H + 3);
  // hedges along the inside of the walls, dead fountain, maybe a sad pool
  for (const s of [-1, 1]) { const [x, z] = wp(s * (W / 2 - 2), 0); P.hedge(C, x, z, 1.6, D - 6, 1.8, lot.rot); }
  const fz = hz + HD / 2 + (D / 2 - (hz + HD / 2)) / 2;
  if (D / 2 - (hz + HD / 2) > 12) {
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, fz);
    g.cyl('f_stone', 0, 0.35, 0, 3.2, 3.4, 0.7, 14, { uvScale: 12, color: '#c8c0b0' });
    g.cyl('puddle', 0, 0.62, 0, 2.9, 2.9, 0.02, 14, {});
    g.cyl('props', 0, 1.6, 0, 0.3, 0.5, 2.4, 8, { color: '#a8a090' });
    g.sphere('props', 0, 2.9, 0, 0.6, 8, 4, { half: true, color: '#a8a090' });
    const [fx, fzw] = wp(0, fz); C.solid(fx - 3.3, fzw - 3.3, fx + 3.3, fzw + 3.3, 0.8);
  }
  for (let i = 0; i < 3; i++) { const [x, z] = wp((r() < 0.5 ? -1 : 1) * (W / 2 - 6 - r() * 4), (r() - 0.5) * (D - 14)); if (C.layout.isFree(x, z, 0.1) || true) P.deadTree(C, x, z, 1.1); }
  return { HW, HD, hz, H };
}

export function warehouse(C, lot, { facade = null, doors = true, sign = null } = {}) {
  const r = C.rng, g = C.geo;
  const W = lot.w, D = lot.d;
  const fac = facade ?? pick(r, ['corrugated', 'corrugated_rust', 'corrugated', 'industrial']);
  const H = 9 + Math.floor(r() * 3) * 2;
  g.frame(lot.cx, lot.cz, lot.rot);
  mass(C, { W, D, H, facade: fac, parapet: 0, tint: pick(r, ['#ffffff', '#d8d0c8', '#c8d0d0']) });
  const roofH = 2 + r() * 2;
  g.push(); g.rotY(Math.PI / 2);
  g.gable('corr', 0, H, 0, D + 0.6, roofH, W + 0.6, { color: '#9a948c', endMat: 'f_' + fac, uvScale: 3 });
  g.pop();
  if (doors) {
    const n = Math.max(1, Math.floor(W / 14));
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * (W / n);
      g.wall('doors', cx - 2.5, 0.02, cx + 2.5, 5, D / 2 + 0.05, { uvRect: [0.754, 0.504, 0.996, 0.996] }); // roll-up
      g.box('props', cx, 5.3, D / 2 + 0.1, 5.6, 0.5, 0.2, { color: '#222' });
      g.box('lamp', cx, 5.8, D / 2 + 0.35, 0.6, 0.12, 0.5, { color: '#e8f0ff', faces: 'u' });
      g.box('props', cx - 3, 0.5, D / 2 + 0.4, 0.3, 1, 0.3, { color: '#c0a020' }); // bollards
      g.box('props', cx + 3, 0.5, D / 2 + 0.4, 0.3, 1, 0.3, { color: '#c0a020' });
    }
    g.push(); g.translate(0, 0, D / 2); P.doorway(C, W / 2 - 3, 1.2, 2.4, 1, { lamp: true, lampColor: '#e8f0ff' }); g.pop();
  }
  if (sign !== false) P.shopSign(C, -W / 4, H - 1.5, D / 2, Math.min(10, W / 3), sign ?? undefined);
  C.obb(lot.cx, lot.cz, lot.rot, W, D, H + roofH);
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
  // outside clutter on the sides
  for (let i = 0; i < 3; i++) {
    const s = r() < 0.5 ? 1 : -1;
    const [x, z] = wp(s * (W / 2 + 2), (r() - 0.5) * (D - 4));
    if (!C.layout.isFree(x, z, 1.5)) continue;
    const k = r();
    if (k < 0.4) P.pallets(C, x, z, r() * 6, 2 + (r() * 3 | 0)); else if (k < 0.7) P.oilDrums(C, x, z, 3); else P.dumpster(C, x, z, lot.rot + Math.PI / 2);
  }
  sideGraffiti(C, lot, W, D, r() < 0.6 ? 2 : 0);
  return H;
}

export function trailer(C, lot, { color = null, door = 0 } = {}) {
  const r = C.rng, g = C.geo;
  const TW = 14, TD = 4.6, TH = 3.0;
  const z = Math.min(lot.d / 2 - TD / 2 - 4, 4);
  const along = (r() - 0.5) * Math.max(0, lot.w - TW - 2);
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(along, 0, z);
  const col = color ?? pick(r, ['#ffffff', '#d8d0b8', '#c8d0d8', '#e0c8b0', '#b8c8b0']);
  g.box('props', 0, 0.3, 0, TW - 0.4, 0.6, TD - 0.4, { color: '#5a5650' }); // skirt
  g.box('f_trailer', 0, 0.6 + TH / 2, 0, TW, TH, TD, { faces: 'fbrl', uvScale: [12, 14], color: col });
  g.box('metal', 0, 0.6 + TH + 0.05, 0, TW + 0.2, 0.12, TD + 0.2, { color: mulCol(col, 0.7) });
  g.box('props', 0, 1.2, TD / 2 + 0.01, TW, 0.35, 0.02, { color: pick(r, ['#8a3a2a', '#3a5a7a', '#6a6a2a']), faces: 'f' }); // stripe
  // porch + steps
  g.box('wood', -TW / 4, 0.5, TD / 2 + 1.2, 3.4, 0.15, 2.4, { color: '#7a6a50' });
  for (const s of [-1, 1]) for (const t of [0.2, 2.2]) g.box('wood', -TW / 4 + s * 1.6, 0.25, TD / 2 + t, 0.15, 0.5, 0.15, { color: '#5a4a38' });
  g.box('wood', -TW / 4, 0.25, TD / 2 + 2.6, 1.4, 0.12, 0.6, { color: '#6a5a40' });
  g.push(); g.translate(0, 0.6, TD / 2); P.doorway(C, -TW / 4, 1.0, 2.1, door, { lamp: true, lampColor: '#ffd8a0' }); g.pop();
  // propane tank + dish
  g.push(); g.translate(TW / 2 + 1.2, 0.6, 0); g.rotZ(Math.PI / 2); g.cyl('props', 0, 0, 0, 0.5, 0.5, 1.6, 8, { color: '#d8d0c0' }); g.pop();
  g.push(); g.translate(TW / 3, 0.6 + TH + 0.6, -TD / 4); g.rotX(-0.8); g.cyl('metal', 0, 0, 0, 0.6, 0.1, 0.2, 8, { color: '#c8c8c0' }); g.pop();
  // lawn chairs
  for (let i = 0; i < 2; i++) { g.push(); g.translate(-TW / 4 + 2.6 + i * 1.1, 0, TD / 2 + 3.5); g.rotY(r() - 0.5); g.box('props_d', 0, 0.45, 0, 0.6, 0.05, 0.6, { color: '#2a6a5a' }); g.box('props_d', 0, 0.75, -0.3, 0.6, 0.6, 0.05, { color: '#2a6a5a' }); g.pop(); }
  C.obbLocal(lot, along, z, TW, TD, TH + 0.6);
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  const wp = (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs];
  const [px, pz] = wp(along - TW / 4, z + TD / 2 + 1.6);
  if (r() < 0.6) { const [x, z2] = wp(along + TW / 2 + 3, z + 3); P.wreck(C, x, z2, lot.rot + Math.PI / 2, { blocks: r() < 0.6 }); }
  if (r() < 0.5) { const [x, z2] = wp(along - TW / 2 - 2, z + TD / 2 + 3); P.fireBarrel(C, x, z2); }
  desertJunk(C, lot, 3);
  return { doorX: px, doorZ: pz };
}
