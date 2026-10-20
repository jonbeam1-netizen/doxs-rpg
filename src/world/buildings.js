import { mulberry32 } from '../core/util.js';
import { mulCol } from './geo.js';
import * as P from './props.js';
import { shopUV, SHOP_CELL } from './textures.js';

// Generic buildings for every lot type. Local frame for a lot: origin at the
// lot center, +Z = the street-facing front, X = along the street.
//
// Facade rules (keep the city cohesive):
// - ONE window system per wall: windows live in the facade texture, on a grid
//   fitted to the wall (whole bays across, whole floors up). Never add 3D
//   windows on top of a windowed texture.
// - Ground floor shops are built from storefront bays (display / door /
//   shutter / blank) that line up with the window bays above.
// - One sign per shop, on the fascia band. One awning at most.
// - Roofs: parapet (+ optional cornice), then a tidy row of rooftop kit.

export const FLOOR = 3.5, STORE = 4.5;
const pick = (r, a) => a[Math.floor(r() * a.length)];

const SHOP_TINT = {
  downtown: ['#7a9480', '#a05a4a', '#5a6a8a', '#8a7a60', '#c8c0b0', '#4a4a4a', '#6a4a5a'],
  gutterside: ['#8a7a6a', '#6a6a5a', '#7a5a4a', '#5a5a5a', '#6a7a6a'],
  default: ['#8a8070', '#6a6a60', '#7a6050'],
};

export function fitBays(len, bay = 3) { const n = Math.max(1, Math.round(len / bay)); return { n, w: len / n }; }

// Lay out shops across nb bays. Returns cells per bay + shop list.
export function planShops(r, nb, { closedP = 0.2, clear = null } = {}) {
  const cells = new Array(nb).fill(SHOP_CELL.warm);
  const shops = [];
  let i = 0, k = 0;
  while (i < nb) {
    let len = nb <= 4 ? nb : 2 + Math.floor(r() * 2);
    if (nb - (i + len) === 1) len += 1;
    len = Math.min(len, nb - i);
    const b0 = i, b1 = i + len - 1;
    const closed = r() < closedP;
    const disp = closed ? SHOP_CELL.shutter : pick(r, [SHOP_CELL.warm, SHOP_CELL.warm, SHOP_CELL.cool, SHOP_CELL.goods]);
    const door = len === 1 ? b0 : (k % 2 ? b1 : b0);
    for (let b = b0; b <= b1; b++) cells[b] = b === door ? (closed ? SHOP_CELL.steel : SHOP_CELL.door) : disp;
    shops.push({ b0, b1, door, closed });
    i += len; k++;
  }
  return { cells, shops };
}

// Walls + storefront + roof + parapet for one box-shaped mass. y0 = base height.
// store: null | { tint, cells?, shops?: bool, district?, closedP?, residential?: bool }
//   residential: plain ground floor (no shop windows) with a belt ledge.
// doors: [{ x, w }] local x of 3D doors on the front wall: their bays get a
//   blank ground floor (no painted window / shop window behind the door).
export function mass(C, { W, D, H, y0 = 0, x = 0, z = 0, facade, store = null, doors = null, fascia = 0, tint = '#ffffff', roof = 'roof', parapet = 0.9, cornice = false, faces = 'fbrl' }) {
  const g = C.geo;
  const fmat = 'f_' + facade;
  const pmat = C.mats.M['w_' + facade] ? 'w_' + facade : fmat;
  const bw = fitBays(W), bd = fitBays(D);
  const suW = bw.w * 4, suD = bd.w * 4;
  const hasStore = store != null && store !== false && y0 === 0 && H >= STORE + 1.5;
  const base = hasStore ? STORE + fascia : 0; // plain band below the window grid
  const gridH = H - base;
  const noGrid = gridH < 2.6; // too short for a row of windows: plain wall
  const fl = Math.max(1, Math.round(gridH / FLOOR));
  const fh = gridH / fl;
  const sv = fh * 4;
  const yb0 = y0 + base; // window grid origin
  const ov = -yb0 / sv;
  const upper = noGrid ? pmat : fmat;
  const off = { r: -W, b: -(W + D), l: -(2 * W + D) };
  const face = (mat, f, yb, yt) => {
    if (yt - yb < 0.01) return;
    const su = f === 'b' ? suW : suD;
    g.box(mat, x, (yb + yt) / 2, z, W, yt - yb, D, { faces: f, uvScale: [su, sv], uvOff: [off[f] / su, ov], color: tint });
  };
  for (const f of 'brl') {
    if (!faces.includes(f)) continue;
    if (hasStore) { face(pmat, f, 0, base); face(upper, f, base, H); } else face(upper, f, y0, y0 + H);
  }
  // front wall in bay columns x floor rows, so door bays get plain wall behind the door
  const xL = x - W / 2, fz = z + D / 2;
  const fw = (mat, xa, xb, ya, yb) => {
    if (xb - xa < 0.01 || yb - ya < 0.01) return;
    g.wall(mat, xa, ya, xb, yb, fz, { uvRect: [(xa - xL) / suW, (ya - yb0) / sv, (xb - xL) / suW, (yb - yb0) / sv], color: tint });
  };
  const doorBay = new Array(bw.n).fill(false);
  const doorFl = new Array(bw.n).fill(0); // number of window floors (from the grid origin) blanked
  for (const d of doors ?? []) {
    const top = (d.y ?? 0) + (d.h ?? 2.6) + 0.45;
    for (let b = 0; b < bw.n; b++) if (xL + (b + 1) * bw.w > d.x - d.w / 2 - 0.25 && xL + b * bw.w < d.x + d.w / 2 + 0.25) {
      doorBay[b] = true;
      doorFl[b] = Math.max(doorFl[b], Math.min(fl, Math.ceil((y0 + top - yb0) / fh - 0.12)));
    }
  }
  if (faces.includes('f')) {
    if (hasStore) {
      fw(upper, xL, xL + W, base, H);
      fw(pmat, xL, xL + W, STORE, base);
      if (store.residential) fw(pmat, xL, xL + W, 0, STORE);
    } else if (noGrid) fw(pmat, xL, xL + W, y0, y0 + H);
    else {
      for (let b = 0; b < bw.n;) {
        let e = b; while (e + 1 < bw.n && doorFl[e + 1] === doorFl[b]) e++;
        const xa = xL + b * bw.w, xb = xL + (e + 1) * bw.w, yd = yb0 + doorFl[b] * fh;
        fw(pmat, xa, xb, y0, yd); fw(fmat, xa, xb, yd, y0 + H);
        b = e + 1;
      }
    }
  }
  if (hasStore) storefront(C, { x, z, W, D, nb: bw.n, bayW: bw.w, store, wallTint: tint, doorBay });
  const top = y0 + H;
  g.box(roof, x, top - 0.01, z, W, 0.02, D, { faces: 't', uvScale: 8, color: '#ffffff' });
  if (cornice) g.box('props', x, top - 0.27, z, W + 0.6, 0.5, D + 0.6, { color: mulCol(tint, 0.42), faces: 'fbrltu' });
  if (parapet > 0) {
    const pc = mulCol(tint, 0.5), t = 0.35;
    g.box('props', x, top + parapet / 2, z + D / 2 - t / 2, W, parapet, t, { color: pc });
    g.box('props', x, top + parapet / 2, z - D / 2 + t / 2, W, parapet, t, { color: pc });
    g.box('props', x + W / 2 - t / 2, top + parapet / 2, z, t, parapet, D - 2 * t, { color: pc });
    g.box('props', x - W / 2 + t / 2, top + parapet / 2, z, t, parapet, D - 2 * t, { color: pc });
    // coping
    g.box('props', x, top + parapet + 0.04, z + D / 2 - t / 2, W + 0.1, 0.08, t + 0.1, { color: mulCol(tint, 0.38), faces: 'fbrlt' });
  }
  return top;
}

