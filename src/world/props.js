import { mulCol } from './geo.js';
import { doorUV, adUV, signUV, graffitiUV } from './textures.js';

// Prop prefabs. Each takes the build context C ({ geo, rng, solid(), light(), emit() })
// plus a world position/rotation, and appends merged geometry.

export const CAR_COLORS = ['#5a1c16', '#2a3a4a', '#4a4a3a', '#6a5a2a', '#1e2a22', '#3a2a3a', '#7a7468', '#222222', '#5a3418', '#26303a', '#6b2a1a', '#3e4a2c'];
const PI = Math.PI;

// ---------------------------------------------------------------- street furniture
export function streetlight(C, x, z, rot, { flicker = false, color = '#ffb25a', arm = 2.6, h = 7.4, double = false } = {}) {
  const g = C.geo;
  g.frame(x, z, rot);
  g.cyl('metal', 0, 0.3, 0, 0.22, 0.26, 0.6, 6, { color: '#2a2a28' });
  g.cyl('metal', 0, h / 2, 0, 0.09, 0.13, h, 5, { color: '#3a3a36', capTop: false });
  const arms = double ? [1, -1] : [1];
  for (const s of arms) {
    g.box('metal', 0, h - 0.1, s * arm / 2, 0.12, 0.12, arm, { color: '#3a3a36' });
    g.box('metal', 0, h - 0.2, s * arm, 0.5, 0.22, 1.0, { color: '#2a2a28' });
    g.box(flicker ? 'lamp_flk' : 'lamp', 0, h - 0.34, s * arm, 0.36, 0.06, 0.8, { color, faces: 'u' });
    // light pool + cone
    const lx = x + Math.sin(rot) * s * arm, lz = z + Math.cos(rot) * s * arm;
    g.push(); g.identity();
    g.plane('glow', lx - 7, lz - 7, lx + 7, lz + 7, 0.09, { color });
    g.cyl('beam', lx, (h - 0.4) / 2, lz, 0.3, 3.4, h - 0.4, 10, { color, capTop: false, uvScale: h - 0.4 });
    g.pop();
    C.light(lx, h - 0.6, lz, color, flicker ? 'flicker' : 'street');
  }
  C.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, h);
}

export function woodPole(C, x, z, rot, { lamp = false, h = 9 } = {}) {
  const g = C.geo;
  g.frame(x, z, rot);
  g.cyl('wood', 0, h / 2, 0, 0.14, 0.18, h, 6, { color: '#6a5a48', uvScale: 2 });
  g.box('wood', 0, h - 0.6, 0, 0.12, 0.16, 2.6, { color: '#5a4a38' });
  for (const s of [-1.1, 0, 1.1]) g.cyl('props', 0, h - 0.35, s, 0.05, 0.06, 0.3, 4, { color: '#4a5a4a' });
  if (C.rng() < 0.4) g.cyl('metal', 0.35, h - 1.6, 0, 0.3, 0.3, 0.9, 6, { color: '#555850' }); // transformer
  if (lamp) {
    g.box('metal', 0, h - 2, 0.9, 0.08, 0.08, 1.8, { color: '#333' });
    g.box('lamp', 0, h - 2.15, 1.8, 0.3, 0.12, 0.5, { color: '#ffb060' });
    const lx = x + Math.sin(rot) * 1.8, lz = z + Math.cos(rot) * 1.8;
    g.push(); g.identity(); g.plane('glow', lx - 6, lz - 6, lx + 6, lz + 6, 0.09, { color: '#ffa850' }); g.pop();
    C.light(lx, h - 2.3, lz, '#ffa850', 'street');
  }
  C.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, h);
  // attach points for wires (world)
  const c = Math.cos(rot), s = Math.sin(rot);
  return [-1.1, 0, 1.1].map((o) => [x + o * s, h - 0.25, z + o * c]);
}

// Sagging wire between two world points.
export function wire(C, a, b, sag = 1.2) {
  const g = C.geo; g.identity();
  const n = 6;
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * sag, a[2] + (b[2] - a[2]) * t];
    g.line('lines', prev, p);
    prev = p;
  }
}

export function hydrant(C, x, z) {
  const g = C.geo; g.frame(x, z, C.rng() * 6);
  const col = C.rng() < 0.7 ? '#8a2a1a' : '#a08a2a';
  g.cyl('props', 0, 0.4, 0, 0.17, 0.2, 0.8, 7, { color: col });
  g.sphere('props', 0, 0.8, 0, 0.18, 7, 3, { half: true, color: col });
  g.box('props', 0, 0.55, 0, 0.55, 0.12, 0.12, { color: col });
  C.solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 1);
}

