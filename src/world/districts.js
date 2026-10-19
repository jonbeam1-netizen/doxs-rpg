import * as THREE from 'three';
import { districtAt, WATER_X, BOUND, HALF, pointSegDist } from './layout.js';
import { lin, mulCol } from './geo.js';
import { fbm } from './roads.js';
import * as P from './props.js';
import { locSign } from './landmarks.js';
import { hoboCamp } from './landmarks.js';
import { BRIDGE } from './island-layout.js';

const PI = Math.PI;

// ----------------------------------------------------------------- Gutterside overpass ("Bridge to Nowhere")
export function buildOverpass(C) {
  const g = C.geo;
  const z = 440, W = 24, y = 9, x0 = -420, x1 = 420;
  g.identity();
  // deck in pieces so each lands in its own chunk
  for (let x = x0; x < x1; x += 60) {
    const xe = Math.min(x1, x + 60), cx = (x + xe) / 2, L = xe - x;
    g.frame(cx, z, PI / 2);
    g.box('f_concrete', 0, y + 0.8, 0, W, 1.6, L, { faces: 'all', uvScale: [12, 14], color: '#8a867c' });
    g.box('asphalt', 0, y + 1.62, 0, W - 1, 0.02, L, { faces: 't', uv: 'world', uvScale: 14, color: '#a8a49c' });
    for (const s of [-1, 1]) {
      g.box('f_concrete', s * (W / 2 - 0.3), y + 2.3, 0, 0.6, 1.2, L, { uvScale: [12, 14], color: '#9a968c' });
      for (let k = -L / 2 + 6; k < L / 2; k += 20) { g.push(); g.translate(s * (W / 2 + 0.06), y - 0.2, k); g.rotY(s * PI / 2); P.graffitiAt(C, 4, 0, 0.0); g.pop(); }
    }
    g.box('marking', 0, y + 1.66, 0, 0.2, 0.02, L, { color: '#a08a3a' });
  }
  // pillars (single row on the centerline, midblock)
  for (let x = -360; x <= 360; x += 80) {
    const px = x + 40 > 380 ? null : x + 40;
    if (px == null) continue;
    g.frame(px, z, 0);
    g.box('f_concrete', 0, y / 2, 0, 2.4, y, 2.4, { uvScale: [12, 14], color: '#8a867c' });
    g.box('f_concrete', 0, y - 0.6, 0, 3.4, 1.2, W - 4, { uvScale: [12, 14], color: '#7a766c' });
    g.push(); g.translate(0, 0, 1.25); P.graffitiAt(C, 2.2, 0.8); g.pop();
    C.solid(px - 1.3, z - 1.3, px + 1.3, z + 1.3, y);
  }
  // also pillars at the far ends
  for (const px of [-400, 400]) { g.frame(px, z, 0); g.box('f_concrete', 0, y / 2, 0, 2.4, y, 2.4, { uvScale: [12, 14], color: '#8a867c' }); C.solid(px - 1.3, z - 1.3, px + 1.3, z + 1.3, y); }
  // broken ends with rebar
  for (const s of [-1, 1]) {
    const ex = s * x1;
    g.frame(ex, z, 0);
    for (let i = 0; i < 18; i++) {
      g.push(); g.translate(s * 0.2, y + 0.3 + C.rng() * 1.2, (C.rng() - 0.5) * (W - 2)); g.rotZ(-s * (PI / 2 - 0.3 - C.rng() * 0.8)); g.rotX((C.rng() - 0.5) * 0.6);
      g.box('metal', 0, 1.2, 0, 0.06, 2.4 + C.rng() * 2, 0.06, { color: '#5a3a2a' });
      g.pop();
    }
    for (let i = 0; i < 6; i++) { const rx = ex + s * (2 + C.rng() * 8), rz = z + (C.rng() - 0.5) * 18; g.frame(rx, rz, C.rng() * 6); g.rotX((C.rng() - 0.5) * 0.5); g.box('f_concrete', 0, 0.6, 0, 3 + C.rng() * 3, 1.2 + C.rng(), 2 + C.rng() * 3, { uvScale: [12, 14], color: '#7a766c' }); C.solid(rx - 2, rz - 2, rx + 2, rz + 2, 1.6); }
  }
  // dead lamps on the deck
  for (let x = x0 + 20; x < x1; x += 50) { g.frame(x, z - W / 2 + 0.8, 0); g.cyl('metal', 0, y + 1.6 + 3, 0, 0.1, 0.14, 6, 6, { color: '#3a3a36' }); g.box('metal', 0, y + 7.6, 1.2, 0.12, 0.12, 2.4, { color: '#3a3a36' }); }
  // the hobo camp under it
  hoboCamp(C, 105, 440);
  return { x: 105, z: 433.5 };
}

