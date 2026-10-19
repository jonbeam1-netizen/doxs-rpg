import { signTexture } from '../core/materials.js';
import { mulCol } from './geo.js';
import * as P from './props.js';
import { mass, mansion, warehouse, trailer, shopFront } from './buildings.js';
import { doorUV } from './textures.js';

// One handcrafted-ish building per LOCATIONS entry. Each builder works in the
// lot's local frame (+Z = street side, facade at z = D/2) and returns
// { door: [lx, lz] } = local point ON the facade in front of the entrance.

const PI = Math.PI;
const FLOOR = 3.5;

function helpers(C, lot) {
  const cs = Math.cos(lot.rot), sn = Math.sin(lot.rot);
  return {
    wp: (lx, lz) => [lot.cx + lx * cs + lz * sn, lot.cz - lx * sn + lz * cs],
    f: () => C.geo.frame(lot.cx, lot.cz, lot.rot),
  };
}

// Big readable location sign (unique texture). Local coords; faces +Z.
export function locSign(C, lot, key, text, { w = 10, h = null, x = 0, y = 6, z = null, bg = '#1a1612', fg = '#e6dfcf', border = '#3b342b', neon = null, gain = 1.6, font = 'Special Elite', flicker = false, board = true, double = false, rotY = 0 } = {}) {
  const g = C.geo;
  h = h ?? w / 4;
  z = z ?? lot.d / 2;
  const tex = signTexture(text, { width: 1024, height: Math.round(1024 * h / w), bg, fg, border, font, grime: 0.45 });
  const mk = 'sign_' + key;
  C.mats.M[mk] = { mat: C.mats.signMaterial(tex, gain), cast: false, recv: true };
  g.push(); g.translate(x, y, z); g.rotY(rotY);
  if (board) g.box('metal', 0, 0, 0.1, w + 0.3, h + 0.3, 0.2, { color: '#151310', faces: double ? 'fblrtu' : 'blrtu' });
  g.wall(mk, -w / 2, -h / 2, w / 2, h / 2, 0.22, {});
  if (double) { g.push(); g.rotY(PI); g.wall(mk, -w / 2, -h / 2, w / 2, h / 2, 0.02, {}); g.pop(); }
  if (neon) {
    const m = flicker ? 'neon_flk' : 'neon';
    g.box(m, 0, h / 2 + 0.2, 0.26, w + 0.4, 0.1, 0.1, { color: neon });
    g.box(m, 0, -h / 2 - 0.2, 0.26, w + 0.4, 0.1, 0.1, { color: neon });
    g.box(m, w / 2 + 0.2, 0, 0.26, 0.1, h + 0.4, 0.1, { color: neon });
    g.box(m, -w / 2 - 0.2, 0, 0.26, 0.1, h + 0.4, 0.1, { color: neon });
  }
  g.pop();
}

// Lit doorway + light pool + pooled light source.
function entrance(C, lot, lx, { w = 1.6, h = 2.6, door = 0, color = '#ffc070', awning = null, z = null } = {}) {
  const H = helpers(C, lot);
  const zz = z ?? lot.d / 2;
  H.f(); C.geo.translate(0, 0, zz);
  P.doorway(C, lx, w, h, door, { lamp: true, lampColor: color, awning });
  const [x, zw] = H.wp(lx, zz + 1.8);
  C.geo.identity(); C.geo.plane('glow', x - 3.5, zw - 3.5, x + 3.5, zw + 3.5, 0.09, { color });
  C.light(x, h + 0.6, zw, color, 'door');
  return [lx, zz];
}

function neonBar(C, x, y, z, w, h, color, flk = false) { C.geo.box(flk ? 'neon_flk' : 'neon', x, y, z, w, h, 0.1, { color }); }

// ----------------------------------------------------------------- shared shop
function shop(C, lot, loc, o) {
  const H = helpers(C, lot);
  const W = lot.w, D = lot.d;
  H.f();
  const top = mass(C, { W, D, H: o.H ?? 6, facade: o.facade ?? 'brick_dirty', store: o.store ?? null, tint: o.tint ?? '#ffffff', cornice: o.cornice ?? false, parapet: o.parapet ?? 0.8 });
  const dx = o.doorX ?? 0;
  const door = entrance(C, lot, dx, { w: o.doorW ?? 1.6, h: o.doorH ?? 2.6, door: o.door ?? 2, color: o.lampColor ?? '#ffc070', awning: o.awning ?? null });
  if (o.sign !== false) {
    H.f();
    locSign(C, lot, loc.id, o.signText ?? loc.name.toUpperCase(), { w: o.signW ?? Math.min(W - 2, 12), y: o.signY ?? Math.min(top - 1, 5.6), bg: o.bg, fg: o.fg, neon: o.neon, font: o.font ?? 'Special Elite', flicker: o.flicker });
  }
  if (o.bars) { H.f(); for (let x = -W / 2 + 1; x < W / 2 - 1; x += 0.35) if (Math.abs(x - dx) > 1.3) C.geo.box('metal', x, 2.3, D / 2 + 0.12, 0.05, 3.4, 0.05, { color: '#111' }); }
  C.obb(lot.cx, lot.cz, lot.rot, W, D, top);
  return { door, top };
}

function gasStation(C, lot, loc, { name, color = '#d02a1a', rusty = false } = {}) {
  const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
  H.f();
  g.plane('asphalt', -W / 2, -D / 2, W / 2, D / 2, 0.035, { uv: 'world', uvScale: 14, color: '#c0bcb4' });
  // store at the back
  const SW = Math.min(18, W - 6), SD = 10, sz = -D / 2 + SD / 2;
  H.f(); g.translate(-W / 2 + SW / 2 + 1, 0, sz);
  mass(C, { W: SW, D: SD, H: 4.6, facade: rusty ? 'wood' : 'concrete', store: 0, tint: rusty ? '#d8c8b0' : '#ffffff', parapet: 0.6 });
  g.box('props', 0, 4.5, SD / 2 + 0.25, SW, 0.6, 0.5, { color });
  C.obbLocal(lot, -W / 2 + SW / 2 + 1, sz, SW, SD, 5.2);
  const doorLX = -W / 2 + SW / 2 + 1;
  const door = entrance(C, lot, doorLX, { z: sz + SD / 2, door: 2, color: '#ffe8b0' });
  // canopy
  const CW = W - 6, CD = 12, cz = sz + SD / 2 + 3 + CD / 2;
  H.f(); g.translate(0, 0, cz);
  g.box('props', 0, 5.6, 0, CW, 0.9, CD, { color: '#d8d4cc' });
  g.box('props', 0, 5.9, CD / 2 + 0.01, CW, 0.5, 0.02, { color, faces: 'f' });
  g.box('props', 0, 5.9, -CD / 2 - 0.01, CW, 0.5, 0.02, { color, faces: 'b' });
  for (let x = -CW / 2 + 3; x <= CW / 2 - 3; x += (CW - 6) / 2) g.box(rusty ? 'lamp_flk' : 'lamp', x, 5.14, 0, 2.6, 0.04, 2.6, { color: '#f0f4ff', faces: 'u' });
  for (const s of [-1, 1]) {
    g.box('props', s * (CW / 2 - 4), 2.6, 0, 0.6, 5.2, 0.6, { color: '#c8c4bc' });
    C.obbLocal(lot, s * (CW / 2 - 4), cz, 0.7, 0.7, 5.2);
    // pump island
    g.box('props', s * (CW / 2 - 4), 0.12, 0, 1.6, 0.24, 6, { color: '#8a867c' });
    for (const t of [-1.8, 1.8]) {
      g.box('metal', s * (CW / 2 - 4), 1.0, t, 0.8, 1.7, 0.6, { color: rusty ? '#7a5a3a' : color });
      g.box('lamp', s * (CW / 2 - 4), 1.5, t + 0.31, 0.5, 0.3, 0.02, { color: '#d0ffd0', faces: 'f' });
    }
    C.obbLocal(lot, s * (CW / 2 - 4), cz, 1.7, 6, 1.8);
  }
  const [cx, czw] = H.wp(0, cz); C.light(cx, 4.8, czw, '#e8f0ff', 'street');
  g.identity(); g.plane('glow', cx - 10, czw - 8, cx + 10, czw + 8, 0.09, { color: '#e8f0ff' });
  // price sign pole at the front corner
  H.f(); g.translate(W / 2 - 2, 0, D / 2 - 2);
  g.box('metal', 0, 4.5, 0, 0.4, 9, 0.4, { color: '#333' });
  C.obbLocal(lot, W / 2 - 2, D / 2 - 2, 0.5, 0.5, 9);
  locSign(C, { ...lot, d: 0 }, loc.id + '_p', name, { w: 6, h: 2.2, y: 8.2, z: 0.25, x: 0, bg: color, fg: '#fff8e0', neon: null, double: true, font: 'Barlow Condensed' });
  H.f(); g.translate(W / 2 - 2, 0, D / 2 - 2);
  locSign(C, { ...lot, d: 0 }, loc.id + '_q', rusty ? 'GAS $9.99 · NO REFUNDS' : 'UNLEADED $6.66', { w: 6, h: 1.4, y: 6.2, z: 0.25, bg: '#111', fg: '#ffcc33', double: true, gain: 2.2, font: 'Barlow Condensed' });
  if (rusty) { P.tires(C, ...H.wp(-W / 2 + 2, D / 2 - 3), 4); }
  return { door };
}