export function trashPile(C, x, z, n = 4) {
  const g = C.geo;
  for (let i = 0; i < n; i++) {
    g.frame(x + (C.rng() - 0.5) * 1.6, z + (C.rng() - 0.5) * 1.2, C.rng() * 6);
    const s = 0.35 + C.rng() * 0.25;
    const col = C.rng() < 0.75 ? '#1a1a1c' : C.rng() < 0.5 ? '#3a3a2a' : '#4a3a20';
    g.sphere('props_d', 0, s * 0.8, 0, s, 5, 3, { color: col, sy: 0.8 });
    g.box('props_d', 0, s * 1.55, 0, 0.08, 0.15, 0.08, { color: col });
  }
  for (let i = 0; i < 4; i++) { g.frame(x + (C.rng() - 0.5) * 3, z + (C.rng() - 0.5) * 3, C.rng() * 6); g.box('props_d', 0, 0.02, 0, 0.3, 0.02, 0.22, { color: C.rng() < 0.5 ? '#c8c0a8' : '#8a7a5a' }); }
}

export function litter(C, x, z, r = 3, n = 6) {
  const g = C.geo;
  for (let i = 0; i < n; i++) {
    g.frame(x + (C.rng() - 0.5) * r * 2, z + (C.rng() - 0.5) * r * 2, C.rng() * 6);
    const k = C.rng();
    if (k < 0.4) g.box('props_d', 0, 0.015, 0, 0.25 + C.rng() * 0.2, 0.02, 0.2, { color: ['#d8d0b8', '#a89878', '#c04030', '#3a6a9a'][(C.rng() * 4) | 0] });
    else if (k < 0.7) { g.rotZ(PI / 2); g.cyl('metal_d', 0.05, 0, 0, 0.04, 0.04, 0.14, 5, { color: ['#a03020', '#c0c0b8', '#305a90', '#2a7a3a'][(C.rng() * 4) | 0] }); }
    else g.box('props_d', 0, 0.05, 0, 0.3, 0.1, 0.25, { color: '#7a6a4a' });
  }
}

export function dumpster(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  const col = C.rng() < 0.6 ? '#2a3a2a' : C.rng() < 0.5 ? '#3a3a4a' : '#5a3a1a';
  g.box('metal', 0, 0.8, 0, 2.2, 1.3, 1.4, { color: col, uvScale: 1.5 });
  g.box('metal', 0, 1.5, -0.05, 2.3, 0.08, 1.5, { color: mulCol(col, 0.7) });
  if (C.rng() < 0.5) { g.push(); g.translate(0, 1.5, 0.7); g.rotX(-0.9); g.box('metal', 0, 0, 0.0, 2.3, 0.06, 1.0, { color: mulCol(col, 0.7) }); g.pop(); }
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.cyl('metal', s * 0.9, 0.08, t * 0.5, 0.08, 0.08, 0.16, 5, { color: '#111' });
  C.obb(x, z, rot, 2.3, 1.5, 1.6);
  if (C.rng() < 0.7) trashPile(C, x + Math.sin(rot) * 1.3, z + Math.cos(rot) * 1.3, 3);
}

export function bench(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('wood', 0, 0.45, 0, 1.8, 0.06, 0.45, { color: '#5a4a38' });
  g.box('wood', 0, 0.75, -0.22, 1.8, 0.4, 0.05, { color: '#5a4a38' });
  for (const s of [-0.8, 0.8]) g.box('metal', s, 0.22, 0, 0.06, 0.45, 0.4, { color: '#222' });
  C.obb(x, z, rot, 1.8, 0.5, 0.8);
  C.seats?.push({ x, z, facing: rot, kind: 'bench', width: 1.8 });
}

export function phoneBooth(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('metal', 0, 1.15, 0, 0.95, 2.3, 0.95, { color: '#3a4a52' });
  g.box('glassdark', 0, 1.25, 0.48, 0.75, 1.5, 0.02, { color: '#404850' });
  g.box('lamp', 0, 2.25, 0.48, 0.7, 0.15, 0.02, { color: '#d0e0ff' });
  C.obb(x, z, rot, 1, 1, 2.3);
}

export function newsBoxes(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  const cols = ['#8a2a1a', '#2a4a8a', '#c0a020', '#2a6a3a'];
  for (let i = 0; i < 2 + (C.rng() * 2 | 0); i++) {
    g.box('metal_d', i * 0.55 - 0.5, 0.5, 0, 0.5, 1.0, 0.45, { color: cols[(C.rng() * 4) | 0] });
  }
  C.obb(x, z, rot, 1.6, 0.5, 1);
}