// Storefront bays along the front wall (local frame of the mass).
function storefront(C, { x, z, W, D, nb, bayW, store, wallTint, doorBay }) {
  const g = C.geo, r = C.rng;
  const o = typeof store === 'object' ? store : {};
  const x0 = x - W / 2, fz = z + D / 2;
  // ledge (belt course) over the ground floor
  g.box('props', x, STORE + 0.1, fz + 0.08, W + 0.08, 0.2, 0.16, { color: mulCol(wallTint, 0.4) });
  if (o.residential) return;
  const district = o.district ?? 'downtown';
  const tint = o.tint ?? pick(r, SHOP_TINT[district] ?? SHOP_TINT.default);
  let plan = null;
  let cells = o.cells;
  if (!cells) {
    if (o.shops) {
      plan = planShops(r, nb, { closedP: o.closedP ?? 0.2 }); cells = plan.cells;
      if (o.lobby) { // tower lobby: a glass door in the middle bay, its shop gets no sign
        const mid = Math.floor(nb / 2);
        cells[mid] = SHOP_CELL.door;
        plan.shops = plan.shops.filter((s) => mid < s.b0 || mid > s.b1);
      }
    }
    else cells = new Array(nb).fill(o.display ?? SHOP_CELL.warm);
  }
  const blocked = (b) => doorBay[b];
  for (let b = 0; b < nb; b++) {
    const cell = blocked(b) ? SHOP_CELL.blank : cells[b];
    g.wall('shop', x0 + b * bayW, 0, x0 + (b + 1) * bayW, STORE, fz, { uvRect: shopUV(cell), color: tint });
  }
  if (!plan) return;
  for (const s of plan.shops) {
    if ([...Array(s.b1 - s.b0 + 1).keys()].some((k) => blocked(s.b0 + k))) continue;
    const disp = [];
    for (let b = s.b0; b <= s.b1; b++) if (b !== s.door) disp.push(b);
    const span = disp.length ? disp : [s.door];
    const cx = x0 + (Math.min(...span) + Math.max(...span) + 1) / 2 * bayW;
    const sw = Math.min(span.length * bayW - 0.5, 3.6);
    P.shopSign(C, cx, STORE - 0.52, fz, sw);
    // lit shop windows spill a soft pool of light onto the sidewalk at night
    if (!s.closed && disp.length) {
      const cool = cells[disp[0]] === SHOP_CELL.cool;
      const hw = (span.length * bayW) / 2 + 0.6;
      g.plane('glow', cx - hw, fz - 1.4, cx + hw, fz + 2.6, 0.092, { color: cool ? mulCol('#b8ccff', 0.55) : mulCol('#ffc890', 0.6) });
    }
    if (!s.closed && disp.length && r() < 0.4) {
      const aw = disp.length * bayW - 0.3;
      g.push(); g.translate(cx, 3.38, fz); g.rotX(0.32);
      g.box('props', 0, 0, 0.58, aw, 0.05, 1.16, { color: pick(r, ['#5a1a1a', '#1a3a2a', '#2a2a4a', '#4a3a1a', '#3a1a2a']) });
      g.pop();
    }
  }
}

// Fire escape on the front wall over two bays, one platform per upper floor.
function fireEscape(C, { cx, D, H, base = STORE, w }) {
  const g = C.geo;
  const fl = Math.max(1, Math.round((H - base) / FLOOR)), fh = (H - base) / fl;
  const col = '#1e1c1a', fz = D / 2, dep = 1.1;
  for (let f = 0; f < fl; f++) {
    const y = base + f * fh + 0.5;
    if (y + 1.1 > H) break;
    g.box('metal', cx, y, fz + dep / 2 + 0.05, w, 0.08, dep, { color: col });
    g.box('metal', cx, y + 1.0, fz + dep + 0.03, w, 0.05, 0.05, { color: col });
    for (let px = -w / 2; px <= w / 2 + 0.01; px += w / 4) g.box('metal', cx + px, y + 0.5, fz + dep + 0.03, 0.04, 1.0, 0.04, { color: col });
    for (const s of [-1, 1]) g.box('metal', cx + s * w / 2, y + 1.0, fz + dep / 2 + 0.05, 0.05, 0.05, dep, { color: col });
    // stair up to the next platform
    const yn = base + (f + 1) * fh + 0.5;
    if (f < fl - 1 && yn + 1.1 <= H) {
      const run = Math.min(w - 0.6, 3.2), rise = yn - y;
      g.push(); g.translate(cx, (y + yn) / 2, fz + dep * 0.55); g.rotZ(Math.atan2(rise, run) * (f % 2 ? -1 : 1));
      g.box('metal', 0, 0, 0, Math.hypot(rise, run), 0.06, 0.6, { color: col }); g.pop();
    }
  }
}