// ----------------------------------------------------------------- builders
export const LANDMARKS = {
  roach_motel(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 7.4, facade: 'stucco_pink', tint: '#c8b0a0', parapet: 0.6 });
    // walkway + railing for the 2nd floor, posts down to the ground
    g.box('props', 0, 3.6, D / 2 + 0.9, W, 0.25, 1.8, { color: '#6a625a' });
    g.box('metal', 0, 4.6, D / 2 + 1.75, W, 0.08, 0.08, { color: '#2a2a2a' });
    for (let x = -W / 2 + 0.3; x <= W / 2; x += 0.6) g.box('metal', x, 4.15, D / 2 + 1.75, 0.04, 0.9, 0.04, { color: '#2a2a2a' });
    for (let x = -W / 2 + 0.3; x <= W / 2; x += 6) g.box('metal', x, 1.8, D / 2 + 1.7, 0.15, 3.6, 0.15, { color: '#3a3a3a' });
    // rooms: doors on both floors
    const n = 6;
    let door6 = null;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * (W / n);
      for (const fl of [0, 1]) {
        const num = fl * n + i + 1;
        H.f(); g.translate(0, fl * 3.7, D / 2);
        if (num === 6) continue;
        P.doorway(C, x, 1.1, 2.3, num % 3 === 0 ? 5 : 0, { lamp: (i + fl) % 2 === 0, lampColor: '#ffb070' });
        g.wall('f_brick_dirty', x + 1.0, 1.0, x + 2.4, 2.2, 0.08, { uvRect: [0.06, 0.25, 0.19, 0.4] });
      }
    }
    // room 6 (ground floor, middle) — the player's place
    const x6 = -W / 2 + (2 + 0.5) * (W / n);
    door6 = entrance(C, lot, x6, { w: 1.2, h: 2.4, door: 6, color: '#ffb060' });
    H.f(); C.obbLocal(lot, 0, 0, W, D, top);
    for (let x = -W / 2 + 0.3; x <= W / 2; x += 6) C.obbLocal(lot, x, D / 2 + 1.7, 0.3, 0.3, 3.6);
    // stairs at the east end
    H.f(); g.push(); g.translate(W / 2 + 1, 1.8, D / 2 - 2); g.rotX(-Math.atan2(3.6, 5)); g.box('metal', 0, 0, 0, 1.4, 0.15, 6.2, { color: '#3a3a3a' }); g.pop();
    C.obbLocal(lot, W / 2 + 1, D / 2 - 2, 1.5, 5, 3.6);
    // pole sign: ROACH MOTEL + VACANCY-ish
    H.f(); g.translate(-W / 2 - 2.5, 0, D / 2 - 1);
    g.box('metal', 0, 5, 0, 0.5, 10, 0.5, { color: '#2a2622' });
    C.obbLocal(lot, -W / 2 - 2.5, D / 2 - 1, 0.6, 0.6, 10);
    H.f(); g.translate(-W / 2 - 2.5, 0, D / 2 - 1); g.rotY(PI / 2);
    locSign(C, { ...lot, d: 0 }, 'roach_motel', 'ROACH MOTEL', { w: 7, h: 2.4, y: 9.2, z: -0.1, bg: '#3a1020', fg: '#ff5a8a', neon: '#ff3a6a', double: true, gain: 2.4 });
    H.f(); g.translate(-W / 2 - 2.5, 0, D / 2 - 1); g.rotY(PI / 2);
    locSign(C, { ...lot, d: 0 }, 'roach_vac', 'VACANCY-ish', { w: 5, h: 1.2, y: 7.2, z: -0.1, bg: '#101410', fg: '#7aff6a', neon: null, double: true, gain: 2.8, font: 'Barlow Condensed' });
    // giant roach on the roof
    H.f(); g.translate(W / 4, top, -1);
    const rc = '#3a2214';
    g.sphere('props', 0, 0.8, 0, 2.2, 8, 5, { color: rc, sy: 0.4 });
    g.sphere('props', 0, 0.9, 2.4, 0.9, 8, 5, { color: rc, sy: 0.6 });
    for (const s of [-1, 1]) for (const t of [-1.2, 0, 1.2]) { g.push(); g.translate(s * 1.8, 0.6, t); g.rotZ(s * 0.9); g.box('props', 0, 0, 0, 0.12, 2.2, 0.12, { color: rc }); g.pop(); }
    for (const s of [-1, 1]) { g.push(); g.translate(s * 0.4, 1.3, 3); g.rotX(-1.0); g.rotZ(s * 0.3); g.box('props', 0, 1.6, 0, 0.06, 3.4, 0.06, { color: rc }); g.pop(); }
    // ice machine, vending machine
    H.f(); g.box('metal', W / 2 - 1.2, 0.9, D / 2 + 0.5, 1.0, 1.8, 0.8, { color: '#a0a8b0' });
    g.box('lamp', W / 2 - 2.6, 1.0, D / 2 + 0.5, 1.0, 2.0, 0.8, { color: '#ff4a3a' });
    C.obbLocal(lot, W / 2 - 1.9, D / 2 + 0.5, 2.6, 0.9, 2);
    return { door: door6 };
  },

  greasy_spoon(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 5.2, facade: 'concrete', store: 0, tint: '#e0d8d0', door: 2, signText: 'THE GREASY SPOON', bg: '#e8dcc0', fg: '#a01818', neon: '#ff3030', signY: 4.6, signW: 11 });
    const g = C.geo; helpers(C, lot).f();
    g.box('metal', 0, 4.2, lot.d / 2 + 0.06, lot.w, 0.3, 0.12, { color: '#c8ccd0' });
    // EAT sign on the roof
    g.box('metal', lot.w / 2 - 4, r.top + 2, 0, 0.3, 4, 0.3, { color: '#222' });
    locSign(C, lot, 'spoon_eat', 'EAT', { w: 4.5, h: 2, x: lot.w / 2 - 4, y: r.top + 4.5, z: 0, bg: '#1a1612', fg: '#ff4040', neon: '#ff2020', flicker: true, gain: 2.8, double: true });
    return r;
  },

  gutter_liquor(C, lot, loc) {
    return shop(C, lot, loc, { H: 5.4, facade: 'brick_dirty', store: 1, door: 1, signText: 'BOOZE HUT', bg: '#0a1a0a', fg: '#7aff5a', neon: '#5aff3a', bars: true, signY: 4.8, signW: 9, flicker: true });
  },

  ink_stinks(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 4.5 + 3 * FLOOR, facade: 'tenement', store: 1, door: 1, signText: 'INK STINKS TATTOO', bg: '#1a0a1a', fg: '#ff60e0', neon: '#ff40d0', signY: 5.2, signW: 10 });
    P.graffitiAt(C, 3, 0.4);
    return r;
  },

  madame_ooze(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 6, facade: 'wood', tint: '#a090b0', door: 0, lampColor: '#c080ff', signText: "MADAME OOZE'S FORTUNES", bg: '#1a0a2a', fg: '#d0a0ff', neon: '#a040ff', signY: 4.4, signW: 10, awning: '#3a1a4a' });
    const g = C.geo; helpers(C, lot).f();
    g.box('metal', 0, r.top + 0.6, 0, 0.6, 1.2, 0.6, { color: '#222' });
    g.sphere('neon', 0, r.top + 2.2, 0, 1.0, 10, 8, { color: '#b060ff' });
    g.box('neon', 2.6, 2.2, lot.d / 2 + 0.1, 0.9, 0.9, 0.06, { color: '#ff40a0' }); // palm sign
    return r;
  },

  lucky_larrys(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 6, facade: 'brick_red', store: 1, door: 1, signText: "LUCKY LARRY'S PAWN", bg: '#141414', fg: '#ffd040', neon: '#ffc020', bars: true, signY: 5, signW: 11 });
    const g = C.geo; helpers(C, lot).f();
    g.box('metal', lot.w / 2 - 1.5, 4.5, lot.d / 2 + 1, 0.1, 0.1, 2, { color: '#222' });
    for (const [x, y] of [[-0.45, 3.6], [0.45, 3.6], [0, 2.9]]) g.sphere('gold', lot.w / 2 - 1.5 + x, y, lot.d / 2 + 1.8, 0.4, 8, 6, {});
    return r;
  },

  rats_clubhouse(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot);
    const r = shop(C, lot, loc, { H: 4.5 + 2 * FLOOR, facade: 'tenement', tint: '#9a8a7a', door: 1, signText: 'GUTTER RATS', bg: '#0a0a0a', fg: '#a8ff30', neon: null, font: 'Special Elite', signY: 6, signW: 10, lampColor: '#a8ff60' });
    H.f();
    for (let i = 0; i < 4; i++) { g.push(); g.translate((i - 1.5) * 5, 0, lot.d / 2 + 0.03); P.graffitiAt(C, 3 + C.rng() * 1.5, 0.2 + C.rng() * 2); g.pop(); }
    // rat head on the roof: big grey wedge with ears
    H.f(); g.translate(0, r.top, 0);
    g.sphere('props', 0, 1.5, 0, 2.6, 8, 6, { color: '#5a5450', sy: 0.8 });
    g.push(); g.translate(0, 1.4, 2.6); g.rotX(PI / 2); g.cyl('props', 0, 0, 0, 0.3, 1.6, 2.4, 8, { color: '#5a5450' }); g.pop();
    for (const s of [-1, 1]) g.sphere('props', s * 1.8, 3.4, 0, 0.9, 8, 5, { color: '#7a6a6a', sy: 0.3 });
    for (const s of [-1, 1]) g.sphere('neon', s * 0.8, 2.6, 1.9, 0.25, 6, 4, { color: '#ff2020' });
    const [bx, bz] = H.wp(lot.w / 2 - 2, lot.d / 2 + 1.0); P.fireBarrel(C, bx, bz);
    return r;
  },

  rusty_nail(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 8, facade: 'brick_red', store: 1, door: 0, signText: 'THE RUSTY NAIL', bg: '#1a0e08', fg: '#ff9a40', neon: '#ff7a20', signY: 5.4, signW: 10, awning: '#3a1a10', flicker: true });
    const g = C.geo; helpers(C, lot).f();
    g.box('neon', lot.w / 2 - 2, 3.4, lot.d / 2 + 0.1, 0.12, 1.6, 0.06, { color: '#ffaa30' }); // beer neon
    g.box('neon', lot.w / 2 - 2, 4.2, lot.d / 2 + 0.1, 0.8, 0.12, 0.06, { color: '#ffaa30' });
    return r;
  },

  iron_lung(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 9, facade: 'concrete', store: 0, tint: '#c8c0b8', door: 4, doorW: 2.6, signText: 'IRON LUNG GYM', bg: '#200808', fg: '#ff3a2a', neon: '#ff2a1a', signY: 6.2, signW: 13 });
    const g = C.geo; helpers(C, lot).f();
    // giant dumbbell
    g.translate(0, r.top + 2.2, 0);
    g.push(); g.rotZ(PI / 2); g.cyl('metal', 0, 0, 0, 0.35, 0.35, 12, 8, { color: '#8a8a8a' });
    for (const s of [-4.6, -3.8, 3.8, 4.6]) g.cyl('metal', 0, s, 0, 1.8, 1.8, 0.6, 14, { color: '#1a1a1a', capBottom: true });
    g.pop();
    for (const s of [-3, 3]) g.box('metal', s, -1.1, 0, 0.4, 2.2, 0.4, { color: '#333' });
    return r;
  },

  first_bank(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D: D - 4, z: -2, H: 15, facade: 'stone', tint: '#e0d8c8', cornice: true, parapet: 1.2 });
    // portico: columns + pediment
    H.f(); g.translate(0, 0, D / 2 - 4);
    for (let i = 0; i < 6; i++) g.cyl('props', -W / 2 + 3 + i * (W - 6) / 5, 5.5, 2.4, 0.55, 0.65, 11, 10, { color: '#c8c0b0' });
    g.box('props', 0, 11.4, 2.2, W - 2, 0.8, 4.6, { color: '#b8b0a0' });
    g.gable('props', 0, 11.8, 2.2, W - 2, 3, 4.6, { color: '#c8c0b0' });
    for (let i = 0; i < 3; i++) g.box('props', 0, 0.1 + i * 0.12, 4.0 - i * 0.6, W - 4, 0.2 + i * 0.24, 0.6, { color: '#a8a498' });
    const door = entrance(C, lot, 0, { z: D / 2 - 4, w: 2.6, h: 4, door: 7, color: '#ffd890' });
    H.f(); locSign(C, lot, loc.id, 'FIRST BANK OF ROTWELL', { w: 16, h: 1.6, y: 9.6, z: D / 2 - 3.85, bg: '#2a2620', fg: '#e8c870', gain: 1.4 });
    // ATM
    H.f(); g.box('metal', 4, 1.0, D / 2 - 3.6, 1.2, 2, 0.6, { color: '#3a4048' }); g.box('lamp', 4, 1.4, D / 2 - 3.28, 0.8, 0.5, 0.02, { color: '#60c0ff', faces: 'f' });
    C.obbLocal(lot, 0, -2, W, D - 4, top);
    for (let i = 0; i < 6; i++) C.obbLocal(lot, -W / 2 + 3 + i * (W - 6) / 5, D / 2 - 1.6, 1.2, 1.2, 11);
    return { door: [0, D / 2] };
  },

  st_mercy(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 4.5 + 6 * FLOOR, facade: 'hospital', tint: '#e8e4dc', parapet: 1 });
    H.f(); g.translate(W / 4, 0, 0);
    const t2 = mass(C, { W: W / 2 - 2, D: D - 8, y0: top, H: 3 * FLOOR, facade: 'hospital', tint: '#d8d4cc' });
    // red cross on the roof (both faces)
    H.f(); g.translate(-W / 4, top + 6, 0);
    for (const rz of [0, PI / 2]) { g.push(); g.rotY(rz); g.box('neon', 0, 0, 0, 8, 2.6, 0.5, { color: '#ff1010' }); g.box('neon', 0, 0, 0, 2.6, 8, 0.5, { color: '#ff1010' }); g.pop(); }
    g.box('metal', 0, -3.5, 0, 0.6, 3, 0.6, { color: '#333' });
    // ER canopy (cantilevered)
    H.f(); g.translate(-W / 4, 0, D / 2);
    g.box('props', 0, 4.4, 2.2, 12, 0.5, 4.4, { color: '#c8c4bc' });
    g.box('lamp', 0, 4.14, 2.2, 10, 0.02, 3.6, { color: '#e8f0ff', faces: 'u' });
    const door = entrance(C, lot, -W / 4, { w: 3.4, h: 3.2, door: 4, color: '#e8f4ff' });
    H.f(); locSign(C, lot, loc.id + '_er', 'EMERGENCY', { w: 7, h: 1.4, x: -W / 4, y: 5.4, z: D / 2 + 4.3, bg: '#e8e4dc', fg: '#d01010', neon: '#ff2020', gain: 2.4, font: 'Barlow Condensed' });
    H.f(); locSign(C, lot, loc.id, "ST. MERCY'S (MOSTLY) GENERAL", { w: 20, h: 2.4, x: W / 6, y: top - 3, bg: '#1a2a3a', fg: '#f0f0f0', gain: 1.4 });
    // helipad
    H.f(); g.translate(W / 4, top + 3 * FLOOR + 0.02, 0);
    g.cyl('props', 0, 0.02, 0, 5, 5, 0.04, 16, { color: '#3a3a3a' });
    g.box('marking', -1.2, 0.06, 0, 0.6, 0.02, 4, { color: '#e8e4dc' }); g.box('marking', 1.2, 0.06, 0, 0.6, 0.02, 4, { color: '#e8e4dc' }); g.box('marking', 0, 0.06, 0, 2.4, 0.02, 0.6, { color: '#e8e4dc' });
    P.antenna(C, ...H.wp(W / 2 - 3, -D / 2 + 3).flatMap((v, i) => i ? [v] : [v]).slice(0, 1), t2, H.wp(W / 2 - 3, -D / 2 + 3)[1], 10, true);
    C.obbLocal(lot, 0, 0, W, D, top + 3 * FLOOR);
    return { door };
  },

  rotwell_pd(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 4.5 + 3 * FLOOR, facade: 'brownstone', tint: '#c8c8d0', cornice: true });
    const door = entrance(C, lot, 0, { w: 3, h: 3.2, door: 4, color: '#d8e4ff' });
    H.f();
    for (const s of [-1, 1]) { g.box('metal', s * 2.6, 2.6, D / 2 + 0.3, 0.4, 0.6, 0.4, { color: '#111' }); g.box(s < 0 ? 'pol_r' : 'pol_b', s * 2.6, 2.6, D / 2 + 0.52, 0.32, 0.5, 0.06, {}); }
    locSign(C, lot, loc.id, '★ ROTWELL PD ★', { w: 14, h: 2.2, y: 5.6, bg: '#0a1430', fg: '#e8ecf8', neon: '#3060ff', gain: 1.8 });
    // light bars on the roof edge
    H.f();
    for (let x = -W / 2 + 3; x < W / 2 - 2; x += 6) { g.box('pol_r', x - 0.6, top + 1.2, D / 2 - 0.4, 1.0, 0.35, 0.4, {}); g.box('pol_b', x + 0.6, top + 1.2, D / 2 - 0.4, 1.0, 0.35, 0.4, {}); }
    // flagpole
    H.f(); g.translate(W / 2 - 3, 0, D / 2 + 0.4);
    g.cyl('metal', 0, 6, 0, 0.08, 0.12, 12, 6, { color: '#c0c0c0' });
    g.box('props', 0.9, 10.8, 0, 1.8, 1.1, 0.03, { color: '#3a4a7a' });
    C.obbLocal(lot, 0, 0, W, D, top);
    const [lx, lz] = H.wp(0, D / 2 + 3); C.light(lx, 3, lz, '#3050ff', 'police');
    return { door };
  },

  gas_n_gulp(C, lot, loc) { return gasStation(C, lot, loc, { name: 'GAS-N-GULP', color: '#c8281a' }); },
  fuel_fumes(C, lot, loc) { return gasStation(C, lot, loc, { name: 'FUEL & FUMES', color: '#2a6a3a', rusty: true }); },
  dusty_pump(C, lot, loc) { return gasStation(C, lot, loc, { name: 'LAST CHANCE GAS', color: '#b07a1a', rusty: true }); },

  pizza_butt(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 6, facade: 'brick_red', store: 0, door: 2, signText: 'PIZZA BUTT', bg: '#e8c040', fg: '#8a1a10', neon: '#ff6a20', signY: 4.9, signW: 10, awning: '#8a1a10' });
    const g = C.geo; helpers(C, lot).f();
    g.translate(0, r.top + 0.5, 0); g.rotX(-0.25);
    g.tri('props', [-3, 0, 0], [3, 0, 0], [0, 5.5, 0], [0, 0, 1, 0, 0.5, 1], '#e8b040');
    g.tri('props', [3, 0, -0.1], [-3, 0, -0.1], [0, 5.5, -0.1], [0, 0, 1, 0, 0.5, 1], '#e8b040');
    g.box('props', 0, 0, 0, 6.4, 0.7, 0.4, { color: '#9a6a20' });
    for (const [x, y] of [[-1, 1.2], [0.9, 1.6], [0, 3], [-0.3, 2.1]]) g.cyl('props', x, y, 0.1, 0.45, 0.45, 0.12, 8, { color: '#a02010' });
    return r;
  },

  lemon_lot(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    g.plane('asphalt', -W / 2, -D / 2, W / 2, D / 2, 0.035, { uv: 'world', uvScale: 14, color: '#c8c4bc' });
    // office trailer at the back
    H.f(); g.translate(-W / 2 + 9, 0, -D / 2 + 5);
    g.box('f_trailer', 0, 1.9, 0, 14, 3.2, 6, { faces: 'fbrl', uvScale: [12, 14], color: '#e8e0a0' });
    g.box('metal', 0, 3.55, 0, 14.3, 0.1, 6.3, { color: '#8a8a60' });
    C.obbLocal(lot, -W / 2 + 9, -D / 2 + 5, 14, 6, 3.6);
    const door = entrance(C, lot, -W / 2 + 9, { z: -D / 2 + 8, w: 1.2, h: 2.4, door: 2, color: '#fff0a0' });
    // cars for "sale"
    for (let i = 0; i < 4; i++) {
      const [x, z] = H.wp(-W / 2 + 6 + i * 6.5, 2);
      P.wreck(C, x, z, lot.rot + PI, { blocks: i === 2, color: ['#c8a020', '#8a2020', '#2a4a8a', '#5a5a5a'][i] });
      g.frame(x, z, lot.rot); g.box('props', 0, 1.9, 0, 0.6, 0.4, 0.05, { color: '#ffe040' });
    }
    // bunting
    const poles = [H.wp(-W / 2 + 1, D / 2 - 1), H.wp(0, D / 2 - 1), H.wp(W / 2 - 1, D / 2 - 1)];
    for (const [x, z] of poles) { g.frame(x, z, 0); g.cyl('metal', 0, 3, 0, 0.08, 0.08, 6, 5, { color: '#888' }); C.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 6); }
    for (let i = 1; i < poles.length; i++) {
      const [ax, az] = poles[i - 1], [bx, bz] = poles[i];
      for (let k = 0; k < 14; k++) {
        const t = (k + 0.5) / 14; const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = 5.8 - Math.sin(t * PI) * 1.2;
        g.frame(x, z, Math.atan2(bx - ax, bz - az) + PI / 2);
        g.tri('props_d', [-0.3, y, 0], [0.3, y, 0], [0, y - 0.6, 0], [0, 0, 1, 0, 0.5, 1], ['#ff3030', '#ffe030', '#3080ff', '#30d030'][k % 4]);
        g.tri('props_d', [0.3, y, 0], [-0.3, y, 0], [0, y - 0.6, 0], [0, 0, 1, 0, 0.5, 1], ['#ff3030', '#ffe030', '#3080ff', '#30d030'][k % 4]);
      }
    }
    // giant lemon on a pole
    H.f(); g.translate(W / 2 - 4, 0, D / 2 - 3);
    g.box('metal', 0, 5, 0, 0.5, 10, 0.5, { color: '#333' });
    g.push(); g.translate(0, 12, 0); g.rotZ(PI / 2); g.sphere('props', 0, 0, 0, 2.2, 12, 8, { color: '#e8d020', sy: 1.4 }); g.pop();
    g.sphere('props', 0, 12, 3.0, 0.3, 6, 4, { color: '#4a6a20' });
    C.obbLocal(lot, W / 2 - 4, D / 2 - 3, 0.6, 0.6, 10);
    H.f(); g.translate(W / 2 - 4, 0, D / 2 - 3);
    locSign(C, { ...lot, d: 0 }, loc.id, 'LEMON LOT MOTORS', { w: 8, h: 2, y: 8.5, z: 0.3, bg: '#e8d020', fg: '#2a2a10', neon: '#ffe040', double: true, font: 'Barlow Condensed' });
    return { door };
  },

  bang_bros(C, lot, loc) {
    const r = shop(C, lot, loc, { H: 6, facade: 'brick_dirty', store: 1, door: 1, signText: 'BANG BANG BROS. FIREARMS', bg: '#1a1410', fg: '#e8d8a0', neon: '#ff3a1a', bars: true, signY: 5, signW: 13 });
    // revolver silhouette on the roof
    const g = C.geo; helpers(C, lot).f(); g.translate(0, r.top + 1, 0);
    g.box('metal', 0, 1.6, 0, 6, 0.9, 0.5, { color: '#2a2a2a' });
    g.cyl('metal', -0.8, 1.6, 0, 0.9, 0.9, 0.6, 10, { color: '#3a3a3a' });
    g.push(); g.translate(-2.6, 0.6, 0); g.rotZ(-0.3); g.box('wood', 0, 0, 0, 0.9, 2.4, 0.5, { color: '#6a4a2a' }); g.pop();
    g.box('metal', 0, 0.4, 0, 0.3, 1.6, 0.3, { color: '#333' });
    return r;
  },

  threads(C, lot, loc) {
    return shop(C, lot, loc, { H: 4.5 + 2 * FLOOR, facade: 'brick_dirty', store: 0, door: 2, signText: 'THREADS & DREADS THRIFT', bg: '#2a1a30', fg: '#ffd0f0', neon: '#ff60c0', signY: 5.2, signW: 12, awning: '#4a2a4a' });
  },

  library(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D: D - 3, z: -1.5, H: 12, facade: 'stone', tint: '#d0c8b8', cornice: true, parapet: 1 });
    H.f(); g.translate(0, 0, D / 2 - 3);
    for (let i = 0; i < 4; i++) g.cyl('props', -6 + i * 4, 4.5, 1.6, 0.45, 0.5, 9, 10, { color: '#c8c0b0' });
    g.box('props', 0, 9.3, 1.5, 15, 0.7, 3.2, { color: '#b8b0a0' });
    for (let i = 0; i < 2; i++) g.box('props', 0, 0.1 + i * 0.12, 2.6 - i * 0.5, 14, 0.2 + i * 0.24, 0.5, { color: '#a8a498' });
    const door = entrance(C, lot, 0, { z: D / 2 - 3, w: 2.4, h: 3.4, door: 7, color: '#ffe0a0' });
    H.f(); locSign(C, lot, loc.id, 'ROTWELL PUBLIC LIBRARY', { w: 14, h: 1.5, y: 10.4, z: D / 2 - 1.3, bg: '#2a2620', fg: '#e8dcc0', gain: 1.2 });
    C.obbLocal(lot, 0, -1.5, W, D - 3, top);
    for (let i = 0; i < 4; i++) C.obbLocal(lot, -6 + i * 4, D / 2 - 1.4, 1, 1, 9);
    return { door: [0, D / 2] };
  },

  city_hall(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D: D - 6, z: -3, H: 16, facade: 'stone', tint: '#e0dccc', cornice: true, parapet: 1.2 });
    // dome
    H.f(); g.translate(0, top, -3);
    g.cyl('f_stone', 0, 3, 0, 7, 7, 6, 18, { uvScale: 12, color: '#e0dccc' });
    g.sphere('metal', 0, 6, 0, 7.2, 18, 7, { half: true, color: '#5a7a6a' });
    g.cyl('props', 0, 14.2, 0, 0.6, 0.9, 2.4, 8, { color: '#d0c8b8' });
    g.cyl('metal', 0, 17, 0, 0.06, 0.1, 4, 5, { color: '#ccc' });
    g.box('props', 0.8, 18.4, 0, 1.6, 1, 0.03, { color: '#7a2a2a' });
    // portico
    H.f(); g.translate(0, 0, D / 2 - 6);
    for (let i = 0; i < 6; i++) g.cyl('props', -10 + i * 4, 6, 3, 0.6, 0.7, 12, 10, { color: '#d0c8b8' });
    g.box('props', 0, 12.5, 3, 24, 1, 6, { color: '#c0b8a8' });
    g.gable('props', 0, 13, 3, 24, 3.5, 6, { color: '#d0c8b8' });
    for (let i = 0; i < 4; i++) g.box('props', 0, 0.06 + i * 0.1, 5.6 - i * 0.6, 22, 0.12 + i * 0.2, 0.6, { color: '#a8a498' });
    const door = entrance(C, lot, 0, { z: D / 2 - 6, w: 3, h: 4.2, door: 7, color: '#ffe0a0' });
    H.f(); locSign(C, lot, loc.id, 'CITY HALL', { w: 10, h: 1.6, y: 11, z: D / 2 - 2.9, bg: '#2a2620', fg: '#f0e0b0', gain: 1.2 });
    H.f(); locSign(C, lot, loc.id + '_b', 'WE ARE OPEN FOR BUSINESS (BRIBES)', { w: 9, h: 1, y: 2.0, x: 8.5, z: D / 2 - 0.2, bg: '#e8e0c8', fg: '#2a2a2a', gain: 0.6, board: true });
    C.obbLocal(lot, 0, -3, W, D - 6, top);
    for (let i = 0; i < 6; i++) C.obbLocal(lot, -10 + i * 4, D / 2 - 3, 1.4, 1.4, 12);
    return { door: [0, D / 2] };
  },

  skid_row_apts(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 4.5 + 6 * FLOOR, facade: 'tenement', store: 1, tint: '#d0c0b0', cornice: true });
    const door = entrance(C, lot, 0, { w: 1.8, h: 2.8, door: 1, color: '#ffc080' });
    H.f(); locSign(C, lot, loc.id, 'SKID ROW APARTMENTS', { w: 11, h: 1.6, y: 4.9, bg: '#201810', fg: '#e8d8b0', neon: null, gain: 1 });
    // vertical neon APTS
    H.f(); g.box('metal', W / 2 - 1.2, 12, D / 2 + 1, 0.4, 8, 1.6, { color: '#1a1814' });
    for (let i = 0; i < 4; i++) g.box(i === 2 ? 'neon_flk' : 'neon', W / 2 - 1.2, 15 - i * 2, D / 2 + 1, 0.5, 1.2, 1.2, { color: '#ff3050' });
    C.obbLocal(lot, 0, 0, W, D, top);
    P.rooftopTank(C, ...H.wp(W / 4, 0).slice(0, 1), top, H.wp(W / 4, 0)[1]);
    for (let i = 0; i < 3; i++) { g.push(); H.f(); g.translate((i - 1) * 6, 0, D / 2 + 0.03); P.graffitiAt(C, 2.5, 0.5); g.pop(); }
    return { door };
  },

  rotwell_u(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 4 * FLOOR + 1, facade: 'brick_red', tint: '#e0c8b8', cornice: true, parapet: 1 });
    g.gable('shingle', 0, top, 0, W, 5, D, { color: '#6a7a8a', endMat: 'f_brick_red', uvScale: 3 });
    // clock tower
    H.f(); g.translate(0, 0, D / 2 - 4);
    g.box('f_brick_red', 0, 14, 0, 7, 28, 7, { uvScale: [12, 14], color: '#d8c0b0' });
    g.box('props', 0, 28.3, 0, 7.8, 0.6, 7.8, { color: '#c8c0b0' });
    g.cyl('shingle', 0, 31.5, 0, 0.1, 5.4, 6, 4, { color: '#5a6a7a', arc0: PI / 4 });
    for (let k = 0; k < 4; k++) { g.push(); g.rotY(k * PI / 2); g.cyl('lamp', 0, 24, 3.52, 1.8, 1.8, 0.04, 16, { color: '#fff0c0' }); g.pop(); }
    g.push(); g.translate(0, 24, 3.6); g.rotZ(0.6); g.box('props', 0, 0.7, 0, 0.12, 1.4, 0.04, { color: '#111' }); g.pop();
    g.push(); g.translate(0, 24, 3.6); g.rotZ(2.4); g.box('props', 0, 0.5, 0, 0.12, 1.0, 0.04, { color: '#111' }); g.pop();
    const door = entrance(C, lot, 0, { z: D / 2 - 0.5, w: 2.6, h: 3.6, door: 7, color: '#ffe0a0' });
    H.f(); locSign(C, lot, loc.id, 'ROTWELL UNIVERSITY', { w: 14, h: 1.8, y: 9, z: D / 2 + 0.05, x: -W / 4, bg: '#3a1a1a', fg: '#f0e0c0', gain: 1.2 });
    H.f(); locSign(C, lot, loc.id + '_m', 'EST. 1887 · ACCREDITED-ISH', { w: 10, h: 1.2, y: 9, z: D / 2 + 0.05, x: W / 4, bg: '#2a1a1a', fg: '#c8b890', gain: 0.8 });
    C.obbLocal(lot, 0, 0, W, D, top + 4);
    C.obbLocal(lot, 0, D / 2 - 4, 7, 7, 30);
    return { door };
  },

  golden_tooth(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const Hh = 16;
    // gold box
    g.box('gold', 0, Hh / 2, -2, W, Hh, D - 4, { faces: 'fbrl', uvScale: 6 });
    g.box('roof', 0, Hh, -2, W, 0.02, D - 4, { faces: 't', uvScale: 8 });
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 4) g.box('glassdark', x, Hh / 2, D / 2 - 3.95, 1.4, Hh - 5, 0.05, { color: '#3a2a10' });
    // chase-light bands along the roof line and marquee
    g.box('chase', 0, Hh - 0.5, D / 2 - 3.9, W, 0.7, 0.1, { uvScale: [8, 0.7], faces: 'f' });
    g.box('chase', 0, 1.2, D / 2 - 3.9, W, 0.5, 0.1, { uvScale: [8, 0.5], faces: 'f' });
    // marquee canopy
    H.f(); g.translate(0, 0, D / 2 - 4);
    g.box('gold', 0, 6.2, 2.2, 20, 1.4, 4.4, { uvScale: 4 });
    g.box('chase', 0, 6.2, 4.42, 20, 1.0, 0.02, { faces: 'f', uvScale: [8, 1] });
    g.box('lamp', 0, 5.48, 2.2, 18, 0.02, 3.6, { color: '#ffe0a0', faces: 'u' });
    g.plane('marking', -1.6, 0, 1.6, 4.5, 0.06, { color: '#7a0a0a' }); // red carpet
    for (const s of [-1.8, 1.8]) for (let k = 0; k < 3; k++) g.cyl('gold', s, 0.5, 0.8 + k * 1.4, 0.06, 0.06, 1.0, 6, {});
    const door = entrance(C, lot, 0, { z: D / 2 - 4, w: 3.6, h: 4, door: 4, color: '#ffd060' });
    H.f(); locSign(C, lot, loc.id, 'THE GOLDEN TOOTH', { w: 22, h: 4, y: Hh + 3.2, z: D / 2 - 4.5, bg: '#1a1004', fg: '#ffd040', neon: '#ffc020', gain: 2.6, font: 'Barlow Condensed' });
    H.f(); g.box('metal', 0, Hh + 1, D / 2 - 4.7, 22.5, 2, 0.4, { color: '#2a2010' });
    // giant gold tooth on the roof
    H.f(); g.translate(W / 4, Hh, -6);
    g.box('props', 0, 0.5, 0, 6, 1, 6, { color: '#2a2a2a' });
    g.push(); g.translate(0, 6, 0);
    g.sphere('props', 0, 0, 0, 3.6, 12, 8, { color: '#f0ecd8', sy: 0.9 });
    for (const s of [-1, 1]) { g.push(); g.translate(s * 1.6, -3.5, 0); g.rotZ(s * 0.2); g.cyl('props', 0, 0, 0, 1.4, 0.5, 4.4, 8, { color: '#f0ecd8' }); g.pop(); }
    g.sphere('gold', 1.4, 1.2, 2.7, 1.1, 8, 6, {}); // gold cap
    g.pop();
    // searchlight beams (night)
    for (const s of [-1, 1]) {
      H.f(); g.translate(s * (W / 2 - 4), Hh, -D / 2 + 6);
      g.cyl('metal', 0, 0.6, 0, 0.8, 0.9, 1.2, 8, { color: '#333' });
      g.push(); g.translate(0, 1.4, 0); g.rotX(-0.35); g.rotZ(s * 0.35);
      g.cyl('beam', 0, 60, 0, 5, 0.6, 120, 12, { color: '#8a7448', capTop: false, uvScale: 120, vflip: true });
      g.pop();
    }
    C.obbLocal(lot, 0, -2, W, D - 4, Hh + 2);
    for (const s of [-1, 1]) C.obbLocal(lot, s * 9.5, D / 2 - 0.4, 0.5, 0.5, 6); // canopy edge
    return { door };
  },

  club_velvet(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    const r = shop(C, lot, loc, { H: 10, facade: 'concrete', tint: '#5a4a6a', door: 1, doorW: 2.2, lampColor: '#ff40c0', signText: 'CLUB VELVET', bg: '#1a0820', fg: '#ff70e0', neon: '#ff30c0', signY: 6.5, signW: 12, font: 'Barlow Condensed' });
    H.f();
    for (let x = -W / 2 + 1; x < W / 2; x += 3) g.box(x % 2 ? 'neon' : 'neon_flk', x, r.top - 0.6, D / 2 + 0.1, 0.12, 0.12, 0.06, { color: '#a040ff' });
    g.box('neon', 0, r.top - 0.6, D / 2 + 0.1, W, 0.1, 0.06, { color: '#a040ff' });
    g.box('neon', -W / 2 + 0.2, r.top / 2, D / 2 + 0.1, 0.1, r.top - 1, 0.06, { color: '#ff30c0' });
    g.box('neon', W / 2 - 0.2, r.top / 2, D / 2 + 0.1, 0.1, r.top - 1, 0.06, { color: '#ff30c0' });
    // velvet rope + carpet (right against the wall so the sidewalk stays clear)
    g.plane('marking', -1.2, D / 2, 1.2, D / 2 + 1.4, 0.065, { color: '#5a0a2a' });
    for (const x of [-3.2, -2]) g.cyl('gold', x, 0.5, D / 2 + 0.5, 0.06, 0.06, 1, 6, {});
    g.box('props', -2.6, 0.85, D / 2 + 0.5, 1.2, 0.08, 0.08, { color: '#8a0a3a' });
    return r;
  },

  grimco(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const base = mass(C, { W, D, H: 4.5 + 2 * FLOOR, facade: 'concrete', store: 0, tint: '#a8b0a8', cornice: true });
    H.f();
    const top = mass(C, { W: W - 6, D: D - 6, y0: base, H: 26 * FLOOR, facade: 'glass_green', parapet: 1.2 });
    H.f(); const top2 = mass(C, { W: W - 14, D: D - 14, y0: top, H: 3 * FLOOR, facade: 'glass_green', parapet: 0.8 });
    H.f(); g.box('neon', 0, top2 + 0.6, (D - 14) / 2 + 0.1, W - 14, 0.3, 0.1, { color: '#40ff60' });
    H.f(); locSign(C, lot, loc.id + '_top', 'GRIMCO', { w: 16, h: 4, y: top - 4, z: (D - 6) / 2 + 0.1, bg: '#081a0c', fg: '#80ff60', neon: '#40ff40', gain: 2.4, font: 'Barlow Condensed', board: false });
    const door = entrance(C, lot, 0, { w: 3.6, h: 3.4, door: 4, color: '#e0ffe8' });
    H.f(); locSign(C, lot, loc.id, 'GRIMCO TOWER — WE OWN THE AIR', { w: 14, h: 1.6, y: 5.2, bg: '#0a140c', fg: '#c8ffb8', gain: 1.4 });
    P.antenna(C, ...[H.wp(0, 0)[0]], top2, H.wp(0, 0)[1], 14, true);
    C.obbLocal(lot, 0, 0, W, D, top2);
    return { door };
  },

  holy_rebate(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D: D - 6, z: -3, H: 11, facade: 'stone', tint: '#c8c0b0', parapet: 0 });
    g.push(); g.rotY(PI / 2); g.gable('shingle', 3, top, 0, D - 4, 7, W + 0.8, { color: '#4a4a52', endMat: 'f_stone', uvScale: 3 }); g.pop();
    // steeple at the front
    H.f(); g.translate(0, 0, D / 2 - 6);
    g.box('f_stone', 0, 11, 0, 6, 22, 6, { uvScale: [12, 14], color: '#c8c0b0' });
    g.cyl('shingle', 0, 27, 0, 0.1, 4.2, 10, 4, { color: '#4a4a52', arc0: PI / 4 });
    g.box('neon', 0, 33.6, 0, 0.3, 3, 0.3, { color: '#ffe060' }); g.box('neon', 0, 34.2, 0, 1.8, 0.3, 0.3, { color: '#ffe060' });
    g.cyl('neon', 0, 16, 3.02, 1.6, 1.6, 0.05, 14, { color: '#c040ff' }); // rose window
    for (let k = 0; k < 6; k++) { g.push(); g.translate(0, 16, 3.06); g.rotZ(k * PI / 6); g.box('props', 0, 0, 0, 3.2, 0.12, 0.04, { color: '#111' }); g.pop(); }
    const door = entrance(C, lot, 0, { z: D / 2 - 3, w: 2.6, h: 4, door: 7, color: '#ffd890' });
    H.f(); locSign(C, lot, loc.id, 'CHURCH OF THE HOLY REBATE', { w: 12, h: 1.4, y: 5.4, z: D / 2 - 2.95, bg: '#1a1a2a', fg: '#f0e8d0', gain: 1.2 });
    H.f(); locSign(C, lot, loc.id + '_n', 'SAVE 20% ON ALL SINS', { w: 7, h: 1.6, x: W / 2 - 4.5, y: 3, z: D / 2 - 1, bg: '#0a0a14', fg: '#ff60a0', neon: '#ff3080', flicker: true, gain: 2.6, double: true, font: 'Barlow Condensed' });
    H.f(); g.box('metal', W / 2 - 4.5, 1.1, D / 2 - 1, 0.2, 2.2, 0.2, { color: '#222' });
    C.obbLocal(lot, 0, -3, W, D - 6, top + 4);
    C.obbLocal(lot, 0, D / 2 - 6, 6, 6, 22);
    C.obbLocal(lot, W / 2 - 4.5, D / 2 - 1, 7.2, 0.4, 4);
    return { door: [0, D / 2] };
  },

  syndicate_lounge(C, lot, loc) {
    return shop(C, lot, loc, { H: 4.5 + 2 * FLOOR, facade: 'brownstone', tint: '#a89090', door: 7, doorW: 2, lampColor: '#ff5050', signText: 'THE VELVET SYNDICATE', bg: '#200808', fg: '#d8b060', signY: 5.4, signW: 11, awning: '#4a0a10', cornice: true });
  },

  hilltop_penthouse(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const base = mass(C, { W, D, H: 4.5 + 15 * FLOOR, facade: 'stucco', store: 0, tint: '#e8e0d8', cornice: true });
    H.f(); const top = mass(C, { W: W - 8, D: D - 8, y0: base, H: 2 * FLOOR, facade: 'glass', parapet: 1.1 });
    H.f(); g.box('neon', 0, top + 0.2, (D - 8) / 2 + 0.1, W - 8, 0.2, 0.08, { color: '#ffd8a0' });
    const door = entrance(C, lot, 0, { w: 3, h: 3.2, door: 4, color: '#ffe8c0', awning: '#1a1a2a' });
    H.f(); locSign(C, lot, loc.id, 'PINNACLE PENTHOUSE', { w: 12, h: 1.6, y: 5.4, bg: '#101018', fg: '#e8d8b0', gain: 1.6 });
    C.obbLocal(lot, 0, 0, W, D, top);
    return { door };
  },

  hilltop_mansion(C, lot, loc) {
    const H = helpers(C, lot);
    const m = mansion(C, lot, { facade: 'stone', house: { w: 40, d: 22, floors: 3 } });
    H.f(); locSign(C, lot, loc.id, 'GRIMSWORTH MANOR', { w: 5, h: 1.1, x: -5.5, y: 2.2, z: lot.d / 2 + 0.6, bg: '#2a2418', fg: '#e8d090', gain: 1.4 });
    const [x, z] = H.wp(0, lot.d / 2 + 1.6); C.geo.identity(); C.geo.plane('glow', x - 4, z - 4, x + 4, z + 4, 0.09, { color: '#ffc070' });
    return { door: [0, lot.d / 2] };
  },

  meat_plant(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D: D - 10, z: -5, H: 14, facade: 'industrial', tint: '#c8b8a8', parapet: 1 });
    for (const [x, z] of [[-W / 3, -D / 4], [W / 3, -D / 3]]) { const [wx, wz] = H.wp(x, z); P.smokestack(C, wx, wz, 2.2, top + 22); }
    for (const x of [-W / 2 + 6, W / 2 - 6]) { const [wx, wz] = H.wp(x, D / 2 - 6); P.tank(C, wx, wz, 2.5, 8, '#7a6a5a'); }
    H.f(); g.translate(0, 0, D / 2 - 10);
    for (let i = 0; i < 3; i++) { const cx = -W / 4 + i * W / 4; if (Math.abs(cx) < 4) continue; g.wall('doors', cx - 2.5, 0.02, cx + 2.5, 5, 0.06, { uvRect: [0.754, 0.504, 0.996, 0.996] }); g.box('lamp', cx, 5.6, 0.3, 0.6, 0.1, 0.4, { color: '#e8f0ff', faces: 'u' }); }
    const door = entrance(C, lot, 0, { z: D / 2 - 10, w: 1.6, h: 2.6, door: 1, color: '#e8f0ff' });
    H.f(); locSign(C, lot, loc.id, 'ROTWELL MEAT & RENDERING', { w: 22, h: 2.6, y: 10.5, z: D / 2 - 9.95, bg: '#3a0e0e', fg: '#f0d8c0', gain: 1.3 });
    H.f(); locSign(C, lot, loc.id + '_s', '0 DAYS SINCE LAST INCIDENT', { w: 6, h: 1.2, x: W / 2 - 6, y: 2.5, z: D / 2 - 9.95, bg: '#e8e0c8', fg: '#a01010', gain: 0.6 });
    // pig on the roof
    H.f(); g.translate(0, top, -5);
    g.sphere('props', 0, 2.5, 0, 3, 10, 6, { color: '#d89090', sy: 0.75 });
    g.sphere('props', 0, 2.8, 3, 1.4, 8, 5, { color: '#d89090' });
    g.cyl('props', 0, 2.6, 4.3, 0.6, 0.6, 0.4, 8, { color: '#c07070' });
    for (const s of [-1, 1]) for (const t of [-1.5, 1.5]) g.cyl('props', s * 1.4, 0.6, t, 0.4, 0.4, 1.2, 6, { color: '#c07070' });
    C.obbLocal(lot, 0, -5, W, D - 10, top);
    const [sx, sz] = H.wp(W / 2 - 2, D / 2 - 2); C.emit(sx, 0.5, sz, 'steam');
    return { door: [0, D / 2 - 10] };
  },

  chop_chop(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 7, facade: 'corrugated', tint: '#d0d0d0', parapet: 0.5 });
    for (const x of [-W / 4, W / 4 - 2]) { g.wall('doors', x - 3, 0.02, x + 3, 5.2, D / 2 + 0.05, { uvRect: [0.754, 0.504, 0.996, 0.996] }); g.box('lamp', x, 5.6, D / 2 + 0.3, 0.6, 0.1, 0.4, { color: '#ffb060', faces: 'u' }); }
    const door = entrance(C, lot, W / 2 - 2.5, { w: 1.2, h: 2.4, door: 1, color: '#ffb060' });
    H.f(); locSign(C, lot, loc.id, 'CHOP CHOP CUSTOMS', { w: 12, h: 2, y: top - 0.6, bg: '#1a0e04', fg: '#ff9030', neon: '#ff7a10', gain: 2.2, font: 'Barlow Condensed' });
    C.obbLocal(lot, 0, 0, W, D, top);
    P.tires(C, ...H.wp(-W / 2 - 1.5, D / 2 - 2), 5);
    return { door };
  },

  the_pit(C, lot, loc) {
    const H = helpers(C, lot);
    warehouse(C, lot, { facade: 'corrugated_rust', doors: false, sign: false });
    const door = entrance(C, lot, 0, { w: 1.6, h: 2.6, door: 1, color: '#ff4030' });
    H.f(); locSign(C, lot, loc.id, 'THE PIT', { w: 8, h: 2.4, y: 5.2, bg: '#0a0404', fg: '#ff2a1a', neon: '#ff1a0a', flicker: true, gain: 2.6, font: 'Special Elite' });
    H.f(); locSign(C, lot, loc.id + '_r', 'NO RULES · NO REFUNDS · NO TEETH', { w: 9, h: 0.9, y: 3.2, x: 0, bg: '#141010', fg: '#e8d0b0', gain: 0.8 });
    const [bx, bz] = H.wp(3.2, lot.d / 2 + 1); P.fireBarrel(C, bx, bz);
    return { door };
  },

  dock_loft(C, lot, loc) {
    const H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 4.5 + 4 * FLOOR, facade: 'industrial', store: 1, tint: '#d8c8b8', cornice: true });
    const door = entrance(C, lot, 0, { w: 2, h: 3, door: 0, color: '#ffd8a0', awning: '#2a2a2a' });
    H.f(); locSign(C, lot, loc.id, 'DOCKSIDE LOFT', { w: 10, h: 1.6, y: 5, bg: '#14181c', fg: '#d8e0e8', gain: 1.4 });
    P.rooftopTank(C, H.wp(W / 4, 0)[0], top, H.wp(W / 4, 0)[1]);
    C.obbLocal(lot, 0, 0, W, D, top);
    return { door };
  },

  warehouse_13(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot);
    const h = warehouse(C, lot, { facade: 'corrugated', sign: false });
    H.f(); locSign(C, lot, loc.id, 'WAREHOUSE 13', { w: 12, h: 2.4, y: h - 2, x: 0, bg: '#2a2e2a', fg: '#f0f0e0', gain: 0.8, font: 'Barlow Condensed' });
    H.f(); g.box('props', -lot.w / 2 + 6, h / 2, lot.d / 2 + 0.06, 6, 6, 0.02, { color: '#e8e0c8', faces: 'f' });
    locSign(C, lot, loc.id + '_n', '13', { w: 5, h: 5, x: -lot.w / 2 + 6, y: h / 2, z: lot.d / 2 - 0.1, bg: '#e8e0c8', fg: '#1a1a1a', board: false, gain: 0.3 });
    return { door: [lot.w / 2 - 3, lot.d / 2] };
  },

  double_wide(C, lot, loc) {
    const H = helpers(C, lot);
    const t = trailer(C, lot, { color: '#e0d8a8', door: 0 });
    // the trailer door is set back from the road: report its world spot directly
    H.f(); locSign(C, lot, loc.id, 'DOUBLE-WIDE DREAMS', { w: 5, h: 1.2, x: lot.w / 2 - 4, y: 1.6, z: lot.d / 2 - 1, bg: '#e8e0c8', fg: '#3a2a1a', double: true, gain: 0.8 });
    H.f(); C.geo.box('wood', lot.w / 2 - 4, 0.6, lot.d / 2 - 1, 0.15, 1.2, 0.15, { color: '#5a4a38' });
    return { doorWorld: [t.doorX, t.doorZ] };
  },

  dirty_spur(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    H.f();
    const top = mass(C, { W, D, H: 5, facade: 'wood', tint: '#c8a888', parapet: 0 });
    // false front
    g.box('f_wood', 0, 6, D / 2 + 0.2, W, 3, 0.4, { uvScale: [12, 14], color: '#b89878' });
    g.box('wood', 0, 3.2, D / 2 + 1.6, W, 0.15, 3.2, { color: '#6a5440' }); // porch roof
    for (let x = -W / 2 + 0.3; x <= W / 2; x += W / 4) { g.box('wood', x, 1.6, D / 2 + 3.0, 0.25, 3.2, 0.25, { color: '#5a4430' }); C.obbLocal(lot, x, D / 2 + 3.0, 0.3, 0.3, 3.2); }
    g.box('wood', 0, 0.06, D / 2 + 1.6, W, 0.12, 3.2, { color: '#6a5440' });
    const door = entrance(C, lot, 0, { w: 2, h: 2.6, door: 0, color: '#ffa040' });
    H.f(); locSign(C, lot, loc.id, 'THE DIRTY SPUR', { w: 12, h: 2.2, y: 6.2, z: D / 2 + 0.4, bg: '#2a1a0a', fg: '#ffb040', neon: '#ff9020', gain: 2.2 });
    H.f(); g.box('neon_flk', W / 2 - 2, 2.2, D / 2 + 0.1, 1.6, 0.12, 0.06, { color: '#4080ff' }); g.box('neon', W / 2 - 2, 1.8, D / 2 + 0.1, 1.2, 0.12, 0.06, { color: '#ff3030' });
    // hitch rail with motorcycles
    for (let i = 0; i < 3; i++) {
      const [x, z] = H.wp(-W / 2 + 3 + i * 2, D / 2 + 5);
      g.frame(x, z, lot.rot + PI / 2);
      g.box('metal', 0, 0.6, 0, 0.3, 0.5, 1.6, { color: ['#1a1a1a', '#5a1a1a', '#2a2a3a'][i] });
      for (const t of [-0.8, 0.8]) { g.push(); g.translate(0, 0.35, t); g.rotZ(PI / 2); g.cyl('props', 0, 0, 0, 0.35, 0.35, 0.12, 8, { color: '#111' }); g.pop(); }
      g.box('metal', 0, 1.0, 0.7, 0.8, 0.05, 0.05, { color: '#aaa' });
      C.solid(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 1.2);
    }
    C.obbLocal(lot, 0, 0, W, D, top + 2.5);
    return { door };
  },

  junkyard(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    const r = C.rng;
    // corrugated perimeter with a gate
    const gate = 8;
    const pts = [H.wp(-W / 2, D / 2), H.wp(-gate / 2, D / 2), H.wp(gate / 2, D / 2), H.wp(W / 2, D / 2), H.wp(W / 2, -D / 2), H.wp(-W / 2, -D / 2)];
    const seg = (a, b) => P.wallRun(C, a[0], a[1], b[0], b[1], { h: 3.2, t: 0.2, mat: 'f_corrugated_rust', cap: '#4a3a2a' });
    seg(pts[0], pts[1]); seg(pts[2], pts[3]); seg(pts[3], pts[4]); seg(pts[4], pts[5]); seg(pts[5], pts[0]);
    H.f(); for (const s of [-1, 1]) { g.box('metal', s * (gate / 2 + 0.3), 2, D / 2, 0.5, 4, 0.5, { color: '#3a3a3a' }); C.obbLocal(lot, s * (gate / 2 + 0.3), D / 2, 0.6, 0.6, 4); }
    g.box('metal', 0, 4.2, D / 2, gate + 1.2, 0.5, 0.4, { color: '#3a3a3a' });
    locSign(C, lot, loc.id, "SCRAPPER PETE'S JUNKYARD", { w: 9, h: 1.6, y: 5.3, z: D / 2 - 0.2, bg: '#3a2a10', fg: '#f0d890', gain: 1.4, double: true });
    // office shack right inside the gate
    H.f(); g.translate(-gate / 2 - 6, 0, D / 2 - 6);
    g.box('f_wood', 0, 1.6, 0, 8, 3.2, 6, { faces: 'fbrl', uvScale: [12, 14], color: '#a89878' });
    g.box('corr', 0, 3.3, 0, 8.6, 0.12, 6.6, { color: '#8a7a6a', uvScale: 3 });
    C.obbLocal(lot, -gate / 2 - 6, D / 2 - 6, 8, 6, 3.4);
    H.f(); g.translate(-gate / 2 - 6, 0, D / 2 - 3); P.doorway(C, 2, 1.1, 2.3, 1, { lamp: true });
    // stacks of crushed cars + junk
    for (let i = 0; i < 7; i++) {
      const lx = -W / 2 + 6 + r() * (W - 12), lz = -D / 2 + 6 + r() * (D - 20);
      const [x, z] = H.wp(lx, lz);
      const n = 1 + (r() * 3 | 0), rot = lot.rot + r() * 0.3;
      g.frame(x, z, rot);
      for (let k = 0; k < n; k++) g.box('rust', (r() - 0.5) * 0.3, 0.6 + k * 1.15, (r() - 0.5) * 0.3, 2.0, 1.1, 4.2, { color: ['#7a3a2a', '#3a4a6a', '#5a5a4a', '#6a6a2a'][(r() * 4) | 0] });
      C.obb(x, z, rot, 2.2, 4.4, n * 1.15);
    }
    for (let i = 0; i < 4; i++) { const [x, z] = H.wp(-W / 2 + 6 + r() * (W - 12), -D / 2 + 6 + r() * (D - 20)); P.junkPile(C, x, z, 1.2); }
    // magnet crane
    H.f(); g.translate(W / 4, 0, -D / 4);
    g.box('metal', 0, 1.2, 0, 4, 2.4, 6, { color: '#a08020' });
    g.push(); g.translate(0, 2.4, 0); g.rotX(-0.9); g.box('metal', 0, 7, 0, 0.6, 14, 0.6, { color: '#a08020' }); g.pop();
    g.box('metal', 0, 7, 9.5, 0.05, 6, 0.05, { color: '#222' });
    g.cyl('metal', 0, 3.6, 9.5, 1.2, 1.2, 0.5, 10, { color: '#333' });
    C.obbLocal(lot, W / 4, -D / 4, 4, 6, 2.4);
    return { door: [0, D / 2] };
  },

  bunker(C, lot, loc) {
    const g = C.geo, H = helpers(C, lot), W = lot.w, D = lot.d;
    const r = C.rng;
    const gate = 7;
    const pts = [H.wp(-W / 2, D / 2), H.wp(-gate / 2, D / 2), H.wp(gate / 2, D / 2), H.wp(W / 2, D / 2), H.wp(W / 2, -D / 2), H.wp(-W / 2, -D / 2)];
    const fence = (a, b) => P.chainFence(C, a[0], a[1], b[0], b[1], { h: 3.4, razor: true });
    fence(pts[0], pts[1]); fence(pts[2], pts[3]); fence(pts[3], pts[4]); fence(pts[4], pts[5]); fence(pts[5], pts[0]);
    // gate: barrier arm + guard booth
    H.f();
    g.box('metal', gate / 2 + 1.5, 1.4, D / 2 - 1.5, 2.4, 2.8, 2.4, { color: '#4a5a3a' });
    g.box('glassdark', gate / 2 + 1.5, 1.9, D / 2 - 0.29, 1.8, 0.9, 0.04, { color: '#606a60' });
    C.obbLocal(lot, gate / 2 + 1.5, D / 2 - 1.5, 2.4, 2.4, 2.8);
    g.push(); g.translate(gate / 2, 1.1, D / 2 - 0.2); g.rotZ(0.15);
    g.box('props', -gate / 2, 0, 0, gate, 0.18, 0.18, { color: '#d8d0c0' });
    for (let x = -gate + 0.5; x < 0; x += 1.2) g.box('props', x, 0, 0.01, 0.5, 0.2, 0.2, { color: '#b01010' });
    g.pop();
    for (const s of [-1, 1]) P.jersey(C, ...H.wp(s * 6, D / 2 + 1.2), lot.rot + PI / 2, 3);
    locSign(C, lot, loc.id, 'RESTRICTED BUNKER 9', { w: 7, h: 1.5, x: -gate / 2 - 5, y: 2.2, z: D / 2 + 0.25, bg: '#e8e0c8', fg: '#a01010', gain: 0.6, double: true });
    H.f(); locSign(C, lot, loc.id + '_k', 'KEEP OUT · TRESPASSERS WILL BE STUDIED', { w: 9, h: 1, x: W / 2 - 8, y: 1.8, z: D / 2 + 0.25, bg: '#c8c0a0', fg: '#1a1a1a', gain: 0.4, double: true });
    // the bunker mound
    H.f(); g.translate(0, 0, -D / 6);
    g.push(); g.rotY(PI / 2); g.rotZ(PI / 2);
    g.cyl('f_concrete', 0, 0, 0, 10, 10, 28, 14, { arc0: 0, arc: PI, uvScale: 12, color: '#8a8a7a', capTop: false });
    g.pop();
    g.box('f_concrete', 0, 2.6, 14, 10, 5.2, 0.8, { uvScale: [12, 14], color: '#7a7a6a' });
    g.box('metal', 0, 2.1, 14.45, 5, 4.2, 0.2, { color: '#4a4a40' });
    for (let k = 0; k < 6; k++) g.box('metal', 0, 0.5 + k * 0.7, 14.58, 5, 0.06, 0.06, { color: '#2a2a20' });
    g.box('pol_r', -3.2, 4.6, 14.5, 0.5, 0.5, 0.3, {});
    g.box('props', 0, 5.4, 14.45, 5, 0.6, 0.1, { color: '#c0a020', faces: 'f' });
    C.obbLocal(lot, 0, -D / 6, 20, 28, 10);
    // watchtower
    const tw = H.wp(-W / 2 + 6, D / 2 - 6);
    g.frame(tw[0], tw[1], lot.rot);
    for (const s of [-1.5, 1.5]) for (const t of [-1.5, 1.5]) g.box('metal', s, 4, t, 0.25, 8, 0.25, { color: '#4a4a3a' });
    g.box('wood', 0, 8.1, 0, 4, 0.2, 4, { color: '#5a4a38' });
    g.box('wood', 0, 9.0, 1.95, 4, 1.6, 0.1, { color: '#5a4a38' }); g.box('wood', 0, 9.0, -1.95, 4, 1.6, 0.1, { color: '#5a4a38' });
    g.gable('corr', 0, 10.4, 0, 4.6, 1.2, 4.6, { color: '#6a6a5a' });
    g.box('lamp', 1.5, 9.6, 2.1, 0.6, 0.5, 0.3, { color: '#f0f4ff' });
    C.solid(tw[0] - 1.8, tw[1] - 1.8, tw[0] + 1.8, tw[1] + 1.8, 9);
    C.light(...[tw[0]], 9.5, tw[1], '#e8f0ff', 'street');
    // sandbags, drums
    for (let i = 0; i < 4; i++) { const [x, z] = H.wp((r() - 0.5) * (W - 20), (r() - 0.5) * (D - 30) + D / 5); P.sandbags(C, x, z, r() * 3, 3 + r() * 3); }
    for (let i = 0; i < 3; i++) { const [x, z] = H.wp((r() - 0.5) * (W - 16), -D / 2 + 6 + r() * 6); P.oilDrums(C, x, z, 3); }
    const [lx, lz] = H.wp(0, D / 2 + 1); C.light(lx, 4, lz, '#ff2010', 'police');
    return { door: [0, D / 2] };
  },
};

// Hobo camp under the overpass (open location).
export function hoboCamp(C, x, z) {
  const r = C.rng;
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + r(); P.tent(C, x + Math.cos(a) * 7, z + Math.sin(a) * 4, a + Math.PI / 2); }
  P.fireBarrel(C, x, z);
  P.fireBarrel(C, x + 9, z + 1);
  for (let i = 0; i < 3; i++) P.shoppingCart(C, x - 4 + i * 3, z + 5, r() * 6);
  for (let i = 0; i < 3; i++) P.mattress(C, x + (r() - 0.5) * 14, z + (r() - 0.5) * 6, r() * 6);
  P.trashPile(C, x - 8, z - 2, 6);
  P.litter(C, x, z, 8, 18);
  P.tires(C, x + 6, z - 3, 3);
  const g = C.geo;
  g.frame(x, z - 6, 0); P.graffitiAt(C, 4, 1);
}