export function busStop(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('metal', 0, 2.5, 0, 3.6, 0.1, 1.5, { color: '#2a2a2a' });
  for (const s of [-1.7, 1.7]) g.box('metal', s, 1.25, -0.6, 0.08, 2.5, 0.08, { color: '#2a2a2a' });
  g.box('glassdark', 0, 1.3, -0.7, 3.4, 2.0, 0.04, { color: '#606a70' });
  const ad = (C.rng() * 8) | 0; const uv = adUV(ad);
  g.push(); g.translate(1.75, 1.3, 0); g.rotY(PI / 2); g.wall('ads', -0.7, -0.8, 0.7, 0.8, 0.03, { uvRect: [uv[0] + 0.12, uv[1], uv[2] - 0.12, uv[3]], double: true }); g.pop();
  g.box('wood', 0, 0.45, -0.45, 2.6, 0.06, 0.4, { color: '#4a3a2a' });
  C.obb(x, z - 0, rot, 3.6, 0.3, 2.5);
  C.seats?.push({ x: x - Math.sin(rot) * 0.45, z: z - Math.cos(rot) * 0.45, facing: rot, kind: 'busstop', width: 2.6 });
}

// Ground layer heights (m): ground 0 < lot paving 0.035 < sidewalk 0.03/curb <
// road 0.05 < intersection 0.056 < decals 0.066 < markings 0.07 < puddles 0.075.
export const Y = { walk: 0.03, road: 0.05, patch: 0.056, decal: 0.066, mark: 0.07, puddle: 0.075 };

export function manhole(C, x, z, steam = false, y = Y.decal) {
  const g = C.geo; g.frame(x, z, 0);
  g.disc('decal_dark', 0, y, 0, 0.6, 10, { color: '#2a2622' });
  if (steam) C.emit(x, 0.1, z, 'steam');
}

export function puddle(C, x, z, r = 1.5, rot = 0, y = Y.puddle) {
  const g = C.geo; g.frame(x, z, rot);
  g.disc('puddle', 0, y, 0, r, 10);
  g.disc('puddle', r * 0.7, y + 0.002, r * 0.3, r * 0.6, 8);
}

export function deadTree(C, x, z, s = 1, { solid = true, y = 0 } = {}) {
  const g = C.geo;
  const rot = C.rng() * 6;
  g.frame(x, z, rot, y);
  const col = '#2e2620';
  const h = (4 + C.rng() * 3) * s;
  g.cyl('props', 0, h / 2, 0, 0.12 * s, 0.28 * s, h, 6, { color: col });
  const branch = (lvl, len, r) => {
    if (lvl > 1) return;
    const n = 2 + (C.rng() * 2 | 0);
    for (let i = 0; i < n; i++) {
      g.push();
      g.rotY(C.rng() * 6.28); g.rotZ(0.5 + C.rng() * 0.6);
      g.cyl('props', 0, len / 2, 0, r * 0.5, r, len, 3, { color: col, capTop: false });
      g.translate(0, len * (0.7 + C.rng() * 0.3), 0);
      branch(lvl + 1, len * 0.6, r * 0.55);
      g.pop();
    }
  };
  g.push(); g.translate(0, h * 0.75, 0); branch(0, 2.2 * s, 0.12 * s); g.pop();
  g.push(); g.translate(0, h * 0.5, 0); g.rotY(2); g.rotZ(0.9); g.cyl('props', 0, 0.9 * s, 0, 0.05, 0.1, 1.8 * s, 4, { color: col }); g.pop();
  if (solid) C.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, h);
}

export function hedge(C, x, z, w, d, h = 1.6, rot = 0) {
  const g = C.geo; g.frame(x, z, rot);
  const col = C.rng() < 0.5 ? '#3a3a22' : '#2e321e';
  g.box('props', 0, h / 2, 0, w, h, d, { color: col, uvScale: 1.2 });
  for (let i = 0; i < w / 1.5; i++) g.sphere('props', -w / 2 + 0.75 + i * 1.5, h, (C.rng() - 0.5) * d * 0.3, 0.55, 5, 3, { color: mulCol(col, 0.8 + C.rng() * 0.4), half: true });
  C.obb(x, z, rot, w, d, h);
}