// Tidy rooftop kit in the mass's local frame (call after g.frame + any translate).
function rooftop(C, W, D, top, { ac = 2, tank = 0, bulk = true, antenna = 0 } = {}) {
  const g = C.geo, r = C.rng;
  const m = 0.6; // keep clear of the parapet
  if (bulk && W >= 9 && D >= 9) {
    g.box('w_concrete', -W / 2 + m + 1.6, top + 1.3, -D / 2 + m + 1.9, 3.2, 2.6, 3.8, { uvScale: [12, 14], color: '#a8a296' });
    g.box('roof', -W / 2 + m + 1.6, top + 2.61, -D / 2 + m + 1.9, 3.2, 0.02, 3.8, { faces: 't', uvScale: 8 });
  }
  const n = Math.min(ac, Math.floor((W - 6) / 2.2));
  for (let i = 0; i < n; i++) {
    const ax = W / 2 - m - 1.1 - i * 2.2, az = -D / 2 + m + 1.0;
    g.box('metal_d', ax, top + 0.6, az, 1.6, 1.2, 1.2, { color: '#8a8a82' });
    g.cyl('props_d', ax, top + 1.22, az, 0.45, 0.45, 0.04, 8, { color: '#222' });
  }
  if (tank > 0 && r() < tank && W >= 12 && D >= 12) {
    const tx = W / 4, tz = D / 4;
    for (const s of [-0.9, 0.9]) for (const t of [-0.9, 0.9]) g.box('wood', tx + s, top + 1.2, tz + t, 0.2, 2.4, 0.2, { color: '#4a3a2a' });
    g.box('wood', tx, top + 2.35, tz, 2.4, 0.1, 2.4, { color: '#3e3022' });
    g.cyl('wood', tx, top + 3.7, tz, 1.5, 1.5, 2.6, 12, { color: '#5a4630', uvScale: 2 });
    g.cyl('props', tx, top + 5.4, tz, 0.08, 1.6, 0.8, 12, { color: '#3a3430' });
  }
  if (antenna > 0 && r() < antenna) {
    const h = 6 + r() * 8;
    g.cyl('metal', 0, top + h / 2, 0, 0.05, 0.15, h, 4, { color: '#4a4a4a' });
    g.sphere('beacon', 0, top + h + 0.1, 0, 0.22, 6, 4, {});
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

const wpOf = (lot) => { const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot); return (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs]; };

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
        const podium = facade.startsWith('glass') ? pick(r, ['concrete', 'stone']) : facade;
        g.frame(lot.cx, lot.cz, lot.rot);
        const baseH = STORE + FLOOR * (2 + Math.floor(r() * 3));
        mass(C, { W, D, H: baseH, facade: podium, store: { shops: true, lobby: true, district: 'downtown', closedP: 0.1 }, tint: '#ddd8d0', cornice: true, parapet: 0.6 });
        let w = W - 3 - Math.floor(r() * 2) * 1.5, d = D - 3 - Math.floor(r() * 2) * 1.5, y = baseH;
        let h = H - baseH;
        const tiers = r() < 0.5 ? 2 : 1;
        for (let t = 0; t < tiers; t++) {
          const th = tiers === 2 && t === 0 ? Math.round(h * (0.55 + r() * 0.2) / FLOOR) * FLOOR : h;
          g.frame(lot.cx, lot.cz, lot.rot);
          mass(C, { W: w, D: d, H: th, y0: y, facade, tint, parapet: 1.1 });
          y += th; h -= th;
          if (t < tiers - 1) { w -= 6; d -= 6; }
          if (w < 8 || d < 8 || h <= 0) break;
        }
        g.frame(lot.cx, lot.cz, lot.rot);
        rooftop(C, w, d, y, { ac: 3, bulk: true, antenna: 0.5 });
        if (r() < 0.25) { g.frame(lot.cx, lot.cz, lot.rot); const nc = pick(r, ['#ff2a6a', '#2affc8', '#ffaa20', '#6a8aff']); g.box('neon', 0, y + 1.25, d / 2 + 0.05, w - 1, 0.2, 0.08, { color: nc }); }
        C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
        return;
      }
      const floors = 2 + Math.floor(r() * 5 * (0.4 + c));
      const H = STORE + floors * FLOOR;
      const facade = pick(r, ['brick_red', 'brick_red', 'brownstone', 'stone']);
      const tint = pick(r, ['#ffffff', '#e8dcd0', '#d8d0c8', '#f0e8e0']);
      g.frame(lot.cx, lot.cz, lot.rot);
      const shops = r() < 0.85;
      const fbw = fitBays(W), ddx = (Math.floor(fbw.n / 2) + 0.5) * fbw.w - W / 2;
      const top = mass(C, { W, D, H, facade, store: shops ? { shops: true, district: 'downtown', closedP: 0.12 } : null, doors: shops ? null : [{ x: ddx, w: 2.0, h: 2.8 }], tint, cornice: facade !== 'concrete' && r() < 0.75, parapet: 0.8 });
      if (!shops) { g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, D / 2); P.doorway(C, ddx, 2.0, 2.8, 4, { lamp: true, awning: '#2a2a30' }); }
      if (shops && facade.startsWith('brick') && floors >= 3 && W >= 12 && r() < 0.25) {
        const bw = fitBays(W).w; g.frame(lot.cx, lot.cz, lot.rot);
        fireEscape(C, { cx: (r() < 0.5 ? -1 : 1) * (W / 2 - bw), D, H, w: bw * 2 - 0.4 });
      }
      g.frame(lot.cx, lot.cz, lot.rot);
      rooftop(C, W, D, top, { tank: facade.startsWith('brick') ? 0.35 : 0, ac: 2 });
      C.obb(lot.cx, lot.cz, lot.rot, W, D, H);
      return;
    }
    if (dist === 'gutterside') {
      const floors = 1 + Math.floor(r() * 4);
      const shops = r() < 0.55;
      const H = STORE + floors * FLOOR;
      const facade = pick(r, ['tenement', 'tenement', 'brick_dirty', 'wood']);
      const tint = pick(r, ['#ffffff', '#d8ccbc', '#c8bca8', '#e0d0c0']);
      const fb = fitBays(W), dx = (Math.floor(fb.n / 2) + 0.5) * fb.w - W / 2;
      g.frame(lot.cx, lot.cz, lot.rot);
      const top = mass(C, { W, D, H, facade, store: shops ? { shops: true, district: 'gutterside', closedP: 0.4 } : null, doors: shops ? null : [{ x: dx, w: 1.3, h: 2.5 }], tint, cornice: facade !== 'wood' && r() < 0.35, parapet: 0.7 });
      if (!shops) { g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, D / 2); P.doorway(C, dx, 1.3, 2.5, pick(r, [0, 1, 1, 5]), { lamp: r() < 0.6 }); }
      if (shops && facade !== 'wood' && H - STORE >= 2 * FLOOR && W >= 12 && r() < 0.55) {
        const bw = fitBays(W).w; g.frame(lot.cx, lot.cz, lot.rot);
        fireEscape(C, { cx: (r() < 0.5 ? -1 : 1) * (W / 2 - bw), D, H, w: bw * 2 - 0.4 });
      }
      g.frame(lot.cx, lot.cz, lot.rot);
      rooftop(C, W, D, top, { tank: 0.3, ac: 1 + (r() * 2 | 0), bulk: W >= 12 });
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
    const H = FLOOR * (2 + Math.floor(r() * 2));
    g.frame(lot.cx, lot.cz, lot.rot);
    // shell walls (thin, no roof), blackened; plain brick so no floating windows
    const t = 0.5, tint = '#4a4038';
    for (const [x, z, w, d, hk] of [[0, D / 2 - t / 2, W, t, 1], [0, -D / 2 + t / 2, W, t, 0.8], [W / 2 - t / 2, 0, t, D - 2 * t, 0.9], [-W / 2 + t / 2, 0, t, D - 2 * t, 0.7]]) {
      g.box('w_tenement', x, H * hk / 2, z, w, H * hk, d, { uvScale: [12, 14], color: tint });
    }
    g.plane('decal_dark', -W / 2 + t, -D / 2 + t, W / 2 - t, D / 2 - t, 0.04, { color: '#1a1612', uv: 'world', uvScale: 8 });
    const wp = wpOf(lot);
    { const [x, z] = wp((r() - 0.5) * W * 0.3, (r() - 0.5) * D * 0.3); P.junkPile(C, x, z, 0.7); }
    if (r() < 0.5) C.emit(lot.cx, 2, lot.cz, 'smoke');
    // collision: the four walls
    C.obbLocal(lot, 0, D / 2 - t / 2, W, t, H); C.obbLocal(lot, 0, -D / 2 + t / 2, W, t, H);
    C.obbLocal(lot, W / 2 - t / 2, 0, t, D, H); C.obbLocal(lot, -W / 2 + t / 2, 0, t, D, H);
  },

  vacant(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('decal_dark', -W / 2 + 0.2, -D / 2 + 0.2, W / 2 - 0.2, D / 2 - 0.2, 0.03, { color: '#3a3226', uv: 'world', uvScale: 8 });
    const wp = wpOf(lot);
    // chain-link along the front with a gap, plus the sides
    const gap = 3.5, gx = Math.round((r() - 0.5) * (W - gap - 6));
    const a = wp(-W / 2 + 0.3, D / 2 - 0.3), b = wp(gx - gap / 2, D / 2 - 0.3), c = wp(gx + gap / 2, D / 2 - 0.3), d = wp(W / 2 - 0.3, D / 2 - 0.3);
    P.chainFence(C, a[0], a[1], b[0], b[1]);
    P.chainFence(C, c[0], c[1], d[0], d[1]);
    for (const side of [-1, 1]) { const s0 = wp(side * (W / 2 - 0.3), D / 2 - 0.3), s1 = wp(side * (W / 2 - 0.3), -D / 2 + 0.3); P.chainFence(C, s0[0], s0[1], s1[0], s1[1], {}); }
    // one or two deliberate pieces of junk, well inside the fence
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const [x, z] = wp((i ? 1 : -1) * W * 0.22, -D * 0.1 + (r() - 0.5) * D * 0.2);
      const k = r();
      if (k < 0.35 && W > 10) P.wreck(C, x, z, lot.rot + (r() - 0.5) * 0.6, { burnt: r() < 0.4, blocks: true });
      else if (k < 0.6) P.junkPile(C, x, z, 0.6);
      else if (k < 0.8) P.fireBarrel(C, x, z);
      else P.deadTree(C, x, z, 0.8);
    }
    weeds(C, lot, 10);
  },

  parking(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('asphalt', -W / 2, -D / 2, W / 2, D / 2, 0.035, { uv: 'world', uvScale: 14, color: '#c8c4bc' });
    const wp = wpOf(lot);
    for (let x = -W / 2 + 1.5; x < W / 2 - 2; x += 2.8) {
      g.frame(lot.cx, lot.cz, lot.rot);
      g.strip('marking', x, -D / 2 + 1, x, -D / 2 + 6, 0.12, 0.065, { color: '#a8a498' });
      if (x + 2.8 < W / 2 - 2 && r() < 0.18) { const [wx, wz] = wp(x + 1.4, -D / 2 + 3.5); P.wreck(C, wx, wz, lot.rot + Math.PI, { burnt: r() < 0.1 }); }
    }
    const [bx, bz] = wp(W / 2 - 2, D / 2 - 2.5);
    g.frame(bx, bz, lot.rot); g.box('metal', 0, 1.2, 0, 1.8, 2.4, 1.8, { color: '#4a4a42' }); g.box('glassdark', 0, 1.6, 0.92, 1.4, 0.8, 0.04, { color: '#606060' });
    C.obb(bx, bz, lot.rot, 1.9, 1.9, 2.4);
    const [lx, lz] = wp(-W / 2 + 1, D / 2 - 1); P.streetlight(C, lx, lz, lot.rot + Math.PI, { flicker: r() < 0.2 });
  },

  plaza(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('sidewalk', -W / 2, -D / 2, W / 2, D / 2, 0.03, { uv: 'world', uvScale: 6, color: '#c8c0b0' });
    const wp = wpOf(lot);
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
      g.frame(x, z, lot.rot); g.box('w_concrete', 0, 0.4, 0, 2.2, 0.8, 2.2, { uvScale: [12, 14], color: '#b8b2a6' }); C.obb(x, z, lot.rot, 2.2, 2.2, 0.8);
      P.deadTree(C, x, z, 0.8, { solid: false, y: 0.8 });
    }
    for (let i = 0; i < 2; i++) { const [x, z] = wp((i ? 1 : -1) * W / 5, D / 2 - 2); P.bench(C, x, z, lot.rot + Math.PI); }
  },

  park(C, lot) {
    const r = C.rng, W = lot.w, D = lot.d;
    const wp = wpOf(lot);
    // trees on a loose grid (no overlaps), benches along the front path
    const nx = Math.max(2, Math.floor((W - 6) / 9)), nz = Math.max(2, Math.floor((D - 8) / 9));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (r() < 0.35) continue;
      const lx = -W / 2 + 4 + (i + 0.5) * ((W - 8) / nx) + (r() - 0.5) * 2, lz = -D / 2 + 3 + (k + 0.5) * ((D - 10) / nz) + (r() - 0.5) * 2;
      const [x, z] = wp(lx, lz); P.deadTree(C, x, z, 1 + r() * 0.4);
    }
    for (let i = 0; i < 2; i++) { const [x, z] = wp((i ? 1 : -1) * W * 0.2, D / 2 - 2.2); P.bench(C, x, z, lot.rot + Math.PI); }
  },

  mansion(C, lot) { if (lot.d < 30 || lot.w < 34) LOT.park(C, lot); else mansion(C, lot, {}); },

  apartments(C, lot) {
    const r = C.rng, g = C.geo;
    const W = lot.w - 6, D = Math.min(lot.d - 6, 28);
    const floors = 4 + Math.floor(r() * 6);
    const H = STORE + floors * FLOOR;
    const facade = pick(r, ['stucco', 'stucco', 'stone']);
    const zc = lot.d / 2 - D / 2 - 3;
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, zc);
    mass(C, { W, D, H, facade, store: { residential: true }, cornice: true });
    // balconies on bay pairs either side of the entrance, aligned with the window grid
    const bw = fitBays(W);
    for (let f = 1; f < floors; f++) for (let b = 0; b + 1 < bw.n; b += 3) {
      const bx = -W / 2 + (b + 1) * bw.w;
      if (Math.abs(bx) < bw.w * 1.5) continue;
      g.box('props', bx, STORE + f * FLOOR + 0.06, D / 2 + 0.6, bw.w * 2 - 0.4, 0.12, 1.2, { color: '#8a8478' });
      g.box('metal', bx, STORE + f * FLOOR + 0.6, D / 2 + 1.18, bw.w * 2 - 0.4, 0.9, 0.05, { color: '#2a2622' });
    }
    // entrance on a blank centre bay: canopy + door
    g.push(); g.translate(0, 0, D / 2); P.doorway(C, 0, 2.6, 3, 4, { lamp: true, awning: '#4a1a1a' }); g.pop();
    C.obbLocal(lot, 0, zc, W, D, H);
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, zc);
    rooftop(C, W, D, H, { ac: 3 });
    hedgesAround(C, lot);
  },

  warehouse(C, lot) { warehouse(C, lot, {}); },

  containers(C, lot) {
    const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
    g.frame(lot.cx, lot.cz, lot.rot);
    g.plane('sidewalk', -W / 2, -D / 2, W / 2, D / 2, 0.03, { uv: 'world', uvScale: 6, color: '#8a867c' });
    const wp = wpOf(lot);
    const cols = ['#8a2a1a', '#2a4a6a', '#5a6a3a', '#a06a1a', '#3a3a3a', '#6a2a4a', '#2a6a6a', '#7a7a70'];
    // neat rows of stacks (no jitter: containers sit square on each other)
    for (let x = -W / 2 + 3; x < W / 2 - 2.5; x += 3.2) {
      for (let z = -D / 2 + 7.5; z < D / 2 - 7; z += 13) {
        if (r() < 0.25) continue;
        const n = 1 + (r() * 3 | 0);
        const [wx, wz] = wp(x, z);
        for (let k = 0; k < n; k++) P.container(C, wx, k * 2.6, wz, lot.rot, pick(r, cols), { solid: k === 0 });
      }
    }
    const a = wp(-W / 2, D / 2 - 0.4), b = wp(-3, D / 2 - 0.4), c = wp(3, D / 2 - 0.4), d = wp(W / 2, D / 2 - 0.4);
    P.chainFence(C, a[0], a[1], b[0], b[1], { razor: true }); P.chainFence(C, c[0], c[1], d[0], d[1], { razor: true });
    const [mx, mz] = wp(W / 2 - 1.5, D / 2 - 2);
    P.streetlight(C, mx, mz, lot.rot + Math.PI, { h: 12, arm: 1.5, color: '#e8f0ff' });
  },

  tanks(C, lot) {
    const r = C.rng, W = lot.w, D = lot.d;
    const wp = wpOf(lot);
    const R = Math.min(W, D) / 4.5;
    const pts = [];
    for (let x = -W / 2 + R + 2; x < W / 2 - R - 1; x += R * 2 + 3) {
      const [tx, tz] = wp(x, (r() - 0.5) * Math.max(0, D - 2 * R - 8));
      P.tank(C, tx, tz, R, 6 + r() * 10, pick(r, ['#6a5a4c', '#7a6a58', '#5a5a52', '#6a4a3a']));
      pts.push([tx, tz]);
    }
    const g = C.geo;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      g.frame(ax, az, Math.atan2(bx - ax, bz - az)); g.push(); g.translate(0, 3, L / 2); g.rotX(Math.PI / 2); g.cyl('rust', 0, 0, 0, 0.35, 0.35, L, 6, { color: '#5a4a3a' }); g.pop();
    }
    const a = wp(-W / 2, D / 2 - 0.4), b = wp(W / 2 - 6, D / 2 - 0.4);
    P.chainFence(C, a[0], a[1], b[0], b[1], { razor: true });
    const [sx, sz] = wp(W / 2 - 3, D / 2 - 3); C.emit(sx, 1, sz, 'steam');
  },

  trailer(C, lot) { trailer(C, lot, {}); },

  shack(C, lot) {
    const r = C.rng, g = C.geo;
    const W = Math.min(lot.w - 4, 9 + Math.floor(r() * 2) * 3), D = Math.min(lot.d - 4, 7 + r() * 3);
    const z = lot.d / 2 - D / 2 - 2;
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, z);
    mass(C, { W, D, H: 3.2, facade: 'wood', tint: '#c8b8a0', parapet: 0, roof: 'corr', doors: [{ x: -W / 4, w: 1.1 }] });
    g.push(); g.translate(0, 3.25, 0); g.rotX(0.08); g.box('corr', 0, 0, 0, W + 0.8, 0.1, D + 1.0, { uvScale: 3, color: '#a89a88' }); g.pop();
    g.translate(0, 0, D / 2); P.doorway(C, -W / 4, 1.1, 2.3, 5, { lamp: r() < 0.5 });
    C.obbLocal(lot, 0, z, W, D, 3.4);
    desertJunk(C, lot, 2);
  },

  junk(C, lot) {
    const r = C.rng;
    const wp = wpOf(lot);
    for (let i = 0; i < 2; i++) { const [x, z] = wp((i ? 1 : -1) * lot.w * 0.25, (r() - 0.5) * (lot.d - 8)); P.junkPile(C, x, z, 0.8 + r() * 0.4); }
    { const [x, z] = wp(0, -lot.d * 0.2); P.wreck(C, x, z, r() * 6, { burnt: r() < 0.5, blocks: true }); }
    desertJunk(C, lot, 2);
  },

  empty(C, lot) { desertJunk(C, lot, 3); },
};