// ----------------------------------------------------------------- Rustyards docks
export function buildDocks(C) {
  const g = C.geo;
  const piers = [-420, -170, 160, 410];
  const pw = 10, pend = 688;
  for (const pz of piers) {
    for (let x = WATER_X; x < pend; x += 34) {
      const xe = Math.min(pend, x + 34), cx = (x + xe) / 2;
      g.frame(cx, pz, PI / 2);
      g.box('wood', 0, -0.25, 0, pw, 0.5, xe - x, { faces: 'all', uvScale: 3, color: '#7a6a54' });
      for (let k = -(xe - x) / 2 + 1; k < (xe - x) / 2; k += 4) for (const s of [-1, 1]) g.cyl('wood', s * (pw / 2 - 0.4), -2.5, k, 0.3, 0.3, 4.5, 6, { color: '#4a3a2a' });
    }
    for (let x = WATER_X + 4; x < pend; x += 8) for (const s of [-1, 1]) { g.frame(x, pz + s * (pw / 2 - 0.5), 0); g.cyl('metal', 0, 0.35, 0, 0.25, 0.3, 0.7, 7, { color: '#2a2a2a' }); }
    P.streetlight(C, pend - 2, pz - pw / 2 + 0.6, 0, { flicker: C.rng() < 0.5, color: '#e8f0ff' });
    P.oilDrums(C, pend - 8, pz + 2, 3);
  }
  // water collision: everything east of the quay except the piers
  // (the Blackwater bridge punches one more gap at z = 0)
  const gaps = [...piers.map((p) => [p - pw / 2, p + pw / 2]), [BRIDGE.z - BRIDGE.hw, BRIDGE.z + BRIDGE.hw]].sort((a, b) => a[0] - b[0]);
  const zs = [-HALF - 20, ...gaps.flat(), HALF + 20];
  for (let i = 0; i < zs.length; i += 2) C.solid(WATER_X, zs[i], HALF + 40, zs[i + 1], 0.3, 'water');
  for (const pz of piers) {
    C.solid(pend, pz - pw / 2, HALF + 40, pz + pw / 2, 0.3, 'water');
    C.solid(WATER_X, pz - pw / 2 - 0.4, pend, pz - pw / 2, 0.3, 'water');
    C.solid(WATER_X, pz + pw / 2, pend, pz + pw / 2 + 0.4, 0.3, 'water');
  }
  // cranes on the apron and container stacks between them
  for (const cz of [-560, -300, -40, 290, 540]) P.crane(C, 605, cz, 0);
  const cols = ['#8a2a1a', '#2a4a6a', '#5a6a3a', '#a06a1a', '#3a3a3a', '#6a2a4a', '#2a6a6a', '#7a7a70', '#b0a080'];
  for (let z = -660; z < 660; z += 15) {
    if ([-560, -300, -40, 290, 540].some((c) => Math.abs(c - z) < 14)) continue;
    if (piers.some((p) => Math.abs(p - z) < 9)) continue;
    if (C.rng() < 0.3) continue;
    for (const x of [600, 603, 610, 613]) {
      if (C.rng() < 0.25) continue;
      const n = 1 + (C.rng() * 3.5 | 0);
      for (let k = 0; k < n; k++) {
        const rot = (C.rng() - 0.5) * 0.03, col = cols[(C.rng() * cols.length) | 0];
        if (Math.abs(z - BRIDGE.z) > 17) P.container(C, x, k * 2.6, z, rot, col, { solid: k === 0 }); // keep the bridge approach clear (same RNG draws)
      }
    }
  }
  // bollards + tires along the quay
  for (let z = -680; z < 680; z += 12) { if (piers.some((p) => Math.abs(p - z) < 6)) continue; if (Math.abs(z - BRIDGE.z) < BRIDGE.hw + 1) { C.rng(); continue; } g.frame(WATER_X - 1, z, 0); g.cyl('metal', 0, 0.35, 0, 0.25, 0.3, 0.7, 7, { color: '#2a2a2a' }); if (C.rng() < 0.4) { g.push(); g.translate(1.05, -0.6, 0); g.rotZ(PI / 2); g.cyl('props', 0, 0, 0, 0.6, 0.6, 0.3, 8, { color: '#111' }); g.pop(); } }
  // a rusting ship moored offshore
  g.frame(700, -260, 0);
  g.box('rust', 0, 3, 0, 22, 9, 110, { faces: 'all', uvScale: 6, color: '#5a3a2a' });
  g.box('rust', 0, 8, -40, 16, 8, 18, { uvScale: 6, color: '#d8d0c0' });
  g.box('glassdark', 0, 10, -30.9, 14, 1.5, 0.1, { color: '#606a70' });
  g.cyl('rust', 0, 15, -44, 2, 2, 6, 10, { color: '#8a2a1a' });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) P.container(C, -4 + k * 2.6 * 1.1 * (i % 2 ? 1 : 1), 7.5 + 0, -10 + i * 13, 0, cols[(i + k) % cols.length], { solid: false });
  C.emit(700, 20, -304, 'stack');
}