export function fireBarrel(C, x, z) {
  const g = C.geo; g.frame(x, z, C.rng() * 6);
  g.cyl('rust', 0, 0.5, 0, 0.32, 0.32, 1.0, 8, { color: '#8a6a5a', capTop: false, uvScale: 1 });
  g.cyl('props', 0, 0.95, 0, 0.29, 0.29, 0.02, 8, { color: '#110a06' });
  for (let i = 0; i < 3; i++) { g.push(); g.rotY(i * PI / 3); g.wall('flame', -0.35, 0.92, 0.35, 2.0, 0, {}); g.pop(); }
  C.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 1);
  C.light(x, 1.6, z, '#ff7a2a', 'fire');
  C.emit(x, 1.8, z, 'smoke');
}

export function graffiti(C, x, y, z, rot, size = 3) {
  const g = C.geo; g.frame(x, z, rot);
  const uv = graffitiUV((C.rng() * 16) | 0);
  g.wall('graffiti', -size / 2, y, size / 2, y + size, 0.06, { uvRect: uv });
}

// Graffiti tag on the current transform's +Z facing plane.
export function graffitiAt(C, size = 3, y = 0.4, z = 0.05) {
  const uv = graffitiUV((C.rng() * 16) | 0);
  C.geo.wall('graffiti', -size / 2, y, size / 2, y + size, z, { uvRect: uv });
}

// ---------------------------------------------------------------- vehicles (static wrecks)
export function wreck(C, x, z, rot, { burnt = false, blocks = false, color = null } = {}) {
  const g = C.geo; g.frame(x, z, rot);
  const col = burnt ? '#1a1612' : (color ?? CAR_COLORS[(C.rng() * CAR_COLORS.length) | 0]);
  const lift = blocks ? 0.35 : 0;
  const tilt = (C.rng() - 0.5) * 0.06;
  g.push(); g.translate(0, lift, 0); g.rotZ(tilt);
  g.box('metal', 0, 0.62, 0, 1.85, 0.62, 4.3, { color: col, uvScale: 1.5 });
  g.box('metal', 0, 0.75, 1.75, 1.8, 0.35, 0.7, { color: mulCol(col, 0.9) });
  g.box('metal', 0, 1.22, -0.25, 1.65, 0.58, 2.2, { color: col });
  g.box('glassdark', 0, 1.22, 0.86, 1.5, 0.48, 0.05, { color: burnt ? '#050505' : '#55606a' });
  g.box('glassdark', 0, 1.22, -1.36, 1.5, 0.44, 0.05, { color: '#3a444a' });
  for (const s of [-1, 1]) g.box('glassdark', s * 0.83, 1.22, -0.25, 0.04, 0.42, 1.9, { color: '#3a444a' });
  g.box('lamp', 0.6, 0.72, 2.16, 0.35, 0.14, 0.02, { color: burnt ? '#000' : '#30302a', faces: 'f' });
  g.box('lamp', -0.6, 0.72, 2.16, 0.35, 0.14, 0.02, { color: burnt ? '#000' : '#30302a', faces: 'f' });
  g.pop();
  for (const s of [-1, 1]) for (const t of [-1.35, 1.35]) {
    if (blocks) { g.box('props', s * 0.75, 0.2, t, 0.4, 0.4, 0.5, { color: '#6a665e' }); continue; }
    g.push(); g.translate(s * 0.86, 0.36, t); g.rotZ(PI / 2); g.cyl('props', 0, 0, 0, 0.36, 0.36, 0.26, 8, { color: '#121212', capBottom: true }); g.pop();
  }
  C.obb(x, z, rot, 1.95, 4.4, 1.6);
}

// ---------------------------------------------------------------- industrial / junk
export function container(C, x, y, z, rot, color, { solid = true } = {}) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('container', 0, y + 1.3, 0, 2.44, 2.6, 12.2, { color, uvScale: 2.6 });
  g.box('metal', 0, y + 1.3, 6.11, 2.3, 2.45, 0.04, { color: mulCol(color, 0.8), faces: 'f' });
  if (solid) C.obb(x, z, rot, 2.5, 12.3, y + 2.6);
}

// A tidy cluster of drums (fixed slots, so they never intersect each other).
const DRUM_SLOTS = [[0, 0], [0.64, 0], [0.32, 0.56], [-0.32, 0.56], [-0.64, 0], [0, -0.64]];
export function oilDrums(C, x, z, n = 3) {
  const g = C.geo;
  const col = ['#3a5a3a', '#7a3a1a', '#2a3a5a', '#6a6a6a', '#8a7a2a'][(C.rng() * 5) | 0];
  const rot = C.rng() * 6, cs = Math.cos(rot), sn = Math.sin(rot);
  n = Math.min(n, DRUM_SLOTS.length);
  for (let i = 0; i < n; i++) {
    const [a, b] = DRUM_SLOTS[i];
    g.frame(x + a * cs + b * sn, z - a * sn + b * cs, 0);
    g.cyl('rust', 0, 0.45, 0, 0.3, 0.3, 0.9, 8, { color: i % 3 === 2 ? '#6a6a6a' : col });
  }
  C.solid(x - 1, z - 1, x + 1, z + 1, 1);
}