function weeds(C, lot, n) {
  const g = C.geo, r = C.rng;
  for (let i = 0; i < n; i++) {
    const lx = (r() - 0.5) * (lot.w - 2), lz = (r() - 0.5) * (lot.d - 2);
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(lx, 0.03, lz); g.rotY(r() * 6);
    const h = 0.3 + r() * 0.5, col = r() < 0.5 ? '#4a4a2a' : '#5a4a2a';
    g.tri('props_d', [-0.3, 0, 0], [0.3, 0, 0], [0, h, 0.05], [0, 0, 1, 0, 0.5, 1], col);
    g.tri('props_d', [0, 0, -0.3], [0, 0, 0.3], [0.05, h * 0.9, 0], [0, 0, 1, 0, 0.5, 1], col);
  }
}

function hedgesAround(C, lot) {
  const r = C.rng;
  const wp = wpOf(lot);
  for (const s of [-1, 1]) { const [x, z] = wp(s * (lot.w / 2 - 1), 0); P.hedge(C, x, z, 1.4, lot.d - 4, 1.3 + r() * 0.6, lot.rot); }
}

// Desert junk on a coarse grid inside the lot so pieces never pile into each other.
function desertJunk(C, lot, n) {
  const r = C.rng;
  const wp = wpOf(lot);
  const slots = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, -0.38]];
  for (let i = 0; i < n; i++) {
    const s = slots[(i + Math.floor(r() * 5)) % slots.length];
    const [x, z] = wp(s[0] * (lot.w - 4), s[1] * (lot.d - 4));
    if (!C.free(x, z, 1.6)) continue;
    const k = r();
    if (k < 0.4) P.cactus(C, x, z, 0.8 + r() * 0.5);
    else if (k < 0.7) P.rock(C, x, z, 0.4 + r() * 1.0);
    else if (k < 0.85) P.tires(C, x, z, 1 + (r() * 3 | 0));
    else P.oilDrums(C, x, z, 2);
  }
}