// ----------------------------------------------------------------- Dustbowl drag strip
export function buildDragStrip(C) {
  const g = C.geo;
  const z = 260, start = -395, finish = -660;
  // bleachers (north side)
  for (let x = -640; x < -420; x += 40) {
    g.frame(x + 20, 243, 0);
    for (let r = 0; r < 5; r++) g.box('metal', 0, 0.4 + r * 0.6, 3.5 - r * 1.1, 38, 0.2, 1.1, { color: '#7a7a72' });
    g.box('metal', 0, 1.6, -2, 38, 3.2, 0.2, { color: '#5a5a52' });
    g.box('corr', 0, 6, 0, 39, 0.15, 9, { color: '#8a8278', uvScale: 3 });
    for (const s of [-19, 0, 19]) g.box('metal', s, 3, -2.5, 0.25, 6, 0.25, { color: '#3a3a3a' });
    C.solid(x + 0.5, 238.5, x + 39.5, 247.8, 3.2);
  }
  // start arch
  for (const s of [-1, 1]) { g.frame(start, z + s * 10.8, 0); g.box('metal', 0, 4, 0, 0.8, 8, 0.8, { color: '#2a2a2a' }); C.solid(start - 0.5, z + s * 10.8 - 0.5, start + 0.5, z + s * 10.8 + 0.5, 8); }
  g.frame(start, z, PI / 2); g.box('metal', 0, 8.4, 0, 22.4, 1.0, 0.6, { color: '#2a2a2a' });
  g.frame(start, z, PI / 2);
  locSign(C, { cx: start, cz: z, rot: PI / 2, w: 0, d: 0 }, 'drag_arch', 'DUSTBOWL DRAG STRIP', { w: 16, h: 2.2, y: 10, z: 0.4, bg: '#2a1a08', fg: '#ffcc40', neon: '#ffa020', double: true, gain: 2.2, font: 'Barlow Condensed' });
  // christmas tree start lights
  g.frame(start + 3, z - 0.0, 0);
  g.box('metal', 0, 1.5, 0, 0.3, 3, 0.3, { color: '#222' });
  for (let i = 0; i < 4; i++) for (const s of [-0.35, 0.35]) g.sphere(i < 3 ? 'amber' : 'beacon', s, 2.0 + i * 0.4, 0.2, 0.14, 6, 4, {});
  C.solid(start + 2.7, z - 0.3, start + 3.3, z + 0.3, 3);
  // finish banner
  for (const s of [-1, 1]) { g.frame(finish, z + s * 10.8, 0); g.box('metal', 0, 3.5, 0, 0.5, 7, 0.5, { color: '#2a2a2a' }); C.solid(finish - 0.4, z + s * 10.8 - 0.4, finish + 0.4, z + s * 10.8 + 0.4, 7); }
  g.frame(finish, z, PI / 2); g.box('props', 0, 6.6, 0, 21.6, 1.2, 0.1, { color: '#e8e4dc' });
  for (let k = 0; k < 18; k++) g.box('props', -10.2 + k * 1.2, 6.6, 0.06, 0.6, 0.6, 0.02, { color: '#111' });
  // booth (location door) on the south side
  g.frame(start - 15, 277, PI);
  g.box('f_wood', 0, 1.7, 0, 6, 3.4, 4, { faces: 'fbrl', uvScale: [12, 14], color: '#b8a888' });
  g.box('corr', 0, 3.5, 0.4, 6.6, 0.12, 5, { color: '#8a7a6a', uvScale: 3 });
  g.box('lamp', 0, 3.4, 2.6, 2, 0.04, 0.6, { color: '#ffd080', faces: 'u' });
  g.push(); g.translate(0, 0, 2); P.doorway(C, 1.2, 1.1, 2.3, 2, { lamp: false }); g.pop();
  C.solid(start - 18.2, 275, start - 11.8, 279.2, 3.5);
  C.light(start - 15, 3.3, 274.5, '#ffd080', 'door');
  // floodlight towers
  for (let x = -420; x > -680; x -= 60) for (const s of [-1, 1]) {
    if (s < 0 && x < -400 && x > -660) continue; // bleachers
    const fz = z + s * 13;
    P.streetlight(C, x, fz, s > 0 ? PI : 0, { h: 12, arm: 2, color: '#f0f4ff' });
  }
  return { doorX: start - 15 + 1.2 * -1, doorZ: 272.5 };
}