export function pallets(C, x, z, rot, n = 3) {
  const g = C.geo; g.frame(x, z, rot);
  for (let i = 0; i < n; i++) g.box('wood', (C.rng() - 0.5) * 0.2, 0.08 + i * 0.16, (C.rng() - 0.5) * 0.2, 1.2, 0.14, 1.0, { color: '#8a7a5a' });
  if (C.rng() < 0.5) g.box('props', 0, 0.16 * n + 0.4, 0, 1.0, 0.8, 0.9, { color: '#7a6a4a' });
  C.obb(x, z, rot, 1.3, 1.1, 1);
}

export function tires(C, x, z, n = 4) {
  const g = C.geo;
  for (let i = 0; i < n; i++) {
    g.frame(x + (C.rng() - 0.5) * 0.4, z + (C.rng() - 0.5) * 0.4, C.rng() * 6);
    g.cyl('props_d', 0, 0.13 + i * 0.25, 0, 0.42, 0.42, 0.24, 8, { color: '#141414' });
    g.cyl('props_d', 0, 0.26 + i * 0.25, 0, 0.2, 0.2, 0.01, 8, { color: '#050505' });
  }
}

export function junkPile(C, x, z, s = 1) {
  const g = C.geo;
  for (let i = 0; i < 9; i++) {
    g.frame(x + (C.rng() - 0.5) * 4 * s, z + (C.rng() - 0.5) * 4 * s, C.rng() * 6);
    g.rotX((C.rng() - 0.5) * 0.8); g.rotZ((C.rng() - 0.5) * 0.8);
    const k = C.rng();
    const col = ['#5a4a3a', '#6a3a2a', '#4a4a4a', '#3a4a5a', '#7a6a4a'][(C.rng() * 5) | 0];
    if (k < 0.4) g.box('rust', 0, 0.4, 0, 0.6 + C.rng() * 1.6, 0.3 + C.rng() * 0.8, 0.6 + C.rng() * 1.4, { color: col });
    else if (k < 0.6) g.cyl('rust', 0, 0.4, 0, 0.3, 0.3, 1.2, 6, { color: col });
    else if (k < 0.8) g.box('wood', 0, 0.2, 0, 2.2, 0.1, 0.3, { color: '#6a5a40' });
    else g.box('metal', 0, 0.3, 0, 1.4, 0.6, 0.8, { color: '#d8d0c0' }); // dead fridge
  }
  C.solid(x - 2 * s, z - 2 * s, x + 2 * s, z + 2 * s, 1.5);
}

export function shoppingCart(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot); if (C.rng() < 0.3) { g.translate(0, 0.35, 0); g.rotZ(PI / 2); }
  g.box('chain_d', 0, 0.75, 0, 0.6, 0.5, 0.9, { color: '#c0c0c0', faces: 'all', uvScale: 0.5 });
  for (const s of [-0.25, 0.25]) for (const t of [-0.4, 0.4]) g.box('metal_d', s, 0.25, t, 0.03, 0.5, 0.03, { color: '#888' });
}

export function mattress(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('props_d', 0, 0.11, 0, 1.4, 0.22, 1.9, { color: ['#a8987a', '#9a8a8a', '#8a8060'][(C.rng() * 3) | 0] });
}

export function cactus(C, x, z, s = 1) {
  const g = C.geo; g.frame(x, z, C.rng() * 6);
  const col = C.rng() < 0.5 ? '#4a5a2e' : '#5a5a34';
  const h = (2 + C.rng() * 2.5) * s;
  g.cyl('props', 0, h / 2, 0, 0.26 * s, 0.32 * s, h, 7, { color: col });
  g.sphere('props', 0, h, 0, 0.26 * s, 7, 3, { half: true, color: col });
  for (const sd of [-1, 1]) {
    if (C.rng() < 0.3) continue;
    const ah = h * (0.35 + C.rng() * 0.25), al = 0.7 * s;
    g.box('props', sd * al / 2, ah, 0, al, 0.38 * s, 0.38 * s, { color: col });
    const up = (0.8 + C.rng()) * s;
    g.cyl('props', sd * al, ah + up / 2, 0, 0.19 * s, 0.19 * s, up, 6, { color: col });
  }
  C.solid(x - 0.35 * s, z - 0.35 * s, x + 0.35 * s, z + 0.35 * s, h);
}