function backClutter(C, lot, W, D) {
  const r = C.rng;
  if (r() < 0.4) {
    const s = r() < 0.5 ? 1 : -1;
    const wp = wpOf(lot);
    const [x, z] = wp(s * (W / 2 + 1.6), -D / 2 + 3);
    if (C.layout.isFree(x, z, 1.6) && C.free(x, z, 1.8)) P.dumpster(C, x, z, lot.rot + Math.PI / 2 * s);
  }
}

// Storefront for a lot built without mass() storefront support (legacy callers).
export function shopFront() { /* storefronts are part of mass() now */ }

// ------------------------------------------------------------------ bigger shared builders
export function mansion(C, lot, { facade = null, house = null, gateDoor = 7 } = {}) {
  const r = C.rng, g = C.geo, W = lot.w, D = lot.d;
  const wp = wpOf(lot);
  const fac = facade ?? pick(r, ['stucco', 'stone']);
  // perimeter wall with gate gap (front center)
  const gate = 6;
  const corners = [wp(-W / 2 + 0.25, D / 2 - 0.25), wp(-gate / 2 - 1.05, D / 2 - 0.25), wp(gate / 2 + 1.05, D / 2 - 0.25), wp(W / 2 - 0.25, D / 2 - 0.25), wp(W / 2 - 0.25, -D / 2 + 0.25), wp(-W / 2 + 0.25, -D / 2 + 0.25)];
  const wallOpts = { h: 2.4, mat: 'w_stone', color: '#b8b0a0' };
  P.wallRun(C, corners[0][0], corners[0][1], corners[1][0], corners[1][1], wallOpts);
  P.wallRun(C, corners[2][0], corners[2][1], corners[3][0], corners[3][1], wallOpts);
  P.wallRun(C, corners[3][0], corners[3][1], corners[4][0], corners[4][1], wallOpts);
  P.wallRun(C, corners[4][0], corners[4][1], corners[5][0], corners[5][1], wallOpts);
  P.wallRun(C, corners[5][0], corners[5][1], corners[0][0], corners[0][1], wallOpts);
  // gate pillars + lamps + iron gate half-open
  g.frame(lot.cx, lot.cz, lot.rot);
  for (const s of [-1, 1]) {
    g.box('w_stone', s * (gate / 2 + 0.55), 1.6, D / 2 - 0.6, 1.1, 3.2, 1.1, { uvScale: [12, 14], color: '#c8c0b0' });
    g.box('lamp', s * (gate / 2 + 0.55), 3.45, D / 2 - 0.6, 0.45, 0.5, 0.45, { color: '#ffd090' });
    g.box('metal', s * (gate / 2 + 0.55), 3.75, D / 2 - 0.6, 0.6, 0.1, 0.6, { color: '#111' });
    const [lx, lz] = wp(s * (gate / 2 + 0.55), D / 2 + 0.3);
    C.light(lx, 3.6, lz, '#ffc070', 'door');
    C.obbLocal(lot, s * (gate / 2 + 0.55), D / 2 - 0.6, 1.1, 1.1, 3.2);
  }
  g.push(); g.translate(-gate / 2, 0, D / 2 - 0.25); g.rotY(-0.9);
  for (let i = 0; i <= 8; i++) g.box('metal', 0, 1.2, i * 0.32, 0.05, 2.4, 0.05, { color: '#151515' });
  g.box('metal', 0, 2.3, 1.3, 0.06, 0.08, 2.7, { color: '#151515' }); g.box('metal', 0, 0.3, 1.3, 0.06, 0.08, 2.7, { color: '#151515' });
  g.pop();
  // lawn + driveway
  g.plane('decal_dark', -W / 2 + 0.5, -D / 2 + 0.5, W / 2 - 0.5, D / 2 - 0.5, 0.025, { uv: 'world', uvScale: 8, color: '#5a5a30' });
  const HW = house?.w ?? Math.min(W - 12, 22 + Math.floor(r() * 5) * 3), HD = house?.d ?? Math.min(D * 0.5, 14 + Math.floor(r() * 3) * 3);
  const hz = -D / 2 + HD / 2 + 4;
  g.frame(lot.cx, lot.cz, lot.rot);
  g.strip('asphalt', 0, D / 2 - 0.5, 0, hz + HD / 2 + 4.4, 4.5, 0.045, { uv: 'world', uvScale: 14, color: '#b0aca4' });
  // house
  const floors = house?.floors ?? (2 + (r() < 0.3 ? 1 : 0));
  const H = floors * FLOOR;
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, hz);
  mass(C, { W: HW, D: HD, H, facade: fac, parapet: 0, cornice: true, tint: '#ffffff', doors: [{ x: 0, w: 2.4 }] });
  g.gable('shingle', 0, H, 0, HW + 1.2, 4 + r() * 2, HD + 1.2, { color: pick(r, ['#ffffff', '#c8a8a0', '#a8b0b8']), endMat: 'w_' + fac, uvScale: 3 });
  // wings
  if (r() < 0.6 && HW > 24 && W - HW > 22) for (const s of [-1, 1]) {
    g.frame(lot.cx, lot.cz, lot.rot); g.translate(s * (HW / 2 + 4), 0, hz + 1);
    mass(C, { W: 8, D: HD - 4, H: H - FLOOR, facade: fac, parapet: 0.8, tint: '#e8e0d8' });
    C.obbLocal(lot, s * (HW / 2 + 4), hz + 1, 8, HD - 4, H - FLOOR);
  }
  // portico
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(0, 0, hz + HD / 2);
  g.box('props', 0, FLOOR + 0.3, 2.2, 8, 0.4, 4.4, { color: '#c8c0b0' });
  for (const s of [-3.4, -1.2, 1.2, 3.4]) g.cyl('props', s, FLOOR / 2 + 0.1, 4, 0.3, 0.34, FLOOR, 8, { color: '#d0c8b8' });
  P.doorway(C, 0, 2.2, 3, gateDoor, { lamp: false });
  for (let i = 0; i < 3; i++) g.box('props', 0, 0.06 + i * 0.12, 0.25 + (2 - i) * 0.4, 7, 0.12 + i * 0.12, 0.4, { color: '#a8a498', faces: 'fbrlt' });
  C.obbLocal(lot, 0, hz, HW, HD, H + 3);
  for (const s of [-3.4, 3.4]) C.obbLocal(lot, s, hz + HD / 2 + 4, 0.7, 0.7, FLOOR);
  // hedges along the inside of the side walls, dead fountain on the front lawn
  for (const s of [-1, 1]) { const [x, z] = wp(s * (W / 2 - 2), 0); P.hedge(C, x, z, 1.6, D - 6, 1.8, lot.rot); }
  const front = D / 2 - (hz + HD / 2 + 4.4);
  const fz = hz + HD / 2 + 4.4 + front / 2;
  if (front > 12) {
    // fountain sits beside the driveway, not on it
    const fx = W / 4 > 6 ? W / 4 : 0;
    if (fx) {
      g.frame(lot.cx, lot.cz, lot.rot); g.translate(fx, 0, fz);
      g.cyl('w_stone', 0, 0.35, 0, 3.2, 3.4, 0.7, 14, { uvScale: 12, color: '#c8c0b0' });
      g.disc('puddle', 0, 0.68, 0, 2.9, 14);
      g.cyl('props', 0, 1.6, 0, 0.3, 0.5, 2.4, 8, { color: '#a8a090' });
      g.sphere('props', 0, 2.9, 0, 0.6, 8, 4, { half: true, color: '#a8a090' });
      const [wx, wz] = wp(fx, fz); C.solid(wx - 3.3, wz - 3.3, wx + 3.3, wz + 3.3, 0.8);
    }
  }
  // two trees framing the lawn
  for (const s of [-1, 1]) { const [x, z] = wp(s * (W / 2 - 6), D / 2 - 6); P.deadTree(C, x, z, 1.1); }
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
  g.gable('corr', 0, H, 0, D + 0.6, roofH, W + 0.6, { color: '#9a948c', endMat: 'w_' + fac, uvScale: 3 });
  g.pop();
  if (doors) {
    const n = Math.max(1, Math.floor(W / 14));
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + (i + 0.5) * (W / n);
      g.wall('doors', cx - 2.5, 0.02, cx + 2.5, 5, D / 2 + 0.05, { uvRect: [0.754, 0.504, 0.996, 0.996] }); // roll-up
      g.box('props', cx, 5.3, D / 2 + 0.1, 5.6, 0.5, 0.2, { color: '#222' });
      g.box('lamp', cx, 5.62, D / 2 + 0.35, 0.6, 0.12, 0.5, { color: '#e8f0ff', faces: 'u' });
      for (const s of [-3, 3]) g.box('props', cx + s, 0.5, D / 2 + 0.4, 0.3, 1, 0.3, { color: '#c0a020' });
    }
    g.push(); g.translate(0, 0, D / 2); P.doorway(C, W / 2 - 2.2, 1.2, 2.4, 1, { lamp: true, lampColor: '#e8f0ff' }); g.pop();
  }
  if (sign !== false) P.shopSign(C, -W / 2 + Math.min(W / 4, 6), 6.1, D / 2, 3.6, sign ?? undefined);
  C.obb(lot.cx, lot.cz, lot.rot, W, D, H + roofH);
  // one deliberate prop beside the building (pallets or drums), only if there's room
  const wp = wpOf(lot);
  const s = r() < 0.5 ? 1 : -1;
  const [x, z] = wp(s * (W / 2 + 2), D / 4);
  if (C.layout.isFree(x, z, 1.6)) { if (r() < 0.5) P.pallets(C, x, z, lot.rot, 2); else P.oilDrums(C, x, z, 3); }
  return H;
}