// ----------------------------------------------------------------- city edges: fence + far hills + water
export function buildEdges(C, scene) {
  const g = C.geo;
  // boundary fence (visual; physics bounds do the blocking)
  const B = BOUND + 2;
  const runs = [[-B, -B, WATER_X, -B], [-B, B, WATER_X, B], [-B, -B, -B, B]];
  for (const [ax, az, bx, bz] of runs) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += 30) {
      const t0 = s / L, t1 = Math.min(1, (s + 30) / L);
      P.chainFence(C, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, { h: 3.6, razor: true, solid: false, mat: 'chain_d' });
    }
  }
  // Route 9 barricade at the west edge
  for (let k = -6; k <= 6; k += 3) P.jersey(C, -684, k, 0, 3);
  g.frame(-686, 0, PI / 2);
  locSign(C, { cx: -686, cz: 0, rot: PI / 2, w: 0, d: 0 }, 'route9', "ROAD CLOSED · IT'S WORSE OUT THERE", { w: 10, h: 1.8, y: 2.6, z: 0, bg: '#e8a020', fg: '#1a1a1a', double: true, gain: 0.5 });
  g.frame(-686, 0, PI / 2); for (const s of [-4.5, 4.5]) g.box('metal', s, 1.2, 0, 0.2, 2.4, 0.2, { color: '#333' });

  // far terrain ring (single mesh, softer fog so it reads as a silhouette)
  const S = 50, R = 2450;
  const pos = [], col = [], idx = [];
  const n = Math.round((2 * R) / S);
  const H = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (x > WATER_X - 10 && x < 1500) return -6;
    if (d <= 0) return 0;
    const k = Math.min(1, d / 320); const ks = k * k * (3 - 2 * k);
    const nn = fbm(x / 260, z / 260);
    let h;
    if (x >= 1500) h = 10 + nn * 70;
    else if (z < -Math.abs(x)) h = 40 + nn * 170;          // north: dark hills
    else if (x < -Math.abs(z)) h = Math.floor((20 + nn * 120) / 22) * 22; // west: mesas
    else h = 15 + nn * 60;                                  // south: landfill mounds
    return h * ks;
  };
  const C1 = (x, z, h) => {
    if (h < -1) return lin('#1a1a18');
    const dd = districtAt(Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z)));
    const base = x < -Math.abs(z) ? '#8a7454' : z < -Math.abs(x) ? '#3e3e2c' : x > WATER_X ? '#3a3632' : '#4a4236';
    const c = lin(base); const f = 0.7 + Math.min(0.6, h / 300) + fbm(x / 90, z / 90) * 0.25;
    return [c[0] * f, c[1] * f, c[2] * f];
  };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = -R + j * S, z = -R + i * S, h = H(x, z);
    pos.push(x, h, z); col.push(...C1(x, z, h));
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = -R + j * S, z0 = -R + i * S;
    const inside = x0 >= -HALF && x0 + S <= HALF && z0 >= -HALF && z0 + S <= HALF;
    if (inside && x0 + S <= WATER_X) continue;
    if (inside && x0 >= WATER_X) continue;
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, C.mats.M.terrain.mat);
  mesh.matrixAutoUpdate = false;
  mesh.name = 'terrain';
  scene.add(mesh);
  // sea bed under the water so it isn't a void
  g.identity();
}