export function rock(C, x, z, s = 1) {
  const g = C.geo; g.frame(x, z, C.rng() * 6);
  g.rotX((C.rng() - 0.5) * 0.4);
  g.sphere('props', 0, 0, 0, s, 6, 4, { color: C.rng() < 0.5 ? '#7a6a52' : '#6a5a48', sy: 0.6 + C.rng() * 0.4 });
  if (s > 0.8) C.solid(x - s * 0.8, z - s * 0.8, x + s * 0.8, z + s * 0.8, s);
}

export function sandbags(C, x, z, rot, w = 4) {
  const g = C.geo; g.frame(x, z, rot);
  for (let r = 0; r < 3; r++) for (let i = 0; i < w / 0.7; i++) g.box('props', -w / 2 + 0.35 + i * 0.7 + (r % 2) * 0.35, 0.15 + r * 0.28, 0, 0.66, 0.28, 0.45, { color: '#7a6a4a' });
  C.obb(x, z, rot, w + 0.4, 0.6, 0.9);
}

export function jersey(C, x, z, rot, len = 3) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('props', 0, 0.2, 0, 0.6, 0.4, len, { color: '#8a867c' });
  g.box('props', 0, 0.6, 0, 0.3, 0.5, len, { color: '#8a867c' });
  if (C.rng() < 0.5) g.box('props', 0, 0.62, 0, 0.32, 0.12, len * 0.9, { color: '#a08a2a' });
  C.obb(x, z, rot, 0.6, len, 0.9);
}

export function cone(C, x, z) {
  const g = C.geo; g.frame(x, z, 0);
  g.cyl('props_d', 0, 0.35, 0, 0.03, 0.2, 0.7, 6, { color: '#c05a1a' });
  g.box('props_d', 0, 0.02, 0, 0.45, 0.04, 0.45, { color: '#c05a1a' });
}

export function tent(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  const col = ['#3a4a3a', '#5a3a2a', '#3a3a5a', '#6a5a3a'][(C.rng() * 4) | 0];
  g.gable('props', 0, 0, 0, 2.4, 1.3, 2.0, { color: col, uvScale: 1 });
  g.wall('props', -1.2, 0, 1.2, 0.02, 1.0, {});
  C.obb(x, z, rot, 2.6, 2.2, 1.3);
}

// ---------------------------------------------------------------- big structures
export function billboard(C, x, z, rot, { h = 9, w = 13, ad = null, lit = true } = {}) {
  const g = C.geo; g.frame(x, z, rot);
  const bh = w * 0.31;
  for (const s of [-w * 0.3, w * 0.3]) {
    g.box('metal', s, h / 2, -0.3, 0.35, h, 0.35, { color: '#3a3632' });
    g.box('metal', s, h * 0.45, -0.6, 0.12, h * 0.9, 0.12, { color: '#2a2622' });
  }
  g.box('metal', 0, h + bh / 2, -0.15, w + 0.5, bh + 0.5, 0.25, { color: '#2a2622' });
  const uv = adUV(ad ?? ((C.rng() * 8) | 0));
  g.wall('ads', -w / 2, h, w / 2, h + bh, 0.0, { uvRect: uv });
  g.box('metal', 0, h - 0.3, 0.9, w, 0.08, 1.2, { color: '#222' }); // catwalk
  if (lit) for (const s of [-w * 0.33, 0, w * 0.33]) {
    g.box('metal', s, h - 0.2, 1.4, 0.08, 0.08, 1.2, { color: '#222' });
    g.box('lamp', s, h - 0.1, 2.0, 0.4, 0.2, 0.3, { color: '#fff0d0' });
  }
  C.obb(x, z, rot, w * 0.65, 1.2, h);
}

export function rooftopTank(C, x, y, z) {
  const g = C.geo; g.frame(x, z, 0);
  for (const s of [-0.9, 0.9]) for (const t of [-0.9, 0.9]) g.box('wood', s, y + 1.2, t, 0.2, 2.4, 0.2, { color: '#4a3a2a' });
  g.cyl('wood', 0, y + 3.6, 0, 1.6, 1.6, 2.6, 10, { color: '#5a4630', uvScale: 2 });
  g.cyl('props', 0, y + 5.3, 0, 0.1, 1.7, 0.8, 10, { color: '#3a3430' });
}