export function trailer(C, lot, { color = null, door = 0 } = {}) {
  const r = C.rng, g = C.geo;
  const TW = Math.min(14, lot.w - 6), TD = 4.6, TH = 3.0;
  const z = Math.min(lot.d / 2 - TD / 2 - 4, 4);
  const along = (r() - 0.5) * Math.max(0, lot.w - TW - 6);
  g.frame(lot.cx, lot.cz, lot.rot); g.translate(along, 0, z);
  const col = color ?? pick(r, ['#ffffff', '#d8d0b8', '#c8d0d8', '#e0c8b0', '#b8c8b0']);
  g.box('props', 0, 0.3, 0, TW - 0.4, 0.6, TD - 0.4, { color: '#5a5650' }); // skirt
  mass(C, { W: TW, D: TD, H: TH, y0: 0.6, facade: 'trailer', tint: col, parapet: 0, doors: [{ x: -TW / 4, w: 1.0 }] });
  g.box('metal', 0, 0.6 + TH + 0.05, 0, TW + 0.2, 0.12, TD + 0.2, { color: mulCol(col, 0.7) });
  g.box('props', 0, 1.25, TD / 2 + 0.025, TW, 0.3, 0.05, { color: pick(r, ['#8a3a2a', '#3a5a7a', '#6a6a2a']), faces: 'fblrt' }); // stripe
  // porch + steps
  g.box('wood', -TW / 4, 0.5, TD / 2 + 1.2, 3.4, 0.15, 2.4, { color: '#7a6a50' });
  for (const s of [-1, 1]) for (const t of [0.2, 2.2]) g.box('wood', -TW / 4 + s * 1.6, 0.21, TD / 2 + t, 0.15, 0.42, 0.15, { color: '#5a4a38' });
  g.box('wood', -TW / 4, 0.25, TD / 2 + 2.7, 1.4, 0.12, 0.6, { color: '#6a5a40' });
  g.push(); g.translate(0, 0.6, TD / 2); P.doorway(C, -TW / 4, 1.0, 2.1, door, { lamp: true, lampColor: '#ffd8a0' }); g.pop();
  // propane tank
  g.push(); g.translate(TW / 2 + 1.0, 0.5, 0); g.rotZ(Math.PI / 2); g.cyl('props', 0, 0, 0, 0.5, 0.5, 1.6, 8, { color: '#d8d0c0' }); g.pop();
  // two lawn chairs on the porch side
  for (let i = 0; i < 2; i++) { g.push(); g.translate(-TW / 4 + 2.6 + i * 1.1, 0, TD / 2 + 3.5); g.rotY(i ? 0.3 : -0.2); g.box('props_d', 0, 0.45, 0, 0.6, 0.05, 0.6, { color: '#2a6a5a' }); g.box('props_d', 0, 0.75, -0.3, 0.6, 0.6, 0.05, { color: '#2a6a5a' }); g.pop(); }
  C.obbLocal(lot, along, z, TW, TD, TH + 0.6); C.obbLocal(lot, along + TW / 2 + 1.0, z, 1.0, 1.0, 1.1);
  const wp = wpOf(lot);
  const [px, pz] = wp(along - TW / 4, z + TD / 2 + 1.6);
  if (r() < 0.5) { const [x, z2] = wp(along + TW / 2 + 4, z + 1); if (C.free(x, z2, 2.4)) P.wreck(C, x, z2, lot.rot + Math.PI / 2, { blocks: true }); }
  desertJunk(C, lot, 1);
  return { doorX: px, doorZ: pz };
}