// ----------------------------------------------------------------- open-ground scatter + billboards
export function buildScatter(C) {
  const L = C.layout, r = C.rng;
  const tries = { dustbowl: 900, hilltop: 380, gutterside: 420, rustyards: 360, downtown: 160 };
  const total = Object.values(tries).reduce((a, b) => a + b, 0);
  for (let i = 0; i < total * 2.2; i++) {
    const x = (r() * 2 - 1) * (BOUND - 6), z = (r() * 2 - 1) * (BOUND - 6);
    if (x > WATER_X - 32) continue;
    const d = districtAt(x, z);
    if (tries[d] <= 0) continue;
    if (!L.isFree(x, z, 2.2)) continue;
    tries[d]--;
    const k = r();
    switch (d) {
      case 'dustbowl':
        if (k < 0.42) P.cactus(C, x, z, 0.8 + r() * 0.7);
        else if (k < 0.75) P.rock(C, x, z, 0.4 + r() * 1.6);
        else if (k < 0.8) P.tires(C, x, z, 1 + (r() * 3 | 0));
        else if (k < 0.84) P.junkPile(C, x, z, 0.7);
        else if (k < 0.87) P.wreck(C, x, z, r() * 6, { burnt: r() < 0.5, blocks: r() < 0.5 });
        else if (k < 0.9) P.deadTree(C, x, z, 0.7);
        else P.litter(C, x, z, 2, 3);
        break;
      case 'hilltop':
        if (k < 0.55) P.deadTree(C, x, z, 0.9 + r() * 0.6);
        else if (k < 0.75) P.rock(C, x, z, 0.4 + r() * 0.8);
        else if (k < 0.85) P.hedge(C, x, z, 3 + r() * 4, 1.2, 1.2 + r() * 0.6, r() < 0.5 ? 0 : PI / 2);
        else P.litter(C, x, z, 2, 3);
        break;
      case 'gutterside':
        if (k < 0.3) P.trashPile(C, x, z, 3 + (r() * 5 | 0));
        else if (k < 0.42) P.wreck(C, x, z, r() * 6, { burnt: r() < 0.4, blocks: r() < 0.5 });
        else if (k < 0.5) P.fireBarrel(C, x, z);
        else if (k < 0.6) P.mattress(C, x, z, r() * 6);
        else if (k < 0.68) P.shoppingCart(C, x, z, r() * 6);
        else if (k < 0.76) P.tires(C, x, z, 2 + (r() * 3 | 0));
        else if (k < 0.84) P.puddle(C, x, z, 1 + r() * 2, r() * 6);
        else if (k < 0.9) P.deadTree(C, x, z, 0.8);
        else P.litter(C, x, z, 3, 8);
        break;
      case 'rustyards':
        if (k < 0.25) P.oilDrums(C, x, z, 2 + (r() * 4 | 0));
        else if (k < 0.45) P.pallets(C, x, z, r() * 6, 1 + (r() * 3 | 0));
        else if (k < 0.55) P.container(C, x, 0, z, r() < 0.5 ? 0 : PI / 2, ['#8a2a1a', '#2a4a6a', '#5a6a3a', '#a06a1a'][(r() * 4) | 0]);
        else if (k < 0.65) P.tires(C, x, z, 3);
        else if (k < 0.78) P.puddle(C, x, z, 1 + r() * 2.5, r() * 6);
        else if (k < 0.84) P.fireBarrel(C, x, z);
        else if (k < 0.9) P.junkPile(C, x, z, 0.8);
        else P.litter(C, x, z, 3, 6);
        break;
      case 'downtown':
        if (k < 0.4) P.trashPile(C, x, z, 3);
        else if (k < 0.7) P.puddle(C, x, z, 1 + r() * 1.5, r() * 6);
        else P.litter(C, x, z, 3, 6);
        break;
    }
  }
  // billboards facing the big roads
  const big = L.edgeInfo.filter((e) => ['ring', 'diag', 'main'].includes(e.kind) && e.len > 40);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 34; i++) {
    const e = big[(r() * big.length) | 0];
    const A = L.nodes[e.a];
    const s = 15 + r() * (e.len - 30), side = r() < 0.5 ? 1 : -1;
    const off = e.hw + e.sw + 4 + r() * 6;
    const x = A.x + e.dx * s - e.dz * off * side, z = A.z + e.dz * s + e.dx * off * side;
    if (!L.isFree(x, z, 5)) continue;
    const rot = Math.atan2(e.dz * side, -e.dx * side) + (r() - 0.5) * 0.6;
    P.billboard(C, x, z, rot, { h: 8 + r() * 6, w: 12 + r() * 4 });
    L.occupied.add({ x0: x - 5, z0: z - 5, x1: x + 5, z1: z + 5 });
    placed++;
  }
  // a water tower over the trailer park + a couple of smokestacks in the yards
  const wt = [-470, 170];
  if (L.isFree(wt[0], wt[1], 4)) {
    const g = C.geo; g.frame(wt[0], wt[1], 0);
    for (const sx of [-3, 3]) for (const sz of [-3, 3]) g.box('metal', sx, 9, sz, 0.4, 18, 0.4, { color: '#6a5a4a' });
    g.cyl('rust', 0, 21, 0, 5, 5, 6, 14, { color: '#a89878', uvScale: 4 });
    g.cyl('rust', 0, 25, 0, 0.3, 5.2, 2.4, 14, { color: '#8a7a68' });
    locSign(C, { cx: wt[0], cz: wt[1], rot: 0, w: 0, d: 0 }, 'tower', 'DUSTBOWL', { w: 8, h: 1.6, y: 21, z: 5.05, bg: '#a89878', fg: '#3a2a1a', board: false, gain: 0 });
    C.solid(wt[0] - 3.5, wt[1] - 3.5, wt[0] + 3.5, wt[1] + 3.5, 18);
    L.occupied.add({ x0: wt[0] - 4, z0: wt[1] - 4, x1: wt[0] + 4, z1: wt[1] + 4 });
  }
}