export function acUnit(C, x, y, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  g.box('metal_d', 0, y + 0.6, 0, 1.6, 1.2, 1.2, { color: '#8a8a82' });
  g.cyl('props_d', 0, y + 1.22, 0, 0.45, 0.45, 0.04, 8, { color: '#222' });
}

export function antenna(C, x, y, z, h = 8, beacon = true) {
  const g = C.geo; g.frame(x, z, 0);
  g.cyl('metal', 0, y + h / 2, 0, 0.05, 0.15, h, 4, { color: '#4a4a4a' });
  for (let i = 1; i < 4; i++) g.box('metal', 0, y + h * i / 4, 0, 1.4 - i * 0.3, 0.05, 0.05, { color: '#4a4a4a' });
  if (beacon) g.sphere('beacon', 0, y + h + 0.1, 0, 0.22, 6, 4, { color: '#fff' });
}

export function tank(C, x, z, r, h, color = '#6a5a4c') {
  const g = C.geo; g.frame(x, z, 0);
  g.cyl('rust', 0, h / 2, 0, r, r, h, 16, { color, uvScale: 4 });
  g.cyl('rust', 0, h + 0.6, 0, r * 0.2, r, 1.2, 16, { color });
  // spiral-ish ladder
  for (let i = 0; i < h; i += 1.5) { g.push(); g.rotY(i * 0.25); g.box('metal', 0, i + 0.75, r + 0.3, 0.9, 0.06, 0.6, { color: '#3a3a3a' }); g.pop(); }
  C.solid(x - r, z - r, x + r, z + r, h);
}

export function smokestack(C, x, z, r, h) {
  const g = C.geo; g.frame(x, z, 0);
  g.cyl('w_industrial', 0, h / 2, 0, r * 0.75, r, h, 12, { uvScale: 12 });
  for (let i = 1; i < 4; i++) g.cyl('props', 0, h - i * 3, 0, r * 0.8, r * 0.8, 0.6, 12, { color: i === 1 ? '#8a1a1a' : '#d8d0c0' });
  g.sphere('beacon', 0, h + 0.3, 0, 0.35, 6, 3, {});
  C.solid(x - r, z - r, x + r, z + r, h);
  C.emit(x, h + 1, z, 'stack');
}

export function crane(C, x, z, rot) {
  const g = C.geo; g.frame(x, z, rot);
  const col = '#a05a1a', H = 32;
  // four legs straddling (along local x 14m, z 10m)
  for (const s of [-7, 7]) for (const t of [-5, 5]) g.box('metal', s, H / 2, t, 1, H, 1, { color: col });
  for (const s of [-7, 7]) g.box('metal', s, H, 0, 1.2, 1.2, 11, { color: col });
  g.box('metal', 0, H + 1, 0, 16, 1.6, 1.6, { color: col });
  // boom out over water (+x local)
  g.box('metal', 18, H + 2.2, 0, 50, 1.4, 2.4, { color: col });
  g.box('metal', -10, H + 2.2, 0, 10, 1.4, 2.4, { color: col });
  g.box('metal', -12, H + 0.5, 0, 4, 3, 4, { color: '#4a4a4a' }); // counterweight
  g.box('metal', 4, H + 5, 0, 6, 5, 3.5, { color: '#7a4a1a' }); // cab
  g.box('glassdark', 7.05, H + 5.5, 0, 0.1, 2, 3, { color: '#6a7a80' });
  for (const s of [-6, 6]) for (const t of [-5, 5]) {
    g.push(); g.translate(s, H / 2, t); g.rotZ(Math.sign(s) * 0.4); g.box('metal', 0, 0, 0, 0.4, H * 0.95, 0.4, { color: col }); g.pop();
  }
  g.box('metal', 30, H - 6, 0, 0.1, 16, 0.1, { color: '#222' }); // cable
  g.box('metal', 30, H - 14, 0, 2.6, 0.6, 1.2, { color: '#3a3a3a' }); // spreader
  g.sphere('beacon', 43, H + 3.2, 0, 0.35, 6, 3, {});
  for (const s of [-7, 7]) for (const t of [-5, 5]) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const wx = x + s * c + t * sn, wz = z - s * sn + t * c;
    C.solid(wx - 0.7, wz - 0.7, wx + 0.7, wz + 0.7, H);
  }
}

// Fence run between two world points (axis aligned or not). Adds physics per segment.
export function chainFence(C, x0, z0, x1, z1, { h = 2.6, razor = false, gap = null, solid = true, mat = 'chain' } = {}) {
  const g = C.geo;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const rot = Math.atan2(dx, dz);
  g.frame(x0, z0, rot);
  const n = Math.max(1, Math.round(L / 3));
  for (let i = 0; i <= n; i++) g.cyl('metal', 0, h / 2, (i / n) * L, 0.05, 0.05, h, 3, { color: '#6a6a66', capTop: false });
  g.push(); g.rotY(-PI / 2);
  g.quad(mat, [0, 0, 0], [L, 0, 0], [L, h, 0], [0, h, 0], [0, 0, L / 2, 0, L / 2, h / 2, 0, h / 2], '#b0b0a8');
  g.pop();
  if (razor) for (let i = 0; i < L - 0.5; i += 1.5) { g.push(); g.translate(0, h + 0.15, i + 0.75); g.rotX(Math.sin(i) * 0.3); g.box('metal_d', 0, 0, 0, 0.35, 0.05, 1.5, { color: '#888', faces: 'fblrt' }); g.pop(); }
  if (solid) {
    // thin AABB pieces along the line
    const steps = Math.max(1, Math.ceil(L / 4));
    for (let i = 0; i < steps; i++) {
      const ax = x0 + dx * i / steps, az = z0 + dz * i / steps, bx = x0 + dx * (i + 1) / steps, bz = z0 + dz * (i + 1) / steps;
      C.solid(Math.min(ax, bx) - 0.12, Math.min(az, bz) - 0.12, Math.max(ax, bx) + 0.12, Math.max(az, bz) + 0.12, h);
    }
  }
}

// Masonry wall between two points.
export function wallRun(C, x0, z0, x1, z1, { h = 2.2, t = 0.5, mat = 'w_stone', color = '#ffffff', cap = '#8a8274', solid = true } = {}) {
  const g = C.geo;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.3) return;
  const rot = Math.atan2(dx, dz);
  g.frame(x0, z0, rot);
  g.box(mat, 0, h / 2, L / 2, t, h, L, { color, uvScale: [12, 14], uvOff: [C.rng(), 0.3] });
  g.box('props', 0, h + 0.08, L / 2, t + 0.14, 0.16, L + 0.1, { color: cap });
  if (solid) C.solid(Math.min(x0, x1) - t / 2, Math.min(z0, z1) - t / 2, Math.max(x0, x1) + t / 2, Math.max(z0, z1) + t / 2, h);
}

// A door with frame, lit doorway and overhead lamp. Local frame: facade plane at z=0 facing +Z.
export function doorway(C, cx, w = 1.6, h = 2.6, door = 0, { lamp = true, lampColor = '#ffc070', awning = null, steps = false } = {}) {
  const g = C.geo;
  g.box('props', cx, h / 2 + 0.1, 0.06, w + 0.5, h + 0.4, 0.12, { color: '#2a2622', faces: 'fblrt' });
  g.wall('doors', cx - w / 2, 0.05, cx + w / 2, h, 0.14, { uvRect: doorUV(door) });
  if (lamp) {
    g.box('metal', cx, h + 0.55, 0.3, 0.5, 0.18, 0.4, { color: '#222' });
    g.box('lamp', cx, h + 0.45, 0.3, 0.36, 0.04, 0.3, { color: lampColor, faces: 'u' });
  }
  if (awning) {
    g.push(); g.translate(cx, h + 0.9, 0.12); g.rotX(0.35);
    g.box('props', 0, 0, 0.8, w + 1.6, 0.06, 1.7, { color: awning });
    g.pop();
  }
  if (steps) for (let i = 0; i < 2; i++) g.box('props', cx, 0.06 + i * 0.0, 0.4 + i * 0.4, w + 1, 0.12, 0.4, { color: '#6a665e' });
}

// Flat shop sign mounted on a wall (local frame: wall plane at z, facing +Z).
export function shopSign(C, x, y, z, w = 3.6, idx = null) {
  const g = C.geo;
  const i = idx ?? ((C.rng() * 32) | 0);
  const h = Math.min(0.85, w / 4);
  g.box('metal', x, y, z + 0.09, w + 0.16, h + 0.16, 0.14, { color: '#1a1814', faces: 'fblrtu' });
  g.wall('signs', x - w / 2, y - h / 2, x + w / 2, y + h / 2, z + 0.175, { uvRect: signUV(i) });
}

export function trashCan(C, x, z) {
  const g = C.geo; g.frame(x, z, 0);
  g.cyl('metal', 0, 0.46, 0, 0.3, 0.27, 0.92, 8, { color: '#2e3a30' });
  g.cyl('metal', 0, 0.95, 0, 0.33, 0.33, 0.06, 8, { color: '#1e2620' });
  C.solid(x - 0.32, z - 0.32, x + 0.32, z + 0.32, 1);
}
